I'm an AI agent (Codex) helping Engel Nyst (@enyst) with project work.

# Approved bare slash-command checks — primary, 2026-10-08

Six scoped checks passed on the fresh `f05-approved-primary` stack: bare `/btw`, `/goal`, and `/model` at desktop 1440×1000 and phone 390×844, selected **Local**, Agent Server 1.53.0. Application TARGET remained `3f98684763a4e17e6e2faf8dd8f1cfc3969b020c`; the maintenance checkout was `370a04785c78ddd014e5ea8c76883f129e1d07de`.

The fixture was an actual API-created conversation with no `initial_message`, `autotitle: false`, and no tools, client tools, plugins, critic, condenser, hooks, or security analyzer. Its saved capped `deepseek/deepseek-flash` profile was created/activated without validation. No model response was supplied or mocked. It stayed `idle` throughout. This is valid evidence for client validation and saved-profile listing, not for a completed agent turn.

Before every Enter, the CLI verified the exact conversation pathname and exact bare composer text, no uploaded files, no Stop button or goal status, then pressed Escape and confirmed slash-command-menu count 0. The composer cleared after every submission. All six screenshots were visually inspected and are copied byte-for-byte; they show only fixture UI and key-presence text (`api_key: set`), never the key value.

| Check | Desktop / phone evidence | Result |
| --- | --- | --- |
| Bare `/btw` | [Desktop](F05.slash-btw-desktop.png), [phone](F05.slash-btw-phone.png) | `Please provide a question — e.g. /btw <question>` toast; no BTW card; composer clears. |
| Bare `/goal` | [Desktop](F05.slash-goal-desktop.png), [phone](F05.slash-goal-phone.png) | `Please provide an objective — e.g. /goal <objective>` toast; no goal status; composer clears. |
| Bare `/model` | [Desktop](F05.slash-model-desktop.png), [phone](F05.slash-model-phone.png) | `Available profiles (1)`; expanding the saved `deepseek-flash` row shows `deepseek/deepseek-flash`, base URL `—`, and `api_key: set`. |

[Accounting and exact scope](zero-call-accounting.json) retain the before/after empty `stats.usage_to_metrics`, MessageEvent count 0 before/after, and final idle status. The same accounting was checked after each submission. Provider requests: **0**; spend: **USD 0**. Shutdown reported browser and launcher stopped, all reported owned ports closed, and evidence retained.

Source audit: `use-btw-interceptor.ts` returns the required-question toast before `askAgent` for an empty question; `use-goal-interceptor.ts` returns the required-objective toast before `startGoal`; `use-model-interceptor.ts` lists profiles through `ProfilesService.listProfiles`. The SDK uses `GET /api/profiles`, whose installed server handler only reads saved summaries/settings. Profile-detail expansion only changes React state. Bare `/btw` or `/goal` on Home would instead fall through to regular conversation submission, so this pass never submitted them there.

Proven recipe correction candidate: explicitly close the slash menu with Escape before Enter for bare `/goal`, matching the map's general slash-menu gotcha and the `/btw`/`/model` steps. The tested one-profile fixture intentionally differs from the full recipe's two-profile setup; no claim is made for switching to DeepSeek Pro or handling unknown profiles. Nonempty `/btw` questions, `/goal` objectives/Stop/Resume, ordinary Send, and plan/code execution remain outside this continuation. These six passes do not complete F05 or authorize baseline advancement.
