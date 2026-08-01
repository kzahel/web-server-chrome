/**
 * Abstract Socket Interfaces
 *
 * Extracted from jstorrent. These interfaces decouple the server engine
 * from any specific runtime (Node, Bun, or another JavaScript host).
 */

import type { TlsOptions } from "./certificate.js";

export interface ITcpSocket {
  /** Send data to the remote peer. */
  send(data: Uint8Array): void;

  /**
   * Send data and resolve when it has been accepted without backpressure.
   * Implementations can use this to expose drain-aware writes for streaming.
   */
  sendAndWait?(data: Uint8Array): Promise<void>;

  /** Register a callback for incoming data. */
  onData(cb: (data: Uint8Array) => void): void;

  /** Register a callback for connection close. */
  onClose(cb: (hadError: boolean) => void): void;

  /** Register a callback for errors. */
  onError(cb: (err: Error) => void): void;

  /** Close the connection. */
  close(): void;

  /** Remote peer address. */
  remoteAddress?: string;

  /** Remote peer port. */
  remotePort?: number;

  /** Whether this socket is using TLS. */
  isSecure?: boolean;

  /**
   * Upgrade this socket to TLS.
   * @param hostname - Server hostname for SNI
   * @param options - TLS options
   */
  secure?(
    hostname: string,
    options?: { skipValidation?: boolean },
  ): Promise<void>;

  /**
   * Connect to a remote peer.
   */
  connect?(port: number, host: string): Promise<void>;
}

export interface ITcpServer {
  /** Start listening on the specified port and optional host. */
  listen(port: number, host?: string, callback?: () => void): void;

  /** Get the address the server is listening on. */
  address(): { port: number } | null;

  /** Register a callback for incoming connections. */
  on(event: "connection", cb: (socket: unknown) => void): void;

  /** Register a callback for server errors. */
  on(event: "error", cb: (err: Error) => void): void;

  /** Close the server. */
  close(callback?: () => void): void;
}

export interface TcpSocketOptions {
  host?: string;
  port?: number;
}

export interface ISocketFactory {
  /** Create a new TCP socket. */
  createTcpSocket(options?: TcpSocketOptions): Promise<ITcpSocket>;

  /** Create a TCP server. When tlsOptions is provided, create a TLS server. */
  createTcpServer(tlsOptions?: TlsOptions): ITcpServer;

  /** Wrap a native socket into ITcpSocket. */
  wrapTcpSocket(socket: unknown): ITcpSocket;
}
