# Migrating Enterprise Private-Method Usages to Public OpenHands APIs

This document maps current enterprise usages of OpenHands (OH) private methods to a proposed public API, and provides a sequence diagram of the distributed conversation flow.

## Scope
- Calls made from enterprise to OH private methods (direct or via inheritance where the target is defined privately in OH and not overridden in enterprise).
- Representative migration guidance and API targets for each category.
- Distributed conversation lifecycle sequence diagram (Mermaid).

## Private usages and public replacements

1) Session retry notifications
- Current private usage:
  - OH definition: `openhands/server/session/session.py:306 def _notify_on_llm_retry(self, retries: int, max: int)`
  - Enterprise usage: `enterprise/server/saas_nested_conversation_manager.py:722` (calls on OH Session)
- Problem: requires reaching into OH private session behavior.
- Public replacement:
  - EventStream + LLMRetryListener interface (public). Handlers subscribe to LLM retry events without touching Session internals.
  - API sketch:
    - `EventStream.subscribe(listener: EventListener)`
    - `class LLMRetryListener(EventListener): on_llm_retry(session_id, retries, max)`

2) Provider service construction
- Current private usage:
  - OH definition: `openhands/integrations/provider.py:149 def _get_service(self, provider)`
  - Enterprise usage: `enterprise/server/routes/auth.py:429` (provider_handler._get_service)
- Problem: bypasses ProviderHandler’s public surface and encourages private call sites.
- Public replacement:
  - `ProviderHandler.get_service(provider: ProviderType) -> GitService` (public)
  - `TokenSource` boundary supplies tokens; GitService exposes only public HTTP methods (list_repos, create_pr, etc.).

3) Conversation URL helper
- Current private usage:
  - OH definition: `openhands/server/conversation_manager/standalone_conversation_manager.py:737 def _get_conversation_url(...)`
  - Enterprise usage: `enterprise/server/clustered_conversation_manager.py:416, 686`
- Problem: innocuous but private, creates coupling.
- Public replacement:
  - `ConversationURL.build(conversation_id: str, base_host: str | Request) -> str`
  - Alternatively: expose via `ConversationManager.get_conversation_url(conversation_id)`.

4) Parent private loop methods via super()
- Pattern: enterprise subclasses rely on parent’s private loop methods (e.g., `_start_agent_loop`) through `super()`.
- Problem: tight coupling to parent internals; brittle across versions.
- Public replacement:
  - `ConversationManagerABC` exposes `start_conversation`, `run_agent_loop`, and lifecycle hooks (`before_start`, `after_end`).
  - Subclasses compose orchestration via documented hooks rather than private overrides.

5) Direct HTTP helpers on provider services
- Pattern: enterprise services sometimes reach `_make_request` on provider classes.
- Problem: private transport leakage; bypasses validation/interceptors.
- Public replacement:
  - Public GitService methods cover supported actions; extension points via request middlewares or `on_before_request/after_response` hooks.

6) Storage namespacing via user_id
- Pattern: enterprise code pushes `user_id` through many APIs to derive storage paths.
- Problem: identity concerns leak into core semantics.
- Public replacement:
  - `UserContext.paths: ConversationPaths` provides path helpers; `user_id` becomes an implementation detail of the context.

## Migration plan (phased)
- Phase 1: Introduce public APIs in OH (openhands.api.*) and adapters that forward to current internals with deprecation warnings.
- Phase 2: Update enterprise to:
  - Replace direct private calls with public APIs.
  - Register listeners for retry events instead of touching Session.
  - Consume ProviderHandler.get_service and TokenSource.
  - Use ConversationURL/ConversationManager public methods.
- Phase 3: Remove private usages and warnings; stabilize contracts with contract tests.

## Distributed conversation flow (sequence)

```mermaid
sequenceDiagram
  participant Client as Client (Web/Socket)
  participant API as FastAPI (saas_server)
  participant CM as ClusteredConversationManager (Ent)
  participant SCM as StandaloneConversationManager (OH)
  participant Coord as Redis Coordinator
  participant Sess as Session (OH)
  participant ES as EventStream (OH)

  Client->>API: Start conversation / send message
  API->>CM: start_conversation(data)
  CM->>Coord: acquire_lease(conversation_id)
  Coord-->>CM: lease granted
  CM->>SCM: run_agent_loop(conversation_id) (public)
  SCM->>Sess: create/start session
  Sess->>ES: emit AgentStateChanged / events
  ES-->>CM: notify listeners (LLMRetryListener, Monitoring)
  loop Agent loop
    Sess->>ES: action/observation events
    ES-->>CM: listener callbacks
    CM->>Coord: heartbeat(conversation_id)
  end
  alt Node failover
    CM--x Coord: heartbeat stops
    Coord-->>CM: lease expired
    CM2->>Coord: acquire_lease(conversation_id)
    Coord-->>CM2: lease granted to CM2
    CM2->>SCM: attach to conversation and resume
  end
  API-->>Client: Stream updates via Socket.IO
```

## Notes
- The Coordinator abstraction is shown explicitly; OH can ship a LocalCoordinator, enterprise provides RedisCoordinator.
- All interactions above use public APIs (CM.run_agent_loop, EventStream.subscribe, ProviderHandler.get_service, ConversationURL helper, RuntimeProvider).

