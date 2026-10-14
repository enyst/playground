import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetActiveStoreForTests,
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import type { Backend } from "#/api/backend-registry/types";
import { SecretsService } from "#/api/secrets-service";
import { SkinService } from "#/api/skin-service";
import { ActiveBackendProvider } from "#/contexts/active-backend-context";
import { I18nKey } from "#/i18n/declaration";
import { SkinSettingsScreen } from "#/routes/skin-settings";

const INSTANCE_BACKEND: Backend = {
  id: "instance",
  name: "This instance",
  host: window.location.origin,
  apiKey: "instance-key",
  kind: "local",
};

const REMOTE_BACKEND: Backend = {
  ...INSTANCE_BACKEND,
  id: "remote",
  host: "https://remote.example.test",
};

const CLOUD_BACKEND: Backend = {
  ...REMOTE_BACKEND,
  id: "cloud",
  kind: "cloud",
};

function renderSettings() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ActiveBackendProvider>
        <SkinSettingsScreen />
      </ActiveBackendProvider>
    </QueryClientProvider>,
  );
}

describe("skin settings backend ownership", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    setRegisteredBackends([INSTANCE_BACKEND, REMOTE_BACKEND, CLOUD_BACKEND]);
    setActiveSelection({ backendId: INSTANCE_BACKEND.id });
    vi.spyOn(SkinService, "getStatus").mockResolvedValue({
      installed: true,
      running: true,
      name: "Research Workspace",
      secrets: [{ name: "RESEARCH_API_KEY" }],
    });
    vi.spyOn(SecretsService, "createSecret").mockResolvedValue();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
    __resetActiveStoreForTests();
  });

  it("saves skin secrets to its instance and hides secret setup when switching away", async () => {
    renderSettings();
    fireEvent.click(await screen.findByTestId("skin-setup-secrets-button"));
    fireEvent.change(screen.getByLabelText("RESEARCH_API_KEY"), {
      target: { value: "research-secret" },
    });
    fireEvent.click(screen.getByTestId("skin-secrets-save"));

    await waitFor(() => {
      expect(SecretsService.createSecret).toHaveBeenCalledWith(
        "RESEARCH_API_KEY",
        "research-secret",
        undefined,
      );
      expect(screen.queryByTestId("skin-secret-setup")).not.toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("skin-setup-secrets-button"));

    act(() => setActiveSelection({ backendId: REMOTE_BACKEND.id }));

    expect(screen.queryByTestId("skin-secret-setup")).not.toBeInTheDocument();
    expect(screen.queryByTestId("skin-install-form")).not.toBeInTheDocument();
    expect(screen.getByText(I18nKey.SKIN$NOT_INSTALLED)).toBeInTheDocument();
  });

  it.each([REMOTE_BACKEND, CLOUD_BACKEND])(
    "offers no skin install or management controls for $id",
    (backend) => {
      setActiveSelection({ backendId: backend.id });

      renderSettings();

      expect(screen.queryByTestId("skin-settings")).not.toBeInTheDocument();
      expect(screen.queryByTestId("skin-install-form")).not.toBeInTheDocument();
      expect(screen.getByText(I18nKey.SKIN$NOT_INSTALLED)).toBeInTheDocument();
      expect(SkinService.getStatus).not.toHaveBeenCalled();
    },
  );
});
