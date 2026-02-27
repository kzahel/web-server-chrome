import { describe, expect, it } from "vitest";
import { defaultConfig } from "../config/server-config.js";
import { ServerRegistry } from "./server-registry.js";

describe("ServerRegistry", () => {
  it("registers a server with stopped status", () => {
    const registry = new ServerRegistry();
    registry.register("s1", defaultConfig("/tmp/test"));

    const server = registry.getServer("s1");
    expect(server).toBeDefined();
    expect(server?.id).toBe("s1");
    expect(server?.status).toBe("stopped");
    expect(server?.config.root).toBe("/tmp/test");
    expect(server?.config.port).toBe(8080);
  });

  it("returns undefined for unknown server", () => {
    const registry = new ServerRegistry();
    expect(registry.getServer("unknown")).toBeUndefined();
  });

  it("lists all registered servers", () => {
    const registry = new ServerRegistry();
    registry.register("s1", defaultConfig("/a"));
    registry.register("s2", defaultConfig("/b"));

    const servers = registry.listServers();
    expect(servers).toHaveLength(2);
    expect(servers.map((s) => s.id)).toContain("s1");
    expect(servers.map((s) => s.id)).toContain("s2");
  });

  it("updates status and actualPort", () => {
    const registry = new ServerRegistry();
    registry.register("s1", defaultConfig("/tmp"));

    registry.setStatus("s1", "running", 9090);
    const server = registry.getServer("s1");
    expect(server?.status).toBe("running");
    expect(server?.actualPort).toBe(9090);
  });

  it("sets error status", () => {
    const registry = new ServerRegistry();
    registry.register("s1", defaultConfig("/tmp"));

    registry.setError("s1", "Port in use");
    const server = registry.getServer("s1");
    expect(server?.status).toBe("error");
    expect(server?.error).toBe("Port in use");
  });

  it("clears error when status changes to non-error", () => {
    const registry = new ServerRegistry();
    registry.register("s1", defaultConfig("/tmp"));

    registry.setError("s1", "Port in use");
    registry.setStatus("s1", "running", 8080);
    const server = registry.getServer("s1");
    expect(server?.status).toBe("running");
    expect(server?.error).toBeUndefined();
  });

  it("updates config with partial merge", () => {
    const registry = new ServerRegistry();
    registry.register("s1", defaultConfig("/tmp"));

    const updated = registry.updateConfig("s1", { port: 3000, cors: true });
    expect(updated.port).toBe(3000);
    expect(updated.cors).toBe(true);
    expect(updated.root).toBe("/tmp"); // unchanged

    const server = registry.getServer("s1");
    expect(server?.config.port).toBe(3000);
  });

  it("throws on operations with unknown server id", () => {
    const registry = new ServerRegistry();
    expect(() => registry.setStatus("bad", "running")).toThrow(
      "Unknown server: bad",
    );
    expect(() => registry.setError("bad", "fail")).toThrow(
      "Unknown server: bad",
    );
    expect(() => registry.updateConfig("bad", { port: 1 })).toThrow(
      "Unknown server: bad",
    );
  });

  it("returns defensive copies of config", () => {
    const registry = new ServerRegistry();
    registry.register("s1", defaultConfig("/tmp"));

    const server1 = registry.getServer("s1");
    if (server1) server1.config.port = 9999;

    const server2 = registry.getServer("s1");
    expect(server2?.config.port).toBe(8080); // original unchanged
  });
});
