/**
 * Wires the engine to Tauri's IPC layer.
 * This is the desktop equivalent of the CLI's server setup.
 */

import {
  createTauriServer,
  type ServerConfig,
  type TauriChannelCtor,
  type TauriInvokeFn,
  type WebServer,
} from "@ok200/engine";

let server: WebServer | null = null;

export async function createDesktopServer(
  config: ServerConfig,
  invokeFn: TauriInvokeFn,
  ChannelCtor: unknown,
): Promise<number> {
  if (server) {
    await server.stop();
  }

  server = createTauriServer({
    invoke: invokeFn,
    Channel: ChannelCtor as TauriChannelCtor,
    config,
  });

  return server.start();
}

export async function stopDesktopServer(): Promise<void> {
  if (server) {
    await server.stop();
    server = null;
  }
}
