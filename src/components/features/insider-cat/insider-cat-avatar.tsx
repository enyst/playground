import React from "react";
import CatNormal from "./avatars/cat-normal.svg?react";
import CatEarsUp from "./avatars/cat-ears-up.svg?react";
import CatSleeping from "./avatars/cat-sleeping.svg?react";
import { type AvatarState } from "./avatar-state";

const POSE_LABEL: Record<AvatarState, string> = {
  normal: "SmolPaws is here",
  earsUp: "SmolPaws is on it",
  sleeping: "SmolPaws is napping",
};

export interface InsiderCatAvatarProps {
  /** Which pose to show. */
  readonly pose: AvatarState;
  /** Click handler — "call the cat". */
  readonly onClick?: () => void;
  /** Size in px (square). Defaults to 56. */
  readonly size?: number;
}

/**
 * Presentational insider-cat avatar. Renders one of three poses and, when
 * `onClick` is provided, acts as the "call the cat" button. Pure: pose is
 * driven from props so it is trivially testable; the live wiring lives in
 * {@link InsiderCatOverlay}.
 */
export function InsiderCatAvatar({
  pose,
  onClick,
  size = 56,
}: InsiderCatAvatarProps) {
  const Cat =
    pose === "earsUp"
      ? CatEarsUp
      : pose === "sleeping"
        ? CatSleeping
        : CatNormal;
  const label = POSE_LABEL[pose];

  return (
    <button
      type="button"
      onClick={onClick}
      data-testid="insider-cat-avatar"
      data-pose={pose}
      aria-label={label}
      title={label}
      className="pointer-events-auto grid place-items-center rounded-full border border-white/10 bg-base/70 shadow-lg backdrop-blur transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary"
      style={{ width: size, height: size }}
    >
      <Cat width={size - 12} height={size - 12} />
    </button>
  );
}
