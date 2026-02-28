import type { ServerConfig } from "../config/server-config.js";
import { sendResponse } from "../http/response-writer.js";
import type { HttpRequest } from "../http/types.js";
import { STATUS_TEXT } from "../http/types.js";
import type { IFileSystem } from "../interfaces/filesystem.js";
import type { ITcpSocket } from "../interfaces/socket.js";
import type {
  InterceptorContext,
  RequestInterceptor,
} from "../server/web-server.js";
import { decodeToString, fromString } from "../utils/buffer.js";
import type { ServerInfo, ServerRegistry } from "./server-registry.js";

export interface ApiHandlerOptions {
  registry: ServerRegistry;
  authToken?: string;
  uiAssets?: ApiUiAssets;
  fileSystem?: IFileSystem;
  onStartServer?: (id: string) => Promise<ServerInfo>;
  onStopServer?: (id: string) => Promise<ServerInfo>;
  onUpdateConfig?: (
    id: string,
    config: Partial<ServerConfig>,
  ) => Promise<ServerInfo>;
}

export interface ApiUiAssets {
  getFile(path: string): { data: Uint8Array; mimeType: string } | undefined;
}

export function createApiInterceptor(
  options: ApiHandlerOptions,
): RequestInterceptor {
  return async (ctx: InterceptorContext): Promise<boolean> => {
    const { socket, request, connectionHeader } = ctx;

    if (!request.url.startsWith("/_api/")) {
      return false;
    }

    const path = request.url.split("?")[0];

    // /_api/ui/* — serve embedded UI assets (before auth so <script>/<link> tags work)
    if (path.startsWith("/_api/ui/") || path === "/_api/ui") {
      handleUiRequest(
        socket,
        request,
        path,
        connectionHeader,
        options.uiAssets,
      );
      return true;
    }

    if (!isAuthorized(socket, request, options.authToken)) {
      sendJsonResponse(
        socket,
        401,
        { error: "Unauthorized" },
        connectionHeader,
      );
      return true;
    }

    // /_api/servers — list all
    if (path === "/_api/servers" && request.method === "GET") {
      const servers = options.registry.listServers();
      sendJsonResponse(socket, 200, servers, connectionHeader);
      return true;
    }

    // /_api/servers/:id
    const serverMatch = path.match(/^\/_api\/servers\/([^/]+)$/);
    if (serverMatch) {
      const id = serverMatch[1];
      if (request.method === "GET") {
        const server = options.registry.getServer(id);
        if (!server) {
          sendJsonResponse(
            socket,
            404,
            { error: "Server not found" },
            connectionHeader,
          );
          return true;
        }
        sendJsonResponse(socket, 200, server, connectionHeader);
        return true;
      }
      if (request.method === "PUT") {
        const body = await ctx.readBody();
        return handleUpdateServer(socket, id, body, connectionHeader, options);
      }
    }

    // /_api/servers/:id/start
    const startMatch = path.match(/^\/_api\/servers\/([^/]+)\/start$/);
    if (startMatch && request.method === "POST") {
      return handleStartServer(
        socket,
        startMatch[1],
        connectionHeader,
        options,
      );
    }

    // /_api/servers/:id/stop
    const stopMatch = path.match(/^\/_api\/servers\/([^/]+)\/stop$/);
    if (stopMatch && request.method === "POST") {
      return handleStopServer(socket, stopMatch[1], connectionHeader, options);
    }

    // /_api/browse?path=...
    if (path === "/_api/browse" && request.method === "GET") {
      await handleBrowse(socket, request, connectionHeader, options);
      return true;
    }

    sendJsonResponse(socket, 404, { error: "Not found" }, connectionHeader);
    return true;
  };
}

function isAuthorized(
  socket: ITcpSocket,
  request: HttpRequest,
  authToken?: string,
): boolean {
  // No auth token configured = auth disabled, allow all
  if (!authToken) return true;

  // Localhost always bypasses auth
  const addr = socket.remoteAddress ?? "";
  if (
    addr === "127.0.0.1" ||
    addr === "::1" ||
    addr === "localhost" ||
    addr === "" // in-process / test sockets
  ) {
    return true;
  }

  const authHeader = request.headers.get("authorization") ?? "";
  if (authHeader.startsWith("Bearer ") && authHeader.slice(7) === authToken) {
    return true;
  }

  // Check query parameter (for browser access to UI)
  const qIndex = request.url.indexOf("?");
  if (qIndex >= 0) {
    const params = new URLSearchParams(request.url.slice(qIndex + 1));
    if (params.get("token") === authToken) {
      return true;
    }
  }

  return false;
}

function handleUiRequest(
  socket: ITcpSocket,
  _request: HttpRequest,
  path: string,
  connectionHeader: "keep-alive" | "close",
  uiAssets?: ApiUiAssets,
): void {
  if (!uiAssets) {
    sendJsonResponse(
      socket,
      404,
      { error: "UI not available" },
      connectionHeader,
    );
    return;
  }

  // Redirect /_api/ui to /_api/ui/
  if (path === "/_api/ui") {
    sendResponse(socket, {
      status: 301,
      statusText: STATUS_TEXT[301],
      headers: new Map([
        ["location", "/_api/ui/"],
        ["connection", connectionHeader],
      ]),
    });
    return;
  }

  let assetPath = path.slice("/_api/ui/".length);
  if (assetPath === "") assetPath = "index.html";

  const file = uiAssets.getFile(assetPath);
  if (file) {
    sendAssetResponse(socket, file, connectionHeader);
    return;
  }

  // SPA fallback: serve index.html for unmatched paths
  const index = uiAssets.getFile("index.html");
  if (index) {
    sendAssetResponse(socket, index, connectionHeader);
    return;
  }

  sendJsonResponse(socket, 404, { error: "Not found" }, connectionHeader);
}

function sendAssetResponse(
  socket: ITcpSocket,
  file: { data: Uint8Array; mimeType: string },
  connectionHeader: "keep-alive" | "close",
): void {
  sendResponse(socket, {
    status: 200,
    statusText: STATUS_TEXT[200],
    headers: new Map([
      ["content-type", file.mimeType],
      ["connection", connectionHeader],
      ["cache-control", "no-cache"],
    ]),
    body: file.data,
  });
}

async function handleStartServer(
  socket: ITcpSocket,
  id: string,
  connectionHeader: "keep-alive" | "close",
  options: ApiHandlerOptions,
): Promise<true> {
  if (!options.onStartServer) {
    sendJsonResponse(
      socket,
      501,
      { error: "Start not supported" },
      connectionHeader,
    );
    return true;
  }

  const server = options.registry.getServer(id);
  if (!server) {
    sendJsonResponse(
      socket,
      404,
      { error: "Server not found" },
      connectionHeader,
    );
    return true;
  }

  try {
    const info = await options.onStartServer(id);
    sendJsonResponse(socket, 200, info, connectionHeader);
  } catch (err) {
    sendJsonResponse(
      socket,
      500,
      { error: err instanceof Error ? err.message : String(err) },
      connectionHeader,
    );
  }
  return true;
}

async function handleStopServer(
  socket: ITcpSocket,
  id: string,
  connectionHeader: "keep-alive" | "close",
  options: ApiHandlerOptions,
): Promise<true> {
  if (!options.onStopServer) {
    sendJsonResponse(
      socket,
      501,
      { error: "Stop not supported" },
      connectionHeader,
    );
    return true;
  }

  const server = options.registry.getServer(id);
  if (!server) {
    sendJsonResponse(
      socket,
      404,
      { error: "Server not found" },
      connectionHeader,
    );
    return true;
  }

  try {
    const info = await options.onStopServer(id);
    sendJsonResponse(socket, 200, info, connectionHeader);
  } catch (err) {
    sendJsonResponse(
      socket,
      500,
      { error: err instanceof Error ? err.message : String(err) },
      connectionHeader,
    );
  }
  return true;
}

async function handleUpdateServer(
  socket: ITcpSocket,
  id: string,
  body: Uint8Array | undefined,
  connectionHeader: "keep-alive" | "close",
  options: ApiHandlerOptions,
): Promise<true> {
  const server = options.registry.getServer(id);
  if (!server) {
    sendJsonResponse(
      socket,
      404,
      { error: "Server not found" },
      connectionHeader,
    );
    return true;
  }

  if (!body || body.length === 0) {
    sendJsonResponse(
      socket,
      400,
      { error: "Request body required" },
      connectionHeader,
    );
    return true;
  }

  let partial: Partial<ServerConfig>;
  try {
    partial = JSON.parse(decodeToString(body));
  } catch {
    sendJsonResponse(socket, 400, { error: "Invalid JSON" }, connectionHeader);
    return true;
  }

  try {
    if (options.onUpdateConfig) {
      const info = await options.onUpdateConfig(id, partial);
      sendJsonResponse(socket, 200, info, connectionHeader);
    } else {
      options.registry.updateConfig(id, partial);
      const info = options.registry.getServer(id);
      sendJsonResponse(socket, 200, info, connectionHeader);
    }
  } catch (err) {
    sendJsonResponse(
      socket,
      500,
      { error: err instanceof Error ? err.message : String(err) },
      connectionHeader,
    );
  }
  return true;
}

async function handleBrowse(
  socket: ITcpSocket,
  request: HttpRequest,
  connectionHeader: "keep-alive" | "close",
  options: ApiHandlerOptions,
): Promise<void> {
  if (!options.fileSystem) {
    sendJsonResponse(
      socket,
      501,
      { error: "Browse not available" },
      connectionHeader,
    );
    return;
  }

  const qIndex = request.url.indexOf("?");
  const params =
    qIndex >= 0 ? new URLSearchParams(request.url.slice(qIndex + 1)) : null;
  const browsePath = params?.get("path") ?? "/";

  try {
    const exists = await options.fileSystem.exists(browsePath);
    if (!exists) {
      sendJsonResponse(
        socket,
        404,
        { error: "Path not found" },
        connectionHeader,
      );
      return;
    }

    const stat = await options.fileSystem.stat(browsePath);
    if (!stat.isDirectory) {
      sendJsonResponse(
        socket,
        400,
        { error: "Path is not a directory" },
        connectionHeader,
      );
      return;
    }

    const names = await options.fileSystem.readdir(browsePath);
    const entries: Array<{ name: string; isDirectory: boolean }> = [];

    for (const name of names) {
      // Skip hidden files
      if (name.startsWith(".")) continue;
      const fullPath = browsePath.endsWith("/")
        ? `${browsePath}${name}`
        : `${browsePath}/${name}`;
      try {
        const entryStat = await options.fileSystem.stat(fullPath);
        entries.push({
          name,
          isDirectory: entryStat.isDirectory,
        });
      } catch {
        // Skip entries we can't stat
      }
    }

    // Sort: directories first, then alphabetical
    entries.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    sendJsonResponse(
      socket,
      200,
      { path: browsePath, entries },
      connectionHeader,
    );
  } catch (err) {
    sendJsonResponse(
      socket,
      500,
      { error: err instanceof Error ? err.message : String(err) },
      connectionHeader,
    );
  }
}

function sendJsonResponse(
  socket: ITcpSocket,
  status: number,
  body: unknown,
  connectionHeader: "keep-alive" | "close",
): void {
  const json = JSON.stringify(body);
  const data = fromString(json);
  sendResponse(socket, {
    status,
    statusText: STATUS_TEXT[status] ?? "Unknown",
    headers: new Map([
      ["content-type", "application/json; charset=utf-8"],
      ["connection", connectionHeader],
      ["access-control-allow-origin", "*"],
      ["access-control-allow-headers", "authorization, content-type"],
      ["access-control-allow-methods", "GET, POST, PUT, DELETE, OPTIONS"],
    ]),
    body: data,
  });
}
