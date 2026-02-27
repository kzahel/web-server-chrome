import type { ServerConfig } from "../config/server-config.js";
import {
  createHttpRequestParser,
  type HttpRequestHead,
  HttpRequestParseError,
} from "../http/request-parser.js";
import { sendResponse } from "../http/response-writer.js";
import type { HttpRequest } from "../http/types.js";
import { STATUS_TEXT } from "../http/types.js";
import type { IFileSystem } from "../interfaces/filesystem.js";
import type {
  ISocketFactory,
  ITcpServer,
  ITcpSocket,
} from "../interfaces/socket.js";
import type { Logger } from "../logging/logger.js";
import { basicLogger } from "../logging/logger.js";
import { fromString } from "../utils/buffer.js";
import { EventEmitter } from "../utils/event-emitter.js";
import { StaticServer } from "./static-server.js";

export interface InterceptorContext {
  socket: ITcpSocket;
  request: HttpRequest;
  connectionHeader: "keep-alive" | "close";
  readBody: () => Promise<Uint8Array | undefined>;
}

export type RequestInterceptor = (ctx: InterceptorContext) => Promise<boolean>;

export interface WebServerOptions {
  socketFactory: ISocketFactory;
  fileSystem: IFileSystem;
  config: ServerConfig;
  logger?: Logger;
  requestInterceptor?: RequestInterceptor;
}

export class WebServer extends EventEmitter {
  private socketFactory: ISocketFactory;
  private fileSystem: IFileSystem;
  private config: ServerConfig;
  private logger: Logger;
  private tcpServer: ITcpServer | null = null;
  private staticServer: StaticServer;
  private activeConnections: Set<ITcpSocket> = new Set();
  private requestInterceptor?: RequestInterceptor;

  constructor(options: WebServerOptions) {
    super();
    this.socketFactory = options.socketFactory;
    this.fileSystem = options.fileSystem;
    this.config = options.config;
    this.logger = options.logger ?? basicLogger();
    this.requestInterceptor = options.requestInterceptor;

    this.staticServer = new StaticServer({
      root: this.config.root,
      fs: this.fileSystem,
      directoryListing: this.config.directoryListing,
      spa: this.config.spa,
      cors: this.config.cors,
      upload: this.config.upload,
      logger: this.logger,
    });
  }

  start(): Promise<number> {
    if (this.tcpServer) {
      return Promise.reject(new Error("Server is already started"));
    }

    return new Promise((resolve, reject) => {
      const server = this.socketFactory.createTcpServer(this.config.tls);
      this.tcpServer = server;

      let settled = false;

      server.on("connection", (rawSocket) => {
        const socket = this.socketFactory.wrapTcpSocket(rawSocket);
        this.handleConnection(socket);
      });

      server.on("error", (err) => {
        if (!settled) {
          settled = true;
          this.tcpServer = null;
          reject(err);
          return;
        }

        this.logger.error("TCP server error:", err);
        this.emit("error", err);
      });

      server.listen(this.config.port, this.config.host, () => {
        if (settled) return;
        settled = true;
        const addr = server.address();
        const port = addr?.port ?? this.config.port;
        this.emit("listening", port);
        resolve(port);
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      const server = this.tcpServer;
      this.tcpServer = null;

      // Close all active connections
      for (const socket of this.activeConnections) {
        socket.close();
      }
      this.activeConnections.clear();

      if (!server) {
        this.emit("close");
        resolve();
        return;
      }

      server.close(() => {
        this.emit("close");
        resolve();
      });
    });
  }

  private async handleConnection(socket: ITcpSocket): Promise<void> {
    this.activeConnections.add(socket);

    socket.onClose(() => {
      this.activeConnections.delete(socket);
    });

    socket.onError(() => {
      this.activeConnections.delete(socket);
    });

    const parser = createHttpRequestParser(socket);

    try {
      while (true) {
        let requestHead: HttpRequestHead;
        try {
          requestHead = await parser.readRequestHead({
            timeoutMs: this.config.requestTimeoutMs,
          });
        } catch (err) {
          const outcome = classifyRequestParseFailure(err);
          if (outcome === "close") {
            break;
          }

          // Parsing failed — send error if socket is still open.
          try {
            sendResponse(socket, {
              status: outcome,
              statusText: STATUS_TEXT[outcome],
              headers: new Map([["connection", "close"]]),
              body: fromString(STATUS_TEXT[outcome]),
            });
          } catch {
            // Socket already closed
          }
          break;
        }

        const requestBase: HttpRequest = {
          method: requestHead.method,
          url: requestHead.url,
          httpVersion: requestHead.httpVersion,
          headers: requestHead.headers,
        };

        if (!this.config.quiet) {
          const addr = socket.remoteAddress ?? "?";
          this.logger.info(
            `${requestBase.method} ${requestBase.url} - ${addr}`,
          );
        }

        const keepAlive = shouldKeepAlive(
          requestBase.httpVersion,
          requestBase.headers,
        );
        const connectionHeader = keepAlive ? "keep-alive" : "close";

        if (this.requestInterceptor) {
          let bodyRead = false;
          let bodyData: Uint8Array | undefined;
          const readBody = async (): Promise<Uint8Array | undefined> => {
            if (bodyRead) return bodyData;
            bodyRead = true;
            if (requestHead.contentLength > 0) {
              bodyData = await parser.readBody(requestHead.contentLength, {
                timeoutMs: this.config.requestTimeoutMs,
                maxBodySize: this.config.maxRequestBodySize,
              });
            }
            return bodyData;
          };

          const handled = await this.requestInterceptor({
            socket,
            request: requestBase,
            connectionHeader,
            readBody,
          });
          if (handled) {
            if (!keepAlive) break;
            continue;
          }
        }

        const isUploadRequest =
          this.config.upload &&
          (requestBase.method === "PUT" || requestBase.method === "POST");

        if (isUploadRequest) {
          await this.staticServer.handleRequest(socket, requestBase, {
            connectionHeader,
            bodyConsumer: {
              contentLength: requestHead.contentLength,
              consume: async (onChunk) =>
                parser.consumeBody(requestHead.contentLength, onChunk, {
                  timeoutMs: this.config.requestTimeoutMs,
                }),
            },
          });
        } else {
          let body: Uint8Array | undefined;
          try {
            if (requestHead.contentLength > 0) {
              body = await parser.readBody(requestHead.contentLength, {
                timeoutMs: this.config.requestTimeoutMs,
                maxBodySize: this.config.maxRequestBodySize,
              });
            }
          } catch (err) {
            const outcome = classifyRequestParseFailure(err);
            if (outcome === "close") {
              break;
            }

            try {
              sendResponse(socket, {
                status: outcome,
                statusText: STATUS_TEXT[outcome],
                headers: new Map([["connection", "close"]]),
                body: fromString(STATUS_TEXT[outcome]),
              });
            } catch {
              // Socket already closed
            }
            break;
          }

          await this.staticServer.handleRequest(
            socket,
            {
              ...requestBase,
              body,
            },
            { connectionHeader },
          );
        }

        if (!keepAlive) {
          break;
        }
      }
    } finally {
      // Close the socket when request loop exits.
      try {
        socket.close();
      } catch {
        // Already closed
      }
    }
  }
}

function shouldKeepAlive(
  httpVersion: string,
  headers: Map<string, string>,
): boolean {
  const connection = headers.get("connection")?.toLowerCase();
  if (httpVersion === "1.0") {
    return connection === "keep-alive";
  }
  return connection !== "close";
}

function classifyRequestParseFailure(err: unknown): 400 | 413 | "close" {
  if (!(err instanceof HttpRequestParseError)) {
    return 400;
  }

  if (
    err.code === "IDLE_TIMEOUT" ||
    err.code === "CONNECTION_CLOSED" ||
    err.code === "CONNECTION_CLOSED_INCOMPLETE"
  ) {
    return "close";
  }

  if (err.code === "BODY_TOO_LARGE") {
    return 413;
  }

  return 400;
}
