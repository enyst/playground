import React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  isSkinBackend,
  type SkinConfigurationReport,
  type SkinPushResult,
  type SkinSecretDeclaration,
} from "#/api/skin-service";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { BrandButton } from "#/components/features/settings/brand-button";
import { SettingsInput } from "#/components/features/settings/settings-input";
import { SettingsSwitch } from "#/components/features/settings/settings-switch";
import { ConfirmationModal } from "#/components/shared/modals/confirmation-modal";
import { useCreateSecret } from "#/hooks/mutation/use-create-secret";
import {
  useApplySkinConfiguration,
  useExportSkinConfiguration,
  useInstallSkin,
  usePullSkin,
  usePushSkin,
  useRestartSkin,
  useSetSkinAutoPush,
  useSkinBusy,
  useUninstallSkin,
} from "#/hooks/mutation/use-manage-skin";
import { useSkinStatus } from "#/hooks/query/use-skin";
import { I18nKey } from "#/i18n/declaration";
import {
  displayErrorToast,
  displaySuccessToast,
} from "#/utils/custom-toast-handlers";

type ReportKind = "apply" | "export";
type Confirmation = { kind: "uninstall" } | { kind: "push"; paths: string[] };

function ConfigurationReport({
  kind,
  report,
}: {
  kind: ReportKind;
  report?: SkinConfigurationReport;
}) {
  const { t } = useTranslation("openhands");
  if (!report) return null;
  const items = [
    ...new Set([
      ...(report.applied ?? report.exported ?? []),
      ...(report.errors ?? []),
      ...(report.skipped ?? []),
      ...(report.warnings ?? []),
      ...(report.missingSecrets ?? []),
      ...(report.rejectedPaths ?? []),
      ...(report.opaquePaths ?? []),
    ]),
  ];
  return (
    <section
      data-testid={`skin-${kind}-report`}
      role={report.complete ? "status" : "alert"}
      className="rounded-lg border border-border p-4 text-sm"
    >
      <h3 className="font-semibold">
        {t(
          kind === "apply"
            ? I18nKey.SKIN$APPLY_REPORT
            : I18nKey.SKIN$EXPORT_REPORT,
        )}
      </h3>
      <p className={report.complete ? "text-muted" : "text-feedback-error"}>
        {t(
          report.complete
            ? I18nKey.SKIN$RESULT_COMPLETE
            : I18nKey.SKIN$RESULT_INCOMPLETE,
        )}
      </p>
      {items.length > 0 && (
        <ul className="mt-2 list-disc space-y-1 break-words pl-5">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function SkinSettingsScreen() {
  const { t } = useTranslation("openhands");
  const { backend } = useActiveBackend();
  const queryClient = useQueryClient();
  const query = useSkinStatus();
  const status = query.data;
  const installSkin = useInstallSkin();
  const uninstallSkin = useUninstallSkin();
  const pullSkin = usePullSkin();
  const pushSkin = usePushSkin();
  const restartSkin = useRestartSkin();
  const applyConfiguration = useApplySkinConfiguration();
  const setAutoPush = useSetSkinAutoPush();
  const exportConfiguration = useExportSkinConfiguration();
  const createSecret = useCreateSecret();
  const mutationBusy = useSkinBusy();

  const [repoUrl, setRepoUrl] = React.useState("");
  const [ref, setRef] = React.useState("");
  const [autoPush, setAutoPushChecked] = React.useState(false);
  const [showSecretSetup, setShowSecretSetup] = React.useState(false);
  const [secretValues, setSecretValues] = React.useState<
    Record<string, string>
  >({});
  const [savingSecrets, setSavingSecrets] = React.useState(false);
  const [confirmation, setConfirmation] = React.useState<Confirmation | null>(
    null,
  );
  const busy = mutationBusy || savingSecrets || !!status?.operation;
  const applyReport = status?.applyReport;
  const exportReport = status?.exportReport;
  const secrets = Array.from(
    new Map<string, SkinSecretDeclaration>([
      ...(applyReport?.missingSecrets ?? []).map(
        (name) => [name, { name }] as const,
      ),
      ...(status?.secrets ?? []).map(
        (secret) => [secret.name, secret] as const,
      ),
    ]).values(),
  );

  if (!isSkinBackend(backend))
    return <p className="text-sm text-muted">{t(I18nKey.SKIN$LOCAL_ONLY)}</p>;
  if (query.isLoading) return <p role="status">{t(I18nKey.SKIN$LOADING)}</p>;
  if (query.isError)
    return (
      <div role="alert" className="flex flex-col items-start gap-3">
        <p className="text-feedback-error">{query.error.message}</p>
        <BrandButton
          type="button"
          testId="skin-status-retry"
          variant="secondary"
          onClick={() => void query.refetch()}
        >
          {t(I18nKey.SETTINGS$APPS_VIEW_RETRY)}
        </BrandButton>
      </div>
    );
  if (status?.available === false)
    return (
      <p data-testid="skin-unavailable" className="text-sm text-muted">
        {t(I18nKey.SKIN$SERVICE_UNAVAILABLE)}
      </p>
    );

  const onError = (error: Error) => displayErrorToast(error.message);
  const showReport = (report: SkinConfigurationReport, successKey: I18nKey) => {
    if (report.complete) displaySuccessToast(t(successKey));
    else displayErrorToast(t(I18nKey.SKIN$PARTIAL_RESULT));
  };
  const onPushResult = (result: SkinPushResult) => {
    if (result.reviewRequired) {
      setConfirmation({ kind: "push", paths: result.reviewPaths ?? [] });
    } else if (!result.pushed) {
      displayErrorToast(result.error ?? t(I18nKey.SKIN$PUSH_FAILED));
    } else {
      setConfirmation(null);
      displaySuccessToast(
        result.pullRequest
          ? `${t(I18nKey.SKIN$PUSH_OPENED_PR)}: ${result.pullRequest.url}`
          : t(I18nKey.SKIN$PUSH_SUCCESS),
      );
    }
  };
  const onInstall = () => {
    installSkin.mutate(
      { repoUrl: repoUrl.trim(), ref: ref.trim() || undefined, autoPush },
      {
        onSuccess: (result) => {
          if (result.applyReport)
            showReport(result.applyReport, I18nKey.SKIN$INSTALL_SUCCESS);
          else displaySuccessToast(t(I18nKey.SKIN$INSTALL_SUCCESS));
          if (
            (result.secrets?.length ?? 0) > 0 ||
            (result.applyReport?.missingSecrets?.length ?? 0) > 0
          )
            setShowSecretSetup(true);
        },
        onError,
      },
    );
  };
  const onSaveSecrets = async () => {
    setSavingSecrets(true);
    try {
      await Promise.all(
        Object.entries(secretValues)
          .filter(([, value]) => value)
          .map(([name, value]) => createSecret.mutateAsync({ name, value })),
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["secrets"] }),
        queryClient.invalidateQueries({ queryKey: ["secrets-search"] }),
      ]);
      if ((applyReport?.missingSecrets?.length ?? 0) > 0) {
        const report = await applyConfiguration.mutateAsync();
        showReport(report, I18nKey.SKIN$APPLY_SUCCESS);
      } else displaySuccessToast(t(I18nKey.SKIN$SECRETS_SAVED));
      setShowSecretSetup(false);
      setSecretValues({});
    } catch (error) {
      displayErrorToast(
        error instanceof Error ? error.message : t(I18nKey.ERROR$GENERIC),
      );
    } finally {
      setSavingSecrets(false);
    }
  };

  if (status?.installed && showSecretSetup && secrets.length > 0)
    return (
      <div
        data-testid="skin-secret-setup"
        aria-busy={busy}
        className="flex max-w-xl flex-col gap-6"
      >
        <p className="text-sm text-muted">
          {t(I18nKey.SKIN$SECRET_SETUP_DESCRIPTION)}
        </p>
        {secrets.map((secret) => (
          <SettingsInput
            key={secret.name}
            testId={`skin-secret-${secret.name}`}
            label={secret.name}
            hint={secret.description}
            type="password"
            value={secretValues[secret.name] ?? ""}
            onChange={(value) =>
              setSecretValues((previous) => ({
                ...previous,
                [secret.name]: value,
              }))
            }
          />
        ))}
        <div className="flex flex-wrap gap-2">
          <BrandButton
            type="button"
            testId="skin-secrets-save"
            variant="primary"
            isDisabled={
              busy || !Object.values(secretValues).some((value) => value.trim())
            }
            onClick={() => void onSaveSecrets()}
          >
            {t(I18nKey.SKIN$SAVE_SECRETS)}
          </BrandButton>
          <BrandButton
            type="button"
            variant="secondary"
            isDisabled={busy}
            onClick={() => {
              setShowSecretSetup(false);
              setSecretValues({});
            }}
          >
            {t(I18nKey.BUTTON$CANCEL)}
          </BrandButton>
        </div>
        <ConfigurationReport kind="apply" report={applyReport} />
      </div>
    );

  if (status?.installed)
    return (
      <div
        data-testid="skin-settings"
        aria-busy={busy}
        className="flex max-w-xl flex-col gap-6"
      >
        <div className="flex flex-col gap-1 break-words text-sm">
          <span className="font-semibold">{status.name}</span>
          <span className="text-muted">{status.repoUrl}</span>
          {status.path && <code className="text-muted">{status.path}</code>}
          {status.branch && (
            <span className="text-muted">
              {t(I18nKey.SKIN$BRANCH_LABEL)}: {status.branch}
            </span>
          )}
          {status.error && (
            <span role="alert" className="text-feedback-error">
              {status.error}
            </span>
          )}
        </div>
        <SettingsSwitch
          testId="skin-auto-push-switch"
          isDisabled={busy}
          isToggled={!!status.autoPush}
          onToggle={(value) => setAutoPush.mutate(value, { onError })}
        >
          {t(I18nKey.SKIN$AUTO_PUSH_LABEL)}
        </SettingsSwitch>
        <div className="flex flex-wrap gap-2">
          <BrandButton
            type="button"
            testId="skin-pull-button"
            variant="secondary"
            isDisabled={busy}
            onClick={() =>
              pullSkin.mutate(undefined, {
                onSuccess: (result) =>
                  result.applyReport
                    ? showReport(result.applyReport, I18nKey.SKIN$PULL_SUCCESS)
                    : displaySuccessToast(t(I18nKey.SKIN$PULL_SUCCESS)),
                onError,
              })
            }
          >
            {t(I18nKey.SKIN$PULL)}
          </BrandButton>
          <BrandButton
            type="button"
            testId="skin-push-button"
            variant="secondary"
            isDisabled={busy}
            onClick={() =>
              pushSkin.mutate({}, { onSuccess: onPushResult, onError })
            }
          >
            {t(I18nKey.SKIN$PUSH)}
          </BrandButton>
          <BrandButton
            type="button"
            testId="skin-export-button"
            variant="secondary"
            isDisabled={busy}
            onClick={() =>
              exportConfiguration.mutate(undefined, {
                onSuccess: (report) =>
                  showReport(report, I18nKey.SKIN$EXPORT_SUCCESS),
                onError,
              })
            }
          >
            {t(I18nKey.SKIN$EXPORT)}
          </BrandButton>
          <BrandButton
            type="button"
            testId="skin-apply-button"
            variant="secondary"
            isDisabled={busy}
            onClick={() =>
              applyConfiguration.mutate(undefined, {
                onSuccess: (report) =>
                  showReport(report, I18nKey.SKIN$APPLY_SUCCESS),
                onError,
              })
            }
          >
            {t(I18nKey.SKIN$APPLY)}
          </BrandButton>
          <BrandButton
            type="button"
            testId="skin-restart-button"
            variant="secondary"
            isDisabled={busy}
            onClick={() => restartSkin.mutate(undefined, { onError })}
          >
            {t(I18nKey.SKIN$RESTART)}
          </BrandButton>
          <BrandButton
            type="button"
            testId="skin-uninstall-button"
            variant="danger"
            isDisabled={busy}
            onClick={() => setConfirmation({ kind: "uninstall" })}
          >
            {t(I18nKey.SKIN$UNINSTALL)}
          </BrandButton>
        </div>
        {secrets.length > 0 && (
          <BrandButton
            type="button"
            testId="skin-setup-secrets-button"
            variant="secondary"
            isDisabled={busy}
            className="self-start"
            onClick={() => setShowSecretSetup(true)}
          >
            {t(I18nKey.SKIN$SETUP_SECRETS)}
          </BrandButton>
        )}
        <ConfigurationReport kind="apply" report={applyReport} />
        <ConfigurationReport kind="export" report={exportReport} />
        {confirmation && (
          <ConfirmationModal
            text={
              confirmation.kind === "push"
                ? t(I18nKey.SKIN$PUSH_REVIEW, {
                    paths: confirmation.paths.join(", "),
                  })
                : t(I18nKey.SKIN$UNINSTALL_CONFIRM)
            }
            confirmText={
              confirmation.kind === "push"
                ? t(I18nKey.SKIN$PUSH_REVIEW_CONFIRM)
                : t(I18nKey.SKIN$UNINSTALL)
            }
            isConfirming={busy}
            onCancel={() => setConfirmation(null)}
            onConfirm={() =>
              confirmation.kind === "push"
                ? pushSkin.mutate(
                    { reviewedSource: true },
                    { onSuccess: onPushResult, onError },
                  )
                : uninstallSkin.mutate(undefined, {
                    onSuccess: () => {
                      setConfirmation(null);
                      setSecretValues({});
                      setShowSecretSetup(false);
                      displaySuccessToast(t(I18nKey.SKIN$UNINSTALL_SUCCESS));
                    },
                    onError,
                  })
            }
          />
        )}
      </div>
    );

  return (
    <div
      data-testid="skin-install-form"
      aria-busy={busy}
      className="flex max-w-xl flex-col gap-6"
    >
      <p className="text-sm text-muted">
        {t(I18nKey.SKIN$INSTALL_DESCRIPTION)}
      </p>
      <SettingsInput
        testId="skin-repo-url-input"
        label={t(I18nKey.SKIN$REPO_URL_LABEL)}
        placeholder={t(I18nKey.SKIN$REPO_URL_PLACEHOLDER)}
        type="text"
        value={repoUrl}
        onChange={setRepoUrl}
      />
      <SettingsInput
        testId="skin-ref-input"
        label={t(I18nKey.SKIN$REF_LABEL)}
        showOptionalTag
        type="text"
        value={ref}
        onChange={setRef}
      />
      <SettingsSwitch
        testId="skin-install-auto-push-switch"
        isDisabled={busy}
        isToggled={autoPush}
        onToggle={setAutoPushChecked}
      >
        {t(I18nKey.SKIN$AUTO_PUSH_LABEL)}
      </SettingsSwitch>
      <BrandButton
        type="button"
        testId="skin-install-button"
        variant="primary"
        className="self-start"
        isDisabled={!repoUrl.trim() || busy}
        onClick={onInstall}
      >
        {t(I18nKey.SKIN$INSTALL)}
      </BrandButton>
    </div>
  );
}

export default SkinSettingsScreen;
