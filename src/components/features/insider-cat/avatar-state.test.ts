import { describe, it, expect } from "vitest";
import { ExecutionStatus } from "#/types/agent-server/core/base/common";
import {
  avatarState,
  avatarStateFromStatus,
  PERK_DURATION_MS,
  type AvatarState,
} from "./avatar-state";

describe("avatarStateFromStatus", () => {
  it.each<[ExecutionStatus, AvatarState]>([
    [ExecutionStatus.RUNNING, "earsUp"],
    [ExecutionStatus.WAITING_FOR_CONFIRMATION, "earsUp"],
    [ExecutionStatus.IDLE, "sleeping"],
    [ExecutionStatus.FINISHED, "sleeping"],
    [ExecutionStatus.PAUSED, "sleeping"],
    [ExecutionStatus.ERROR, "normal"],
    [ExecutionStatus.STUCK, "normal"],
  ])("maps %s -> %s", (status, expected) => {
    expect(avatarStateFromStatus(status)).toBe(expected);
  });

  it("falls back to normal for null/undefined/unknown", () => {
    expect(avatarStateFromStatus(null)).toBe("normal");
    expect(avatarStateFromStatus(undefined)).toBe("normal");
    // Unknown wire value must not throw and must resolve to a real pose.
    expect(avatarStateFromStatus("mystery" as ExecutionStatus)).toBe("normal");
  });

  it("is total over the ExecutionStatus enum", () => {
    for (const status of Object.values(ExecutionStatus)) {
      const pose = avatarStateFromStatus(status);
      expect(["normal", "earsUp", "sleeping"]).toContain(pose);
    }
  });
});

describe("avatarState (with recent user message)", () => {
  it("perks the cat right after a user message even when idle", () => {
    expect(avatarState(ExecutionStatus.IDLE, 0)).toBe("earsUp");
    expect(avatarState(ExecutionStatus.IDLE, PERK_DURATION_MS - 1)).toBe(
      "earsUp",
    );
  });

  it("stops perking once the window has elapsed", () => {
    expect(avatarState(ExecutionStatus.IDLE, PERK_DURATION_MS)).toBe(
      "sleeping",
    );
    expect(avatarState(ExecutionStatus.IDLE, PERK_DURATION_MS + 5000)).toBe(
      "sleeping",
    );
  });

  it("defers to the steady-state mapping when there is no recent message", () => {
    expect(avatarState(ExecutionStatus.RUNNING, null)).toBe("earsUp");
    expect(avatarState(ExecutionStatus.IDLE, null)).toBe("sleeping");
    expect(avatarState(ExecutionStatus.ERROR, null)).toBe("normal");
  });
});
