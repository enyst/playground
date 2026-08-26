import { useCallback, useEffect, useRef, useState } from "react";

export type InsiderVoiceState = "idle" | "connecting" | "live" | "error";

interface VoiceConfig {
  model: string;
  tools: unknown[];
  context: string;
}

// The voice backend is the installed Secretary skin, reached on the Canvas
// origin through the /skin reverse proxy. Keeping it here means the realtime
// token mint (which needs a server-side secret) and the agent brain stay in
// the skin server; the overlay is a pure client. If no skin is installed, the
// voice-config fetch fails and the hook stays idle.
const SKIN_API = "/skin/api";

// Persisted spoken transcript so the cat keeps context across reloads. Unlike
// the in-iframe board (which is torn down on navigation), this overlay lives in
// the persistent Canvas shell and survives route changes — so the live session
// itself no longer drops when you move between conversations. The transcript is
// still persisted as a belt-and-suspenders continuity across full reloads.
const VOICE_MEM_KEY = "insider.voice.transcript.v1";
const VOICE_MEM_MAX = 40;

type Line = { role: "user" | "assistant"; text: string };

function loadTranscript(): Line[] {
  try {
    return JSON.parse(localStorage.getItem(VOICE_MEM_KEY) || "[]");
  } catch {
    return [];
  }
}
function saveTranscript(lines: Line[]) {
  try {
    localStorage.setItem(
      VOICE_MEM_KEY,
      JSON.stringify(lines.slice(-VOICE_MEM_MAX)),
    );
  } catch {
    /* storage disabled — best effort */
  }
}
function pushTranscript(role: Line["role"], text: string) {
  const t = String(text || "").trim();
  if (!t) return;
  const lines = loadTranscript();
  lines.push({ role, text: t });
  saveTranscript(lines);
}
function transcriptForPrompt(): string {
  const lines = loadTranscript();
  if (!lines.length) return "";
  const body = lines
    .map((l) => `${l.role === "user" ? "Human" : "You"}: ${l.text}`)
    .join("\n");
  return (
    "\n\nEARLIER IN THIS SESSION (you remember this; continue naturally, " +
    "do NOT greet as if new):\n" +
    body
  );
}

/**
 * Realtime voice for the insider cat, hosted in the persistent Canvas overlay.
 *
 * Mints an ephemeral token from the installed skin server (subscription auth
 * stays server-side), opens a WebRTC call to OpenAI Realtime with the mic, and
 * bridges two tools: `ask_the_agent` to the real OpenHands agent brain (a
 * server round-trip), and `control_canvas` to the local Canvas UI via
 * `onControl` (navigate, list conversations, drive the board's prompt box). The
 * `getContext` callback lets the mount site tell the cat where the user is
 * (which conversation / page), so "continue this" makes sense.
 */
export function useInsiderVoice(opts: {
  getContext: () => string;
  onControl: (args: Record<string, unknown>) => Promise<unknown>;
}) {
  const [state, setState] = useState<InsiderVoiceState>("idle");
  const [error, setError] = useState<string | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const getContextRef = useRef(opts.getContext);
  getContextRef.current = opts.getContext;
  const onControlRef = useRef(opts.onControl);
  onControlRef.current = opts.onControl;

  const stop = useCallback(() => {
    dcRef.current?.close();
    pcRef.current?.close();
    micRef.current?.getTracks().forEach((t) => t.stop());
    if (audioRef.current) {
      audioRef.current.srcObject = null;
      audioRef.current = null;
    }
    pcRef.current = null;
    dcRef.current = null;
    micRef.current = null;
    setState("idle");
  }, []);

  // Always release the mic / peer connection if the app unmounts.
  useEffect(() => stop, [stop]);

  const handleEvent = useCallback(
    async (ev: {
      type: string;
      name?: string;
      arguments?: string;
      call_id?: string;
      transcript?: string;
    }) => {
      const dc = dcRef.current;
      if (!dc) return;

      // Persist both sides of the spoken conversation.
      if (
        ev.type === "conversation.item.input_audio_transcription.completed" &&
        ev.transcript
      ) {
        pushTranscript("user", ev.transcript);
        return;
      }
      if (
        (ev.type === "response.output_audio_transcript.done" ||
          ev.type === "response.audio_transcript.done") &&
        ev.transcript
      ) {
        pushTranscript("assistant", ev.transcript);
        return;
      }

      if (ev.type !== "response.function_call_arguments.done") return;

      let args: Record<string, unknown> = {};
      try {
        args = ev.arguments ? JSON.parse(ev.arguments) : {};
      } catch {
        /* leave empty */
      }

      let output: unknown;
      if (ev.name === "ask_the_agent") {
        // The full agent answer comes back here and is fed to the voice model,
        // which speaks a spoken rephrase. The written answer is the record.
        try {
          const r = await fetch(`${SKIN_API}/agent/ask_the_agent`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(args),
          });
          const d = await r.json();
          output = d.ok ? d.result : { error: d.error };
        } catch (e) {
          output = { error: String((e as Error).message || e) };
        }
      } else if (ev.name === "control_canvas") {
        // Drive the Canvas UI locally: navigate, list conversations, or reach
        // the board's prompt box. Handled in the overlay (this app), never a
        // server round-trip. onControl always resolves to a plain result.
        try {
          output = await onControlRef.current(args);
        } catch (e) {
          output = { error: String((e as Error).message || e) };
        }
      } else {
        // Unknown tool name — answer cleanly so the model doesn't error-loop.
        output = { error: `unknown tool: ${ev.name}` };
      }

      dc.send(
        JSON.stringify({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: ev.call_id,
            output: JSON.stringify(output),
          },
        }),
      );
      dc.send(JSON.stringify({ type: "response.create" }));
    },
    [],
  );

  const start = useCallback(async () => {
    setError(null);
    setState("connecting");
    try {
      const cfg: VoiceConfig = await (
        await fetch(`${SKIN_API}/voice-config`)
      ).json();
      const token = await (
        await fetch(`${SKIN_API}/realtime/token`, { method: "POST" })
      ).json();
      if (token.error) throw new Error(token.error);

      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      micRef.current = mic;
      const pc = new RTCPeerConnection();
      pcRef.current = pc;
      const audio = new Audio();
      audio.autoplay = true;
      audioRef.current = audio;
      pc.ontrack = (e) => {
        audio.srcObject = e.streams[0];
      };
      mic.getTracks().forEach((t) => pc.addTrack(t, mic));

      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;
      dc.onopen = () => {
        setState("live");
        const resumed = loadTranscript().length > 0;
        const instructions =
          cfg.context +
          transcriptForPrompt() +
          `\n\nWhere the human is right now: ${getContextRef.current()}`;
        dc.send(
          JSON.stringify({
            type: "session.update",
            session: {
              type: "realtime",
              instructions,
              tools: cfg.tools,
              tool_choice: "auto",
              audio: {
                input: { transcription: { model: "gpt-4o-mini-transcribe" } },
              },
            },
          }),
        );
        if (resumed) dc.send(JSON.stringify({ type: "response.create" }));
      };
      dc.onmessage = (e) => handleEvent(JSON.parse(e.data));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const sdp = await fetch(
        `https://api.openai.com/v1/realtime/calls?model=${encodeURIComponent(cfg.model)}`,
        {
          method: "POST",
          body: offer.sdp,
          headers: {
            Authorization: `Bearer ${token.value}`,
            "Content-Type": "application/sdp",
          },
        },
      );
      if (!sdp.ok) throw new Error(`SDP exchange ${sdp.status}`);
      await pc.setRemoteDescription({ type: "answer", sdp: await sdp.text() });
    } catch (e) {
      setError(String((e as Error).message || e));
      setState("error");
      stop();
    }
  }, [handleEvent, stop]);

  const toggle = useCallback(() => {
    if (state === "live" || state === "connecting") stop();
    else start();
  }, [state, start, stop]);

  return { state, error, start, stop, toggle };
}
