I'm an AI agent (Codex) helping Engel Nyst (@enyst) with project work.

# Reviewed evidence index — 2026-10-07

Application revision: OpenHands/OpenHands `3f98684763a4e17e6e2faf8dd8f1cfc3969b020c`. These are representative captures from independent hosted-cloud stacks, not full-family completion evidence. See [the maintenance report](report.md) for coverage and blocked checks. All runs used Agent Server 1.53.0; F24 used bundled automation 1.19.0. The selected backend and actual viewport are stated below rather than inferred from the reporter's launch metadata.

Every linked image was visually inspected before copying. Copies preserve the original bytes. The three JSON files were read in full and contain only inert fixture Git output or request timestamps without headers/bodies. No raw private ledger, private logs, provider keys, session keys, browser state, or device authorization codes are included. [SHA-256 checksums](evidence-sha256.txt) cover these 18 images and three JSON files.

The F05/F07/F08 conversations used genuine bounded DeepSeek replies on fresh Local stacks. They are fixture arrangements for menu checks; they do not establish composer Send, agent tools, or title-generation behavior. The screenshots show rendered states; the count/focus assertions below come from actual CLI checks recorded in the private ledgers and summarized in the maintenance report. No recording or animation-duration claim is made.

## Composer menu — F05.plus-menu

| Captures | Run / actual entry | What was observed |
| --- | --- | --- |
| [Before](F05/primary-desktop-before-escape.png), [after](F05/primary-desktop-after-escape.png) | `f05-primary`; desktop 1440×1000; selected **Local**; conversation composer; genuine `fixture-ok` reply | Tools menu opened, then Escape removed it. Count became 0, `aria-expanded=false`, and focus returned to `chat-plus-button`. |
| [Before](F05/independent-phone-before-escape.png), [after](F05/independent-phone-after-escape.png) | `f05-independent`; phone 390×844; selected **Local**; conversation composer; genuine `pong` reply | Same Escape/focus result on a separate fresh stack. |

The full changed recipe also checked Home, focus inside the menu, and command-dialog layering at both viewports in both runs; the images above are the representative direct-dismissal captures. The separate narrow **More input actions** Escape defect is not this menu; its capture lives under the bug evidence directory.

## Status-dot menu — F07.status-menu

| Captures | Run / actual entry | What was observed |
| --- | --- | --- |
| [Before](F07/primary-phone-before-escape.png), [after](F07/primary-phone-after-escape.png) | `2026-10-07T2131-3cbdf2`; phone 390×844; selected **Local**; completed genuine conversation | Focus trigger → Enter opened the status menu; Escape changed menu count 1→0 and kept focus on `server-status-menu-trigger`. |
| [Before](F07/independent-desktop-before-escape.png), [after](F07/independent-desktop-after-escape.png) | `f07-independent`; desktop 1440×1000; selected **Local**; completed genuine conversation | Hover and focused Enter were checked separately. Escape closed the menu; keyboard dismissal restored trigger focus. |

Both runs also checked the other viewport. The primary screenshot's `Running / Stop Runtime` label describes a finished Local conversation's runtime, not a currently generating model. These captures prove dismissal, not the stop/restart control flow.

## Workspace overflow — F08.tabs-menu

| Captures | Run / actual entry | What was observed |
| --- | --- | --- |
| [Before](F08/primary-desktop-before-escape.png), [after](F08/primary-desktop-after-escape.png) | `2026-10-07T2140-0f3b48`; desktop 1440×1000; selected **Local**; `/conversations/<id>` with Commits drawer and inert Git fixture | Overflow opened; Escape removed its rows and restored focus to the drawer's `ellipsis-button`. Keyboard Enter and pointer entry were both checked. |
| [Before](F08/independent-phone-before-escape.png), [after](F08/independent-phone-after-escape.png) | `f08-independent`; phone 390×844; selected **Local**; direct `/conversations/<id>/panel`, Usage selected | Fresh-stack rerun of keyboard and pointer entry: Escape removed the menu and restored ellipsis focus. Usage figures belong to the genuine tiny fixture reply. |

Both runs also checked the other viewport. The new tab-close wait recipe has separate live hidden-state assertions in the report; these static images do not assert animation timing.

## Encryption key without an automation edit — F24.encryption

| Capture / readback | Run / actual entry | What was observed |
| --- | --- | --- |
| [Card](F24/primary-key-set-without-edit.png), [Git output](F24/primary-git-readback.json) | `f24-primary`; desktop viewport 1440×1000, card crop 848×452; selected **Local**; `/automations/git-sync`; automation 1.19.0 | Save key → Sync now before editing the automation showed `Encrypted`, `Sync complete`, pending 0, and commit `c1b1b8b`. Readback of that commit retains plaintext YAML. A later individual automation edit produced ciphertext at `73a0081`; cleanup removed exported fixture files at `82db080`. |
| [Card](F24/independent-key-set-without-edit.png), [Git output](F24/independent-git-readback.json) | `f24-independent`; desktop viewport 1440×1000, card crop 848×452; selected **Local**; same key-without-edit scenario on automation 1.19.0 | Separate fresh stack: before/after HEAD both `80a33a5f2d4c2296f6cf7b5581010c32e33139f7`, while the card reports success and plaintext YAML remains. |

This reproduces existing [OpenHands/automation#551](https://github.com/OpenHands/automation/issues/551) at the application's bundled version. It does not establish a regression. The automation is an inert, never-triggered fixture. The ciphertext readback is fixture output, not a credential; no encryption key is included.

## Backend health, collapsed rail and shared-view wording — F25

| Capture / readback | Run / actual entry | What was observed |
| --- | --- | --- |
| [Disconnected Manage row](F25/primary-desktop-manage-down.png) | `f25-primary`; desktop 1440×1000; selected **QA_Renamed**, a second Local Agent Server at `127.0.0.1:18850`; already-loaded page after that service stopped | Red disconnected dot, detailed error, and unavailable selected row. The primary 25-second wait happened near the next health tick and passed; this image does not claim the old timeout failed. |
| [Independent disconnected row](F25/independent-desktop-manage-down.png), [request timestamps](F25/independent-local-health-requests.json) | `f25-independent`; desktop 1440×1000; selected **QA_Renamed**, a separate Local Agent Server at `127.0.0.1:18870`; existing page after service stop | Edited 45-second wait succeeded; disconnected detail and disabled row matched. Healthy `/server_info` requests at 21:47:14.872 and 21:47:44.888 UTC are 30.016 seconds apart. These local-server requests do not prove Cloud cadence. |
| [Hover reveals expand chevron](F25/independent-desktop-hover-expand.png) | `f25-independent`; desktop 1440×1000; selected **Local**; collapsed sidebar, after Add/Manage entry checks | Hovering the OpenHands Logo reveals the chevron at upper left. The following exact recipe click changed `data-collapsed` to `false`. The screenshot captures the pre-click hovered state. |
| [Shared view](F25/independent-phone-shared-not-found.png) | `f25-independent`; phone 390×844; selected **Local** before standalone `/shared/conversations/<id>` | `Conversation not found` page with plain `Not Found` toast and no app shell. Both shared endpoints returned 404. This updates stale raw-error wording; it is not authenticated Cloud sharing evidence. |

F25 checks made no paid provider calls. The no-provider profile used for independent backend navigation was a fixture, not an LLM-success claim. Primary and independent runs separately checked the collapsed-rail hover/click recipe, shared-view desktop and phone wording, and the Local-server health behavior. Authenticated Cloud and Enterprise prerequisites remain blocked as described in the report.
