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
import {
  SkinService,
  SkinRequestError,
  SkinUnsupportedError,
} from "#/api/skin-service";
import { ActiveBackendProvider } from "#/contexts/active-backend-context";
import { I18nKey } from "#/i18n/declaration";
import { SKIN_QUERY_KEYS } from "#/hooks/query/query-keys";
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
  const view = render(
    <QueryClientProvider client={queryClient}>
      <ActiveBackendProvider>
        <SkinSettingsScreen />
      </ActiveBackendProvider>
    </QueryClientProvider>,
  );
  return { ...view, queryClient };
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
    expect(screen.getByText(I18nKey.SKIN$LOCAL_ONLY)).toBeInTheDocument();
  });

  it.each([REMOTE_BACKEND, CLOUD_BACKEND])(
    "offers no skin install or management controls for $id",
    (backend) => {
      setActiveSelection({ backendId: backend.id });

      renderSettings();

      expect(screen.queryByTestId("skin-settings")).not.toBeInTheDocument();
      expect(screen.queryByTestId("skin-install-form")).not.toBeInTheDocument();
      expect(screen.getByText(I18nKey.SKIN$LOCAL_ONLY)).toBeInTheDocument();
      expect(SkinService.getStatus).not.toHaveBeenCalled();
    },
  );

  it("keeps installation unavailable when the launcher has no skin service", async () => {
    vi.mocked(SkinService.getStatus).mockRejectedValue(
      new SkinUnsupportedError(),
    );
    renderSettings();

    expect(await screen.findByTestId("skin-unavailable")).toBeInTheDocument();
    expect(screen.queryByTestId("skin-install-form")).not.toBeInTheDocument();
  });

  it("shows a failed status read with a retry instead of an install form", async () => {
    vi.mocked(SkinService.getStatus).mockRejectedValue(
      new SkinRequestError("Invalid session key", 401),
    );
    renderSettings();

    expect(await screen.findByText("Invalid session key")).toBeInTheDocument();
    expect(screen.getByTestId("skin-status-retry")).toBeInTheDocument();
    expect(screen.queryByTestId("skin-install-form")).not.toBeInTheDocument();
  });

  it("shows incomplete export results and never hides the failed sections", async () => {
    const exportReport = {
      complete: false,
      exported: ["skills"],
      errors: ["Could not export provider connections"],
    };
    vi.spyOn(SkinService, "exportConfiguration").mockImplementation(
      async () => {
        vi.mocked(SkinService.getStatus).mockResolvedValue({
          installed: true,
          running: true,
          exportReport,
        });
        return exportReport;
      },
    );
    renderSettings();

    fireEvent.click(await screen.findByTestId("skin-export-button"));

    expect(
      await screen.findByText("Could not export provider connections"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("skin-export-report")).toBeInTheDocument();
  });

  it("requires review acknowledgment before publishing changed source", async () => {
    vi.spyOn(SkinService, "push")
      .mockResolvedValueOnce({
        pushed: false,
        reviewRequired: true,
        reviewPaths: ["src/app.js"],
      })
      .mockResolvedValueOnce({ pushed: true });
    renderSettings();

    fireEvent.click(await screen.findByTestId("skin-push-button"));
    const confirm = await screen.findByTestId("confirm-button");
    expect(SkinService.push).toHaveBeenCalledTimes(1);
    fireEvent.click(confirm);

    await waitFor(() =>
      expect(vi.mocked(SkinService.push).mock.calls.at(-1)?.[0]).toEqual({
        reviewedSource: true,
      }),
    );
  });

  it("retries configuration restore after the missing credentials are saved", async () => {
    vi.mocked(SkinService.getStatus).mockResolvedValue({
      installed: true,
      running: true,
      applyReport: { complete: false, missingSecrets: ["PROVIDER_KEY"] },
    });
    vi.spyOn(SkinService, "applyConfiguration").mockResolvedValue({
      complete: true,
      applied: ["LLM profile"],
    });
    const { queryClient } = renderSettings();
    queryClient.setQueryData(["skills", null], []);
    queryClient.setQueryData(["secrets", INSTANCE_BACKEND.id, null], []);
    fireEvent.click(await screen.findByTestId("skin-setup-secrets-button"));
    fireEvent.change(screen.getByLabelText("PROVIDER_KEY"), {
      target: { value: "fixture-key" },
    });
    fireEvent.click(screen.getByTestId("skin-secrets-save"));

    await waitFor(() =>
      expect(SkinService.applyConfiguration).toHaveBeenCalledOnce(),
    );
    expect(SecretsService.createSecret).toHaveBeenCalledWith(
      "PROVIDER_KEY",
      "fixture-key",
      undefined,
    );
    expect(queryClient.getQueryState(["skills", null])?.isInvalidated).toBe(
      true,
    );
    expect(
      queryClient.getQueryState(["secrets", INSTANCE_BACKEND.id, null])
        ?.isInvalidated,
    ).toBe(true);
  });

  it("updates an action report when a later status read contains a completed restore", async () => {
    const incomplete = { complete: false, missingSecrets: ["PROVIDER_KEY"] };
    vi.mocked(SkinService.getStatus).mockResolvedValue({
      installed: true,
      running: true,
      applyReport: incomplete,
    });
    vi.spyOn(SkinService, "applyConfiguration").mockResolvedValue(incomplete);
    const { queryClient } = renderSettings();
    fireEvent.click(await screen.findByTestId("skin-apply-button"));
    await waitFor(() =>
      expect(screen.getByTestId("skin-apply-button")).toBeEnabled(),
    );
    expect(screen.getByText("PROVIDER_KEY")).toBeInTheDocument();

    vi.mocked(SkinService.getStatus).mockResolvedValue({
      installed: true,
      running: true,
      applyReport: {
        complete: true,
        applied: ["Restored provider connection"],
      },
    });
    await act(() =>
      queryClient.invalidateQueries({ queryKey: SKIN_QUERY_KEYS.status }),
    );

    expect(
      await screen.findByText("Restored provider connection"),
    ).toBeInTheDocument();
    expect(screen.queryByText("PROVIDER_KEY")).not.toBeInTheDocument();
  });

  it("leaves automatic publishing off on a fresh install", async () => {
    vi.mocked(SkinService.getStatus).mockResolvedValue({
      installed: false,
      running: false,
    });
    renderSettings();

    expect(
      await screen.findByTestId("skin-install-auto-push-switch"),
    ).not.toBeChecked();
  });
});
