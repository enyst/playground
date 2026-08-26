import { afterEach, describe, expect, it, vi } from "vitest";
import {
  handleCanvasControl,
  postToBoard,
  type CanvasControlDeps,
} from "./canvas-voice-control";

function deps(overrides: Partial<CanvasControlDeps> = {}): CanvasControlDeps {
  return {
    promptBox: vi.fn().mockResolvedValue({ ok: true, value: "hi" }),
    listConversations: vi.fn().mockResolvedValue([]),
    openConversation: vi.fn(),
    ...overrides,
  };
}

describe("handleCanvasControl", () => {
  it("read_prompt_box delegates to the prompt-box bridge", async () => {
    const d = deps();
    const out = await handleCanvasControl({ command: "read_prompt_box" }, d);
    expect(d.promptBox).toHaveBeenCalledWith("read_prompt_box");
    expect(out).toEqual({ ok: true, value: "hi" });
  });

  it("write_prompt_box passes mode and text through", async () => {
    const d = deps();
    await handleCanvasControl(
      { command: "write_prompt_box", mode: "append", text: " world" },
      d,
    );
    expect(d.promptBox).toHaveBeenCalledWith(
      "write_prompt_box",
      "append",
      " world",
    );
  });

  it("list_conversations wraps the list in { conversations }", async () => {
    const d = deps({
      listConversations: vi
        .fn()
        .mockResolvedValue([{ id: "c1", title: "T", status: "running" }]),
    });
    const out = await handleCanvasControl({ command: "list_conversations" }, d);
    expect(out).toEqual({
      conversations: [{ id: "c1", title: "T", status: "running" }],
    });
  });

  it("open_conversation navigates and acks", async () => {
    const d = deps();
    const out = await handleCanvasControl(
      { command: "open_conversation", id: "abc" },
      d,
    );
    expect(d.openConversation).toHaveBeenCalledWith("abc");
    expect(out).toEqual({ ok: true, opened: "abc" });
  });

  it("open_conversation without an id returns an error, does not navigate", async () => {
    const d = deps();
    const out = await handleCanvasControl({ command: "open_conversation" }, d);
    expect(d.openConversation).not.toHaveBeenCalled();
    expect(out).toEqual({ error: "open_conversation needs an id" });
  });

  it("unknown command returns a clean error", async () => {
    const d = deps();
    const out = await handleCanvasControl({ command: "explode" } as never, d);
    expect(out).toEqual({ error: "unknown command: explode" });
  });
});

describe("postToBoard", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns a clean error when the board iframe is not present", async () => {
    const out = await postToBoard("read_prompt_box", {}, () => null);
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/isn't open/);
  });

  it("posts to the iframe and resolves with the board's reply", async () => {
    // Fake iframe whose contentWindow captures the outgoing message and lets
    // the test drive the reply, exercising the request/reply handshake.
    let posted: { source: string; id: string; command: string } | null = null;
    const iframe = {
      contentWindow: {
        postMessage: (msg: typeof posted) => {
          posted = msg;
        },
      },
    } as unknown as HTMLIFrameElement;

    const promise = postToBoard("read_prompt_box", {}, () => iframe);

    // Let the microtask that registers the listener + posts run.
    await Promise.resolve();
    expect(posted).not.toBeNull();
    expect(posted!.source).toBe("smolpaws-voice");

    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          source: "smolpaws-board",
          id: posted!.id,
          ok: true,
          value: "box text",
        },
      }),
    );

    const out = await promise;
    expect(out).toEqual({ ok: true, value: "box text", error: undefined });
  });

  it("times out cleanly when the board never replies", async () => {
    vi.useFakeTimers();
    const iframe = {
      contentWindow: { postMessage: () => {} },
    } as unknown as HTMLIFrameElement;

    const promise = postToBoard("read_prompt_box", {}, () => iframe);
    await vi.advanceTimersByTimeAsync(2100);
    const out = await promise;
    expect(out).toEqual({ ok: false, error: "the board did not respond" });
    vi.useRealTimers();
  });
});
