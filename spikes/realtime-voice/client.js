// Realtime-voice spike client (smolpaws-3e1.1, path A).
//
// Full-duplex voice with OpenAI Realtime over WebRTC:
//   - mic -> peer connection (model hears you, barge-in is native to WebRTC)
//   - model audio -> <audio> element (you hear the cat)
//   - a data channel carries events: transcripts + tool calls
//
// It proves the four spike points in one page:
//   1. full-duplex + barge-in   -> WebRTC audio both ways, server VAD
//   2. transcripts both sides    -> written into the transcript panel
//   3. function-call -> action   -> tool calls forwarded to /api/agent/:tool
//   4. latency + cost            -> per-turn timing + usage from response.done

const els = {
  start: document.getElementById("start"),
  stop: document.getElementById("stop"),
  status: document.getElementById("status"),
  transcript: document.getElementById("transcript"),
  events: document.getElementById("events"),
  audio: document.getElementById("cat-audio"),
  meta: document.getElementById("meta"),
};

let pc = null;
let dc = null;
let micStream = null;
let config = null;
const timers = {}; // response_id -> t0 for latency

function setStatus(text, kind = "") {
  els.status.textContent = text;
  els.status.className = `status ${kind}`;
}

function logEvent(line) {
  const div = document.createElement("div");
  div.className = "evrow";
  div.textContent = `${new Date().toLocaleTimeString()}  ${line}`;
  els.events.prepend(div);
}

function addTurn(role, text, sub = "") {
  const row = document.createElement("div");
  row.className = `turn ${role}`;
  const who = document.createElement("span");
  who.className = "who";
  who.textContent = role === "user" ? "🗣️ you" : role === "assistant" ? "🐾 cat" : "⚙️ tool";
  const body = document.createElement("span");
  body.className = "body";
  body.textContent = text;
  row.append(who, body);
  if (sub) {
    const s = document.createElement("span");
    s.className = "sub";
    s.textContent = sub;
    row.append(s);
  }
  els.transcript.prepend(row);
  return body;
}

async function start() {
  els.start.disabled = true;
  setStatus("minting token…");
  try {
    config = await (await fetch("/api/config")).json();
    els.meta.textContent = `model ${config.model} · voice ${config.voice} · agent ${config.agentBase} · key ${config.hasAgentKey ? "ok" : "MISSING"}`;

    const tokenResp = await fetch("/api/realtime/token", { method: "POST" });
    const token = await tokenResp.json();
    if (!tokenResp.ok) throw new Error(token.error || "token mint failed");
    const ephemeral = token.value;

    setStatus("getting microphone…");
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });

    pc = new RTCPeerConnection();
    pc.ontrack = (e) => {
      els.audio.srcObject = e.streams[0];
    };
    pc.oniceconnectionstatechange = () =>
      logEvent(`ice: ${pc.iceConnectionState}`);
    micStream.getTracks().forEach((t) => pc.addTrack(t, micStream));

    dc = pc.createDataChannel("oai-events");
    dc.onopen = () => {
      setStatus("connected — talk to the cat", "ok");
      logEvent("data channel open");
      configureSession();
    };
    dc.onmessage = (e) => handleEvent(JSON.parse(e.data));

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    setStatus("connecting to realtime…");
    const sdpResp = await fetch(
      `https://api.openai.com/v1/realtime/calls?model=${encodeURIComponent(config.model)}`,
      {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${ephemeral}`,
          "Content-Type": "application/sdp",
        },
      },
    );
    if (!sdpResp.ok) throw new Error(`SDP exchange ${sdpResp.status}`);
    const answer = { type: "answer", sdp: await sdpResp.text() };
    await pc.setRemoteDescription(answer);

    els.stop.disabled = false;
  } catch (err) {
    setStatus(`error: ${err.message}`, "err");
    logEvent(`start failed: ${err.message}`);
    els.start.disabled = false;
    stop();
  }
}

// Register the tools + a smolpaws-ish persona once the channel is open.
function configureSession() {
  const update = {
    type: "session.update",
    session: {
      type: "realtime",
      instructions:
        "You are SmolPaws, a small, calm, lightly mischievous cat agent living inside OpenHands. " +
        "Speak briefly and warmly. When the user asks about their conversations, chats, or what they were working on, " +
        "CALL the matching tool instead of guessing, then tell them the result in one short sentence. Never read raw JSON aloud.",
      tools: config.tools,
      tool_choice: "auto",
    },
  };
  dc.send(JSON.stringify(update));
  logEvent(`session.update sent (${config.tools.length} tools)`);
}

async function handleEvent(ev) {
  switch (ev.type) {
    case "input_audio_buffer.speech_started":
      logEvent("you started speaking (barge-in ready)");
      break;

    case "conversation.item.input_audio_transcription.completed":
      addTurn("user", ev.transcript?.trim() || "(…)");
      break;

    case "response.created":
      timers[ev.response?.id] = performance.now();
      break;

    case "response.output_audio_transcript.done":
    case "response.audio_transcript.done":
      addTurn("assistant", ev.transcript?.trim() || "(…)");
      break;

    case "response.function_call_arguments.done":
      await runTool(ev);
      break;

    case "response.done": {
      const t0 = timers[ev.response?.id];
      const ms = t0 ? Math.round(performance.now() - t0) : null;
      const u = ev.response?.usage;
      const bits = [];
      if (ms != null) bits.push(`${ms}ms`);
      if (u) {
        bits.push(
          `in ${u.input_tokens ?? "?"} / out ${u.output_tokens ?? "?"} tok`,
        );
        const a = u.input_token_details?.audio_tokens;
        const ta = u.output_token_details?.audio_tokens;
        if (a != null || ta != null)
          bits.push(`audio in ${a ?? "?"} / out ${ta ?? "?"}`);
      }
      if (bits.length) logEvent(`response.done — ${bits.join(" · ")}`);
      break;
    }

    case "error":
      logEvent(`ERROR ${ev.error?.message || JSON.stringify(ev.error)}`);
      setStatus(`realtime error: ${ev.error?.message || "?"}`, "err");
      break;

    default:
      // Uncomment for the firehose:
      // logEvent(ev.type);
      break;
  }
}

// A tool call arrived from the model -> run the real action via our server ->
// hand the result back so the model can speak it.
async function runTool(ev) {
  const name = ev.name;
  let args = {};
  try {
    args = ev.arguments ? JSON.parse(ev.arguments) : {};
  } catch {
    /* leave empty */
  }
  const t0 = performance.now();
  addTurn("tool", `${name}(${ev.arguments || ""}) …`);
  let payload;
  try {
    const resp = await fetch(`/api/agent/${name}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(args),
    });
    payload = await resp.json();
  } catch (err) {
    payload = { ok: false, error: String(err.message || err) };
  }
  const ms = Math.round(performance.now() - t0);
  logEvent(
    `tool ${name} -> ${payload.ok ? "ok" : "FAIL"} in ${ms}ms (agent ${payload.ms ?? "?"}ms)`,
  );

  // Feed the result back into the conversation, then ask for a spoken reply.
  dc.send(
    JSON.stringify({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: ev.call_id,
        output: JSON.stringify(payload.ok ? payload.result : { error: payload.error }),
      },
    }),
  );
  dc.send(JSON.stringify({ type: "response.create" }));
}

function stop() {
  els.stop.disabled = true;
  if (dc) try { dc.close(); } catch {}
  if (pc) try { pc.close(); } catch {}
  if (micStream) micStream.getTracks().forEach((t) => t.stop());
  pc = dc = micStream = null;
  setStatus("stopped");
  els.start.disabled = false;
}

els.start.addEventListener("click", start);
els.stop.addEventListener("click", stop);
