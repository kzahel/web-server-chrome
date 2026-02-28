import { type ChildProcess, spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const CLI_PATH = new URL("../../dist/cli.js", import.meta.url).pathname;
const describeSocket =
  process.env.OK200_SOCKET_TESTS === "1" ? describe : describe.skip;

interface ServerHandle {
  proc: ChildProcess;
  port: number;
  output: string;
}

const procs = new Set<ChildProcess>();

function startServer(root: string, args: string[] = []): Promise<ServerHandle> {
  return new Promise((resolve, reject) => {
    const proc = spawn("node", [CLI_PATH, root, "--port", "0", ...args], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    procs.add(proc);
    proc.on("close", () => procs.delete(proc));

    const handle: ServerHandle = { proc, port: 0, output: "" };

    proc.stdout?.on("data", (chunk: Buffer) => {
      handle.output += chunk.toString();
      const match = handle.output.match(/Local:\s+http:\/\/[^:]+:(\d+)/);
      if (match) {
        handle.port = Number.parseInt(match[1], 10);
        resolve(handle);
      }
    });

    proc.stderr?.on("data", (chunk: Buffer) => {
      handle.output += chunk.toString();
    });

    proc.on("error", reject);
    setTimeout(() => reject(new Error("Server did not start in time")), 10000);
  });
}

async function stopServer(handle: ServerHandle): Promise<void> {
  handle.proc.kill("SIGINT");
  await new Promise<void>((resolve) => {
    handle.proc.on("close", () => resolve());
    setTimeout(resolve, 5000);
  });
}

let tmpDir: string;

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ok200-e2e-"));
  await fs.writeFile(path.join(tmpDir, "index.html"), "<h1>Home</h1>");
  await fs.writeFile(path.join(tmpDir, "hello.txt"), "Hello, world!");
  await fs.mkdir(path.join(tmpDir, "sub"), { recursive: true });
  await fs.writeFile(path.join(tmpDir, "sub", "nested.txt"), "nested content");
});

afterAll(async () => {
  for (const proc of procs) {
    proc.kill("SIGKILL");
  }
  procs.clear();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describeSocket("ok200 CLI e2e", () => {
  it("serves a file with correct content-type", async () => {
    const s = await startServer(tmpDir, ["-q"]);
    try {
      const res = await fetch(`http://127.0.0.1:${s.port}/hello.txt`);
      expect(res.status).toBe(200);
      expect(await res.text()).toBe("Hello, world!");
      expect(res.headers.get("content-type")).toContain("text/plain");
    } finally {
      await stopServer(s);
    }
  });

  it("serves index.html for directory", async () => {
    const s = await startServer(tmpDir, ["-q"]);
    try {
      const res = await fetch(`http://127.0.0.1:${s.port}/`);
      expect(res.status).toBe(200);
      expect(await res.text()).toBe("<h1>Home</h1>");
    } finally {
      await stopServer(s);
    }
  });

  it("returns directory listing when no index.html", async () => {
    const noIndexDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "ok200-e2e-noindex-"),
    );
    await fs.writeFile(path.join(noIndexDir, "file-a.txt"), "a");
    await fs.writeFile(path.join(noIndexDir, "file-b.txt"), "b");

    const s = await startServer(noIndexDir, ["-q"]);
    try {
      const res = await fetch(`http://127.0.0.1:${s.port}/`);
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toContain("file-a.txt");
      expect(body).toContain("file-b.txt");
    } finally {
      await stopServer(s);
      await fs.rm(noIndexDir, { recursive: true, force: true });
    }
  });

  it("returns 404 for missing file", async () => {
    const s = await startServer(tmpDir, ["-q"]);
    try {
      const res = await fetch(`http://127.0.0.1:${s.port}/nonexistent.txt`);
      expect(res.status).toBe(404);
    } finally {
      await stopServer(s);
    }
  });

  it("blocks path traversal", async () => {
    const s = await startServer(tmpDir, ["-q"]);
    try {
      const response = await new Promise<string>((resolve) => {
        const sock = net.createConnection(s.port, "127.0.0.1", () => {
          sock.write(
            "GET /../../etc/passwd HTTP/1.1\r\nHost: localhost\r\n\r\n",
          );
        });
        let data = "";
        sock.on("data", (chunk) => {
          data += chunk.toString();
        });
        sock.on("end", () => resolve(data));
      });
      expect(response).not.toContain("root:");
      expect(response).toMatch(/^HTTP\/1\.1 (200|404)/);
    } finally {
      await stopServer(s);
    }
  });
});

describeSocket("ok200 CLI --cors", () => {
  it("adds CORS headers", async () => {
    const s = await startServer(tmpDir, ["-q", "--cors"]);
    try {
      const res = await fetch(`http://127.0.0.1:${s.port}/hello.txt`);
      expect(res.headers.get("access-control-allow-origin")).toBe("*");
    } finally {
      await stopServer(s);
    }
  });
});

describeSocket("ok200 CLI --spa", () => {
  it("rewrites missing paths to index.html", async () => {
    const s = await startServer(tmpDir, ["-q", "--spa"]);
    try {
      const res = await fetch(`http://127.0.0.1:${s.port}/some/route`);
      expect(res.status).toBe(200);
      expect(await res.text()).toBe("<h1>Home</h1>");
    } finally {
      await stopServer(s);
    }
  });
});

describeSocket("ok200 CLI --upload", () => {
  it("accepts PUT uploads and serves uploaded files", async () => {
    const s = await startServer(tmpDir, ["-q", "--upload"]);
    try {
      const upload = await fetch(`http://127.0.0.1:${s.port}/uploaded.txt`, {
        method: "PUT",
        body: "uploaded body",
      });
      expect(upload.status).toBe(201);

      const downloaded = await fetch(`http://127.0.0.1:${s.port}/uploaded.txt`);
      expect(downloaded.status).toBe(200);
      expect(await downloaded.text()).toBe("uploaded body");
    } finally {
      await stopServer(s);
    }
  });
});

describeSocket("ok200 CLI shutdown", () => {
  it("terminates on SIGTERM", async () => {
    const s = await startServer(tmpDir, ["-q"]);

    // Verify server is alive
    const res = await fetch(`http://127.0.0.1:${s.port}/hello.txt`);
    expect(res.status).toBe(200);

    // Send SIGTERM and wait for process to exit
    const closed = new Promise<void>((resolve) => {
      s.proc.on("close", () => resolve());
    });
    s.proc.kill("SIGTERM");
    await closed;

    // Verify server is no longer accepting connections
    await expect(
      fetch(`http://127.0.0.1:${s.port}/hello.txt`),
    ).rejects.toThrow();
  });
});
