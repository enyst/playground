HUMAN:

Engel Nyst (@enyst) set up a daily automation that keeps the verify-openhands feature map current. This PR is its run for main@7af57f8, after PR https://github.com/OpenHands/OpenHands/pull/18134.

---

AGENT:

I'm an AI agent (Codex) helping Engel Nyst (@enyst) with project work.

**Verdict: partial DELTA maintenance; accepted baseline retained.** BASE `ed815e141409c7b52991ab8d13c553b595da9165`; this hosted-cloud continuation freezes canonical TARGET `3500d9e5c7cbdfb5a2cbfe9499ce4448eb10c0a2`. The delta contains 25 first-parent canonical commits / 132 changed paths. Earlier coverage below was collected against its stated revisions, including the previous continuation target `5fea36ab7feaa33420dd8e848a4044e24ba2e939`, and does not establish complete coverage of the new target. Shared consumers conservatively affect F01–F27; the map contains 27 families / 739 stable IDs. Required positive/backend boundaries remain incomplete, so this PR does not advance the README baseline or claim a complete family pass.

This is the authorized continuation of #18183. #18141 was approved and merged by Engel on 2026-10-08; it is not an outstanding draft to close. Its coverage exclusions are reconciled with the new rows: the Super Admin guide and suspended Cloud organization have mapped IDs with explicit positive-path prerequisites. A Local absence check does not establish either positive Cloud/Enterprise behavior. The existing HUMAN text above is preserved exactly.

**Intent reviewed:** the inherited ledger covers #18051, #18085, #18087, #18095, #18093, #18105, #18079, #17988, #17969, #18122, #18084, #18121, #18128, #18086, #17474, #18130, #17985, #18149, #17682, #18134, #18141 and #18138. #18139 was merged into #18138 before its canonical merge and documents the included Canvas tour changes; #18138's older “no tours yet” note is stale. The additional merged commits resolve to #18162 (verification harness), #17665 (Cloud sandbox pause/resume recovery) and #18047 (1.26.0 release metadata). Their intent is reconciled separately; genuine authenticated Cloud resume/retry paths remain unverified. Intent reconciliation does not substitute for live verification of setup continuation or tours.

### Hosted-cloud continuation on 2026-10-08

Continued this same unapproved, routine-owned PR after verifying its upstream head and merging canonical main without rebasing. The only newly authored corrections are Linux zombie-only process classification in the skill CLI and the explicit Escape step for bare `/goal`. Existing video support, map corrections, issue links and HUMAN text are preserved. Relative to the merged main, all PR changes remain under the skill and reviewed `.pr/` evidence.

- Linux shutdown previously returned `launcherStopped:false` for an exited zombie-only process group despite every owned port being closed. The helper now inspects Linux process state, treats only proven exited members as stopped, and conservatively preserves unknown/live state and the reused-process ownership refusal. Two earlier independent fresh stacks reproduced the defect; origin is unconfirmed. At merged head `efc8b473`, a fresh credential-free desktop Local stack passed doctor (15 checks), actual Canvas capture and stop; all five owned ports closed and zombie-only launcher/browser liveness was false. The reviewed report retains the process audit and capture. The deduplicated issue draft is prepared, but GitHub refused `createIssue` with `Resource not accessible by integration` even with the explicitly selected configured `GITHUB_TOKEN_ENYST` authenticated as enyst. No issue was created and no alternate write route was attempted.
- `F05.slash-goal`: on an existing Local conversation, close the suggestion menu with Escape, assert count zero, then press Enter to exercise required-objective validation. The earlier recipe merely completed `/goal ` when the menu was open. Primary and independent fresh-stack checks at historical product target `3f98684763a4e17e6e2faf8dd8f1cfc3969b020c` each passed bare `/btw`, `/goal` and `/model` on desktop/phone (six checks per stack). This is narrow zero-model evidence, not a complete F05 pass or a current-target model execution claim.
- Historical `F25.device-verify-page` local fixture sequences also passed on two fresh stacks at that same target: invented `QA-0000`, real loopback 404/retry behavior, and no external OAuth request. Genuine authenticated Cloud authorization remains blocked on its actual prerequisite.
- No paid model calls were made in this cloud continuation. This run's earlier six genuine bounded Flash calls reported SDK cost USD0.000728664. All later slash/device checks showed empty model usage and zero MessageEvents. Earlier PR-run accounting below is preserved separately; these result sets are not added into a single coverage count.

Current scoped static gates: **58/58 CLI tests pass**; map check **27 families / 739 IDs**, coverage **30 routes / 29 feature component directories**, testids **1000**, baseline and affected commands pass. These include five process-state tests and the existing video plus merged event/network suites. BASE is unchanged. The remaining current-target family reruns, Cloud/Enterprise prerequisites, bounded model-dependent branches and lifecycle transition recording keep this PR a draft. Static Canvas captures plus process/port output supplement the lifecycle check; no temporal video proof is claimed.

[Reviewed hosted-cloud report and closeout](https://github.com/enyst/playground/blob/afa7a661836cb7e5a7975db35ecdd47d7818f3c4/.pr/map-maintenance/2026-10-08/cloud-continuation/README.md), [new-main intent](https://github.com/enyst/playground/blob/afa7a661836cb7e5a7975db35ecdd47d7818f3c4/.pr/map-maintenance/2026-10-08/cloud-continuation/new-main-intent.json) and [lifecycle process/port audit](https://github.com/enyst/playground/blob/afa7a661836cb7e5a7975db35ecdd47d7818f3c4/.pr/map-maintenance/2026-10-08/cloud-continuation/lifecycle/continuation-final-process-audit.json) are pinned to the evidence commit in the actual fork repository, enyst/playground. Older ledgers and media retain their explicit revisions and limits.

### Reviewed live coverage

| Run / scope | Checks | Pass | Fail | Blocked | Not-run |
|---|---:|---:|---:|---:|---:|
| Fresh F24 combined ledger, 26 IDs, Local automation 1.19.0 plus real 1.7.1 unsupported boundary | 34 | 25 | 6 | 2 | 1 |
| Fresh F03 at the current continuation | 52 | 24 | 1 | 10 | 17 |
| Earlier coordinator, historical main@1b6922, narrow F03 scope | 40 | 35 | 0 | 4 | 1 |

Fresh F24 was built at `50dd8dbe153a1fc1e290960de802669539751fc0` and doctored against Agent Server 1.53.0. The combined 34 checks are the current-stack latest 32 plus two distinct real old-producer unsupported passes. Its private current-stack raw ledger has 34 rows before deduplication; those raw counts are not extra coverage. Every entry includes viewport and actual selected backend/scenario. The reporter still keys latest results by feature + entry, and its backend field describes the launched stack; complete private ledgers retain the full identity/history.

The original Claude shard counts and causal assertions are historical claims retained in the existing evidence, not a raw-ledger-verified aggregate for this continuation. They are not added to the counts above. The earlier coordinator's 40 latest rows likewise do not prove current TARGET coverage. Fresh independent reruns of every edited family remain a publication/coverage limit until their own reviewed ledgers are complete.

### Changed rows and evidence limits

| Row / correction | Live outcome or exact remaining boundary |
|---|---|
| F03.create-error-toast; F13.mcp-scope | Historical actual Local desktop/phone Home failure recovered with one 502 toast, prompt retained and Send enabled. Fresh F03 result/evidence: actual Local desktop and phone: one502error replaces Creating, prompt remains and Send is enabled; restart/reload retains the draft. The failed mouse-driven plugin Remove click is the already documented hover-swap harness case; --hover-first150 recovery passes, and the literal recipe now uses that flag. It is not a new product-defect claim.. F13's server/profile/MCP prerequisites must be driven separately before claiming that row verified. |
| F05.plus-menu, F07.status-menu, F08.tabs-menu | Original PR claims Escape/focus recovery after #18095; fresh literal desktop/phone reruns still pending here. F05.overflow-menu keeps known failure #18172. |
| F16.analytics | Historical build-time DNT claim is limited to that build; browser-level DNT/network verification is not established. |
| F02.super-admin-setup-guide | Positive guide/setup path blocked: genuine Enterprise backend with ENABLE_SUPER_ADMIN, first Super Admin and the required setup state. Local absence is a separate negative check. |
| F25.cloud-org-suspended | Positive blocked-workspace path needs an actual authenticated Cloud organization/membership marked is_suspended. It does not require the Super Admin/Enterprise prerequisite above. Local absence is a separate negative check. |
| F25.health-status/share-publicly; F04.load-more | Cadence/menu/data-independent recipe corrections retained; fresh relevant Cloud/control-flow reruns still pending. |
| F21.overview-tiles; F23.run-task-outcome/run-logs-modal | Fresh UI-run script/custom-finish checks pending. Ordinary pinned prompt dispatch has an unbounded 500-iteration path; do not use it without a confident bound. No-finish Completed does not prove summary-only/custom/non-string finish shapes. #18173 remains a known phone Logs failure. |
| F24.encryption | Six genuine failures: set, rotate and clear a key without editing an otherwise non-dirty automation, on desktop and phone. Sync complete/dirty_count0 did not rewrite export files. Keep Expected + Known failure linking OpenHands/automation#551; conditional PATCH cannot waive this check. Actual dirty-edit export is a separate passing branch. |
| Other exercised F24 rows | 25 passes include real configuration/token/interval/sync/export/delete/recovery/phone actions and the actual automation1.7.1 unsupported route. Cloud member permission and two-org conflict are blocked; healthy-service status-only non404 failure is not-run, requiring that genuine fault rather than interception. |
| F10.list-states | Profiles-only failure is blocked without that genuine route failure while the backend stays healthy. The mapped service-down hint and two generic error toasts are a separate Expected/Known failure path; fresh literal verification is still required for that observation. |
| F17 duplicate-error gotcha | Known duplicate MCP error toast links #18181; fresh consumer rerun remains pending. |
| F26.docker-image/desktop-macos-titlebar | Blocked: Docker CLI/daemon and a real built image are unavailable/unexecuted; Helm needs its absent CLI and a real cluster. The current hosted cloud is Linux; positive macOS titlebar/fullscreen proof is blocked on an actual isolated macOS Electron environment and native window controls. A patched-entrypoint historical image is not the released-image proof. #18178 remains linked. |
| README / F27 / setup continuation and tours | Counts/index/source-issue state reconciled; BASE retained. Positive #18138/#18139 continuation/tour flows explicitly remain not live-mapped with their real Enterprise/context prerequisites. |

Existing issue links are preserved: #18172, #18173, #18178, #18181 and OpenHands/automation#551. Linked product fix PRs are separate work; no product fix or new issue was filed by this continuation. Do not infer a regression or a merged fix from those links. Current issue/fix status before publication: #18172/#18173/#18178/#18181 remain open; their separate fix PRs#18174/#18175/#18180/#18182 are unmerged. Automation#551 is closed upstream but the reproduced defect remains in the pinned1.19.0; no claim of a Canvas regression. Final refresh follows the serial checks..

## Why

Keep verification recipes, coverage accounting and retained evidence consistent with current behavior while exposing unfinished delta coverage. Temporal assertions need recordings that show the actual trigger, transition and resulting UI.

## Summary

- Add opt-in skill CLI `browser video start --feature ID --name NAME`, `stop` and `status`, using the existing owned page and public pinned Playwright screencast API. Private staging, genuine-frame validation, bounded finalization and exclusive copying prevent empty clips or overwrite; shutdown/close finalizes owned recordings.
- Correct the F03 error recipe's observation/waits and F24 non-dirty encryption failure checks; reconcile map/index wording and retain the accepted baseline. All modifications stay under verify-openhands and reviewed `.pr/` evidence.
- Keep historical and fresh outcomes separate. No Canvas/SDK/automation product implementation changes or dependency upgrades.

## Issue Number

Refs #18092 (OpenHands/OpenHands; enhancement and ready-for-dev confirmed). This partial pass does not close the tracker.

### Linked issue #18092 acceptance checklist

This partial continuation does not close #18092. The original and triage criteria are accounted for separately; unchecked items remain partial or unverified.

- [ ] Original: drive every drift candidate live and correct its map row or file an owning product issue. Partial: fresh F03 covers some Home paths; F01/F06/F07/F13/F22/F25/F26 candidates are not all complete.
- [ ] Original: give every unmapped behavior a proven recipe or explicit index Not mapped reason. Partial: the full F01/F05/F06/F09/F10/F17/F18/F20/F25/F26/F27 inventory is not closed out here.
- [ ] Original: map check and coverage remain green. Last inspected checks were green; final pushed-head validation is pending.
- [ ] Triage: individually resolve drift candidates1–9 (F13.acp-conversation, F06.critic-result, F26.frontend-only, F03.selection-after-reload, F22.template-launch-conversation, F07.git-control-bar, F01.onboarding-choose-agent, F25.add-agent-server, F06.load-older-history). Partial; no aggregate completion from mock/source evidence.
- [ ] Triage: resolve F13 ACP/F06 critic blocks or name their exact attempted route/prerequisite. A synthetic mock ACP/LLM result is regression coverage, not this pass's live proof; genuine supported producers and bounded model execution remain prerequisites.
- [ ] Triage: account for every unmapped behavior in all named families, including intermediate responsive widths. Partial inventory; whole-tracker completion is not claimed.
- [ ] Triage: verify accepted removal of the F07 composer git rail after adding a GitHub origin/reload; match the observation or link an owning bug. Fresh check pending; the accepted design is not reopened.
- [ ] Triage: every new/corrected row meets the four-section contract, stable IDs and runnable commands. Static checks were green; final-head checks and independently executed changed recipes remain pending.
- [ ] Triage: final map check/coverage pass and changed counts/index are refreshed. Current index739 IDs; final pushed-head checks pending.
- [x] Triage: keep product code, e2e specs and CI workflows out of this map-correction PR. Current continuation changes are limited to skill/evidence; product failures remain separate issue/PR work.
- [ ] Triage: all retained evidence contains no keys/session data/secrets. Secret review withheld two original captures; every final retained file/link still needs closing review before publication.

## How to Test

```sh
export PATH="$PWD/.agents/skills/verify-openhands/scripts:$PATH"
control-openhands map check
control-openhands map coverage
control-openhands map testids
control-openhands map baseline
control-openhands map affected --base ed815e141409c7b52991ab8d13c553b595da9165 --target 3500d9e5c7cbdfb5a2cbfe9499ce4448eb10c0a2
```

Current merged integration passed **58/58** scoped Node-environment CLI tests (including five process-state cases), map check27families/739IDs, coverage30routes/29featurecomponentdirs and1000testid citations. Earlier video-only heads passed47tests; those are historical runs. Unit encoder/HTTP fixtures are regression proof, not live backend/LLM evidence.

Run the isolated Node suite from the checkout root (no frontend/jsdom setup):

```sh
verify_test_dir="$(mktemp -d)"
cat > "$verify_test_dir/vitest.config.mjs" <<'EOF'
import { fileURLToPath } from 'node:url';
export default {
  cacheDir: fileURLToPath(new URL('./cache', import.meta.url)),
  test: { environment: 'node', include: ['.agents/skills/verify-openhands/scripts/control-openhands.test.mjs', '.agents/skills/verify-openhands/scripts/process-state.test.mjs'], exclude: ['node_modules/**'] }
};
EOF
npx vitest run --config "$verify_test_dir/vitest.config.mjs"
```

An earlier independent rerun of the video-only configuration passed47/47 in19.50s; the current merged configuration above has58tests.


Live: launch each relevant family with `control-openhands launch --new`, export that OH_VERIFY_RUN, doctor, select the actual backend and drive its recipe literally on desktop/phone and each required user entry point. Start recording before a temporal action; `browser video stop` finalizes it. Inspect decoded clips and screenshots before accepting them. Missing FFmpeg is an actionable prerequisite (`npx playwright install ffmpeg`); the CLI does not install it silently.

Historical cleanup: F24's own fixtures were deleted, Git Sync interval disabled and repository cleared; its three owned runs/ports stopped and reviewed evidence survived. Earlier F03 cleanup recorded its owned processes gone, five ports closed and18media retained. Those entries do not establish completion of the pending F21/F23 checks.

This cloud continuation stopped all four confirmed-check stacks (20ports closed) and its new integration lifecycle stack (five ports closed); reviewed captures survived and private ledgers remain private. Incremental paid calls/spend are zero. Historical PR-run budget accounting was USD0.29 conservative provider-balance depletion with SDK-observed USD0.009785682 across six bounded Flash tasks. This run's separately stated historical SDK cost is USD0.000728664. No additional model work was started; every future task still needs a confident bound within the shared USD10 cap.

## Video/Screenshots

Hosted-cloud integration at `efc8b473`: genuine desktop1440×1000, actual selected Local, no model configured. This still proves Canvas rendering; the paired process/port audit proves shutdown state. It does not prove the temporal stop transition. Evidence is pinned to **enyst/playground**, where this continuation's reviewed captures are retained.

![Hosted-cloud Local lifecycle bootstrap](https://raw.githubusercontent.com/enyst/playground/afa7a661836cb7e5a7975db35ecdd47d7818f3c4/.pr/map-maintenance/2026-10-08/cloud-continuation/lifecycle/desktop-local-home.png)

Historical bare `/goal` validation after Escape, selected Local, phone390×844 at product target`3f986847`: narrow client-validation proof, no model execution or full-family claim.

![Historical phone bare goal validation](https://raw.githubusercontent.com/enyst/playground/afa7a661836cb7e5a7975db35ecdd47d7818f3c4/.pr/map-maintenance/2026-10-08/cloud-continuation/F05-independent/goal-corrected-phone.png)


Fresh F03 desktop: actual Local failure action → one error replacing loading → prompt retained/Send enabled. Native1440×1000clip fills the viewport; encoded duration is not wall-clock latency.

![Fresh F03 desktop error recovery](https://raw.githubusercontent.com/OpenHands/OpenHands/01037c310c30d259f394f663388b83aac849d1c5/.pr/map-maintenance/2026-10-08/codex-review/F03-independent/F03.create-error-toast/desktop-independent-early-toast.png)

[Fresh F03 desktop transition video](https://raw.githubusercontent.com/OpenHands/OpenHands/01037c310c30d259f394f663388b83aac849d1c5/.pr/map-maintenance/2026-10-08/codex-review/F03-independent/F03.create-error-toast/desktop-independent-failed-launch.webm)

Fresh F03 phone: same actual Local transition at 390×844. The390×844native file contains scaled UI pixels ending around y590 and roughly254px gray bottom padding. The paired full screenshot supplies layout proof; the clip proves the visible loading→error order.

![Fresh F03 phone error recovery](https://raw.githubusercontent.com/OpenHands/OpenHands/01037c310c30d259f394f663388b83aac849d1c5/.pr/map-maintenance/2026-10-08/codex-review/F03-independent/F03.create-error-toast/phone-independent-early-toast.png)

[Fresh F03 phone transition video](https://raw.githubusercontent.com/OpenHands/OpenHands/01037c310c30d259f394f663388b83aac849d1c5/.pr/map-maintenance/2026-10-08/codex-review/F03-independent/F03.create-error-toast/phone-independent-failed-launch.webm)

F24 desktop/phone: genuine non-dirty encryption change and Sync complete with unchanged exported files; the API/Git inspection supplements the visible sequence.

![F24 non-dirty key rotation](https://raw.githubusercontent.com/OpenHands/OpenHands/01037c310c30d259f394f663388b83aac849d1c5/.pr/map-maintenance/2026-10-08/codex-review/F24/F24.encryption/non-dirty-rotate-desktop.png)

[F24 non-dirty key rotation video](https://raw.githubusercontent.com/OpenHands/OpenHands/01037c310c30d259f394f663388b83aac849d1c5/.pr/map-maintenance/2026-10-08/codex-review/F24/F24.encryption/non-dirty-rotate-desktop.webm)

Two original historical PNGs were withheld from the current revision after privacy review: F23-run-task-outcome-unknown.png and bugs/run-logs-overflow/long-desktop.png expose private callback/session URLs. They are not retained evidence for this continuation; no history rewrite or alteration of older pinned commits/links is claimed. Historical captures of an unmerged product fix or patched Docker entrypoint do not establish behavior at the frozen TARGET. Remove their stale embeds and replace them only with reviewed genuine current captures.

All links below pin the actual OpenHands/OpenHands evidence commit. Historical captures and fresh results are separated in the reviewed manifest; two callback-bearing screenshots are withheld from the current head, without rewriting older history.

[Reviewed per-check ledgers and evidence manifest](https://github.com/OpenHands/OpenHands/tree/01037c310c30d259f394f663388b83aac849d1c5/.pr/map-maintenance/2026-10-08/codex-review). [Every changed row and its pending boundaries](https://github.com/OpenHands/OpenHands/blob/01037c310c30d259f394f663388b83aac849d1c5/.pr/map-maintenance/2026-10-08/codex-review/changed-row-live-outcomes-reviewed.json).

## Design Doc

[Video harness design preview](https://htmlpreview.github.io/?https://github.com/OpenHands/OpenHands/blob/01037c310c30d259f394f663388b83aac849d1c5/.pr/map-maintenance/2026-10-08/video-harness-design.html)

Before, the CLI could capture static screenshots only; after, an explicit video lifecycle records the same owned browser page. The helper adds no product API or persisted Canvas state. The private recording is published only after frames and finalized WebM are checked; page/context shutdown closes recording before browser teardown. Risks are incomplete native capture bounds, encoder availability and interrupted finalization; captions expose bounds and failures are reported without accepting empty proof. Essential code links: [video helper](https://github.com/OpenHands/OpenHands/blob/9532e87918e1092941e553ff0907d67999b448b2/.agents/skills/verify-openhands/scripts/lib/browser-video.mjs), [daemon lifecycle](https://github.com/OpenHands/OpenHands/blob/9532e87918e1092941e553ff0907d67999b448b2/.agents/skills/verify-openhands/scripts/browser-daemon.mjs), [CLI](https://github.com/OpenHands/OpenHands/blob/9532e87918e1092941e553ff0907d67999b448b2/.agents/skills/verify-openhands/scripts/control-openhands.mjs).

## Type

- [x] Bug fix
- [x] Feature
- [ ] Refactor
- [ ] Breaking change
- [x] Docs / chore

## Notes

Partial coverage leaves BASE unchanged and this PR a draft. Both existing bot review threads were previously answered with attribution and resolved; refresh found no unanswered actionable current thread or approval. No repeated review request was sent. CI status will be checked on the actual pushed head; older checks do not establish new-head validation. Preserve the bot-maintained Docker block below: it describes its stated historical image commit and does not prove a fresh F26 Docker run.

<!-- AGENT_CANVAS_DOCKER_START -->
---
**🐳 Docker images for this PR**

• **GHCR package:** https://github.com/OpenHands/OpenHands/pkgs/container/agent-canvas

| Component | Value |
|---|---|
| **Image** | `ghcr.io/openhands/agent-canvas` |
| **Architectures** | amd64, arm64 |
| **Agent Server** | `ghcr.io/openhands/agent-server:1.53.0-python` |
| **Automation** | `openhands-automation==1.19.0` |
| **Commit** | `2161e947f47f59010e8d982b06be1e1a62540f0d` |

**Pull (multi-arch manifest)**
```bash
# Multi-arch manifest — Docker automatically pulls the correct architecture
docker pull ghcr.io/openhands/agent-canvas:sha-2161e94
```

**Run**
```bash
docker run -it --rm \
  -p 8000:8000 \
  ghcr.io/openhands/agent-canvas:sha-2161e94
```

**All tags pushed for this build**
```
ghcr.io/openhands/agent-canvas:sha-2161e94-amd64
ghcr.io/openhands/agent-canvas:claude-clever-cori-2n9yrr-amd64
ghcr.io/openhands/agent-canvas:pr-18183-amd64
ghcr.io/openhands/agent-canvas:sha-2161e94-arm64
ghcr.io/openhands/agent-canvas:claude-clever-cori-2n9yrr-arm64
ghcr.io/openhands/agent-canvas:pr-18183-arm64
ghcr.io/openhands/agent-canvas:sha-2161e94
ghcr.io/openhands/agent-canvas:claude-clever-cori-2n9yrr
ghcr.io/openhands/agent-canvas:pr-18183
```

**About Multi-Architecture Support**
- Each tag (e.g., `sha-2161e94`) is a **multi-arch manifest** supporting both **amd64** and **arm64**
- Docker automatically pulls the correct architecture for your platform
- Individual architecture tags (e.g., `sha-2161e94-amd64`) are also available if needed
<!-- AGENT_CANVAS_DOCKER_END -->
