// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { controllerTokenKey } from "../lib/crostini-controller";
import { CrostiniController, readLaunchParameters } from "./crostini";

const INSTANCE_ID = "fixture-1";
const CLAIM_CODE = "a".repeat(64);
const SETTINGS = {
  automaticUpdates: false,
  cors: false,
  directoryListing: true,
  keepServingOnClose: false,
  lan: false,
  port: 8080,
  root: "/home/test/Downloads/200 OK",
  spa: false,
};

let root: Root | null = null;
let storage: Map<string, string>;

beforeEach(() => {
  document.body.innerHTML = '<div id="test-root"></div>';
  storage = new Map();
  vi.stubGlobal("localStorage", {
    clear: () => storage.clear(),
    getItem: (key: string) => storage.get(key) ?? null,
    key: (index: number) => [...storage.keys()][index] ?? null,
    get length() {
      return storage.size;
    },
    removeItem: (key: string) => {
      storage.delete(key);
    },
    setItem: (key: string, value: string) => {
      storage.set(key, value);
    },
  } satisfies Storage);
  window.history.replaceState({}, "", launchUrl(false));
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount());
    root = null;
  }
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
  document.body.innerHTML = "";
});

describe("Crostini controller UI", () => {
  it("bundles the complete Linux setup and recovery path", async () => {
    window.history.replaceState({}, "", "/src/ui/crostini.html");

    await renderController();

    expect(document.body.textContent).toContain("Set up the Linux version");
    expect(document.body.textContent).toContain(
      "curl -fsSL https://ok200.app/install-crostini.sh | bash",
    );
    expect(document.body.textContent).toContain("Sharing Chromebook folders");
    expect(document.body.textContent).toContain(
      "Reach the server from another device",
    );
    expect(document.body.textContent).toContain(
      "Never forward controller port 20080",
    );
    expect(document.body.textContent).not.toContain("not published yet");
  });

  it("parses claimed and unclaimed launch URLs fail closed", () => {
    expect(readLaunchParameters()).toEqual({
      claimed: false,
      claimCode: CLAIM_CODE,
      instanceId: INSTANCE_ID,
      port: 20080,
    });

    window.history.replaceState({}, "", launchUrl(true));
    expect(readLaunchParameters()).toEqual({
      claimed: true,
      claimCode: undefined,
      instanceId: INSTANCE_ID,
      port: 20080,
    });

    window.history.replaceState(
      {},
      "",
      `/src/ui/crostini.html?claimed=false&instanceId=${INSTANCE_ID}&port=20080`,
    );
    expect(readLaunchParameters()).toBeNull();
  });

  it("claims a fresh controller, stores its token, and renders stopped controls", async () => {
    installChromeMock(true);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          claimed: false,
          instanceId: INSTANCE_ID,
          product: "ok200-crostini-controller",
          protocolVersion: 2,
          version: "0.1.5",
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ controllerToken: "secret-token" }))
      .mockResolvedValueOnce(
        jsonResponse({
          expiresInSeconds: 75,
          sessionId: "session-1",
          status: statusResponse("stopped"),
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await renderController();
    await settle();

    expect(document.body.textContent).toContain("Stopped");
    const serverToggle = document.querySelector(
      '[data-testid="server-toggle"]',
    );
    expect(serverToggle?.getAttribute("role")).toBe("switch");
    expect(serverToggle?.getAttribute("aria-label")).toBe("Start web server");
    expect(document.body.textContent).not.toContain("Start server");
    expect(localStorage.getItem(controllerTokenKey(INSTANCE_ID))).toBe(
      "secret-token",
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "http://penguin.linux.test:20080/api/claim",
    );
    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      "http://penguin.linux.test:20080/api/session/open",
    );
  });

  it("keeps setup available when host permission is denied", async () => {
    installChromeMock(false);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await renderController();
    await settle();

    expect(document.body.textContent).toContain(
      "Allow 200 OK to communicate with your Chromebook's Linux environment",
    );
    expect(document.body.textContent).toContain("Linux setup and recovery");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires terminal recovery when pairing exists but the local token is gone", async () => {
    window.history.replaceState({}, "", launchUrl(true));
    installChromeMock(true);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          claimed: true,
          instanceId: INSTANCE_ID,
          product: "ok200-crostini-controller",
          protocolVersion: 2,
          version: "0.1.5",
        }),
      ),
    );

    await renderController();
    await settle();

    expect(document.body.textContent).toContain("already paired");
    expect(document.body.textContent).toContain(
      "ok200-crostini reset-controller",
    );
  });

  it("opens the controller-backed folder picker", async () => {
    installChromeMock(true);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          claimed: false,
          instanceId: INSTANCE_ID,
          product: "ok200-crostini-controller",
          protocolVersion: 2,
          version: "0.1.5",
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ controllerToken: "secret-token" }))
      .mockResolvedValueOnce(
        jsonResponse({
          expiresInSeconds: 75,
          sessionId: "session-1",
          status: statusResponse("stopped"),
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          roots: [
            { available: true, id: "linux-files", name: "Linux files" },
            {
              available: true,
              id: "shared-chromeos",
              name: "Shared Chromebook folders",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          canSelect: false,
          displayPath: "Linux files",
          entries: [{ name: "Downloads" }, { name: "Projects" }],
          path: [],
          rootId: "linux-files",
          rootName: "Linux files",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          canSelect: false,
          displayPath: "Shared Chromebook folders",
          entries: [{ name: "MyFiles" }],
          path: [],
          rootId: "shared-chromeos",
          rootName: "Shared Chromebook folders",
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await renderController();
    await settle();
    const choose = document.querySelector<HTMLButtonElement>(
      '[data-testid="choose-folder"]',
    );
    await act(async () => choose?.click());
    await settle();

    expect(document.body.textContent).toContain("Choose a folder");
    expect(document.body.textContent).toContain("Shared Chromebook folders");
    expect(document.body.textContent).toContain("Downloads");
    expect(document.body.textContent).toContain("Projects");
    expect(fetchMock.mock.calls[3]?.[0]).toBe(
      "http://penguin.linux.test:20080/api/folders/roots",
    );
    expect(fetchMock.mock.calls[4]?.[0]).toBe(
      "http://penguin.linux.test:20080/api/folders/list",
    );

    const shared = [
      ...document.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
    ].find((button) =>
      button.textContent?.includes("Shared Chromebook folders"),
    );
    await act(async () => shared?.click());
    await settle();

    expect(document.body.textContent).toContain("My files");
    expect(document.body.textContent).not.toContain("MyFiles");
    expect(fetchMock.mock.calls[5]?.[0]).toBe(
      "http://penguin.linux.test:20080/api/folders/list",
    );
  });

  it("starts through the server switch and shows the running URL", async () => {
    installChromeMock(true);
    const running = {
      ...statusResponse("running"),
      server: { state: "running", url: "http://localhost:8080" },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          claimed: false,
          instanceId: INSTANCE_ID,
          product: "ok200-crostini-controller",
          protocolVersion: 2,
          version: "0.1.5",
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ controllerToken: "secret-token" }))
      .mockResolvedValueOnce(
        jsonResponse({
          expiresInSeconds: 75,
          sessionId: "session-1",
          status: statusResponse("stopped"),
        }),
      )
      .mockResolvedValueOnce(jsonResponse(running));
    vi.stubGlobal("fetch", fetchMock);

    await renderController();
    await settle();
    const toggle = document.querySelector<HTMLButtonElement>(
      '[data-testid="server-toggle"]',
    );
    await act(async () => toggle?.click());
    await settle();

    expect(document.body.textContent).toContain("Running");
    expect(document.body.textContent).toContain("http://localhost:8080");
    expect(toggle?.getAttribute("aria-checked")).toBe("true");
    expect(fetchMock.mock.calls[3]?.[0]).toBe(
      "http://penguin.linux.test:20080/api/server/start",
    );
    expect(fetchMock.mock.calls[3]?.[1]?.body).toBe(
      JSON.stringify({ sessionId: "session-1" }),
    );
  });
});

function launchUrl(claimed: boolean): string {
  const parameters = new URLSearchParams({
    claimed: String(claimed),
    instanceId: INSTANCE_ID,
    port: "20080",
  });
  if (!claimed) parameters.set("claimCode", CLAIM_CODE);
  return `/src/ui/crostini.html?${parameters}`;
}

function statusResponse(state: "stopped" | "running") {
  return {
    instanceId: INSTANCE_ID,
    product: "ok200-crostini-controller",
    protocolVersion: 2,
    server: { state },
    settings: SETTINGS,
    update: { state: "current" },
    version: "0.1.5",
  };
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function installChromeMock(permissionGranted: boolean) {
  let lastError: { message: string } | undefined;
  vi.stubGlobal("chrome", {
    permissions: {
      contains(
        _permissions: chrome.permissions.Permissions,
        callback: (granted: boolean) => void,
      ) {
        callback(permissionGranted);
      },
      request(
        _permissions: chrome.permissions.Permissions,
        callback: (granted: boolean) => void,
      ) {
        callback(permissionGranted);
      },
    },
    runtime: {
      get lastError() {
        return lastError;
      },
    },
  });
  lastError = undefined;
}

async function renderController() {
  const container = document.getElementById("test-root");
  if (!container) throw new Error("Missing test root");
  root = createRoot(container);
  await act(async () => {
    root?.render(<CrostiniController />);
  });
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}
