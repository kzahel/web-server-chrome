export interface ServerConfig {
  port: number;
  host: string;
  root: string;
  cors: boolean;
  spa: boolean;
  directoryListing: boolean;
  quiet: boolean;
  upload: boolean;
  requestTimeoutMs: number;
  maxRequestBodySize: number;
  tls?: {
    cert: Uint8Array;
    key: Uint8Array;
  };
}

export type ServerStatus =
  | "stopped"
  | "starting"
  | "running"
  | "stopping"
  | "error";

export interface ServerInfo {
  id: string;
  config: ServerConfig;
  status: ServerStatus;
  actualPort?: number;
  error?: string;
}

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
  openUrl?(url: string): Promise<void>;
  subscribe?(
    listener: (server: ManagedServerInfo) => void,
  ): Promise<() => void>;
  browseDirectory?(path: string): Promise<DirectoryListing>;
}
