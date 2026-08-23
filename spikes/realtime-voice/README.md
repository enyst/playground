# Realtime voice spike — path A (smolpaws-3e1.1)

A throwaway harness to answer one question: **does "path A" feel good enough to
build on?** Path A = an OpenAI Realtime model is the conversational brain and
*function-calls into our OpenHands agent* for real actions.

This is a spike. It lives outside `src/` on its own branch (`spike/realtime-voice`)
so it never pollutes the clean insider-cat feature. Delete it once the decision
is made, or graft the proven pieces into `insider-cat/`.

## What it proves (the four points from the bead)

1. **Full-duplex + barge-in** — WebRTC carries mic up and cat audio down at the
   same time; server-side VAD lets you interrupt mid-sentence.
2. **Transcripts, both sides** — the user's words
   (`conversation.item.input_audio_transcription.completed`) and the cat's reply
   (`response.output_audio_transcript.done`) are written into the transcript
   panel. This is the raw material for the chat record (bead 3e1.2).
3. **Function-call → real action** — the model calls a tool, the browser
   forwards it to our tiny server, the server runs it against the **real local
   OpenHands agent-server**, and the result is spoken back.
4. **Latency + cost** — each turn logs round-trip ms and the `usage` token
   counts (incl. audio tokens) from `response.done`.

## Shape

```
browser (client.html/js)                     server.mjs (node, 127.0.0.1:8790)
  mic ──WebRTC audio──▶ OpenAI Realtime        POST /api/realtime/token
  cat audio ◀──────────┘  │                      └ mint ephemeral ek_… (key stays server-side)
  data channel ◀── events ┘                     POST /api/agent/:tool
    │  transcripts → panel                         └ run real action vs agent-server, return JSON
    └  tool call → POST /api/agent/:tool ──────────▶ GET /api/conversations/count  (etc.)
```

The standing OpenAI key never reaches the browser: the server mints a
short-lived ephemeral `ek_…` client secret; the browser only does the WebRTC
SDP exchange with it.

## Tools wired

- **`ask_the_agent(request)`** — the important one. Hands the request to the
  **real OpenHands agent** via the agent-server's OpenAI-compatible
  `POST /v1/chat/completions`. That endpoint runs the *whole agent* (system
  prompt + its tools) as an LLM: it executes commands, calls APIs, inspects and
  manages conversations — anything the agent can do — and returns a final spoken
  answer. So the realtime model is the **voice brain** and the OpenHands agent
  is the **action brain**. This replaces a fixed toolbox with the agent's entire
  capability (Engel's "replace its brain").
- `count_conversations` / `list_recent_conversations` — kept as fast, read-only
  shortcuts (direct REST, ~3–40 ms) for the common "how many / which" questions,
  so the voice doesn't pay the full agent round-trip for a trivial lookup.

**Latency note:** `ask_the_agent` runs a full agent turn — measured ~12 s for
"how many conversations" (the agent really did the work → "1,174"). That's too
slow to sit silently through in a voice UX. The design covers the fix: stream
`/v1/chat/completions` (`stream: true`, which the endpoint supports) and/or have
the cat say a quick "let me check…" filler while the agent works. The fast
read-only shortcuts exist for exactly the common cases where 12 s is overkill.

## Run it (live test — needs a mic + a human)

```bash
# 1. An OpenHands agent-server must be running with conversations. The Agent
#    Canvas dev backend on :18100 writes its key to ~/.openhands/agent-canvas/api-key.txt.
#    Override with AGENT_SERVER_URL / AGENT_SERVER_KEY if you use another.

# 2. Start the spike server. It authenticates Realtime with the ChatGPT
#    subscription via ~/.codex/auth.json (run `codex login` once), and falls
#    back to OPENAI_API_KEY_BORIS in the keychain if that's absent.
node spikes/realtime-voice/server.mjs

# 3. Open http://127.0.0.1:8790/ in Chrome, click "Start talking", allow the mic.
#    Try: "how many conversations do I have?"  then interrupt it mid-reply.
```

Env knobs: `SPIKE_PORT` (8790), `SPIKE_MODEL` (`gpt-realtime`), `SPIKE_VOICE`
(`cedar`), `AGENT_SERVER_URL`, `AGENT_SERVER_KEY`, `OPENAI_API_KEY`.

## Status / findings

Verified headlessly (no mic needed):

- ✅ Ephemeral token mint against the **current** API,
  `POST /v1/realtime/client_secrets` (the old `/v1/realtime/sessions` is gone).
- ✅ **Auth uses Engel's ChatGPT subscription, not an API key.** The Codex login
  at `~/.codex/auth.json` (`auth_mode: chatgpt`, Pro plan) mints Realtime tokens
  when we send its OAuth access token + a `chatgpt-account-id` header — so the
  spike runs on the subscription with no per-token API billing. The server reads
  that file fresh at each mint (Codex keeps it refreshed) and prefers it.
  The UI/log shows which path minted (`_auth: chatgpt | apikey`).
- ✅ API-key **fallback**: if the subscription token is missing/expired, it falls
  back to `OPENAI_API_KEY_BORIS` in the `openhands` keychain service. (The
  standing `OPENAI_API_KEY` there is **dead** — OpenAI rejects it.) Realtime
  models available: `gpt-realtime`, `gpt-realtime-2.1`, `-mini`, etc.
- ✅ `count_conversations` → real count (34) in ~3 ms against :18100.
- ✅ `list_recent_conversations` → real recent list via `/search?limit` in
  ~40 ms. (Plain `/api/conversations` needs explicit `ids`; the full-payload
  `/search` hangs on big pages, so we always pass a small `limit`.)
- ✅ **`ask_the_agent` → the real agent brain.** `/v1/chat/completions` on the
  agent-server runs the full OpenHands agent as an OpenAI-compatible LLM: it
  executed a shell command and answered "how many conversations" with the real
  number (1,174). Streaming (`stream: true`) works too. ~12 s per full turn →
  needs streaming + a spoken filler for voice (see latency note).

**Live test result (Engel, 2026-08-23):** grabbed the mic — the realtime voice
itself is **good**. The valid critique that drove this update: the cat could
only call the two hardcoded tools, not the agent. Now fixed via `ask_the_agent`.

## Recommendation input (A vs B)

Path A (realtime model as brain) **feels good** on the first live test. Open
item is latency of the full agent turn (~12 s), addressed by streaming + filler.
Path B (a pipeline: STT → our agent → TTS) stays the fallback only if A's feel
degrades. Leaning A.
