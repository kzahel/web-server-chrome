import { describe, expect, it } from "vitest";
import { defaultConfig } from "../config/server-config.js";
import { WebServer } from "../server/web-server.js";
import { InMemoryFileSystem } from "../testing/in-memory-filesystem.js";
import { InMemorySocketFactory } from "../testing/in-memory-socket-factory.js";
import { decodeToString, fromString } from "../utils/buffer.js";
import { createApiInterceptor } from "./api-handler.js";
import { ServerRegistry } from "./server-registry.js";

interface ParsedResponse {
  status: number;
  headers: Map<string, string>;
  body: string;
}

function parseResponse(raw: Uint8Array): ParsedResponse {
  const text = decodeToString(raw);
  const splitAt = text.indexOf("\r\n\r\n");
  if (splitAt === -1) {
    throw new Error("Invalid HTTP response: missing header separator");
  }

  const headerPart = text.slice(0, splitAt);
  const bodyPart = text.slice(splitAt + 4);
  const lines = headerPart.split("\r\n");
  const statusLine = lines[0];
  const status = Number.parseInt(statusLine.split(" ")[1] ?? "", 10);

  const headers = new Map<string, string>();
  for (let i = 1; i < lines.length; i++) {
    const colon = lines[i].indexOf(":");
    if (colon === -1) continue;
    const key = lines[i].slice(0, colon).trim().toLowerCase();
    const value = lines[i].slice(colon + 1).trim();
    headers.set(key, value);
  }

  return { status, headers, body: bodyPart };
}

async function withApiServer(
  testBody: (ctx: {
    request: (rawHttp: string) => Promise<ParsedResponse>;
    registry: ServerRegistry;
  }) => Promise<void>,
  options?: {
    authToken?: string;
    uiAssets?: {
      getFile: (
        path: string,
      ) => { data: Uint8Array; mimeType: string } | undefined;
    };
  },
): Promise<void> {
  const socketFactory = new InMemorySocketFactory();
  const fileSystem = new InMemoryFileSystem();
  const registry = new ServerRegistry();
  registry.register("default", defaultConfig("/tmp/test"));
  registry.setStatus("default", "running", 8080);

  const getServer = (id: string) => {
    const server = registry.getServer(id);
    if (!server) throw new Error(`Server not found: ${id}`);
    return server;
  };

  const interceptor = createApiInterceptor({
    registry,
    authToken: options?.authToken,
    uiAssets: options?.uiAssets,
    fileSystem,
    onStartServer: async (id) => {
      registry.setStatus(id, "running", 8080);
      return getServer(id);
    },
    onStopServer: async (id) => {
      registry.setStatus(id, "stopped");
      return getServer(id);
    },
    onUpdateConfig: async (id, config) => {
      registry.updateConfig(id, config);
      return getServer(id);
    },
  });

  // Create a file so non-API requests have something to serve
  await fileSystem.writeFile(
    "/tmp/test/hello.txt",
    fromString("Hello, world!"),
  );

  const server = new WebServer({
    socketFactory,
    fileSystem,
    config: {
      ...defaultConfig("/tmp/test"),
      quiet: true,
      port: 0,
    },
    requestInterceptor: interceptor,
  });

  await server.start();

  try {
    await testBody({
      request: async (rawHttp: string) =>
        parseResponse(await socketFactory.request(rawHttp)),
      registry,
    });
  } finally {
    await server.stop();
  }
}

describe("ApiHandler", () => {
  it("GET /_api/servers returns server list", async () => {
    await withApiServer(async ({ request }) => {
      const res = await request(
        "GET /_api/servers HTTP/1.1\r\nHost: local\r\nConnection: close\r\n\r\n",
      );
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("application/json");

      const servers = JSON.parse(res.body);
      expect(servers).toHaveLength(1);
      expect(servers[0].id).toBe("default");
      expect(servers[0].status).toBe("running");
    });
  });

  it("GET /_api/servers/:id returns single server", async () => {
    await withApiServer(async ({ request }) => {
      const res = await request(
        "GET /_api/servers/default HTTP/1.1\r\nHost: local\r\nConnection: close\r\n\r\n",
      );
      expect(res.status).toBe(200);
      const server = JSON.parse(res.body);
      expect(server.id).toBe("default");
      expect(server.config.root).toBe("/tmp/test");
    });
  });

  it("GET /_api/servers/:id returns 404 for unknown id", async () => {
    await withApiServer(async ({ request }) => {
      const res = await request(
        "GET /_api/servers/unknown HTTP/1.1\r\nHost: local\r\nConnection: close\r\n\r\n",
      );
      expect(res.status).toBe(404);
    });
  });

  it("POST /_api/servers/:id/start starts the server", async () => {
    await withApiServer(async ({ request, registry }) => {
      registry.setStatus("default", "stopped");

      const res = await request(
        "POST /_api/servers/default/start HTTP/1.1\r\nHost: local\r\nConnection: close\r\n\r\n",
      );
      expect(res.status).toBe(200);
      const server = JSON.parse(res.body);
      expect(server.status).toBe("running");
    });
  });

  it("POST /_api/servers/:id/stop stops the server", async () => {
    await withApiServer(async ({ request }) => {
      const res = await request(
        "POST /_api/servers/default/stop HTTP/1.1\r\nHost: local\r\nConnection: close\r\n\r\n",
      );
      expect(res.status).toBe(200);
      const server = JSON.parse(res.body);
      expect(server.status).toBe("stopped");
    });
  });

  it("PUT /_api/servers/:id updates config", async () => {
    await withApiServer(async ({ request, registry }) => {
      const body = JSON.stringify({ port: 3000, cors: true });
      const res = await request(
        `PUT /_api/servers/default HTTP/1.1\r\nHost: local\r\nConnection: close\r\nContent-Length: ${body.length}\r\n\r\n${body}`,
      );
      expect(res.status).toBe(200);
      const server = JSON.parse(res.body);
      expect(server.config.port).toBe(3000);
      expect(server.config.cors).toBe(true);

      // Verify registry was updated
      const entry = registry.getServer("default");
      expect(entry?.config.port).toBe(3000);
    });
  });

  it("non-API requests fall through to static server", async () => {
    await withApiServer(async ({ request }) => {
      const res = await request(
        "GET /hello.txt HTTP/1.1\r\nHost: local\r\nConnection: close\r\n\r\n",
      );
      expect(res.status).toBe(200);
      expect(res.body).toBe("Hello, world!");
    });
  });

  it("unknown /_api/ path returns 404", async () => {
    await withApiServer(async ({ request }) => {
      const res = await request(
        "GET /_api/unknown HTTP/1.1\r\nHost: local\r\nConnection: close\r\n\r\n",
      );
      expect(res.status).toBe(404);
      expect(res.headers.get("content-type")).toContain("application/json");
    });
  });

  it("serves UI assets at /_api/ui/", async () => {
    const indexHtml = fromString("<h1>200 OK</h1>");
    const uiAssets = {
      getFile(path: string) {
        if (path === "index.html") {
          return { data: indexHtml, mimeType: "text/html; charset=utf-8" };
        }
        return undefined;
      },
    };

    await withApiServer(
      async ({ request }) => {
        const res = await request(
          "GET /_api/ui/ HTTP/1.1\r\nHost: local\r\nConnection: close\r\n\r\n",
        );
        expect(res.status).toBe(200);
        expect(res.body).toBe("<h1>200 OK</h1>");
        expect(res.headers.get("content-type")).toContain("text/html");
      },
      { uiAssets },
    );
  });

  it("redirects /_api/ui to /_api/ui/", async () => {
    const uiAssets = {
      getFile() {
        return { data: fromString(""), mimeType: "text/html" };
      },
    };

    await withApiServer(
      async ({ request }) => {
        const res = await request(
          "GET /_api/ui HTTP/1.1\r\nHost: local\r\nConnection: close\r\n\r\n",
        );
        expect(res.status).toBe(301);
        expect(res.headers.get("location")).toBe("/_api/ui/");
      },
      { uiAssets },
    );
  });

  it("returns 404 when UI assets are not available", async () => {
    await withApiServer(async ({ request }) => {
      const res = await request(
        "GET /_api/ui/ HTTP/1.1\r\nHost: local\r\nConnection: close\r\n\r\n",
      );
      expect(res.status).toBe(404);
    });
  });
});

describe("ApiHandler auth", () => {
  it("no authToken configured allows all requests", async () => {
    await withApiServer(async ({ request }) => {
      const res = await request(
        "GET /_api/servers HTTP/1.1\r\nHost: local\r\nConnection: close\r\n\r\n",
      );
      expect(res.status).toBe(200);
    });
  });

  it("with authToken, non-localhost requests without token get 401", async () => {
    // In-memory sockets have remoteAddress="in-memory" which is not localhost
    await withApiServer(
      async ({ request }) => {
        const res = await request(
          "GET /_api/servers HTTP/1.1\r\nHost: local\r\nConnection: close\r\n\r\n",
        );
        expect(res.status).toBe(401);
      },
      { authToken: "secret-token" },
    );
  });

  it("with authToken, Bearer token grants access", async () => {
    await withApiServer(
      async ({ request }) => {
        const res = await request(
          "GET /_api/servers HTTP/1.1\r\nHost: local\r\nConnection: close\r\nAuthorization: Bearer secret-token\r\n\r\n",
        );
        expect(res.status).toBe(200);
      },
      { authToken: "secret-token" },
    );
  });

  it("with authToken, query param token grants access", async () => {
    await withApiServer(
      async ({ request }) => {
        const res = await request(
          "GET /_api/servers?token=secret-token HTTP/1.1\r\nHost: local\r\nConnection: close\r\n\r\n",
        );
        expect(res.status).toBe(200);
      },
      { authToken: "secret-token" },
    );
  });

  it("with authToken, wrong token gets 401", async () => {
    await withApiServer(
      async ({ request }) => {
        const res = await request(
          "GET /_api/servers HTTP/1.1\r\nHost: local\r\nConnection: close\r\nAuthorization: Bearer wrong-token\r\n\r\n",
        );
        expect(res.status).toBe(401);
      },
      { authToken: "secret-token" },
    );
  });
});
