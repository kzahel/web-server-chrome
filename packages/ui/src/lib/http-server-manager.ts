import type { ServerConfig, ServerInfo } from "@ok200/engine";
import type { DirectoryListing, ServerManager } from "./server-manager";

export class HttpServerManager implements ServerManager {
  private baseUrl: string;
  private authToken?: string;

  constructor(options?: { baseUrl?: string; authToken?: string }) {
    this.baseUrl = options?.baseUrl ?? "";
    this.authToken = options?.authToken;
  }

  private async apiFetch(path: string, init?: RequestInit): Promise<Response> {
    const headers: Record<string, string> = {};
    if (this.authToken) {
      headers.authorization = `Bearer ${this.authToken}`;
    }
    if (init?.body) {
      headers["content-type"] = "application/json";
    }
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: { ...headers, ...(init?.headers as Record<string, string>) },
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(
        (body as { error?: string }).error ?? `HTTP ${response.status}`,
      );
    }
    return response;
  }

  async listServers(): Promise<ServerInfo[]> {
    const res = await this.apiFetch("/_api/servers");
    return res.json();
  }

  async getServer(id: string): Promise<ServerInfo | undefined> {
    try {
      const res = await this.apiFetch(`/_api/servers/${id}`);
      return res.json();
    } catch {
      return undefined;
    }
  }

  async updateServer(
    id: string,
    config: Partial<ServerConfig>,
  ): Promise<ServerInfo> {
    const res = await this.apiFetch(`/_api/servers/${id}`, {
      method: "PUT",
      body: JSON.stringify(config),
    });
    return res.json();
  }

  async startServer(id: string): Promise<ServerInfo> {
    const res = await this.apiFetch(`/_api/servers/${id}/start`, {
      method: "POST",
    });
    return res.json();
  }

  async stopServer(id: string): Promise<ServerInfo> {
    const res = await this.apiFetch(`/_api/servers/${id}/stop`, {
      method: "POST",
    });
    return res.json();
  }

  async browseDirectory(path: string): Promise<DirectoryListing> {
    const res = await this.apiFetch(
      `/_api/browse?path=${encodeURIComponent(path)}`,
    );
    return res.json();
  }
}
