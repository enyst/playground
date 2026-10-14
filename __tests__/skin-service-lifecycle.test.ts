// @vitest-environment node
import { spawn } from "node:child_process";
import { once } from "node:events";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const fakeNpm = `
import { spawn } from "node:child_process";
import { appendFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
const fixture = process.env.SKIN_LIFECYCLE_FIXTURE;
if (process.argv[2] === "install") {
  const descendant = spawn(process.execPath, ["--eval", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
  process.on("SIGTERM", () => descendant.once("close", () => process.exit(0)));
  writeFileSync(join(fixture, "install.json"), JSON.stringify([process.pid, descendant.pid]));
  setInterval(() => {}, 1000);
} else {
  process.on("SIGTERM", () => {});
  appendFileSync(join(fixture, "apps.jsonl"), JSON.stringify(process.pid) + "\\n");
  createServer((_request, response) => response.end("ready"))
    .listen(Number(process.env.OPENHANDS_SKIN_PORT), "127.0.0.1");
}
`;

const serviceUrl = pathToFileURL(resolve("scripts/skin-service.mjs")).href;

const lifecycleProbe = `
import { SkinService } from ${JSON.stringify(serviceUrl)};
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
const fixture = process.env.SKIN_LIFECYCLE_FIXTURE;
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const until = async (condition) => {
  const deadline = Date.now() + 2000;
  while (!condition() && Date.now() < deadline) await delay(10);
};
let port = 0;
if (process.env.SKIN_LIFECYCLE_MODE === "restart") {
  const reservation = createServer();
  await new Promise((resolve) => reservation.listen(0, "127.0.0.1", resolve));
  port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
}
const service = new SkinService({ home: join(fixture, "state"), workspaceDir: join(fixture, "repo"), skinPort: port });
// Redirect only the skill destination; subprocess behavior stays real.
Object.defineProperty(service, "skillPath", { get: () => join(fixture, "skin-app.md") });
service.saveSettings({ autoPush: false });
let result;
try {
  if (process.env.SKIN_LIFECYCLE_MODE === "install") {
    let startSettled = false;
    const starting = service.start().finally(() => { startSettled = true; });
    starting.catch(() => {});
    await until(() => existsSync(join(fixture, "install.json")));
    const pids = JSON.parse(readFileSync(join(fixture, "install.json"), "utf8"));
    await service.stop({ timeoutMs: 50 });
    await until(() => startSettled && pids.every((pid) => !alive(pid)));
    result = { installAlive: alive(pids[0]), descendantAlive: alive(pids[1]), startSettled, appStarted: existsSync(join(fixture, "apps.jsonl")) };
  } else {
    await service.start();
    await service.stop({ timeoutMs: 50 });
    let replacementError = null;
    try { await service.start(); } catch (error) { replacementError = error.message; }
    await delay(150);
    const status = await service.status();
    const response = await fetch("http://127.0.0.1:" + port + "/skin-app/");
    result = { replacementError, running: status.running, error: status.error, response: await response.text(), appCount: readFileSync(join(fixture, "apps.jsonl"), "utf8").trim().split("\\n").length };
  }
} finally {
  await service.stop({ timeoutMs: 20 });
  const pids = [];
  if (existsSync(join(fixture, "install.json"))) pids.push(...JSON.parse(readFileSync(join(fixture, "install.json"), "utf8")));
  if (existsSync(join(fixture, "apps.jsonl"))) pids.push(...readFileSync(join(fixture, "apps.jsonl"), "utf8").trim().split("\\n").map(Number));
  for (const pid of pids) {
    try { process.kill(-pid, "SIGKILL"); } catch {}
    try { process.kill(pid, "SIGKILL"); } catch {}
  }
}
console.log("LIFECYCLE_RESULT " + JSON.stringify(result));
`;

function killFixtureProcesses(fixture: string) {
  for (const file of ["install.json", "apps.jsonl"]) {
    try {
      const contents = readFileSync(join(fixture, file), "utf8");
      const pids: number[] =
        file === "install.json"
          ? JSON.parse(contents)
          : contents.trim().split("\n").map(Number);
      for (const pid of pids) {
        try {
          process.kill(-pid, "SIGKILL");
        } catch {
          // The process group may already have exited.
        }
        try {
          process.kill(pid, "SIGKILL");
        } catch {
          // The child may already have exited.
        }
      }
    } catch {
      // No subprocess was started.
    }
  }
}

async function probe(mode: "install" | "restart") {
  const fixture = mkdtempSync(join(tmpdir(), "skin-lifecycle-test-"));
  const bin = join(fixture, "bin");
  mkdirSync(bin);
  mkdirSync(join(fixture, "repo"));
  writeFileSync(join(fixture, "repo", "skin.yaml"), "name: Lifecycle test\n");
  writeFileSync(
    join(fixture, "repo", "package.json"),
    JSON.stringify({
      scripts: { start: "fixture" },
      ...(mode === "install" ? { dependencies: {} } : {}),
    }),
  );
  writeFileSync(join(bin, "npm"), `#!${process.execPath}\n${fakeNpm}`, {
    mode: 0o755,
  });
  const child = spawn(
    process.execPath,
    ["--input-type=module", "--eval", lifecycleProbe],
    {
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        SKIN_LIFECYCLE_FIXTURE: fixture,
        SKIN_LIFECYCLE_MODE: mode,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk) => {
    output += chunk;
  });
  const deadline = setTimeout(() => {
    // Install children inherit probe pipes; stop them before waiting for close.
    killFixtureProcesses(fixture);
    child.kill("SIGKILL");
  }, 5000);
  try {
    const [code] = await once(child, "close");
    expect(code, output).toBe(0);
    const line = output
      .split("\n")
      .find((value) => value.startsWith("LIFECYCLE_RESULT "));
    expect(line, output).toBeDefined();
    return JSON.parse(line!.slice("LIFECYCLE_RESULT ".length));
  } finally {
    clearTimeout(deadline);
    // Cleanup also covers a failed or timed-out probe before its own finally.
    killFixtureProcesses(fixture);
    rmSync(fixture, { recursive: true, force: true });
  }
}

describe.skipIf(process.platform === "win32")(
  "skin subprocess lifecycle",
  () => {
    it("cancels dependency installation and its descendants when stopped", async () => {
      expect(await probe("install")).toEqual({
        installAlive: false,
        descendantAlive: false,
        startSettled: true,
        appStarted: false,
      });
    }, 7000);

    it("keeps a replacement serving after forcibly stopping a stubborn app", async () => {
      expect(await probe("restart")).toEqual({
        replacementError: null,
        running: true,
        error: null,
        response: "ready",
        appCount: 2,
      });
    }, 7000);
  },
);
