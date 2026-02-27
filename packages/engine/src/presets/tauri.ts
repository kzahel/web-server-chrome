import { TauriFileSystem } from "../adapters/tauri/tauri-filesystem.js";
import { TauriSocketFactory } from "../adapters/tauri/tauri-socket-factory.js";
import type {
  TauriChannelCtor,
  TauriInvokeFn,
} from "../adapters/tauri/types.js";
import type { ServerConfig } from "../config/server-config.js";
import type { Logger } from "../logging/logger.js";
import { type RequestInterceptor, WebServer } from "../server/web-server.js";

export interface TauriServerOptions {
  config: ServerConfig;
  logger?: Logger;
  /** The invoke function from @tauri-apps/api/core */
  invoke: TauriInvokeFn;
  /** The Channel constructor from @tauri-apps/api/core */
  Channel: TauriChannelCtor;
  requestInterceptor?: RequestInterceptor;
}

export function createTauriServer(options: TauriServerOptions): WebServer {
  const socketFactory = new TauriSocketFactory(options.invoke, options.Channel);
  const fileSystem = new TauriFileSystem(options.invoke);
  return new WebServer({
    socketFactory,
    fileSystem,
    config: options.config,
    logger: options.logger,
    requestInterceptor: options.requestInterceptor,
  });
}
