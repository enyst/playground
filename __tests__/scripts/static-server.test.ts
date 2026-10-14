import { createServer, request, type Server } from "node:http";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { connect as netConnect } from "node:net";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  parseArgs,
  serializeForInlineScript,
  startStaticServer,
} from "../../scripts/static-server.mjs";

describe("static-server.mjs", () => {
  const servers: Server[] = [];
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      servers.splice(0).map(
        (server) =>
          new Promise<void>((resolve) => {
            server.close(() => resolve());
          }),
      ),
    );

    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  async function startServer(
    dir: string,
    overrides: Partial<Parameters<typeof startStaticServer>[0]> = {},
  ) {
    const server = await startStaticServer({
      port: 0,
      host: "127.0.0.1",
      dir,
      routes: {},
      ...overrides,
    });
    servers.push(server);

    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Static server did not bind to a TCP port");
    }

    return `http://127.0.0.1:${address.port}`;
  }

  async function startHttpServer(server: Server) {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        server.off("error", reject);
        resolve();
      });
    });
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Server did not bind to a TCP port");
    }
    return `http://127.0.0.1:${address.port}`;
  }

  async function getJson(url: string) {
    return new Promise<{ status: number; body: unknown }>((resolve, reject) => {
      const req = request(url, { method: "GET" }, (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          try {
            resolve({
              status: res.statusCode ?? 0,
              body: JSON.parse(body),
            });
          } catch (error) {
            reject(error);
          }
        });
      });
      req.on("error", reject);
      req.end();
    });
  }

  async function getText(url: string) {
    return new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = request(url, { method: "GET" }, (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            body,
          });
        });
      });
      req.on("error", reject);
      req.end();
    });
  }

  describe("parseArgs", () => {
    it("defaults host to IPv4 loopback", () => {
      expect(parseArgs([]).host).toBe("127.0.0.1");
    });

    it("defaults sessionApiKey to null", () => {
      const config = parseArgs([]);
      expect(config.sessionApiKey).toBeNull();
    });

    it("parses --session-api-key", () => {
      const config = parseArgs(["--session-api-key", "my-test-key"]);
      expect(config.sessionApiKey).toBe("my-test-key");
    });

    it("treats empty string as null for session key", () => {
      const config = parseArgs(["--session-api-key", ""]);
      expect(config.sessionApiKey).toBeNull();
    });

    it("defaults runtimeServicesInfo to null", () => {
      const config = parseArgs([]);
      expect(config.runtimeServicesInfo).toBeNull();
    });

    it("defaults lockToCloud to null", () => {
      const config = parseArgs([]);
      expect(config.lockToCloud).toBeNull();
    });

    it("parses --lock-to-cloud", () => {
      const config = parseArgs([
        "--lock-to-cloud",
        "https://cloud.example.com",
      ]);
      expect(config.lockToCloud).toBe("https://cloud.example.com");
    });

    it("treats empty string as null for lockToCloud", () => {
      const config = parseArgs(["--lock-to-cloud", ""]);
      expect(config.lockToCloud).toBeNull();
    });

    it("defaults disableTelemetry to false", () => {
      const config = parseArgs([], {});
      expect(config.disableTelemetry).toBe(false);
    });

    it("parses --disable-telemetry", () => {
      const config = parseArgs(["--disable-telemetry"], {});
      expect(config.disableTelemetry).toBe(true);
    });

    it("enables disableTelemetry from AGENT_CANVAS_DISABLE_TELEMETRY=1", () => {
      const config = parseArgs([], { AGENT_CANVAS_DISABLE_TELEMETRY: "1" });
      expect(config.disableTelemetry).toBe(true);
    });

    it("enables disableTelemetry from AGENT_CANVAS_DISABLE_TELEMETRY=true", () => {
      const config = parseArgs([], { AGENT_CANVAS_DISABLE_TELEMETRY: "true" });
      expect(config.disableTelemetry).toBe(true);
    });

    it("ignores a falsy AGENT_CANVAS_DISABLE_TELEMETRY value", () => {
      const config = parseArgs([], { AGENT_CANVAS_DISABLE_TELEMETRY: "0" });
      expect(config.disableTelemetry).toBe(false);
    });

    it("defaults basePath to root", () => {
      const config = parseArgs([]);
      expect(config.basePath).toBe("/");
    });

    it("parses and normalizes --base-path", () => {
      const config = parseArgs(["--base-path", "canvas/"]);
      expect(config.basePath).toBe("/canvas");
    });

    it("treats empty string as root for basePath", () => {
      const config = parseArgs(["--base-path", ""]);
      expect(config.basePath).toBe("/");
    });

    it("parses --runtime-services-info", () => {
      const json = '{"mode":"docker"}';
      const config = parseArgs(["--runtime-services-info", json]);
      expect(config.runtimeServicesInfo).toBe(json);
    });

    it("treats empty string as null for runtime services info", () => {
      const config = parseArgs(["--runtime-services-info", ""]);
      expect(config.runtimeServicesInfo).toBeNull();
    });
  });

  describe("serializeForInlineScript", () => {
    it("escapes '<' and '>' to prevent breaking out of script tags", () => {
      const input = "</script><script>alert(1)</script>";
      const result = serializeForInlineScript(input);
      expect(result).not.toContain("<");
      expect(result).not.toContain(">");
      expect(result).toBe(
        '"\\u003c/script\\u003e\\u003cscript\\u003ealert(1)\\u003c/script\\u003e"',
      );
    });

    it("escapes line and paragraph separators U+2028 and U+2029", () => {
      const input = "line1\u2028line2\u2029line3";
      const result = serializeForInlineScript(input);
      expect(result).toContain("\\u2028");
      expect(result).toContain("\\u2029");
      expect(result).not.toContain("\u2028");
      expect(result).not.toContain("\u2029");
    });

    it("serializes complex objects properly with escaping", () => {
      const input = { key: "<test>", count: 42 };
      const result = serializeForInlineScript(input);
      expect(result).toBe('{"key":"\\u003ctest\\u003e","count":42}');
    });
  });

  describe("--vscode-base-path", () => {
    it("parses the prefix and normalizes a trailing slash", () => {
      const config = parseArgs([
        "--route",
        "/vscode=http://127.0.0.1:8001",
        "--vscode-base-path",
        "/vscode/",
      ]);
      expect(config.vscodeBasePath).toBe("/vscode");
    });

    it("defaults to null so an origin advertises nothing unless asked", () => {
      expect(parseArgs([]).vscodeBasePath).toBeNull();
    });

    it("rejects a value that is not a path", () => {
      expect(() => parseArgs(["--vscode-base-path", "vscode"])).toThrow(
        /must start with '\//,
      );
    });

    // The guard that makes this flag trustworthy: advertising the editor and
    // routing it are the same decision, so a prefix with no route behind it
    // must not start. Without it, the frontend would render the control and
    // the navigation would fall through to the SPA — the exact bug the flag
    // exists to prevent.
    it("refuses to start when the advertised prefix has no matching route", () => {
      const exit = vi.spyOn(process, "exit").mockImplementation((() => {
        throw new Error("process.exit");
      }) as never);
      const error = vi.spyOn(console, "error").mockImplementation(() => {});

      try {
        expect(() =>
          parseArgs([
            "--route",
            "/api=http://127.0.0.1:8000",
            "--vscode-base-path",
            "/vscode",
          ]),
        ).toThrow("process.exit");
        expect(exit).toHaveBeenCalledWith(1);
        expect(error.mock.calls[0][0]).toContain("has no matching --route");
      } finally {
        exit.mockRestore();
        error.mockRestore();
      }
    });
  });

  describe("vscode base path injection", () => {
    async function startServerAdvertising(
      dir: string,
      vscodeBasePath: string | null,
    ) {
      const server = await startStaticServer({
        port: 0,
        host: "127.0.0.1",
        dir,
        routes: {},
        vscodeBasePath,
      });
      servers.push(server);
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Static server did not bind to a TCP port");
      }
      return `http://127.0.0.1:${address.port}`;
    }

    function makeBuildDir() {
      const buildDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-build-"));
      tempDirs.push(buildDir);
      writeFileSync(
        path.join(buildDir, "index.html"),
        "<html><head></head><body>app</body></html>",
      );
      return buildDir;
    }

    // Read by getOriginVSCodeBasePath() in src/utils/vscode-origin.ts, which
    // is what lets the frontend tell "this server has an editor" apart from
    // "this origin can reach it".
    it("exposes the prefix on window.__AGENT_CANVAS_VSCODE_BASE_PATH__", async () => {
      const origin = await startServerAdvertising(makeBuildDir(), "/vscode");
      const body = await (await fetch(`${origin}/`)).text();

      expect(body).toContain(
        'window.__AGENT_CANVAS_VSCODE_BASE_PATH__="/vscode"',
      );
    });

    // Public mode: the same document, served without the advertisement, is
    // what hides the control on an origin that has no editor route.
    it("injects nothing when the origin serves no editor", async () => {
      const origin = await startServerAdvertising(makeBuildDir(), null);
      const body = await (await fetch(`${origin}/`)).text();

      expect(body).not.toContain("__AGENT_CANVAS_VSCODE_BASE_PATH__");
    });
  });

  describe("runtime services info exposure", () => {
    async function startServerWithRuntimeInfo(
      dir: string,
      runtimeServicesInfo: string,
    ) {
      const server = await startStaticServer({
        port: 0,
        host: "127.0.0.1",
        dir,
        routes: {},
        runtimeServicesInfo,
      });
      servers.push(server);
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Static server did not bind to a TCP port");
      }
      return `http://127.0.0.1:${address.port}`;
    }

    // Legacy compatibility for older Docker / published-binary frontend
    // bundles, which read runtime services from this injected window global.
    // New bundles read /server_info.runtime_services instead.
    it("exposes the JSON on window.__AGENT_CANVAS_RUNTIME_SERVICES_INFO__", async () => {
      const buildDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-build-"));
      tempDirs.push(buildDir);
      writeFileSync(
        path.join(buildDir, "index.html"),
        "<html><head></head><body>app</body></html>",
      );

      const info = JSON.stringify({
        mode: "docker",
        services: {
          agent_server: { url_from_agent: "http://127.0.0.1:18000" },
        },
      });
      const origin = await startServerWithRuntimeInfo(buildDir, info);
      const body = await (await fetch(`${origin}/`)).text();

      expect(body).toContain("window.__AGENT_CANVAS_RUNTIME_SERVICES_INFO__");
      // Stored as a JSON *string* (note the escaped quotes) so older browser
      // code can JSON.parse it.
      expect(body).toContain('\\"mode\\"');
      expect(body).toContain("docker");
    });

    it("does not inject when runtimeServicesInfo is null", async () => {
      const buildDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-build-"));
      tempDirs.push(buildDir);
      writeFileSync(
        path.join(buildDir, "index.html"),
        "<html><head></head><body>app</body></html>",
      );

      const server = await startStaticServer({
        port: 0,
        host: "127.0.0.1",
        dir: buildDir,
        routes: {},
        runtimeServicesInfo: null,
      });
      servers.push(server);
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("No port");
      const origin = `http://127.0.0.1:${(address as { port: number }).port}`;

      const body = await (await fetch(`${origin}/`)).text();
      expect(body).not.toContain("__AGENT_CANVAS_RUNTIME_SERVICES_INFO__");
    });

    it("adds runtime_services to proxied /server_info", async () => {
      const buildDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-build-"));
      tempDirs.push(buildDir);
      writeFileSync(
        path.join(buildDir, "index.html"),
        "<html><head></head><body>app</body></html>",
      );

      const upstreamOrigin = await startHttpServer(
        createServer((_req, res) => {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ version: "1.48.0" }));
        }),
      );
      const runtimeServicesInfo = JSON.stringify({
        mode: "docker",
        services: {
          agent_server: { url_from_agent: "http://127.0.0.1:18000" },
        },
      });

      const server = await startStaticServer({
        port: 0,
        host: "127.0.0.1",
        dir: buildDir,
        routes: { "/server_info": upstreamOrigin },
        runtimeServicesInfo,
      });
      servers.push(server);
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("No port");
      const origin = `http://127.0.0.1:${address.port}`;

      const response = await getJson(`${origin}/server_info`);
      const body = response.body as {
        version?: string;
        runtime_services?: unknown;
      };

      expect(response.status).toBe(200);
      expect(body.version).toBe("1.48.0");
      expect(body.runtime_services).toEqual(JSON.parse(runtimeServicesInfo));
    });

    it("returns 502 when proxied /server_info target URL is invalid", async () => {
      const buildDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-build-"));
      tempDirs.push(buildDir);
      writeFileSync(
        path.join(buildDir, "index.html"),
        "<html><head></head><body>app</body></html>",
      );

      const runtimeServicesInfo = JSON.stringify({
        mode: "docker",
        services: {},
      });
      const server = await startStaticServer({
        port: 0,
        host: "127.0.0.1",
        dir: buildDir,
        routes: { "/server_info": "not-a-url" },
        runtimeServicesInfo,
      });
      servers.push(server);
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("No port");
      const origin = `http://127.0.0.1:${address.port}`;

      const response = await getText(`${origin}/server_info`);

      expect(response.status).toBe(502);
      expect(response.body).toContain("Bad Gateway");
      expect(response.body).toContain("Invalid backend URL");
      expect(server.listening).toBe(true);
    });
  });

  describe("lock-to-cloud injection", () => {
    async function startServerLockedToCloud(dir: string, lockToCloud: string) {
      const server = await startStaticServer({
        port: 0,
        host: "127.0.0.1",
        dir,
        routes: {},
        lockToCloud,
      });
      servers.push(server);
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Static server did not bind to a TCP port");
      }
      return `http://127.0.0.1:${address.port}`;
    }

    it("exposes the locked Cloud URL on window.__AGENT_CANVAS_LOCK_TO_CLOUD__", async () => {
      const buildDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-build-"));
      tempDirs.push(buildDir);
      writeFileSync(
        path.join(buildDir, "index.html"),
        "<html><head></head><body>app</body></html>",
      );

      const origin = await startServerLockedToCloud(
        buildDir,
        "https://cloud.example.com",
      );
      const body = await (await fetch(`${origin}/`)).text();

      expect(body).toContain("window.__AGENT_CANVAS_LOCK_TO_CLOUD__");
      expect(body).toContain('"https://cloud.example.com"');
    });

    it("injects lock-to-cloud into SPA fallback index.html", async () => {
      const buildDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-build-"));
      tempDirs.push(buildDir);
      writeFileSync(
        path.join(buildDir, "index.html"),
        "<html><head></head><body>app</body></html>",
      );

      const origin = await startServerLockedToCloud(
        buildDir,
        "https://cloud.example.com",
      );
      const response = await fetch(`${origin}/some/deep/route`);
      const body = await response.text();

      expect(response.status).toBe(200);
      expect(body).toContain("__AGENT_CANVAS_LOCK_TO_CLOUD__");
    });
  });

  describe("disable-telemetry injection", () => {
    async function startServerWithDisabledTelemetry(dir: string) {
      const origin = await startServer(dir, { disableTelemetry: true });
      return origin;
    }

    it("exposes window.__AGENT_CANVAS_DO_NOT_TRACK__ when enabled", async () => {
      const buildDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-build-"));
      tempDirs.push(buildDir);
      writeFileSync(
        path.join(buildDir, "index.html"),
        "<html><head></head><body>app</body></html>",
      );

      const origin = await startServerWithDisabledTelemetry(buildDir);
      const body = await (await fetch(`${origin}/`)).text();

      expect(body).toContain("window.__AGENT_CANVAS_DO_NOT_TRACK__=true");
    });

    it("injects the flag into the SPA fallback index.html", async () => {
      const buildDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-build-"));
      tempDirs.push(buildDir);
      writeFileSync(
        path.join(buildDir, "index.html"),
        "<html><head></head><body>app</body></html>",
      );

      const origin = await startServerWithDisabledTelemetry(buildDir);
      const response = await fetch(`${origin}/some/deep/route`);
      const body = await response.text();

      expect(response.status).toBe(200);
      expect(body).toContain("window.__AGENT_CANVAS_DO_NOT_TRACK__=true");
    });

    it("does not inject the flag when telemetry is not disabled", async () => {
      const buildDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-build-"));
      tempDirs.push(buildDir);
      writeFileSync(
        path.join(buildDir, "index.html"),
        "<html><head></head><body>app</body></html>",
      );

      const origin = await startServer(buildDir);
      const body = await (await fetch(`${origin}/`)).text();

      expect(body).not.toContain("__AGENT_CANVAS_DO_NOT_TRACK__");
    });
  });

  describe("session key injection", () => {
    async function startServerWithKey(dir: string, sessionApiKey: string) {
      const server = await startStaticServer({
        port: 0,
        host: "127.0.0.1",
        dir,
        routes: {},
        sessionApiKey,
      });
      servers.push(server);
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Static server did not bind to a TCP port");
      }
      return `http://127.0.0.1:${address.port}`;
    }

    it("injects session key script into index.html", async () => {
      const buildDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-build-"));
      tempDirs.push(buildDir);
      writeFileSync(
        path.join(buildDir, "index.html"),
        "<html><head></head><body>app</body></html>",
      );

      const origin = await startServerWithKey(buildDir, "test-session-key");
      const response = await fetch(`${origin}/`);

      expect(response.status).toBe(200);
      const body = await response.text();
      expect(body).toContain("openhands-agent-server-config");
      expect(body).toContain("test-session-key");
      expect(body).toContain("sessionApiKey");
    });

    // Regression test: the published `agent-canvas` binary builds without
    // VITE_SESSION_API_KEY baked in, so the React app reads the key from
    // `window.__AGENT_CANVAS_SESSION_API_KEY__` (see
    // `getBakedSessionApiKey()` in `src/api/agent-server-config.ts`).
    // Without this assignment, `makeDefaultLocalBackend()` returns null
    // on a fresh install and the user gets the Manage Backends modal
    // instead of onboarding.
    it("exposes the session key on window.__AGENT_CANVAS_SESSION_API_KEY__", async () => {
      const buildDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-build-"));
      tempDirs.push(buildDir);
      writeFileSync(
        path.join(buildDir, "index.html"),
        "<html><head></head><body>app</body></html>",
      );

      const origin = await startServerWithKey(buildDir, "runtime-key");
      const response = await fetch(`${origin}/`);
      const body = await response.text();

      expect(body).toContain("window.__AGENT_CANVAS_SESSION_API_KEY__");
      expect(body).toContain('"runtime-key"');
      // The window assignment must precede the localStorage write so the
      // global is set even if storage access throws (private mode, etc.).
      const windowIdx = body.indexOf("__AGENT_CANVAS_SESSION_API_KEY__");
      const localStorageIdx = body.indexOf("openhands-agent-server-config");
      expect(windowIdx).toBeGreaterThan(-1);
      expect(localStorageIdx).toBeGreaterThan(-1);
      expect(windowIdx).toBeLessThan(localStorageIdx);
    });

    it("injects session key into SPA fallback index.html", async () => {
      const buildDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-build-"));
      tempDirs.push(buildDir);
      writeFileSync(
        path.join(buildDir, "index.html"),
        "<html><head></head><body>app</body></html>",
      );

      const origin = await startServerWithKey(buildDir, "fallback-key");
      const response = await fetch(`${origin}/some/deep/route`);

      expect(response.status).toBe(200);
      const body = await response.text();
      expect(body).toContain("fallback-key");
    });

    it("does not inject into non-html asset responses", async () => {
      const buildDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-build-"));
      tempDirs.push(buildDir);
      mkdirSync(path.join(buildDir, "assets"));
      writeFileSync(
        path.join(buildDir, "index.html"),
        "<html><head></head><body>app</body></html>",
      );
      writeFileSync(
        path.join(buildDir, "assets", "app.js"),
        "console.log('app');",
      );

      const origin = await startServerWithKey(buildDir, "should-not-inject");
      const response = await fetch(`${origin}/assets/app.js`);

      expect(response.status).toBe(200);
      const body = await response.text();
      expect(body).not.toContain("should-not-inject");
    });

    it("sets Cache-Control: no-store when session key is injected", async () => {
      const buildDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-build-"));
      tempDirs.push(buildDir);
      writeFileSync(
        path.join(buildDir, "index.html"),
        "<html><head></head><body>app</body></html>",
      );

      const origin = await startServerWithKey(buildDir, "cache-test-key");
      const response = await fetch(`${origin}/`);

      expect(response.headers.get("cache-control")).toBe("no-store");
    });

    it("sets Cache-Control: no-cache when session key is not present but other config is injected", async () => {
      const buildDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-build-"));
      tempDirs.push(buildDir);
      writeFileSync(
        path.join(buildDir, "index.html"),
        "<html><head></head><body>app</body></html>",
      );

      const server = await startStaticServer({
        port: 0,
        host: "127.0.0.1",
        dir: buildDir,
        routes: {},
        authRequired: true,
      });
      servers.push(server);
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("No port");
      const origin = `http://127.0.0.1:${(address as { port: number }).port}`;

      const response = await fetch(`${origin}/`);

      expect(response.headers.get("cache-control")).toBe("no-cache");
    });

    it("does not inject the session key when bound off-loopback", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const buildDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-build-"));
      tempDirs.push(buildDir);
      writeFileSync(
        path.join(buildDir, "index.html"),
        "<html><head></head><body>app</body></html>",
      );

      try {
        const server = await startStaticServer({
          port: 0,
          host: "0.0.0.0",
          dir: buildDir,
          routes: {},
          sessionApiKey: "lan-secret",
        });
        servers.push(server);
        const address = server.address();
        if (!address || typeof address === "string") {
          throw new Error("Static server did not bind to a TCP port");
        }
        const origin = `http://127.0.0.1:${address.port}`;
        const body = await (await fetch(`${origin}/`)).text();

        expect(body).not.toContain("lan-secret");
        expect(body).not.toContain("__AGENT_CANVAS_SESSION_API_KEY__");
        expect(body).toContain("__AGENT_CANVAS_AUTH_REQUIRED__");
        expect(warn).toHaveBeenCalled();
      } finally {
        warn.mockRestore();
      }
    });

    it("injects the session key off-loopback only with --allow-lan-session-key", async () => {
      const buildDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-build-"));
      tempDirs.push(buildDir);
      writeFileSync(
        path.join(buildDir, "index.html"),
        "<html><head></head><body>app</body></html>",
      );

      const server = await startStaticServer({
        port: 0,
        host: "0.0.0.0",
        dir: buildDir,
        routes: {},
        sessionApiKey: "container-key",
        allowLanSessionKey: true,
      });
      servers.push(server);
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Static server did not bind to a TCP port");
      }
      const origin = `http://127.0.0.1:${address.port}`;
      const body = await (await fetch(`${origin}/`)).text();

      expect(body).toContain("container-key");
      expect(body).toContain("__AGENT_CANVAS_SESSION_API_KEY__");
    });

    it("escapes HTML special characters and script closing tags in injected values", async () => {
      const buildDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-build-"));
      tempDirs.push(buildDir);
      writeFileSync(
        path.join(buildDir, "index.html"),
        "<html><head></head><body>app</body></html>",
      );

      const payload = '</script><script>alert("xss")</script>';
      const origin = await startServerWithKey(buildDir, payload);
      const response = await fetch(`${origin}/`);
      const body = await response.text();

      expect(body).not.toContain("</script><script>");
      expect(body).toContain("\\u003c/script\\u003e\\u003cscript\\u003e");
    });

    it("does not inject when sessionApiKey is null", async () => {
      const buildDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-build-"));
      tempDirs.push(buildDir);
      writeFileSync(
        path.join(buildDir, "index.html"),
        "<html><head></head><body>app</body></html>",
      );

      const server = await startStaticServer({
        port: 0,
        host: "127.0.0.1",
        dir: buildDir,
        routes: {},
        sessionApiKey: null,
      });
      servers.push(server);
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("No port");
      const origin = `http://127.0.0.1:${(address as { port: number }).port}`;

      const response = await fetch(`${origin}/`);
      const body = await response.text();
      expect(body).not.toContain("openhands-agent-server-config");
      expect(body).not.toContain("__AGENT_CANVAS_SESSION_API_KEY__");
    });

    it("injects session key into HTML without </head> tag (falls back to </body>)", async () => {
      const buildDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-build-"));
      tempDirs.push(buildDir);
      writeFileSync(
        path.join(buildDir, "index.html"),
        "<html><body>no-head</body></html>",
      );

      const origin = await startServerWithKey(buildDir, "no-head-key");
      const response = await fetch(`${origin}/`);

      expect(response.status).toBe(200);
      const body = await response.text();
      expect(body).toContain("no-head-key");
      expect(body).toContain("openhands-agent-server-config");
      // Script should appear before </body>, not at the very front of the document
      expect(body.indexOf("no-head-key")).toBeLessThan(body.indexOf("</body>"));
      expect(body.indexOf("no-head-key")).toBeGreaterThan(0);
    });
  });

  it("serves nested build assets on all platforms", async () => {
    const buildDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-build-"));
    tempDirs.push(buildDir);
    mkdirSync(path.join(buildDir, "assets"));
    writeFileSync(path.join(buildDir, "index.html"), "<main>app</main>");
    writeFileSync(
      path.join(buildDir, "assets", "entry.client-test.js"),
      "export const loaded = true;\n",
    );

    const origin = await startServer(buildDir);
    const response = await fetch(`${origin}/assets/entry.client-test.js`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain(
      "application/javascript",
    );
    await expect(response.text()).resolves.toContain("loaded = true");
  });

  it("serves the current build after assets are replaced", async () => {
    const buildDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-build-"));
    tempDirs.push(buildDir);
    mkdirSync(path.join(buildDir, "assets"));
    writeFileSync(path.join(buildDir, "index.html"), "<main>app</main>");
    const oldAsset = path.join(buildDir, "assets", "old.js");
    writeFileSync(oldAsset, "old build");
    const origin = await startServer(buildDir);

    rmSync(oldAsset);
    writeFileSync(path.join(buildDir, "assets", "new.js"), "new build");

    const removed = await fetch(`${origin}/assets/old.js`);
    expect(removed.status).toBe(404);
    await removed.text();
    const replacement = await fetch(`${origin}/assets/new.js`);
    expect(replacement.status).toBe(200);
    expect(replacement.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable",
    );
    await expect(replacement.text()).resolves.toBe("new build");
    const navigation = await fetch(`${origin}/conversations`, {
      headers: { Accept: "text/html" },
    });
    await expect(navigation.text()).resolves.toContain("<main>app</main>");
  });

  describe("base path mounting", () => {
    it("serves index.html and injects the base path under the mount", async () => {
      const buildDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-build-"));
      tempDirs.push(buildDir);
      writeFileSync(
        path.join(buildDir, "index.html"),
        "<html><head></head><body>app</body></html>",
      );

      const origin = await startServer(buildDir, { basePath: "/canvas" });
      const response = await fetch(`${origin}/canvas/conversations/abc`);
      const body = await response.text();

      expect(response.status).toBe(200);
      expect(body).toContain("window.__AGENT_CANVAS_BASE_PATH__");
      expect(body).toContain('"/canvas"');
    });

    it("serves static assets from underneath the mount", async () => {
      const buildDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-build-"));
      tempDirs.push(buildDir);
      mkdirSync(path.join(buildDir, "assets"));
      writeFileSync(path.join(buildDir, "index.html"), "<main>app</main>");
      writeFileSync(
        path.join(buildDir, "assets", "entry.client-test.js"),
        "export const loaded = true;\n",
      );

      const origin = await startServer(buildDir, { basePath: "/canvas" });
      const response = await fetch(
        `${origin}/canvas/assets/entry.client-test.js`,
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain(
        "application/javascript",
      );
      await expect(response.text()).resolves.toContain("loaded = true");
    });

    it("redirects app routes outside the mount to the configured base path", async () => {
      const buildDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-build-"));
      tempDirs.push(buildDir);
      writeFileSync(path.join(buildDir, "index.html"), "<main>app</main>");

      const origin = await startServer(buildDir, { basePath: "/canvas" });
      const response = await fetch(`${origin}/conversations/abc?tab=files`, {
        redirect: "manual",
      });

      expect(response.status).toBe(308);
      expect(response.headers.get("location")).toBe(
        "/canvas/conversations/abc?tab=files",
      );
    });

    it("does not redirect asset-like requests outside the configured mount", async () => {
      const buildDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-build-"));
      tempDirs.push(buildDir);
      writeFileSync(path.join(buildDir, "index.html"), "<main>app</main>");

      const origin = await startServer(buildDir, { basePath: "/canvas" });
      const response = await fetch(`${origin}/assets/missing.js`, {
        redirect: "manual",
      });

      expect(response.status).toBe(404);
    });
  });

  describe("--no-referrer-prefix", () => {
    it("defaults to none", () => {
      expect(parseArgs([]).noReferrerPrefixes).toEqual([]);
    });

    it("collects repeated prefixes", () => {
      const config = parseArgs([
        "--no-referrer-prefix",
        "/vscode",
        "--no-referrer-prefix",
        "/editor",
      ]);
      expect(config.noReferrerPrefixes).toEqual(["/vscode", "/editor"]);
    });

    it("rejects a prefix without a leading slash", () => {
      expect(() => parseArgs(["--no-referrer-prefix", "vscode"])).toThrow(
        /must start with/,
      );
    });

    // Behaviour on a live proxied response is covered in ingress.test.ts,
    // which drives a real child process; an in-process proxy deadlocks against
    // the MSW interceptor this suite installs globally.
  });

  describe("skin integration", () => {
    const staticScript = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../scripts/static-server.mjs",
    );
    const children: ChildProcess[] = [];
    const skinPids: number[] = [];

    it("enables the runtime explicitly and reads its port from shared config", () => {
      const defaults = JSON.parse(
        readFileSync(
          path.resolve(path.dirname(staticScript), "../config/defaults.json"),
          "utf8",
        ),
      );
      expect(parseArgs([], {}).skinPort).toBeNull();
      expect(parseArgs(["--skin"], {}).skinPort).toBe(defaults.ports.skin);
      expect(
        parseArgs([], {
          OPENHANDS_ENABLE_SKIN: "true",
          OPENHANDS_SKIN_PORT: "18500",
        }).skinPort,
      ).toBe(18500);
      expect(parseArgs(["--skin-port", "18501"], {}).skinPort).toBe(18501);
    });

    it.each(["0", "65536", "bad", "18500garbage"])(
      "rejects invalid skin port %s",
      (port) => {
        expect(() => parseArgs(["--skin-port", port], {})).toThrow(
          /skin.*port/i,
        );
      },
    );

    it("rejects a missing explicit skin port", () => {
      expect(() => parseArgs(["--skin-port"], {})).toThrow(/Missing skin port/);
    });

    it("refuses skin management on a LAN bind without a session key", () => {
      expect(() =>
        startStaticServer({
          port: 0,
          host: "0.0.0.0",
          dir: ".",
          routes: {},
          skinPort: 18002,
        }),
      ).toThrow(/requires --session-api-key/);
    });

    afterEach(async () => {
      for (const child of children.splice(0)) {
        if (child.exitCode !== null || child.signalCode !== null) continue;
        const exited = once(child, "exit");
        child.kill("SIGTERM");
        await Promise.race([exited, delay(6000)]);
        if (child.exitCode === null && child.signalCode === null) {
          child.kill("SIGKILL");
          await exited;
        }
      }
      for (const pid of skinPids.splice(0)) {
        try {
          process.kill(pid, "SIGKILL");
        } catch {
          // The successful shutdown already removed this process.
        }
      }
    });

    async function freePort() {
      const temporaryServer = createServer();
      const origin = await startHttpServer(temporaryServer);
      await new Promise<void>((resolve) =>
        temporaryServer.close(() => resolve()),
      );
      return new URL(origin).port;
    }

    async function startSkinHost({
      skinPort,
      installed = false,
      closeFromStdin = false,
      ignoreTermination = false,
      flags = [],
    }: {
      skinPort: string;
      installed?: boolean;
      closeFromStdin?: boolean;
      ignoreTermination?: boolean;
      flags?: string[];
    }) {
      const directory = mkdtempSync(path.join(tmpdir(), "canvas-skin-host-"));
      tempDirs.push(directory);
      const build = path.join(directory, "build");
      const state = path.join(directory, "state");
      const workspace = path.join(directory, "skin");
      mkdirSync(build);
      mkdirSync(state);
      mkdirSync(workspace);
      writeFileSync(
        path.join(build, "index.html"),
        "<html><head></head><body>Canvas shell</body></html>",
      );
      if (installed) {
        writeFileSync(
          path.join(state, "skin-settings.json"),
          JSON.stringify({ repoUrl: "https://github.com/example/skin" }),
        );
        writeFileSync(
          path.join(workspace, "skin.yaml"),
          "name: Lifecycle fixture\n",
        );
        writeFileSync(
          path.join(workspace, "SKILL.md"),
          "# Lifecycle fixture\n",
        );
        writeFileSync(
          path.join(workspace, "package.json"),
          JSON.stringify({ scripts: { start: "node server.mjs" } }),
        );
        writeFileSync(
          path.join(workspace, "server.mjs"),
          `import { createServer } from "node:http";
${ignoreTermination ? 'process.on("SIGTERM", () => {});' : ""}
createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ pid: process.pid, url: req.url }));
}).listen(Number(process.env.OPENHANDS_SKIN_PORT), "127.0.0.1");
`,
        );
        if (ignoreTermination) {
          // An npm shim that execs a signal-resistant service proves the
          // process-group deadline even when the group leader cannot exit.
          writeFileSync(
            path.join(workspace, "npm"),
            "#!/bin/sh\nexec node server.mjs\n",
            { mode: 0o755 },
          );
        }
      }
      const port = await freePort();
      const args = [
        "--port",
        port,
        "--dir",
        build,
        "--skin-port",
        skinPort,
        ...flags,
      ];
      const child = spawn(
        process.execPath,
        closeFromStdin
          ? [
              "--input-type=module",
              "-e",
              `const { parseArgs, startStaticServer } = await import(${JSON.stringify(pathToFileURL(staticScript).href)});
const server = await startStaticServer(parseArgs(process.argv.slice(1)));
process.stdin.on("data", () => { process.stdin.pause(); server.close(); });`,
              "--",
              ...args,
            ]
          : [staticScript, ...args],
        {
          cwd: path.dirname(staticScript),
          env: {
            ...process.env,
            // Isolate the child runtime's skill persistence as well as its checkout.
            HOME: directory,
            OPENHANDS_SKIN_STATE_DIR: state,
            OPENHANDS_SKIN_WORKSPACE_DIR: workspace,
            MARS_WEB: "0",
            ...(ignoreTermination
              ? { PATH: `${workspace}${path.delimiter}${process.env.PATH}` }
              : {}),
          },
          stdio: ["pipe", "pipe", "pipe"],
        },
      );
      children.push(child);
      let output = "";
      child.stdout?.on("data", (chunk) => {
        output += chunk.toString();
      });
      child.stderr?.on("data", (chunk) => {
        output += chunk.toString();
      });
      const origin = `http://127.0.0.1:${port}`;
      await vi.waitFor(
        async () => {
          if (child.exitCode !== null) throw new Error(output);
          expect([200, 308]).toContain((await getText(`${origin}/`)).status);
        },
        { timeout: 10000 },
      );
      return { child, origin, port };
    }

    it.each(["/", "/canvas"])(
      "keeps skin app, Canvas page and backend routes separate with base path %s",
      async (basePath) => {
        const skin = createServer((req, res) => res.end(`skin:${req.url}`));
        skin.on("upgrade", (req, socket) => {
          socket.end(
            "HTTP/1.1 101 Switching Protocols\r\n" +
              "Upgrade: websocket\r\nConnection: Upgrade\r\n" +
              `X-Skin-Path: ${req.url}\r\n\r\n`,
          );
        });
        const skinOrigin = await startHttpServer(skin);
        const backend = await startHttpServer(
          createServer((req, res) => res.end(`backend:${req.url}`)),
        );
        const { origin, port } = await startSkinHost({
          skinPort: new URL(skinOrigin).port,
          flags: [
            "--base-path",
            basePath,
            "--host",
            "0.0.0.0",
            ...(basePath === "/"
              ? ["--session-api-key", "private-key"]
              : ["--auth-required", "--skin-api-key", "private-key"]),
            "--route",
            `/api=${backend}`,
            "--route",
            `/vscode=${backend}`,
            "--vscode-base-path",
            "/vscode",
            "--no-referrer-prefix",
            "/vscode",
          ],
        });

        expect(await getText(`${origin}/skin-app/api/items?q=one`)).toEqual({
          status: 200,
          body: "skin:/skin-app/api/items?q=one",
        });
        expect(await getJson(`${origin}/skin-api/status`)).toEqual({
          status: 200,
          body: { installed: false, running: false },
        });
        const unauthorized = await fetch(`${origin}/skin-api/restart`, {
          method: "POST",
        });
        expect(unauthorized.status).toBe(401);
        const authorized = await fetch(`${origin}/skin-api/restart`, {
          method: "POST",
          headers: { "X-Session-API-Key": "private-key" },
        });
        expect(authorized.status).toBe(409);
        const page = await getText(
          `${origin}${basePath === "/" ? "" : basePath}/skin`,
        );
        expect(page.body).toContain("Canvas shell");
        expect(page.body).not.toContain("private-key");
        const redirect = await fetch(`${origin}/skin-app?q=one`, {
          redirect: "manual",
        });
        expect(redirect.headers.get("location")).toBe("/skin-app/?q=one");
        expect(await getText(`${origin}/api/conversations`)).toEqual({
          status: 200,
          body: "backend:/api/conversations",
        });
        const editor = await fetch(`${origin}/vscode/`);
        expect(editor.headers.get("referrer-policy")).toBe("no-referrer");
        expect(await editor.text()).toBe("backend:/vscode/");
        const upgrade = await new Promise<string>((resolve, reject) => {
          const socket = netConnect(
            { host: "127.0.0.1", port: Number(port) },
            () => {
              socket.write(
                "GET /skin-app/socket?q=one HTTP/1.1\r\nHost: localhost\r\n" +
                  "Connection: Upgrade\r\nUpgrade: websocket\r\n\r\n",
              );
            },
          );
          socket.setTimeout(3000, () => {
            socket.destroy();
            reject(new Error("Skin upgrade timed out"));
          });
          socket.once("error", reject);
          socket.once("data", (data) => {
            socket.destroy();
            resolve(data.toString());
          });
        });
        expect(upgrade).toContain("101 Switching Protocols");
        expect(upgrade.toLowerCase()).toContain(
          "x-skin-path: /skin-app/socket?q=one",
        );
      },
    );

    it("hosts skin management beside a proxied development frontend", async () => {
      const skin = await startHttpServer(
        createServer((req, res) => res.end(`skin:${req.url}`)),
      );
      const frontend = await startHttpServer(
        createServer((req, res) => res.end(`Canvas frontend:${req.url}`)),
      );
      const { origin } = await startSkinHost({
        skinPort: new URL(skin).port,
        flags: [
          "--default",
          frontend,
          "--skin-api-key",
          "manager-key",
          "--host",
          "0.0.0.0",
        ],
      });
      expect(await getText(`${origin}/skin`)).toEqual({
        status: 200,
        body: "Canvas frontend:/skin",
      });
      expect(await getText(`${origin}/skin-app/api/status`)).toEqual({
        status: 200,
        body: "skin:/skin-app/api/status",
      });
      expect((await getJson(`${origin}/skin-api/status`)).body).toEqual({
        installed: false,
        running: false,
      });
    });

    it.each([
      "close",
      "SIGINT",
      "SIGTERM",
      "SIGHUP",
      "SIGTERM-ignored",
    ] as const)(
      "stops the installed skin process and releases its port on %s",
      async (mode) => {
        const skinPort = await freePort();
        const { child, origin } = await startSkinHost({
          skinPort,
          installed: true,
          closeFromStdin: mode === "close",
          ignoreTermination: mode === "SIGTERM-ignored",
        });
        let skinPid = 0;
        await vi.waitFor(
          async () => {
            const response = await getJson(`${origin}/skin-app/`);
            expect(response.status).toBe(200);
            skinPid = (response.body as { pid: number }).pid;
          },
          { timeout: 10000 },
        );
        skinPids.push(skinPid);
        const exited = once(child, "exit");

        if (mode === "close") child.stdin?.end("close");
        else child.kill(mode === "SIGTERM-ignored" ? "SIGTERM" : mode);

        // The enclosing dev launcher force-kills its static child after 3s.
        const deadline =
          mode === "SIGTERM-ignored"
            ? setTimeout(() => child.kill("SIGKILL"), 2700)
            : null;
        await exited;
        if (deadline) clearTimeout(deadline);
        expect(child.exitCode).toBe(0);
        await vi.waitFor(() => {
          try {
            process.kill(skinPid, 0);
            // Minimal container init processes may leave exited grandchildren
            // as zombies. A zombie holds no resources and cannot run or restart.
            const state =
              process.platform === "linux"
                ? readFileSync(`/proc/${skinPid}/stat`, "utf8").split(
                    ") ",
                  )[1][0]
                : "running";
            expect(state).toBe("Z");
          } catch (error) {
            if (
              !["ESRCH", "ENOENT"].includes(
                (error as NodeJS.ErrnoException).code ?? "",
              )
            ) {
              throw error;
            }
          }
        });
        const portProbe = createServer();
        await new Promise<void>((resolve, reject) => {
          portProbe.once("error", reject);
          portProbe.listen(Number(skinPort), "127.0.0.1", () => resolve());
        });
        await new Promise<void>((resolve) => portProbe.close(() => resolve()));
      },
    );
  });

  it("keeps paths confined to the static directory", async () => {
    const parentDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-parent-"));
    tempDirs.push(parentDir);
    const buildDir = path.join(parentDir, "build");
    mkdirSync(buildDir);
    writeFileSync(path.join(buildDir, "index.html"), "<main>app</main>");
    writeFileSync(path.join(parentDir, "secret.txt"), "secret\n");

    const origin = await startServer(buildDir);
    const response = await fetch(`${origin}/../secret.txt`);

    expect(response.status).not.toBe(200);
    await expect(response.text()).resolves.not.toContain("secret");
  });

  it("returns 502 when backend target URL is invalid", async () => {
    const buildDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-build-"));
    tempDirs.push(buildDir);
    writeFileSync(path.join(buildDir, "index.html"), "<main>app</main>");

    const server = await startStaticServer({
      port: 0,
      host: "127.0.0.1",
      dir: buildDir,
      routes: { "/api/invalid": "not-a-url" },
    });
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No port");
    const origin = `http://127.0.0.1:${address.port}`;

    const response = await getText(`${origin}/api/invalid/test`);

    expect(response.status).toBe(502);
    expect(response.body).toContain("Bad Gateway");
    expect(response.body).toContain("Invalid URL");
    expect(server.listening).toBe(true);
  });
});

describe("static-server.mjs MARS web bridge (Docker arguments)", () => {
  const servers: Server[] = [];
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      servers.splice(0).map(
        (server) =>
          new Promise<void>((resolve) => {
            server.close(() => resolve());
          }),
      ),
    );
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  function makeBuildDir() {
    const buildDir = mkdtempSync(path.join(tmpdir(), "agent-canvas-build-"));
    tempDirs.push(buildDir);
    writeFileSync(
      path.join(buildDir, "index.html"),
      "<html><head></head><body>app</body></html>",
    );
    return buildDir;
  }

  async function start(
    overrides: Partial<Parameters<typeof startStaticServer>[0]>,
  ) {
    const server = await startStaticServer({
      port: 0,
      dir: makeBuildDir(),
      routes: {},
      ...overrides,
    });
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Static server did not bind to a TCP port");
    }
    return `http://127.0.0.1:${address.port}`;
  }

  // docker/entrypoint.sh runs `--host :: --session-api-key <key>` with no
  // `--allow-lan-session-key`: the key is stripped from the HTML, but the
  // bridge must still mount behind it.
  it("mounts with the entrypoint's `--host :: --session-api-key` arguments", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const origin = await start({ host: "::", sessionApiKey: "docker-key" });
    expect(await (await fetch(`${origin}/mars/health`)).json()).toEqual({
      ok: true,
      authRequired: true,
    });
    const page = await (await fetch(`${origin}/`)).text();
    expect(page).not.toContain("docker-key");
    expect(
      warn.mock.calls.some((c) => String(c[0]).includes("[mars-web]")),
    ).toBe(false);
  });

  it("does not mount on a LAN bind with no key (public mode)", async () => {
    vi.spyOn(console, "debug").mockImplementation(() => {});
    const origin = await start({ host: "::", authRequired: true });
    const response = await fetch(`${origin}/mars/health`);
    expect(response.headers.get("content-type")).toMatch(/text\/html/);
  });

  it("honours MARS_WEB=0", async () => {
    vi.stubEnv("MARS_WEB", "0");
    const origin = await start({ host: "127.0.0.1", sessionApiKey: "k" });
    const response = await fetch(`${origin}/mars/health`);
    expect(response.headers.get("content-type")).toMatch(/text\/html/);
  });
});
