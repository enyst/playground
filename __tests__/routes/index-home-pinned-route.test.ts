import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetActiveStoreForTests,
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import type { Backend } from "#/api/backend-registry/types";
import { SkinService } from "#/api/skin-service";
import { getPinnedHomeRouteKey } from "#/hooks/use-pinned-home-route";
import { clientLoader } from "#/routes/index-home";

/**
 * The automation interface manifest is withheld so the "pinned page's
 * feature is no longer available" case is exercisable; /customize has no
 * such gate and stays pinnable.
 */
vi.mock("#/manifests/manifest-sources", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("#/manifests/manifest-sources")>();
  return { ...actual, AUTOMATION_INTERFACE_CANDIDATE: undefined };
});

// Only the loader is under test; keep the home screen's tree out of it.
vi.mock("#/routes/home", () => ({ default: () => null }));

const BACKEND: Backend = {
  id: "backend-a",
  name: "Backend A",
  host: window.location.origin,
  apiKey: "",
  kind: "local",
};

const PIN_KEY = getPinnedHomeRouteKey(BACKEND.id, null);

describe("the index route with a pinned home page", () => {
  beforeEach(() => {
    window.localStorage.clear();
    setRegisteredBackends([BACKEND]);
    setActiveSelection({ backendId: BACKEND.id });
    vi.spyOn(SkinService, "getStatus").mockResolvedValue({
      installed: false,
      running: false,
    });
  });

  afterEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    __resetActiveStoreForTests();
    vi.restoreAllMocks();
  });

  it("redirects / to the pinned page of the active backend even when a skin is installed", async () => {
    // Arrange
    window.localStorage.setItem(PIN_KEY, JSON.stringify("/customize"));
    vi.mocked(SkinService.getStatus).mockResolvedValue({
      installed: true,
      running: true,
    });

    // Act
    const result = await clientLoader();

    // Assert
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).headers.get("Location")).toBe("/customize");
    expect(SkinService.getStatus).not.toHaveBeenCalled();
  });

  it("renders the default home when no pin or skin is set", async () => {
    expect(await clientLoader()).toBeNull();
  });

  it("falls back to the default home when the stored pin does not resolve, leaving the value intact", async () => {
    for (const rawValue of ['"/"', '"/nonexistent"', "not-json"]) {
      // Arrange
      window.localStorage.setItem(PIN_KEY, rawValue);

      // Act & Assert
      expect(await clientLoader()).toBeNull();
      expect(window.localStorage.getItem(PIN_KEY)).toBe(rawValue);
    }
  });

  it("falls back to the default home when the pinned page's interface is absent", async () => {
    // Arrange: /automations was pinnable when set, but this deployment has
    // no admitted automation interface manifest.
    window.localStorage.setItem(PIN_KEY, JSON.stringify("/automations"));

    // Act & Assert
    expect(await clientLoader()).toBeNull();
  });

  it("ignores a pin stored for a different backend", async () => {
    // Arrange
    window.localStorage.setItem(
      getPinnedHomeRouteKey("backend-b", null),
      JSON.stringify("/customize"),
    );

    // Act & Assert
    expect(await clientLoader()).toBeNull();
  });

  it("opens the installed skin when there is no valid home pin", async () => {
    window.localStorage.setItem(PIN_KEY, JSON.stringify("/nonexistent"));
    vi.mocked(SkinService.getStatus).mockResolvedValue({
      installed: true,
      running: true,
    });

    const result = await clientLoader();

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).headers.get("Location")).toBe("/skin");
  });

  it("renders the default home when the launcher has no skin service", async () => {
    vi.mocked(SkinService.getStatus).mockRejectedValue(new Error("Not found"));

    expect(await clientLoader()).toBeNull();
  });

  it("ignores the instance's installed skin when a Cloud backend is selected", async () => {
    const cloudBackend: Backend = {
      ...BACKEND,
      kind: "cloud",
      host: "https://cloud.example.test",
    };
    setRegisteredBackends([cloudBackend]);
    vi.mocked(SkinService.getStatus).mockResolvedValue({
      installed: true,
      running: true,
    });

    expect(await clientLoader()).toBeNull();
    expect(SkinService.getStatus).not.toHaveBeenCalled();
  });

  it("ignores the instance's installed skin when a remote local backend is selected", async () => {
    setRegisteredBackends([
      { ...BACKEND, host: "https://remote.example.test" },
    ]);

    expect(await clientLoader()).toBeNull();
    expect(SkinService.getStatus).not.toHaveBeenCalled();
  });
});
