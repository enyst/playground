import {
  useIsMutating,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { SkinService } from "#/api/skin-service";
import {
  AGENT_PROFILES_QUERY_KEYS,
  LLM_PROFILES_QUERY_KEYS,
  PROVIDER_CONNECTIONS_QUERY_KEYS,
  META_PROFILES_QUERY_KEYS,
  SETTINGS_QUERY_KEYS,
  SKIN_QUERY_KEYS,
} from "#/hooks/query/query-keys";
import { AUTOMATIONS_QUERY_KEY } from "#/hooks/query/use-automations";

const CONFIGURATION_QUERY_KEYS = [
  SETTINGS_QUERY_KEYS.all,
  AGENT_PROFILES_QUERY_KEYS.all,
  LLM_PROFILES_QUERY_KEYS.all,
  PROVIDER_CONNECTIONS_QUERY_KEYS.all,
  META_PROFILES_QUERY_KEYS.all,
  AUTOMATIONS_QUERY_KEY,
  ["skills"],
];

function useSkinInvalidation(configuration = false) {
  const client = useQueryClient();
  return async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: SKIN_QUERY_KEYS.status }),
      ...(configuration
        ? CONFIGURATION_QUERY_KEYS.map((queryKey) =>
            client.invalidateQueries({ queryKey }),
          )
        : []),
    ]);
  };
}

const MUTATION_OPTIONS = {
  mutationKey: SKIN_QUERY_KEYS.mutation,
  meta: { disableToast: true },
};

export function useSkinBusy() {
  return useIsMutating({ mutationKey: SKIN_QUERY_KEYS.mutation }) > 0;
}

export function useInstallSkin() {
  return useMutation({
    ...MUTATION_OPTIONS,
    mutationFn: SkinService.install,
    onSettled: useSkinInvalidation(true),
  });
}

export function useUninstallSkin() {
  return useMutation({
    ...MUTATION_OPTIONS,
    mutationFn: SkinService.uninstall,
    onSettled: useSkinInvalidation(),
  });
}

export function usePullSkin() {
  return useMutation({
    ...MUTATION_OPTIONS,
    mutationFn: SkinService.pull,
    onSettled: useSkinInvalidation(true),
  });
}

export function useRestartSkin() {
  return useMutation({
    ...MUTATION_OPTIONS,
    mutationFn: SkinService.restart,
    onSettled: useSkinInvalidation(),
  });
}

export function useApplySkinConfiguration() {
  return useMutation({
    ...MUTATION_OPTIONS,
    mutationFn: SkinService.applyConfiguration,
    onSettled: useSkinInvalidation(true),
  });
}

export function usePushSkin() {
  return useMutation({
    ...MUTATION_OPTIONS,
    mutationFn: SkinService.push,
    onSettled: useSkinInvalidation(),
  });
}

export function useExportSkinConfiguration() {
  return useMutation({
    ...MUTATION_OPTIONS,
    mutationFn: SkinService.exportConfiguration,
    onSettled: useSkinInvalidation(),
  });
}

export function useSetSkinAutoPush() {
  return useMutation({
    ...MUTATION_OPTIONS,
    mutationFn: SkinService.setAutoPush,
    onSettled: useSkinInvalidation(),
  });
}
