import { useQuery } from "@tanstack/react-query";
import AutomationService from "#/api/automation-service/automation-service.api";
import { isNoBackend } from "#/api/backend-registry/active-store";
import { useActiveBackend } from "#/contexts/active-backend-context";

export const AUTOMATION_SDK_VERSION_CACHE_NAMESPACE = "automation-sdk-version";

const AUTOMATION_SDK_VERSION_CACHE_TIME_MS = 60 * 60 * 1000;
async function fetchAutomationSdkVersion(): Promise<string | null> {
  if (typeof AutomationService.getSdkVersion !== "function") {
    return null;
  }

  try {
    return await AutomationService.getSdkVersion();
  } catch {
    return null;
  }
}

export function useAutomationSdkVersion() {
  const active = useActiveBackend();
  const { backend } = active;
  const { data } = useQuery({
    queryKey: [
      AUTOMATION_SDK_VERSION_CACHE_NAMESPACE,
      backend.id,
      backend.kind,
      backend.host,
      active.orgId ?? "",
    ],
    queryFn: fetchAutomationSdkVersion,
    enabled: !isNoBackend(backend),
    staleTime: AUTOMATION_SDK_VERSION_CACHE_TIME_MS,
    gcTime: AUTOMATION_SDK_VERSION_CACHE_TIME_MS,
  });

  return data ?? null;
}
