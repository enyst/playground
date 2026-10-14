import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { gzipSync } from "node:zlib";
import yaml from "js-yaml";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  renderSkinAppSkill,
  sanitizeIconName,
  sanitizeTheme,
  satisfiesCanvasVersion,
  stripSecretValues,
  themeCss,
  themeVars,
  SKIN_APP_SKILL_NAME,
  SkinService,
} from "../scripts/skin-service.mjs";

const fixtureDirs: string[] = [];

function installedSkin(config: Record<string, unknown> = {}) {
  const dir = mkdtempSync(join(tmpdir(), "skin-config-test-"));
  fixtureDirs.push(dir);
  const workspaceDir = join(dir, "repo");
  mkdirSync(workspaceDir);
  writeFileSync(
    join(workspaceDir, "skin.yaml"),
    yaml.dump({ name: "Test skin", ...config }),
  );
  const service = new SkinService({
    home: join(dir, "state"),
    workspaceDir,
    skinPort: 18002,
    agentServerUrl: "http://agent-server.test",
    sessionApiKey: "fixture-session-key",
  });
  service.saveSettings({ autoPush: false });
  return service;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const dir of fixtureDirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

function archive(code = 'print("fixture automation")\n') {
  const content = Buffer.from(code);
  const header = Buffer.alloc(512);
  header.write("main.py");
  header.write("0000644\0", 100);
  header.write("0000000\0", 108);
  header.write("0000000\0", 116);
  header.write(content.length.toString(8).padStart(11, "0") + "\0", 124);
  header.write("00000000000\0", 136);
  header.fill(" ", 148, 156);
  header.write("0", 156);
  header.write("ustar\0", 257);
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  header.write(checksum.toString(8).padStart(6, "0") + "\0 ", 148);
  return gzipSync(
    Buffer.concat([
      header,
      content,
      Buffer.alloc((512 - (content.length % 512)) % 512),
      Buffer.alloc(1024),
    ]),
  );
}

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Exact safe metadata returned for a never-configured SDK 1.54 seed. The
// reference deliberately remains dangling after a different model is saved.
function stockAgentProfile() {
  return {
    id: "stock-agent-id",
    revision: 0,
    schema_version: 3,
    name: "default",
    llm_profile_ref: "default",
    agent_kind: "openhands",
    mcp_server_refs: null,
    secret_refs: null,
    agent: "CodeActAgent",
    tools: null,
    persona: null,
    system_message_suffix: null,
    disabled_skills: [],
    condenser: {
      condenser_kind: "llm_summarizing",
      enabled: true,
      max_size: 240,
      max_tokens: null,
      keep_first: 2,
      minimum_progress: 0.1,
      hard_context_reset_max_retries: 5,
      hard_context_reset_context_scaling: 0.8,
    },
    verification: {
      critic_enabled: false,
      critic_mode: "finish_and_message",
      enable_iterative_refinement: false,
      critic_threshold: 0.6,
      max_refinement_iterations: 3,
      critic_server_url: null,
      critic_model_name: null,
    },
    enable_classify_and_switch_llm_tool: false,
    meta_profile_ref: null,
    tool_concurrency_limit: 1,
  };
}

describe("portable skin configuration kits", () => {
  it("roundtrips dependencies, target credentials, active IDs, local skills and inactive automation bundles", async () => {
    const service = installedSkin({
      mcp_servers: {
        tracker: { headers: { Authorization: "Bearer ${TRACKER_TOKEN}" } },
      },
    });
    service.automationUrl = "http://automation.test";
    const skillDir = join(service.repoDir, "skills", "review");
    mkdirSync(skillDir, { recursive: true });
    const profile = {
      id: "source-agent-id",
      name: "reviewer",
      agent_kind: "openhands",
      llm_profile_ref: "review-model",
      tools: [],
      secret_refs: [],
      mcp_server_refs: ["tracker"],
    };
    const source: Record<string, unknown> = {
      "/api/settings": {
        agent_settings: {
          agent_kind: "openhands",
          llm: { model: "openai/source" },
          mcp_config: {
            tracker: {
              transport: "http",
              url: "https://tracker.example/mcp",
              headers: { Authorization: "**********" },
            },
          },
          verification: { max_refinement_iterations: 3 },
          agent_context: {
            secrets: {
              CONTEXT_VAR: {
                kind: "LookupSecret",
                url: "http://source-instance.example/api/settings/secrets/TRACKER_TOKEN",
                headers: { "X-Session-API-Key": "source-session-credential" },
              },
              STATIC_CONTEXT: {
                kind: "StaticSecret",
                value: "source-static-credential",
              },
            },
          },
        },
        conversation_settings: { max_iterations: 77, confirmation_mode: true },
        misc_settings: {
          app_preferences: { language: "fr", user_consents_to_analytics: true },
        },
        active_profile: "review-model",
        active_agent_profile_id: "source-agent-id",
        active_meta_profile: null,
      },
      "/api/llm/provider-connections": [
        {
          id: "source-provider-id",
          display_name: "Review provider",
          provider: "openai",
          base_url: null,
          api_key_set: true,
        },
      ],
      "/api/profiles": { profiles: [{ name: "review-model" }] },
      "/api/profiles/review-model": {
        config: {
          model: "openai/review",
          provider_connection_id: "source-provider-id",
          extra_headers: { "X.Customer": "source-header-credential" },
        },
        api_key_set: true,
      },
      "/api/agent-profiles": {
        profiles: [
          { name: "default", id: "stock-agent-id" },
          { name: "reviewer", id: "source-agent-id" },
        ],
      },
      "/api/agent-profiles/default": { profile: stockAgentProfile() },
      "/api/agent-profiles/reviewer": { profile },
      "/api/meta-profiles": { meta_profiles: [] },
      "/api/settings/secrets": {
        secrets: [{ name: "TRACKER_TOKEN" }, { name: "STATIC_CONTEXT" }],
      },
      "/api/skills/installed": {
        skills: [{ name: "review", source: skillDir, enabled: true }],
      },
      "/api/automation/v1": {
        automations: [
          {
            id: "source-automation",
            name: "Daily review",
            model: "review-model",
            agent_profile_id: "source-agent-id",
            trigger: { type: "cron", schedule: "0 9 * * *", timezone: "UTC" },
            entrypoint: "python main.py",
            state: "ACTIVE",
          },
        ],
        total: 1,
      },
    };
    let restoring = false;
    const calls: Array<{ path: string; options: RequestInit }> = [];
    const bytes = archive();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, options: RequestInit = {}) => {
        const path = new URL(url).pathname;
        calls.push({ path, options });
        if (!restoring) {
          if (path.endsWith("/tarball")) return new Response(bytes);
          return jsonResponse(
            source[path] ?? {},
            source[path] === undefined ? 404 : 200,
          );
        }
        if (options.method === "POST" || options.method === "PATCH") {
          if (path.includes("provider-connections"))
            return jsonResponse({ id: "target-provider-id" });
          if (path.endsWith("/uploads"))
            return jsonResponse({
              id: "upload-id",
              status: "COMPLETED",
              tarball_path: "oh-internal://uploads/upload-id",
            });
          if (path === "/api/automation/v1")
            return jsonResponse({ id: "target-automation-id" });
          return jsonResponse({ name: "review" });
        }
        const target: Record<string, unknown> = {
          "/api/settings/secrets": {
            secrets: [{ name: "TRACKER_TOKEN" }, { name: "STATIC_CONTEXT" }],
          },
          "/api/settings/secrets/TRACKER_TOKEN": "target-token",
          "/api/settings": { agent_settings: { mcp_config: {} } },
          "/api/llm/provider-connections": [
            {
              id: "target-provider-id",
              display_name: "Review provider",
              api_key_set: true,
            },
          ],
          "/api/profiles": { profiles: [{ name: "review-model" }] },
          "/api/profiles/review-model": {
            config: {
              model: "openai/old",
              api_key: "retained-target-key",
              extra_headers: { "X.Customer": "retained-target-header" },
            },
          },
          "/api/meta-profiles": { meta_profiles: [] },
          "/api/agent-profiles/reviewer": {
            profile: { ...profile, id: "target-agent-id" },
          },
          "/api/automation/v1": { automations: [], total: 0 },
        };
        if (path === "/api/settings/secrets/TRACKER_TOKEN")
          return new Response("target-token", {
            headers: { "Content-Type": "text/plain" },
          });
        if (path === "/api/settings/secrets/STATIC_CONTEXT")
          return new Response("target-static", {
            headers: { "Content-Type": "text/plain" },
          });
        return jsonResponse(
          target[path] ?? {},
          target[path] === undefined ? 404 : 200,
        );
      }),
    );

    const exported = await service.exportConfiguration();
    expect(exported.report.skipped.join(" ")).toContain(
      "Unused stock agent profile default",
    );
    expect(exported.report.errors).toEqual([]);
    const text = readFileSync(join(service.repoDir, "skin.yaml"), "utf8");
    expect(text).not.toContain("source-provider-id");
    expect(text).not.toContain("source-agent-id");
    expect(text).not.toContain("source-header-credential");
    expect(text).not.toContain("source-instance.example");
    expect(text).not.toContain("source-session-credential");
    expect(text).not.toContain("source-static-credential");
    const saved = yaml.load(text) as {
      skills: Array<{ source: string }>;
      active: { agent_profile: string };
      app_preferences: Record<string, unknown>;
    };
    expect(saved.skills[0].source).toBe("./skills/review");
    expect(saved.active.agent_profile).toBe("reviewer");
    expect(saved.app_preferences).not.toHaveProperty(
      "user_consents_to_analytics",
    );
    expect(
      exported.report.opaquePaths.some((path: string) =>
        path.endsWith("automation.tar.gz"),
      ),
    ).toBe(true);

    restoring = true;
    calls.length = 0;
    const applied = await service.applyConfiguration();
    expect(applied.errors).toEqual([]);
    expect(applied.missingSecrets).toEqual([]);
    expect(applied.complete).toBe(true);
    const writes = calls
      .filter((call) => ["POST", "PATCH"].includes(call.options.method || ""))
      .map((call) => ({
        path: call.path,
        body: call.path.endsWith("/uploads")
          ? null
          : JSON.parse(String(call.options.body)),
      }));
    expect(
      writes.find((call) => call.path.includes("provider-connections"))?.body,
    ).not.toHaveProperty("api_key");
    expect(
      writes.find((call) => call.path === "/api/profiles/review-model")?.body,
    ).toMatchObject({
      llm: {
        provider_connection_id: "target-provider-id",
        api_key: "retained-target-key",
        extra_headers: { "X.Customer": "retained-target-header" },
      },
      include_secrets: true,
    });
    expect(
      writes.find((call) => call.body?.agent_settings_diff?.mcp_config)?.body
        .agent_settings_diff.mcp_config.tracker.headers.Authorization,
    ).toBe("Bearer target-token");
    expect(
      writes.find((call) => call.body?.agent_settings_diff?.agent_context)?.body
        .agent_settings_diff.agent_context.secrets,
    ).toMatchObject({
      CONTEXT_VAR: { kind: "StaticSecret", value: "target-token" },
      STATIC_CONTEXT: { kind: "StaticSecret", value: "target-static" },
    });
    expect(writes).toContainEqual({
      path: "/api/settings",
      body: {
        active_profile: "review-model",
        active_agent_profile_id: "target-agent-id",
      },
    });
    expect(
      writes.find((call) => call.path === "/api/automation/v1")?.body,
    ).toMatchObject({
      agent_profile_id: "target-agent-id",
      tarball_path: "oh-internal://uploads/upload-id",
      state: "INACTIVE",
      enabled: false,
    });
    expect(
      writes.find((call) => call.path === "/api/automation/v1")?.body,
    ).not.toHaveProperty("model");
    expect(
      writes.find((call) => call.path === "/api/skills/install")?.body.source,
    ).toBe(skillDir);
    expect(writes).toContainEqual({
      path: "/api/skills/installed/review",
      body: { enabled: true },
    });
    expect(
      readFileSync(join(service.repoDir, "skin.yaml"), "utf8"),
    ).not.toContain("retained-target-key");
  });

  it.each([
    "active",
    "customized",
    "automation",
    "active-model",
    "title-model",
  ])(
    "preserves the previous kit when an unresolved default profile is %s",
    async (use) => {
      const service = installedSkin({ description: "Keep the working kit" });
      service.automationUrl = "http://automation.test";
      const before = readFileSync(join(service.repoDir, "skin.yaml"), "utf8");
      const profile = {
        ...stockAgentProfile(),
        ...(use === "customized" ? { persona: "User-created behavior" } : {}),
      };
      const responses: Record<string, unknown> = {
        "/api/agent-profiles": { profiles: [{ name: "default" }] },
        "/api/agent-profiles/default": { profile },
        "/api/settings": {
          agent_settings: { llm: { model: "openai/configured-elsewhere" } },
          active_profile: use === "active-model" ? "default" : null,
          active_agent_profile_id: use === "active" ? profile.id : null,
          misc_settings: {
            app_preferences: {
              title_llm_profile: use === "title-model" ? "default" : null,
            },
          },
        },
        "/api/llm/provider-connections": [],
        "/api/profiles": { profiles: [] },
        "/api/meta-profiles": { meta_profiles: [] },
        "/api/settings/secrets": { secrets: [] },
        "/api/skills/installed": { skills: [] },
        "/api/automation/v1": {
          automations:
            use === "automation"
              ? [{ name: "Existing schedule", agent_profile_id: profile.id }]
              : [],
          total: use === "automation" ? 1 : 0,
        },
      };
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) => {
          const value = responses[new URL(url).pathname];
          return jsonResponse(value ?? {}, value === undefined ? 404 : 200);
        }),
      );

      const { report } = await service.exportConfiguration();

      expect(report.complete).toBe(false);
      expect(report.errors.join(" ")).toContain(
        "Agent profile default references unavailable LLM profile default",
      );
      expect(readFileSync(join(service.repoDir, "skin.yaml"), "utf8")).toBe(
        before,
      );
      expect((await service.status()).exportReport).toEqual(report);
    },
  );

  it("includes referenced LLM configuration resolved by detail when inventory omits its name", async () => {
    const service = installedSkin();
    const profile = stockAgentProfile();
    const responses: Record<string, unknown> = {
      "/api/agent-profiles": { profiles: [{ name: "default" }] },
      "/api/agent-profiles/default": { profile },
      "/api/settings": {
        agent_settings: { llm: { model: "openai/different-global-model" } },
        active_profile: "default",
        active_agent_profile_id: profile.id,
      },
      "/api/llm/provider-connections": [],
      "/api/profiles": { profiles: [] },
      "/api/profiles/default": {
        config: {
          model: "openai/referenced-model",
          base_url: "http://localhost:9/v1",
        },
        api_key_set: false,
      },
      "/api/meta-profiles": { meta_profiles: [] },
      "/api/settings/secrets": { secrets: [] },
      "/api/skills/installed": { skills: [] },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const value = responses[new URL(url).pathname];
        return jsonResponse(value ?? {}, value === undefined ? 404 : 200);
      }),
    );

    const { report } = await service.exportConfiguration();
    const saved = yaml.load(
      readFileSync(join(service.repoDir, "skin.yaml"), "utf8"),
    ) as {
      llm_profiles: Array<{ name: string; config: { model: string } }>;
      agent_profiles: Array<{ name: string; llm_profile_ref: string }>;
    };

    expect(report.complete).toBe(true);
    expect(saved.llm_profiles).toContainEqual({
      name: "default",
      config: {
        model: "openai/referenced-model",
        base_url: "http://localhost:9/v1",
      },
    });
    expect(saved.agent_profiles[0].llm_profile_ref).toBe("default");
  });

  it("reports missing provider requirements without replacing a working profile or activating a dangling choice", async () => {
    const service = installedSkin({
      configuration_version: 2,
      secrets: [{ name: "NEW_PROVIDER_KEY" }],
      provider_connections: [
        {
          display_name: "New provider",
          provider: "openai",
          secret_name: "NEW_PROVIDER_KEY",
        },
      ],
      llm_profiles: [
        {
          name: "new-model",
          config: { model: "openai/new" },
          provider_connection: "New provider",
        },
      ],
      active: { llm_profile: "new-model" },
    });
    const calls: Array<{ path: string; method?: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, options: RequestInit = {}) => {
        const path = new URL(url).pathname;
        calls.push({ path, method: options.method });
        return jsonResponse(
          path.includes("provider-connections")
            ? []
            : path === "/api/meta-profiles"
              ? { meta_profiles: [] }
              : { secrets: [], profiles: [] },
        );
      }),
    );

    const result = await service.applyConfiguration();

    expect(result.complete).toBe(false);
    expect(result.missingSecrets).toContain("NEW_PROVIDER_KEY");
    expect(
      calls.some((call) => ["POST", "PATCH"].includes(call.method || "")),
    ).toBe(false);
    expect((await service.status()).applyReport).toEqual(result);
  });

  it("rejects known credential material inside compressed automation code before uploading it", async () => {
    const service = installedSkin();
    service.automationUrl = "http://automation.test";
    const dir = join(service.repoDir, "automations", "unsafe");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "automation.json"),
      JSON.stringify({
        name: "Unsafe code",
        trigger: { type: "cron", schedule: "0 9 * * *" },
        entrypoint: "python main.py",
      }),
    );
    writeFileSync(
      join(dir, "automation.tar.gz"),
      archive('token = "ghp_abcdefghijklmnopqrstuvwxyz1234"\n'),
    );
    const fetchMock = vi.fn(async (url: string) =>
      jsonResponse(
        new URL(url).pathname.includes("automation")
          ? { automations: [], total: 0 }
          : { secrets: [] },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const report = await service.applyConfiguration();

    expect(report.complete).toBe(false);
    expect(report.rejectedPaths).toContain(
      "automations/unsafe/automation.tar.gz",
    );
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes("/uploads")),
    ).toBe(false);
  });
});

describe("local skin Git installation and reviewed push", () => {
  it("keeps user files and the legacy checkout when migration's destination is occupied", async () => {
    const existing = installedSkin();
    rmSync(join(existing.repoDir, "skin.yaml"));
    writeFileSync(join(existing.repoDir, "user.txt"), "preserved data");
    const legacy = join(existing.home, "repo");
    mkdirSync(legacy);
    writeFileSync(join(legacy, "skin.yaml"), "name: Legacy skin\n");
    const service = new SkinService({
      home: existing.home,
      workspaceDir: existing.repoDir,
      skinPort: 18002,
    });

    expect(readFileSync(join(service.repoDir, "user.txt"), "utf8")).toBe(
      "preserved data",
    );
    expect(readFileSync(join(legacy, "skin.yaml"), "utf8")).toContain(
      "Legacy skin",
    );
    expect((await service.status()).error).toContain("migration was skipped");
  });
  function git(cwd: string, ...args: string[]) {
    return execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] })
      .toString()
      .trim();
  }
  function repository() {
    const service = installedSkin();
    writeFileSync(
      join(service.repoDir, "package.json"),
      JSON.stringify({ scripts: { start: "node app.mjs" } }),
    );
    writeFileSync(join(service.repoDir, "SKILL.md"), "# Fixture skin\n");
    git(service.repoDir, "init", "-b", "main");
    git(service.repoDir, "config", "user.name", "Fixture");
    git(service.repoDir, "config", "user.email", "fixture@example.test");
    git(service.repoDir, "add", ".");
    git(service.repoDir, "commit", "-m", "Initial fixture");
    const remote = join(service.home, "remote.git");
    git(service.home, "init", "--bare", remote);
    git(service.repoDir, "remote", "add", "origin", remote);
    git(service.repoDir, "push", "-u", "origin", "main");
    return { service, remote };
  }

  it("clones a local Git skin only after validating it, defaults auto-push off, and preserves nonempty user directories", async () => {
    const { service: source } = repository();
    const destination = new SkinService({
      home: join(source.home, "second-state"),
      workspaceDir: join(source.home, "second-checkout"),
      skinPort: 18003,
      agentServerUrl: "http://agent-server.test",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ secrets: [] })),
    );
    vi.spyOn(destination, "start").mockResolvedValue();

    await destination.install({ repoUrl: source.repoDir });

    expect(destination.isInstalled()).toBe(true);
    expect(destination.loadSettings().autoPush).toBe(false);
    const occupied = new SkinService({
      home: join(source.home, "occupied-state"),
      workspaceDir: join(source.home, "occupied"),
      skinPort: 18004,
    });
    mkdirSync(occupied.repoDir);
    writeFileSync(join(occupied.repoDir, "user.txt"), "keep me");
    await expect(occupied.install({ repoUrl: source.repoDir })).rejects.toThrow(
      "already contains files",
    );
    expect(readFileSync(join(occupied.repoDir, "user.txt"), "utf8")).toBe(
      "keep me",
    );
    await expect(
      occupied.install({ repoUrl: source.repoDir, ref: "--upload-pack=other" }),
    ).rejects.toThrow("valid Git branch");
  });

  it("requires source review before committing opaque changes and rejects credentials hidden in outgoing history", async () => {
    const { service } = repository();
    writeFileSync(
      join(service.repoDir, "app.mjs"),
      'console.log("reviewed fixture");\n',
    );
    const before = git(service.repoDir, "rev-parse", "HEAD");

    const review = await service.push();

    expect(review).toMatchObject({ pushed: false, reviewRequired: true });
    expect(git(service.repoDir, "rev-parse", "HEAD")).toBe(before);
    expect((await service.push({ reviewedSource: true })).pushed).toBe(true);
    writeFileSync(
      join(service.repoDir, "credentials.json"),
      JSON.stringify({ api_key: "historical-fixture-key" }),
    );
    git(service.repoDir, "add", ".");
    git(service.repoDir, "commit", "-m", "Add unsafe history");
    git(service.repoDir, "rm", "credentials.json");
    git(service.repoDir, "commit", "-m", "Remove from final tree");
    const result = await service.push({ reviewedSource: true });
    expect(result.pushed).toBe(false);
    expect(
      (result.reviewPaths || []).some((path: string) =>
        path.startsWith("credentials.json"),
      ),
    ).toBe(true);
  });

  it("rejects recognized credentials in proposed messages and outgoing commit metadata before publishing", async () => {
    const { service, remote } = repository();
    const before = git(remote, "rev-parse", "main");
    const token = "github_pat_" + "x".repeat(45);
    writeFileSync(join(service.repoDir, "skin.yaml"), "name: Updated skin\n");

    const proposed = await service.push({
      message: `Copied log ${token}`,
      automatic: true,
    });

    expect(proposed.pushed).toBe(false);
    expect(git(service.repoDir, "rev-parse", "HEAD")).toBe(before);
    git(service.repoDir, "add", ".");
    git(service.repoDir, "commit", "-m", `Copied log ${token}`);
    const outgoing = await service.push({ automatic: true });
    expect(outgoing.pushed).toBe(false);
    expect((outgoing.reviewPaths || []).join(" ")).toContain("metadata");
    expect(git(remote, "rev-parse", "main")).toBe(before);
  });
});

describe("skin configuration transfer", () => {
  it("exports full agent profiles and reinstalls skills at their installed revision and subpath", async () => {
    const service = installedSkin();
    const profile = {
      name: "reviewer",
      agent_kind: "openhands",
      llm_profile_ref: "review-model",
      tools: ["TerminalTool", "FileEditorTool"],
      disabled_skills: ["unrelated-skill"],
      condenser: { kind: "LLMSummarizingCondenser", max_size: 80 },
    };
    const responses: Record<string, unknown> = {
      "/api/settings": { agent_settings: {}, conversation_settings: {} },
      "/api/llm/provider-connections": [],
      "/api/profiles": { profiles: [{ name: "review-model" }] },
      "/api/profiles/review-model": {
        config: { model: "openai/review" },
        api_key_set: false,
      },
      "/api/meta-profiles": { meta_profiles: [] },
      "/api/agent-profiles": {
        profiles: [
          {
            name: profile.name,
            agent_kind: profile.agent_kind,
            llm_profile_ref: profile.llm_profile_ref,
          },
        ],
      },
      "/api/agent-profiles/reviewer": {
        name: profile.name,
        profile: { ...profile, id: "target-agent-id" },
      },
      "/api/settings/secrets": { secrets: [] },
      "/api/skills/installed": {
        skills: [
          {
            name: "review",
            source: "github:example/skill-pack",
            resolved_ref: "abc123",
            repo_path: "skills/review",
          },
        ],
      },
    };
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      const path = new URL(url).pathname;
      const body =
        options?.method && options.method !== "GET" ? {} : responses[path];
      return new Response(JSON.stringify(body ?? {}), {
        status: body === undefined ? 404 : 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const exported = await service.exportConfiguration();
    const saved = yaml.load(
      readFileSync(join(service.repoDir, "skin.yaml"), "utf-8"),
    ) as { agent_profiles: unknown[]; skills: unknown[] };
    expect(exported.report.errors).toEqual([]);
    expect(exported.report.complete).toBe(true);
    expect(saved.agent_profiles).toEqual([profile]);
    expect(saved.skills).toEqual([
      {
        name: "review",
        source: "github:example/skill-pack",
        ref: "abc123",
        repo_path: "skills/review",
      },
    ]);

    fetchMock.mockClear();
    const applied = await service.applyConfiguration();
    const requests = fetchMock.mock.calls.map(([url, options]) => ({
      path: new URL(url).pathname,
      method: options?.method,
      body: options?.body ? JSON.parse(String(options.body)) : null,
    }));
    expect(applied.skipped).toEqual([]);
    expect(requests).toContainEqual({
      path: "/api/skills/install",
      method: "POST",
      body: {
        source: "github:example/skill-pack",
        ref: "abc123",
        repo_path: "skills/review",
        force: true,
      },
    });
    expect(requests).toContainEqual({
      path: "/api/agent-profiles/reviewer",
      method: "POST",
      body: profile,
    });
  });

  it("keeps previously exported profiles when reading one profile fails", async () => {
    const previousProfiles = [{ name: "reviewer", tools: ["TerminalTool"] }];
    const service = installedSkin({ agent_profiles: previousProfiles });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const path = new URL(url).pathname;
        const body =
          path === "/api/llm/provider-connections"
            ? []
            : path === "/api/agent-profiles"
              ? { profiles: [{ name: "reviewer" }] }
              : path === "/api/meta-profiles"
                ? { meta_profiles: [] }
                : path === "/api/profiles"
                  ? { profiles: [] }
                  : ["/api/settings/secrets", "/api/skills/installed"].includes(
                        path,
                      )
                    ? { secrets: [], skills: [] }
                    : {};
        return new Response(JSON.stringify(body), {
          status: path === "/api/agent-profiles/reviewer" ? 503 : 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );

    const result = await service.exportConfiguration();
    const saved = yaml.load(
      readFileSync(join(service.repoDir, "skin.yaml"), "utf-8"),
    ) as { agent_profiles: unknown[] };
    expect(saved.agent_profiles).toEqual(previousProfiles);
    expect(result.report.errors).toContain(
      "/api/agent-profiles/reviewer -> HTTP 503",
    );
    expect(result.report.complete).toBe(false);
  });

  it("applies conversation settings when a skin has no MCP or LLM settings", async () => {
    const service = installedSkin({ settings: { max_iterations: 75 } });
    const fetchMock = vi.fn(
      async () =>
        new Response("{}", { headers: { "Content-Type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await service.applyConfiguration();

    expect(result.skipped).toEqual([]);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://agent-server.test/api/settings",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          conversation_settings_diff: { max_iterations: 75 },
        }),
        headers: expect.objectContaining({
          "X-Session-API-Key": "fixture-session-key",
        }),
      }),
    );
  });
});

describe("renderSkinAppSkill", () => {
  it("wraps a bare markdown body in always-active frontmatter", () => {
    const out = renderSkinAppSkill("# My Skin\n\nDoes things.", "My Skin");
    expect(out).toMatch(/^---\nname: skin-app\n/);
    expect(out).toContain('description: What the "My Skin" skin');
    expect(out).toContain("# My Skin\n\nDoes things.");
    expect(out).not.toContain("triggers:");
  });

  it("replaces existing frontmatter but keeps its description", () => {
    const src =
      "---\nname: whatever\ndescription: Monitors Datadog.\ntriggers:\n  - datadog\n---\n\n# Body\n";
    const out = renderSkinAppSkill(src, "Datadog Monitor");
    expect(out).toMatch(/^---\nname: skin-app\n/);
    expect(out).toContain("description: Monitors Datadog.");
    expect(out).not.toContain("triggers:");
    expect(out).not.toContain("name: whatever");
    expect(out).toContain("# Body");
  });

  it("tolerates malformed frontmatter", () => {
    const out = renderSkinAppSkill("---\n: : :\n---\n# Body", null);
    expect(out).toContain(`name: ${SKIN_APP_SKILL_NAME}`);
    expect(out).toContain("# Body");
  });
});

describe("sanitizeIconName", () => {
  it("accepts kebab-case lucide icon names, normalized", () => {
    expect(sanitizeIconName("activity")).toBe("activity");
    expect(sanitizeIconName("bar-chart-3")).toBe("bar-chart-3");
    expect(sanitizeIconName("  Layout-Dashboard ")).toBe("layout-dashboard");
  });

  it("rejects anything that is not a plain icon name", () => {
    expect(sanitizeIconName(undefined)).toBeNull();
    expect(sanitizeIconName(null)).toBeNull();
    expect(sanitizeIconName("")).toBeNull();
    expect(sanitizeIconName("Bar Chart")).toBeNull();
    expect(sanitizeIconName("-leading")).toBeNull();
    expect(sanitizeIconName("trailing-")).toBeNull();
    expect(sanitizeIconName("a".repeat(65))).toBeNull();
    expect(sanitizeIconName("<script>")).toBeNull();
    expect(sanitizeIconName({ name: "activity" })).toBeNull();
  });
});

describe("sanitizeTheme", () => {
  it("returns null for missing/empty/non-object themes", () => {
    expect(sanitizeTheme(undefined)).toBeNull();
    expect(sanitizeTheme(null)).toBeNull();
    expect(sanitizeTheme({})).toBeNull();
    expect(sanitizeTheme("green")).toBeNull();
    expect(sanitizeTheme(["#fff"])).toBeNull();
  });

  it("keeps only known keys with valid hex colors, lowercased", () => {
    expect(
      sanitizeTheme({
        accent: "#39D98A",
        background: " #0b1614 ",
        evil: "#123456",
        surface: "url(javascript:alert(1))",
        text: "red",
      }),
    ).toEqual({ accent: "#39d98a", background: "#0b1614" });
  });

  it("accepts 3-digit hex", () => {
    expect(sanitizeTheme({ accent: "#0f0" })).toEqual({ accent: "#0f0" });
  });

  it("rejects css-injection attempts", () => {
    expect(sanitizeTheme({ accent: "#fff;} body{display:none" })).toBeNull();
  });
});

describe("themeVars", () => {
  it("returns null when there is no usable theme", () => {
    expect(themeVars(undefined)).toBeNull();
    expect(themeVars({ accent: "not-a-color" })).toBeNull();
  });

  it("anchors the grey scale on declared colors", () => {
    const vars = themeVars({
      background: "#0b1614",
      surface: "#11201c",
      text: "#e6efe9",
    })!;
    expect(vars["--cool-grey-950"]).toBe("#0b1614");
    expect(vars["--cool-grey-925"]).toBe("#11201c");
    expect(vars["--cool-grey-100"]).toBe("#e6efe9");
    // Derived steps are concrete hex values (mixed in sRGB) so they can be
    // re-encoded as HSL channels for HeroUI.
    expect(vars["--cool-grey-800"]).toMatch(/^#[0-9a-f]{6}$/);
    // HeroUI reads its own HSL-channel variables; the scale is mirrored there.
    expect(vars["--heroui-background"]).toMatch(/^[\d.]+ [\d.]+% [\d.]+%$/);
    expect(vars["--heroui-default-100"]).toBe(
      vars["--heroui-background"], // both anchored at grey-950
    );
    // No accent declared → accent variables untouched.
    expect(vars["--oh-accent"]).toBeUndefined();
  });

  it("maps accent to primary/logo/accent and defaults warning to it", () => {
    const vars = themeVars({ accent: "#39d98a", background: "#0b1614" })!;
    expect(vars["--oh-accent"]).toBe("#39d98a");
    expect(vars["--oh-color-primary"]).toBe("#39d98a");
    expect(vars["--oh-color-logo"]).toBe("#39d98a");
    expect(vars["--oh-warning"]).toBe("#39d98a");
    expect(vars["--oh-accent-foreground"]).toBe("#0b1614");
  });

  it("honors explicit status colors", () => {
    const vars = themeVars({
      accent: "#39d98a",
      success: "#4ade80",
      warning: "#fbbf24",
      danger: "#f87171",
    })!;
    expect(vars["--oh-success"]).toBe("#4ade80");
    expect(vars["--oh-warning"]).toBe("#fbbf24");
    expect(vars["--oh-danger"]).toBe("#f87171");
  });

  it("works from a minimal accent-only theme", () => {
    const vars = themeVars({ accent: "#39d98a" })!;
    expect(vars["--oh-accent"]).toBe("#39d98a");
    expect(vars["--cool-grey-950"]).toBeTruthy();
  });
});

describe("themeCss", () => {
  it("renders an empty :root when no theme", () => {
    expect(themeCss(undefined)).toContain(":root {}");
  });

  it("renders one declaration per derived variable", () => {
    const css = themeCss({ accent: "#39d98a", background: "#0b1614" });
    expect(css).toMatch(/^:root \{\n/);
    expect(css).toContain("--oh-accent: #39d98a;");
    expect(css).toContain("--cool-grey-950: #0b1614;");
  });
});

describe("satisfiesCanvasVersion", () => {
  it("enforces caret ranges instead of treating them as unknown", () => {
    expect(satisfiesCanvasVersion("2.0.0", "^1.7.0")).toBe(false);
    expect(satisfiesCanvasVersion("1.8.0", "^1.7.0")).toBe(true);
  });

  it("rejects malformed release ranges", () => {
    expect(satisfiesCanvasVersion("1.8.0", "this is not a version range")).toBe(
      false,
    );
  });
  it("accepts any version when the range is empty or *", () => {
    expect(satisfiesCanvasVersion("1.8.0", "")).toBe(true);
    expect(satisfiesCanvasVersion("1.8.0", undefined)).toBe(true);
    expect(satisfiesCanvasVersion("1.8.0", "*")).toBe(true);
  });

  it("enforces >= lower bounds", () => {
    expect(satisfiesCanvasVersion("1.8.0", ">=1.7.0")).toBe(true);
    expect(satisfiesCanvasVersion("1.6.9", ">=1.7.0")).toBe(false);
  });

  it("enforces combined ranges", () => {
    expect(satisfiesCanvasVersion("1.8.0", ">=1.7.0 <2.0.0")).toBe(true);
    expect(satisfiesCanvasVersion("2.0.0", ">=1.7.0 <2.0.0")).toBe(false);
  });

  it("never blocks dev builds", () => {
    expect(satisfiesCanvasVersion("dev", ">=1.7.0")).toBe(true);
    expect(satisfiesCanvasVersion("unknown", ">=99.0.0")).toBe(true);
  });

  it("accepts v-prefixed versions", () => {
    expect(satisfiesCanvasVersion("v1.8.0", ">=1.7.0")).toBe(true);
  });
});

describe("stripSecretValues", () => {
  it("removes secret-ish string values but keeps names/structure", () => {
    const input = {
      name: "slack",
      api_key: "sk-live-abc123",
      token: "xoxb-secret",
      url: "https://example.com",
      nested: { password: "hunter2", model: "gpt-5" },
    };
    expect(stripSecretValues(input)).toEqual({
      name: "slack",
      url: "https://example.com",
      nested: { model: "gpt-5" },
    });
  });

  it("removes masked values returned by the agent server", () => {
    expect(stripSecretValues({ value: "**********", kept: "yes" })).toEqual({
      kept: "yes",
    });
  });

  it("removes authentication headers from nested configuration records", () => {
    expect(
      stripSecretValues({
        headers: {
          Authorization: "Bearer fixture-token",
          "Proxy-Authorization": "Basic fixture-credential",
          Cookie: "session=fixture-cookie",
          "Set-Cookie": "session=fixture-cookie; HttpOnly",
          "X-Request-ID": "request-123",
        },
      }),
    ).toEqual({ headers: { "X-Request-ID": "request-123" } });
  });

  it("handles arrays and scalars", () => {
    expect(stripSecretValues([{ token: "x", a: 1 }, "plain"])).toEqual([
      { a: 1 },
      "plain",
    ]);
    expect(stripSecretValues("s")).toBe("s");
    expect(stripSecretValues(null)).toBe(null);
  });
});
