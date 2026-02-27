import type { ServerConfig } from "../config/server-config.js";

export type ServerStatus = "stopped" | "starting" | "running" | "error";

export interface ServerInfo {
  id: string;
  config: ServerConfig;
  status: ServerStatus;
  actualPort?: number;
  error?: string;
}

interface ServerEntry {
  id: string;
  config: ServerConfig;
  status: ServerStatus;
  actualPort?: number;
  error?: string;
}

export class ServerRegistry {
  private servers = new Map<string, ServerEntry>();

  register(id: string, config: ServerConfig): void {
    this.servers.set(id, {
      id,
      config: { ...config },
      status: "stopped",
    });
  }

  setStatus(id: string, status: ServerStatus, actualPort?: number): void {
    const entry = this.servers.get(id);
    if (!entry) throw new Error(`Unknown server: ${id}`);
    entry.status = status;
    entry.actualPort = actualPort;
    if (status !== "error") {
      entry.error = undefined;
    }
  }

  setError(id: string, error: string): void {
    const entry = this.servers.get(id);
    if (!entry) throw new Error(`Unknown server: ${id}`);
    entry.status = "error";
    entry.error = error;
  }

  updateConfig(id: string, partial: Partial<ServerConfig>): ServerConfig {
    const entry = this.servers.get(id);
    if (!entry) throw new Error(`Unknown server: ${id}`);
    entry.config = { ...entry.config, ...partial };
    return { ...entry.config };
  }

  getServer(id: string): ServerInfo | undefined {
    const entry = this.servers.get(id);
    if (!entry) return undefined;
    return {
      id: entry.id,
      config: { ...entry.config },
      status: entry.status,
      actualPort: entry.actualPort,
      error: entry.error,
    };
  }

  listServers(): ServerInfo[] {
    return Array.from(this.servers.values()).map((entry) => ({
      id: entry.id,
      config: { ...entry.config },
      status: entry.status,
      actualPort: entry.actualPort,
      error: entry.error,
    }));
  }
}
