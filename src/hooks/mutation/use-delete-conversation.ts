import { useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import AgentServerConversationService from "#/api/conversation-service/agent-server-conversation-service.api";
import type { DeleteConversationOperation } from "#/api/conversation-service/agent-server-conversation-service.types";
import { clearConversationLocalStorage } from "#/utils/conversation-local-storage";

interface DeleteConversationVariables {
  conversationId: string;
  deleteOperation?: DeleteConversationOperation;
}

type CapturedDeleteConversationVariables = DeleteConversationVariables & {
  deleteOperation: DeleteConversationOperation;
};

function captureDeletion(
  variables: DeleteConversationVariables,
): CapturedDeleteConversationVariables {
  if (variables.deleteOperation) {
    return { ...variables, deleteOperation: variables.deleteOperation };
  }
  try {
    return {
      ...variables,
      deleteOperation:
        AgentServerConversationService.createConversationDeletionTarget()
          .deleteConversation,
    };
  } catch (error) {
    // Report capture failures through the mutation's normal error lifecycle.
    return {
      ...variables,
      deleteOperation: async () => {
        throw error;
      },
    };
  }
}

export const useDeleteConversation = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (variables: CapturedDeleteConversationVariables) =>
      variables.deleteOperation(variables.conversationId),
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: ["user", "conversations"] });
      const previousConversations = queryClient.getQueryData([
        "user",
        "conversations",
      ]);

      queryClient.setQueryData(
        ["user", "conversations"],
        (old: { conversation_id: string }[] | undefined) =>
          old?.filter(
            (conv) => conv.conversation_id !== variables.conversationId,
          ),
      );

      return { previousConversations };
    },

    onSuccess: (_, variables) => {
      clearConversationLocalStorage(variables.conversationId);
    },

    onError: (err, variables, context) => {
      if (context?.previousConversations) {
        queryClient.setQueryData(
          ["user", "conversations"],
          context.previousConversations,
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["user", "conversations"] });
      // Mirror useCreateConversation: cloud surfaces in-flight
      // conversations via useStartTasks, so invalidate that key too so the
      // panel refreshes regardless of whether the deleted item was a ready
      // conversation or a still-provisioning start task.
      queryClient.invalidateQueries({ queryKey: ["start-tasks"] });
    },
  });

  const { mutate, mutateAsync } = mutation;
  // Capture at invocation, before React Query awaits any onMutate callbacks.
  // Single deletes and prepared bulk deletes share the same invariant.
  const deleteConversation = useCallback(
    (
      variables: DeleteConversationVariables,
      options?: Parameters<typeof mutate>[1],
    ) => mutate(captureDeletion(variables), options),
    [mutate],
  );
  const deleteConversationAsync = useCallback(
    (
      variables: DeleteConversationVariables,
      options?: Parameters<typeof mutateAsync>[1],
    ) => mutateAsync(captureDeletion(variables), options),
    [mutateAsync],
  );

  return {
    ...mutation,
    mutate: deleteConversation,
    mutateAsync: deleteConversationAsync,
  };
};
