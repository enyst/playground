import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isSkinBackend, SkinService, SkinStatus } from "#/api/skin-service";
import { SKIN_QUERY_KEYS } from "./query-keys";
import { useActiveBackend } from "#/contexts/active-backend-context";

/**
 * Status of the instance's installed skin. The skin API is served by the
 * same-origin static server (Docker / static launcher); in dev setups
 * without skin support the query resolves to { installed: false }.
 */
export function useSkinStatus() {
  const { backend } = useActiveBackend();
  const supported = isSkinBackend(backend);
  const query = useQuery<SkinStatus>({
    queryKey: SKIN_QUERY_KEYS.status,
    queryFn: async () => {
      try {
        return await SkinService.getStatus();
      } catch {
        // No skin service mounted (dev server, cloud backend) — treat as
        // "no skin" rather than an error state.
        return { installed: false, running: false };
      }
    },
    enabled: supported,
    staleTime: 30_000,
    meta: { disableToast: true },
  });
  // Disabled queries retain their cache; never apply the instance's skin to another backend.
  return { ...query, data: supported ? query.data : undefined };
}

export function useInstallSkin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      repoUrl: string;
      ref?: string;
      autoPush?: boolean;
    }) => SkinService.install(params),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: SKIN_QUERY_KEYS.status }),
  });
}

export function useUninstallSkin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => SkinService.uninstall(),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: SKIN_QUERY_KEYS.status }),
  });
}

export function usePullSkin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => SkinService.pull(),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: SKIN_QUERY_KEYS.status }),
  });
}

export function usePushSkin() {
  return useMutation({
    mutationFn: (message?: string) => SkinService.push(message),
  });
}

export function useExportSkinConfiguration() {
  return useMutation({
    mutationFn: () => SkinService.exportConfiguration(),
  });
}

export function useSetSkinAutoPush() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (autoPush: boolean) => SkinService.setAutoPush(autoPush),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: SKIN_QUERY_KEYS.status }),
  });
}
