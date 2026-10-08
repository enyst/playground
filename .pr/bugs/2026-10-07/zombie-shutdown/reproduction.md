I'm an AI agent (Codex) helping Engel Nyst (@enyst) with project work.

# Zombie-only stacks reported alive

Observed 2026-10-07 in OpenAI hosted cloud, Debian Linux, Node 24.19.0, Chromium 151.0.7922.173. Canvas 1.25.0 at main@3f98684763a4e17e6e2faf8dd8f1cfc3969b020c, Agent Server/SDK 1.53.0, automation 1.19.0. No model calls or credentials required. Container PID 1 is `tail`, which leaves exited detached processes unreaped.

## Reproduction

From the source checkout, after `npm ci --ignore-scripts` with a writable npm cache:

```sh
export PATH="$PWD/.agents/skills/verify-openhands/scripts:$PATH"
export OH_VERIFY_HOME="$(mktemp -d /tmp/oh-maintenance.XXXXXX)"
export CONTROL_OPENHANDS_BROWSER=/usr/bin/chromium
# Use the configured proxy CA where provided; keep TLS verification enabled.
export CONTROL_OPENHANDS_TRUST_CA="$NODE_EXTRA_CA_CERTS"
export OH_VERIFY_RUN=$(control-openhands launch --new --print-run)
control-openhands doctor
control-openhands browser goto /
control-openhands onboard --skip
control-openhands browser screenshot --feature harness.shutdown --name before-stop
control-openhands stop
control-openhands status
```

Use run-owned writable `UV_CACHE_DIR` and `UV_PYTHON_INSTALL_DIR` if the default cache is not writable. Do not change the operator's HOME. This cloud run used the CLI-managed private homes and pinned services.

## Actual and expected

Original CLI: all five reserved ports closed, browser stopped, but `launcherStopped:false`, `forced:true`, `ok:false`; status still says launcher alive. Process output proves the owned launcher is `Zs` with PPID 1. `kill(-pgid, 0)` succeeds for this exited zombie-only group. Two independent fresh runs reproduced the failure; this directory contains the second run's reviewed captures and outputs. Origin is unconfirmed; no pre-TARGET baseline run establishes an introduced-in-range regression.

Expected: after every owned process exits and its ports close, stop succeeds and status reports no live launcher. Live children, unreadable state and unrelated reused process groups must remain protected.

## Corrected harness verification

A fresh stack with the process-state helper correction passed doctor and the same credential-free Canvas path. Stop reports `launcherStopped:true`, `ok:true`, no forced signal, and all ports closed. Its owned exited processes remain `Zs`, demonstrating the difference is classification rather than hiding an active service. Both captures survived shutdown. Root separately verified corrected stop/status on its own stack.

The PNGs prove the actual Canvas stack ran at desktop 1440×1000 with selected Local; the JSON and process output prove lifecycle state. No video was recorded. Raw private logs, keys and browser storage are excluded.

Five focused tests cover a real unreaped child, a live child, unknown inspection/permission errors, live members in zombie-led groups and refusal to signal an unrelated reused group. Full skill suite: 42 tests passed. No product code changed.
