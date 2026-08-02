import { afterEach, describe, expect, it, vi } from "vitest";
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
          protocolVersion: 1,
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
          protocolVersion: 1,
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
          protocolVersion: 1,
          version: "0.1.5",
        },
        "fixture-1",
      ),
    ).toThrow("not the expected 200 OK controller");
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

    await expect(client.startServer("token")).rejects.toThrow(
      "stop serving first",
    );
  });
});
