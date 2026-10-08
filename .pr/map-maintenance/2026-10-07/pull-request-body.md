HUMAN:

Engel Nyst (@enyst) set up a daily automation that keeps the verify-openhands feature map current. This PR is its run for main@3f98684763a4, after PR https://github.com/OpenHands/OpenHands/pull/18128.

---

AGENT:

I'm an AI agent (Codex) helping Engel Nyst (@enyst) with project work.

Partial delta maintenance: publish only independently verified map/CLI corrections. BASE remains `ed815e141409c7b52991ab8d13c553b595da9165`; frozen TARGET is `3f98684763a4e17e6e2faf8dd8f1cfc3969b020c`. All13 merged PRs and75 changed paths were reconciled with intent; broader error paths and Cloud/Enterprise checks are unfinished. No product code changed.

## Why

The map still described repaired menu Escape failures, a10-second health cadence and raw404 text. Its encryption recipe edited the automation before checking whether saving a key rewrote existing plaintext, hiding a still-reproducible bundled-runtime defect. In this hosted Linux executor, unreaped zombies also made the CLI report stopped stacks as alive.

## Summary

- `F05.plus-menu`, `F07.status-menu`, `F08.tabs-menu`: desktop/phone Escape and focus passed on primary and independent fresh stacks; remove stale #18094 wording. `F08.tab-bar` waits for the actual hidden state. Narrow `F05.overflow-menu` Escape remains broken, independently reproduced; draft retained because issue creation was denied.
- `F24.encryption`: check Sync now and Git contents before any automation edit. Existing automation#551 still fails at bundled1.19.0 despite upstream closure by#563; edit-triggered encryption passes. `F25.health-status`/`remove-backend` use45-second waits for measured30-second Local probes; `collapsed-entry` reveals the chevron before clicking; `shared-view` expects plain Not Found. `F25.edit-escape` retains dated Known failure #17953.
- Keep stable736 IDs and BASE. Add explicit Not mapped prerequisites for Enterprise setup guide and org/member suspension. Fix CLI Linux liveness classification for proven zombie-only groups; preserve conservative unknown/live-member handling and unrelated-process ownership refusal.

## Issue Number

Related to https://github.com/OpenHands/OpenHands/issues/17568 — verified suitable and labeled `ready-for-dev`; it is already closed, so this PR does not claim to close it again.

Linked existing defects: https://github.com/OpenHands/automation/issues/551, #17953, #18063, #17567. New deduplicated drafts: zombie-only shutdown classification and narrow overflow Escape. Both have second-agent fresh-stack reproductions, origin unconfirmed, no baseline-live regression claim. Upstream `createIssue` returned `Resource not accessible by integration`; no issues were filed or permissions bypassed.

## How to Test

From this checkout with configured proxy/CA, Node24+, uv and supported Chromium, add `.agents/skills/verify-openhands/scripts` to PATH and use a private run-owned `OH_VERIFY_HOME`:

```sh
control-openhands map check
control-openhands map coverage
control-openhands map testids
control-openhands map baseline
control-openhands map affected --base ed815e141409c7b52991ab8d13c553b595da9165 --target 3f98684763a4e17e6e2faf8dd8f1cfc3969b020c
npx vitest run .agents/skills/verify-openhands/scripts/control-openhands.test.mjs .agents/skills/verify-openhands/scripts/process-state.test.mjs
export OH_VERIFY_RUN=$(control-openhands launch --new --print-run)
control-openhands doctor
control-openhands browser goto /
control-openhands onboard --skip
control-openhands browser screenshot --feature harness.shutdown --name live
control-openhands stop
control-openhands status
```

Executed: locked npm install; genuine headless cloud launch/doctor/snapshot/capture/stop; full skill tests42/42; independent focused process tests5/5; map check27families/736IDs; coverage30routes with explicit setup-guide exclusion;999 testids resolved; diff checks clean. The pre-fix stop returned `ok:false` for zombie-only processes with all ports closed. The corrected fresh run returned `ok:true`, closed all ports and retained evidence. Real live-member and unrelated reused-group tests still prevent incorrect shutdown.

Primary scoped results below count feature+entry checks, not complete family coverage. All21 other source-affected families have explicit not-run/blocked boundaries in the report; shared consumers expand source scope to all27families. Full private ledgers retain superseded entries. Every counted entry states viewport and actual selected backend/scenario.

| Family | Pass | Fail | Blocked | Not-run |
|---|---:|---:|---:|---:|
| F01 |24|0|5|2|
| F05 |22|3|17|0|
| F07 |15|0|9|4|
| F08 |18|1|7|9|
| F24 |25|1|2|1|
| F25 |27|1|18|17|
| Total |131|6|58|33|

All13 PRs covered: #18051, #18085, #18087, #18095, #18093, #18105, #18079, #17988, #17969, #18122, #18084, #18121, #18128. The closure audit read46issues across Canvas, SDK and automation without failed reads. [Full intent/coverage report](https://github.com/enyst/playground/blob/bd663a89e351cd0f88fecb098003f3d839c9c4cd/.pr/map-maintenance/2026-10-07/report.md).

## Video/Screenshots

[Reviewed captures and exact viewport/backend captions](https://github.com/enyst/playground/blob/bd663a89e351cd0f88fecb098003f3d839c9c4cd/.pr/map-maintenance/2026-10-07/evidence-index.md) are commit-pinned in **enyst/playground**, the repository actually containing the pushed evidence.

![Independent Local phone composer after Escape](https://raw.githubusercontent.com/enyst/playground/bd663a89e351cd0f88fecb098003f3d839c9c4cd/.pr/map-maintenance/2026-10-07/F05/independent-phone-after-escape.png)

![Independent Local encryption status before automation edit](https://raw.githubusercontent.com/enyst/playground/bd663a89e351cd0f88fecb098003f3d839c9c4cd/.pr/map-maintenance/2026-10-07/F24/independent-key-set-without-edit.png)

[Shutdown before/after genuine Canvas captures and process/port proof](https://github.com/enyst/playground/blob/6ba8df88082528ec5f1fb7bc0bef3bba6e3ce9df/.pr/bugs/2026-10-07/zombie-shutdown/reproduction.md).

**Draft gate:** the functional lifecycle correction lacks a transition video. The current custom review guide requires video of temporal trigger/transition/final state, and the template says “Use video for timing or transitions.” The supported browser CLI has no video verb. Screenshots and live process checks establish outcomes but do not satisfy that recording requirement.

## Design Doc

Small skill-local correction: Linux signal0 remains the first presence check; `/proc` proves whether all visible group members have exited. Unknown inspection stays conservatively alive; existing command-line ownership checks are unchanged. No frontend/product architecture change or separate HTML design is needed.

## Type

- [x] Bug fix
- [ ] Feature
- [ ] Refactor
- [ ] Breaking change
- [x] Docs / chore

## Notes

Remaining prerequisites: authorized real Cloud/Enterprise admin/org fixtures and Git integration; a safely bounded model/tool path for normal UI launches; unfinished Local shared-error checks and full phone sequences; lifecycle video. BASE cannot advance. No mocked model response was used as live proof. Six bounded DeepSeek flash calls cost USD0.000728664 as reported by the SDK; conservative no-cache pricing is about USD0.0060108, below the USD1.95 reservation and USD10 cap.

All owned stacks/process groups are inactive, all owned ports closed, and evidence retained. Private homes, raw ledgers/network logs, provider/session keys and device codes stay outside GitHub. After explicit user confirmation on 2026-10-08, bare `/btw`, `/goal` and `/model` and local invented-code device submissions passed on desktop/phone with independent fresh-stack checks and zero additional model calls. The bare `/goal` recipe now dismisses suggestions before Enter. Follow-up evidence is retained under `.pr/map-maintenance/2026-10-08/`; nonempty model-backed commands and real Cloud authorization remain outside that proof. CI/review status will be reported after creation if GitHub permits the operation. Never merge or approve this automation PR.
