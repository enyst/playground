import { describe, it, expect } from "vitest";
import { describeLocation } from "./insider-location";

describe("describeLocation", () => {
  it("recognizes an open conversation", () => {
    expect(describeLocation("/conversations/abc-123")).toBe(
      "a conversation is open",
    );
  });

  it("recognizes the home page", () => {
    expect(describeLocation("/")).toBe("the home / new-chat page");
    expect(describeLocation("/conversations")).toBe(
      "the home / new-chat page",
    );
  });

  it("recognizes the Secretary board", () => {
    expect(describeLocation("/skin")).toBe("the Secretary board");
  });

  it("recognizes settings pages", () => {
    expect(describeLocation("/settings/llm")).toBe("the LLM settings page");
    expect(describeLocation("/settings/agents")).toBe(
      "the Agent Profiles settings",
    );
  });

  it("falls back to the raw path for unknown routes", () => {
    expect(describeLocation("/something-else")).toBe(
      "the page at /something-else",
    );
  });
});
