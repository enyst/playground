import { useNavigation } from "#/context/navigation-context";
import { useActiveConversation } from "#/hooks/query/use-active-conversation";

export interface SecretaryContext {
  /** "conversation" when a chat is open, otherwise the named page. */
  kind: "conversation" | "page";
  /** Present only for a conversation. */
  conversationId?: string;
  conversationTitle?: string;
  /** A short human name for wherever the user is right now. */
  pageLabel: string;
  /** A one-line phrase the cat can be told so it knows where the user is. */
  phrase: string;
}

// Map a non-conversation path to a friendly page name. Keep it small; the goal
// is only to let the cat say "you're on the LLM settings page" accurately.
function pageLabelForPath(path: string): string {
  const p = path.replace(/\/+$/, "") || "/";
  const table: Array<[RegExp, string]> = [
    [/^\/$/, "the home page"],
    [/^\/conversations$/, "the new-chat / conversations home"],
    [/^\/customize/, "the Customize / extensions page"],
    [/^\/skills/, "the Skills settings"],
    [/^\/plugins/, "the Plugins settings"],
    [/^\/mcp/, "the MCP settings"],
    [/^\/settings\/llm/, "the LLM settings page"],
    [/^\/settings\/agents/, "the Agent Profiles settings"],
    [/^\/settings\/agent-context/, "the Agent Context settings"],
    [/^\/settings\/agent/, "the Agent settings"],
    [/^\/settings\/condenser/, "the Condenser settings"],
    [/^\/settings\/verification/, "the Verification settings"],
    [/^\/settings\/app/, "the App settings"],
    [/^\/settings\/secrets/, "the Secrets settings"],
    [/^\/settings/, "the Settings page"],
    [/^\/automations/, "the Automations page"],
    [/^\/secretary/, "the Secretary view"],
    [/^\/launch/, "the launch page"],
  ];
  for (const [re, label] of table) if (re.test(p)) return label;
  return `the page at ${p}`;
}

/**
 * What the Secretary should know about where the user is right now: the open
 * conversation (id + title) if any, otherwise the named page. Used to tell the
 * realtime voice model its context, and to render the Secretary view header.
 */
export function useSecretaryContext(): SecretaryContext {
  const { currentPath, conversationId } = useNavigation();
  const active = useActiveConversation();

  if (conversationId) {
    const title = active.data?.title || undefined;
    return {
      kind: "conversation",
      conversationId,
      conversationTitle: title,
      pageLabel: title ? `the conversation "${title}"` : "a conversation",
      phrase: title
        ? `The user is viewing the conversation "${title}" (id ${conversationId}).`
        : `The user is viewing a conversation (id ${conversationId}), which has no title yet.`,
    };
  }

  const pageLabel = pageLabelForPath(currentPath);
  return {
    kind: "page",
    pageLabel,
    phrase: `The user is on ${pageLabel}, not inside a conversation.`,
  };
}
