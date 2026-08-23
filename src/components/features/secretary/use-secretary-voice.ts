import { useCallback, useRef, useState } from "react";
import { secretaryUrl } from "./secretary-config";

export type VoiceState = "idle" | "connecting" | "live" | "error";

interface VoiceConfig {
  model: string;
  tools: unknown[];
  context: string;
}

/**
 * Realtime voice for the Secretary, driven from odie. Mints an ephemeral token
 * from the secretary server (subscription auth stays server-side), opens a
 * WebRTC call to OpenAI Realtime with the mic, and bridges two tool families:
 * ask_the_agent (the real OpenHands agent brain) and get/set of a prompt box
 * (only meaningful in the Secretary view; harmless elsewhere).
 *
 * `getPromptBox` / `setPromptBox` let the Secretary view wire its textarea; the
 * sidebar single-click passes no-ops (the cat just talks + can run the agent).
 */
export function useSecretaryVoice(opts: {
  getContextPhrase: () => string;
  getPromptBox?: () => string;
  setPromptBox?: (text: string) => void;
}) {
  const [state, setState] = useState<VoiceState>("idle");
  const [error, setError] = useState<string | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const micRef = useRef<MediaStream | null>(null);

  const stop = useCallback(() => {
    dcRef.current?.close();
    pcRef.current?.close();
    micRef.current?.getTracks().forEach((t) => t.stop());
    pcRef.current = null;
    dcRef.current = null;
    micRef.current = null;
    setState("idle");
  }, []);

  const handleEvent = useCallback(
    async (ev: {
      type: string;
      name?: string;
      arguments?: string;
      call_id?: string;
    }) => {
      const dc = dcRef.current;
      if (!dc) return;
      if (ev.type !== "response.function_call_arguments.done") return;

      let args: Record<string, unknown> = {};
      try {
        args = ev.arguments ? JSON.parse(ev.arguments) : {};
      } catch {
        /* leave empty */
      }

      let output: unknown;
      if (ev.name === "get_prompt_box") {
        const box = opts.getPromptBox?.() ?? "";
        output = {
          box,
          empty: box.trim() === "",
          available: !!opts.getPromptBox,
        };
      } else if (ev.name === "set_prompt_box") {
        if (!opts.setPromptBox) {
          output = { error: "no prompt box on this page" };
        } else {
          const cur = opts.getPromptBox?.() ?? "";
          if (args.mode === "clear") opts.setPromptBox("");
          else if (args.mode === "append")
            opts.setPromptBox(cur + String(args.text || ""));
          else opts.setPromptBox(String(args.text || ""));
          output = { ok: true, box: opts.getPromptBox?.() ?? "" };
        }
      } else if (ev.name === "ask_the_agent") {
        try {
          const r = await fetch(secretaryUrl("/api/agent/ask_the_agent"), {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(args),
          });
          const d = await r.json();
          output = d.ok ? d.result : { error: d.error };
        } catch (e) {
          output = { error: String((e as Error).message || e) };
        }
      } else {
        output = { error: `unknown tool ${ev.name}` };
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
    [opts],
  );

  const start = useCallback(async () => {
    setError(null);
    setState("connecting");
    try {
      const cfg: VoiceConfig = await (
        await fetch(secretaryUrl("/api/voice-config"))
      ).json();
      const token = await (
        await fetch(secretaryUrl("/api/realtime/token"), { method: "POST" })
      ).json();
      if (token.error) throw new Error(token.error);

      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      micRef.current = mic;
      const pc = new RTCPeerConnection();
      pcRef.current = pc;
      const audio = new Audio();
      audio.autoplay = true;
      pc.ontrack = (e) => {
        audio.srcObject = e.streams[0];
      };
      mic.getTracks().forEach((t) => pc.addTrack(t, mic));

      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;
      dc.onopen = () => {
        setState("live");
        const instructions = `${cfg.context}\n\n${opts.getContextPhrase()}`;
        dc.send(
          JSON.stringify({
            type: "session.update",
            session: {
              type: "realtime",
              instructions,
              tools: cfg.tools,
              tool_choice: "auto",
            },
          }),
        );
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
      await pc.setRemoteDescription({
        type: "answer",
        sdp: await sdp.text(),
      });
    } catch (e) {
      setError(String((e as Error).message || e));
      setState("error");
      stop();
    }
  }, [handleEvent, opts, stop]);

  const toggle = useCallback(() => {
    if (state === "live" || state === "connecting") stop();
    else start();
  }, [state, start, stop]);

  return { state, error, start, stop, toggle };
}
