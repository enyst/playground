# Windows quickstart (PowerShell)

This doc contains **Windows-specific** command syntax for running Agent Canvas with the **Docker sandbox**.

For the main install options and overall context, see [README.md](./README.md).

## Option 2: With a Docker Sandbox (Windows)

**Prerequisites**:

- Docker Desktop for Windows
- A host directory for `PROJECTS_PATH` containing the project folders you want the agent to access (create it before starting the container)

```powershell
docker pull ghcr.io/openhands/agent-canvas:1.27.1 # x-release-please-version

$env:PROJECTS_PATH = Join-Path $HOME "projects"  # directory containing your project folders
New-Item -ItemType Directory -Force -Path $env:PROJECTS_PATH, (Join-Path $env:USERPROFILE ".openhands") | Out-Null

docker run -it --rm `
  -p 127.0.0.1:8000:8000 `
  -e AGENT_CANVAS_ALLOW_LAN_SESSION_KEY=true `
  -v "$($env:USERPROFILE)\.openhands:/home/openhands/.openhands" `
  -v "$($env:PROJECTS_PATH):/projects" `
  ghcr.io/openhands/agent-canvas:1.27.1 # x-release-please-version
```

Open [http://localhost:8000/canvas](http://localhost:8000/canvas) in your browser.

The agent will be able to access any project under `PROJECTS_PATH`.

The quickstart restricts the published port to host loopback before explicitly enabling session-key injection. If you publish the port on a LAN or public interface, omit `AGENT_CANVAS_ALLOW_LAN_SESSION_KEY`, set `LOCAL_BACKEND_API_KEY` to a strong value, and enter that value in the UI.

## Option 3: With Multiple Docker Sandboxes (WSL 2)

For per-conversation containers, run Canvas inside a Linux distribution under WSL 2, with Docker Desktop's WSL integration enabled for that distribution. Install Node.js 24 or later and `uv` inside WSL, and confirm that `docker info` succeeds there.

Run the [multiple-sandbox quickstart](./README.md#option-3-with-multiple-docker-sandboxes) in the WSL shell, using workspace paths inside that Linux environment. The native Windows host is not supported by this runtime, which uses POSIX user/group IDs.

## Optional instance skin

To enable skins in the Docker quickstart above, add `-e OPENHANDS_ENABLE_SKIN=true` before the image name. The projects mount persists the skin checkout at `/projects/skin`; open **Settings → Skin** after starting Canvas. Skins and automatic push are disabled by default.

For npm or source launchers inside WSL 2, use the same flags as on Linux:

```sh
agent-canvas --skin
# From a source checkout:
npm run dev -- --skin
npm run dev:static -- --skin
```

`--skin-port 18002` enables support with an explicit app port. Use an absolute Linux path for a local Git skin source when Canvas runs in WSL. See the [skin guide](./docs/skins.md) for credential setup, repository requirements, and configuration export/restore.
