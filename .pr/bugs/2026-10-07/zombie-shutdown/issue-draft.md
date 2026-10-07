I'm an AI agent (Codex) helping Engel Nyst (@enyst) with project work.

### Operating System
Linux — Debian hosted OpenAI cloud executor; PID 1 is `tail` and does not reap exited detached children.

### Installation Method
From source. `control-openhands` builds and runs `node bin/agent-canvas.mjs`, the source entry point for the npm launcher.

### Agent Canvas Version
Canvas 1.25.0 at main@3f98684763a4e17e6e2faf8dd8f1cfc3969b020c; Agent Server/SDK 1.53.0, automation 1.19.0; Node 24.19.0, Chromium 151.0.7922.173.

### Bug Description
After an owned stack exits, `control-openhands stop` reports failure and `status` still reports a live launcher when only unreaped zombie processes remain. All stack ports are closed. This also retains a stale port claim and can make later runs look ambiguous.

Regression: origin unconfirmed. Two agents independently reproduced this on fresh TARGET stacks; no pre-change/baseline live run establishes an introduced-in-range regression. This concerns harness liveness classification, not the old runtime zombie accumulation in closed #14277. Searches of open and closed issues for zombie, launcherStopped and control-openhands shutdown found no matching harness defect.

### Steps to Reproduce
On a Linux container whose PID 1 does not reap detached children, from this source checkout:

```sh
npm ci --ignore-scripts --cache /tmp/qa-maintenance-npm-cache
export PATH="$PWD/.agents/skills/verify-openhands/scripts:$PATH"
export OH_VERIFY_HOME="$(mktemp -d /tmp/oh-maintenance.XXXXXX)"
export CONTROL_OPENHANDS_BROWSER=/usr/bin/chromium
export CONTROL_OPENHANDS_TRUST_CA="$NODE_EXTRA_CA_CERTS"
export UV_CACHE_DIR="$OH_VERIFY_HOME/uv-cache"
export UV_PYTHON_INSTALL_DIR="$OH_VERIFY_HOME/uv-python"
export OH_VERIFY_RUN=$(control-openhands launch --new --print-run)
control-openhands doctor
control-openhands browser goto /
control-openhands onboard --skip
control-openhands browser screenshot --feature harness.shutdown --name before-stop
control-openhands stop
control-openhands status
```

No LLM or paid calls are needed. Keep the configured proxy/CA; do not change shell HOME. Inspect the owned launcher PID/PGID from run.json with `ps -o pid,ppid,pgid,stat,comm -p <launcher-pid>`.

### Actual Behavior
`stop`: `forced:true`, `launcherStopped:false`, `ok:false`, while ingress, Agent Server, automation, frontend and editor ports are all closed. `status` still says `launcherAlive:true`. The owned launcher is `Zs`, PPID 1; signal 0 succeeds for a zombie-only group.

### Expected Behavior
Once all owned processes have exited and ports are closed, stop succeeds, releases its reservation and status reports no live stack. A live child in the process group and unknown process visibility must still prevent a successful shutdown report. The existing refusal to signal an unrelated reused process group must remain intact.

### Relevant Logs
[Original stop JSON](https://raw.githubusercontent.com/enyst/playground/6ba8df88082528ec5f1fb7bc0bef3bba6e3ce9df/.pr/bugs/2026-10-07/zombie-shutdown/stop-before.json), [owned process state](https://raw.githubusercontent.com/enyst/playground/6ba8df88082528ec5f1fb7bc0bef3bba6e3ce9df/.pr/bugs/2026-10-07/zombie-shutdown/processes-before.txt), [independent reproduction and corrected-run notes](https://raw.githubusercontent.com/enyst/playground/6ba8df88082528ec5f1fb7bc0bef3bba6e3ce9df/.pr/bugs/2026-10-07/zombie-shutdown/reproduction.md). Private logs, session keys and browser storage are excluded.

### Acceptance Criteria
- [ ] In the reproduced non-reaping Linux container, stop reports success after all owned processes exit, status reports no live launcher/browser, and the run's ports are closed.
- [ ] A process group with a live child is still reported alive even if its leader is a zombie.
- [ ] Unreadable process state or denied inspection is not reported as proven shutdown.
- [ ] Stop still refuses to signal an unrelated process group that reused the recorded ID.
- [ ] Captured evidence remains available after shutdown.

### Screenshots
The genuine Canvas capture shows the credential-free Local stack before cleanup; lifecycle output above establishes the defect.

![Independent fresh Local stack before stop](https://raw.githubusercontent.com/enyst/playground/6ba8df88082528ec5f1fb7bc0bef3bba6e3ce9df/.pr/bugs/2026-10-07/zombie-shutdown/before.png)

A scoped harness correction has also been exercised on a separate fresh stack: [corrected stop JSON](https://raw.githubusercontent.com/enyst/playground/6ba8df88082528ec5f1fb7bc0bef3bba6e3ce9df/.pr/bugs/2026-10-07/zombie-shutdown/stop-after.json), [process state](https://raw.githubusercontent.com/enyst/playground/6ba8df88082528ec5f1fb7bc0bef3bba6e3ce9df/.pr/bugs/2026-10-07/zombie-shutdown/processes-after.txt). No product-code fix is proposed in the maintenance pass.
