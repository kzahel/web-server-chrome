import { HttpRequestParseError } from "../http/request-parser.js";
import { sendFileResponse, sendResponse } from "../http/response-writer.js";
import type { HttpRequest } from "../http/types.js";
import { STATUS_TEXT } from "../http/types.js";
import type { IFileSystem } from "../interfaces/filesystem.js";
import type { ITcpSocket } from "../interfaces/socket.js";
import type { Logger } from "../logging/logger.js";
import { fromString } from "../utils/buffer.js";
import { generateDirectoryListing } from "./directory-listing.js";
import { getMimeType } from "./mime-types.js";

export interface StaticServerOptions {
  root: string;
  fs: IFileSystem;
  directoryListing: boolean;
  spa: boolean;
  cors: boolean;
  upload: boolean;
  logger?: Logger;
}

export interface HttpRequestBodyConsumer {
  contentLength: number;
  consume(onChunk: (chunk: Uint8Array) => Promise<void> | void): Promise<void>;
}

export interface StaticRequestOptions {
  connectionHeader?: "keep-alive" | "close";
  bodyConsumer?: HttpRequestBodyConsumer;
}

type RangeParseResult =
  | { kind: "none" }
  | { kind: "unsatisfiable" }
  | { kind: "ok"; start: number; end: number };

export class StaticServer {
  private root: string;
  private fs: IFileSystem;
  private directoryListing: boolean;
  private spa: boolean;
  private cors: boolean;
  private upload: boolean;
  private logger?: Logger;
  private resolvedRootPromise: Promise<string> | null = null;

  constructor(options: StaticServerOptions) {
    this.root = normalizeConfiguredRoot(options.root);
    this.fs = options.fs;
    this.directoryListing = options.directoryListing;
    this.spa = options.spa;
    this.cors = options.cors;
    this.upload = options.upload;
    this.logger = options.logger;
  }

  async handleRequest(
    socket: ITcpSocket,
    request: HttpRequest,
    options?: StaticRequestOptions,
  ): Promise<void> {
    const extraHeaders = new Map<string, string>();
    extraHeaders.set("server", "ok200");
    extraHeaders.set("date", new Date().toUTCString());
    if (options?.connectionHeader) {
      extraHeaders.set("connection", options.connectionHeader);
    }

    if (this.cors) {
      extraHeaders.set("access-control-allow-origin", "*");
      extraHeaders.set("access-control-allow-methods", this.allowedMethods());
      extraHeaders.set("access-control-allow-headers", "*");
    }

    if (request.method === "OPTIONS" && this.cors) {
      sendResponse(socket, {
        status: 204,
        statusText: "No Content",
        headers: extraHeaders,
      });
      return;
    }

    if (request.method === "PUT" || request.method === "POST") {
      if (!this.upload) {
        extraHeaders.set("allow", this.allowedMethods());
        this.sendTextResponse(
          socket,
          request,
          405,
          STATUS_TEXT[405],
          extraHeaders,
          "Method Not Allowed",
        );
        return;
      }

      await this.handleUploadRequest(socket, request, extraHeaders, options);
      return;
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      extraHeaders.set("allow", this.allowedMethods());
      this.sendTextResponse(
        socket,
        request,
        405,
        STATUS_TEXT[405],
        extraHeaders,
        "Method Not Allowed",
      );
      return;
    }

    // Decode URL and resolve path
    const urlPath = decodeRequestPath(request.url);
    if (!urlPath) {
      this.sendTextResponse(
        socket,
        request,
        400,
        STATUS_TEXT[400],
        extraHeaders,
        "Bad Request",
      );
      return;
    }

    const fsPath = joinRootAndUrlPath(this.root, urlPath);

    try {
      const exists = await this.fs.exists(fsPath);
      if (!exists) {
        return this.handleNotFound(socket, request, urlPath, extraHeaders);
      }

      const allowed = await this.isPathInsideRoot(fsPath);
      if (!allowed) {
        this.sendTextResponse(
          socket,
          request,
          403,
          STATUS_TEXT[403],
          extraHeaders,
          "Forbidden",
        );
        return;
      }

      const stat = await this.fs.stat(fsPath);

      if (stat.isDirectory) {
        // Try index.html
        const indexPath = `${fsPath}/index.html`;
        if (await this.fs.exists(indexPath)) {
          const indexStat = await this.fs.stat(indexPath);
          return this.serveFile(
            socket,
            request,
            indexPath,
            indexStat.size,
            indexStat.mtime,
            extraHeaders,
          );
        }

        // Directory listing
        if (this.directoryListing) {
          const html = await generateDirectoryListing(this.fs, fsPath, urlPath);
          const body = fromString(html);
          extraHeaders.set("content-type", "text/html; charset=utf-8");
          this.sendResponseWithOptionalBody(
            socket,
            request,
            200,
            STATUS_TEXT[200],
            extraHeaders,
            body,
          );
          return;
        }

        return this.handleNotFound(socket, request, urlPath, extraHeaders);
      }

      if (stat.isFile) {
        return this.serveFile(
          socket,
          request,
          fsPath,
          stat.size,
          stat.mtime,
          extraHeaders,
        );
      }

      this.sendTextResponse(
        socket,
        request,
        404,
        STATUS_TEXT[404],
        extraHeaders,
        "Not Found",
      );
    } catch (err) {
      this.logger?.error("Error serving request:", err);
      this.sendTextResponse(
        socket,
        request,
        500,
        STATUS_TEXT[500],
        extraHeaders,
        "Internal Server Error",
      );
    }
  }

  private async handleNotFound(
    socket: ITcpSocket,
    _request: HttpRequest,
    _urlPath: string,
    extraHeaders: Map<string, string>,
  ): Promise<void> {
    // SPA mode: serve index.html for missing paths
    if (this.spa) {
      const indexPath = `${this.root}/index.html`;
      if (await this.fs.exists(indexPath)) {
        const stat = await this.fs.stat(indexPath);
        return this.serveFile(
          socket,
          _request,
          indexPath,
          stat.size,
          stat.mtime,
          extraHeaders,
        );
      }
    }

    extraHeaders.set("content-type", "text/plain; charset=utf-8");
    this.sendTextResponse(
      socket,
      _request,
      404,
      STATUS_TEXT[404],
      extraHeaders,
      "Not Found",
    );
  }

  private async handleUploadRequest(
    socket: ITcpSocket,
    request: HttpRequest,
    extraHeaders: Map<string, string>,
    options?: StaticRequestOptions,
  ): Promise<void> {
    const bodyConsumer = options?.bodyConsumer;
    const drainBody = async (): Promise<void> => {
      try {
        await this.consumeRequestBody(request, bodyConsumer, async () => {});
      } catch {
        // Ignore body drain failures when returning an error response.
      }
    };

    const urlPath = decodeRequestPath(request.url);
    if (!urlPath) {
      await drainBody();
      this.sendTextResponse(
        socket,
        request,
        400,
        STATUS_TEXT[400],
        extraHeaders,
        "Bad Request",
      );
      return;
    }

    if (urlPath === "/" || urlPath.endsWith("/")) {
      await drainBody();
      this.sendTextResponse(
        socket,
        request,
        400,
        STATUS_TEXT[400],
        extraHeaders,
        "Upload target must be a file path",
      );
      return;
    }

    const fsPath = joinRootAndUrlPath(this.root, urlPath);
    const parentPath = parentPathOf(fsPath);

    try {
      const parentExists = await this.fs.exists(parentPath);
      if (!parentExists) {
        await drainBody();
        this.sendTextResponse(
          socket,
          request,
          404,
          STATUS_TEXT[404],
          extraHeaders,
          "Not Found",
        );
        return;
      }

      const parentStat = await this.fs.stat(parentPath);
      if (!parentStat.isDirectory) {
        await drainBody();
        this.sendTextResponse(
          socket,
          request,
          400,
          STATUS_TEXT[400],
          extraHeaders,
          "Bad Request",
        );
        return;
      }

      const parentAllowed = await this.isPathInsideRoot(parentPath);
      if (!parentAllowed) {
        await drainBody();
        this.sendTextResponse(
          socket,
          request,
          403,
          STATUS_TEXT[403],
          extraHeaders,
          "Forbidden",
        );
        return;
      }

      let existed = false;
      const targetExists = await this.fs.exists(fsPath);
      if (targetExists) {
        const targetStat = await this.fs.stat(fsPath);
        if (targetStat.isDirectory) {
          await drainBody();
          this.sendTextResponse(
            socket,
            request,
            400,
            STATUS_TEXT[400],
            extraHeaders,
            "Bad Request",
          );
          return;
        }

        const targetAllowed = await this.isPathInsideRoot(fsPath);
        if (!targetAllowed) {
          await drainBody();
          this.sendTextResponse(
            socket,
            request,
            403,
            STATUS_TEXT[403],
            extraHeaders,
            "Forbidden",
          );
          return;
        }
        existed = true;
      }

      const handle = await this.fs.open(fsPath, "w");
      let position = 0;
      try {
        await this.consumeRequestBody(
          request,
          bodyConsumer,
          async (chunk: Uint8Array) => {
            if (chunk.length === 0) return;
            await handle.write(chunk, 0, chunk.length, position);
            position += chunk.length;
          },
        );
        await handle.sync();
      } finally {
        await handle.close();
      }

      sendResponse(socket, {
        status: existed ? 200 : 201,
        statusText: existed ? STATUS_TEXT[200] : STATUS_TEXT[201],
        headers: extraHeaders,
      });
    } catch (err) {
      await drainBody();
      const status = err instanceof HttpRequestParseError ? 400 : 500;
      const statusText = STATUS_TEXT[status];
      this.logger?.error("Error handling upload request:", err);
      this.sendTextResponse(
        socket,
        request,
        status,
        statusText,
        extraHeaders,
        statusText,
      );
    }
  }

  private async serveFile(
    socket: ITcpSocket,
    request: HttpRequest,
    filePath: string,
    fileSize: number,
    mtime: Date,
    extraHeaders: Map<string, string>,
  ): Promise<void> {
    const allowed = await this.isPathInsideRoot(filePath);
    if (!allowed) {
      this.sendTextResponse(
        socket,
        request,
        403,
        STATUS_TEXT[403],
        extraHeaders,
        "Forbidden",
      );
      return;
    }

    const mimeType = getMimeType(filePath);
    extraHeaders.set("content-type", mimeType);
    extraHeaders.set("accept-ranges", "bytes");
    extraHeaders.set("last-modified", mtime.toUTCString());
    extraHeaders.set(
      "etag",
      `"${mtime.getTime().toString(36)}-${fileSize.toString(36)}"`,
    );

    // Check If-None-Match
    const ifNoneMatch = request.headers.get("if-none-match");
    const etag = extraHeaders.get("etag");
    if (ifNoneMatch && etag && ifNoneMatch === etag) {
      sendResponse(socket, {
        status: 304,
        statusText: STATUS_TEXT[304],
        headers: extraHeaders,
      });
      return;
    }

    const range = parseRangeHeader(request.headers.get("range"), fileSize);
    if (range.kind === "unsatisfiable") {
      extraHeaders.set("content-range", `bytes */${fileSize}`);
      this.sendTextResponse(
        socket,
        request,
        416,
        STATUS_TEXT[416],
        extraHeaders,
        STATUS_TEXT[416],
      );
      return;
    }

    if (range.kind === "ok") {
      const partialSize = range.end - range.start + 1;
      extraHeaders.set(
        "content-range",
        `bytes ${range.start}-${range.end}/${fileSize}`,
      );
      extraHeaders.set("content-length", String(partialSize));

      // HEAD: send headers only
      if (request.method === "HEAD") {
        sendResponse(socket, {
          status: 206,
          statusText: STATUS_TEXT[206],
          headers: extraHeaders,
        });
        return;
      }

      const handle = await this.fs.open(filePath, "r");
      try {
        await sendFileResponse(
          socket,
          { status: 206, statusText: STATUS_TEXT[206], headers: extraHeaders },
          handle,
          fileSize,
          { start: range.start, end: range.end },
        );
      } finally {
        await handle.close();
      }
      return;
    }

    if (request.method === "HEAD") {
      extraHeaders.set("content-length", String(fileSize));
      sendResponse(socket, {
        status: 200,
        statusText: STATUS_TEXT[200],
        headers: extraHeaders,
      });
      return;
    }

    // Stream file
    const handle = await this.fs.open(filePath, "r");
    try {
      await sendFileResponse(
        socket,
        { status: 200, statusText: STATUS_TEXT[200], headers: extraHeaders },
        handle,
        fileSize,
      );
    } finally {
      await handle.close();
    }
  }

  private async consumeRequestBody(
    request: HttpRequest,
    bodyConsumer: HttpRequestBodyConsumer | undefined,
    onChunk: (chunk: Uint8Array) => Promise<void> | void,
  ): Promise<void> {
    if (bodyConsumer) {
      await bodyConsumer.consume(onChunk);
      return;
    }

    if (request.body && request.body.length > 0) {
      await onChunk(request.body);
    }
  }

  private allowedMethods(): string {
    if (this.upload) {
      return "GET, HEAD, OPTIONS, PUT, POST";
    }
    return "GET, HEAD, OPTIONS";
  }

  private sendTextResponse(
    socket: ITcpSocket,
    request: HttpRequest,
    status: number,
    statusText: string,
    headers: Map<string, string>,
    text: string,
  ): void {
    headers.set("content-type", "text/plain; charset=utf-8");
    this.sendResponseWithOptionalBody(
      socket,
      request,
      status,
      statusText,
      headers,
      fromString(text),
    );
  }

  private sendResponseWithOptionalBody(
    socket: ITcpSocket,
    request: HttpRequest,
    status: number,
    statusText: string,
    headers: Map<string, string>,
    body?: Uint8Array,
  ): void {
    if (request.method === "HEAD") {
      if (body) {
        headers.set("content-length", String(body.length));
      }
      sendResponse(socket, { status, statusText, headers });
      return;
    }

    sendResponse(socket, { status, statusText, headers, body });
  }

  private async isPathInsideRoot(pathToCheck: string): Promise<boolean> {
    try {
      const [resolvedPath, resolvedRoot] = await Promise.all([
        this.fs.realpath(pathToCheck),
        this.getResolvedRoot(),
      ]);
      return isPathWithinRoot(resolvedPath, resolvedRoot);
    } catch {
      return false;
    }
  }

  private getResolvedRoot(): Promise<string> {
    if (!this.resolvedRootPromise) {
      this.resolvedRootPromise = this.fs.realpath(this.root);
    }
    return this.resolvedRootPromise;
  }
}

/**
 * Decode request URL to a filesystem-safe path.
 * Returns null if the URL is malformed.
 */
function decodeRequestPath(url: string): string | null {
  try {
    // Strip query string and fragment
    const pathPart = url.split("?")[0].split("#")[0];

    // Decode percent-encoded chars
    const decoded = decodeURIComponent(pathPart);

    // Normalize: collapse double slashes, resolve . and ..
    const segments = decoded.split("/").filter(Boolean);
    const resolved: string[] = [];
    for (const seg of segments) {
      if (seg === ".") continue;
      if (seg === "..") {
        resolved.pop();
        continue;
      }
      resolved.push(seg);
    }

    return `/${resolved.join("/")}`;
  } catch {
    return null;
  }
}

function normalizeConfiguredRoot(root: string): string {
  const slashNormalized = root.replace(/\\/g, "/");
  if (/^[A-Za-z]:\/?$/.test(slashNormalized)) {
    return slashNormalized.endsWith("/")
      ? slashNormalized
      : `${slashNormalized}/`;
  }
  const trimmed = slashNormalized.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

function joinRootAndUrlPath(root: string, urlPath: string): string {
  const suffix = urlPath.replace(/^\/+/, "");
  if (root === "/") {
    return `/${suffix}`;
  }
  if (root.endsWith("/")) {
    return `${root}${suffix}`;
  }
  return `${root}/${suffix}`;
}

function parentPathOf(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  if (normalized === "/") return "/";
  const idx = normalized.lastIndexOf("/");
  if (idx <= 0) return "/";
  return normalized.slice(0, idx);
}

function normalizePathForComparison(path: string): string {
  const slashNormalized = path.replace(/\\/g, "/");
  if (slashNormalized === "/") {
    return "/";
  }
  return slashNormalized.replace(/\/+$/, "");
}

function isPathWithinRoot(path: string, root: string): boolean {
  const normalizedPath = normalizePathForComparison(path);
  const normalizedRoot = normalizePathForComparison(root);
  if (normalizedRoot === "/") {
    return normalizedPath.startsWith("/");
  }
  return (
    normalizedPath === normalizedRoot ||
    normalizedPath.startsWith(`${normalizedRoot}/`)
  );
}

function parseRangeHeader(
  rangeHeader: string | undefined,
  fileSize: number,
): RangeParseResult {
  if (!rangeHeader) {
    return { kind: "none" };
  }

  const trimmed = rangeHeader.trim();
  if (!trimmed.toLowerCase().startsWith("bytes=")) {
    return { kind: "none" };
  }

  const rangeValue = trimmed.slice("bytes=".length).trim();
  if (rangeValue === "" || rangeValue.includes(",")) {
    return { kind: "none" };
  }

  const dash = rangeValue.indexOf("-");
  if (dash === -1) {
    return { kind: "none" };
  }

  const startRaw = rangeValue.slice(0, dash).trim();
  const endRaw = rangeValue.slice(dash + 1).trim();

  if (startRaw === "" && endRaw === "") {
    return { kind: "none" };
  }

  if (startRaw === "") {
    const suffixLength = Number.parseInt(endRaw, 10);
    if (Number.isNaN(suffixLength) || suffixLength <= 0 || fileSize === 0) {
      return { kind: "unsatisfiable" };
    }

    const start = Math.max(fileSize - suffixLength, 0);
    return { kind: "ok", start, end: fileSize - 1 };
  }

  const start = Number.parseInt(startRaw, 10);
  if (Number.isNaN(start) || start < 0) {
    return { kind: "none" };
  }
  if (start >= fileSize) {
    return { kind: "unsatisfiable" };
  }

  if (endRaw === "") {
    return { kind: "ok", start, end: fileSize - 1 };
  }

  const end = Number.parseInt(endRaw, 10);
  if (Number.isNaN(end) || end < 0) {
    return { kind: "none" };
  }
  if (start > end) {
    return { kind: "unsatisfiable" };
  }

  return { kind: "ok", start, end: Math.min(end, fileSize - 1) };
}
