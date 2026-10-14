# F28 — Instance skins

A skin is one GitHub-backed instance package: it imports configuration and serves a custom web app inside Canvas at `/skin`. Settings → Skin (`/settings/skin`) installs and manages it. Canvas apps (F20) remain independent sidebar pages. An explicit home pin takes priority over a skin, and `/conversations` keeps the built-in home reachable.

Source: `src/routes/skin-settings.tsx`, `src/routes/skin-tab.tsx`, `src/routes/index-home.tsx`, `src/api/skin-service.ts`, `src/hooks/query/use-skin.ts`, `src/hooks/use-skin-theme.ts`, `src/components/features/sidebar/sidebar-rail-body.tsx`, `src/constants/settings-nav.tsx`, `scripts/skin-service.mjs`, `scripts/static-server.mjs`, `docker/entrypoint.sh`.

## Sub-features

- `F28.entry-points`: Settings → Skin and the direct settings URL open the same screen.
- `F28.install-form`: an unskinned owning backend shows repository URL, optional ref, auto-push and Install; an empty URL disables Install.
- `F28.empty-tab`: `/skin` without an installed skin explains that none is installed and points to Settings → Skin.
- `F28.install`: a supported GitHub repository installs its configuration and app; management controls replace the form after reload.
- `F28.skin-home`: an installed skin gets the topmost rail entry, and `/` opens its iframe unless a home pin exists.
- `F28.home-pin`: a valid explicit home pin wins over the installed skin; unpinning restores the skin default.
- `F28.backend-ownership`: only a local backend hosting this Canvas origin can manage or apply its skin; switching to another backend hides its rail entry, iframe and theme.
- `F28.secret-setup`: declared secret names produce a setup form; supplied values are saved to backend secrets rather than the skin repository.
- `F28.auto-push`: the installed skin's auto-push setting persists after reload.
- `F28.pull`: pulling refreshes configuration and restarts the skin, with success or failure feedback.
- `F28.push`: pushing reports a successful push or the newly opened pull-request URL; failure shows its reason.
- `F28.export`: export writes instance configuration and secret names into the skin repository without secret values.
- `F28.uninstall`: uninstall stops the app, removes its checkout and synced skill, and restores the install form and unskinned home.
- `F28.theme`: validated theme colors apply to Canvas and are removed when the skin is uninstalled or the owning backend is left.
- `F28.phone`: the settings form and empty skin tab fit at 390×844.

## How to get to it (user POV)

- Sidebar settings gear → **Skin**, or `/settings/skin` directly (`F28.entry-points`).
- The installed skin's named entry at the top of the sidebar (`sidebar-skin-link`), or `/skin` directly (`F28.skin-home`).
- `/` uses the explicit pinned page first, then the installed skin, then the built-in home; `/conversations` always reaches the built-in home.
- Apps remain under Customize → Apps (`/apps`, F20); their enabled page entries remain alongside a skin.

## Driving it with control-openhands

Preconditions:

- Baseline isolated run, successful doctor, onboarding skipped, desktop viewport. No LLM is needed.
- Verification status (2026-10-14, Agent Server 1.54.0): the ordinary-launcher settings entry/form, empty tab, unskinned home pin, phone layouts and non-owning backend gate were observed live. Installed-state lifecycle, installed theme removal and pin priority over an installed skin remain blocked by the runtime prerequisite below.
- The ordinary `control-openhands launch`/`bin/agent-canvas.mjs` stack does **not** enable the skin service. It can drive the form, empty state, existing home pins and backend gating only.
- Installed-state checks are **blocked** on that launcher: they require the static server's `--skin-port <port>` plus `--skin-agent-server-url <url>`, `--skin-automation-url <url>` and `--skin-canvas-version <version>`, or the Docker entrypoint that supplies those flags. There is no CLI skin-launch flag; do not claim a successful install against the ordinary stack.
- Installation additionally requires a reviewed GitHub skin repository with `skin.yaml`, `package.json` containing a start script, and root `SKILL.md`. Local fixture paths are rejected. Push and auto-push need explicit authorization to write to that repository; this map gives none.
- Backend gating uses a second isolated stack registered through the F25 Add Backend recipe, with its own session-key file and no model calls.

- **Settings entry and form (`F28.entry-points`, `F28.install-form`).** Run `control-openhands browser goto /settings/app`, then `control-openhands browser click 'role=link[name="Skin"][exact]' --expect-url '/settings/skin(\?|$)'`. Run `control-openhands browser wait 'testid=skin-install-form'`, `control-openhands browser enabled 'testid=skin-install-button'` (false), and `control-openhands browser snapshot 'testid=skin-install-form'`. Compare with `control-openhands browser goto /settings/skin`; capture `control-openhands browser screenshot --feature F28.install-form --name desktop`. This proves the form, not the absent service's installation behavior.
- **Unskinned tab (`F28.empty-tab`).** Run `control-openhands browser goto /skin`, `control-openhands browser wait 'testid=skin-tab-empty'`, `control-openhands browser text 'testid=skin-tab-empty'`, and `control-openhands browser count 'testid=skin-iframe'` (0). Capture `control-openhands browser screenshot --feature F28.empty-tab --name desktop`.
- **Explicit home pin (`F28.home-pin`).** Follow F21's pin recipe: `control-openhands browser goto /automations`, `control-openhands browser hover 'testid=sidebar-automations-link'`, `control-openhands browser click 'testid=sidebar-pin-home-toggle-automations'`, then `control-openhands browser goto /` and `control-openhands browser wait-url '/automations(\?|$)'`. Unpin with the same hover/click. Without a skin, `/` stays the built-in home; the stronger installed-skin priority check remains blocked until the skin-enabled runtime prerequisite is met.
- **Different backend (`F28.backend-ownership`).** After selecting the second stack through F25, run `control-openhands browser goto /settings/skin` and `control-openhands browser count 'testid=skin-install-form'` (0). Run `control-openhands browser goto /skin`, `control-openhands browser count 'testid=skin-iframe'` (0) and `control-openhands browser count 'testid=sidebar-skin-link'` (0). Capture `control-openhands browser screenshot --feature F28.backend-ownership --name other-backend`, then switch back to Local. Installed-theme removal requires the skin-enabled runtime too.
- **Phone (`F28.phone`).** On Local, run `control-openhands browser viewport phone`, `control-openhands browser goto /settings/skin`, and `control-openhands browser screenshot --feature F28.phone --name install-form`. Run `control-openhands browser goto /skin` and `control-openhands browser screenshot --feature F28.phone --name empty-tab`; restore with `control-openhands browser viewport desktop`.
- **Installed lifecycle (`F28.install`, `F28.skin-home`, `F28.secret-setup`, `F28.auto-push`, `F28.pull`, `F28.push`, `F28.export`, `F28.uninstall`, `F28.theme`).** Blocked on the ordinary CLI launcher. On an authorized skin-enabled run, UI handles are `skin-repo-url-input`, `skin-ref-input`, `skin-install-button`, `skin-secret-<name>`, `skin-secrets-save`, `skin-auto-push-switch`, `skin-pull-button`, `skin-push-button`, `skin-export-button` and `skin-uninstall-button`. Check persisted status after reload and actual backend/configuration/git state before recording a pass; a toast alone is insufficient. Do not enable auto-push or click Push without repository-write authorization.

## Gotchas

- Skin status errors fall back to “not installed,” including a launcher with no `/skin-api`; seeing the install form does not establish runtime support.
- Ownership requires a local backend with the same Canvas origin (equivalent loopback hostnames are accepted only with the same protocol and port). Another localhost port is another backend, even when it is healthy.
- The Docker Canvas uses its configured base path (normally `/canvas`), so its skin tab is `/canvas/skin`; `/skin/` serves the custom app outside that base path. A skin-enabled static server redirects a bare HTTP `/skin` request to `/skin/`; use the Canvas base path to inspect the nested tab. The ordinary launcher has no skin proxy, so its direct `/skin` reaches the Canvas empty state.
- The skin app runs arbitrary repository code via `npm run start`; review its source before executing it. Use run-owned HOME, skin state and workspace paths, never the operator's `~/.openhands`.
- Uninstall removes the skin files and synced skill; it does not undo all previously imported backend configuration.
- Status has a 30-second cache. Reload after install, uninstall or backend switches when proving navigation and theme changes.
