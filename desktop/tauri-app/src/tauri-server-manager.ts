import type {
  ManagedServerInfo,
  ServerConfig,
  ServerManager,
  StartAssessment,
  StartOptions,
} from "@ok200/ui/lib/server-manager";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

interface NativeServerConfig {
  root: string;
  port: number;
  host: string;
  cors: boolean;
  spa: boolean;
  directoryListing: boolean;
}

interface NativeServerSnapshot {
  id: string;
  config: NativeServerConfig;
  status: ManagedServerInfo["status"];
  actualPort?: number;
  error?: string;
  startAssessment: StartAssessment;
}

function toNativeConfig(config: ServerConfig): NativeServerConfig {
  return {
    root: config.root,
    port: config.port,
    host: config.host,
    cors: config.cors,
    spa: config.spa,
    directoryListing: config.directoryListing,
  };
}

function toServerInfo(snapshot: NativeServerSnapshot): ManagedServerInfo {
  return {
    id: snapshot.id,
    status: snapshot.status,
    actualPort: snapshot.actualPort,
    error: snapshot.error,
    startAssessment: snapshot.startAssessment,
    config: snapshot.config,
  };
}

export class TauriServerManager implements ServerManager {
  async getServer(id: string): Promise<ManagedServerInfo | undefined> {
    if (id !== "default") return undefined;
    return this.getDefaultServer();
  }

  async updateServer(
    id: string,
    partial: Partial<ServerConfig>,
  ): Promise<ManagedServerInfo> {
    this.assertDefault(id);
    const current = await this.getDefaultServer();
    const config = { ...current.config, ...partial };
    const snapshot = await invoke<NativeServerSnapshot>(
      "server_update_config",
      {
        config: toNativeConfig(config),
      },
    );
    return toServerInfo(snapshot);
  }

  async startServer(
    id: string,
    options?: StartOptions,
  ): Promise<ManagedServerInfo> {
    this.assertDefault(id);
    const snapshot = await invoke<NativeServerSnapshot>("server_start", {
      acknowledgeRisk: options?.acknowledgeRisk ?? false,
    });
    return toServerInfo(snapshot);
  }

  async stopServer(id: string): Promise<ManagedServerInfo> {
    this.assertDefault(id);
    return toServerInfo(await invoke<NativeServerSnapshot>("server_stop"));
  }

  async pickDirectory(startDir?: string): Promise<string | null> {
    return invoke<string | null>("server_pick_root", {
      startDir: startDir || null,
    });
  }

  async openUrl(url: string): Promise<void> {
    return invoke("plugin:opener|open_url", { url, with: null });
  }

  async subscribe(
    listener: (server: ManagedServerInfo) => void,
  ): Promise<() => void> {
    return listen<NativeServerSnapshot>("server-state", (event) => {
      listener(toServerInfo(event.payload));
    });
  }

  private async getDefaultServer(): Promise<ManagedServerInfo> {
    return toServerInfo(await invoke<NativeServerSnapshot>("server_get"));
  }

  private assertDefault(id: string): void {
    if (id !== "default") {
      throw new Error(`Unknown server: ${id}`);
    }
  }
}
