/**
 * Client-side dispatch for the realtime voice cat's ONE `control_canvas` tool.
 *
 * The voice model (hosted in the persistent Canvas overlay) declares a single
 * UI tool with a `command` enum — the same shape as the app's own
 * `canvas_ui_control` tool — instead of one realtime tool per verb. This module
 * is the overlay-side switch that turns each command into a real Canvas action,
 * mirroring `handleCanvasUIAction` in `services/canvas-ui.ts`.
 *
 * The prompt-box commands act on the Secretary board, which runs as a
 * same-origin iframe under `/skin`. We reach it through a tiny postMessage
 * handshake ({@link postToBoard}) rather than poking its DOM directly, so the
 * contract survives the skin ever going cross-origin. The other commands are
 * plain app actions (router navigate, conversation list) and are injected as
 * dependencies so this dispatcher stays pure and unit-testable.
 */

export interface CanvasControlAction {
  command:
    | "read_prompt_box"
    | "write_prompt_box"
    | "list_conversations"
    | "open_conversation";
  mode?: "set" | "append" | "clear";
  text?: string;
  id?: string;
}

/** One conversation as the voice model needs to hear it — id, title, status. */
export interface VoiceConversation {
  id: string;
  title: string;
  status: string;
}

export interface CanvasControlDeps {
  /**
   * Read/write the Secretary board's prompt box via the iframe postMessage
   * bridge. Returns the box contents (or an error when the board isn't open).
   */
  promptBox: (
    command: "read_prompt_box" | "write_prompt_box",
    mode?: CanvasControlAction["mode"],
    text?: string,
  ) => Promise<{ ok: boolean; value?: string; error?: string }>;
  /** The user's conversations with their execution status. */
  listConversations: () => Promise<VoiceConversation[]>;
  /** Navigate Canvas to a conversation by id. */
  openConversation: (id: string) => void;
}

/**
 * Dispatch one `control_canvas` command. Returns a plain object that is fed
 * back to the realtime model as the tool result, so every branch answers with
 * either data or a clean `error` string (never throws into the voice loop).
 */
export async function handleCanvasControl(
  action: CanvasControlAction,
  deps: CanvasControlDeps,
): Promise<unknown> {
  switch (action.command) {
    case "read_prompt_box":
      return deps.promptBox("read_prompt_box");
    case "write_prompt_box":
      return deps.promptBox("write_prompt_box", action.mode, action.text);
    case "list_conversations": {
      const conversations = await deps.listConversations();
      return { conversations };
    }
    case "open_conversation": {
      if (!action.id) return { error: "open_conversation needs an id" };
      deps.openConversation(action.id);
      return { ok: true, opened: action.id };
    }
    default:
      return {
        error: `unknown command: ${(action as CanvasControlAction).command}`,
      };
  }
}

const BOARD_MESSAGE_SOURCE = "smolpaws-voice";
const BOARD_REPLY_SOURCE = "smolpaws-board";
const BOARD_TIMEOUT_MS = 2000;

/**
 * Ask the Secretary board (same-origin `/skin` iframe) to read or write its
 * prompt box, over a request/reply postMessage handshake. Resolves with a clean
 * error when the board isn't open or doesn't answer in time, so the voice model
 * gets a usable result instead of hanging.
 */
export function postToBoard(
  command: "read_prompt_box" | "write_prompt_box",
  extra: { mode?: CanvasControlAction["mode"]; text?: string } = {},
  findIframe: () => HTMLIFrameElement | null = defaultFindBoardIframe,
): Promise<{ ok: boolean; value?: string; error?: string }> {
  const iframe = findIframe();
  const target = iframe?.contentWindow;
  if (!target) {
    return Promise.resolve({
      ok: false,
      error: "the Secretary board isn't open — ask the user to open it first",
    });
  }

  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener("message", onReply);
      resolve({ ok: false, error: "the board did not respond" });
    }, BOARD_TIMEOUT_MS);

    function onReply(ev: MessageEvent) {
      const msg = ev.data;
      if (msg?.source !== BOARD_REPLY_SOURCE || msg.id !== id) return;
      window.clearTimeout(timer);
      window.removeEventListener("message", onReply);
      resolve({ ok: msg.ok, value: msg.value, error: msg.error });
    }

    window.addEventListener("message", onReply);
    target.postMessage(
      { source: BOARD_MESSAGE_SOURCE, id, command, ...extra },
      "*",
    );
  });
}

/** Locate the installed skin's iframe rendered by the Secretary tab. */
function defaultFindBoardIframe(): HTMLIFrameElement | null {
  return document.querySelector<HTMLIFrameElement>(
    '[data-testid="skin-iframe"]',
  );
}
