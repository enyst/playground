import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsClient } from "@openhands/typescript-client/clients";

import type { Backend } from "#/api/backend-registry/types";
import {
  __resetActiveStoreForTests,
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import { SecretsService } from "#/api/secrets-service";

const { mockListSecrets, mockGetSecret, mockUpsertSecret, mockDeleteSecret } =
  vi.hoisted(() => ({
    mockListSecrets: vi.fn(),
    mockGetSecret: vi.fn(),
    mockUpsertSecret: vi.fn(),
    mockDeleteSecret: vi.fn(),
  }));

vi.mock("@openhands/typescript-client/clients", () => ({
  SettingsClient: vi.fn(function SettingsClientMock() {
    return {
      listSecrets: mockListSecrets,
      getSecret: mockGetSecret,
      upsertSecret: mockUpsertSecret,
      deleteSecret: mockDeleteSecret,
    };
  }),
}));

const localBackend: Backend = {
  id: "local",
  name: "Local",
  host: "http://127.0.0.1:8000",
  apiKey: "",
  kind: "local",
};

describe("SecretsService", () => {
  beforeEach(() => {
    window.localStorage.clear();
    __resetActiveStoreForTests();
    setRegisteredBackends([localBackend]);
    setActiveSelection({ backendId: localBackend.id });
    mockListSecrets.mockReset();
    mockGetSecret.mockReset();
    mockUpsertSecret.mockReset();
    mockDeleteSecret.mockReset();
  });

  afterEach(() => {
    __resetActiveStoreForTests();
  });

  it("lists local secret metadata through the strict read", async () => {
    mockListSecrets.mockResolvedValue({
      secrets: [{ name: "OPENHANDS_URL", description: "Canvas origin" }],
    });

    await expect(SecretsService.getSecretsOrThrow()).resolves.toEqual([
      { name: "OPENHANDS_URL", description: "Canvas origin" },
    ]);
    expect(mockListSecrets).toHaveBeenCalledTimes(1);
  });

  it("keeps secret retries on the originating backend after the user switches", async () => {
    // Arrange: use the real SDK client, with a transient HTTP failure that
    // arrives just as the user selects another Agent Server.
    const instance = { ...localBackend, apiKey: "instance-session-key" };
    const remote: Backend = {
      ...localBackend,
      id: "remote",
      host: "http://127.0.0.1:9001",
      apiKey: "remote-session-key",
    };
    setRegisteredBackends([instance, remote]);
    setActiveSelection({ backendId: instance.id });
    const actual = await vi.importActual<
      typeof import("@openhands/typescript-client/clients")
    >("@openhands/typescript-client/clients");
    const previousConstructor = vi
      .mocked(SettingsClient)
      .getMockImplementation();
    vi.mocked(SettingsClient).mockImplementation(function (options) {
      return new actual.SettingsClient(options);
    });
    const requests: Array<{
      url: string;
      apiKey: string | null;
      body: unknown;
    }> = [];
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input, init) => {
        const request = new Request(input, init);
        requests.push({
          url: request.url,
          apiKey: request.headers.get("X-Session-API-Key"),
          body: await request.json(),
        });
        if (requests.length === 1) {
          setActiveSelection({ backendId: remote.id });
          return Response.json(
            { detail: "Temporarily unavailable" },
            { status: 503 },
          );
        }
        return Response.json({ name: "SKIN_PROVIDER_KEY" });
      });

    try {
      // Act
      await SecretsService.createSecret("SKIN_PROVIDER_KEY", "fixture-secret");

      // Assert: both HTTP writes, including their credential and secret value,
      // belong to the original instance even after active selection changes.
      const expectedRequest = {
        url: `${instance.host}/api/settings/secrets`,
        apiKey: instance.apiKey,
        body: { name: "SKIN_PROVIDER_KEY", value: "fixture-secret" },
      };
      expect(requests).toEqual([expectedRequest, expectedRequest]);
    } finally {
      fetch.mockRestore();
      if (previousConstructor)
        vi.mocked(SettingsClient).mockImplementation(previousConstructor);
    }
  });

  it("preserves the existing value when updating description", async () => {
    // Arrange
    mockGetSecret.mockResolvedValue("keep-this");
    mockUpsertSecret.mockResolvedValue({
      name: "OpenAI_API_Key",
      description: "Updated description",
    });

    // Act
    await SecretsService.updateSecret(
      "OpenAI_API_Key",
      "OpenAI_API_Key",
      "Updated description",
    );

    // Assert
    expect(mockGetSecret).toHaveBeenCalledWith("OpenAI_API_Key");
    expect(mockUpsertSecret).toHaveBeenCalledWith({
      name: "OpenAI_API_Key",
      value: "keep-this",
      description: "Updated description",
    });
    expect(mockDeleteSecret).not.toHaveBeenCalled();
  });

  it("overwrites the value without reading the existing one", async () => {
    // Arrange
    mockUpsertSecret.mockResolvedValue({
      name: "OpenAI_API_Key",
      description: "Demo secret",
    });

    // Act
    await SecretsService.updateSecret(
      "OpenAI_API_Key",
      "OpenAI_API_Key",
      "Demo secret",
      "new-value",
    );

    // Assert
    expect(mockGetSecret).not.toHaveBeenCalled();
    expect(mockUpsertSecret).toHaveBeenCalledWith({
      name: "OpenAI_API_Key",
      value: "new-value",
      description: "Demo secret",
    });
  });

  it("renames secrets by re-upserting and removing the old entry", async () => {
    // Arrange
    mockGetSecret.mockResolvedValue("original-value");
    mockUpsertSecret.mockResolvedValue({
      name: "New_Key",
      description: "Renamed",
    });
    mockDeleteSecret.mockResolvedValue({ deleted: true });

    // Act
    await SecretsService.updateSecret("Old_Key", "New_Key", "Renamed");

    // Assert
    expect(mockGetSecret).toHaveBeenCalledWith("Old_Key");
    expect(mockUpsertSecret).toHaveBeenCalledWith({
      name: "New_Key",
      value: "original-value",
      description: "Renamed",
    });
    expect(mockDeleteSecret).toHaveBeenCalledWith("Old_Key");
  });
});
