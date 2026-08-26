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

  it("pins to the corner in fixed placement (default)", () => {
    render(<InsiderCatOverlay />);
    expect(screen.getByTestId("insider-cat-overlay").className).toContain(
      "fixed",
    );
  });

  it("drops the fixed wrapper in inline placement", () => {
    render(<InsiderCatOverlay placement="inline" />);
    const overlay = screen.getByTestId("insider-cat-overlay");
    expect(overlay.className).not.toContain("fixed");
    expect(overlay.className).toContain("inline-flex");
  });

  it("shows a voice label when a session is live", () => {
    render(<InsiderCatOverlay voiceState="live" />);
    expect(screen.getByTestId("insider-cat-voice-label")).toHaveTextContent(
      "listening",
    );
  });

  it("hides the voice label when idle", () => {
    render(<InsiderCatOverlay voiceState="idle" />);
    expect(
      screen.queryByTestId("insider-cat-voice-label"),
    ).not.toBeInTheDocument();
  });

  it("renders the call-the-cat affordance only when its handler is given", () => {
    const { rerender } = render(<InsiderCatOverlay />);
    expect(
      screen.queryByTestId("insider-cat-new-conversation"),
    ).not.toBeInTheDocument();

    const onCallTheCat = vi.fn();
    rerender(<InsiderCatOverlay onCallTheCat={onCallTheCat} />);
    expect(
      screen.getByTestId("insider-cat-new-conversation"),
    ).toBeInTheDocument();
  });

  it("taps the cat (primary) and the + (secondary) independently", async () => {
    const onCall = vi.fn();
    const onCallTheCat = vi.fn();
    const user = userEvent.setup();
    render(
      <InsiderCatOverlay
        voiceState="idle"
        onCall={onCall}
        onCallTheCat={onCallTheCat}
      />,
    );
    await user.click(screen.getByTestId("insider-cat-avatar"));
    expect(onCall).toHaveBeenCalledOnce();
    expect(onCallTheCat).not.toHaveBeenCalled();

    await user.click(screen.getByTestId("insider-cat-new-conversation"));
    expect(onCallTheCat).toHaveBeenCalledOnce();
  });
});
