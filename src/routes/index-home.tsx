import { redirect } from "react-router";
import { SkinService, SKIN_APP_BASE, isSkinBackend } from "#/api/skin-service";
import { getActiveBackend } from "#/api/backend-registry/active-store";
import { readPinnedHomeRoute } from "#/hooks/use-pinned-home-route";

/**
 * An explicit home pin for the active backend + org takes precedence over an
 * installed local skin. Invalid pins are ignored without clearing them; the
 * built-in home stays reachable at /conversations.
 */
export const clientLoader = async () => {
  const pinnedRoute = readPinnedHomeRoute();
  if (pinnedRoute) return redirect(pinnedRoute);

  const { backend } = getActiveBackend();
  if (!isSkinBackend(backend)) return null;

  try {
    const status = await SkinService.getStatus();
    if (status.installed) return redirect(SKIN_APP_BASE);
  } catch {
    // A launcher without the skin service falls through to the built-in home.
  }
  return null;
};

export { default } from "./home";
