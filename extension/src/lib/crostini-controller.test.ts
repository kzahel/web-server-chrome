import { afterEach, describe, expect, it, vi } from "vitest";
import compatibilityCorpus from "../../../tests/compatibility/corpus-v1.json";
import {
  CrostiniControllerClient,
  controllerTokenKey,
  validateControllerHealth,
} from "./crostini-controller";

describe("Crostini controller client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("binds the browser fetch receiver used by ChromeOS", async () => {
    let receiver: unknown;
    vi.stubGlobal("fetch", function (this: unknown) {
      receiver = this;
      return Promise.resolve(
        Response.json({
          claimed: false,
          instanceId: "fixture-1",
          product: "ok200-crostini-controller",
          protocolVersion: 2,
          version: "0.1.5",
        }),
      );
    } as typeof fetch);

    await new CrostiniControllerClient(20080).health();

    expect(receiver).toBe(globalThis);
  });

  it("sends the controller token only to the fixed controller origin", async () => {
    const fetchMock = vi.fn(
      async (
        _input: RequestInfo | URL,
        _options?: RequestInit & { targetAddressSpace?: string },
      ) =>
        Response.json({
          product: "ok200-crostini-controller",
          protocolVersion: 2,
          instanceId: "fixture-1",
          version: "0.1.5",
          settings: {},
          server: { state: "stopped" },
        }),
    );
    const client = new CrostiniControllerClient(
      20080,
      fetchMock as typeof fetch,
    );

    await client.status("secret-token");

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("http://penguin.linux.test:20080/api/status");
    expect((options?.headers as Headers).get("Authorization")).toBe(
      "Bearer secret-token",
    );
    expect(options?.targetAddressSpace).toBe("local");
  });

  it("uses a per-controller local token key", () => {
    expect(controllerTokenKey("fixture-1")).toBe(
      "ok200-crostini-token:fixture-1",
    );
  });

  it("rejects a mismatched controller health response", () => {
    expect(() =>
      validateControllerHealth(
        {
          claimed: true,
          instanceId: "someone-else",
          product: "ok200-crostini-controller",
          protocolVersion: 2,
          version: "0.1.5",
        },
        "fixture-1",
      ),
    ).toThrow("different 200 OK controller");
  });

  it.each(
    compatibilityCorpus.crostiniController.cases,
  )("runs frozen health fixture $id", (fixture) => {
    const validate = () =>
      validateControllerHealth(fixture.health, "fixture-1");
    if (fixture.accept) {
      expect(validate).not.toThrow();
    } else {
      expect(validate).toThrow(fixture.errorContains);
    }
  });

  it("surfaces a controller JSON error", async () => {
    const client = new CrostiniControllerClient(
      20080,
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: "stop serving first" }), {
            status: 409,
            headers: { "Content-Type": "application/json" },
          }),
      ) as typeof fetch,
    );

    await expect(client.startServer("token", "session-1")).rejects.toThrow(
      "stop serving first",
    );
  });

  it("uses authenticated POST requests for update checks and installs", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _options?: RequestInit) =>
        Response.json({
          product: "ok200-crostini-controller",
          protocolVersion: 2,
          instanceId: "fixture-1",
          version: "0.1.0",
          settings: { automaticUpdates: false },
          server: { state: "stopped" },
          update: { state: "current" },
        }),
    );
    const client = new CrostiniControllerClient(
      20080,
      fetchMock as typeof fetch,
    );

    await client.checkUpdate("secret-token");
    await client.installUpdate("secret-token");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "http://penguin.linux.test:20080/api/update/check",
    );
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "http://penguin.linux.test:20080/api/update/install",
    );
    for (const [, options] of fetchMock.mock.calls) {
      expect(options?.method).toBe("POST");
      expect((options?.headers as Headers).get("Authorization")).toBe(
        "Bearer secret-token",
      );
    }
  });

  it("uses authenticated session and folder capabilities", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _options?: RequestInit) =>
        Response.json({}),
    );
    const client = new CrostiniControllerClient(
      20080,
      fetchMock as typeof fetch,
    );

    await client.openSession("secret-token");
    await client.heartbeatSession("secret-token", "session-1");
    await client.folderRoots("secret-token");
    await client.listFolders("secret-token", "linux-files", ["Downloads"]);
    await client.createFolder(
      "secret-token",
      "linux-files",
      ["Downloads"],
      "Sites",
    );
    await client.selectFolder("secret-token", "linux-files", [
      "Downloads",
      "Sites",
    ]);
    await client.startServer("secret-token", "session-1");
    await client.closeSession("secret-token", "session-1", true);

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "http://penguin.linux.test:20080/api/session/open",
      "http://penguin.linux.test:20080/api/session/heartbeat",
      "http://penguin.linux.test:20080/api/folders/roots",
      "http://penguin.linux.test:20080/api/folders/list",
      "http://penguin.linux.test:20080/api/folders/create",
      "http://penguin.linux.test:20080/api/folders/select",
      "http://penguin.linux.test:20080/api/server/start",
      "http://penguin.linux.test:20080/api/session/close",
    ]);
    expect(fetchMock.mock.calls[4]?.[1]?.body).toBe(
      JSON.stringify({
        rootId: "linux-files",
        path: ["Downloads"],
        name: "Sites",
      }),
    );
    expect(fetchMock.mock.calls[6]?.[1]?.body).toBe(
      JSON.stringify({ sessionId: "session-1" }),
    );
    expect(fetchMock.mock.calls[7]?.[1]?.keepalive).toBe(true);
    for (const [, options] of fetchMock.mock.calls) {
      expect((options?.headers as Headers).get("Authorization")).toBe(
        "Bearer secret-token",
      );
    }
  });
});
