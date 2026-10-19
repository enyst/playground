import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "#/mocks/node";
import {
  __resetActiveStoreForTests,
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import AgentServerConversationService from "#/api/conversation-service/agent-server-conversation-service.api";
import { useDeleteConversation } from "#/hooks/mutation/use-delete-conversation";

describe("useDeleteConversation", () => {
  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    __resetActiveStoreForTests();
  });

  it.each(["mutate", "mutateAsync"] as const)(
    "captures a single delete before %s awaits onMutate",
    async (method) => {
      const original = {
        id: "original",
        kind: "local" as const,
        name: "Original",
        host: "http://original.test",
        apiKey: "original-key",
      };
      const next = { ...original, id: "next", host: "http://next.test" };
      setRegisteredBackends([original, next]);
      setActiveSelection({ backendId: original.id });
      const deletedUrls: string[] = [];
      server.use(
        http.get(`${original.host}/api/conversations`, () =>
          HttpResponse.json([]),
        ),
        http.delete(
          `${original.host}/api/conversations/captured`,
          ({ request }) => {
            deletedUrls.push(request.url);
            return new HttpResponse(null, { status: 204 });
          },
        ),
      );
      let release!: () => void;
      const queryClient = new QueryClient();
      vi.spyOn(queryClient, "cancelQueries").mockReturnValue(
        new Promise<void>((resolve) => {
          release = resolve;
        }),
      );
      const { result } = renderHook(() => useDeleteConversation(), {
        wrapper: ({ children }) => (
          <QueryClientProvider client={queryClient}>
            {children}
          </QueryClientProvider>
        ),
      });

      const deletion = result.current[method]({ conversationId: "captured" });
      await waitFor(() => expect(queryClient.cancelQueries).toHaveBeenCalled());
      setActiveSelection({ backendId: next.id });
      release();
      await deletion;

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(deletedUrls).toEqual([
        `${original.host}/api/conversations/captured`,
      ]);
    },
  );

  it("keeps the caller's captured delete operation across an asynchronous onMutate", async () => {
    const deleteOperation = vi.fn<(id: string) => Promise<void>>();
    let release!: () => void;
    const queryClient = new QueryClient();
    vi.spyOn(queryClient, "cancelQueries").mockReturnValue(
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    );
    const { result } = renderHook(() => useDeleteConversation(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      ),
    });
    const deletion = result.current.mutateAsync({
      conversationId: "captured",
      deleteOperation,
    });
    await waitFor(() => expect(release).toBeDefined());
    expect(deleteOperation).not.toHaveBeenCalled();
    release();
    await deletion;
    expect(deleteOperation).toHaveBeenCalledWith("captured");
  });

  it("invalidates the conversation list and start-tasks queries on settle", async () => {
    vi.spyOn(
      AgentServerConversationService,
      "createConversationDeletionTarget",
    ).mockReturnValue({
      searchConversations: vi.fn(),
      deleteConversation: vi.fn().mockResolvedValue(undefined),
    });

    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useDeleteConversation(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      ),
    });

    await result.current.mutateAsync({ conversationId: "conv-1" });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["user", "conversations"],
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["start-tasks"],
      });
    });
  });

  it("still invalidates both queries when the delete request fails", async () => {
    vi.spyOn(
      AgentServerConversationService,
      "createConversationDeletionTarget",
    ).mockReturnValue({
      searchConversations: vi.fn(),
      deleteConversation: vi.fn().mockRejectedValue(new Error("boom")),
    });

    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useDeleteConversation(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      ),
    });

    await expect(
      result.current.mutateAsync({ conversationId: "conv-1" }),
    ).rejects.toThrow("boom");

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["user", "conversations"],
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["start-tasks"],
      });
    });
  });
});
