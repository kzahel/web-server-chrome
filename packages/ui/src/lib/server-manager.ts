import type { ServerConfig, ServerInfo } from "@ok200/engine";

export interface StartAssessment {
  allowed: boolean;
  requiresConfirmation: boolean;
  risk?:
    | "safe"
    | "homeDirectory"
    | "ancestorOfHome"
    | "outsideHome"
    | "unknownLocation";
  canonicalRoot?: string;
  message?: string;
}

export interface ManagedServerInfo extends ServerInfo {
  startAssessment?: StartAssessment;
}

export interface StartOptions {
  acknowledgeRisk?: boolean;
}

export interface DirectoryListing {
  path: string;
  entries: Array<{ name: string; isDirectory: boolean }>;
}

export interface ServerManager {
  listServers(): Promise<ManagedServerInfo[]>;
  getServer(id: string): Promise<ManagedServerInfo | undefined>;
  updateServer(
    id: string,
    config: Partial<ServerConfig>,
  ): Promise<ManagedServerInfo>;
  startServer(id: string, options?: StartOptions): Promise<ManagedServerInfo>;
  stopServer(id: string): Promise<ManagedServerInfo>;
  pickDirectory?(startDir?: string): Promise<string | null>;
  subscribe?(
    listener: (server: ManagedServerInfo) => void,
  ): Promise<() => void>;
  browseDirectory?(path: string): Promise<DirectoryListing>;
}
