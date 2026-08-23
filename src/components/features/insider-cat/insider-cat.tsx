import React from "react";
import { InsiderCatOverlay } from "./insider-cat-overlay";
import { useCallTheCat } from "./use-call-the-cat";

/**
 * Mountable insider-cat presence: the bottom-of-screen avatar wired to the
 * "call the cat" action. Drop once near the app root.
 */
export function InsiderCat() {
  const callTheCat = useCallTheCat();
  return <InsiderCatOverlay onCall={() => callTheCat.mutate()} />;
}
