// @vitest-environment node
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  fileURLToPath(new URL("../../docker/entrypoint.sh", import.meta.url)),
  "utf8",
);
const block = source.slice(
  source.indexOf("# >>> docker-skin-runtime"),
  source.indexOf("# <<< docker-skin-runtime"),
);

function runtimeArgs(env: Record<string, string> = {}) {
  const result = spawnSync(
    "bash",
    [
      "-c",
      `${block}\nif [ "\${#STATIC_SERVER_SKIN_ARGS[@]}" -gt 0 ]; then printf '%s\\n' "\${STATIC_SERVER_SKIN_ARGS[@]}"; fi`,
    ],
    {
      env: {
        PATH: process.env.PATH,
        OPENHANDS_SKIN_PORT: "18500",
        EFFECTIVE_SESSION_KEY: "management-key",
        AGENT_SERVER_PORT: "18501",
        AUTOMATION_PORT: "18502",
        AGENT_CANVAS_VERSION: "1.27.1",
        ...env,
      },
      encoding: "utf8",
    },
  );
  expect(result.status).toBe(0);
  return result.stdout.trim().split("\n").filter(Boolean);
}

const explicitConfigurations: Record<string, string>[] = [
  { OPENHANDS_ENABLE_SKIN: "true" },
  { OPENHANDS_SKIN_REPO: "/local/skin" },
];

describe.skipIf(process.platform === "win32")(
  "Docker skin runtime opt-in",
  () => {
    it("does not enable skins or install external code by default", () => {
      expect(runtimeArgs()).toEqual([]);
    });
    it.each(explicitConfigurations)(
      "enables only after explicit configuration: %o",
      (env) => {
        expect(runtimeArgs(env)).toEqual([
          "--skin-port",
          "18500",
          "--skin-api-key",
          "management-key",
          "--skin-agent-server-url",
          "http://127.0.0.1:18501",
          "--skin-automation-url",
          "http://127.0.0.1:18502",
          "--skin-canvas-version",
          "1.27.1",
        ]);
      },
    );
  },
);
