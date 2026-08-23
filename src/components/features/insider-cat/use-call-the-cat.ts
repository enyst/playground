import { useMutation, useQueryClient } from "@tanstack/react-query";
import AgentServerConversationService from "#/api/conversation-service/agent-server-conversation-service.api";
import { displayErrorToast } from "#/utils/custom-toast-handlers";
import { useNavigation } from "#/context/navigation-context";
import { buildCallTheCatOptions } from "./call-the-cat";

/**
 * "Call the cat" — open a fresh conversation with the insider SmolPaws, stamped
 * with the `smolpaws=insider` tag. Mirrors the create+navigate shape of
 * {@link useNewConversationCommand}; the tag comes from
 * {@link buildCallTheCatOptions} so the wire contract is unit-tested separately.
 */
export const useCallTheCat = () => {
  const { navigate } = useNavigation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { tags, agentProfileId } = buildCallTheCatOptions();
      const startTask = await AgentServerConversationService.createConversation(
        {
          agentProfileId,
          metadata: { tags } as never,
        },
      );

      if (startTask.status === "ERROR") {
        throw new Error(startTask.detail || "Failed to call SmolPaws");
      }

      const newConversationId = startTask.app_conversation_id
        ? startTask.app_conversation_id
        : `task-${startTask.id}`;
      return { newConversationId };
    },
    onSuccess: (data) => {
      navigate(`/conversations/${data.newConversationId}`);
      queryClient.invalidateQueries({ queryKey: ["user", "conversations"] });
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : "Failed to call SmolPaws";
      displayErrorToast(message);
    },
  });
};
