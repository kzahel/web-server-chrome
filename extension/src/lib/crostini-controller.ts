import { controllerOrigin } from "./crostini-launch";

export const CONTROLLER_PRODUCT = "ok200-crostini-controller";
export const CONTROLLER_PROTOCOL_VERSION = 1;

export type ControllerHealth = {
  claimed: boolean;
  instanceId: string;
  product: string;
  protocolVersion: number;
  version: string;
};

export type ControllerSettings = {
  cors: boolean;
  directoryListing: boolean;
  lan: boolean;
  port: number;
  root: string;
  spa: boolean;
};

export type ContentServerStatus = {
  error?: string | null;
  state: "stopped" | "running" | "stopping" | "error";
  url?: string | null;
};

export type ControllerStatus = {
  instanceId: string;
  product: string;
  protocolVersion: number;
  server: ContentServerStatus;
  settings: ControllerSettings;
  version: string;
};

type ClaimResponse = {
  controllerToken: string;
};

type ErrorResponse = {
  error?: string;
};

type Fetch = typeof fetch;

export class CrostiniControllerClient {
  readonly origin: string;

  constructor(
    port: number,
    private readonly fetchImplementation: Fetch = globalThis.fetch.bind(
      globalThis,
    ),
  ) {
    this.origin = controllerOrigin(port);
  }

  health(): Promise<ControllerHealth> {
    return this.request<ControllerHealth>("/health");
  }

  claim(instanceId: string, claimCode: string): Promise<ClaimResponse> {
    return this.request<ClaimResponse>("/api/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instanceId, claimCode }),
    });
  }

  status(token: string): Promise<ControllerStatus> {
    return this.authenticated<ControllerStatus>("/api/status", token);
  }

  updateSettings(
    token: string,
    settings: ControllerSettings,
  ): Promise<ControllerStatus> {
    return this.authenticated<ControllerStatus>("/api/settings", token, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
  }

  startServer(token: string): Promise<ControllerStatus> {
    return this.authenticated<ControllerStatus>("/api/server/start", token, {
      method: "POST",
    });
  }

  stopServer(token: string): Promise<ControllerStatus> {
    return this.authenticated<ControllerStatus>("/api/server/stop", token, {
      method: "POST",
    });
  }

  private authenticated<T>(
    path: string,
    token: string,
    options: RequestInit = {},
  ): Promise<T> {
    const headers = new Headers(options.headers);
    headers.set("Authorization", `Bearer ${token}`);
    return this.request<T>(path, { ...options, headers });
  }

  private async request<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const response = await this.fetchImplementation(`${this.origin}${path}`, {
      cache: "no-store",
      ...options,
      targetAddressSpace: "local",
    } as RequestInit & { targetAddressSpace: "local" });
    if (!response.ok) {
      let detail = `Controller returned HTTP ${response.status}`;
      try {
        const error = (await response.json()) as ErrorResponse;
        if (error.error) detail = error.error;
      } catch {
        // Keep the HTTP status when the response is not JSON.
      }
      throw new Error(detail);
    }
    return (await response.json()) as T;
  }
}

export function validateControllerHealth(
  health: ControllerHealth,
  expectedInstanceId: string,
): void {
  if (
    health.product !== CONTROLLER_PRODUCT ||
    health.protocolVersion !== CONTROLLER_PROTOCOL_VERSION ||
    health.instanceId !== expectedInstanceId
  ) {
    throw new Error("The listener is not the expected 200 OK controller.");
  }
}

export function controllerTokenKey(instanceId: string): string {
  return `ok200-crostini-token:${instanceId}`;
}
