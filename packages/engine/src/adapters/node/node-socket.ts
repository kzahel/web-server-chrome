import * as net from "node:net";
import * as tls from "node:tls";
import type { TlsOptions } from "../../interfaces/certificate.js";
import type {
  ISocketFactory,
  ITcpServer,
  ITcpSocket,
  TcpSocketOptions,
} from "../../interfaces/socket.js";

export class NodeTcpSocket implements ITcpSocket {
  private socket: net.Socket | tls.TLSSocket;
  private _isSecure = false;

  private dataCallbacks: Array<(data: Uint8Array) => void> = [];
  private closeCallbacks: Array<(hadError: boolean) => void> = [];
  private errorCallbacks: Array<(err: Error) => void> = [];

  constructor(socket?: net.Socket | tls.TLSSocket) {
    this.socket = socket || new net.Socket();
    if (socket instanceof tls.TLSSocket) {
      this._isSecure = true;
    }
  }

  get remoteAddress(): string | undefined {
    return this.socket.remoteAddress;
  }

  get remotePort(): number | undefined {
    return this.socket.remotePort;
  }

  get isSecure(): boolean {
    return this._isSecure;
  }

  connect(port: number, host: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket.connect(port, host, () => {
        resolve();
      });

      this.socket.once("error", (err) => {
        reject(err);
      });
    });
  }

  send(data: Uint8Array): void {
    if (this.socket.destroyed || !this.socket.writable) {
      return;
    }
    try {
      this.socket.write(data);
    } catch {
      // Socket write failed — connection likely closing
    }
  }

  sendAndWait(data: Uint8Array): Promise<void> {
    if (this.socket.destroyed || !this.socket.writable) {
      return Promise.reject(new Error("Socket is not writable"));
    }

    return new Promise((resolve, reject) => {
      let settled = false;

      const done = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };

      const fail = (err: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(err);
      };

      const onDrain = () => done();
      const onClose = () => fail(new Error("Socket closed during write"));
      const onError = (err: Error) => fail(err);

      const cleanup = () => {
        this.socket.off("drain", onDrain);
        this.socket.off("close", onClose);
        this.socket.off("error", onError);
      };

      this.socket.once("close", onClose);
      this.socket.once("error", onError);

      try {
        const accepted = this.socket.write(data);
        if (accepted) {
          done();
        } else {
          this.socket.once("drain", onDrain);
        }
      } catch (err) {
        fail(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  onData(cb: (data: Uint8Array) => void): void {
    this.dataCallbacks.push(cb);
    this.socket.on("data", (data) => {
      cb(new Uint8Array(data));
    });
  }

  onClose(cb: (hadError: boolean) => void): void {
    this.closeCallbacks.push(cb);
    this.socket.on("close", cb);
  }

  onError(cb: (err: Error) => void): void {
    this.errorCallbacks.push(cb);
    this.socket.on("error", cb);
  }

  close(): void {
    this.socket.destroy();
  }

  async secure(
    hostname: string,
    options?: { skipValidation?: boolean },
  ): Promise<void> {
    if (this._isSecure) {
      throw new Error("Socket is already secure");
    }

    const plainSocket = this.socket as net.Socket;

    return new Promise((resolve, reject) => {
      const tlsOptions: tls.ConnectionOptions = {
        socket: plainSocket,
        servername: hostname,
        rejectUnauthorized: !options?.skipValidation,
      };

      const tlsSocket = tls.connect(tlsOptions, () => {
        this._isSecure = true;

        plainSocket.removeAllListeners("data");
        plainSocket.removeAllListeners("close");
        plainSocket.removeAllListeners("error");

        for (const cb of this.dataCallbacks) {
          tlsSocket.on("data", (data) =>
            cb(
              new Uint8Array(
                typeof data === "string" ? Buffer.from(data) : data,
              ),
            ),
          );
        }
        for (const cb of this.closeCallbacks) {
          tlsSocket.on("close", cb);
        }
        for (const cb of this.errorCallbacks) {
          tlsSocket.on("error", cb);
        }

        this.socket = tlsSocket;
        resolve();
      });

      tlsSocket.once("error", (err) => {
        reject(err);
      });
    });
  }
}

export class NodeTcpServer implements ITcpServer {
  private server: net.Server;
  private isTls: boolean;

  constructor(tlsOptions?: TlsOptions) {
    if (tlsOptions) {
      this.server = tls.createServer({
        cert: Buffer.from(tlsOptions.cert),
        key: Buffer.from(tlsOptions.key),
      });
      this.isTls = true;
    } else {
      this.server = net.createServer();
      this.isTls = false;
    }
  }

  listen(port: number, host?: string, callback?: () => void): void {
    this.server.listen(port, host, callback);
  }

  address(): { port: number } | null {
    const addr = this.server.address();
    if (addr && typeof addr === "object" && "port" in addr) {
      return { port: addr.port };
    }
    return null;
  }

  on(event: "connection", cb: (socket: unknown) => void): void;
  on(event: "error", cb: (err: Error) => void): void;
  on(
    event: "connection" | "error",
    cb: ((socket: unknown) => void) | ((err: Error) => void),
  ): void {
    if (event === "connection") {
      // tls.Server emits "secureConnection" for completed TLS handshakes
      const eventName = this.isTls ? "secureConnection" : "connection";
      this.server.on(eventName, cb as (socket: net.Socket) => void);
      return;
    }
    this.server.on("error", cb as (err: Error) => void);
  }

  close(callback?: () => void): void {
    this.server.close(callback);
  }
}

export class NodeSocketFactory implements ISocketFactory {
  async createTcpSocket(options?: TcpSocketOptions): Promise<ITcpSocket> {
    const socket = new NodeTcpSocket();
    if (options?.host && options?.port) {
      await socket.connect(options.port, options.host);
    }
    return socket;
  }

  createTcpServer(tlsOptions?: TlsOptions): ITcpServer {
    return new NodeTcpServer(tlsOptions);
  }

  wrapTcpSocket(socket: unknown): ITcpSocket {
    if (!(socket instanceof net.Socket) && !(socket instanceof tls.TLSSocket)) {
      throw new Error("Expected a Node net.Socket or tls.TLSSocket");
    }
    return new NodeTcpSocket(socket);
  }
}
