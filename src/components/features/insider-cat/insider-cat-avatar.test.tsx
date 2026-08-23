import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InsiderCatAvatar } from "./insider-cat-avatar";

describe("InsiderCatAvatar", () => {
  it("renders the requested pose", () => {
    const { rerender } = render(<InsiderCatAvatar pose="normal" />);
    expect(screen.getByTestId("insider-cat-avatar")).toHaveAttribute(
      "data-pose",
      "normal",
    );

    rerender(<InsiderCatAvatar pose="earsUp" />);
    expect(screen.getByTestId("insider-cat-avatar")).toHaveAttribute(
      "data-pose",
      "earsUp",
    );

    rerender(<InsiderCatAvatar pose="sleeping" />);
    expect(screen.getByTestId("insider-cat-avatar")).toHaveAttribute(
      "data-pose",
      "sleeping",
    );
  });

  it("exposes an accessible label that reflects the pose", () => {
    render(<InsiderCatAvatar pose="earsUp" />);
    expect(
      screen.getByRole("button", { name: "SmolPaws is on it" }),
    ).toBeInTheDocument();
  });

  it("calls onClick when the cat is tapped", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<InsiderCatAvatar pose="normal" onClick={onClick} />);

    await user.click(screen.getByTestId("insider-cat-avatar"));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
