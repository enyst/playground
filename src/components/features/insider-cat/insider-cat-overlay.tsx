import React from "react";
import { useConversationStateStore } from "#/stores/conversation-state-store";
import { InsiderCatAvatar } from "./insider-cat-avatar";
import { avatarState } from "./avatar-state";
import type { InsiderVoiceState } from "./use-insider-voice";

export interface InsiderCatOverlayProps {
  /**
   * Called when the human taps the cat. When {@link voiceState} is provided the
   * tap toggles realtime voice; otherwise it falls back to "call the cat".
   * Wiring lives at the mount site so this component stays presentational.
   */
  readonly onCall?: () => void;
  /**
   * Secondary action — "call the cat" (open a fresh tagged conversation) — when
   * the primary tap is bound to voice. Rendered as a small "+" affordance.
   */
  readonly onCallTheCat?: () => void;
  /**
   * Realtime voice state, when the overlay hosts voice. Drives the live glow
   * and the status label. Absent = the overlay is a plain launcher.
   */
  readonly voiceState?: InsiderVoiceState;
  /** Voice error text, shown under the cat when {@link voiceState} is "error". */
  readonly voiceError?: string | null;
  /**
   * Timestamp (ms) of the last user message, or null. Lets the cat perk up
   * briefly when the human speaks. Optional; the overlay works from execution
   * status alone when absent.
   */
  readonly lastUserMessageAt?: number | null;
  /**
   * `fixed` (default) pins the cat to the bottom-right corner as a global
   * overlay. `inline` drops the fixed wrapper so the cat can sit in normal
   * flow — e.g. next to the agent-status pill above the chat input.
   */
  readonly placement?: "fixed" | "inline";
  /** Avatar size in px. Defaults to 56 (fixed) — callers may shrink for inline. */
  readonly size?: number;
}

const VOICE_LABEL: Record<InsiderVoiceState, string> = {
  idle: "",
  connecting: "connecting…",
  live: "listening — talk to me",
  error: "voice error",
};

/**
 * Bottom-of-screen SmolPaws presence. Reads the live agent execution status
 * from the conversation-state store, maps it to a pose, and renders the
 * clickable cat. No backend of its own — it rides the existing websocket
 * status already mirrored into the store.
 */
export function InsiderCatOverlay({
  onCall,
  onCallTheCat,
  voiceState,
  voiceError = null,
  lastUserMessageAt = null,
  placement = "fixed",
  size,
}: InsiderCatOverlayProps) {
  const executionStatus = useConversationStateStore((s) => s.execution_status);

  // Re-render as the perk window elapses so the pose settles back down.
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (lastUserMessageAt == null) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [lastUserMessageAt]);

  const msSinceUserMessage =
    lastUserMessageAt == null ? null : now - lastUserMessageAt;
  const pose = avatarState(executionStatus, msSinceUserMessage);

  const wrapperClass =
    placement === "inline"
      ? "pointer-events-none inline-flex flex-col items-center gap-1"
      : "pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col items-end gap-1";

  const live = voiceState === "live";
  const connecting = voiceState === "connecting";
  const label =
    voiceState && voiceState !== "idle" ? VOICE_LABEL[voiceState] : null;

  return (
    <div data-testid="insider-cat-overlay" className={wrapperClass}>
      {label ? (
        <span
          data-testid="insider-cat-voice-label"
          className={`pointer-events-none rounded-full px-2 py-0.5 text-xs shadow ${
            voiceState === "error"
              ? "bg-red-500/90 text-white"
              : "bg-base/80 text-content backdrop-blur"
          }`}
          title={voiceState === "error" && voiceError ? voiceError : undefined}
        >
          🎙 {label}
        </span>
      ) : null}
      <div
        className={`relative rounded-full transition-shadow ${
          live
            ? "shadow-[0_0_18px_4px_rgba(74,222,128,0.7)]"
            : connecting
              ? "shadow-[0_0_12px_2px_rgba(74,160,255,0.6)] animate-pulse"
              : ""
        }`}
      >
        <InsiderCatAvatar
          pose={pose}
          onClick={onCall}
          size={size ?? (placement === "inline" ? 32 : 56)}
        />
        {onCallTheCat ? (
          <button
            type="button"
            onClick={onCallTheCat}
            data-testid="insider-cat-new-conversation"
            aria-label="Call the cat in a new conversation"
            title="New SmolPaws conversation"
            className="pointer-events-auto absolute -right-1 -top-1 grid size-5 place-items-center rounded-full border border-white/20 bg-primary text-[11px] font-bold leading-none text-white shadow hover:scale-110 focus:outline-none focus:ring-2 focus:ring-primary"
          >
            +
          </button>
        ) : null}
      </div>
    </div>
  );
}
