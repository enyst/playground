// @vitest-environment node
import { describe, expect, it } from "vitest";
import { gzipSync } from "node:zlib";
import {
  assessExportSafety,
  inspectSkinFilesForPush,
  sanitizeExportData,
} from "../scripts/skin-export-safety.mjs";

describe("skin configuration export safety", () => {
  it("preserves authentication description prose while rejecting literal authentication values", () => {
    const declarations = [
      {
        name: "MCP_AUTH",
        description: "Bearer token for the review MCP server.",
      },
      { name: "PROXY_AUTH", description: "Basic credentials for the proxy." },
    ];

    const result = sanitizeExportData({
      secrets: declarations,
      headers: { Authorization: "Bearer fixture-token" },
      auth_literal: "  Basic fixture-basic  ",
    });

    expect(result.value).toEqual({ secrets: declarations, headers: {} });
    expect(result.rejectedPaths).toEqual([
      "$.headers.Authorization",
      "$.auth_literal",
    ]);
  });

  it("preserves secret names, SDK references and model limits", () => {
    const input = {
      name: "github-token-helper",
      max_tokens: 4096,
      api_key_set: true,
      secret_refs: ["GITHUB_TOKEN"],
      api_key_env_var: "ANTHROPIC_API_KEY",
      secret_bindings: { api_key: "SKIN_LLM_REVIEW_API_KEY" },
      provider_connections: [{ secret_name: "SKIN_PROVIDER_GITHUB" }],
      secrets: [{ name: "GITHUB_TOKEN", description: "GitHub access" }],
      agent_context: {
        secrets: {
          CUSTOM: {
            kind: "LookupSecret",
            url: "/api/settings/secrets/CUSTOM",
            headers: { Authorization: "Bearer ${SESSION_API_KEY}" },
          },
        },
      },
      mcp: {
        env: { API_KEY: "${API_KEY}" },
        args: ["--api-key", "$API_KEY", "--token=${TOKEN}"],
      },
    };

    const result = sanitizeExportData(input);

    expect(result.value).toEqual(input);
    expect(result.rejectedPaths).toEqual([]);
  });

  it("removes concrete nested credentials and retains named secret placeholders", () => {
    const result = sanitizeExportData({
      env: { API_KEY: "fixture-api-key", PORT: "8000" },
      llm: {
        aws_access_key_id: "fixture-access-key",
        aws_secret_access_key: "fixture-secret-key",
        aws_session_token: "fixture-session-token",
        max_tokens: 8192,
      },
      headers: {
        Authorization: "Bearer fixture-bearer",
        Cookie: "session=fixture-cookie",
        "X-Request-ID": "request-123",
      },
      agent_context: {
        secrets: {
          CUSTOM: "fixture-custom-value",
          STATIC: {
            kind: "StaticSecret",
            value: "fixture-static-value",
            description: "Service login",
          },
        },
      },
      auth: {
        strategy: "oauth2",
        authentication: { client_name: "My server", client_secret: "fixture" },
        state: { tokens: { arbitrary: "fixture-oauth-value" } },
      },
      masked: "**********",
      encrypted: "gAAAAA" + "x".repeat(90),
      token: { unexpected: "fixture-nested-token" },
    });

    expect(result.value).toEqual({
      env: { PORT: "8000" },
      llm: { max_tokens: 8192 },
      headers: { "X-Request-ID": "request-123" },
      agent_context: {
        secrets: {
          CUSTOM: { kind: "StaticSecret" },
          STATIC: { kind: "StaticSecret", description: "Service login" },
        },
      },
      auth: {
        strategy: "oauth2",
        authentication: { client_name: "My server" },
        state: {},
      },
    });
    expect(result.rejectedPaths).toContain("$.agent_context.secrets.CUSTOM");
    expect(result.rejectedPaths).toContain("$.auth.state.tokens");
    expect(JSON.stringify(result)).not.toContain("fixture-custom-value");
  });

  it("removes URL credentials and signed query values while preserving references", () => {
    const result = sanitizeExportData({
      source:
        "https://fixture-user:fixture-pass@example.com/repo?ref=main&token=fixture-token",
      tarball_path:
        "s3://bucket/code?X-Amz-Signature=fixture-signature&version=2",
      callback:
        "https://example.com/callback#access_token=fixture-fragment&state=ready",
      description: "Use https://fixture-user:fixture-pass@example.com/api",
      reference: "https://example.com/api?api_key=${API_KEY}",
    });

    expect(result.value).toEqual({
      source: "https://example.com/repo?ref=main",
      tarball_path: "s3://bucket/code?version=2",
      callback: "https://example.com/callback#state=ready",
      reference: "https://example.com/api?api_key=${API_KEY}",
    });
    expect(result.rejectedPaths).toContain("$.source.userinfo");
    expect(result.rejectedPaths).toContain(
      "$.tarball_path.query.X-Amz-Signature",
    );
    expect(JSON.stringify(result)).not.toContain("fixture-pass");
  });

  it("removes credential arguments without corrupting ordinary arguments or placeholders", () => {
    const result = sanitizeExportData({
      args: [
        "--port",
        "8000",
        "--api-key",
        "fixture-key",
        "--token=fixture-token",
        "PASSWORD=fixture-password",
        "--password",
        "${PASSWORD}",
        "https://fixture-user:fixture-pass@example.com/api",
        "--max-tokens",
        "4096",
      ],
      command: "runner --token fixture-command-token",
    });

    expect(result.value).toEqual({
      args: [
        "--port",
        "8000",
        "--password",
        "${PASSWORD}",
        "https://example.com/api",
        "--max-tokens",
        "4096",
      ],
    });
    expect(result.rejectedPaths).toContain("$.args[3]");
    expect(result.rejectedPaths).toContain("$.command");
  });

  it("checks known credential text in metadata and does not call arbitrary code safe", () => {
    const result = sanitizeExportData({
      preset_metadata: {
        template: { config: { access_token: "fixture-token" } },
        note: "token github_pat_" + "a".repeat(45),
      },
      prompt: "Review repository changes",
    });

    expect(result.value).toEqual({
      preset_metadata: { template: { config: {} } },
      prompt: "Review repository changes",
    });
    expect(
      assessExportSafety({
        rejectedPaths: result.rejectedPaths,
        opaquePaths: ["automations/review/automation.tar.gz"],
      }),
    ).toMatchObject({ safeForAutomaticPush: false });
    expect(
      assessExportSafety({ opaquePaths: ["src/server.ts"] }),
    ).toMatchObject({
      safeForAutomaticPush: false,
    });
    expect(assessExportSafety({})).toMatchObject({
      safeForAutomaticPush: true,
    });
  });

  it("permits structured manifest changes and reports opaque changed files for review", () => {
    const safe = inspectSkinFilesForPush([
      {
        path: "skin.yaml",
        content: "name: Test skin\nllm:\n  max_tokens: 4096\n",
      },
      { path: "deleted.env", content: null },
    ]);
    const opaque = inspectSkinFilesForPush([
      { path: "src/server.ts", content: "export const port = 8000;" },
      {
        path: "automations/review/automation.tar.gz",
        content: gzipSync(Buffer.from("export const port = 8000;")),
      },
      {
        path: "automations/custom/automation.json",
        content: JSON.stringify({
          prompt: "Arbitrary instructions and private context",
        }),
      },
    ]);

    expect(safe.safeForAutomaticPush).toBe(true);
    expect(opaque).toMatchObject({
      safeForAutomaticPush: false,
      rejectedPaths: [],
      opaquePaths: [
        "src/server.ts",
        "automations/review/automation.tar.gz",
        "automations/custom/automation.json.prompt",
      ],
    });
  });

  it("permits boolean and numeric settings while requiring review of nonempty instruction content", () => {
    const settings = inspectSkinFilesForPush([
      {
        path: "skin.yaml",
        content: JSON.stringify({
          llm: { caching_prompt: true, max_tokens: 4096 },
          health: { status_code: 200 },
          options: { run_script: false },
          prompt: "",
          metadata: {},
        }),
      },
    ]);
    const instructions = inspectSkinFilesForPush([
      {
        path: "skin.yaml",
        content: JSON.stringify({
          prompt: "Review the repository",
          conversation_instructions: "Use the review workflow",
          code: { entrypoint: "server.mjs" },
        }),
      },
    ]);

    expect(settings).toMatchObject({
      safeForAutomaticPush: true,
      opaquePaths: [],
    });
    expect(instructions).toMatchObject({
      safeForAutomaticPush: false,
      opaquePaths: [
        "skin.yaml.prompt",
        "skin.yaml.conversation_instructions",
        "skin.yaml.code",
      ],
    });
  });

  it("rejects known credentials in configuration, source and credential files before push", () => {
    const report = inspectSkinFilesForPush([
      { path: "skin.yaml", content: "llm:\n  api_key: fixture-key\n" },
      { path: "src/server.py", content: 'api_key = "fixture-source-key"' },
      { path: ".env.local", content: "UNUSUAL=fixture-value" },
    ]);

    expect(report.rejectedPaths).toEqual([
      "skin.yaml.llm.api_key",
      "src/server.py",
      ".env.local",
    ]);
    expect(report.safeForAutomaticPush).toBe(false);
    expect(JSON.stringify(report)).not.toContain("fixture-source-key");
  });

  it.each([
    ["automation.py", 'api_key = os.environ["OPENAI_API_KEY"]', false],
    ["server.ts", "const api_key = process.env.OPENAI_API_KEY;", false],
    ["automation.py", "api_key = options.api_key", false],
    ["automation.py", 'api_key = "fixture-source-key"', true],
  ])(
    "requires source review without treating expressions as credential literals: %s %s",
    (path, content, rejected) => {
      const report = inspectSkinFilesForPush([{ path, content }]);

      expect(report.rejectedPaths).toEqual(rejected ? [path] : []);
      expect(report.opaquePaths).toEqual([path]);
    },
  );

  it("checks compressed source and rejects archives that cannot be inspected within the memory bound", () => {
    const report = inspectSkinFilesForPush([
      {
        path: "automations/leaked/automation.tar.gz",
        content: gzipSync(Buffer.from('api_key = "fixture-archived-key"')),
      },
      {
        path: "automations/broken/automation.tar.gz",
        content: Buffer.from([0x1f, 0x8b]),
      },
      {
        path: "automations/oversized/automation.tar.gz",
        content: gzipSync(Buffer.alloc(16 * 1024 * 1024 + 1)),
      },
    ]);

    expect(report.rejectedPaths).toEqual([
      "automations/leaked/automation.tar.gz",
      "automations/broken/automation.tar.gz",
      "automations/oversized/automation.tar.gz",
    ]);
    expect(report.safeForAutomaticPush).toBe(false);
    expect(JSON.stringify(report)).not.toContain("fixture-archived-key");
  });
});
