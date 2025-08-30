# OpenHands Cron Agents

This directory contains the implementation of automated weekly tasks using the OpenHands API.

## Structure

```
scripts/
├── openhands_api.py       # Clean OpenHands API client
├── cron_agents.py         # Main task functions with CLI
├── prompts/               # Jinja2 prompt templates
│   ├── architecture_audit.j2
│   └── openapi_drift.j2
└── README.md             # This file
```

## Components

### `openhands_api.py`
Clean, reusable OpenHands API client with:
- Structured error handling with `OpenHandsAPIError`
- Authentication testing
- Conversation management
- Event polling with progress callbacks
- Timeout handling and error recovery

### `cron_agents.py`
Main module containing two weekly task functions:

1. **`run_architecture_audit()`** - Reviews architecture documentation
2. **`run_openapi_drift_check()`** - Detects OpenAPI schema drift

Both functions return structured results with success/error information.

### `prompts/`
Jinja2 templates for task prompts:
- `architecture_audit.j2` - Architecture documentation review prompt
- `openapi_drift.j2` - OpenAPI drift detection prompt with structured reporting

## Usage

### CLI Interface

```bash
# Architecture audit (reads OPENHANDS_API_KEY from environment)
python cron_agents.py architecture-audit \
  --repository "owner/repo" \
  --branch "main" \
  --output results.json

# OpenAPI drift check (reads OPENHANDS_API_KEY from environment)
python cron_agents.py openapi-drift \
  --repository "owner/repo" \
  --branch "main" \
  --output results.json
```

### Programmatic Usage

```python
from cron_agents import run_architecture_audit, run_openapi_drift_check

# Run architecture audit
result = run_architecture_audit(
    api_key="your-api-key",
    repository="owner/repo",
    branch="main"
)

if result["success"]:
    print(f"Audit completed: {result['conversation_url']}")
else:
    print(f"Audit failed: {result['error']}")
```

## GitHub Workflows

Two minimal workflows are provided:
- `.github/workflows/weekly-architecture-audit.yml`
- `.github/workflows/weekly-openapi-drift.yml`

Both run weekly and only require the `OPENHANDS_API_KEY` secret.

## Error Handling

The implementation provides structured error reporting:
- HTTP status codes and response details for API errors
- Structured error messages with context
- Progress logging during polling
- Timeout handling with graceful degradation

## Security Model

- Only requires `OPENHANDS_API_KEY` in CI/workflows
- LLM provider settings managed in your OpenHands account
- No sensitive data logged or exposed
- Clean separation between authentication and task logic

## Dependencies

- `requests` - HTTP client for API calls
- `jinja2` - Template rendering for prompts
- Standard library modules: `json`, `logging`, `pathlib`, `re`, `time`
