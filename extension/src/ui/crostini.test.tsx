// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import compatibilityCorpus from "../../../tests/compatibility/corpus-v1.json";
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
    expect(document.body.textContent).toContain(
      "wait for it to disappear before stopping Linux",
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

  it("explains the frozen protocol-1 incompatibility and keeps recovery available", async () => {
    const fixture = compatibilityCorpus.crostiniController.cases.find(
      ({ id }) => id === "controller-protocol-1-historical-gap",
    );
    expect(fixture).toBeDefined();
    installChromeMock(true);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(fixture?.health)),
    );

    await renderController();
    await settle();

    expect(document.body.textContent).toContain(fixture?.errorContains);
    expect(document.body.textContent).toContain(
      "Update the extension and Linux component together",
    );
    expect(document.body.textContent).toContain("Linux setup and recovery");
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
    expect(choose?.getAttribute("aria-disabled")).toBe("false");
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

  it("detects the Chromebook LAN address and ignores ChromeOS guest interfaces", async () => {
    installChromeMock(true);
    installLanAddressProbe(["100.115.92.25", "192.168.1.106"]);
    const legacyAddressKey = `ok200-crostini-lan-host:${INSTANCE_ID}`;
    localStorage.setItem(legacyAddressKey, "10.0.0.9");
    const running = {
      ...statusResponse("running"),
      server: { state: "running", url: "http://localhost:8080" },
      settings: { ...SETTINGS, lan: true },
    };
    vi.stubGlobal(
      "fetch",
      vi
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
        .mockResolvedValueOnce(
          jsonResponse({ controllerToken: "secret-token" }),
        )
        .mockResolvedValueOnce(
          jsonResponse({
            expiresInSeconds: 75,
            sessionId: "session-1",
            status: running,
          }),
        ),
    );

    await renderController();
    await settle();

    const address = document.querySelector(
      '[data-testid="chromebook-address"]',
    );
    expect(address?.textContent).toBe("192.168.1.106");
    expect(document.querySelector("#chromebook-address")).toBeNull();
    expect(localStorage.getItem(legacyAddressKey)).toBeNull();
    expect(document.body.textContent).toContain(
      "Detected automatically from ChromeOS.",
    );
    expect(document.body.textContent).toContain("http://192.168.1.106:8080/");
    expect(document.body.textContent).not.toContain(
      "http://100.115.92.25:8080/",
    );
  });

  it("explains why running-server settings cannot be changed", async () => {
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
          status: running,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await renderController();
    await settle();

    const choose = document.querySelector<HTMLButtonElement>(
      '[data-testid="choose-folder"]',
    );
    expect(choose?.disabled).toBe(false);
    expect(choose?.getAttribute("aria-disabled")).toBe("true");
    expect(choose?.title).toBe("Stop the server to change settings.");

    await act(async () => choose?.click());

    expect(
      document.querySelector('[data-testid="settings-lock-feedback"]')
        ?.textContent,
    ).toContain("Stop the server to change settings.");
    expect(document.querySelector(".folder-dialog")).toBeNull();

    const port = document.querySelector<HTMLInputElement>("#content-port");
    expect(port?.readOnly).toBe(true);
    expect(port?.getAttribute("aria-disabled")).toBe("true");

    const lanSwitch = document.querySelector<HTMLButtonElement>(
      '[role="switch"][aria-label="Available on local network"]',
    );
    expect(lanSwitch?.disabled).toBe(false);
    expect(lanSwitch?.getAttribute("aria-disabled")).toBe("true");
    await act(async () => lanSwitch?.click());

    expect(fetchMock).toHaveBeenCalledTimes(3);
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

function installLanAddressProbe(addresses: string[]) {
  vi.stubGlobal(
    "RTCPeerConnection",
    class {
      private listener:
        | ((event: {
            candidate: { address: string; candidate: string } | null;
          }) => void)
        | null = null;

      addEventListener(
        _type: string,
        listener: (event: {
          candidate: { address: string; candidate: string } | null;
        }) => void,
      ) {
        this.listener = listener;
      }

      close() {}

      createDataChannel() {}

      async createOffer() {
        return { sdp: "", type: "offer" as const };
      }

      async setLocalDescription() {
        for (const address of addresses) {
          this.listener?.({
            candidate: {
              address,
              candidate: `candidate:1 1 udp 1 ${address} 40000 typ host`,
            },
          });
        }
        this.listener?.({ candidate: null });
      }
    },
  );
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
