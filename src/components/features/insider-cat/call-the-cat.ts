/**
 * The conversation tag that marks a conversation as belonging to the insider
 * SmolPaws cat. Key/value are lowercase per the agent-server `ConversationTags`
 * rules. The value names the "face" so the scheme can grow (e.g. `whatsapp`).
 */
export const SMOLPAWS_TAG_KEY = "smolpaws";
export const SMOLPAWS_TAG_VALUE_INSIDER = "insider";

export interface CallTheCatOptions {
  /** Agent profile to launch, when a dedicated `smolpaws` profile exists. */
  readonly agentProfileId?: string;
  /** Tags to stamp on the new conversation. */
  readonly tags: Record<string, string>;
  /** Optional first message to the cat. */
  readonly initialUserMsg?: string;
}

/**
 * Build the options for opening an insider-cat conversation.
 *
 * Pure so the "call the cat" wiring can be unit-tested without a live backend.
 * `agentProfileId` is threaded through only when provided, so this works both
 * before and after the dedicated `smolpaws` agent profile exists.
 */
export function buildCallTheCatOptions(params?: {
  readonly agentProfileId?: string | null;
  readonly initialUserMsg?: string;
}): CallTheCatOptions {
  const options: CallTheCatOptions = {
    tags: { [SMOLPAWS_TAG_KEY]: SMOLPAWS_TAG_VALUE_INSIDER },
  };
  const withProfile =
    params?.agentProfileId != null
      ? { ...options, agentProfileId: params.agentProfileId }
      : options;
  return params?.initialUserMsg != null
    ? { ...withProfile, initialUserMsg: params.initialUserMsg }
    : withProfile;
}

/** True when a conversation's tags mark it as an insider-cat conversation. */
export function isInsiderCatConversation(
  tags: Record<string, string> | null | undefined,
): boolean {
  return tags?.[SMOLPAWS_TAG_KEY] === SMOLPAWS_TAG_VALUE_INSIDER;
}
