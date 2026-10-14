# Instance skins and configuration kits

A skin combines an instance web app, Canvas theme, agent instructions, and a Git-backed configuration kit. One skin can be installed at a time. Manage it in **Settings → Skin** on the local backend hosting Canvas. Apps and Canvas extensions remain available alongside the skin.

## Enable skin support

Skin support is disabled by default. Start the full local stack with one of:

```sh
agent-canvas --skin
npm run dev -- --skin
npm run dev:static -- --skin
```

`--skin-port 18002` also enables skins and selects the app port. Otherwise the port comes from `OPENHANDS_SKIN_PORT`, then `config/defaults.json` (currently `18002`). Setting the port environment variable alone does not enable skins; use `OPENHANDS_ENABLE_SKIN=true` or `1` to opt in through the environment.

The full stack supplies the configured Agent Server, automation backend, and management authentication. `--frontend-only`, `--backend-only`, and `dev:minimal` do not support this setup. Skins are managed by the local Canvas host; switching to a Cloud backend does not install a skin there.

| Environment variable           | Purpose                                                                                                                 |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `OPENHANDS_ENABLE_SKIN`        | Enable support with `true` or `1`.                                                                                      |
| `OPENHANDS_SKIN_PORT`          | Port used by the skin app.                                                                                              |
| `OPENHANDS_SKIN_WORKSPACE_DIR` | Skin checkout directory; default `~/workspace/skin` for local launchers. Choose an empty directory before installation. |
| `OPENHANDS_SKIN_STATE_DIR`     | Management state and logs; default `~/.openhands/agent-canvas/skin`.                                                    |

For Docker, add `-e OPENHANDS_ENABLE_SKIN=true` to the existing [Docker quickstart](../README.md#option-2-with-a-docker-sandbox). The default checkout is `/projects/skin`, persisted through the projects mount. `OPENHANDS_SKIN_REPO` additionally enables support and requests installation from that Git repository when no skin is installed. Windows Docker and WSL commands are in [README.windows.md](../README.windows.md#optional-instance-skin).

When operating `scripts/static-server.mjs` directly, enable `--skin` or `--skin-port`, and supply `--skin-agent-server-url`, `--skin-automation-url`, and `--skin-canvas-version` for configuration transfer. `--skin-api-key` protects management independently of HTML session-key injection; the server also accepts its configured `--session-api-key`. Normal full-stack launchers supply these values.

## Install and bind credentials

In **Settings → Skin**, enter a GitHub repository URL, `github:OWNER/REPOSITORY`, or an absolute path to a local Git repository on the Canvas host. A local source is cloned into the checkout directory; it is not edited in place. Optionally choose a branch or tag. Keep automatic push off until you want configuration exports pushed to the remote.

Installation validates the repository, applies its configuration, and starts its app. The report lists applied items, skipped items, errors, and missing secret names. An installed app can run while configuration remains incomplete.

Use **Set up secrets** to supply the requested values. These are saved through the Agent Server secret store. Saving missing requirements retries configuration application; **Apply configuration** can also retry later. Existing matching provider connections and LLM profiles retain their destination credentials. MCP application keeps existing destination credential fields when a required replacement has not been supplied. Review the report before treating a restore as complete.

**Pull** accepts a fast-forward update, reapplies configuration, and restarts the app. **Restart** applies local app and `SKILL.md` edits. **Uninstall** stops the app and removes its checkout, skin state, and synced instruction file; profiles, secrets, skills, and automations already applied to the backend remain there.

## Repository layout and app contract

```text
skin.yaml
package.json
SKILL.md
server.mjs                  # Or your app's entrypoint
automations/                # Created by configuration export
  <bundle-id>/
    automation.json
    automation.tar.gz
```

The first three files are required at the repository root. `package.json` must define a `start` script. Skin dependencies must be runtime dependencies: installation uses `npm install --omit=dev` before starting the app.

```json
{
  "name": "my-instance-skin",
  "private": true,
  "type": "module",
  "scripts": { "start": "node server.mjs" }
}
```

The manager starts `npm run start` with `OPENHANDS_SKIN_PORT` and `PORT` set to the selected port. The app must listen on that port and serve `/skin-app/`; the manager waits for that route before reporting readiness. Serve assets and your app's API under the same prefix, such as `/skin-app/assets/` and `/skin-app/api/`. HTTP and WebSocket requests retain the prefix when proxied.

The Canvas page is `/skin` (or `/canvas/skin` with that Canvas base path). It embeds `/skin-app/` in an iframe. `/skin-api` belongs to the host's management API. Use `<base href="/skin-app/">` or configure your framework's asset and router base accordingly. Apps can load `/skin-api/theme.css` to inherit the declared theme variables.

`SKILL.md` describes the app's pages, APIs, data sources, and agent workflows. Its content is synced as the always-active `skin-app` skill on start, restart, and pull. Describe only instructions you want included in every new conversation. Frontmatter is normalized by the manager; keyword triggers do not make this instruction file conditional.

## Configuration format

Exports use `configuration_version: 2`. Provider connections are referenced by display name, profiles by name, and credentials by secret name. Destination IDs are resolved during application. This example shows a provider-backed profile, a directly authenticated profile, an agent profile, and an MCP binding; it contains no credential values.

```yaml
name: Review workspace
icon: layout-dashboard
canvas_version: ">=1.27.1"
configuration_version: 2
theme:
  accent: "#60a5fa"
  background: "#0b0e14"
secrets:
  - name: REVIEW_PROVIDER_API_KEY
    description: API key for the review provider connection.
  - name: DIRECT_MODEL_API_KEY
    description: API key for the direct model profile.
  - name: REVIEW_MCP_TOKEN
    description: Bearer token for the review MCP server.
provider_connections:
  - display_name: review-provider
    provider: openai
    base_url: https://api.openai.com/v1
    secret_name: REVIEW_PROVIDER_API_KEY
llm_profiles:
  - name: review-model
    config:
      model: openai/gpt-5
    provider_connection: review-provider
  - name: direct-model
    config:
      model: openai/gpt-5
      max_tokens: 4096
    secret_bindings:
      api_key: DIRECT_MODEL_API_KEY
agent_profiles:
  - name: reviewer
    agent_kind: openhands
    llm_profile_ref: review-model
    mcp_server_refs: [review-api]
    secret_refs: [REVIEW_MCP_TOKEN]
mcp_servers:
  review-api:
    transport: http
    url: https://mcp.example.com/api
    auth:
      strategy: bearer
      value: "${REVIEW_MCP_TOKEN}"
app_preferences:
  language: en
settings:
  max_iterations: 100
active:
  llm_profile: review-model
  agent_profile: reviewer
```

`secret_bindings` maps LLM credential fields, including `api_key` and AWS credential fields, to destination secret names. Extra header bindings use keys such as `extra_headers.Authorization` and require the full header value in the named secret. MCP fields use `${SECRET_NAME}` references; the export creates declarations for their required names. Do not put raw, masked, or encrypted credentials in the manifest, app source, or automation artifacts.

Prefer **Export configuration** to hand-authoring backend profile payloads. `meta_profiles[].config` and `agent_profiles[]` use the released Agent Server's profile formats; a kit is not a separate SDK schema.

| Kit content                                   | Restore behavior                                                                                                                              |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Provider connections and LLM profiles         | Rebind provider references; preserve existing target credentials or use supplied named secrets.                                               |
| Meta profiles, agent profiles, active choices | Restore definitions and resolve profile names to target IDs. Active choices are applied after required configuration succeeds.                |
| MCP servers                                   | Resolve declared secret references against the destination secret store. OAuth sessions require destination authorization.                    |
| Agent, conversation, and app preferences      | Apply exported settings and supported app preferences to the destination.                                                                     |
| Installed skills                              | Reinstall source, installed revision, repository subpath, and enabled state.                                                                  |
| Automations                                   | Upload bundled code and recreate supported definitions as **inactive**. Existing automations with the same name are kept. Drafts are skipped. |

## Export, restore, and Git sync

Configure the source instance, install a skin, and choose **Export configuration**. A complete export replaces the saved configuration and removes stale automation bundles. A failed dependency read keeps the previous exported kit. Export reports remain available in Settings after refresh.

Install that repository on the destination instance, supply its missing secret requirements, then retry **Apply configuration**. Inspect restored automations and enable them in **Automations** when ready. The released automation upload API limits each compressed bundle to 1 MiB.

Export stays local unless automatic push is enabled. Automatic push is opt-in and accepts eligible structured configuration changes. Changed code, archives, and opaque instruction or metadata fields require manual review and cannot be automatically pushed. **Push** displays the affected paths; review their contents in the checkout before acknowledging the review. Recognizable credentials block export, restore, or push and cannot be bypassed by that acknowledgment. Archive inspection is bounded and checks recognizable literals; it does not certify arbitrary source as credential-free.

Push uses the checked-out named branch. The manager reads `GITHUB_TOKEN` from its launch environment for private GitHub access and authenticated pushes. GitHub push can fall back to a topic branch and pull request when that token has the necessary access. A local Git source uses its local remote; the destination must permit the push. Commits use the checkout's Git author settings, then saved Canvas Git preferences, with `OpenHands Skin <skin-bot@openhands.local>` as the fallback identity.

Subscription sign-ins and OAuth sessions are not exported. Conversation history, running conversations, automation run history, and active execution state are excluded. A kit applies reusable configuration to the destination; it does not replace its conversation history.
