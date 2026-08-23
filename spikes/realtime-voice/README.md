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

## Tools wired (read-only, safe)

- `count_conversations` → `GET /api/conversations/count`
- `list_recent_conversations` → `GET /api/conversations/search?limit=N`

Both are read-only on purpose, so a voice slip can't do anything destructive.
Adding a write action later (archive, send-a-message-to-another-conversation) is
a one-function change in `server.mjs`.

## Run it (live test — needs a mic + a human)

```bash
# 1. An OpenHands agent-server must be running with conversations. The Agent
#    Canvas dev backend on :18100 writes its key to ~/.openhands/agent-canvas/api-key.txt.
#    Override with AGENT_SERVER_URL / AGENT_SERVER_KEY if you use another.

# 2. Start the spike server (reads OPENAI_API_KEY_BORIS from the keychain):
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
- ✅ Working key is `OPENAI_API_KEY_BORIS` in the `openhands` keychain service.
  The standing `OPENAI_API_KEY` is **dead** (OpenAI rejects it). Realtime models
  available on Boris: `gpt-realtime`, `gpt-realtime-2.1`, `-mini`, etc.
- ✅ `count_conversations` → real count (34) in ~3 ms against :18100.
- ✅ `list_recent_conversations` → real recent list via `/search?limit` in
  ~40 ms. (Plain `/api/conversations` needs explicit `ids`; the full-payload
  `/search` hangs on big pages, so we always pass a small `limit`.)

Still needs the **live test with Engel** (bead 3e1.3) — only a real mic can
answer whether full-duplex + barge-in *feel* good and what the end-to-end voice
latency actually is. The harness logs everything needed to judge it.

## Recommendation input (A vs B)

Fill in after the live test. Path B (a pipeline: STT → our agent → TTS) is the
fallback if A's latency or interruption feel is poor. The transcript + usage
panel here is meant to make that call on evidence, not vibes.
