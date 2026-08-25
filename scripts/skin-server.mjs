/**
 * Standalone skin host for the dev stack.
 *
 * In production (static-server.mjs / Docker) the skin management API and the
 * skin-app reverse proxy are folded into the static file server. The dev stack
 * serves the frontend from Vite and routes everything through ingress.mjs, so
 * there is no static-server to host the skin. This tiny process fills that gap:
 * it stands up the same SkinService + /skin-api handler and reverse-proxies
 * /skin (HTTP + WebSocket) to the running skin app, exactly like static-server
 * does. dev-with-automation.mjs spawns it and points ingress /skin-api and
 * /skin at it, so `npm run dev` gets skins with no behavioural difference from
 * the static path.
 *
 * Usage:
 *   node scripts/skin-server.mjs \
 *     --port 18003 \
 *     --skin-port 18002 \
 *     --skin-agent-server-url http://127.0.0.1:18000 \
 *     --skin-automation-url http://127.0.0.1:18001 \
 *     --skin-canvas-version 1.15.0
 */

import { createServer } from "node:http";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { createProxyHandlers, matchesPathPrefix } from "./proxy-utils.mjs";
import { SkinService, createSkinApiHandler } from "./skin-service.mjs";

const SKIN_API_PREFIX = "/skin-api";
const SKIN_APP_PREFIX = "/skin";

export function parseArgs(argv = process.argv.slice(2)) {
  const config = {
    port: 18003,
    host: "127.0.0.1",
    skinPort: null,
    skinAgentServerUrl: null,
    skinAutomationUrl: null,
    skinCanvasVersion: null,
    sessionApiKey: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    switch (flag) {
      case "-p":
      case "--port":
        config.port = Number.parseInt(argv[++i], 10);
        break;
      case "-H":
      case "--host":
        config.host = argv[++i];
        break;
      case "--skin-port":
        config.skinPort = Number.parseInt(argv[++i], 10);
        break;
      case "--skin-agent-server-url":
        config.skinAgentServerUrl = argv[++i] || null;
        break;
      case "--skin-automation-url":
        config.skinAutomationUrl = argv[++i] || null;
        break;
      case "--skin-canvas-version":
        config.skinCanvasVersion = argv[++i] || null;
        break;
      case "--session-api-key":
        config.sessionApiKey = argv[++i] || null;
        break;
      default:
        throw new Error(`Unknown flag: ${flag}`);
    }
  }
  if (!config.skinPort) {
    throw new Error("--skin-port is required");
  }
  return config;
}

export async function startSkinServer(config) {
  const skinService = new SkinService({
    home: process.env.OPENHANDS_SKIN_STATE_DIR || undefined,
    workspaceDir: process.env.OPENHANDS_SKIN_WORKSPACE_DIR || undefined,
    skinPort: config.skinPort,
    agentServerUrl: config.skinAgentServerUrl,
    automationUrl: config.skinAutomationUrl,
    sessionApiKey: config.sessionApiKey,
    canvasVersion: config.skinCanvasVersion || "dev",
  });
  const skinApiHandler = createSkinApiHandler(skinService);
  const skinTarget = `http://127.0.0.1:${config.skinPort}`;
  if (skinService.isInstalled()) {
    skinService.start().catch((err) => {
      console.error("Failed to start installed skin:", err);
    });
  }

  const proxy = createProxyHandlers({ label: "skin" });

  const server = createServer((req, res) => {
    const url = req.url ?? "/";
    if (matchesPathPrefix(url, SKIN_API_PREFIX)) {
      const pathname = url.split("?", 1)[0];
      skinApiHandler(req, res, pathname);
      return;
    }
    // Normalize bare /skin (no trailing slash) so skins don't have to handle
    // both forms.
    if (url === SKIN_APP_PREFIX || url.startsWith(`${SKIN_APP_PREFIX}?`)) {
      const query = url.slice(SKIN_APP_PREFIX.length);
      res.writeHead(308, { Location: `${SKIN_APP_PREFIX}/${query}` });
      res.end();
      return;
    }
    if (matchesPathPrefix(url, SKIN_APP_PREFIX)) {
      proxy.proxyHttp(req, res, skinTarget);
      return;
    }
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  });

  server.on("upgrade", (req, socket, head) => {
    if (matchesPathPrefix(req.url ?? "/", SKIN_APP_PREFIX)) {
      proxy.proxyWebSocket(req, socket, head, skinTarget);
      return;
    }
    socket.destroy();
  });

  return new Promise((resolveListen) => {
    server.listen(config.port, config.host, () => {
      console.log(
        `Skin host listening on http://${config.host}:${config.port}`,
      );
      console.log(`  ${SKIN_API_PREFIX} -> skin management API`);
      console.log(`  ${SKIN_APP_PREFIX} -> ${skinTarget} (installed skin app)`);
      resolveListen(server);
    });
  });
}

const isMainModule =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  try {
    const config = parseArgs();
    await startSkinServer(config);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
