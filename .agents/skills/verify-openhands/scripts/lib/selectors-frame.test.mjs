import { describe, expect, it, vi } from "vitest";
import { buildLocator, toCss } from "./selectors.mjs";

describe("iframe selectors", () => {
  it.each(["testid=skin-iframe", 'iframe[title="QA Demo Skin"]'])(
    "targets a control inside %s",
    (iframeSelector) => {
      const button = {};
      const frame = { getByRole: vi.fn(() => button) };
      const iframe = { contentFrame: vi.fn(() => frame) };
      const page = {
        getByTestId: vi.fn(() => iframe),
        locator: vi.fn(() => iframe),
        getByRole: vi.fn(),
      };

      const result = buildLocator(
        page,
        `frame=${iframeSelector} >> role=button[name="Check skin API"][exact]`,
      );

      expect(result).toBe(button);
      expect(iframe.contentFrame).toHaveBeenCalledOnce();
      expect(frame.getByRole).toHaveBeenCalledWith("button", {
        name: "Check skin API",
        exact: true,
      });
      expect(page.getByRole).not.toHaveBeenCalled();
    },
  );

  it("keeps frame observations out of top-level CSS polling", () => {
    expect(
      toCss("frame=testid=skin-iframe >> testid=demo-api-result"),
    ).toBeNull();
  });

  it("rejects a missing iframe selector", () => {
    expect(() => buildLocator({}, "frame= >> testid=button")).toThrow(
      "frame= requires an iframe selector",
    );
  });
});
