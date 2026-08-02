// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CHROMEOS_HELP_URL,
  CHROMEOS_INTENT_URL,
  DESKTOP_DOWNLOAD_URL,
  PLAY_STORE_URL,
} from "../lib/platform-routing";
import { App } from "./app";

type ChromeMockOptions = {
  os: string;
  desktopConnected?: boolean;
  tabError?: string;
};

type ChromeMocks = {
  createTab: ReturnType<typeof vi.fn>;
  sendMessage: ReturnType<typeof vi.fn>;
};

let root: Root | null = null;

beforeEach(() => {
  document.body.innerHTML = '<div id="test-root"></div>';
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
  document.body.innerHTML = "";
});

describe("extension popup routing", () => {
  it("shows honest ChromeOS requirements and permanent install alternatives", async () => {
    const mocks = installChromeMock({ os: "cros" });

    await renderApp();

    expect(document.body.textContent).toContain(
      "Android apps and Google Play aren't available on every Chromebook.",
    );
    expect(linkHref("Compare ChromeOS options")).toBe(CHROMEOS_HELP_URL);
    expect(linkHref("Google Play")).toBe(PLAY_STORE_URL);
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  it("opens the bundled Linux setup guide without depending on the website", async () => {
    const mocks = installChromeMock({ os: "cros" });

    await renderApp();
    await clickButton("Use the Linux version");

    expect(mocks.createTab).toHaveBeenCalledWith(
      { url: "chrome-extension://test/src/ui/crostini.html" },
      expect.any(Function),
    );
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  it("retries the Android route after a ChromeOS launch error", async () => {
    const mocks = installChromeMock({
      os: "cros",
      tabError: "Intent could not be opened",
    });
    await renderApp();

    await clickButton("Open installed Android app");
    expect(document.body.textContent).toContain("Intent could not be opened");

    await clickButton("Try Again");
    expect(mocks.createTab).toHaveBeenCalledTimes(2);
    expect(mocks.createTab).toHaveBeenNthCalledWith(
      1,
      { url: CHROMEOS_INTENT_URL },
      expect.any(Function),
    );
    expect(mocks.createTab).toHaveBeenNthCalledWith(
      2,
      { url: CHROMEOS_INTENT_URL },
      expect.any(Function),
    );
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  it("sends a missing desktop app directly to the download page", async () => {
    installChromeMock({ os: "mac", desktopConnected: false });

    await renderApp();

    expect(document.body.textContent).toContain("Install the desktop app");
    expect(linkHref("Get the Desktop App")).toBe(DESKTOP_DOWNLOAD_URL);
  });

  it("launches a detected desktop app through native messaging", async () => {
    const mocks = installChromeMock({ os: "linux", desktopConnected: true });

    await renderApp();
    expect(document.body.textContent).toContain("Desktop app detected");

    await clickButton("Open 200 OK");
    expect(mocks.sendMessage).toHaveBeenCalledWith(
      { type: "launch" },
      expect.any(Function),
    );
    expect(document.body.textContent).toContain("App launched!");
  });

  it("does not attempt native messaging on unsupported Chrome platforms", async () => {
    const mocks = installChromeMock({ os: "openbsd" });

    await renderApp();

    expect(document.body.textContent).toContain(
      "does not have a supported 200 OK launcher path",
    );
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });
});

async function renderApp() {
  const container = document.getElementById("test-root");
  if (!container) throw new Error("Missing test root");
  root = createRoot(container);
  await act(async () => {
    root?.render(<App />);
  });
}

async function clickButton(label: string) {
  const button = [...document.querySelectorAll("button")].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  if (!button) throw new Error(`Button not found: ${label}`);
  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function linkHref(label: string): string | null {
  const anchor = [...document.querySelectorAll("a")].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  return anchor?.getAttribute("href") ?? null;
}

function installChromeMock(options: ChromeMockOptions): ChromeMocks {
  let lastError: { message: string } | undefined;
  const createTab = vi.fn(
    (
      _properties: { url?: string },
      callback?: (tab?: chrome.tabs.Tab) => void,
    ) => {
      lastError = options.tabError ? { message: options.tabError } : undefined;
      callback?.();
      lastError = undefined;
    },
  );
  const sendMessage = vi.fn(
    (
      message: { type?: string },
      callback?: (response?: {
        connected?: boolean;
        ok?: boolean;
        error?: string;
      }) => void,
    ) => {
      if (message.type === "get-status" || message.type === "connect") {
        callback?.({ connected: options.desktopConnected ?? false });
      } else if (message.type === "launch") {
        callback?.({ ok: true });
      }
    },
  );
  const runtime = {
    get lastError() {
      return lastError;
    },
    getURL(path: string) {
      return `chrome-extension://test/${path}`;
    },
    getPlatformInfo(callback: (info: chrome.runtime.PlatformInfo) => void) {
      callback({
        os: options.os as chrome.runtime.PlatformOs,
        arch: "x86-64",
        nacl_arch: "x86-64",
      });
    },
    sendMessage,
  };
  vi.stubGlobal("chrome", {
    runtime,
    tabs: { create: createTab },
  });
  return { createTab, sendMessage };
}
