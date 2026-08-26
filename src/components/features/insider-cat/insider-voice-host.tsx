import React from "react";
import { useLocation } from "react-router";
import { useSkinStatus } from "#/hooks/query/use-skin";
import { useInsiderVoice } from "./use-insider-voice";
import { useInsiderVoiceStore } from "./insider-voice-store";
import { describeLocation } from "./insider-location";

/**
 * Owns the single realtime-voice session and keeps it alive across navigation.
 *
 * Mounted exactly once in the persistent app shell (root.tsx). It runs the
 * voice hook and mirrors its state + `toggle` into {@link useInsiderVoiceStore}
 * so any cat avatar can drive and reflect the session without owning it. It
 * renders nothing — the only DOM the session needs (an <audio> element) lives
 * inside the hook.
 */
export function InsiderVoiceHost() {
  const location = useLocation();
  const locationRef = React.useRef(location.pathname);
  locationRef.current = location.pathname;

  const { data: skinStatus } = useSkinStatus();
  const available = Boolean(skinStatus?.installed);

  const voice = useInsiderVoice({
    getContext: () => describeLocation(locationRef.current),
  });

  const sync = useInsiderVoiceStore((s) => s.sync);
  React.useEffect(() => {
    sync({
      state: voice.state,
      error: voice.error,
      available,
      toggle: voice.toggle,
    });
  }, [voice.state, voice.error, voice.toggle, available, sync]);

  return null;
}
