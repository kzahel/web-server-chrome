import type { ServerConfig, ServerInfo, ServerRegistry } from "@ok200/engine";
import type { ServerManager } from "./server-manager";

export class DirectServerManager implements ServerManager {
  constructor(
    private registry: ServerRegistry,
    private callbacks: {
      onStart: (id: string) => Promise<ServerInfo>;
      onStop: (id: string) => Promise<ServerInfo>;
    },
  ) {}

  async listServers(): Promise<ServerInfo[]> {
    return this.registry.listServers();
  }

  async getServer(id: string): Promise<ServerInfo | undefined> {
    return this.registry.getServer(id);
  }

  async updateServer(
    id: string,
    config: Partial<ServerConfig>,
  ): Promise<ServerInfo> {
    this.registry.updateConfig(id, config);
    const server = this.registry.getServer(id);
    if (!server) throw new Error(`Server not found: ${id}`);
    return server;
  }

  async startServer(id: string): Promise<ServerInfo> {
    return this.callbacks.onStart(id);
  }

  async stopServer(id: string): Promise<ServerInfo> {
    return this.callbacks.onStop(id);
  }
}
