import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExecutionStatus } from "#/types/agent-server/core/base/common";
import { useConversationStateStore } from "#/stores/conversation-state-store";
import { InsiderCatOverlay } from "./insider-cat-overlay";

afterEach(() => {
  act(() => useConversationStateStore.getState().reset());
});

describe("InsiderCatOverlay", () => {
  it("shows the sleeping pose when the agent is idle", () => {
    act(() =>
      useConversationStateStore
        .getState()
        .setExecutionStatus(ExecutionStatus.IDLE),
    );
    render(<InsiderCatOverlay />);
    expect(screen.getByTestId("insider-cat-avatar")).toHaveAttribute(
      "data-pose",
      "sleeping",
    );
  });

  it("perks up (earsUp) when the agent is running", () => {
    render(<InsiderCatOverlay />);
    act(() =>
      useConversationStateStore
        .getState()
        .setExecutionStatus(ExecutionStatus.RUNNING),
    );
    expect(screen.getByTestId("insider-cat-avatar")).toHaveAttribute(
      "data-pose",
      "earsUp",
    );
  });

  it("perks up right after a user message even while idle", () => {
    act(() =>
      useConversationStateStore
        .getState()
        .setExecutionStatus(ExecutionStatus.IDLE),
    );
    render(<InsiderCatOverlay lastUserMessageAt={Date.now()} />);
    expect(screen.getByTestId("insider-cat-avatar")).toHaveAttribute(
      "data-pose",
      "earsUp",
    );
  });

  it("calls onCall when the cat is tapped", async () => {
    const onCall = vi.fn();
    const user = userEvent.setup();
    render(<InsiderCatOverlay onCall={onCall} />);
    await user.click(screen.getByTestId("insider-cat-avatar"));
    expect(onCall).toHaveBeenCalledOnce();
  });
});
