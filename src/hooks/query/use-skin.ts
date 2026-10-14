import { useQuery } from "@tanstack/react-query";
import {
  isSkinBackend,
  SkinService,
  SkinStatus,
  SkinUnsupportedError,
} from "#/api/skin-service";
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
    queryKey: SKIN_QUERY_KEYS.statusFor(
      backend.id,
      backend.connectionRevision ?? 0,
    ),
    queryFn: async () => {
      try {
        return { available: true, ...(await SkinService.getStatus()) };
      } catch (error) {
        if (error instanceof SkinUnsupportedError) {
          return { available: false, installed: false, running: false };
        }
        throw error;
      }
    },
    enabled: supported,
    staleTime: 5_000,
    refetchInterval: (state) => (state.state.data?.installed ? 5_000 : false),
    retry: false,
    meta: { disableToast: true },
  });
  // Disabled queries retain their cache; never apply the instance's skin to another backend.
  return { ...query, data: supported ? query.data : undefined };
}
