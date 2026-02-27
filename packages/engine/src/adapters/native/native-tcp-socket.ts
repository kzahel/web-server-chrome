/**
 * Native TCP socket adapter for accepted connections (QuickJS/Android).
 */

import type { ITcpSocket } from "../../interfaces/socket.js";

export class NativeTcpSocket implements ITcpSocket {
  private dataCallback?: (data: Uint8Array) => void;
  private closeCallback?: (hadError: boolean) => void;
  private errorCallback?: (err: Error) => void;
  private closed = false;

  remoteAddress?: string;
  remotePort?: number;

  constructor(
    private readonly socketId: number,
    remoteAddr?: string,
    remotePort?: number,
  ) {
    this.remoteAddress = remoteAddr;
    this.remotePort = remotePort;
  }

  send(data: Uint8Array): void {
    if (this.closed) return;
    // Extract the exact byte range — data.buffer may be larger than the view
    // (e.g. when data is a subarray of a larger buffer)
    const buffer =
      data.byteOffset === 0 && data.byteLength === data.buffer.byteLength
        ? data.buffer
        : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    __ok200_tcp_send(String(this.socketId), buffer as ArrayBuffer);
  }

  async sendAndWait(data: Uint8Array): Promise<void> {
    this.send(data);
  }

  onData(cb: (data: Uint8Array) => void): void {
    this.dataCallback = cb;
  }

  onClose(cb: (hadError: boolean) => void): void {
    this.closeCallback = cb;
  }

  onError(cb: (err: Error) => void): void {
    this.errorCallback = cb;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    __ok200_tcp_close(String(this.socketId));
  }

  /** Called by the socket factory when data arrives from the native layer. */
  _onData(data: ArrayBuffer): void {
    this.dataCallback?.(new Uint8Array(data));
  }

  /** Called by the socket factory when the connection closes. */
  _onClose(hadError: boolean): void {
    this.closed = true;
    this.closeCallback?.(hadError);
  }

  /** Called by the socket factory when an error occurs. */
  _onError(message: string): void {
    this.errorCallback?.(new Error(message));
  }
}
