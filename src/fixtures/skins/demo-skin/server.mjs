import { readFileSync } from "node:fs";
import { createServer } from "node:http";

const port = Number(process.env.OPENHANDS_SKIN_PORT);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("OPENHANDS_SKIN_PORT must be a valid TCP port.");
}

const status = {
  fixture: "demo-skin",
  revision: readFileSync(
    new URL("./revision.txt", import.meta.url),
    "utf8",
  ).trim(),
  backend: {
    agentServer: process.env.AGENT_SERVER_URL || null,
    automation: process.env.AUTOMATION_URL || null,
  },
};

const escapeHtml = (value) =>
  String(value ?? "Not configured").replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <base href="/skin-app/">
  <title>QA Demo Skin</title>
  <link rel="stylesheet" href="/skin-api/theme.css">
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 32px; min-height: 100vh; font: 16px/1.5 system-ui, sans-serif; color: var(--cool-grey-100, #f2f5f8); background: var(--cool-grey-950, #162330); }
    main { max-width: 720px; margin: 0 auto; }
    .eyebrow { color: var(--cool-grey-400, #b6c3cf); font-size: 13px; letter-spacing: .08em; text-transform: uppercase; }
    h1 { margin: 8px 0; font-size: 32px; line-height: 1.25; }
    section { margin-top: 24px; padding: 24px; border: 1px solid var(--cool-grey-700, #52687e); border-radius: 16px; background: var(--cool-grey-925, #243649); }
    h2 { margin: 0 0 12px; font-size: 18px; }
    dl { display: grid; grid-template-columns: auto 1fr; gap: 8px 24px; margin: 0; }
    dt { color: var(--cool-grey-400, #b6c3cf); }
    dd { margin: 0; overflow-wrap: anywhere; }
    button { padding: 10px 16px; border: 0; border-radius: 8px; font: inherit; font-weight: 600; color: #162330; background: #a78bfa; cursor: pointer; }
    button:focus-visible { outline: 3px solid #f2f5f8; outline-offset: 3px; }
    [role="status"] { margin: 12px 0 0; overflow-wrap: anywhere; }
    @media (max-width: 480px) { body { padding: 20px; } section { padding: 20px; } dl { grid-template-columns: 1fr; gap: 4px; } dd { margin-bottom: 12px; } }
  </style>
</head>
<body>
  <main data-testid="demo-skin-page">
    <div class="eyebrow">Local verification fixture</div>
    <h1>QA Demo Skin</h1>
    <p data-testid="demo-skin-revision">${escapeHtml(status.revision)}</p>
    <section aria-label="Connected services">
      <h2>Connected services</h2>
      <dl>
        <dt>Agent Server</dt><dd data-testid="demo-agent-server">${escapeHtml(status.backend.agentServer)}</dd>
        <dt>Automations</dt><dd data-testid="demo-automation">${escapeHtml(status.backend.automation)}</dd>
      </dl>
    </section>
    <section aria-label="Local skin API">
      <h2>Local skin API</h2>
      <button type="button" data-testid="demo-api-button">Check skin API</button>
      <p role="status" data-testid="demo-api-result">Ready to check the local API.</p>
    </section>
  </main>
  <script type="module">
    const button = document.querySelector('[data-testid="demo-api-button"]');
    const result = document.querySelector('[data-testid="demo-api-result"]');
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        const response = await fetch("api/status");
        if (!response.ok) throw new Error("HTTP " + response.status);
        const status = await response.json();
        result.textContent = "API ready: " + status.revision;
      } catch (error) {
        result.textContent = "API unavailable: " + error.message;
      } finally {
        button.disabled = false;
      }
    });
  </script>
</body>
</html>`;

const server = createServer((request, response) => {
  const path = new URL(request.url, "http://localhost").pathname;
  if (request.method !== "GET") {
    response.writeHead(405, { Allow: "GET" });
    response.end("Method not allowed");
    return;
  }
  if (path === "/skin-app") {
    response.writeHead(308, { Location: "/skin-app/" });
    response.end();
    return;
  }
  if (path === "/skin-app/api/status") {
    response.writeHead(200, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    response.end(JSON.stringify(status));
    return;
  }
  if (path === "/skin-app/") {
    response.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    });
    response.end(html);
    return;
  }
  response.writeHead(404, { "Content-Type": "text/plain" });
  response.end("Not found");
});

server.listen(port, "127.0.0.1", () => {
  console.log(`QA Demo Skin listening on 127.0.0.1:${port}`);
});

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
