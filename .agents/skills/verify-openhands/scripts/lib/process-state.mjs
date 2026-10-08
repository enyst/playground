import fs from "node:fs";

function signalState(pid) {
  try {
    process.kill(pid, 0);
    return "present";
  } catch (error) {
    return error.code === "ESRCH" ? "gone" : "unknown";
  }
}

function procState(pid) {
  try {
    // comm may itself contain spaces, parentheses or newlines. The fields
    // after its final ')' are state, ppid, and pgrp.
    const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
    const fields = stat
      .slice(stat.lastIndexOf(")") + 2)
      .trim()
      .split(/\s+/);
    const pgid = Number(fields[2]);
    if (!/^[RSDZTtXxKWPI]$/.test(fields[0]) || !Number.isInteger(pgid))
      return null;
    return { state: fields[0], pgid };
  } catch (error) {
    return error.code === "ENOENT" ? undefined : null;
  }
}

const exited = (state) => /^(Z|X|x)$/.test(state);

export function processAlive(pid) {
  if (!pid) return false;
  const signal = signalState(pid);
  if (signal !== "present") return signal !== "gone";
  if (process.platform !== "linux") return true;
  const info = procState(pid);
  // A vanished process is gone; unreadable or unrecognized state stays alive.
  return info === null || (info !== undefined && !exited(info.state));
}

export function groupAlive(pgid) {
  if (!pgid) return false;
  const signal = signalState(-pgid);
  if (signal !== "present") return signal !== "gone";
  if (process.platform !== "linux") return true;
  // Container PID 1 may leave exited processes unreaped. kill(-pgid, 0)
  // still succeeds for those zombies, but they need no further shutdown.
  // Inspect every member: a zombie group leader can have live children.
  let members = 0;
  try {
    for (const pid of fs
      .readdirSync("/proc")
      .filter((name) => /^\d+$/.test(name))) {
      const info = procState(pid);
      if (info === null) return true;
      if (!info || info.pgid !== pgid) continue;
      members += 1;
      if (!exited(info.state)) return true;
    }
  } catch {
    return true;
  }
  // Only a completely inspected, zombie-only group is considered stopped.
  // Missing visibility into a group is not proof that it has exited.
  return members === 0 && signalState(-pgid) !== "gone";
}
