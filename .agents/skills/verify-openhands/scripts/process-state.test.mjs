import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { test, vi } from "vitest";
import { groupAlive, processAlive } from "./lib/process-state.mjs";

const linux = process.platform === "linux";

test.skipIf(!linux)(
  "an unreaped child and its zombie-only group are stopped",
  async () => {
    // Block the owning parent before its event loop can reap the detached child.
    // Releasing stdin afterward lets it reap that child; no orphan is left behind.
    const parent = spawn(
      process.execPath,
      [
        "-e",
        `
    const { spawn } = require("node:child_process");
    const fs = require("node:fs");
    const child = spawn(process.execPath, ["-e", "process.exit(0)"], {
      detached: true, stdio: "ignore"
    });
    child.once("exit", () => process.exit(0));
    fs.writeSync(1, String(child.pid) + "\\n");
    fs.readSync(0, Buffer.alloc(1), 0, 1, null);
  `,
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    const exited = once(parent, "exit");
    try {
      const [line] = await once(parent.stdout, "data");
      const pid = Number(line.toString().trim());
      assert.ok(pid > 0);
      let zombie = false;
      for (let attempt = 0; attempt < 100; attempt += 1) {
        zombie = /\) Z /.test(fs.readFileSync(`/proc/${pid}/stat`, "utf8"));
        if (zombie) break;
        await delay(20);
      }
      assert.ok(zombie, "child must be a genuine unreaped zombie");
      assert.doesNotThrow(() => process.kill(-pid, 0));
      assert.deepEqual(
        { process: processAlive(pid), group: groupAlive(pid) },
        { process: false, group: false },
      );
    } finally {
      parent.stdin.end("x");
      await exited;
    }
  },
);

test.skipIf(process.platform === "win32")(
  "a live detached child and its group stay alive until exit",
  async () => {
    const child = spawn(
      process.execPath,
      ["-e", "setInterval(() => {}, 1000)"],
      {
        detached: true,
        stdio: "ignore",
      },
    );
    const exited = once(child, "exit");
    try {
      assert.equal(processAlive(child.pid), true);
      assert.equal(groupAlive(child.pid), true);
    } finally {
      child.kill("SIGTERM");
      await exited;
    }
    assert.equal(processAlive(child.pid), false);
    assert.equal(groupAlive(child.pid), false);
  },
);

test.skipIf(!linux)(
  "unknown inspection and signal permission errors stay alive",
  () => {
    const pid = process.pid;
    const pgid = Number(
      fs
        .readFileSync(`/proc/${pid}/stat`, "utf8")
        .split(/\) /)[1]
        .split(" ")[2],
    );
    const inaccessible = Object.assign(new Error("unreadable"), {
      code: "EACCES",
    });
    const read = vi.spyOn(fs, "readFileSync").mockImplementation(() => {
      throw inaccessible;
    });
    try {
      assert.equal(processAlive(pid), true);
      assert.equal(groupAlive(pgid), true);
    } finally {
      read.mockRestore();
    }
    const kill = vi.spyOn(process, "kill").mockImplementation(() => {
      throw Object.assign(new Error("denied"), { code: "EPERM" });
    });
    try {
      assert.equal(processAlive(pid), true);
      assert.equal(groupAlive(pgid), true);
    } finally {
      kill.mockRestore();
    }
  },
);

test.skipIf(!linux)("a live member keeps a zombie-led group alive", () => {
  const pgid = Number(
    fs
      .readFileSync(`/proc/${process.pid}/stat`, "utf8")
      .split(/\) /)[1]
      .split(" ")[2],
  );
  const listing = vi.spyOn(fs, "readdirSync").mockReturnValue(["111", "222"]);
  const read = vi
    .spyOn(fs, "readFileSync")
    .mockImplementation((path) =>
      path === "/proc/111/stat"
        ? `111 (exited (leader)) Z 1 ${pgid} 0`
        : `222 (live member) S 1 ${pgid} 0`,
    );
  try {
    assert.equal(groupAlive(pgid), true);
  } finally {
    listing.mockRestore();
    read.mockRestore();
  }
});

test.skipIf(process.platform === "win32")(
  "stop still refuses a live process group reused by an unrelated command",
  async () => {
    const child = spawn(
      process.execPath,
      ["-e", "setInterval(() => {}, 1000)"],
      {
        detached: true,
        stdio: "ignore",
      },
    );
    const exited = once(child, "exit");
    const dir = fs.mkdtempSync(join(tmpdir(), "verify-pgid-"));
    try {
      fs.writeFileSync(
        join(dir, "run.json"),
        JSON.stringify({
          launcherPid: child.pid,
          launcherPgid: child.pid,
          ports: {},
        }),
      );
      const cli = join(
        dirname(fileURLToPath(import.meta.url)),
        "control-openhands.mjs",
      );
      const result = spawnSync(process.execPath, [cli, "stop", "--run", dir], {
        encoding: "utf8",
        timeout: 5000,
      });
      assert.equal(result.error, undefined);
      assert.equal(result.status, 3);
      assert.match(
        JSON.parse(result.stdout).error,
        /no longer this run's launcher.*refusing to signal it/,
      );
      assert.equal(processAlive(child.pid), true);
    } finally {
      child.kill("SIGTERM");
      await exited;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
);
