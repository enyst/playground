import type { CloudRequestOptions } from "@openhands/typescript-client/clients";
import type { Backend } from "../backend-registry/types";
import {
  activeOrgForBackend,
  createCloudClientForRuntime,
  createCloudClient,
} from "./client";
import { recordOrganizationSuspension } from "./organization-suspension-store";

export interface CloudProxyRequest {
  backend: Backend;
  method: CloudRequestOptions["method"];
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
  timeoutSeconds?: number;
  hostOverride?: string;
  authMode?: "bearer" | "session-api-key" | "none";
  sessionApiKey?: string | null;
  responseType?: "blob" | "arrayBuffer";
  /**
   * The organization captured when the operation started. Omit it to
   * use the backend's active organization at call time.
   */
  orgId?: string | null;
}

export async function callCloudProxy<TResponse = unknown>(
  req: CloudProxyRequest,
): Promise<TResponse> {
  // Resolve once for both transport and suspension attribution. An explicit
  // null must not inherit a later selection from the client constructor.
  const orgId =
    req.orgId !== undefined ? req.orgId : activeOrgForBackend(req.backend);
  const client = req.hostOverride
    ? createCloudClientForRuntime(req.backend, orgId)
    : createCloudClient(req.backend, orgId);

  try {
    return await client.request<TResponse>({
      method: req.method,
      path: req.path,
      body: req.body,
      headers: req.headers,
      timeoutSeconds: req.timeoutSeconds,
      hostOverride: req.hostOverride,
      authMode:
        req.authMode === undefined || req.authMode === "bearer"
          ? "bearer"
          : req.authMode,
      sessionApiKey: req.sessionApiKey,
      responseType: req.responseType,
    });
  } catch (error) {
    recordOrganizationSuspension(req.backend.id, orgId, error);
    throw error;
  }
}
