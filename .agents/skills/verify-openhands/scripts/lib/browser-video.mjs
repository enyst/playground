// Opt-in video evidence through Playwright's public Screencast API (>=1.59).
// The current page/profile stays alive; pixels are staged privately until
// native encoding finishes. No traces, storage snapshots or frame logs.
import { randomUUID } from "node:crypto";
import {
  chmodSync,
  closeSync,
  constants,
  copyFileSync,
  mkdirSync,
  openSync,
  readSync,
  rmSync,
  statSync,
} from "node:fs";
import { join } from "node:path";

function videoError(message, hint, code = 1) {
  return Object.assign(new Error(message), { hint, code });
}

export function videoCaptureArguments(action, flags = {}) {
  const hint =
    "control-openhands browser video start --feature ID --name N | stop | status";
  if (!["start", "stop", "status"].includes(action)) {
    throw videoError("browser video requires start, stop or status.", hint, 2);
  }
  if (
    action === "start" &&
    (typeof flags.feature !== "string" ||
      !/^(?:F\d{2}\.[\w-]+|BUG-[A-Za-z0-9][\w.-]*)$/.test(flags.feature) ||
      typeof flags.name !== "string" ||
      !flags.name.trim())
  ) {
    throw videoError(
      "browser video start needs a stable --feature ID and --name N.",
      hint,
      2,
    );
  }
  return { action, feature: flags.feature, name: flags.name };
}

function failureFor(error) {
  if (/ffmpeg|executable.*doesn.t exist/i.test(String(error))) {
    return videoError(
      "Video capture needs Playwright's FFmpeg runtime.",
      "Run npx playwright install ffmpeg in this checkout, then restart this run's browser and retry. Unfinished output stays private.",
      3,
    );
  }
  return videoError(
    String(error?.message ?? error),
    error?.hint ??
      "Restart this run's browser before retrying. Unfinished output remains in private/video and was not published.",
    Number.isInteger(error?.code) ? error.code : 1,
  );
}

async function bounded(promise, milliseconds, message) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              videoError(
                message,
                "Stop and restart this run's browser before retrying video capture. Unfinished output remains private.",
              ),
            ),
          milliseconds,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function isWebm(path) {
  const fd = openSync(path, "r");
  try {
    const magic = Buffer.alloc(4);
    return (
      readSync(fd, magic, 0, 4, 0) === 4 &&
      magic.equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
    );
  } finally {
    closeSync(fd);
  }
}

export class BrowserVideoCapture {
  #capture;
  #finished;
  #stopping;

  constructor({
    privateDir,
    evidencePath,
    firstFrameTimeoutMs = 5000,
    finalizeTimeoutMs = 10000,
  }) {
    this.privateDir = privateDir;
    this.evidencePath = evidencePath;
    this.firstFrameTimeoutMs = firstFrameTimeoutMs;
    this.finalizeTimeoutMs = finalizeTimeoutMs;
  }

  status() {
    const capture = this.#capture;
    if (!capture) return this.#finished ?? { recording: false, state: "idle" };
    return {
      recording: capture.state === "failed" ? null : true,
      state: capture.state,
      feature: capture.feature,
      name: capture.name,
      url: capture.page.url(),
      viewport: capture.viewport,
      startedAt: capture.startedAt,
      frames: capture.frames,
      error: capture.error?.message,
      hint: capture.error?.hint,
    };
  }

  isRecordingPage(page) {
    return this.#capture?.page === page;
  }

  async start(page, { feature, name }) {
    videoCaptureArguments("start", { feature, name });
    if (this.#capture) {
      throw videoError(
        this.#capture.state === "failed"
          ? "Restart this run's browser before starting another video."
          : "A video is already recording for this run; stop it first.",
      );
    }
    if (!page.screencast?.start || !page.screencast?.stop) {
      throw videoError(
        "Video capture requires Playwright's Screencast API (>=1.59).",
        "Run npm ci from this checkout's committed lockfile, then restart this run's browser.",
        3,
      );
    }
    const dir = join(this.privateDir, "video");
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const viewport = page.viewportSize();
    const capture = {
      page,
      feature,
      name,
      viewport,
      temporary: join(dir, `${randomUUID()}.webm`),
      startedAt: new Date().toISOString(),
      state: "starting",
      frames: 0,
    };
    this.#capture = capture;
    this.#finished = undefined;
    let firstFrame;
    const ready = new Promise((resolve) => {
      firstFrame = resolve;
    });
    try {
      await bounded(
        (async () => {
          await page.screencast.start({
            path: capture.temporary,
            size: viewport ?? undefined,
            onFrame: ({ data }) => {
              if (!data?.length) return;
              capture.frames += 1;
              firstFrame();
            },
          });
          // Native stop can synthesize a white fallback when it saw no frames.
          // Starting successfully is therefore insufficient evidence readiness.
          await ready;
        })(),
        this.firstFrameTimeoutMs,
        "Video capture timed out before its first real frame.",
      );
      capture.state = "recording";
      return this.status();
    } catch (error) {
      // A failed native start can leave its client marked started. Clear that
      // state once, boundedly, so a missing FFmpeg install remains recoverable.
      try {
        await bounded(
          page.screencast.stop(),
          this.finalizeTimeoutMs,
          "Video start cleanup timed out.",
        );
        rmSync(capture.temporary, { force: true });
        this.#capture = undefined;
      } catch {
        capture.state = "failed";
      }
      const failure = failureFor(error);
      capture.error = failure;
      throw failure;
    }
  }

  async stop() {
    if (this.#stopping) return this.#stopping;
    const capture = this.#capture;
    if (!capture) return this.status();
    if (capture.state === "failed") throw capture.error;
    capture.state = "stopping";
    this.#stopping = (async () => {
      try {
        await bounded(
          capture.page.screencast.stop(),
          this.finalizeTimeoutMs,
          "Video finalization timed out.",
        );
        const bytes = statSync(capture.temporary).size;
        if (!capture.frames || bytes <= 4 || !isWebm(capture.temporary)) {
          throw videoError(
            "Video encoding produced no valid WebM with real frames.",
            "Check Playwright's FFmpeg runtime, restart this run's browser, and re-record; unfinished output remains private.",
          );
        }
        const path = this.evidencePath(capture.feature, capture.name, ".webm");
        chmodSync(capture.temporary, 0o600);
        // Even if another writer creates the chosen name, preserve its evidence.
        copyFileSync(capture.temporary, path, constants.COPYFILE_EXCL);
        rmSync(capture.temporary);
        this.#finished = {
          recording: false,
          state: "finished",
          feature: capture.feature,
          name: capture.name,
          path,
          bytes,
          url: capture.page.url(),
          viewport: capture.viewport,
          startedAt: capture.startedAt,
          finishedAt: new Date().toISOString(),
          frames: capture.frames,
        };
        this.#capture = undefined;
        return this.#finished;
      } catch (error) {
        capture.state = "failed";
        capture.error = failureFor(error);
        throw capture.error;
      } finally {
        this.#stopping = undefined;
      }
    })();
    return this.#stopping;
  }
}
