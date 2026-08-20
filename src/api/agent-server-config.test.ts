import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_WORKING_DIR,
  buildConversationWorkingDir,
  buildRelativeConversationWorkingDir,
} from "./agent-server-config";

describe("buildRelativeConversationWorkingDir", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("ignores a baked absolute VITE_WORKING_DIR and stays relative", () => {
    vi.stubEnv("VITE_WORKING_DIR", "/Users/someone/.openhands/workspaces");
    expect(buildRelativeConversationWorkingDir("abc-123")).toBe(
      `${DEFAULT_WORKING_DIR}/abc123`,
    );
  });

  it("strips dashes from the conversation id", () => {
    expect(buildRelativeConversationWorkingDir("a-b-c")).toBe(
      `${DEFAULT_WORKING_DIR}/abc`,
    );
  });
});

describe("buildConversationWorkingDir (baked default)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses a baked absolute dir as the base", () => {
    vi.stubEnv("VITE_WORKING_DIR", "/Users/someone/workspaces");
    expect(buildConversationWorkingDir("abc-123")).toBe(
      "/Users/someone/workspaces/abc123",
    );
  });

  it("falls back to the relative default when nothing is baked", () => {
    vi.stubEnv("VITE_WORKING_DIR", "");
    expect(buildConversationWorkingDir("abc-123")).toBe(
      `${DEFAULT_WORKING_DIR}/abc123`,
    );
  });
});
