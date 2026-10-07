# Delta source audit — 2026-10-07

Read-only source analysis, not live proof. Checkout: `/workspace/scratch/map-maintenance-2026-10-07/repo`. BASE `ed815e141409c7b52991ab8d13c553b595da9165`; TARGET `3f98684763a4e17e6e2faf8dd8f1cfc3969b020c`.

Read `AGENTS.md`, verify-openhands skill, mapping, maintenance, daily and report contracts. No repository edits, browsers, model calls or GitHub mutations were performed by this reader.

`control-openhands map affected` succeeded under the supported execution mode with network enabled and reported 75 changed paths: 13 distinct directly mapped product paths, seven shared paths, three setup-guide product gaps plus one non-product unmapped Playwright config, and 51 non-user-facing paths. Its nine initial families are F01, F02, F04, F05, F06, F07, F08, F25 and F27. The narrower sandbox execution reported `spawnSync git EPERM` as false ancestry; root confirmed and this reader reproduced that the supported execution mode succeeds. This is not evidence of a harness defect.

## Source verdict and likely map corrections

1. **F05.plus-menu, F07.status-menu and F08.tabs-overflow Escape notes are stale candidates.** `src/components/features/chat/chat-add-file-button.tsx:38`, `src/components/features/conversation/conversation-name-with-status.tsx:62`, and `src/components/features/conversation/conversation-tabs/conversation-tabs-context-menu.tsx:52` now call `useCloseOnEscape`. The map still carries Known failure #18094 at F05:94, F07:93 and F08:107. Live proof must check click/Enter open -> Escape close + focus restoration, and status hover open -> Escape close without stealing focus. Preserve the separate narrow composer overflow Escape failure: `chat-input-overflow-menu` was not changed by this fix.
2. **F25.health-status has outdated time bounds.** Its row at F25:34 promises one 10 s probe, its command at :86 waits only 25,000 ms, and its gotcha at :113 repeats 10 s/25 s. `src/hooks/query/use-backends-health.ts:29` sets local cadence to 30 s (already true at BASE), :33 sets new Cloud cadence to five minutes; :264-267 disables Cloud reconnect/window-focus refetch. Live verify local health with >=30 s plus actual probe/deadline allowance before correcting; Cloud cadence needs a real Cloud backend. Do not conflate local availability changes with Cloud health polling.
3. **New Super Admin setup guide has no family or explicit Not mapped entry.** All three `src/components/features/setup-guide/` files are new. `root-layout.tsx:165` mounts the guide and `use-sidebar-onboarding-checklist.ts:138` suppresses the ordinary checklist while guide state loads or the guide is visible. Generic Cloud-account text does not capture its specialized access prerequisite.
4. **New suspended-organization/member recovery has no named row.** `cloud-organization-boundary.tsx:44` replaces the app after the Cloud proxy records exact 403 detail; :129 displays an alert and :140 offers other organizations. Existing F25.cloud-org-rows says only that selecting an organization scopes lists. This is new behavior, requiring real authorized organization/membership suspension fixtures. A general Cloud account cannot prove it.
5. **Cloud repository dropdown demand loading is absent from existing recipes.** `cloud-new-conversation-menu.tsx:119-137` enables repository/installations/search queries only while the menu is open and a provider exists. `use-git-repositories.ts:23` now propagates the enabled gate to installations. Home's `use-repository-data.tsx:24-27` is a second consumer, with `enabled: !disabled`; it must not be omitted just because map affected names only the panel menu.
6. **Shared SDK error formatting changes affect many paths.** `retrieve-axios-error-message.ts:29` extracts parsed HttpError response text. Global query/mutation caches use it at `src/query-client-config.ts:52-86`. F02 is the common toast owner, but validating one toast does not establish all direct consumers or the independent Cloud suspension boundary. `getApiOrConnectionErrorMessage`'s no-response fallback changes at `api-error-message.ts:128`; explicit `displayApiErrorToast` uses that helper, whereas generic query-cache errors still use `displayErrorToast`.

## Explicit Not mapped wording supported by source

These describe source-identified gaps and exact prerequisites, not tested recipes. Do not mark either pass or add an unexecuted recipe as proven.

> Enterprise Super Admin setup guide (`src/components/features/setup-guide/`, mounted by `src/routes/root-layout.tsx`): not mapped live. Requires a reachable OpenHands Enterprise Cloud backend with the Super Admin feature enabled; the first Super Admin account, whose organization `/me` response includes `manage_super_admins`; and `GET /api/admin/setup-state` returning a non-null `guide_org_id`, `guide_dismissed: false`, non-null `guide_steps`, and at least one incomplete required step. Verification also needs permission to configure that guide organization's LLM, add an MCP integration, create an automation and invite a user, plus separate standalone/new-tab and locked-to-Cloud/same-tab deployments. Source-only Local absence is not proof of these Cloud paths.

The minimum fixture just for visibility is the first sentence through incomplete required step; mutation permissions are required only for complete progress proof. `use-super-admin-setup-guide.ts:55-75,87-97` establishes the permission/state gate. `setup-state-service.api.ts:9-11,22-25` explicitly normalizes absent/non-object responses to no guide. `super-admin-setup-guide.constants.ts:46-89` owns the four required steps and optional SAML link. `super-admin-setup-guide.tsx:66-75` establishes same-tab versus new-tab behavior.

> Cloud organization and membership suspension recovery (`src/api/cloud/organization-suspension-store.ts`, `src/components/features/backends/cloud-organization-boundary.tsx`): not mapped live. Requires an authenticated Cloud backend and authorized fixtures that return real HTTP 403 with exact detail `Organization is suspended` and `User membership is suspended` for the selected organization; a second accessible organization for recovery; and no-alternative-organization and organization-switch-during-request cases. A local Agent Server or synthetic response cannot establish this behavior.

This is supported by suspension store :12-14, :30-41; proxy :29-31, :48-50; boundary :44-46, :125-149. The organization-switch case verifies that the original request's selected organization, captured before awaiting, receives the recorded failure; a late response must not suspend the new selection.

## Shared-consumer expansion and independent boundaries

| Changed shared path or shared adapter | Actual consumers / families | Required distinct boundary |
|---|---|---|
| `src/hooks/mutation/use-add-mcp-server.ts` | F17 install/custom editor; F02 ordinary checklist; new guide via setup-state invalidation | Local MCP add persists; Enterprise MCP add invalidates current guide state without navigation; no-account Local does not request admin setup-state |
| `src/hooks/query/query-keys.ts` | New setup guide and MCP mutation | This diff only adds `SUPER_ADMIN_SETUP_QUERY_KEYS`; it does not modify every existing query key. Verify backend-id/connection-revision separation for new setup state, not unrelated keys |
| `src/hooks/query/use-app-installations.ts` + `use-git-repositories.ts` | F03 Home repository picker and F04/F07 Cloud new conversation menu | Menu closed vs open; no provider vs provider; disabled Home picker vs enabled; pagination and provider/backend switch after enabling; search's separate skip flag |
| `src/i18n/translation.json` | New setup guide; F25 suspension | The added keys are setup-guide and organization/member suspension copy, not a broad changed translation system. Desktop/phone and current locale text/overflow on those surfaces |
| `src/utils/retrieve-axios-error-message.ts` | F02 global toast/cache owner; direct F01 choose-agent, F04/F07 download, F08 read-file, F10/F15 SDK settings, F13 agent profiles/ACP secret save, F16 app settings, F17 add/edit/install/health, F18 skill enablement, F22 responder-secret setup, F27 compact/overview MCP | SDK HttpError with structured server message vs no useful body; query-cache vs mutation-cache fallback; direct inline/manual catch; server response vs network/no-response; Local vs Cloud |
| `src/utils/api-error-message.ts` | F02 `displayApiErrorToast`; F05 `use-switch-llm-profile`; explicit callers of `displayApiErrorToast` | Actual API response message is preserved; no-response network/CORS/timeout uses friendly connection wording. The unchanged `getApiErrorMessage` body alone is not a reason to retest every importer |
| `src/api/cloud/proxy.ts`, `client.ts`, suspension store | F25 Cloud org boundary plus below Cloud service consumers | Ordinary success/error remains usable; only exact suspension 403 triggers recovery; capture org at request start; inactive-backend errors do not inherit unrelated active org; runtime `hostOverride` uses its own client but the same suspension capture |

Cloud proxy's affected concrete service consumers (all import/call `callCloudProxy`):

| Consumer source | Feature families / user surface |
|---|---|
| `src/api/cloud/conversation-service.api.ts` | F03/F04 conversation creation/list; F07 title/stop/archive/share; F05 conversation controls |
| `src/api/event-service/event-service.api.ts` | F06 Cloud event load; F07 conversation display |
| `src/api/git-service/agent-server-git-service.api.ts` | F07 git actions and F08 changes/diffs on Cloud runtime |
| `src/api/cloud/git-service.api.ts` | F03 Home repository picker, F04 Cloud new conversation menu |
| `src/api/cloud/provider-connections-service.api.ts` | F11 provider connections |
| `src/api/cloud/profiles-service.api.ts` | F10 LLM profiles; F05 profile switching |
| `src/api/cloud/meta-profiles-service.api.ts` | F12 model router |
| `src/api/cloud/agent-profiles-service.api.ts` | F13 agent profiles; F01 choose-agent / F05 agent selection |
| `src/api/cloud/secrets-service.api.ts` | F14 secrets; F22 responder-secret configuration |
| `src/api/cloud/settings-service.api.ts` | F10, F13, F15, F16, F17 Cloud settings consumers and provider token gating |
| `src/api/cloud/mcp-service.api.ts` | F17 MCP tests/OAuth |
| `src/api/cloud/skills-service.api.ts` | F18 Cloud skills and F07 conversation skills |
| `src/api/cloud/sandbox-service.api.ts` | F25 Cloud sandbox states; F07 status controls |
| `src/api/cloud/shared-conversation-service.api.ts` | F25 shared read-only conversation, F06 read-only events |
| `src/api/cloud/organization-service.api.ts` | F25 backend/org membership and new-guide permissions; F21/F22/F23 automation permissions |
| `src/api/cloud/setup-state-service.api.ts` | New setup guide; F02 checklist suppression |
| `src/api/config-service/config-service.api.ts` | F10 model/provider lists |
| `src/api/automation-service/automation-service.api.ts` | F21 dashboard/list, F22 create/validate/deploy, F23 detail/run logs, F24 git-sync; F03 recommended actions |
| `src/api/conversation-service/agent-server-conversation-service.api.ts:1133,1189` | F07 Cloud pause/resume paths |

Global errors cannot be treated as affecting just the directly named nine families: `createAgentServerQueryClient()` installs the changed extraction path for all nonsuppressed query/mutation failures. `src/components/providers/agent-server-ui-providers.tsx:76,140` shares the default client with standalone and embedded Canvas; callers can also supply their own query client, a distinct F26 boundary. F09 settings navigation, F19 plugins and F20 Canvas Apps can expose SDK errors through that global cache despite not directly importing the helper. This is a shared-error-path delta, not authorization for unrelated full-map smoke/weekly rotation. Retain BASE if the required consumer/error boundaries cannot be completed; do not call the initial nine-family list a complete source scope.

## UI entry points and source-directed live checks

These are source-directed proposals; the mapped family recipes still need literal top-to-bottom execution by their live owner. Every ledger entry must include viewport plus actual selected backend/scenario.

- **F05 (+):** Home composer and conversation composer where exposed, desktop/phone; click and keyboard open, Escape, inspect menu count and `document.activeElement.dataset.testid`. Source hook has triggerRef. Leave narrow overflow's existing issue separate.
- **F07 (status):** conversation header with existing conversation; click/Enter versus hover must be tested separately because `menuOpen ? triggerRef : undefined` controls focus restoration. Desktop/phone.
- **F08 (tabs):** conversation workspace panel overflow button, desktop/phone; Escape should remove `conversation-tabs-menu-*` and focus the supplied anchor. Do not confuse the body context menu with title "...".
- **F25 health:** live second Local stack, stop only its Agent Server and observe existing page's status and disabled row with 30 s cadence plus actual probe allowance; preserve run identity and selected backend in entry. Cloud requires real backend, five-minute cadence, no focus/reconnect probing; disabled/missing-key branches remain separate.
- **F03/F04 Cloud repos:** inspect browser network before opening, after opening, after closing with search text retained, and after selecting provider/backend; include disabled Home repo picker because it consumes the newly gated hook. Cloud/provider integration is an exact prerequisite, not a local dummy source.
- **F02 checklist/new guide:** Local and ordinary Cloud users retain ordinary onboarding checklist; first Enterprise Super Admin sees floating guide instead. Loading and no-guide cases matter. New guide panel Close toggles state only; it does not permanently dismiss guide. Start chooses first incomplete required step and closes panel. SAML is optional and never contributes to `completedCount`. Four required steps complete -> guide disappears. `currentPath` changes refetch; MCP adds invalidate setup state. Cloud org links use `guide_org_id`, even if a different org is selected. Test desktop/phone and standalone `_blank` versus locked Cloud same-tab.
- **F25 suspension:** real organization and real membership suspension each produce their corresponding alert, stop mounting org consumers, and offer accessible alternate organization buttons. Ordinary 403 and non-403 errors must not set suspension state. Test race to another organization before original response and backend independence; no alternative org yields alert with no recovery buttons. No product-bug conclusions from source alone.
- **Shared errors:** live invalid operations that naturally yield SDK HttpError, actual network/no-response failures by stopping owned services, and both cache/inline display paths; source fixtures or mocked responses are insufficient. Model-backed setup is unnecessary for error formatting itself.

## Exhaustive changed-path disposition

Each of the 75 paths below has one explicit disposition. Directly owned paths can still require shared-consumer widening above.

### Direct product paths (13)

| Path | Disposition |
|---|---|
| `src/api/cloud/client.ts` | F25; exports existing `activeOrgForBackend` for suspension capture; broaden through Cloud proxy consumers |
| `src/api/cloud/organization-suspension-store.ts` | F25 new org/member suspension state, source gap |
| `src/api/cloud/proxy.ts` | F25 adapter; all Cloud consumers above |
| `src/api/cloud/setup-state-service.api.ts` | F25 Cloud transport; new setup-guide surface gap |
| `src/api/cloud/types.ts` | New setup-guide wire type only |
| `src/components/features/backends/cloud-organization-boundary.tsx` | F25 suspension recovery; stops rendering all Cloud org-scoped children |
| `src/components/features/chat/chat-add-file-button.tsx` | F05 plus-menu Escape; map also matches F06 broad chat directory |
| `src/components/features/conversation-panel/cloud-new-conversation-menu.tsx` | F04 new Cloud thread; map also F07/F27 broad panel directory; demand repository loading |
| `src/components/features/conversation/conversation-name-with-status.tsx` | F07 status menu Escape/focus |
| `src/components/features/conversation/conversation-tabs/conversation-tabs-context-menu.tsx` | F08 workspace tab overflow Escape; map also F07 broad conversation directory |
| `src/components/features/sidebar/use-sidebar-onboarding-checklist.ts` | F02 checklist suppression; new setup guide |
| `src/hooks/query/use-backends-health.ts` | F25 Local/Cloud health cadence and refetch triggers |
| `src/routes/root-layout.tsx` | F01 app/root lifecycle; new setup-guide mount plus F02 checklist interaction |

### Shared product paths (7)

| Path | Disposition |
|---|---|
| `src/hooks/mutation/use-add-mcp-server.ts` | F17 and new guide state invalidation; F02 related checklist |
| `src/hooks/query/query-keys.ts` | Adds only new-guide key, F17 invalidation |
| `src/hooks/query/use-app-installations.ts` | F03/F04 repository gate |
| `src/hooks/query/use-git-repositories.ts` | F03/F04 repository gate |
| `src/i18n/translation.json` | New guide / F25 suspension text |
| `src/utils/api-error-message.ts` | Shared friendly no-response errors; consumers above |
| `src/utils/retrieve-axios-error-message.ts` | Shared SDK HttpError extraction; direct and global consumers above |

### New product surface (3)

| Path | Disposition |
|---|---|
| `src/components/features/setup-guide/super-admin-setup-guide.constants.ts` | Not mapped: Enterprise first-Super-Admin prerequisite above; owns steps and destinations |
| `src/components/features/setup-guide/super-admin-setup-guide.tsx` | Not mapped: guide panel/toggle/progress/start/responsive layout and deployment link behavior |
| `src/components/features/setup-guide/use-super-admin-setup-guide.ts` | Not mapped: permissions/state/progress visibility and cache boundary |

### Non-user-facing paths (52)

These are documentation/harness/test-only changes. They do not independently change application UI; linked closed issues and modified recipes remain separate maintenance inputs. Playwright config is categorized here explicitly despite the tool's unmapped bucket.

| Path | Reason |
|---|---|
| `.agents/skills/e2e-testing/references/guide.md` | E2E contributor guidance |
| `.agents/skills/verify-openhands/SKILL.md` | Verification procedure |
| `.agents/skills/verify-openhands/references/adaptation.md` | Verification rationale |
| `.agents/skills/verify-openhands/references/daily.md` | Delta workflow documentation |
| `.agents/skills/verify-openhands/references/feature-map/F01-first-run-and-sign-in.md` | Map documentation; source/issue closure decides live scope |
| `.agents/skills/verify-openhands/references/feature-map/F02-app-shell.md` | Map documentation |
| `.agents/skills/verify-openhands/references/feature-map/F03-home.md` | Map documentation |
| `.agents/skills/verify-openhands/references/feature-map/F05-composer.md` | Map documentation |
| `.agents/skills/verify-openhands/references/feature-map/F06-agent-activity.md` | Map documentation |
| `.agents/skills/verify-openhands/references/feature-map/F07-conversation-page.md` | Map documentation |
| `.agents/skills/verify-openhands/references/feature-map/F08-workspace-files-and-changes.md` | Map documentation |
| `.agents/skills/verify-openhands/references/feature-map/F09-settings-shell.md` | Map documentation |
| `.agents/skills/verify-openhands/references/feature-map/F10-llm-profiles.md` | Map documentation |
| `.agents/skills/verify-openhands/references/feature-map/F17-mcp-servers.md` | Map documentation |
| `.agents/skills/verify-openhands/references/feature-map/F18-skills.md` | Map documentation |
| `.agents/skills/verify-openhands/references/feature-map/F19-plugins.md` | Map documentation |
| `.agents/skills/verify-openhands/references/feature-map/F20-canvas-apps.md` | Map documentation |
| `.agents/skills/verify-openhands/references/feature-map/F23-automation-detail.md` | Map documentation |
| `.agents/skills/verify-openhands/references/feature-map/F24-git-sync.md` | Map documentation |
| `.agents/skills/verify-openhands/references/feature-map/F25-backends-and-cloud.md` | Map documentation |
| `.agents/skills/verify-openhands/references/feature-map/F26-runtime-variants.md` | Map documentation |
| `.agents/skills/verify-openhands/references/feature-map/F27-workspace-tools.md` | Map documentation |
| `.agents/skills/verify-openhands/references/feature-map/README.md` | Map index/baseline documentation |
| `.agents/skills/verify-openhands/references/maintenance.md` | Verification procedure |
| `.agents/skills/verify-openhands/references/mapping.md` | Verification procedure |
| `.agents/skills/verify-openhands/scripts/browser-daemon.mjs` | Verification harness, not product app |
| `.agents/skills/verify-openhands/scripts/control-openhands.mjs` | Verification harness |
| `.agents/skills/verify-openhands/scripts/control-openhands.test.mjs` | Harness tests |
| `.agents/skills/verify-openhands/scripts/lib/baseline.mjs` | Harness baseline helper |
| `.agents/skills/verify-openhands/scripts/lib/call-limit.mjs` | Harness client timeout helper |
| `.agents/skills/verify-openhands/scripts/lib/map-sources.mjs` | Harness source matching helper |
| `.agents/skills/verify-openhands/scripts/lib/testids.mjs` | Harness static test-id helper |
| `.agents/skills/verify-openhands/scripts/lib/tmux-path.mjs` | Harness shell launch helper |
| `__tests__/api/cloud/proxy.test.ts` | Regression tests, no live proof |
| `__tests__/components/backends/cloud-organization-startup.test.tsx` | Regression tests |
| `__tests__/components/chat/chat-add-file-button.test.tsx` | Regression tests |
| `__tests__/components/features/conversation-panel/cloud-new-conversation-menu.test.tsx` | Regression tests |
| `__tests__/components/features/conversation/conversation-name-with-status.test.tsx` | Regression tests |
| `__tests__/components/features/conversation/conversation-tabs-context-menu.test.tsx` | Regression tests |
| `__tests__/components/features/setup-guide/super-admin-setup-guide.test.tsx` | Regression tests |
| `__tests__/components/features/sidebar/sidebar-onboarding-checklist.test.tsx` | Regression tests |
| `__tests__/components/settings/llm-profiles/delete-profile-modal.test.tsx` | Regression tests |
| `__tests__/hooks/mutation/use-add-mcp-server.test.ts` | Regression tests |
| `__tests__/hooks/query/use-backends-health.test.tsx` | Regression tests |
| `__tests__/hooks/query/use-git-repositories.test.ts` | Regression tests |
| `__tests__/query-client-config.behavior.test.ts` | Regression tests |
| `__tests__/utils/retrieve-axios-error-message.test.ts` | Regression tests |
| `playwright.live.config.ts` | Live E2E runner timeout/config; not an unmapped user surface |
| `tests/e2e/live/utils/agent-server-conversation.ts` | Live test helper; cannot substitute for this run's live evidence |
| `tests/e2e/mock-llm/automations/mock-llm-preset-automation.spec.ts` | Mock-LLM test case; never live proof |
| `tests/e2e/mock-llm/files/mock-llm-files-and-git.spec.ts` | Mock-LLM test case |
| `tests/e2e/mock-llm/settings/mock-llm-profile-management.spec.ts` | Mock-LLM test case |

## Limits

PR intent, all linked-issue states and independent live reproductions are coordinator/other-reader responsibilities. This report establishes source consumers and candidate map drift only. No model cost was incurred. No stack was launched, so no shutdown obligation is left by this reader.
