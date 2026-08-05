import { controllerOrigin } from "./crostini-launch";

export const CONTROLLER_PRODUCT = "ok200-crostini-controller";
export const CONTROLLER_PROTOCOL_VERSION = 2;

export type ControllerHealth = {
  claimed: boolean;
  instanceId: string;
  product: string;
  protocolVersion: number;
  version: string;
};

export type ControllerSettings = {
  automaticUpdates: boolean;
  cors: boolean;
  directoryListing: boolean;
  keepServingOnClose: boolean;
  lan: boolean;
  port: number;
  root: string;
  spa: boolean;
};

export type FolderRoot = {
  available: boolean;
  id: string;
  name: string;
};

export type FolderListing = {
  canSelect: boolean;
  displayPath: string;
  entries: Array<{ name: string }>;
  path: string[];
  rootId: string;
  rootName: string;
};

export type ControllerUpdateStatus = {
  availableVersion?: string | null;
  error?: string | null;
  lastCheckedAt?: number | null;
  state: "current" | "checking" | "available" | "installing" | "error";
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
  update: ControllerUpdateStatus;
  version: string;
};

export type ControllerSession = {
  expiresInSeconds: number;
  sessionId: string;
  status: ControllerStatus;
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

  openSession(token: string): Promise<ControllerSession> {
    return this.authenticated<ControllerSession>("/api/session/open", token, {
      method: "POST",
    });
  }

  heartbeatSession(
    token: string,
    sessionId: string,
  ): Promise<ControllerSession> {
    return this.authenticated<ControllerSession>(
      "/api/session/heartbeat",
      token,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      },
    );
  }

  closeSession(
    token: string,
    sessionId: string,
    keepalive = false,
  ): Promise<ControllerStatus> {
    return this.authenticated<ControllerStatus>("/api/session/close", token, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
      keepalive,
    });
  }

  folderRoots(token: string): Promise<{ roots: FolderRoot[] }> {
    return this.authenticated<{ roots: FolderRoot[] }>(
      "/api/folders/roots",
      token,
    );
  }

  listFolders(
    token: string,
    rootId: string,
    path: string[],
  ): Promise<FolderListing> {
    return this.authenticated<FolderListing>("/api/folders/list", token, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rootId, path }),
    });
  }

  createFolder(
    token: string,
    rootId: string,
    path: string[],
    name: string,
  ): Promise<FolderListing> {
    return this.authenticated<FolderListing>("/api/folders/create", token, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rootId, path, name }),
    });
  }

  selectFolder(
    token: string,
    rootId: string,
    path: string[],
  ): Promise<ControllerStatus> {
    return this.authenticated<ControllerStatus>("/api/folders/select", token, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rootId, path }),
    });
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

  startServer(token: string, sessionId: string): Promise<ControllerStatus> {
    return this.authenticated<ControllerStatus>("/api/server/start", token, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    });
  }

  stopServer(token: string): Promise<ControllerStatus> {
    return this.authenticated<ControllerStatus>("/api/server/stop", token, {
      method: "POST",
    });
  }

  checkUpdate(token: string): Promise<ControllerStatus> {
    return this.authenticated<ControllerStatus>("/api/update/check", token, {
      method: "POST",
    });
  }

  installUpdate(token: string): Promise<ControllerStatus> {
    return this.authenticated<ControllerStatus>("/api/update/install", token, {
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
  if (health.product !== CONTROLLER_PRODUCT) {
    throw new Error("The listener is not the expected 200 OK controller.");
  }
  if (health.protocolVersion !== CONTROLLER_PROTOCOL_VERSION) {
    throw new Error(
      `This extension requires Linux controller protocol ${CONTROLLER_PROTOCOL_VERSION}, but the installed component reported protocol ${health.protocolVersion}. Update the extension and Linux component together.`,
    );
  }
  if (health.instanceId !== expectedInstanceId) {
    throw new Error(
      "The listener belongs to a different 200 OK controller. Launch 200 OK Web Server again.",
    );
  }
}

export function controllerTokenKey(instanceId: string): string {
  return `ok200-crostini-token:${instanceId}`;
}
