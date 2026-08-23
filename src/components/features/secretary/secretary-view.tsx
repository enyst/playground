/* eslint-disable i18next/no-literal-string -- prototype view (smolpaws-s9e.8);
   copy is not yet lifted into the 15-language i18n bundle. */
import React from "react";
import { useSearchParams } from "react-router";
import { useNavigation } from "#/context/navigation-context";
import { secretaryUrl } from "./secretary-config";
import { SecretaryCatIcon } from "./secretary-cat-icon";
import { useSecretaryVoice } from "./use-secretary-voice";

/**
 * The Secretary view (`/secretary`). Shows the title of the conversation the
 * user came from (clicking it returns to that conversation) and a prompt box.
 * Typing runs the real OpenHands agent brain; the cat button starts realtime
 * voice, which can read/fill this box and knows which conversation you're on.
 */
export function SecretaryView() {
  const [params] = useSearchParams();
  const { navigate } = useNavigation();
  const cid = params.get("cid") || "";
  const title = params.get("title") || "";

  const promptRef = React.useRef<HTMLTextAreaElement | null>(null);
  const [answer, setAnswer] = React.useState<string | null>(null);
  const [thinking, setThinking] = React.useState(false);

  const phrase = cid
    ? title
      ? `The user opened the Secretary view from the conversation "${title}" (id ${cid}).`
      : `The user opened the Secretary view from a conversation (id ${cid}).`
    : "The user opened the Secretary view without a specific conversation.";

  const voice = useSecretaryVoice({
    getContextPhrase: () => phrase,
    getPromptBox: () => promptRef.current?.value ?? "",
    setPromptBox: (text) => {
      if (promptRef.current) promptRef.current.value = text;
    },
  });

  const submit = async () => {
    const request = promptRef.current?.value.trim();
    if (!request) return;
    setThinking(true);
    setAnswer("");
    try {
      const r = await fetch(secretaryUrl("/api/ask"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ request }),
      });
      const d = await r.json();
      setAnswer(d.ok ? d.answer : `error: ${d.error}`);
    } catch (e) {
      setAnswer(`error: ${String((e as Error).message || e)}`);
    } finally {
      setThinking(false);
    }
  };

  const openConversation = () => {
    if (cid) navigate(`/conversations/${cid}`);
  };

  const voiceLabel =
    voice.state === "live"
      ? "listening"
      : voice.state === "connecting"
        ? "connecting"
        : voice.state === "error"
          ? voice.error || "voice error"
          : "click to talk";

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 px-6 py-10">
      <div className="flex w-full max-w-2xl items-center gap-3">
        <button
          type="button"
          onClick={() => voice.toggle()}
          aria-label="Talk to the Secretary"
          className={
            "shrink-0 rounded-full p-2 text-white transition " +
            (voice.state === "live"
              ? "bg-green-600"
              : "bg-[var(--oh-surface-raised)] hover:bg-tertiary")
          }
        >
          <SecretaryCatIcon size={22} />
        </button>
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wide text-[var(--oh-muted)]">
            Secretary · {voiceLabel}
          </div>
          {cid ? (
            <button
              type="button"
              onClick={openConversation}
              data-testid="secretary-conversation-title"
              className="max-w-full truncate text-left text-lg font-semibold text-white hover:text-[var(--oh-primary,#4ea1ff)]"
              title="Back to this conversation"
            >
              {title || `conversation ${cid.slice(0, 8)}`}
            </button>
          ) : (
            <div className="text-lg font-semibold text-white">
              No conversation open
            </div>
          )}
        </div>
      </div>

      {answer !== null && (
        <div className="w-full max-w-2xl rounded-lg border border-[var(--oh-border,#26303b)] bg-[var(--oh-surface-raised)] p-3 text-sm text-white">
          <div className="mb-1 text-xs text-[var(--oh-muted)]">
            🐾 secretary{thinking ? " · thinking…" : ""}
          </div>
          <div className="whitespace-pre-wrap">{answer}</div>
        </div>
      )}

      <div className="flex w-full max-w-2xl items-end gap-2 rounded-xl border border-[var(--oh-border,#37414d)] bg-[var(--oh-surface-raised)] p-2.5">
        <textarea
          ref={promptRef}
          rows={2}
          data-testid="secretary-prompt"
          placeholder="Ask the secretary, or draft here… (Enter to send)"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          className="max-h-40 flex-1 resize-none bg-transparent text-sm text-white outline-none placeholder:text-[var(--oh-muted)]"
        />
        <button
          type="button"
          onClick={submit}
          className="rounded-lg bg-[var(--oh-primary,#4ea1ff)] px-4 py-2 text-sm font-semibold text-[#08111f]"
        >
          Send
        </button>
      </div>
    </div>
  );
}
