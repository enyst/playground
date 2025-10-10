# Enterprise auth primitive audit and UserContext/TokenSource refactor plan


## New findings: routes with FastAPI Depends on auth primitives (OpenHands + enterprise)

The following routes still use FastAPI Depends() to pull user_auth-related primitives directly. These should be migrated to use UserContext + TokenSource where applicable, or explicitly left as-is if they are bootstrapping auth or need direct stores.

OpenHands server routes:
- openhands/server/routes/conversation.py
  - migrated: uses UserContext for identity in search_events; imports order fixed
- openhands/server/routes/files.py
  - migrated: injects UserContext; removed Depends(get_user_id) from git_changes
- openhands/server/routes/secrets.py
  - secrets_store: SecretsStore = Depends(get_secrets_store)
  - provider_tokens: PROVIDER_TOKEN_TYPE | None = Depends(get_provider_tokens)
  - user_secrets: UserSecrets | None = Depends(get_user_secrets)
- openhands/server/routes/settings.py
  - provider_tokens: PROVIDER_TOKEN_TYPE | None = Depends(get_provider_tokens)
  - settings_store: SettingsStore = Depends(get_user_settings_store)
  - settings: Settings = Depends(get_user_settings)
- Status update (V1): settings.py and secrets.py migrated to use UserContext and TokenSource; legacy stores retained only for migration assistance. utils.get_conversation now resolves user_id from Request via UserContext and changed signature to accept Request.


OpenHands manage_conversations routes:
- openhands/server/routes/manage_conversations.py
  - migrated: removed Depends(get_user_secrets) and Depends(get_user_settings); uses UserContext + TokenSource
  - still: auth_type: AuthType | None = Depends(get_auth_type) retained for route behavior

Enterprise routes:
- enterprise/server/routes/email.py — migrated to UserContext for identity; retains get_user_auth(request) inside handler for token refresh and cookie setting (acceptable for now)
- enterprise/server/routes/auth.py — auth bootstrap flows; keep as-is for now

Recommendation:
- For OpenHands routes listed above, replace these Depends(...) with UserContext + TokenSource accessors where possible:
  - user id -> await user.require_user_id() or await user.get_user_id()
  - provider tokens -> (await user.get_token_source()).get_provider_tokens()
  - secrets/settings stores -> consider adding UserContext helpers or pass via services that already use UserContext; otherwise migrate call sites to services that hide stores.
- Defer changes where they are intentionally part of auth bootstrap or low-level storage access.


Scope: identify enterprise services using auth primitives (get_user_auth, get_user_id, get_access_token, get_provider_tokens) or constructing ProviderHandler directly; propose how to migrate to centralized UserContext and TokenSource. Keep V1 scoping by user_id.


## Status (current)
- UserContext: added get_user_email() and implemented it in AuthUserContext; AdminUserContext intentionally raises NotImplementedError.
- Jira routes migrated to DI with UserContext for identity/email; removed direct get_user_auth usage and SaasUserAuth import; cleaned unused Request params:
  - create_jira_workspace, create_workspace_link, get_current_workspace_link, unlink_workspace, validate_workspace_integration.
  - OAuth callback remains unchanged (continues to rely on integration_session in Redis).
- Linear routes migrated to DI with UserContext; OAuth callback/webhooks left unchanged; parity preserved.
- Jira DC routes migrated to DI with UserContext; OAuth callback left unchanged.
- TokenSource/ProviderHandler guidance: routes should resolve via user.get_token_source() / user.get_provider_handler(strict=...) instead of using UserAuth directly.

Guiding principles
- Inject UserContext in FastAPI routes via: `from openhands.app_server.config import user_injector as _user_injector; USER_CONTEXT_DEP = _user_injector()` and `user: UserContext = Depends(USER_CONTEXT_DEP)`
- Replace direct calls to get_user_auth/get_user_id/get_access_token/get_provider_tokens with:
  - user_id: `await user.require_user_id()` (or `await user.get_user_id()` where optional)
  - tokens: `token_source = await user.get_token_source(); provider_tokens = await token_source.get_provider_tokens()`
  - access_token (Keycloak): `await token_source.get_access_token()`
  - ProviderHandler: `provider_handler = await user.get_provider_handler(strict=True|False)`
- Preserve behavior and checks; only relocate auth/identity fetching into UserContext/TokenSource boundaries. Avoid changing business logic.
- For services/managers outside routes: prefer passing ProviderHandler or TokenSource in from the route rather than constructing internally. Where that’s too invasive, keep existing code and plan follow-up refactors.

Cross-cutting checks to keep
- Signature/webhook validations (Jira/Linear/GitHub/Slack) remain as-is; not part of auth primitive refactor.
- Conversation ownership checks continue to use conversation.user_id comparison; obtain current user via `await user.require_user_id()`.

Candidates and recommendations

1) enterprise/server/routes/integration/jira.py
- Primitives found: get_user_auth, user_auth.get_user_id(), user_auth.get_user_email(), user_auth.get_access_token(), user_auth.get_provider_tokens()
- Recommendation:
  - Add `USER_CONTEXT_DEP = user_injector()` and inject `user: UserContext` in all route handlers.
  - Replace user_auth.* with:
    - user_id = await user.require_user_id()
    - token_source = await user.get_token_source()
    - access_token = await token_source.get_access_token()
    - provider_tokens = await token_source.get_provider_tokens()
  - Where ProviderHandler is needed, use `await user.get_provider_handler()`.
  - Keep TokenManager usage; only change how identity/tokens are read.

2) enterprise/server/routes/integration/linear.py
- Primitives found: get_user_auth, user_auth.get_user_id(), get_user_email()
- Recommendation:
  - Inject UserContext
  - Replace with user_id = await user.require_user_id(); user_email via `await user.get_user_info()` if available, otherwise keep existing get_user_auth for email until UserContext exposes get_user_email.
  - Use token_source if any token interactions appear elsewhere.

3) enterprise/server/routes/integration/jira_dc.py
- Primitives found: get_user_auth, user_auth.get_user_id()
- Recommendation: Inject UserContext and use require_user_id; add token_source usage if tokens required.

4) enterprise/server/routes/integration/slack.py (manager/view)
- Primitives found: user_auth.get_provider_tokens(), get_access_token(), get_user_id(); ProviderHandler constructed in slack_manager.py
- Recommendation:
  - In view routes, inject UserContext and fetch token_source/provider_handler from it.
  - In slack_manager.py, accept a ProviderHandler or TokenSource parameter from callers instead of constructing ProviderHandler internally. Interim: continue current construction; long-term: add optional parameter and prefer injected one.

5) enterprise/server/routes/integration/github_view.py, gitlab_view.py
- Primitives found: integration-specific token fetch; some use TokenManager directly.
- Recommendation:
  - For routes that need OpenHands user context, inject UserContext; for GitHub app installation flows relying on GitHub Integration tokens, keep existing logic. Only replace places where user_auth is used for OpenHands identity.

6) enterprise/server/routes/email.py, feedback.py, user.py, billing.py, api_keys.py
- Already use UserContext injection.
- Action: Verify any residual user_auth usage; ensure all identity/token reads go through user/token_source.

7) enterprise/server/routes/auth.py
- Primitives: get_access_token, get_user_auth; ProviderHandler constructed.
- Recommendation:
  - Leave core auth flows intact (since they bootstrap identity). Where routes need ProviderHandler for verifications, consider using a temporary provider_handler = await user.get_provider_handler() if a UserContext exists. Otherwise defer; out of scope for initial pass.

8) enterprise/server/saas_nested_conversation_manager.py
- Primitives: constructs ProviderHandler in _get_provider_handler(settings)
- Recommendation:
  - This code consumes provider_tokens from ConversationInitData already. No route changes needed. Later, allow passing ProviderHandler/TokenSource from route layer into conversation manager to centralize creation.

9) enterprise/integrations/* managers (jira_manager.py, linear_manager.py, jira_dc_manager.py, slack_manager.py)
- Primitives: call get_user_auth_from_keycloak_id, user_auth.get_*; construct ProviderHandler.
- Recommendation:
  - Longer-term refactor: these classes accept UserContext or TokenSource/ProviderHandler as parameters rather than constructing. For now, limit route-level changes to supply tokens/handler down to methods that support it; if not supported, plan a second phase adding optional parameters.

Concrete DI example for routes
- Before:
  ```py
  @router.post('/workspaces')
  async def create(..., request: Request):
      user_auth: SaasUserAuth = await get_user_auth(request)
      user_id = await user_auth.get_user_id()
      provider_tokens = await user_auth.get_provider_tokens()
  ```
- After:
  ```py
  from openhands.app_server.config import user_injector as _user_injector
  from openhands.app_server.user.user_context import UserContext
  USER_CONTEXT_DEP = _user_injector()

  @router.post('/workspaces')
  async def create(..., user: UserContext = Depends(USER_CONTEXT_DEP)):
      user_id = await user.require_user_id()
      token_source = await user.get_token_source()
      provider_tokens = await token_source.get_provider_tokens()
      provider_handler = await user.get_provider_handler()
  ```

Priority order for migration
1) Enterprise route modules under enterprise/server/routes/integration/: jira.py, linear.py, jira_dc.py, slack_view.py
2) enterprise/server/routes/auth-adjacent code paths that only need tokens/identity (not bootstrapping auth)
3) Managers to accept ProviderHandler/TokenSource (non-breaking optional params) and stop constructing directly where feasible

Open questions / follow-ups
- UserContext.get_user_info should expose user_email to cover routes accessing it. If not yet available, keep get_user_auth(request) for email only and migrate once exposed.
- Some integrations rely on TokenManager and third-party app installations; those flows may remain distinct from OpenHands auth.

Verification checklist per migration PR
- mypy and ruff clean in enterprise/dev_config hooks
- Behavior parity on routes: webhook validation, redirects, and installation flows unchanged
- Unit tests (where present) pass; manual tests for critical flows
