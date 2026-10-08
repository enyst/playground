I'm an AI agent (Codex) helping Engel Nyst (@enyst) with project work.

# Publication outcome — 2026-10-07

The cloud bootstrap and scoped live verification succeeded. Publication is blocked by the configured GitHub integration. No PR or new issue was created, no review was requested, and no merge/approval occurred.

- Canonical repository: `OpenHands/OpenHands`, verified `https://github.com/OpenHands/OpenHands.git`.
- Actual GitHub identity: `enyst`; configured credentials unchanged. API permissions reported upstream maintain/push, but the actual ordinary upstream push returned403 `Permission to OpenHands/OpenHands.git denied to enyst`.
- Verified writable fork: `enyst/playground`, parent/source `OpenHands/OpenHands`. Ordinary pushes succeeded to `astra/map-maintenance-2026-10-07`.
- Issue attempt: `gh issue create --repo OpenHands/OpenHands ... --label bug --body-file <prepared shutdown issue>` returned `GraphQL: Resource not accessible by integration (createIssue)`. The second deduplicated issue remains prepared; the known upstream issue-write denial was not bypassed/retried through other credentials or a connector.
- Single PR attempt: `gh pr create --repo OpenHands/OpenHands --base main --head enyst:astra/map-maintenance-2026-10-07 --draft --title 'docs(verify-openhands): map maintenance 2026-10-07' --body-file <prepared body>` returned `GraphQL: Resource not accessible by integration (createPullRequest)`.
- A fresh416-open-PR enumeration found no existing routine maintenance PR before that attempt. No duplicate was created.
- PR CI and all-hands-bot review are unavailable without a PR; no CI fix round or review round was consumed. Required-status-protection read returned403 `Resource not accessible by integration`. No repeated polling is useful for an operation that GitHub refused.

Prepared title: **docs(verify-openhands): map maintenance 2026-10-07**. [Full exact body](pull-request-body.md) preserves Engel's supplied HUMAN text. [Usable upstream comparison](https://github.com/OpenHands/OpenHands/compare/main...enyst:astra/map-maintenance-2026-10-07) was verified by the owning-repository compare API. A draft gate remains: lifecycle transition video required by the current review guide/template, beyond the retained genuine screenshots and process/port evidence.

Prepared defect titles:

- **[Bug]: control-openhands reports stopped zombie-only stacks as alive** — [full body](../../bugs/2026-10-07/zombie-shutdown/issue-draft.md).
- **[Bug]: More input actions menu stays open after Escape at narrow widths** — [full body](../../bugs/2026-10-07/overflow-escape/issue-draft.md).

Both have independent fresh-stack reproductions, reviewed commit-pinned captures, open/closed dedup searches, observable acceptance criteria and origin unconfirmed. The bug label is intended; no issue number exists to link into a Known failure row. The map explicitly records the integration filing block for the new overflow defect. The harness fix is linked to the existing suitable ready-for-dev maintenance issue#17568, without claiming to close it again.

Smallest publication prerequisite: configure this integration to allow issue/PR creation against the owning upstream repository, while keeping the verified fork push path. No permission expansion was attempted. Remaining verification prerequisites and unexecuted Local boundaries are enumerated in [report.md](report.md); BASE stays `ed815e141409c7b52991ab8d13c553b595da9165`.

Automatic approval review separately rejected the F05 bare slash-command batch because it could launch unbounded model/helper calls, and the local device-form authorization batch because it could approve an OAuth request. Neither was retried. Those checks were blocked in the original run. After Engel’s explicit confirmation, the exact bare-command and local invented-code paths passed with zero model calls on 2026-10-08; see the [continuation](../2026-10-08/README.md). Nonempty model-backed commands and real Cloud authorization remain outside that proof. All owned stacks are stopped, ports are closed, and retained evidence survives.
