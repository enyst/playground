import { describe, it, expect } from "vitest";
import {
  buildCallTheCatOptions,
  isInsiderCatConversation,
  SMOLPAWS_TAG_KEY,
  SMOLPAWS_TAG_VALUE_INSIDER,
} from "./call-the-cat";

describe("buildCallTheCatOptions", () => {
  it("always stamps the insider tag", () => {
    const opts = buildCallTheCatOptions();
    expect(opts.tags).toEqual({
      [SMOLPAWS_TAG_KEY]: SMOLPAWS_TAG_VALUE_INSIDER,
    });
  });

  it("omits agentProfileId when none is given (works before the profile exists)", () => {
    const opts = buildCallTheCatOptions();
    expect(opts.agentProfileId).toBeUndefined();
  });

  it("threads agentProfileId when provided", () => {
    const opts = buildCallTheCatOptions({ agentProfileId: "abc-123" });
    expect(opts.agentProfileId).toBe("abc-123");
    expect(opts.tags[SMOLPAWS_TAG_KEY]).toBe(SMOLPAWS_TAG_VALUE_INSIDER);
  });

  it("passes an initial message through when provided", () => {
    const opts = buildCallTheCatOptions({ initialUserMsg: "hey smolpaws" });
    expect(opts.initialUserMsg).toBe("hey smolpaws");
  });

  it("uses lowercase tag key and value (agent-server rule)", () => {
    expect(SMOLPAWS_TAG_KEY).toBe(SMOLPAWS_TAG_KEY.toLowerCase());
    expect(SMOLPAWS_TAG_VALUE_INSIDER).toBe(
      SMOLPAWS_TAG_VALUE_INSIDER.toLowerCase(),
    );
  });
});

describe("isInsiderCatConversation", () => {
  it("recognizes the insider tag", () => {
    expect(isInsiderCatConversation({ smolpaws: "insider" })).toBe(true);
  });

  it("rejects other tags / missing / null", () => {
    expect(isInsiderCatConversation({ smolpaws: "whatsapp" })).toBe(false);
    expect(isInsiderCatConversation({ origin: "slack" })).toBe(false);
    expect(isInsiderCatConversation(null)).toBe(false);
    expect(isInsiderCatConversation(undefined)).toBe(false);
  });
});
