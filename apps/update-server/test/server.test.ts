import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Mock github fetches before importing server
vi.mock("../src/github.js", () => ({
  fetchReleases: vi.fn().mockResolvedValue({
    latest: {
      version: "0.2.0",
      notes: "New release",
      pub_date: "2025-01-01",
      platforms: {
        "darwin-aarch64": {
          url: "https://example.com/update.tar.gz",
          signature: "sig123",
        },
      },
    },
    freshNotes: [],
  }),
  aggregateNotes: vi.fn().mockReturnValue(""),
  findPlatformUpdate: vi.fn().mockReturnValue({
    version: "0.2.0",
    notes: "",
    pub_date: "2025-01-01",
    url: "https://example.com/update.tar.gz",
    signature: "sig123",
  }),
}));

const { server } = await import("../src/server.js");

let baseUrl: string;

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    // Server is already listening from module init; get the address
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
    resolve();
  });
});

afterAll(() => {
  server.close();
});

describe("URL parsing", () => {
  it("strips query strings from version", async () => {
    const res = await fetch(
      `${baseUrl}/tauri/darwin-aarch64/aarch64/0.1.0?x=1`,
    );
    // Should succeed (200 update available), not treat "0.1.0?x=1" as the version
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.version).toBe("0.2.0");
  });

  it("rejects invalid version format with 400", async () => {
    const res = await fetch(
      `${baseUrl}/tauri/darwin-aarch64/aarch64/not-a-version`,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid version format");
  });

  it("accepts valid version", async () => {
    const res = await fetch(`${baseUrl}/tauri/darwin-aarch64/aarch64/0.1.0`);
    expect(res.status).toBe(200);
  });
});
