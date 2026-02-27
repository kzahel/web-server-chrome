import type { ServerConfig, ServerInfo } from "@ok200/engine";

export interface DirectoryListing {
  path: string;
  entries: Array<{ name: string; isDirectory: boolean }>;
}

export interface ServerManager {
  listServers(): Promise<ServerInfo[]>;
  getServer(id: string): Promise<ServerInfo | undefined>;
  updateServer(id: string, config: Partial<ServerConfig>): Promise<ServerInfo>;
  startServer(id: string): Promise<ServerInfo>;
  stopServer(id: string): Promise<ServerInfo>;
  browseDirectory?(path: string): Promise<DirectoryListing>;
  hasNativeFilePicker?: boolean;
}
