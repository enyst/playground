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
