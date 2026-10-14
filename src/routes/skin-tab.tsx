import { useTranslation } from "react-i18next";
import { SKIN_APP_BASE } from "#/api/skin-service";
import { useSkinStatus } from "#/hooks/query/use-skin";
import { I18nKey } from "#/i18n/declaration";
import { NavigationLink } from "#/components/shared/navigation-link";

/**
 * Default tab of a skinned instance: renders the installed skin's web app
 * (running on OPENHANDS_SKIN_PORT, reverse-proxied under /skin-app) in a
 * full-size iframe filling the main content area.
 */
function SkinTab() {
  const { t } = useTranslation("openhands");
  const { data: status, isLoading } = useSkinStatus();

  if (isLoading) {
    return <p role="status">{t(I18nKey.SKIN$LOADING)}</p>;
  }

  if (!status?.installed) {
    return (
      <main
        data-testid="skin-tab-empty"
        className="flex h-full items-center justify-center text-sm text-muted"
      >
        {t(I18nKey.SKIN$NOT_INSTALLED)}
      </main>
    );
  }

  if (!status.running) {
    return (
      <main
        data-testid="skin-tab-unavailable"
        className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm"
      >
        <p role="alert">{status.error || t(I18nKey.SKIN$APP_NOT_RUNNING)}</p>
        <NavigationLink to="/settings/skin" className="text-primary underline">
          {t(I18nKey.SKIN$TITLE)}
        </NavigationLink>
      </main>
    );
  }

  return (
    <main data-testid="skin-tab" className="h-full w-full">
      <iframe
        data-testid="skin-iframe"
        title={status.name || t(I18nKey.SKIN$TITLE)}
        src={`${SKIN_APP_BASE}/`}
        className="h-full w-full border-0"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
      />
    </main>
  );
}

export default SkinTab;
