import { ExecutionStatus } from "#/types/agent-server/core/base/common";

/**
 * The three visible poses of the insider SmolPaws avatar.
 *
 * - `normal`   — neutral/resting-alert cat: connected, nothing active, or an
 *                error/stuck condition the human should glance at.
 * - `earsUp`   — perked cat: the agent is working, or a user message just
 *                arrived. The "on the hunt" pose.
 * - `sleeping` — the cat is idle/finished/paused: at rest.
 */
export type AvatarState = "normal" | "earsUp" | "sleeping";

/**
 * Map an agent-server execution status to an avatar pose.
 *
 * Pure and total: every {@link ExecutionStatus} and the `null`/unknown case
 * resolve to exactly one pose, so the overlay never has to guess. A recent
 * user message can override this to `earsUp` via
 * {@link avatarState}; this function covers the steady-state mapping.
 */
export function avatarStateFromStatus(
  status: ExecutionStatus | null | undefined,
): AvatarState {
  switch (status) {
    case ExecutionStatus.RUNNING:
    case ExecutionStatus.WAITING_FOR_CONFIRMATION:
      return "earsUp";
    case ExecutionStatus.IDLE:
    case ExecutionStatus.FINISHED:
    case ExecutionStatus.PAUSED:
      return "sleeping";
    case ExecutionStatus.ERROR:
    case ExecutionStatus.STUCK:
      return "normal";
    default:
      return "normal";
  }
}

/** Milliseconds a fresh user message keeps the cat perked. */
export const PERK_DURATION_MS = 4000;

/**
 * Resolve the avatar pose, letting a recent user message perk the cat even
 * when the steady-state status would say otherwise.
 *
 * @param status              current execution status
 * @param msRecentUserMessage ms since the last user message, or `null` if none
 */
export function avatarState(
  status: ExecutionStatus | null | undefined,
  msRecentUserMessage: number | null,
): AvatarState {
  if (msRecentUserMessage !== null && msRecentUserMessage < PERK_DURATION_MS) {
    return "earsUp";
  }
  return avatarStateFromStatus(status);
}
