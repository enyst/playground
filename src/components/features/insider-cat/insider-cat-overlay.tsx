import React from "react";
import { useConversationStateStore } from "#/stores/conversation-state-store";
import { InsiderCatAvatar } from "./insider-cat-avatar";
import { avatarState } from "./avatar-state";

export interface InsiderCatOverlayProps {
  /**
   * Called when the human taps the cat ("call the cat"). Wiring to
   * conversation creation lives at the mount site so this component stays
   * presentational and testable.
   */
  readonly onCall?: () => void;
  /**
   * Timestamp (ms) of the last user message, or null. Lets the cat perk up
   * briefly when the human speaks. Optional; the overlay works from execution
   * status alone when absent.
   */
  readonly lastUserMessageAt?: number | null;
}

/**
 * Bottom-of-screen SmolPaws presence. Reads the live agent execution status
 * from the conversation-state store, maps it to a pose, and renders the
 * clickable cat. No backend of its own — it rides the existing websocket
 * status already mirrored into the store.
 */
export function InsiderCatOverlay({
  onCall,
  lastUserMessageAt = null,
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

  return (
    <div
      data-testid="insider-cat-overlay"
      className="pointer-events-none fixed bottom-4 right-4 z-50"
    >
      <InsiderCatAvatar pose={pose} onClick={onCall} />
    </div>
  );
}
