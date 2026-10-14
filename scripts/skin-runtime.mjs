import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SKIN_APP_PREFIX = "/skin-app";
export const SKIN_API_PREFIX = "/skin-api";

/** Resolve the explicit opt-in and shared port for every local launcher. */
export function resolveSkinPort(args = {}, env = process.env) {
  const enabled =
    args.skin ||
    args.skinPort != null ||
    ["true", "1"].includes(
      String(env.OPENHANDS_ENABLE_SKIN ?? "")
        .trim()
        .toLowerCase(),
    );
  if (!enabled) return null;
  const raw =
    args.skinPort ??
    env.OPENHANDS_SKIN_PORT ??
    JSON.parse(
      readFileSync(
        resolve(
          dirname(fileURLToPath(import.meta.url)),
          "../config/defaults.json",
        ),
        "utf8",
      ),
    ).ports.skin;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      `Skin port must be an integer between 1 and 65535 (got '${raw}').`,
    );
  }
  return port;
}

/** Management keeps the backend key even when HTML injection is disabled. */
export function buildSkinServerArgs(config) {
  if (!config.skinPort) return [];
  return [
    "--skin-port",
    String(config.skinPort),
    "--skin-api-key",
    config.sessionApiKey,
    "--skin-canvas-version",
    config.canvasVersion,
    ...(config.launchAgentServer
      ? [
          "--skin-agent-server-url",
          `http://127.0.0.1:${config.agentServerPort}`,
        ]
      : []),
    ...(config.launchAutomation
      ? ["--skin-automation-url", `http://127.0.0.1:${config.autoBackendPort}`]
      : []),
  ];
}
