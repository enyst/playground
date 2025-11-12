# OpenHands Enterprise Startup & Runtime Composition

This document explains how the Enterprise server composes, starts, and runs on top of OpenHands (OH), with diagrams and notes on current entanglements.

## High-level Overview

Enterprise builds on OH in two ways:
- Layering: Enterprise adds middleware and routers on top of OH’s FastAPI app.
- Replacement: Enterprise overrides selected OH implementations via dynamic imports (e.g., conversation manager, stores, auth).

Resulting ASGI app: a Socket.IO wrapper around a FastAPI app composed of OH core + Enterprise routes/middleware.

## Startup Flow (Makefile / Docker)

- Dockerfile: `uvicorn saas_server:app --host 0.0.0.0 --port 3000`
- Makefile:
  - `build`: installs enterprise (poetry) and builds OH frontend.
  - `run`: starts backend (uvicorn saas_server:app), waits for port 3000, then starts OH frontend (make start-frontend in OH).
  - `start-backend`: uvicorn in reload mode watching both OH and enterprise sources.

## Composition Diagram (Mermaid)

```mermaid
flowchart TD
  subgraph Process[Uvicorn Process]
    direction TB
    SIO[Socket.IO: sio]
    APP[FastAPI: base_app]
    SIO --- APP

    subgraph OH[OpenHands Base App]
      direction TB
      OHMid[OH Middleware]
      OHRouters[OH Routers (core)]
      OHStatic[OH SPAStaticFiles]
    end

    subgraph ENT[Enterprise Layer]
      direction TB
      EntMid[Ent Middleware (SetAuthCookie, CORS, CacheControl)]
      EntRouters[Ent Routers (auth, billing, integrations, webhooks, user)]
      Metrics[/internal/metrics]
      SPA[/ SPAStaticFiles -> OH build/]
    end
  end

  OH --> ENT
```

## ASGI App Construction

- Base app from OH: `openhands.server.app.app` (FastAPI)
- Socket.IO server: `openhands.server.listen_socket.sio`
- Enterprise composes:
  - Patches MCP routes.
  - Adds routers: readiness, auth (OAuth, cookies), user, billing, API keys, Slack/Jira/Linear integrations, GitHub/GitLab integrations, event webhooks, debugging, email.
  - Adds middleware: CORS, OH CacheControl, enterprise SetAuthCookie.
  - Mounts SPAStaticFiles at `/` pointing to OH build output (FRONTEND_DIRECTORY).
  - Exception handlers for `NoCredentialsError` and `ExpiredError`.
- Final app: `app = socketio.ASGIApp(sio, other_asgi_app=base_app)`.

References:
- saas_server.py: enterprise/saas_server.py
- config override class: enterprise/server/config.py (SaaSServerConfig)

## Configuration Override Mechanism

Enterprise overrides OH’s server configuration via dynamic imports (in OH ServerConfig implementation). Enterprise class:
- SaaSServerConfig extends OH ServerConfig and sets:
  - `app_mode = SAAS`
  - Enterprise stores: settings, secrets, conversation store
  - Conversation manager class: ClusteredConversationManager (Redis)
  - Monitoring listener: SaaSMonitoringListener
  - User auth class: SaasUserAuth
- Provides frontend config including feature flags and allowed providers; resolves GitHub App slug at startup if configured.

References:
- enterprise/server/config.py

## Conversation Lifecycle (Standalone vs Clustered)

- OH StandaloneConversationManager: single-instance conversation management; builds Session, agent loop; returns AgentLoopInfo.
- Enterprise ClusteredConversationManager extends Standalone to add distributed behavior with Redis:
  - On enter: starts background tasks
    - `_redis_update_task`: heartbeat/ownership state to Redis
    - `_redis_listen_task`: subscribes to `session_msg` for cross-node messaging
  - Uses Redis keys (e.g., `ohcnv:{user_id}:{sid}`, `ohcnct:{user_id}:{sid}:{conn}`) to track ownership/connections
  - `get_agent_loop_info`: scans Redis keys to reconstruct active conversations and build EventStore per sid

References:
- enterprise/server/clustered_conversation_manager.py
- OH Standalone manager: openhands/server/conversation_manager/standalone_conversation_manager.py

## Distributed Coordination (Redis)

- Pub/Sub channel: `session_msg` for cross-node eventing
- Periodic state updates and timeouts to enforce ownership across nodes
- Cleanup loop removes stale entries and reclaims ownership

## Authentication & Tokens (Today)

- Enterprise uses OAuth (GitHub/GitLab) and sets a signed cookie (`github_user_id` today; Keycloak planned).
- Token acquisition and refresh are handled by enterprise TokenManager and token stores; OH Settings token is ignored in enterprise mode.
- Middleware and enterprise auth routes handle cookie issuance, validation, and renewal.

## Entanglements (Notable Areas)

1) Private method access across the boundary
- Examples (true usages under MRO):
  - Session retry callback: enterprise calls OH private method `_notify_on_llm_retry` on Session to wire LLM retry updates.
    - OH: openhands/server/session/session.py:306
    - Ent usage: enterprise/server/saas_nested_conversation_manager.py:722
  - Provider service construction: enterprise routes call OH ProviderHandler `_get_service` directly.
    - OH: openhands/integrations/provider.py:149
    - Ent usage: enterprise/server/routes/auth.py:429
  - Conversation URL helper (usually harmless but still private):
    - OH: openhands/server/conversation_manager/standalone_conversation_manager.py:737
    - Ent usage in clustered manager: enterprise/server/clustered_conversation_manager.py:416, 686

2) Dynamic override pathways are implicit
- ServerConfig points to classpaths in env; overrides are scattered and discovered at runtime. This complicates discoverability and versioning.

3) Storage namespacing propagated via primitives
- `user_id` appears across many call sites to isolate storage paths (events, metadata), conflating identity with file layout decisions.

4) Middleware stacking from two layers
- Both OH and enterprise install middleware; ordering and duplicate concerns can cause unexpected interactions.

5) Git provider logic partially in core
- OH ProviderHandler included environment-driven refresh URL assumptions historically; enterprise has its own token refresh and installation flows, leading to conceptual drift.

6) Distributed logic in subclass, parent internals exposed
- ClusteredConversationManager sometimes relies on parent helpers and behaviors that are private/implicit; increases coupling risk.

## Suggested Boundary Targets (Preview)

- Public API modules for: UserContext, ConversationPaths, TokenSource; ConversationManagerABC, RuntimeProvider; EventStream + Listener interfaces; URL helpers.
- ProviderHandler consumes TokenSource only; no provider-specific refresh URLs or MU concepts in core.
- CoordinatorABC for distribution; enterprise supplies Redis-based coordinator implementation.
- Route dependencies consume UserContext/TokenSource; services accept ConversationPaths instead of user_id.

(See separate RFC for API details and migration steps.)
