# Weekly Architecture Docs Audit Plan (via OpenHands Cloud)

Goal: Use OpenHands Cloud API, once per week, to review and update the architecture docs in this repository. If material changes are found, open a PR with a clear technical report. If not, summarize findings and do nothing.

Summary of approach:
- Only one secret required: `OPENHANDS_API_KEY` (Cloud API token). We do NOT send provider LLM API keys via GitHub Actions.
- Python client in `scripts/cloud_api.py` with discrete methods:
  - `store_llm_settings(...)` (defined but not invoked by the weekly workflow)
  - `create_conversation(...)`, `get_conversation(...)`, `get_trajectory(...)`, `poll_until_complete(...)`
- Job starts a conversation using `/api/conversations` with task-specific prompt and instructions.
- Cloud agent performs repo work (including PR creation when needed).

Files added:
- `.github/workflows/weekly-arch-docs-cloud.yml` – scheduled workflow to start a Cloud conversation
- `scripts/cloud_api.py` – minimal Python client for Cloud API
- `scripts/weekly_arch_docs_task.py` – sample entrypoint to start the conversation programmatically

Secrets required:
- `OPENHANDS_API_KEY` – Bearer token for Cloud. LLM settings are managed in Cloud, not sent from CI.

Why not send LLM_API_KEY, etc.?
- The Cloud API supports storing settings via `/api/settings`, but this workflow intentionally avoids transmitting provider keys from CI. Those should be configured within the Cloud account (or via an admin-only script using `store_llm_settings` if absolutely necessary).

Future options:
- Optionally add a step to poll conversation status or fetch trajectory for repo comments.
- Optionally call `store_llm_settings(...)` in a separate, manual workflow if you want CI to update Cloud settings.
