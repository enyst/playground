/**
 * Skin service — install, run, and sync a "skin" for this Agent Canvas
 * instance.
 *
 * A skin is a git-backed package (GitHub or a local Git repository) that:
 *   • serializes an instance's configuration (automations, skills, MCP server
 *     definitions, secret NAMES, LLM settings, agent profiles — never secret
 *     values, never conversations) into a `skin.yaml` + `automations/` layout,
 *   • ships an arbitrary web app started via `npm run start` on the single
 *     port given by the OPENHANDS_SKIN_PORT environment variable. The app
 *     must serve its UI under /skin-app/ (index.html + static, with
 *     <base href="/skin-app/">) and its own backend under /skin-app/api/* — the
 *     host proxies /skin-app verbatim and the Canvas frontend embeds it as
 *     its default tab (nested inside the Canvas UI, not standalone at /),
 *   • surfaces in the Canvas UI as an auto-created menu item (iframe tab).
 *
 * At most ONE skin can be installed per instance.
 *
 * The skin checkout lives in the agent's workspace (~/workspace/skin, a
 * persistent volume) so the instance's agent can edit the running skin in
 * place; this service supervises the app (own process group, restart with
 * backoff) and exposes POST /skin-api/restart for applying edits. Service
 * state (settings, logs) stays in ~/.openhands/agent-canvas/skin.
 *
 * This module is consumed by scripts/static-server.mjs, which mounts the
 * REST API under /skin-api and reverse-proxies /skin-app → the running skin.
 *
 * Skin repo format (everything at the repo root):
 *   skin.yaml       — required. name, icon (lucide icon name for the nav
 *                     entry), screenshot, canvas_version, secrets,
 *                     mcp_servers, skills, llm, settings, theme (major
 *                     colors inherited by the whole Canvas UI).
 *   package.json    — required, must define a "start" script.
 *   SKILL.md        — required. Describes what the skin does (pages, APIs,
 *                     data sources, agent workflows). Synced on every
 *                     start/restart/pull into ~/.openhands/skills/ as a
 *                     legacy always-active skill so its full content is in
 *                     the agent's context at the start of every
 *                     conversation. Must NOT declare `triggers:`
 *                     frontmatter (that would demote it to on-keyword).
 *   automations/    — optional, one subdirectory per automation with its
 *                     definition (and Python code / tarball).
 */

import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmdirSync,
  lstatSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

import yaml from "js-yaml";
import semver from "semver";
import {
  applySkinConfiguration,
  exportSkinConfiguration,
} from "./skin-configuration.mjs";
import {
  inspectSkinFilesForPush,
  sanitizeExportData,
} from "./skin-export-safety.mjs";

const SKIN_SETTINGS_FILE = "skin-settings.json";
const SKIN_REPO_DIR = "repo";
const SKIN_LOG_FILE = "skin.log";
const SKIN_YAML = "skin.yaml";
const RESTART_BACKOFF_MS = [1000, 2000, 5000, 10000, 30000];

function log(...args) {
  console.log("[skin-service]", ...args);
}

// ─────────────────────────────────────────────────────────────────────────────
// Skin theme (skin.yaml `theme:` block)
//
// A skin may declare a handful of major colors; the Canvas UI and the skin
// app both inherit them. Validation is strict (hex colors only, known keys
// only) because the values come from a user-supplied manifest and end up in
// a stylesheet. Derivation of the full Canvas variable set lives here so
// there is exactly one source of truth (the frontend applies the derived
// map verbatim; /skin-api/theme.css serves the same map to the skin app).
// ─────────────────────────────────────────────────────────────────────────────

// Lucide icon names are lowercase kebab-case (e.g. "activity",
// "bar-chart-3"). The value comes from a user-supplied manifest and ends up
// in a component lookup, so validate the shape strictly; anything else is
// dropped (the frontend falls back to its default skin icon).
const LUCIDE_ICON_NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Validate a skin.yaml `icon:` value (a lucide icon name). Returns the
 * name or null — never an error, a bad icon must not block an install. */
export function sanitizeIconName(icon) {
  if (typeof icon !== "string") return null;
  const name = icon.trim().toLowerCase();
  return name.length <= 64 && LUCIDE_ICON_NAME_RE.test(name) ? name : null;
}

// Name (and filename stem) of the always-active agent skill a skin's
// SKILL.md is synced to. Fixed so (a) uninstall knows what to remove and
// (b) it can never collide with the skin-builder skill installed as "skin".
export const SKIN_APP_SKILL_NAME = "skin-app";

/**
 * Render a skin repo's SKILL.md as a legacy always-active agent skill.
 *
 * The repo file may carry AgentSkills frontmatter (name/description/…). We
 * strip it and emit our own minimal frontmatter WITHOUT `triggers:` — in the
 * legacy .md format that means trigger=None, i.e. the full content is
 * injected into the system prompt of every conversation (the whole point:
 * the agent always knows what this instance's skin does).
 */
export function renderSkinAppSkill(skillMd, skinName) {
  let body = skillMd;
  let description = null;
  const fm = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(skillMd);
  if (fm) {
    body = skillMd.slice(fm[0].length);
    try {
      const meta = yaml.load(fm[1]);
      if (meta && typeof meta.description === "string") {
        description = meta.description;
      }
    } catch {
      // Malformed frontmatter — drop it, keep the body.
    }
  }
  const frontmatter = {
    name: SKIN_APP_SKILL_NAME,
    description:
      description ||
      `What the "${skinName || "installed"}" skin of this instance does.`,
  };
  return `---\n${yaml.dump(frontmatter).trimEnd()}\n---\n\n${body.trim()}\n`;
}

const THEME_KEYS = [
  "accent",
  "background",
  "surface",
  "text",
  "muted",
  "border",
  "success",
  "warning",
  "danger",
];
const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** Whitelist + hex-validate a raw `theme:` block. Returns null when the
 * manifest has no usable theme. Unknown keys and non-hex values are
 * dropped (never an error — a bad theme must not block a skin install). */
export function sanitizeTheme(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const theme = {};
  for (const key of THEME_KEYS) {
    const value = raw[key];
    if (typeof value === "string" && HEX_COLOR_RE.test(value.trim())) {
      theme[key] = value.trim().toLowerCase();
    }
  }
  return Object.keys(theme).length > 0 ? theme : null;
}

function hexToRgb(hex) {
  let h = hex.replace("#", "");
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]) {
  const c = (v) => Math.round(v).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Gamma-encoded per-channel lerp — same result as CSS
 * `color-mix(in srgb, a pct%, b)`, but emitted as a concrete hex value so
 * derived shades can be further converted (e.g. to HSL for HeroUI). */
const mix = (a, pct, b) => {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  const w = pct / 100;
  return rgbToHex(A.map((v, i) => v * w + B[i] * (1 - w)));
};

/** "H S% L%" channel string — the format HeroUI stores colors in
 * (`hsl(var(--heroui-*))`). */
export function hexToHslChannels(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const r2 = (n) => Math.round(n * 100) / 100;
  return `${r2(h)} ${r2(s * 100)}% ${r2(l * 100)}%`;
}

/** Expand the (partial) major-color theme into the full set of CSS custom
 * properties the Canvas UI is built on. Missing anchors fall back to each
 * other so a minimal `theme: {accent, background}` still works; shades in
 * between are derived by mixing the anchors. */
export function themeVars(theme) {
  const t = sanitizeTheme(theme);
  if (!t) return null;

  const background = t.background || t.surface || "#0b0e14";
  const surface =
    t.surface || (t.background ? mix(background, 82, "#ffffff") : "#21252f");
  const text = t.text || "#eef2f7";
  const muted = t.muted || mix(text, 55, background);
  const border = t.border || mix(muted, 45, background);

  /** @type {Record<string, string>} */
  const vars = {
    // Grey scale: anchors are the declared colors, steps between are mixes.
    "--cool-grey-50": mix(text, 60, "#ffffff"),
    "--cool-grey-100": text,
    "--cool-grey-200": mix(text, 85, muted),
    "--cool-grey-300": mix(text, 60, muted),
    "--cool-grey-400": muted,
    "--cool-grey-500": mix(muted, 75, border),
    "--cool-grey-600": mix(muted, 45, border),
    "--cool-grey-700": border,
    "--cool-grey-800": mix(border, 55, surface),
    "--cool-grey-900": mix(surface, 80, border),
    "--cool-grey-925": surface,
    "--cool-grey-950": background,
    "--cool-grey-975": mix(background, 60, "#000000"),
  };

  // HeroUI reads colors from its own --heroui-* HSL-channel variables, not
  // from our --cool-grey-* scale, so mirror the scale onto the same stop
  // positions the stock themes use (see src/themes/color-themes.ts).
  const g = (n) => hexToHslChannels(vars[`--cool-grey-${n}`]);
  Object.assign(vars, {
    "--heroui-background": g(950),
    "--heroui-background-foreground": g(50),
    "--heroui-foreground-50": g(975),
    "--heroui-foreground-100": g(950),
    "--heroui-foreground-200": g(925),
    "--heroui-foreground-300": g(900),
    "--heroui-foreground-400": g(800),
    "--heroui-foreground-500": g(700),
    "--heroui-foreground-600": g(600),
    "--heroui-foreground-700": g(500),
    "--heroui-foreground-800": g(400),
    "--heroui-foreground-900": g(300),
    "--heroui-foreground": g(300),
    "--heroui-content1": g(925),
    "--heroui-content1-foreground": g(100),
    "--heroui-content2": g(900),
    "--heroui-content2-foreground": g(200),
    "--heroui-content3": g(800),
    "--heroui-content3-foreground": g(300),
    "--heroui-content4": g(700),
    "--heroui-content4-foreground": g(400),
    "--heroui-default-50": g(975),
    "--heroui-default-100": g(950),
    "--heroui-default-200": g(925),
    "--heroui-default-300": g(900),
    "--heroui-default-400": g(800),
    "--heroui-default-500": g(700),
    "--heroui-default-600": g(600),
    "--heroui-default-700": g(500),
    "--heroui-default-800": g(400),
    "--heroui-default-900": g(300),
    "--heroui-default-foreground": g(50),
    "--heroui-default": g(800),
  });

  if (t.accent) {
    vars["--oh-color-primary"] = t.accent;
    vars["--oh-color-logo"] = t.accent;
    vars["--oh-accent"] = t.accent;
    vars["--oh-accent-foreground"] = background;
    vars["--oh-warning"] = t.warning || t.accent;
    vars["--oh-warning-foreground"] = background;
  } else if (t.warning) {
    vars["--oh-warning"] = t.warning;
    vars["--oh-warning-foreground"] = background;
  }
  if (t.success) {
    vars["--oh-color-success"] = t.success;
    vars["--oh-success"] = t.success;
    vars["--oh-success-foreground"] = background;
  }
  if (t.danger) {
    vars["--oh-color-danger"] = t.danger;
    vars["--oh-danger"] = t.danger;
  }
  return vars;
}

/** Render the derived variables as a stylesheet for the skin app
 * (`GET /skin-api/theme.css`). */
export function themeCss(theme) {
  const vars = themeVars(theme);
  if (!vars) return "/* no skin theme declared */\n:root {}\n";
  const lines = Object.entries(vars).map(([k, v]) => `  ${k}: ${v};`);
  return `:root {\n${lines.join("\n")}\n}\n`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Canvas release compatibility uses standard semver ranges.
// ─────────────────────────────────────────────────────────────────────────────

export function satisfiesCanvasVersion(current, range) {
  if (!range) return true;
  const version = semver.valid(current);
  if (!version) return true; // Development builds have no release version.
  const validRange =
    typeof range === "string" ? semver.validRange(range) : null;
  return validRange !== null && semver.satisfies(version, validRange);
}

function runGit(args, { cwd, token, binary = false } = {}) {
  return new Promise((resolve) => {
    const gitArgs = [...args];
    if (token) {
      const basic = Buffer.from(`x-access-token:${token}`).toString("base64");
      gitArgs.unshift(
        "-c",
        `http.https://github.com/.extraheader=AUTHORIZATION: basic ${basic}`,
      );
    }
    const child = spawn("git", gitArgs, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const chunks = [];
    let length = 0;
    let stderr = "";
    child.stdout.on("data", (d) => {
      length += d.length;
      if (length > 32 * 1024 * 1024) child.kill("SIGKILL");
      else chunks.push(d);
    });
    child.stderr.on("data", (d) => {
      stderr += d;
    });
    child.on("close", (code) => {
      const buffer = Buffer.concat(chunks);
      resolve({
        code,
        stdout: binary ? buffer : buffer.toString("utf-8"),
        stderr,
      });
    });
    child.on("error", (err) =>
      resolve({
        code: -1,
        stdout: binary
          ? Buffer.concat(chunks)
          : Buffer.concat(chunks).toString("utf-8"),
        stderr: String(err),
      }),
    );
  });
}

function parseGitHubRepo(url) {
  const m =
    /^(?:https?:\/\/github\.com\/|git@github\.com:|github:)([A-Za-z0-9-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/.exec(
      String(url).trim(),
    );
  if (!m) return null;
  return { owner: m[1], repo: m[2] };
}

// ─────────────────────────────────────────────────────────────────────────────
// SkinService
// ─────────────────────────────────────────────────────────────────────────────

export class SkinService {
  /**
   * @param {object} opts
   * @param {number} opts.skinPort       Port the skin app must listen on
   *                                     (OPENHANDS_SKIN_PORT).
   * @param {string} [opts.home]         State dir (default
   *                                     ~/.openhands/agent-canvas/skin).
   * @param {string} [opts.workspaceDir] Skin checkout dir (default
   *                                     ~/workspace/skin). Lives in the
   *                                     agent's workspace so the agent can
   *                                     edit the running skin in place.
   * @param {string} [opts.agentServerUrl]  e.g. http://127.0.0.1:18000
   * @param {string} [opts.automationUrl]   e.g. http://127.0.0.1:18001
   * @param {string} [opts.sessionApiKey]   key for both backends
   * @param {string} [opts.canvasVersion]   running Agent Canvas version
   * @param {string} [opts.githubToken]     token for private repos / PRs
   */
  constructor(opts) {
    this.skinPort = opts.skinPort;
    this.home =
      opts.home || join(homedir(), ".openhands", "agent-canvas", "skin");
    this.workspaceDir =
      opts.workspaceDir || join(homedir(), "workspace", "skin");
    this.agentServerUrl = opts.agentServerUrl || null;
    this.automationUrl = opts.automationUrl || null;
    this.sessionApiKey = opts.sessionApiKey || null;
    this.canvasVersion = opts.canvasVersion || "dev";
    this.githubToken = opts.githubToken || process.env.GITHUB_TOKEN || null;
    this.child = null;
    this.installProcess = null;
    this.startTask = null;
    this.startGeneration = 0;
    this.restartCount = 0;
    this.stopping = false;
    this.lastError = null;
    this.appError = null;
    this.ready = false;
    this.restartTimer = null;
    mkdirSync(this.home, { recursive: true });
    this.migrateLegacyRepoDir();
    this.appError = this.loadSettings()?.appError || null;
  }

  /** The skin checkout lives in the agent's workspace (persistent volume)
   * so the agent can edit the running skin in place and restart it via
   * POST /skin-api/restart. */
  get repoDir() {
    return this.workspaceDir;
  }

  /** Installs from before the workspace move live in
   * ~/.openhands/agent-canvas/skin/repo — relocate them once. cpSync (not
   * rename): the workspace is typically a different volume. */
  migrateLegacyRepoDir() {
    const legacy = join(this.home, SKIN_REPO_DIR);
    if (
      !existsSync(join(legacy, SKIN_YAML)) ||
      existsSync(join(this.repoDir, SKIN_YAML))
    ) {
      return;
    }
    if (existsSync(this.repoDir) && readdirSync(this.repoDir).length) {
      this.lastError =
        "Legacy skin migration was skipped because the destination contains user files.";
      log(this.lastError);
      return;
    }
    log(`Migrating skin checkout ${legacy} → ${this.repoDir}…`);
    try {
      if (existsSync(this.repoDir)) rmdirSync(this.repoDir);
      cpSync(legacy, this.repoDir, { recursive: true });
      rmSync(legacy, { recursive: true, force: true });
    } catch (err) {
      log(`Skin migration failed: ${err.message}`);
    }
  }

  get settingsPath() {
    return join(this.home, SKIN_SETTINGS_FILE);
  }

  loadSettings() {
    try {
      return JSON.parse(readFileSync(this.settingsPath, "utf-8"));
    } catch {
      return null;
    }
  }

  saveSettings(settings) {
    writeFileSync(this.settingsPath, JSON.stringify(settings, null, 2));
  }

  readSkinYaml(repoDir = this.repoDir) {
    try {
      return yaml.load(readFileSync(join(repoDir, SKIN_YAML), "utf-8"));
    } catch {
      return null;
    }
  }

  isInstalled() {
    return !!this.loadSettings() && existsSync(join(this.repoDir, SKIN_YAML));
  }

  async currentBranch() {
    const res = await runGit(["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: this.repoDir,
    });
    return res.code === 0 ? res.stdout.trim() : null;
  }

  // ── status ────────────────────────────────────────────────────────────────

  async status() {
    if (!this.isInstalled()) {
      return {
        installed: false,
        running: false,
        error: this.appError || this.lastError,
      };
    }
    const settings = this.loadSettings();
    const skin = this.readSkinYaml() || {};
    const declarations = Array.isArray(skin.secrets)
      ? skin.secrets.filter(
          (secret) => secret && typeof secret.name === "string",
        )
      : [];
    return {
      installed: true,
      name: skin.name || "Skin",
      icon: sanitizeIconName(skin.icon),
      screenshot: skin.screenshot || null,
      repoUrl: settings.repoUrl,
      branch: await this.currentBranch(),
      autoPush: !!settings.autoPush,
      applyReport: settings.applyReport || null,
      exportReport: settings.exportReport || null,
      running: !!this.child && this.ready,
      path: this.repoDir,
      port: this.skinPort,
      canvasVersion: this.canvasVersion,
      canvasVersionRange: skin.canvas_version || null,
      secrets: [
        ...declarations,
        ...(settings.applyReport?.missingSecrets || [])
          .filter(
            (name) => !declarations.some((secret) => secret.name === name),
          )
          .map((name) => ({ name })),
      ],
      theme: sanitizeTheme(skin.theme),
      themeVars: themeVars(skin.theme),
      error: this.appError || this.lastError,
    };
  }

  // ── install / uninstall ───────────────────────────────────────────────────

  /** @param {{repoUrl: string, ref?: string, autoPush?: boolean}} params */
  async install(params) {
    const { repoUrl, ref, autoPush = false } = params;
    if (this.isInstalled()) {
      throw new SkinError(
        409,
        "A skin is already installed. Uninstall it first — only one skin can be installed at a time.",
      );
    }
    if (
      typeof repoUrl !== "string" ||
      repoUrl.startsWith("-") ||
      /[\r\n\0]/.test(repoUrl)
    ) {
      throw new SkinError(
        400,
        "Provide a GitHub repository URL or an absolute local Git repository path.",
      );
    }
    if (
      ref !== undefined &&
      (typeof ref !== "string" ||
        !ref ||
        ref.startsWith("-") ||
        /[\r\n\0]/.test(ref))
    ) {
      throw new SkinError(400, "Provide a valid Git branch or tag.");
    }
    let source = repoUrl.trim();
    const github = parseGitHubRepo(source);
    if (github) {
      if (source.startsWith("github:") || source.startsWith("http:"))
        source = `https://github.com/${github.owner}/${github.repo}`;
    } else {
      try {
        if (source.startsWith("file:")) source = fileURLToPath(source);
        if (!isAbsolute(source)) throw new Error("not an absolute path");
        source = realpathSync(source);
        const gitRepo = await runGit(["-C", source, "rev-parse", "--git-dir"]);
        if (gitRepo.code !== 0) throw new Error("not a Git repository");
      } catch {
        throw new SkinError(
          400,
          "Provide a GitHub repository URL or an existing absolute local Git repository path.",
        );
      }
    }
    if (existsSync(this.repoDir) && readdirSync(this.repoDir).length) {
      throw new SkinError(
        409,
        "The configured skin checkout directory already contains files; choose an empty directory.",
      );
    }
    mkdirSync(dirname(this.repoDir), { recursive: true });
    const stagingDir = mkdtempSync(
      join(dirname(this.repoDir), ".skin-install-"),
    );
    const cloneArgs = ["clone", "--depth", "1"];
    if (ref) cloneArgs.push("--branch", ref);
    cloneArgs.push("--", source, stagingDir);
    try {
      const clone = await runGit(cloneArgs, {
        token: github ? this.githubToken : undefined,
      });
      if (clone.code !== 0)
        throw new SkinError(
          502,
          "Cloning the skin repository failed; verify its source and ref.",
        );
      const validationError = this.validateRepo(stagingDir);
      if (validationError) throw new SkinError(422, validationError);
      if (existsSync(this.repoDir)) rmdirSync(this.repoDir);
      renameSync(stagingDir, this.repoDir);
    } finally {
      rmSync(stagingDir, { recursive: true, force: true });
    }

    this.saveSettings({
      repoUrl: source,
      ref: ref || null,
      autoPush: !!autoPush,
      installedAt: new Date().toISOString(),
    });

    const applyReport = await this.applyConfiguration();
    await this.start();
    return { ...(await this.status()), applyReport };
  }

  validateRepo(repoDir = this.repoDir) {
    const skin = this.readSkinYaml(repoDir);
    if (!skin || typeof skin !== "object") {
      return "skin.yaml is missing or invalid at the repository root.";
    }
    if (!skin.name) {
      return "skin.yaml must define a `name`.";
    }
    let pkg;
    try {
      pkg = JSON.parse(readFileSync(join(repoDir, "package.json"), "utf-8"));
    } catch {
      return "package.json is missing or invalid at the repository root.";
    }
    if (!pkg.scripts?.start) {
      return "package.json must define a `start` script (the skin is launched with `npm run start`).";
    }
    if (!existsSync(join(repoDir, "SKILL.md"))) {
      return "SKILL.md is missing at the repository root. Every skin must ship a SKILL.md describing what it does; it is loaded into the agent's context at the start of every conversation.";
    }
    if (!satisfiesCanvasVersion(this.canvasVersion, skin.canvas_version)) {
      return `This skin requires Agent Canvas ${skin.canvas_version}, but this instance is running ${this.canvasVersion}.`;
    }
    return null;
  }

  async uninstall() {
    await this.stop();
    rmSync(this.repoDir, { recursive: true, force: true });
    rmSync(this.settingsPath, { force: true });
    rmSync(this.skillPath, { force: true });
    this.lastError = null;
    return { installed: false, running: false };
  }

  // ── run the skin app ─────────────────────────────────────────────────────

  /** Absolute path of the always-active agent skill synced from the skin
   * repo's SKILL.md. Lives in ~/.openhands/skills/ (a user-skills dir the
   * SDK scans on every conversation start); legacy .md format without
   * `triggers:` means the full content lands in the agent's system prompt. */
  get skillPath() {
    return join(homedir(), ".openhands", "skills", `${SKIN_APP_SKILL_NAME}.md`);
  }

  /** Sync the skin repo's SKILL.md → the always-active skill file. Called on
   * every start (install/restart/pull all funnel through start), so agent
   * edits to the skin's SKILL.md take effect on the next restart. */
  syncSkillMd() {
    const src = join(this.repoDir, "SKILL.md");
    try {
      if (!existsSync(src)) {
        // Required for new installs (validateRepo); tolerated for skins
        // installed before the requirement existed.
        rmSync(this.skillPath, { force: true });
        return;
      }
      const skin = this.readSkinYaml() || {};
      mkdirSync(join(homedir(), ".openhands", "skills"), { recursive: true });
      writeFileSync(
        this.skillPath,
        renderSkinAppSkill(readFileSync(src, "utf-8"), skin.name),
      );
      log(`Synced skin SKILL.md → ${this.skillPath}`);
    } catch (err) {
      log(`Failed to sync skin SKILL.md: ${err.message}`);
    }
  }

  start() {
    if (this.startTask) return this.startTask;
    const task = this.startInstalledSkin(this.startGeneration);
    this.startTask = task;
    task
      .finally(() => {
        if (this.startTask === task) this.startTask = null;
      })
      .catch(() => {});
    return task;
  }

  async startInstalledSkin(generation) {
    if (!this.isInstalled()) return;
    if (this.child) return this.readyPromise;
    this.stopping = false;
    this.syncSkillMd();

    const pkg = JSON.parse(
      readFileSync(join(this.repoDir, "package.json"), "utf-8"),
    );
    if (pkg.dependencies || pkg.devDependencies) {
      log("Running npm install for skin dependencies…");
      await new Promise((resolve, reject) => {
        const npmInstall = spawn(
          "npm",
          ["install", "--omit=dev", "--no-audit", "--no-fund"],
          {
            cwd: this.repoDir,
            detached: process.platform !== "win32",
            stdio: "inherit",
          },
        );
        this.installProcess = npmInstall;
        npmInstall.on("close", (code) => {
          if (this.installProcess === npmInstall) this.installProcess = null;
          if (generation !== this.startGeneration || this.stopping) {
            resolve();
            return;
          }
          if (code === 0) resolve();
          else
            reject(
              new SkinError(
                502,
                "Installing skin dependencies failed. Check the skin log and its package lockfile.",
              ),
            );
        });
        npmInstall.on("error", () =>
          reject(
            new SkinError(
              502,
              "Could not start npm to install skin dependencies.",
            ),
          ),
        );
      }).catch((error) => {
        if (generation === this.startGeneration)
          this.setAppError(error.message);
        throw error;
      });
    }
    if (generation !== this.startGeneration || this.stopping) return;
    return this.spawnSkin();
  }

  spawnSkin() {
    if (this.stopping || this.child) return this.readyPromise;
    this.ready = false;
    this.setAppError(null);
    log(`Starting skin app on port ${this.skinPort} (npm run start)…`);
    const logPath = join(this.home, SKIN_LOG_FILE);
    // detached: the skin runs in its own process group so stop() can kill
    // the whole tree (npm + the actual server), never leaving an orphan
    // holding the port.
    const child = spawn("npm", ["run", "start"], {
      cwd: this.repoDir,
      detached: true,
      env: {
        ...process.env,
        OPENHANDS_SKIN_PORT: String(this.skinPort),
        PORT: String(this.skinPort),
        AGENT_SERVER_URL: this.agentServerUrl || "",
        AUTOMATION_URL: this.automationUrl || "",
        SESSION_API_KEY: this.sessionApiKey || "",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const append = (d) => {
      try {
        writeFileSync(logPath, d, { flag: "a" });
      } catch {
        /* best effort */
      }
    };
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    child.on("close", (code) => {
      if (this.child !== child) return;
      this.child = null;
      this.ready = false;
      if (this.stopping) return;
      const backoff =
        RESTART_BACKOFF_MS[
          Math.min(this.restartCount, RESTART_BACKOFF_MS.length - 1)
        ];
      this.restartCount += 1;
      this.setAppError(
        `Skin app exited with code ${code}; restarting in ${backoff}ms`,
      );
      log(this.appError);
      this.restartTimer = setTimeout(() => {
        this.spawnSkin()?.catch(() => {});
      }, backoff);
      this.restartTimer.unref?.();
    });
    child.on("error", (err) => {
      if (this.child !== child) return;
      this.child = null;
      this.setAppError(`Failed to start skin app: ${err.message}`);
      log(this.appError);
    });
    this.child = child;
    this.readyPromise = this.waitForSkinReady(child);
    this.readyPromise.catch((error) => {
      if (!this.stopping && this.child === child)
        this.setAppError(error.message);
    });
    return this.readyPromise;
  }

  async waitForSkinReady(child) {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      if (this.child !== child || this.stopping)
        throw new SkinError(
          502,
          "Skin app stopped before its HTTP interface was ready.",
        );
      try {
        const response = await fetch(
          `http://127.0.0.1:${this.skinPort}/skin-app/`,
          { redirect: "manual", signal: AbortSignal.timeout(1000) },
        );
        await response.body?.cancel();
        if (response.status >= 200 && response.status < 400) {
          this.ready = true;
          this.setAppError(null);
          return;
        }
      } catch {
        /* The child may still be binding its HTTP port. */
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new SkinError(
      504,
      "Skin app did not serve /skin-app/ within 30 seconds. Check its start command and log.",
    );
  }

  async stop({ timeoutMs = 5000 } = {}) {
    this.stopping = true;
    this.ready = false;
    clearTimeout(this.restartTimer);
    this.restartTimer = null;
    this.startGeneration += 1;
    this.startTask = null;
    const processes = [this.child, this.installProcess].filter(Boolean);
    this.child = null;
    this.installProcess = null;
    await Promise.all(
      processes.map(async (child) => {
        const exited = new Promise((resolve) => {
          child.once("close", resolve);
          setTimeout(resolve, timeoutMs).unref?.();
        });
        try {
          process.kill(-child.pid, "SIGTERM");
        } catch {
          child.kill("SIGTERM");
        }
        await exited;
        // Whatever survived SIGTERM gets the axe — a lingering server would
        // hold the port and make the restarted skin crash-loop on EADDRINUSE.
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {
          /* group already gone */
        }
        // Observe the forced exit before admitting a replacement. The process
        // identity guards also prevent a delayed old event clearing a new child.
        await Promise.race([
          exited,
          new Promise((resolve) => setTimeout(resolve, 250)),
        ]);
      }),
    );
  }

  setAppError(message) {
    this.appError = message;
    if (this.isInstalled())
      this.saveSettings({ ...this.loadSettings(), appError: message });
  }

  /** Cleanly restart the skin app (e.g. after the agent edited the code in
   * the workspace checkout). Re-runs npm install when needed. */
  async restart() {
    this.requireInstalled();
    await this.stop();
    this.restartCount = 0;
    this.lastError = null;
    await this.start();
    return this.status();
  }

  // ── pull / push / auto-push ──────────────────────────────────────────────

  async pull() {
    this.requireInstalled();
    const res = await runGit(["pull", "--ff-only"], {
      cwd: this.repoDir,
      token: this.githubToken,
    });
    if (res.code !== 0) {
      this.lastError =
        "Pull failed. Resolve local Git changes or verify access to the remote repository.";
      throw new SkinError(502, this.lastError);
    }
    const validationError = this.validateRepo();
    if (validationError) {
      this.lastError = validationError;
      throw new SkinError(422, validationError);
    }
    this.lastError = null;
    await this.applyConfiguration();
    await this.stop();
    await this.start();
    return this.status();
  }

  /**
   * Push local skin changes upstream. Prefers pushing straight to the
   * currently checked-out branch (main by default). If push access is
   * missing, falls back to pushing a new branch and opening a pull request.
   * @param {{message?: string, reviewedSource?: boolean, automatic?: boolean}} [options]
   */
  async push({ message, reviewedSource = false, automatic = false } = {}) {
    this.requireInstalled();
    const commitMessage = message || "Update skin (agent-modified)";
    if (typeof commitMessage !== "string")
      throw new SkinError(422, "The Git commit message must be text.");
    const metadataRejected = sanitizeExportData(commitMessage, {
      path: "Git commit message",
    }).rejectedPaths;
    const branch = await this.currentBranch();
    if (!branch || branch === "HEAD")
      throw new SkinError(
        409,
        "Check out a named branch before pushing the skin.",
      );
    const remote = await runGit(
      ["rev-parse", "--verify", `refs/remotes/origin/${branch}`],
      { cwd: this.repoDir },
    );
    const paths = new Set();
    for (const args of [
      ["diff", "--name-only", "-z", "HEAD"],
      ["ls-files", "--others", "--exclude-standard", "-z"],
      remote.code === 0
        ? ["diff", "--name-only", "-z", `origin/${branch}...HEAD`]
        : ["ls-files", "-z"],
    ]) {
      const changed = await runGit(args, { cwd: this.repoDir });
      if (changed.code !== 0)
        throw new SkinError(
          409,
          "Could not inspect changed files before pushing.",
        );
      changed.stdout
        .split("\0")
        .filter(Boolean)
        .forEach((path) => paths.add(path));
    }
    const files = [...paths].map((path) => {
      const absolute = join(this.repoDir, path);
      return {
        path,
        content: existsSync(absolute)
          ? lstatSync(absolute).isSymbolicLink()
            ? readlinkSync(absolute)
            : readFileSync(absolute)
          : null,
      };
    });
    // Inspect each unpublished revision, including blobs removed by a later
    // local commit. A clean final tree does not erase secrets from Git history.
    const outgoing = await runGit(
      ["rev-list", "HEAD", "--not", "--remotes=origin"],
      { cwd: this.repoDir },
    );
    if (outgoing.code !== 0)
      throw new SkinError(409, "Could not inspect outgoing Git history.");
    for (const commit of outgoing.stdout.trim().split("\n").filter(Boolean)) {
      const metadata = await runGit(
        ["show", "--no-patch", "--format=raw", commit],
        { cwd: this.repoDir },
      );
      if (metadata.code !== 0)
        throw new SkinError(409, "Could not inspect outgoing Git metadata.");
      metadataRejected.push(
        ...sanitizeExportData(metadata.stdout, {
          path: `Git commit ${commit} metadata`,
        }).rejectedPaths,
      );
      const changed = await runGit(
        [
          "diff-tree",
          "--root",
          "-m",
          "--no-commit-id",
          "--name-only",
          "-r",
          "-z",
          commit,
        ],
        { cwd: this.repoDir },
      );
      if (changed.code !== 0)
        throw new SkinError(
          409,
          "Could not inspect files in an outgoing commit.",
        );
      for (const path of changed.stdout.split("\0").filter(Boolean)) {
        const blob = await runGit(["show", `${commit}:${path}`], {
          cwd: this.repoDir,
          binary: true,
        });
        if (blob.code === 0) files.push({ path, content: blob.stdout });
        else {
          const deleted = await runGit(["ls-tree", "-z", commit, "--", path], {
            cwd: this.repoDir,
          });
          if (deleted.code !== 0 || deleted.stdout.length)
            throw new SkinError(
              409,
              "Could not inspect a file in outgoing Git history.",
            );
        }
      }
    }
    const safety = inspectSkinFilesForPush(files);
    safety.rejectedPaths.push(...metadataRejected);
    if (safety.rejectedPaths.length)
      return {
        pushed: false,
        reviewRequired: false,
        reviewPaths: safety.rejectedPaths,
        error:
          "Credential material was found in changed files or Git metadata. Remove it before pushing.",
      };
    if (safety.opaquePaths.length && (automatic || !reviewedSource))
      return {
        pushed: false,
        reviewRequired: true,
        reviewPaths: safety.opaquePaths,
        warnings: safety.warnings,
      };

    const identity = await Promise.all(
      ["user.name", "user.email"].map(async (key) => ({
        key,
        result: await runGit(["config", "--get", key], { cwd: this.repoDir }),
      })),
    );
    const overrides = [];
    if (
      identity.some(({ result }) => result.code !== 0 || !result.stdout.trim())
    ) {
      let preferences = {};
      if (this.agentServerUrl) {
        try {
          const settings = await this.backendFetch(
            this.agentServerUrl,
            "/api/settings",
          );
          preferences = settings.misc_settings?.app_preferences || {};
        } catch {
          /* Bot identity remains an explicit service fallback. */
        }
      }
      for (const { key, result } of identity) {
        if (result.code === 0 && result.stdout.trim()) continue;
        const value =
          key === "user.name"
            ? preferences.git_user_name || "OpenHands Skin"
            : preferences.git_user_email || "skin-bot@openhands.local";
        overrides.push("-c", `${key}=${value}`);
      }
    }
    for (const variable of ["GIT_AUTHOR_IDENT", "GIT_COMMITTER_IDENT"]) {
      const identityValue = await runGit([...overrides, "var", variable], {
        cwd: this.repoDir,
      });
      if (identityValue.code !== 0)
        throw new SkinError(409, "Could not inspect the Git commit identity.");
      const checked = sanitizeExportData(identityValue.stdout, {
        path: `Git ${variable}`,
      });
      if (checked.rejectedPaths.length)
        return {
          pushed: false,
          reviewRequired: false,
          reviewPaths: checked.rejectedPaths,
          error:
            "Credential material was found in the Git identity. Remove it before pushing.",
        };
    }
    await runGit(["add", "-A"], { cwd: this.repoDir });
    const commit = await runGit([...overrides, "commit", "-m", commitMessage], {
      cwd: this.repoDir,
    });
    const nothingToCommit =
      commit.code !== 0 && /nothing to commit/i.test(commit.stdout);
    if (commit.code !== 0 && !nothingToCommit) {
      throw new SkinError(
        500,
        "Could not commit the skin changes. Verify the repository's Git user identity.",
      );
    }

    const push = await runGit(["push", "origin", `HEAD:${branch}`], {
      cwd: this.repoDir,
      token: this.githubToken,
    });
    if (push.code === 0) {
      return { pushed: true, branch, pullRequest: null };
    }

    // No push access to the branch — push a topic branch and open a PR.
    const settings = this.loadSettings();
    const gh = parseGitHubRepo(settings.repoUrl);
    if (!gh || !this.githubToken)
      throw new SkinError(
        502,
        "Could not push the skin. Verify access to its remote repository and branch.",
      );
    const topic = `skin-update-${Date.now()}`;
    const pushTopic = await runGit(["push", "origin", `HEAD:${topic}`], {
      cwd: this.repoDir,
      token: this.githubToken,
    });
    if (pushTopic.code !== 0) {
      throw new SkinError(
        502,
        "Could not push the skin. Verify access to its remote repository and branch.",
      );
    }
    const pr = await this.openPullRequest(gh, topic, branch, commitMessage);
    return { pushed: true, branch: topic, pullRequest: pr };
  }

  async openPullRequest(gh, head, base, title) {
    const res = await fetch(
      `https://api.github.com/repos/${gh.owner}/${gh.repo}/pulls`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.githubToken}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          head,
          base,
          body: "Automated skin update pushed from an Agent Canvas instance.\n\n_This pull request was created by an AI agent (OpenHands)._",
        }),
      },
    );
    if (!res.ok) return null;
    const data = await res.json();
    return { url: data.html_url, number: data.number };
  }

  async setAutoPush(autoPush) {
    this.requireInstalled();
    const settings = this.loadSettings();
    settings.autoPush = !!autoPush;
    this.saveSettings(settings);
    return this.status();
  }

  /** Called after the agent modifies the skin; honors the auto-push flag. */
  async autoPushIfEnabled(message) {
    const settings = this.loadSettings();
    if (!settings?.autoPush) return { pushed: false };
    try {
      return await this.push({ message, automatic: true });
    } catch (err) {
      // Auto-push failures must never block the skin from running.
      this.lastError = `Auto-push failed: ${err.message}`;
      log(this.lastError);
      return { pushed: false, error: err.message };
    }
  }

  requireInstalled() {
    if (!this.isInstalled()) {
      throw new SkinError(409, "No skin is installed.");
    }
  }

  // ── backend fetch helpers ─────────────────────────────────────────────────

  async backendFetch(base, path, init = {}) {
    const res = await fetch(`${base}${path}`, {
      ...init,
      redirect: "error",
      headers: {
        "X-Session-API-Key": this.sessionApiKey || "",
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
    });
    if (!res.ok) {
      throw Object.assign(new Error(`${path} -> HTTP ${res.status}`), {
        status: res.status,
      });
    }
    if (res.status === 204 || res.status === 205) return null;
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("json")) return res.json();
    if (contentType.includes("text/")) return res.text();
    return res.arrayBuffer();
  }

  async exportConfiguration() {
    this.requireInstalled();
    return exportSkinConfiguration(this);
  }

  async applyConfiguration() {
    this.requireInstalled();
    return applySkinConfiguration(this);
  }
}

export class SkinError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/**
 * Recursively strip anything that looks like credential material. Masked
 * values from the agent server ("**********") and common secret-ish keys are
 * removed so serialized configs never carry secret values — only names.
 */
export function stripSecretValues(value) {
  if (Array.isArray(value)) return value.map(stripSecretValues);
  if (!value || typeof value !== "object") return value;
  const SECRETISH =
    /(api_?key|token|secret|password|credential|^authorization$|^proxy[-_]authorization$|^cookie$|^set[-_]cookie$)/i;
  const out = {};
  for (const [key, v] of Object.entries(value)) {
    if (v === undefined) continue;
    if (typeof v === "string" && /^\*{4,}$/.test(v)) continue;
    if (SECRETISH.test(key) && typeof v === "string" && v.length > 0) continue;
    out[key] = stripSecretValues(v);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP handler — mounted by static-server.mjs under /skin-api
// ─────────────────────────────────────────────────────────────────────────────

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) reject(new Error("Body too large"));
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new SkinError(400, "Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function send(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(data);
}

/**
 * Create an HTTP handler for /skin-api requests.
 * Mutating requests require the session API key (X-Session-API-Key header),
 * matching how the agent-server and automation backends authenticate.
 */
export function createSkinApiHandler(service) {
  let mutationBusy = false;
  return async function handleSkinApi(req, res, pathname) {
    let ownsMutation = false;
    try {
      const method = req.method || "GET";
      const isThemeRead =
        method === "GET" && pathname === "/skin-api/theme.css";
      if (isThemeRead) {
        // Public like /status: it's a <link> from the skin app, which can't
        // send auth headers. Contains only sanitized colors, no secrets.
        const skin = (service.isInstalled() && service.readSkinYaml()) || {};
        const css = themeCss(skin.theme);
        res.writeHead(200, {
          "Content-Type": "text/css; charset=utf-8",
          "Content-Length": Buffer.byteLength(css),
          "Cache-Control": "no-cache",
        });
        res.end(css);
        return;
      }
      const isStatusRead = method === "GET" && pathname === "/skin-api/status";
      if (!isStatusRead && service.sessionApiKey) {
        const provided = req.headers["x-session-api-key"];
        if (provided !== service.sessionApiKey) {
          send(res, 401, { error: "Invalid or missing X-Session-API-Key" });
          return;
        }
      }

      if (isStatusRead) {
        send(res, 200, await service.status());
        return;
      }
      if (["POST", "PATCH", "DELETE"].includes(method)) {
        if (mutationBusy) {
          send(res, 409, {
            error:
              "A skin operation is already running. Wait for it to finish.",
          });
          return;
        }
        mutationBusy = true;
        ownsMutation = true;
      }
      if (method === "POST" && pathname === "/skin-api/install") {
        const body = await readBody(req);
        send(res, 200, await service.install(body));
        return;
      }
      if (method === "POST" && pathname === "/skin-api/uninstall") {
        send(res, 200, await service.uninstall());
        return;
      }
      if (method === "POST" && pathname === "/skin-api/pull") {
        send(res, 200, await service.pull());
        return;
      }
      if (method === "POST" && pathname === "/skin-api/restart") {
        send(res, 200, await service.restart());
        return;
      }
      if (method === "POST" && pathname === "/skin-api/push") {
        const body = await readBody(req);
        send(res, 200, await service.push(body));
        return;
      }
      if (method === "POST" && pathname === "/skin-api/export") {
        send(res, 200, await service.exportConfiguration());
        return;
      }
      if (method === "POST" && pathname === "/skin-api/apply") {
        send(res, 200, await service.applyConfiguration());
        return;
      }
      if (method === "PATCH" && pathname === "/skin-api/settings") {
        const body = await readBody(req);
        send(res, 200, await service.setAutoPush(body.autoPush));
        return;
      }
      send(res, 404, { error: "Not found" });
    } catch (err) {
      const status = err instanceof SkinError ? err.status : 500;
      send(res, status, { error: err.message });
    } finally {
      if (ownsMutation) mutationBusy = false;
    }
  };
}
