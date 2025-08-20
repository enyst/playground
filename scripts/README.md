# OpenHands Cloud Automation Scripts

This directory contains Python scripts for automating tasks with OpenHands Cloud API.

## Files

- `cloud_api.py` - OpenHands Cloud API client library
- `llm_conversation.py` - Main CLI script for LLM configuration and conversation management
- `prompts/new_conversation.j2` - Jinja2 template for new conversation prompts

## Usage

### Configure LLM Settings

Configure LLM settings from repository secrets:

```bash
python llm_conversation.py configure-llm
```

This reads the following environment variables (typically set as repository secrets):
- `LLM_MODEL` - The LLM model to use (e.g., "gpt-4", "claude-3-sonnet")
- `LLM_BASE_URL` - Base URL for the LLM API (optional)
- `LLM_API_KEY` - API key for the LLM provider (optional)
- `OPENHANDS_API_KEY` - OpenHands Cloud API key (required)

### Start New Conversation

Start a new conversation using the `new_conversation.j2` template:

```bash
python llm_conversation.py new-conversation
```

Optional parameters:
- `--repository owner/repo` - Git repository to work with
- `--branch branch-name` - Git branch to use
- `--poll` - Poll until conversation completes
- `--api-key KEY` - Override OPENHANDS_API_KEY environment variable

### Combined Operation

Configure LLM settings and start a new conversation in one command:

```bash
python llm_conversation.py configure-and-start --repository owner/repo --poll
```

## Environment Variables

- `OPENHANDS_API_KEY` - Required. Your OpenHands Cloud API key
- `GITHUB_TOKEN` - Optional. For GitHub issue commenting (automatically provided in GitHub Actions)
- `LLM_MODEL` - Required for LLM configuration. The model to use
- `LLM_BASE_URL` - Optional. Custom base URL for LLM API
- `LLM_API_KEY` - Optional. API key for the LLM provider

## Dependencies

- `requests` - For HTTP API calls
- `jinja2` - For template rendering

## API Client

The `OpenHandsCloudAPI` class provides methods for:
- `store_llm_settings()` - Configure LLM settings
- `create_conversation()` - Start new conversations
- `get_conversation()` - Get conversation status
- `get_trajectory()` - Get conversation event history
- `poll_until_stopped()` - Wait for conversation to stop
- `post_github_comment()` - Post comments to GitHub issues


# OpenHands Cloud API – Examples

This is a compact set of examples and notes for playing with the OpenHands Cloud API.

No credentials are included here. Throughout, use:
- Authorization header: `Authorization: Bearer $OPENHANDS_API_KEY`
- Optional app base override: `OPENHANDS_APP_BASE` (defaults to `https://app.all-hands.dev`)

If an app-host endpoint returns a maintenance page or otherwise fails, you can use the conversation-specific runtime URL together with the `X-Session-API-Key` from conversation details. See “Runtime host fallback” below.

## Setup

- Export your API key: `export OPENHANDS_API_KEY=...`
- Optionally, set an alternate app base: `export OPENHANDS_APP_BASE=https://app.all-hands.dev`

## Create a new conversation

POST `/api/conversations` with an initial user message. Example:

```bash
curl -sS \
  -H "Authorization: Bearer $OPENHANDS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "initial_user_msg": "Read https://github.com/All-Hands-AI/OpenHands/pull/10305. It fails CI, please fix."
  }' \
  "$OPENHANDS_APP_BASE/api/conversations"
```

Response includes:
- `conversation_id` – use this in subsequent calls
- `conversation_status`

You can compose a GUI link as:
```
$OPENHANDS_APP_BASE/conversations/{conversation_id}
```

## Get conversation details

```bash
curl -sS \
  -H "Authorization: Bearer $OPENHANDS_API_KEY" \
  "$OPENHANDS_APP_BASE/api/conversations/{conversation_id}"
```

Details include:
- `title`
- `status`
- `url` (runtime API base for this conversation)
- `session_api_key` (required header for runtime-hosted endpoints)

## List your conversations (titles, ids, statuses)

```bash
curl -sS -H "Authorization: Bearer $OPENHANDS_API_KEY" \
  "$OPENHANDS_APP_BASE/api/conversations?limit=100"
```

- The response has `results` (array) and `next_page_id` (for pagination). Iterate with `page_id` if needed.
- Each result entry includes `conversation_id`, `title`, `status`, `created_at`, and possibly `url` and `session_api_key`.

## Count events in a conversation (lightweight)

Use the events endpoint in reverse to fetch only the latest event and infer the count:

```bash
curl -sS -H "Authorization: Bearer $OPENHANDS_API_KEY" \
  "$OPENHANDS_APP_BASE/api/conversations/{conversation_id}/events?reverse=true&limit=1"
```

Interpretation:
- If it returns one event with `id = N`, total events ≈ `N + 1` (event ids start at 0)
- If the `events` array is empty, count is 0

## Find the model used (from recent actions)

Check the latest few events for `tool_call_metadata.model_response.model`:

```bash
curl -sS -H "Authorization: Bearer $OPENHANDS_API_KEY" \
  "$OPENHANDS_APP_BASE/api/conversations/{conversation_id}/events?reverse=true&limit=20" \
  | jq -r '.events[] | .tool_call_metadata.model_response.model? // empty' | head -n 1
```

Notes:
- Model is present on action events initiated by the LLM (e.g., tool calls)
- Increase `limit` if the last N events don’t contain an action from the LLM

## Runtime host fallback

Sometimes the app host may return an HTML maintenance page for certain endpoints. If so:
1) Get the per-conversation runtime URL and session key from details:
   - `GET /api/conversations/{conversation_id}` → fields: `url`, `session_api_key`
2) Call the runtime endpoint and include `X-Session-API-Key`:

```bash
curl -sS \
  -H "Authorization: Bearer $OPENHANDS_API_KEY" \
  -H "X-Session-API-Key: {session_api_key}" \
  "{runtime_url}/events?reverse=true&limit=1"
```

This works similarly for `/trajectory` and other conversation-scoped endpoints hosted by the runtime.

## Python helper (optional)

A minimal helper script can simplify usage. Example interface:

```bash
python scripts/cloud_api.py new-conversation --message "..."
python scripts/cloud_api.py details --id {conversation_id}
python scripts/cloud_api.py trajectory --id {conversation_id} \
  --runtime-url {runtime_url} --session-key {session_api_key}
```

See `scripts/cloud_api.py` for a reference implementation (uses `$OPENHANDS_API_KEY`). The helper also detects maintenance pages and surfaces errors.

## Where endpoints are defined (OpenHands server source)

- Conversations (create/list/details/start/stop):
  - `openhands/server/routes/manage_conversations.py`
- Conversation events and microagents:
  - `openhands/server/routes/conversation.py` (e.g., `GET /api/conversations/{conversation_id}/events`)
- Trajectory endpoint:
  - `openhands/server/routes/trajectory.py` (e.g., `GET /api/conversations/{conversation_id}/trajectory`)
- Basic user info:
  - `openhands/server/routes/git.py` (e.g., `GET /api/user/info`)

## Tips

- To avoid downloading the full trajectory, prefer the reverse events trick to compute counts
- If an endpoint returns HTML (maintenance), retry later or use the runtime URL with `X-Session-API-Key`
- Use pagination (`next_page_id`) for large conversation lists
