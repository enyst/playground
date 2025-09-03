# OpenHands Server Extension Loader (Demo)

Author: OpenHands-GPT-5 (AI agent)

This document describes a minimal server extension mechanism for OpenHands and how to test it with an external Test Extension package.

Facts in this document are sourced from the code in this repository (openhands/server/app.py), the added demo files (openhands/server/app_ext_demo.py, openhands/server/extensions.py), and the Test Extension repository `enyst/openhands-ext`.

## Goals

- Enable external packages to register FastAPI routers and middlewares into the OpenHands server without modifying core files.
- Allow external packages to participate in server startup/shutdown via lifespans.
- Keep core component substitution (ConversationManager, stores, UserAuth) working through existing `get_impl` configuration.

## Extension Interfaces

- `register(app: FastAPI) -> None`: Mount routers and middlewares.
- `lifespan(app: FastAPI) -> Async context manager`: Participate in startup/shutdown (e.g., background tasks).

These are discovered from:
- Environment variables:
  - `OPENHANDS_EXTENSIONS="pkg.module:register"`
  - `OPENHANDS_EXTENSION_LIFESPANS="pkg.module:lifespan"`
- Entry points:
  - `openhands_server_extensions`
  - `openhands_server_lifespans`

See implementation: `openhands/server/extensions.py`.

## Demo Entrypoint

`openhands/server/app_ext_demo.py` builds a FastAPI app that composes:
- Core conversation manager lifespan
- MCP lifespan
- Discovered extension lifespans

Then it calls `apply_register_funcs(app)` to mount all discovered routers.

Run the demo server, for example:

```
uvicorn openhands.server.app_ext_demo:app --host 0.0.0.0 --port 3000
```

## Testing with Test Extension

Use the Test Extension from `enyst/openhands-ext`:
- It exposes `register(app)` to mount:
  - `/test-extension/health` (public)
  - `/test-extension/secure-health` (protected by X-Session-API-Key if configured)
- It exposes `lifespan(app)` to demonstrate startup/shutdown composition.

You can load it either by:
- Entry points (recommended): install the package into the same Python environment as OpenHands and run the demo server.
- Env vars (no packaging metadata required): set `OPENHANDS_EXTENSIONS` and `OPENHANDS_EXTENSION_LIFESPANS` to point at the extension callables.

## Component Overrides (Existing Mechanism)

OpenHands already supports replacing server components via fully-qualified class names in config/environment (e.g., `CONVERSATION_MANAGER_CLASS`). Extensions can supply their own implementations without modifying core code.

For example, the Test Extension includes a stub `TestConversationManager` for demonstration only.

## Notes on ServerConfig

This demo intentionally avoids forcing `ServerConfig` subclassing for extensions. Subclassing is coarse and not composable. Prefer explicit component overrides and additive hooks (register/lifespan). If multiple extensions require component ownership, define precedence and detect conflicts.
