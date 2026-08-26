import React from "react";
import { useLocation } from "react-router";
import { InsiderCatOverlay } from "./insider-cat-overlay";
import { useCallTheCat } from "./use-call-the-cat";
import { useInsiderVoiceStore } from "./insider-voice-store";

export interface InsiderCatProps {
  /** See {@link InsiderCatOverlay}. `fixed` is the global corner overlay. */
  readonly placement?: "fixed" | "inline";
  readonly size?: number;
}

/**
 * Mountable insider-cat presence (the visible avatar).
 *
 * The realtime-voice session itself is owned by {@link InsiderVoiceHost}, a
 * single always-mounted host, so it keeps running as the human navigates. This
 * avatar just reflects that session (glow + label) and drives it on tap. There
 * can be several avatars (corner + inline) sharing the one session.
 *
 * - `fixed` (root mount): a corner overlay for the home / conversation-list
 *   pages. It hides itself inside a conversation, where the inline cat in the
 *   chat status row takes over — so there's never two cats at once.
 * - `inline` (chat mount): sits next to the agent-status pill above the input.
 */
export function InsiderCat({ placement = "fixed", size }: InsiderCatProps) {
  const callTheCat = useCallTheCat();
  const location = useLocation();
  const voiceState = useInsiderVoiceStore((s) => s.state);
  const voiceError = useInsiderVoiceStore((s) => s.error);
  const voiceAvailable = useInsiderVoiceStore((s) => s.available);
  const toggleVoice = useInsiderVoiceStore((s) => s.toggle);

  if (placement === "fixed" && location.pathname.includes("/conversations/")) {
    return null;
  }

  // When voice is available (a skin serves it), the tap toggles voice and the
  // "+" calls the cat; otherwise the tap just calls the cat.
  return (
    <InsiderCatOverlay
      placement={placement}
      size={size}
      onCall={voiceAvailable ? () => toggleVoice() : () => callTheCat.mutate()}
      onCallTheCat={voiceAvailable ? () => callTheCat.mutate() : undefined}
      voiceState={voiceAvailable ? voiceState : undefined}
      voiceError={voiceError}
    />
  );
}
