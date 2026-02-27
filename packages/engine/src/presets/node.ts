import { NodeFileSystem, NodeSocketFactory } from "../adapters/node/index.js";
import type { ServerConfig } from "../config/server-config.js";
import type { Logger } from "../logging/logger.js";
import { type RequestInterceptor, WebServer } from "../server/web-server.js";

export interface NodeServerOptions {
  config: ServerConfig;
  logger?: Logger;
  requestInterceptor?: RequestInterceptor;
}

export function createNodeServer(options: NodeServerOptions): WebServer {
  const socketFactory = new NodeSocketFactory();
  const fileSystem = new NodeFileSystem();
  return new WebServer({
    socketFactory,
    fileSystem,
    config: options.config,
    logger: options.logger,
    requestInterceptor: options.requestInterceptor,
  });
}
