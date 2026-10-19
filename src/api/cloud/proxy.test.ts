import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Backend } from "#/api/backend-registry/types";

const { CloudClientMock, requestMock, getActiveBackendMock } = vi.hoisted(
  () => ({
    requestMock: vi.fn(),
    CloudClientMock: vi.fn(function CloudClient(this: { request: unknown }) {
      this.request = requestMock;
    }),
    getActiveBackendMock: vi.fn(),
  }),
);

vi.mock("@openhands/typescript-client/clients", () => ({
  CloudClient: CloudClientMock,
}));

vi.mock("../agent-server-config", () => ({
  getAgentServerBaseUrl: () => null,
  getAgentServerHeaders: () => ({}),
}));

vi.mock("../backend-registry/active-store", () => ({
  getActiveBackend: getActiveBackendMock,
}));

import { callCloudProxy } from "./proxy";

const cloudBackend: Backend = {
  id: "locked-cloud",
  name: "OpenHands Cloud",
  host: "https://cloud.example.test",
  apiKey: "",
  kind: "cloud",
  authMode: "cookie",
};

describe("callCloudProxy", () => {
  beforeEach(() => {
    CloudClientMock.mockClear();
    requestMock.mockReset();
    requestMock.mockResolvedValue({ ok: true });
    getActiveBackendMock.mockReset();
    getActiveBackendMock.mockReturnValue({
      backend: cloudBackend,
      orgId: "org-1",
    });
  });

  it("binds the active Cloud organization to the request client", async () => {
    await callCloudProxy({
      backend: cloudBackend,
      method: "GET",
      path: "/api/v1/app-conversations?ids=conv-1",
      headers: { "X-Agent-Canvas-Client": "test" },
    });

    expect(CloudClientMock).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: "org-1" }),
    );
    expect(getActiveBackendMock).toHaveBeenCalledTimes(1);
    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-Agent-Canvas-Client": "test",
        }),
      }),
    );
  });

  it("does not send an org header for inactive cloud backends", async () => {
    const inactiveBackend = { ...cloudBackend, id: "other-cloud" };

    await callCloudProxy({
      backend: inactiveBackend,
      method: "GET",
      path: "/api/v1/app-conversations?ids=conv-1",
    });

    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({ headers: undefined }),
    );
  });
});
