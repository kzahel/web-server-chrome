// API
export {
  type ApiHandlerOptions,
  type ApiUiAssets,
  createApiInterceptor,
} from "./api/api-handler.js";
export {
  type ServerInfo,
  ServerRegistry,
  type ServerStatus,
} from "./api/server-registry.js";
// Certificate / TLS

export { NodeCertificateProvider } from "./adapters/node/node-certificate-provider.js";
// Interfaces
export {
  NodeFileHandle,
  NodeFileSystem,
} from "./adapters/node/node-filesystem.js";
// Node adapters
export {
  NodeSocketFactory,
  NodeTcpServer,
  NodeTcpSocket,
} from "./adapters/node/node-socket.js";
// Tauri adapters
export {
  TauriFileHandle,
  TauriFileSystem,
} from "./adapters/tauri/tauri-filesystem.js";
export { TauriSocketFactory } from "./adapters/tauri/tauri-socket-factory.js";
export { TauriTcpServer } from "./adapters/tauri/tauri-tcp-server.js";
export { TauriTcpSocket } from "./adapters/tauri/tauri-tcp-socket.js";
export type {
  TauriChannelCtor,
  TauriInvokeFn,
} from "./adapters/tauri/types.js";
// Config
export type { ServerConfig } from "./config/server-config.js";
export { defaultConfig } from "./config/server-config.js";
export { parseHttpRequest } from "./http/request-parser.js";
export { sendFileResponse, sendResponse } from "./http/response-writer.js";
// HTTP
export type { HttpRequest, HttpResponseOptions } from "./http/types.js";
export { STATUS_TEXT } from "./http/types.js";
export type {
  ICertificateProvider,
  TlsOptions,
} from "./interfaces/certificate.js";
export type {
  IFileHandle,
  IFileStat,
  IFileSystem,
} from "./interfaces/filesystem.js";
export type {
  ISocketFactory,
  ITcpServer,
  ITcpSocket,
  TcpSocketOptions,
} from "./interfaces/socket.js";
// Logging
export type { LogEntry, Logger, LogLevel } from "./logging/logger.js";
export {
  basicLogger,
  filteredLogger,
  LogStore,
  prefixedLogger,
} from "./logging/logger.js";
export type { NodeServerOptions } from "./presets/node.js";
// Presets
export { createNodeServer } from "./presets/node.js";
// Presets — Tauri
export type { TauriServerOptions } from "./presets/tauri.js";
export { createTauriServer } from "./presets/tauri.js";
export type { StaticServerOptions } from "./server/static-server.js";
export { StaticServer } from "./server/static-server.js";
export type {
  InterceptorContext,
  RequestInterceptor,
  WebServerOptions,
} from "./server/web-server.js";
// Server
export { WebServer } from "./server/web-server.js";
export { InMemoryFileSystem } from "./testing/in-memory-filesystem.js";
export { concat, decodeToString, fromString } from "./utils/buffer.js";
// Utils
export { EventEmitter } from "./utils/event-emitter.js";
export { TokenBucket } from "./utils/token-bucket.js";
