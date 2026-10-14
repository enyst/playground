import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetActiveStoreForTests,
  setActiveSelection,
  setRegisteredBackends,
} from "./backend-registry/active-store";
import type { Backend } from "./backend-registry/types";
import {
  isSkinBackend,
  SkinService,
  SkinUnsupportedError,
} from "./skin-service";

const instance: Backend = {
  id: "instance",
  name: "Canvas instance",
  kind: "local",
  host: window.location.origin,
  apiKey: "entered-session-key",
};

describe("skin instance authentication", () => {
  beforeEach(() => {
    setRegisteredBackends([instance]);
    setActiveSelection({ backendId: instance.id });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ installed: false, running: false })),
        ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    __resetActiveStoreForTests();
  });

  it("uses the hosting instance's entered API key when no key is injected", async () => {
    await SkinService.install({ repoUrl: "https://github.com/example/skin" });

    expect(fetch).toHaveBeenCalledWith(
      "/skin-api/install",
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-Session-API-Key": instance.apiKey,
        }),
      }),
    );
  });

  it.each(["local", "cloud"] as const)(
    "rejects mutations while a remote %s backend is active",
    async (kind) => {
      const remote = {
        ...instance,
        id: "remote",
        kind,
        host: "https://remote.example",
        apiKey: "remote-key",
      };
      setRegisteredBackends([instance, remote]);
      setActiveSelection({ backendId: remote.id });

      await expect(SkinService.uninstall()).rejects.toThrow();
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it("does not confuse a different loopback port with the hosting instance", () => {
    expect(isSkinBackend({ ...instance, host: "http://localhost:49152" })).toBe(
      false,
    );
    expect(isSkinBackend(instance)).toBe(true);
  });

  it.each([
    {
      host: `${window.location.origin}/mars/sessions/qa-session`,
      marsSessionId: "qa-session",
    },
    { host: `${window.location.origin}/mars/sessions/qa-session` },
    { host: window.location.origin, marsSessionId: "qa-session" },
  ])("rejects same-origin proxies to another Agent Server", async (target) => {
    const remote = { ...instance, ...target, id: "remote-session" };
    setRegisteredBackends([instance, remote]);
    setActiveSelection({ backendId: remote.id });

    expect(isSkinBackend(remote)).toBe(false);
    await expect(SkinService.uninstall()).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    new Response("Not found", { status: 404 }),
    new Response("<!doctype html><title>Canvas</title>"),
  ])("recognizes a launcher without the skin API", async (response) => {
    vi.mocked(fetch).mockResolvedValue(response);

    await expect(SkinService.getStatus()).rejects.toBeInstanceOf(
      SkinUnsupportedError,
    );
  });

  it("retains authentication failures as errors rather than showing an install form", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: "Invalid session key" }), {
        status: 401,
      }),
    );

    await expect(SkinService.getStatus()).rejects.toMatchObject({
      message: "Invalid session key",
      status: 401,
    });
  });

  it("returns the export report from the management API response", async () => {
    const report = { complete: false, errors: ["Could not export skills"] };
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ report, pushResult: { pushed: false } })),
    );

    await expect(SkinService.exportConfiguration()).resolves.toEqual(report);
  });
});
