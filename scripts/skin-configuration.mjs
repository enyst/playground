/** Configuration kits consume the released Agent Server and automation APIs.
 * Source credentials never enter the checkout. Target credentials are read
 * only in memory when an overwrite must preserve them. Restored automations
 * remain inactive until the user enables them in Automations.
 */
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { isAbsolute, join, relative, resolve } from "node:path";
import yaml from "js-yaml";
import {
  assessExportSafety,
  inspectSkinFilesForPush,
  sanitizeExportData,
} from "./skin-export-safety.mjs";

const LLM_SECRETS = [
  "api_key",
  "aws_access_key_id",
  "aws_secret_access_key",
  "aws_session_token",
];
const APP_PREFERENCES = [
  "language",
  "enable_sound_notifications",
  "git_user_name",
  "git_user_email",
  "title_llm_profile",
  "disabled_skills",
  "enabled_skills",
  "run_router_at_conversation_start",
  "workspace_file_discovery",
];
const CONVERSATION_PREFERENCES = [
  "max_iterations",
  "confirmation_mode",
  "security_analyzer",
];
const AUTOMATION_FIELDS = [
  "name",
  "model",
  "trigger",
  "observability_associations",
  "setup_script_path",
  "entrypoint",
  "timeout",
  "keep_alive",
];
const PRESET_FIELDS = [
  "prompt",
  "repos",
  "plugins",
  "variants",
  "experiment_id",
];
const UPLOAD_LIMIT = 1024 * 1024;
const enc = encodeURIComponent;
const clone = (value) => JSON.parse(JSON.stringify(value));
const pick = (value, keys) =>
  Object.fromEntries(
    keys
      .filter((key) => value?.[key] !== undefined)
      .map((key) => [key, value[key]]),
  );
const reportFor = (verb) => ({
  [verb]: [],
  skipped: [],
  errors: [],
  warnings: [],
  missingSecrets: [],
  opaquePaths: [],
  rejectedPaths: [],
  complete: false,
});
const add = (items, item) => {
  if (!items.includes(item)) items.push(item);
};
const secretName = (prefix, name, field = "") => {
  const identity = `${prefix}:${name}:${field}`;
  const suffix = createHash("sha256")
    .update(identity)
    .digest("hex")
    .slice(0, 8)
    .toUpperCase();
  return `${`${prefix}_${name}_${field}`
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/_$/, "")
    .slice(0, 55)}_${suffix}`;
};

function finish(service, report, kind) {
  report.complete = !report.errors.length && !report.missingSecrets.length;
  const state = service.loadSettings() || {};
  service.saveSettings({ ...state, [kind]: report });
  return report;
}

function sanitize(value, path, report) {
  const result = sanitizeExportData(value, { path });
  report.rejectedPaths.push(...result.rejectedPaths);
  report.warnings.push(...result.warnings);
  return result.value;
}

function declaration(skin, name, description) {
  if (!skin.secrets.some((secret) => secret.name === name))
    skin.secrets.push({ name, description });
  return name;
}

function skillSourceForExport(service, skill) {
  if (!isAbsolute(skill.source)) return skill.source;
  const path = relative(service.repoDir, skill.source);
  if (
    path === ".." ||
    path.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) ||
    isAbsolute(path)
  )
    throw new Error(
      `Skill ${skill.name} uses a local source outside this skin checkout. Add it to the skin repository or install it from Git before exporting a portable kit.`,
    );
  return `./${path.replaceAll("\\", "/")}`;
}

function skillSourceForApply(service, source) {
  if (!source.startsWith("./")) return source;
  const path = resolve(service.repoDir, source);
  const suffix = relative(service.repoDir, path);
  if (suffix.startsWith("..") || isAbsolute(suffix))
    throw new Error("Package-relative skill source escapes the skin checkout.");
  return path;
}

function referencedSecrets(value) {
  if (typeof value !== "string") return [];
  return [
    ...value.matchAll(
      /\$\{([A-Za-z][A-Za-z0-9_]*)\}|\$([A-Za-z][A-Za-z0-9_]*)/g,
    ),
  ].map((match) => match[1] || match[2]);
}

function exportMcp(servers, skin, previousServers = {}) {
  const result = clone(servers || {});
  for (const [name, server] of Object.entries(result)) {
    for (const mapName of ["env", "headers", "auth.headers"]) {
      const map = mapName
        .split(".")
        .reduce((value, part) => value?.[part], server);
      for (const [key, value] of Object.entries(map || {})) {
        const previousValue = mapName
          .split(".")
          .reduce((prior, part) => prior?.[part], previousServers[name])?.[key];
        const declaredValue = referencedSecrets(previousValue).length
          ? previousValue
          : value;
        const refs = referencedSecrets(declaredValue);
        if (refs.length) {
          refs.forEach((ref) =>
            declaration(skin, ref, `Required by MCP server ${name}.`),
          );
          map[key] = declaredValue.replace(
            /\$([A-Za-z][A-Za-z0-9_]*)/g,
            (_, ref) => `\${${ref}}`,
          );
        } else if (value != null) {
          const ref =
            mapName === "env" && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(key)
              ? key
              : secretName("SKIN_MCP", name, key);
          declaration(
            skin,
            ref,
            `Full ${mapName} value for MCP server ${name}: ${key}.`,
          );
          map[key] = `\${${ref}}`;
        }
      }
    }
    if (server.auth) {
      for (const key of ["value", "password", "username"]) {
        if (server.auth[key] == null) continue;
        const priorValue = previousServers[name]?.auth?.[key];
        const declaredValue = referencedSecrets(priorValue).length
          ? priorValue
          : server.auth[key];
        const refs = referencedSecrets(declaredValue);
        if (refs.length) {
          refs.forEach((ref) =>
            declaration(skin, ref, `Required by MCP server ${name}.`),
          );
          server.auth[key] = declaredValue.replace(
            /\$([A-Za-z][A-Za-z0-9_]*)/g,
            (_, ref) => `\${${ref}}`,
          );
        } else {
          const ref = declaration(
            skin,
            secretName("SKIN_MCP", name, key),
            `Authentication ${key} for MCP server ${name}.`,
          );
          server.auth[key] = `\${${ref}}`;
        }
      }
      if (server.auth.strategy === "oauth2") {
        // Tokens and client registrations belong to the destination's OAuth
        // session. A kit can describe the server but cannot transfer consent.
        delete server.auth.state;
        if (server.auth.authentication)
          delete server.auth.authentication.client_secret;
      }
    }
  }
  return result;
}

function commitExport(service, skin, artifacts) {
  const gitDir = join(service.repoDir, ".git");
  const stagingRoot =
    existsSync(gitDir) && lstatSync(gitDir).isDirectory()
      ? gitDir
      : service.repoDir;
  const staging = mkdtempSync(join(stagingRoot, ".skin-export-"));
  const manifest = join(service.repoDir, "skin.yaml");
  const automationDir = join(service.repoDir, "automations");
  let manifestBackedUp = false;
  let automationsBackedUp = false;
  let newAutomations = false;
  try {
    writeFileSync(join(staging, "skin.yaml"), yaml.dump(skin));
    mkdirSync(join(staging, "automations"));
    for (const artifact of artifacts) {
      const dir = join(staging, "automations", artifact.path.split("/")[1]);
      mkdirSync(dir);
      writeFileSync(
        join(dir, "automation.json"),
        JSON.stringify(artifact.definition, null, 2),
      );
      writeFileSync(join(dir, "automation.tar.gz"), artifact.bytes);
    }
    renameSync(manifest, join(staging, "previous-skin.yaml"));
    manifestBackedUp = true;
    renameSync(join(staging, "skin.yaml"), manifest);
    if (service.automationUrl) {
      if (existsSync(automationDir)) {
        renameSync(automationDir, join(staging, "previous-automations"));
        automationsBackedUp = true;
      }
      renameSync(join(staging, "automations"), automationDir);
      newAutomations = true;
    }
  } catch (error) {
    if (newAutomations) rmSync(automationDir, { recursive: true, force: true });
    if (automationsBackedUp)
      renameSync(join(staging, "previous-automations"), automationDir);
    if (manifestBackedUp) {
      rmSync(manifest, { force: true });
      renameSync(join(staging, "previous-skin.yaml"), manifest);
    }
    throw error;
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

async function listAutomations(service) {
  const result = [];
  for (let offset = 0; ; ) {
    const page = await service.backendFetch(
      service.automationUrl,
      `/api/automation/v1?limit=100&offset=${offset}`,
    );
    if (!Array.isArray(page.automations))
      throw new Error("Automation list response is missing automations.");
    result.push(...page.automations);
    offset += page.automations.length;
    if (!page.automations.length || offset >= (page.total ?? offset))
      return result;
  }
}

async function downloadAutomation(service, id) {
  let url = `${service.automationUrl}/api/automation/v1/${enc(id)}/tarball`;
  const originalOrigin = new URL(url).origin;
  for (let hop = 0; hop < 4; hop += 1) {
    const sameOrigin = new URL(url).origin === originalOrigin;
    const response = await fetch(url, {
      headers: sameOrigin
        ? { "X-Session-API-Key": service.sessionApiKey || "" }
        : {},
      redirect: "manual",
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location)
        throw new Error(
          "Automation artifact redirect is missing its location.",
        );
      const next = new URL(location, url);
      if (
        next.username ||
        next.password ||
        (next.origin !== originalOrigin && next.protocol !== "https:")
      )
        throw new Error(
          "Automation artifact redirect must use credential-free HTTPS.",
        );
      url = next.href;
      continue;
    }
    if (!response.ok)
      throw new Error(`Automation tarball returned HTTP ${response.status}.`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > UPLOAD_LIMIT)
      throw new Error(
        "Automation tarball exceeds the released API's 1 MiB upload limit.",
      );
    return bytes;
  }
  throw new Error("Automation artifact redirected too many times.");
}

/** Export is staged in memory: a failed dependency read never overwrites a
 * previously useful kit or silently auto-pushes an incomplete snapshot.
 */
export async function exportSkinConfiguration(service) {
  const report = reportFor("exported");
  const prior = service.readSkinYaml() || {};
  const skin = clone(prior);
  const artifacts = [];
  try {
    if (!service.agentServerUrl)
      throw new Error("Agent Server URL is not configured.");
    // Listing agents first completes the released server's one-time migration
    // of legacy global LLM settings into its default named profile.
    const agentList = await service.backendFetch(
      service.agentServerUrl,
      "/api/agent-profiles",
    );
    const [settings, providers, profileList, metaList, secretList, skillList] =
      await Promise.all([
        service.backendFetch(service.agentServerUrl, "/api/settings"),
        service.backendFetch(
          service.agentServerUrl,
          "/api/llm/provider-connections",
        ),
        service.backendFetch(service.agentServerUrl, "/api/profiles"),
        service.backendFetch(service.agentServerUrl, "/api/meta-profiles"),
        service.backendFetch(service.agentServerUrl, "/api/settings/secrets"),
        service.backendFetch(service.agentServerUrl, "/api/skills/installed"),
      ]);
    if (
      !Array.isArray(providers) ||
      !Array.isArray(profileList.profiles) ||
      !Array.isArray(agentList.profiles) ||
      !Array.isArray(metaList.meta_profiles) ||
      !Array.isArray(skillList.skills) ||
      !Array.isArray(secretList.secrets)
    )
      throw new Error("A configuration inventory response is incomplete.");
    const providerById = new Map(
      providers.map((provider) => [provider.id, provider.display_name]),
    );
    if (
      new Set(providers.map((provider) => provider.display_name)).size !==
      providers.length
    )
      throw new Error(
        "Provider connection display names must be unique before exporting a kit.",
      );
    skin.configuration_version = 2;
    skin.secrets = secretList.secrets.map((secret) =>
      pick(secret, ["name", "description"]),
    );
    skin.provider_connections = providers.map((provider) => ({
      ...pick(provider, ["display_name", "provider", "base_url"]),
      secret_name: declaration(
        skin,
        prior.provider_connections?.find(
          (entry) => entry.display_name === provider.display_name,
        )?.secret_name || secretName("SKIN_PROVIDER", provider.display_name),
        `API key for provider connection ${provider.display_name}.`,
      ),
    }));
    skin.llm_profiles = await Promise.all(
      profileList.profiles.map(async (profile) => {
        const detail = await service.backendFetch(
          service.agentServerUrl,
          `/api/profiles/${enc(profile.name)}`,
        );
        if (!detail.config || typeof detail.config !== "object")
          throw new Error(`LLM profile ${profile.name} has no configuration.`);
        const config = clone(detail.config);
        const connection = config.provider_connection_id
          ? providerById.get(config.provider_connection_id)
          : null;
        if (config.provider_connection_id && !connection)
          throw new Error(
            `LLM profile ${profile.name} references a missing provider connection.`,
          );
        delete config.provider_connection_id;
        const secret_bindings = {};
        for (const key of LLM_SECRETS) {
          if (
            config.auth_type !== "subscription" &&
            ((key === "api_key" && detail.api_key_set && !connection) ||
              config[key])
          )
            secret_bindings[key] = declaration(
              skin,
              secretName("SKIN_LLM", profile.name, key),
              `${key} for LLM profile ${profile.name}.`,
            );
          delete config[key];
        }
        if (config.extra_headers) {
          for (const key of Object.keys(config.extra_headers)) {
            const ref = declaration(
              skin,
              secretName("SKIN_LLM", profile.name, key),
              `Full extra header ${key} for LLM profile ${profile.name}.`,
            );
            secret_bindings[`extra_headers.${key}`] = ref;
          }
          delete config.extra_headers;
        }
        if (config.auth_type === "subscription")
          report.warnings.push(
            `LLM profile ${profile.name} requires subscription sign-in on a new instance; OAuth sessions are not exported.`,
          );
        return {
          name: profile.name,
          config,
          ...(connection ? { provider_connection: connection } : {}),
          ...(Object.keys(secret_bindings).length ? { secret_bindings } : {}),
        };
      }),
    );
    const agentIdToName = new Map();
    skin.agent_profiles = await Promise.all(
      agentList.profiles.map(async (summary) => {
        const detail = await service.backendFetch(
          service.agentServerUrl,
          `/api/agent-profiles/${enc(summary.name)}`,
        );
        if (!detail.profile || typeof detail.profile !== "object")
          throw new Error(
            `Agent profile ${summary.name} has no configuration.`,
          );
        if (detail.profile.id)
          agentIdToName.set(detail.profile.id, summary.name);
        const profile = { ...detail.profile, name: summary.name };
        delete profile.id;
        delete profile.revision;
        return profile;
      }),
    );
    skin.meta_profiles = await Promise.all(
      metaList.meta_profiles.map(async (summary) => {
        const detail = await service.backendFetch(
          service.agentServerUrl,
          `/api/meta-profiles/${enc(summary.name)}`,
        );
        if (!detail.config || typeof detail.config !== "object")
          throw new Error(`Meta profile ${summary.name} has no configuration.`);
        return { name: summary.name, config: detail.config };
      }),
    );
    skin.mcp_servers = exportMcp(
      settings.agent_settings?.mcp_config,
      skin,
      prior.mcp_servers,
    );
    skin.agent_settings = clone(settings.agent_settings || {});
    for (const key of [
      "llm",
      "mcp_config",
      "meta_profile",
      "active_meta_profile",
      "active_agent_profile_id",
    ])
      delete skin.agent_settings[key];
    skin.context_bindings = [];
    for (const [name, secret] of Object.entries(
      skin.agent_settings.agent_context?.secrets || {},
    )) {
      let targetName = /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(name)
        ? name
        : secretName("SKIN_CONTEXT", name);
      if (secret?.kind === "LookupSecret") {
        let canonical = false;
        try {
          const url = new URL(secret.url, service.agentServerUrl);
          const match = /^\/api\/settings\/secrets\/([^/]+)$/.exec(
            url.pathname,
          );
          if (
            match &&
            /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(decodeURIComponent(match[1]))
          ) {
            targetName = decodeURIComponent(match[1]);
            canonical = true;
          }
        } catch {
          /* Noncanonical lookups become explicit local requirements. */
        }
        if (!canonical)
          report.warnings.push(
            `External secret lookup ${name} becomes a destination secret requirement; external lookup connections are not transferred.`,
          );
      }
      declaration(
        skin,
        targetName,
        `Secret supplied to the global agent context as ${name}.`,
      );
      skin.context_bindings.push({ name, secret_name: targetName });
    }
    if (skin.agent_settings.agent_context)
      delete skin.agent_settings.agent_context.secrets;
    delete skin.llm; // Named profiles are authoritative in version 2.
    skin.settings = pick(
      settings.conversation_settings,
      CONVERSATION_PREFERENCES,
    );
    skin.app_preferences = pick(
      settings.misc_settings?.app_preferences,
      APP_PREFERENCES,
    );
    skin.active = {
      ...(settings.active_profile !== undefined
        ? { llm_profile: settings.active_profile }
        : {}),
      ...(settings.active_meta_profile !== undefined
        ? { meta_profile: settings.active_meta_profile }
        : {}),
    };
    if (settings.active_agent_profile_id != null) {
      const name = agentIdToName.get(settings.active_agent_profile_id);
      if (!name)
        throw new Error(
          "The active agent profile is not present in the profile inventory.",
        );
      skin.active.agent_profile = name;
    } else if (settings.active_agent_profile_id === null)
      skin.active.agent_profile = null;
    skin.skills = skillList.skills.map((skill) => ({
      ...pick(skill, ["name", "source", "repo_path", "enabled"]),
      source: skillSourceForExport(service, skill),
      ...(skill.resolved_ref ? { ref: skill.resolved_ref } : {}),
    }));
    if (service.automationUrl) {
      for (const automation of await listAutomations(service)) {
        if (automation.state === "DRAFT") {
          report.skipped.push(
            `Draft automation ${automation.name} is not a deployable automation.`,
          );
          continue;
        }
        const definition = {
          ...pick(automation, AUTOMATION_FIELDS),
          source_id: automation.id,
        };
        if (automation.agent_profile_id) {
          const profileName = agentIdToName.get(automation.agent_profile_id);
          if (!profileName)
            throw new Error(
              `Automation ${automation.name} references a missing agent profile.`,
            );
          definition.agent_profile_ref = profileName;
        }
        if (
          ["prompt", "plugin"].includes(automation.preset_metadata?.preset_type)
        ) {
          definition.preset_type = automation.preset_metadata.preset_type;
          Object.assign(
            definition,
            pick(
              { ...automation.preset_metadata, ...automation },
              PRESET_FIELDS,
            ),
          );
        }
        const basename = createHash("sha256")
          .update(String(automation.id))
          .digest("hex")
          .slice(0, 16);
        const path = `automations/${basename}`;
        const safeDefinition = sanitize(
          definition,
          `${path}/automation.json`,
          report,
        );
        artifacts.push({
          path,
          definition: safeDefinition,
          bytes: await downloadAutomation(service, automation.id),
        });
        report.opaquePaths.push(`${path}/automation.tar.gz`);
      }
      report.warnings.push(
        "Restored automations are inactive. Review their code and enable them in Automations when ready.",
      );
    }
    skin.canvas_version ||= `>=${service.canvasVersion}`;
    const safeSkin = sanitize(skin, "skin.yaml", report);
    if (report.rejectedPaths.length)
      throw new Error(
        "Configuration contains concrete or opaque credential fields; review rejected paths before exporting it.",
      );
    const checked = inspectSkinFilesForPush([
      { path: "skin.yaml", content: yaml.dump(safeSkin) },
      ...artifacts.flatMap((artifact) => [
        {
          path: `${artifact.path}/automation.json`,
          content: JSON.stringify(artifact.definition),
        },
        { path: `${artifact.path}/automation.tar.gz`, content: artifact.bytes },
      ]),
    ]);
    checked.rejectedPaths.forEach((path) => add(report.rejectedPaths, path));
    checked.opaquePaths.forEach((path) => add(report.opaquePaths, path));
    report.warnings.push(...checked.warnings);
    if (checked.rejectedPaths.length)
      throw new Error(
        "Automation artifacts contain recognized credential material; remove it before exporting the kit.",
      );
    commitExport(service, safeSkin, artifacts);
    report.exported.push(
      "provider connections",
      "LLM profiles",
      "meta profiles",
      "agent profiles",
      "MCP servers",
      "preferences",
      "secret names",
      "skills",
    );
    if (service.automationUrl)
      report.exported.push(`automations (${artifacts.length})`);
    else
      report.skipped.push(
        "Automation backend is not configured; existing bundled automations were retained unchanged.",
      );
  } catch (error) {
    report.errors.push(error.message);
    report.skipped.push(
      "Existing exported configuration was kept because this export did not complete.",
    );
  }
  const safety = assessExportSafety({
    rejectedPaths: report.rejectedPaths,
    opaquePaths: report.opaquePaths,
  });
  report.safeForAutomaticPush = safety.safeForAutomaticPush;
  report.warnings.push(...safety.warnings);
  finish(service, report, "exportReport");
  const pushResult = report.complete
    ? await service.autoPushIfEnabled(
        "Export Agent Canvas instance configuration to skin",
      )
    : { pushed: false };
  if (
    report.complete &&
    service.loadSettings()?.autoPush &&
    !pushResult.pushed
  ) {
    report.warnings.push(
      pushResult.reviewRequired
        ? `Automatic push needs manual review of source files: ${(pushResult.reviewPaths || []).join(", ")}.`
        : `Automatic push did not publish this export: ${pushResult.error || "review the skin's Git status and push manually"}.`,
    );
    finish(service, report, "exportReport");
  }
  return { report, pushResult };
}

function setPath(object, path, value) {
  if (path.startsWith("extra_headers.")) {
    object.extra_headers ||= {};
    object.extra_headers[path.slice("extra_headers.".length)] = value;
    return;
  }
  const parts = path.split(".");
  let target = object;
  for (const part of parts.slice(0, -1)) target = target[part] ||= {};
  target[parts.at(-1)] = value;
}

async function optionalDetail(service, path, encrypted = false) {
  try {
    return await service.backendFetch(
      service.agentServerUrl,
      path,
      encrypted ? { headers: { "X-Expose-Secrets": "encrypted" } } : {},
    );
  } catch (error) {
    if (/HTTP 404$/.test(error.message)) return null;
    throw error;
  }
}

async function applyAutomations(service, skin, agentIds, llmNames, report) {
  const dir = join(service.repoDir, "automations");
  if (!existsSync(dir)) return;
  if (!service.automationUrl) {
    report.errors.push(
      "Automation backend is not configured; bundled automations were not restored.",
    );
    return;
  }
  const existing = await listAutomations(service);
  for (const name of readdirSync(dir).sort()) {
    if (!/^[A-Za-z0-9_-]+$/.test(name))
      throw new Error("Invalid automation bundle directory.");
    const bundle = join(dir, name);
    let uploaded;
    let created;
    let generatedUploadId;
    try {
      const definition = JSON.parse(
        readFileSync(join(bundle, "automation.json"), "utf-8"),
      );
      if (existing.some((automation) => automation.name === definition.name)) {
        report.skipped.push(
          `Automation ${definition.name} already exists; its configuration and scheduling were kept.`,
        );
        continue;
      }
      if (definition.model && !llmNames.has(definition.model))
        throw new Error(
          `Automation ${definition.name} requires LLM profile ${definition.model}.`,
        );
      const agentId = definition.agent_profile_ref
        ? agentIds.get(definition.agent_profile_ref)
        : null;
      if (definition.agent_profile_ref && !agentId)
        throw new Error(
          `Automation ${definition.name} requires agent profile ${definition.agent_profile_ref}.`,
        );
      const bytes = readFileSync(join(bundle, "automation.tar.gz"));
      if (bytes.length > UPLOAD_LIMIT)
        throw new Error(
          "Automation bundle exceeds the API's 1 MiB upload limit.",
        );
      report.opaquePaths.push(`automations/${name}/automation.tar.gz`);
      const checked = inspectSkinFilesForPush([
        {
          path: `automations/${name}/automation.json`,
          content: JSON.stringify(definition),
        },
        { path: `automations/${name}/automation.tar.gz`, content: bytes },
      ]);
      checked.rejectedPaths.forEach((path) => add(report.rejectedPaths, path));
      report.warnings.push(...checked.warnings);
      if (checked.rejectedPaths.length)
        throw new Error(
          "Automation artifacts contain recognized credentials; replace them with secret references.",
        );
      if (
        definition.preset_type === "plugin" &&
        !definition.plugins?.length &&
        !definition.variants?.length
      )
        throw new Error(
          "Plugin experiment authoring metadata is not exposed by this automation release; configure its variants before restoring this bundle.",
        );
      uploaded = await service.backendFetch(
        service.automationUrl,
        `/api/automation/v1/uploads?name=${enc(`${definition.name.slice(0, 248)}.tar.gz`)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/gzip" },
          body: bytes,
        },
      );
      if (uploaded.status !== "COMPLETED" || !uploaded.tarball_path)
        throw new Error("Automation upload did not complete.");
      const fields = {
        ...pick(definition, AUTOMATION_FIELDS),
        state: "INACTIVE",
        enabled: false,
      };
      if (agentId) delete fields.model;
      if (["prompt", "plugin"].includes(definition.preset_type)) {
        const presetFields = pick(
          definition,
          definition.preset_type === "plugin"
            ? PRESET_FIELDS
            : ["prompt", "repos"],
        );
        const request = { ...fields, ...presetFields };
        delete request.entrypoint;
        delete request.setup_script_path;
        created = await service.backendFetch(
          service.automationUrl,
          `/api/automation/v1/preset/${definition.preset_type}`,
          { method: "POST", body: JSON.stringify(request) },
        );
        if (!created.id)
          throw new Error("Automation create response is missing its ID.");
        generatedUploadId = /^oh-internal:\/\/uploads\/([^/]+)$/.exec(
          created.tarball_path || "",
        )?.[1];
        await service.backendFetch(
          service.automationUrl,
          `/api/automation/v1/${enc(created.id)}`,
          {
            method: "PATCH",
            body: JSON.stringify({
              tarball_path: uploaded.tarball_path,
              ...pick(definition, ["entrypoint", "setup_script_path"]),
              ...(agentId ? { agent_profile_id: agentId } : {}),
              state: "INACTIVE",
              enabled: false,
            }),
          },
        );
        if (generatedUploadId && generatedUploadId !== uploaded.id) {
          try {
            await service.backendFetch(
              service.automationUrl,
              `/api/automation/v1/uploads/${enc(generatedUploadId)}`,
              { method: "DELETE" },
            );
            generatedUploadId = null;
          } catch {
            report.warnings.push(
              "The replaced preset upload could not be removed.",
            );
          }
        }
      } else {
        created = await service.backendFetch(
          service.automationUrl,
          "/api/automation/v1",
          {
            method: "POST",
            body: JSON.stringify({
              ...fields,
              tarball_path: uploaded.tarball_path,
              ...(agentId ? { agent_profile_id: agentId } : {}),
            }),
          },
        );
        if (!created.id)
          throw new Error("Automation create response is missing its ID.");
      }
      existing.push({ name: definition.name, id: created.id });
      report.applied.push(`Automation ${definition.name} (inactive)`);
    } catch (error) {
      report.errors.push(`Automation bundle ${name}: ${error.message}`);
      if (created?.id) {
        try {
          await service.backendFetch(
            service.automationUrl,
            `/api/automation/v1/${enc(created.id)}`,
            { method: "DELETE" },
          );
        } catch {
          report.warnings.push(
            `Failed to remove incomplete inactive automation ${created.id}.`,
          );
        }
      }
      for (const id of [uploaded?.id, generatedUploadId].filter(Boolean)) {
        try {
          await service.backendFetch(
            service.automationUrl,
            `/api/automation/v1/uploads/${enc(id)}`,
            { method: "DELETE" },
          );
        } catch {
          report.warnings.push("Failed to remove an unused automation upload.");
        }
      }
    }
  }
  report.warnings.push(
    "Restored automations stay inactive; enable them in Automations after reviewing the kit.",
  );
}

export async function applySkinConfiguration(service) {
  const report = reportFor("applied");
  const skin = service.readSkinYaml() || {};
  try {
    if (!service.agentServerUrl)
      throw new Error("Agent Server URL is not configured.");
    const safety = sanitizeExportData(skin, { path: "skin.yaml" });
    if (safety.rejectedPaths.length) {
      report.rejectedPaths.push(...safety.rejectedPaths);
      throw new Error(
        "Skin configuration contains concrete credentials; use secret-name references instead.",
      );
    }
    const needsInventory =
      skin.configuration_version >= 2 ||
      skin.provider_connections?.length ||
      skin.llm_profiles?.length ||
      skin.active ||
      skin.agent_profiles?.length;
    const targetSecrets = await service.backendFetch(
      service.agentServerUrl,
      "/api/settings/secrets",
    );
    const presentSecrets = new Set(
      (targetSecrets.secrets || []).map((secret) => secret.name),
    );
    const unresolvedSecrets = new Set();
    for (const secret of skin.secrets || [])
      if (!presentSecrets.has(secret.name))
        add(report.missingSecrets, secret.name);
    const readSecret = async (name) => {
      if (
        typeof name !== "string" ||
        !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(name)
      )
        throw new Error(
          "A credential binding must declare a valid destination secret name.",
        );
      if (!presentSecrets.has(name)) {
        add(report.missingSecrets, name);
        unresolvedSecrets.add(name);
        return null;
      }
      const value = await service.backendFetch(
        service.agentServerUrl,
        `/api/settings/secrets/${enc(name)}`,
      );
      return typeof value === "string"
        ? value
        : Buffer.from(value).toString("utf-8");
    };
    const targetProviders = skin.provider_connections?.length
      ? await service.backendFetch(
          service.agentServerUrl,
          "/api/llm/provider-connections",
        )
      : [];
    const providerIds = new Map();
    for (const provider of skin.provider_connections || []) {
      try {
        const matches = targetProviders.filter(
          (candidate) => candidate.display_name === provider.display_name,
        );
        if (matches.length > 1)
          throw new Error(
            "Multiple target connections share this display name.",
          );
        const body = pick(provider, ["display_name", "provider", "base_url"]);
        let connection;
        if (matches.length)
          connection = await service.backendFetch(
            service.agentServerUrl,
            `/api/llm/provider-connections/${enc(matches[0].id)}`,
            { method: "PATCH", body: JSON.stringify(body) },
          );
        else {
          const key = await readSecret(provider.secret_name);
          if (!key) {
            report.skipped.push(
              `Provider ${provider.display_name} requires secret ${provider.secret_name}.`,
            );
            continue;
          }
          connection = await service.backendFetch(
            service.agentServerUrl,
            "/api/llm/provider-connections",
            { method: "POST", body: JSON.stringify({ ...body, api_key: key }) },
          );
        }
        if (!connection.id)
          throw new Error("Provider connection response is missing its ID.");
        providerIds.set(provider.display_name, connection.id);
        if (matches.length && provider.secret_name)
          report.missingSecrets = report.missingSecrets.filter(
            (name) => name !== provider.secret_name,
          );
        report.applied.push(`Provider ${provider.display_name}`);
      } catch (error) {
        report.errors.push(
          `Provider ${provider.display_name}: ${error.message}`,
        );
      }
    }
    const targetProfiles = needsInventory
      ? await service.backendFetch(service.agentServerUrl, "/api/profiles")
      : { profiles: [] };
    const llmNames = new Set(
      (targetProfiles.profiles || []).map((profile) => profile.name),
    );
    for (const profile of skin.llm_profiles || []) {
      try {
        const config = clone(profile.config);
        if (profile.provider_connection) {
          const id = providerIds.get(profile.provider_connection);
          if (!id) {
            report.skipped.push(
              `LLM profile ${profile.name} waits for provider ${profile.provider_connection}.`,
            );
            continue;
          }
          config.provider_connection_id = id;
        }
        const previous = llmNames.has(profile.name)
          ? await optionalDetail(
              service,
              `/api/profiles/${enc(profile.name)}`,
              true,
            )
          : null;
        // The released POST replaces the whole LLM. Keep destination secrets
        // and opaque header/body configuration in memory, never in the kit.
        for (const key of [
          ...LLM_SECRETS,
          "extra_headers",
          "litellm_extra_body",
        ])
          if (previous?.config?.[key] != null)
            config[key] = previous.config[key];
        let missing = false;
        for (const [field, name] of Object.entries(
          profile.secret_bindings || {},
        )) {
          if (
            !LLM_SECRETS.includes(field) &&
            !field.startsWith("extra_headers.")
          )
            throw new Error("Unknown LLM credential binding field.");
          const path = field.split(".");
          const existingValue = field.startsWith("extra_headers.")
            ? config.extra_headers?.[field.slice("extra_headers.".length)]
            : path.reduce((value, part) => value?.[part], config);
          if (existingValue != null) {
            report.missingSecrets = report.missingSecrets.filter(
              (entry) => entry !== name,
            );
            continue;
          }
          const value = await readSecret(name);
          if (value == null) {
            missing = true;
            continue;
          }
          setPath(config, field, value);
        }
        if (missing) {
          report.skipped.push(
            `LLM profile ${profile.name} waits for its secret requirements.`,
          );
          continue;
        }
        await service.backendFetch(
          service.agentServerUrl,
          `/api/profiles/${enc(profile.name)}`,
          {
            method: "POST",
            body: JSON.stringify({ llm: config, include_secrets: true }),
          },
        );
        llmNames.add(profile.name);
        report.applied.push(`LLM profile ${profile.name}`);
      } catch (error) {
        report.errors.push(`LLM profile ${profile.name}: ${error.message}`);
      }
    }
    const targetMeta = needsInventory
      ? await service.backendFetch(service.agentServerUrl, "/api/meta-profiles")
      : { meta_profiles: [] };
    const metaNames = new Set(
      (targetMeta.meta_profiles || []).map((profile) => profile.name),
    );
    for (const profile of skin.meta_profiles || []) {
      try {
        await service.backendFetch(
          service.agentServerUrl,
          `/api/meta-profiles/${enc(profile.name)}`,
          { method: "POST", body: JSON.stringify(profile.config) },
        );
        metaNames.add(profile.name);
        report.applied.push(`Meta profile ${profile.name}`);
      } catch (error) {
        report.errors.push(`Meta profile ${profile.name}: ${error.message}`);
      }
    }
    const patch = {};
    const agentDiff = clone(skin.agent_settings || {});
    if (skin.context_bindings?.length) {
      const current = await service.backendFetch(
        service.agentServerUrl,
        "/api/settings",
      );
      const values = {};
      for (const binding of skin.context_bindings) {
        if (
          !presentSecrets.has(binding.secret_name) &&
          current.agent_settings?.agent_context?.secrets?.[binding.name] != null
        ) {
          report.missingSecrets = report.missingSecrets.filter(
            (entry) => entry !== binding.secret_name,
          );
          continue;
        }
        const value = await readSecret(binding.secret_name);
        if (value != null)
          values[binding.name] = { kind: "StaticSecret", value };
      }
      if (Object.keys(values).length) {
        agentDiff.agent_context ||= {};
        agentDiff.agent_context.secrets = values;
      }
    }
    if (skin.mcp_servers && Object.keys(skin.mcp_servers).length) {
      const servers = clone(skin.mcp_servers);
      const current = await service.backendFetch(
        service.agentServerUrl,
        "/api/settings",
      );
      for (const [name, server] of Object.entries(servers)) {
        let waiting = false;
        const leaves = [];
        for (const mapName of ["env", "headers", "auth.headers"]) {
          const parts = mapName.split(".");
          const map = parts.reduce((value, part) => value?.[part], server);
          const priorMap = parts.reduce(
            (value, part) => value?.[part],
            current.agent_settings?.mcp_config?.[name],
          );
          for (const key of Object.keys(map || {}))
            leaves.push({ map, key, previous: priorMap?.[key] });
        }
        for (const key of ["value", "password", "username"])
          if (server.auth?.[key] != null)
            leaves.push({
              map: server.auth,
              key,
              previous: current.agent_settings?.mcp_config?.[name]?.auth?.[key],
            });
        for (const { map, key, previous } of leaves) {
          const refs = referencedSecrets(map[key]);
          if (!refs.length) continue;
          if (
            refs.some((ref) => !presentSecrets.has(ref)) &&
            previous != null
          ) {
            delete map[key];
            refs.forEach((ref) => {
              if (!unresolvedSecrets.has(ref))
                report.missingSecrets = report.missingSecrets.filter(
                  (entry) => entry !== ref,
                );
            });
            continue;
          }
          let value = map[key];
          for (const ref of refs) {
            const secret = await readSecret(ref);
            if (secret == null) waiting = true;
            if (secret != null)
              value = value
                .replaceAll(`\${${ref}}`, secret)
                .replace(
                  new RegExp(`\\$${ref}(?![A-Za-z0-9_])`, "g"),
                  () => secret,
                );
          }
          map[key] = value;
        }
        if (waiting) {
          delete servers[name];
          report.skipped.push(
            `MCP server ${name} waits for its secret requirements.`,
          );
        }
      }
      if (Object.keys(servers).length) agentDiff.mcp_config = servers;
    }
    if (skin.llm && Object.keys(skin.llm).length) agentDiff.llm = skin.llm;
    if (Object.keys(agentDiff).length) patch.agent_settings_diff = agentDiff;
    if (skin.settings && Object.keys(skin.settings).length)
      patch.conversation_settings_diff = skin.settings;
    if (skin.app_preferences && Object.keys(skin.app_preferences).length)
      patch.misc_settings_diff = {
        app_preferences: pick(skin.app_preferences, APP_PREFERENCES),
      };
    if (Object.keys(patch).length) {
      await service.backendFetch(service.agentServerUrl, "/api/settings", {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      report.applied.push("MCP servers and preferences");
    }
    for (const skill of skin.skills || []) {
      try {
        const installed = await service.backendFetch(
          service.agentServerUrl,
          "/api/skills/install",
          {
            method: "POST",
            body: JSON.stringify({
              ...pick(skill, ["source", "ref", "repo_path"]),
              source: skillSourceForApply(service, skill.source),
              force: true,
            }),
          },
        );
        if (typeof skill.enabled === "boolean")
          await service.backendFetch(
            service.agentServerUrl,
            `/api/skills/installed/${enc(installed.name || skill.name)}`,
            {
              method: "PATCH",
              body: JSON.stringify({ enabled: skill.enabled }),
            },
          );
        report.applied.push(`Skill ${skill.name}`);
      } catch (error) {
        report.errors.push(`Skill ${skill.name}: ${error.message}`);
      }
    }
    const agentIds = new Map();
    for (const profile of skin.agent_profiles || []) {
      try {
        if (profile.llm_profile_ref && !llmNames.has(profile.llm_profile_ref))
          throw new Error(
            `LLM profile ${profile.llm_profile_ref} is unavailable.`,
          );
        if (
          profile.meta_profile_ref &&
          !metaNames.has(profile.meta_profile_ref)
        )
          throw new Error(
            `Meta profile ${profile.meta_profile_ref} is unavailable.`,
          );
        const payload = clone(profile);
        delete payload.id;
        delete payload.revision;
        await service.backendFetch(
          service.agentServerUrl,
          `/api/agent-profiles/${enc(profile.name)}`,
          { method: "POST", body: JSON.stringify(payload) },
        );
        const detail = await service.backendFetch(
          service.agentServerUrl,
          `/api/agent-profiles/${enc(profile.name)}`,
        );
        if (!detail.profile?.id && skin.configuration_version >= 2)
          throw new Error(
            "Saved agent profile response is missing its target ID.",
          );
        agentIds.set(profile.name, detail.profile?.id);
        report.applied.push(`Agent profile ${profile.name}`);
      } catch (error) {
        report.errors.push(`Agent profile ${profile.name}: ${error.message}`);
      }
    }
    unresolvedSecrets.forEach((name) => add(report.missingSecrets, name));
    if (skin.active && !report.errors.length && !report.missingSecrets.length) {
      const active = {};
      if (skin.active.llm_profile !== undefined) {
        if (skin.active.llm_profile && !llmNames.has(skin.active.llm_profile))
          throw new Error("The requested active LLM profile is unavailable.");
        active.active_profile = skin.active.llm_profile;
      }
      if (skin.active.agent_profile !== undefined) {
        const id =
          skin.active.agent_profile == null
            ? null
            : agentIds.get(skin.active.agent_profile);
        if (id === undefined)
          throw new Error("The requested active agent profile is unavailable.");
        active.active_agent_profile_id = id;
      }
      if (Object.keys(active).length)
        await service.backendFetch(service.agentServerUrl, "/api/settings", {
          method: "PATCH",
          body: JSON.stringify(active),
        });
      if (skin.active.meta_profile !== undefined) {
        if (skin.active.meta_profile == null)
          await service.backendFetch(service.agentServerUrl, "/api/settings", {
            method: "PATCH",
            body: JSON.stringify({ active_meta_profile: null }),
          });
        else {
          if (!metaNames.has(skin.active.meta_profile))
            throw new Error(
              "The requested active meta profile is unavailable.",
            );
          await service.backendFetch(
            service.agentServerUrl,
            `/api/meta-profiles/${enc(skin.active.meta_profile)}/activate`,
            { method: "POST" },
          );
        }
      }
      report.applied.push("Active profile choices");
    }
    await applyAutomations(service, skin, agentIds, llmNames, report);
  } catch (error) {
    report.errors.push(error.message);
  }
  return finish(service, report, "applyReport");
}
