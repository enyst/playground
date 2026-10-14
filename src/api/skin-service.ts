/**
 * Client for the skin management API mounted by scripts/static-server.mjs at
 * /skin-api (same origin as the served frontend, outside the /canvas base
 * path). A "skin" is a git-backed package that reconfigures this instance
 * and serves a custom web app that becomes the default tab of the UI.
 */

import { getAgentServerSessionApiKey } from "./agent-server-config";
import { getActiveBackend } from "./backend-registry/active-store";
import type { Backend } from "./backend-registry/types";

export const SKIN_API_BASE = "/skin-api";
export const SKIN_PAGE_PATH = "/skin";
export const SKIN_APP_BASE = "/skin-app";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Skins configure the instance serving Canvas, so remote backends cannot own them. */
export function isSkinBackend(backend: Backend): boolean {
  if (
    backend.kind !== "local" ||
    backend.marsSessionId ||
    typeof window === "undefined"
  )
    return false;
  try {
    const target = new URL(backend.host);
    const instance = new URL(window.location.origin);
    // A path-prefixed proxy reaches another Agent Server even on this origin.
    if (target.pathname !== "/" || target.search || target.hash) return false;
    return (
      target.origin === instance.origin ||
      (LOOPBACK_HOSTS.has(target.hostname) &&
        LOOPBACK_HOSTS.has(instance.hostname) &&
        target.protocol === instance.protocol &&
        target.port === instance.port)
    );
  } catch {
    return false;
  }
}

export interface SkinSecretDeclaration {
  name: string;
  description?: string;
}

/** Major theme colors a skin may declare in skin.yaml (`theme:`). */
export interface SkinTheme {
  accent?: string;
  background?: string;
  surface?: string;
  text?: string;
  muted?: string;
  border?: string;
  success?: string;
  warning?: string;
  danger?: string;
}

export interface SkinStatus {
  /** False when this launcher has not enabled the skin service. */
  available?: boolean;
  installed: boolean;
  running: boolean;
  name?: string;
  /** Lucide icon name (kebab-case, e.g. "activity") declared in skin.yaml,
   * shown on the skin's left-hand nav entry. Validated server-side; null
   * means "use the default skin icon". */
  icon?: string | null;
  screenshot?: string | null;
  repoUrl?: string;
  branch?: string | null;
  autoPush?: boolean;
  port?: number;
  canvasVersion?: string;
  canvasVersionRange?: string | null;
  secrets?: SkinSecretDeclaration[];
  theme?: SkinTheme | null;
  /**
   * Full set of CSS custom properties derived server-side from `theme`
   * (single source of truth in scripts/skin-service.mjs). Applied verbatim
   * to document.documentElement to retheme the whole Canvas UI.
   */
  themeVars?: Record<string, string> | null;
  error?: string | null;
  path?: string;
  operation?: string | null;
  applyReport?: SkinConfigurationReport;
  exportReport?: SkinConfigurationReport;
}

export interface SkinConfigurationReport {
  complete: boolean;
  applied?: string[];
  exported?: string[];
  skipped?: string[];
  errors?: string[];
  warnings?: string[];
  missingSecrets?: string[];
  opaquePaths?: string[];
  rejectedPaths?: string[];
}

export interface SkinPushResult {
  pushed: boolean;
  branch?: string;
  pullRequest?: { url: string; number: number } | null;
  error?: string;
  reviewRequired?: boolean;
  reviewPaths?: string[];
}

export class SkinUnsupportedError extends Error {}

export class SkinRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function skinFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { backend } = getActiveBackend();
  if (init.method && init.method !== "GET" && !isSkinBackend(backend)) {
    throw new Error(
      "Select the backend hosting this Canvas instance to manage its skin.",
    );
  }
  const sessionApiKey = isSkinBackend(backend)
    ? backend.apiKey || getAgentServerSessionApiKey()
    : getAgentServerSessionApiKey();
  const response = await fetch(`${SKIN_API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(sessionApiKey ? { "X-Session-API-Key": sessionApiKey } : {}),
      ...(init.headers || {}),
    },
  });
  const body = await response.json().catch(() => null);
  if (path === "/status" && response.status === 404) {
    throw new SkinUnsupportedError("Skin support is not enabled.");
  }
  if (!response.ok) {
    throw new SkinRequestError(
      (body as { error?: string } | null)?.error || `HTTP ${response.status}`,
      response.status,
    );
  }
  if (path === "/status" && typeof body?.installed !== "boolean") {
    throw new SkinUnsupportedError("Skin support is not enabled.");
  }
  if (!body)
    throw new SkinRequestError("Invalid skin API response.", response.status);
  return body as T;
}

export class SkinService {
  static getStatus(): Promise<SkinStatus> {
    return skinFetch<SkinStatus>("/status");
  }

  static install(params: {
    repoUrl: string;
    ref?: string;
    autoPush?: boolean;
  }): Promise<SkinStatus> {
    return skinFetch<SkinStatus>("/install", {
      method: "POST",
      body: JSON.stringify(params),
    });
  }

  static uninstall(): Promise<SkinStatus> {
    return skinFetch<SkinStatus>("/uninstall", { method: "POST" });
  }

  static pull(): Promise<SkinStatus> {
    return skinFetch<SkinStatus>("/pull", { method: "POST" });
  }

  static push(
    params: { message?: string; reviewedSource?: boolean } = {},
  ): Promise<SkinPushResult> {
    return skinFetch<SkinPushResult>("/push", {
      method: "POST",
      body: JSON.stringify(params),
    });
  }

  static async exportConfiguration(): Promise<SkinConfigurationReport> {
    const result = await skinFetch<{ report: SkinConfigurationReport }>(
      "/export",
      { method: "POST" },
    );
    return result.report;
  }

  static applyConfiguration(): Promise<SkinConfigurationReport> {
    return skinFetch<SkinConfigurationReport>("/apply", { method: "POST" });
  }

  static restart(): Promise<SkinStatus> {
    return skinFetch<SkinStatus>("/restart", { method: "POST" });
  }

  static setAutoPush(autoPush: boolean): Promise<SkinStatus> {
    return skinFetch<SkinStatus>("/settings", {
      method: "PATCH",
      body: JSON.stringify({ autoPush }),
    });
  }
}
