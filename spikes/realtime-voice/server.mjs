// Realtime-voice spike server (smolpaws-3e1.1, path A).
//
// Two jobs, both tiny:
//   1. POST /api/realtime/token  — mint a short-lived OpenAI Realtime client
//      secret (ek_...) so the standing API key never reaches the browser.
//   2. POST /api/agent/:tool     — the "function-call into our agent" bridge.
//      The realtime model calls a tool; the browser forwards it here; we run
//      the real action against the local OpenHands agent-server and return the
//      result. This is what proves point 3 of the spike: voice -> real action.
//
// Everything is local-only (127.0.0.1) and read-only against the agent-server
// for now (count/list), so the spike cannot do anything destructive.
//
// Run: node spikes/realtime-voice/server.mjs
// Keys come from the macOS Keychain at start (see resolveSecrets), never the
// browser, never committed.

import { createServer } from "node:http";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const PORT = Number(process.env.SPIKE_PORT || 8790);
const REALTIME_MODEL = process.env.SPIKE_MODEL || "gpt-realtime";
// Voice: one of alloy, ash, ballad, coral, echo, sage, shimmer, verse, cedar, marin.
const VOICE = process.env.SPIKE_VOICE || "cedar";

// --- secrets, resolved once at boot -----------------------------------------

function keychain(service, account) {
  try {
    return execFileSync(
      "security",
      ["find-generic-password", "-s", service, "-a", account, "-w"],
      { encoding: "utf8" },
    ).trim();
  } catch {
    return "";
  }
}

function resolveSecrets() {
  // The standing OPENAI_API_KEY in the keychain is dead; OPENAI_API_KEY_BORIS
  // is the working key with Realtime access. Prefer an explicit env override,
  // then Boris, then the standing key as a last resort.
  const openaiKey =
    process.env.OPENAI_API_KEY ||
    keychain("openhands", "OPENAI_API_KEY_BORIS") ||
    keychain("openhands", "OPENAI_API_KEY");

  // Agent-server the tool actions run against. The Agent Canvas dev backend
  // writes its session key here; default to the demo backend on :18100.
  let agentKey = process.env.AGENT_SERVER_KEY || "";
  if (!agentKey) {
    try {
      agentKey = readFileSync(
        join(homedir(), ".openhands", "agent-canvas", "api-key.txt"),
        "utf8",
      ).trim();
    } catch {
      /* no canvas key file; leave empty */
    }
  }
  const agentBase =
    process.env.AGENT_SERVER_URL || "http://127.0.0.1:18100";

  return { openaiKey, agentKey, agentBase };
}

const SECRETS = resolveSecrets();
if (!SECRETS.openaiKey) {
  console.error(
    "[spike] No OpenAI key found. Set OPENAI_API_KEY or add OPENAI_API_KEY_BORIS to the 'openhands' keychain service.",
  );
  process.exit(1);
}

// --- the tools the realtime model may call ----------------------------------
//
// Keep them read-only for the spike. Each returns a small JSON object that the
// model can speak back. `schema` is the OpenAI tool definition sent to the
// browser so the model knows the tools exist.

const TOOLS = {
  count_conversations: {
    schema: {
      type: "function",
      name: "count_conversations",
      description:
        "Count how many conversations the user has on this OpenHands backend. Use when the user asks how many conversations, chats, or sessions they have.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
    async run() {
      const n = await agentGet("/api/conversations/count");
      return { count: typeof n === "number" ? n : n?.count ?? n };
    },
  },
  list_recent_conversations: {
    schema: {
      type: "function",
      name: "list_recent_conversations",
      description:
        "List the user's most recent conversations (id + title) on this OpenHands backend. Use when the user asks what they were working on or to name their recent chats.",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "integer",
            description: "How many to return (default 5, max 20).",
          },
        },
        additionalProperties: false,
      },
    },
    async run(args) {
      // Use /search with a small limit. The full-payload search hangs on big
      // pages (that's a known agent-server issue), but a tiny limit is fine.
      const limit = Math.min(Math.max(Number(args?.limit) || 5, 1), 20);
      const data = await agentGet(`/api/conversations/search?limit=${limit}`);
      const items = Array.isArray(data?.items) ? data.items : [];
      return {
        conversations: items.slice(0, limit).map((c) => ({
          id: c.id,
          title: c.title || "(untitled)",
          status: c.execution_status,
        })),
      };
    },
  },
};

async function agentGet(path) {
  if (!SECRETS.agentKey) {
    throw new Error(
      "No agent-server session key (looked for ~/.openhands/agent-canvas/api-key.txt or AGENT_SERVER_KEY).",
    );
  }
  const res = await fetch(`${SECRETS.agentBase}${path}`, {
    headers: { "X-Session-API-Key": SECRETS.agentKey },
  });
  if (!res.ok) {
    throw new Error(`agent-server ${path} -> ${res.status}`);
  }
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text.trim();
  }
}

// --- HTTP plumbing -----------------------------------------------------------

function send(res, status, body, type = "application/json") {
  const payload =
    type === "application/json" ? JSON.stringify(body) : body;
  res.writeHead(status, {
    "content-type": type,
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,OPTIONS",
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
  });
}

async function mintToken() {
  // Current API: POST /v1/realtime/client_secrets returns { value: "ek_...", ... }
  // The session config (model, voice, transcription, tools) is set here so the
  // ephemeral secret is already scoped; the browser only does the SDP dance.
  const res = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: {
      authorization: `Bearer ${SECRETS.openaiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      session: {
        type: "realtime",
        model: REALTIME_MODEL,
        audio: {
          output: { voice: VOICE },
          input: {
            transcription: { model: "gpt-4o-mini-transcribe" },
          },
        },
      },
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || `mint failed ${res.status}`);
  }
  return data;
}

const staticFiles = {
  "/": ["client.html", "text/html; charset=utf-8"],
  "/client.html": ["client.html", "text/html; charset=utf-8"],
  "/client.js": ["client.js", "text/javascript; charset=utf-8"],
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === "OPTIONS") return send(res, 204, "");

  if (req.method === "GET" && staticFiles[url.pathname]) {
    const [file, type] = staticFiles[url.pathname];
    try {
      const body = readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
      return send(res, 200, body, type);
    } catch {
      return send(res, 404, { error: "not found" });
    }
  }

  if (req.method === "GET" && url.pathname === "/api/config") {
    return send(res, 200, {
      model: REALTIME_MODEL,
      voice: VOICE,
      agentBase: SECRETS.agentBase,
      hasAgentKey: Boolean(SECRETS.agentKey),
      tools: Object.values(TOOLS).map((t) => t.schema),
    });
  }

  if (req.method === "POST" && url.pathname === "/api/realtime/token") {
    try {
      const token = await mintToken();
      return send(res, 200, token);
    } catch (err) {
      return send(res, 502, { error: String(err.message || err) });
    }
  }

  if (req.method === "POST" && url.pathname.startsWith("/api/agent/")) {
    const tool = url.pathname.slice("/api/agent/".length);
    const impl = TOOLS[tool];
    if (!impl) return send(res, 404, { error: `unknown tool ${tool}` });
    const args = await readBody(req);
    const startedAt = Date.now();
    try {
      const result = await impl.run(args);
      return send(res, 200, { ok: true, ms: Date.now() - startedAt, result });
    } catch (err) {
      return send(res, 502, {
        ok: false,
        ms: Date.now() - startedAt,
        error: String(err.message || err),
      });
    }
  }

  return send(res, 404, { error: "not found" });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[spike] realtime-voice server on http://127.0.0.1:${PORT}`);
  console.log(`[spike] model=${REALTIME_MODEL} voice=${VOICE}`);
  console.log(
    `[spike] agent-server=${SECRETS.agentBase} key=${SECRETS.agentKey ? "yes" : "MISSING"}`,
  );
  console.log(`[spike] open http://127.0.0.1:${PORT}/ in Chrome, then talk.`);
});
