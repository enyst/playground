import React from "react";
import { useLocation } from "react-router";
import { InsiderCatOverlay } from "./insider-cat-overlay";
import { useCallTheCat } from "./use-call-the-cat";

export interface InsiderCatProps {
  /** See {@link InsiderCatOverlay}. `fixed` is the global corner overlay. */
  readonly placement?: "fixed" | "inline";
  readonly size?: number;
}

/**
 * Mountable insider-cat presence wired to the "call the cat" action.
 *
 * - `fixed` (root mount): a corner overlay for the home / conversation-list
 *   pages. It hides itself inside a conversation, where the inline cat in the
 *   chat status row takes over — so there's never two cats at once.
 * - `inline` (chat mount): sits next to the agent-status pill above the input.
 */
export function InsiderCat({ placement = "fixed", size }: InsiderCatProps) {
  const callTheCat = useCallTheCat();
  const location = useLocation();

  if (placement === "fixed" && location.pathname.includes("/conversations/")) {
    return null;
  }

  return (
    <InsiderCatOverlay
      placement={placement}
      size={size}
      onCall={() => callTheCat.mutate()}
    />
  );
}
