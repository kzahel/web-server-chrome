const SW_START_TIME = new Date().toISOString();
console.log(`[SW] Service Worker loaded at ${SW_START_TIME}`);

self.addEventListener("install", () => {
  console.log("[SW] Install event");
});

self.addEventListener("activate", () => {
  console.log("[SW] Activate event");
});

import {
  CROSTINI_UI_PATH,
  type CrostiniLaunch,
  isCrostiniUiUrl,
  parseCrostiniLaunch,
} from "./lib/crostini-launch";
import { getNativeConnection } from "./lib/native-connection";
import { isChromeOs, shouldUseNativeMessaging } from "./lib/platform-routing";

// ============================================================================
// Native Host Connection
// ============================================================================

const nativeConnection = getNativeConnection();
let hostVersion: string | null = null;
let isChromeOS = false;

async function detectPlatformOs(): Promise<string> {
  return new Promise((resolve) => {
    chrome.runtime.getPlatformInfo((info) => resolve(info.os));
  });
}

async function connectToNativeHost() {
  if (isChromeOS) return;
  try {
    await nativeConnection.connect();
    console.log("[SW] Connected to native host");

    // Send handshake to get host version
    hostVersion = await new Promise<string | null>((resolve) => {
      const timeout = setTimeout(() => resolve(null), 2000);
      nativeConnection.onMessage((msg: unknown) => {
        const m = msg as { action?: string; version?: string };
        if (m.action === "handshake" && m.version) {
          clearTimeout(timeout);
          resolve(m.version);
        }
      });
      nativeConnection.send({ action: "handshake" });
    });

    if (hostVersion) {
      console.log(`[SW] Native host version: ${hostVersion}`);
    }

    nativeConnection.onDisconnect(() => {
      console.log("[SW] Native host disconnected");
      hostVersion = null;
    });
  } catch (e) {
    console.error("[SW] Failed to connect to native host:", e);
  }
}

// ============================================================================
// Message handling from popup UI
// ============================================================================

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  console.log("[SW] Received message:", message);

  if (message.type === "get-status") {
    sendResponse({
      connected: nativeConnection.isConnected(),
      startTime: SW_START_TIME,
      hostVersion,
    });
    return false;
  }

  if (message.type === "connect") {
    connectToNativeHost().then(() => {
      sendResponse({
        connected: nativeConnection.isConnected(),
        hostVersion,
      });
    });
    return true; // async response
  }

  if (message.type === "launch") {
    const doLaunch = async () => {
      if (!nativeConnection.isConnected()) {
        await connectToNativeHost();
      }
      if (!nativeConnection.isConnected()) {
        return { ok: false, error: "Cannot connect to native host" };
      }
      return new Promise<{ ok: boolean; error?: string }>((resolve) => {
        const timeout = setTimeout(() => {
          resolve({ ok: false, error: "Launch timed out" });
        }, 5000);
        nativeConnection.onMessage((msg: unknown) => {
          const m = msg as { action?: string; ok?: boolean; error?: string };
          if (m.action === "launch") {
            clearTimeout(timeout);
            resolve({ ok: m.ok ?? false, error: m.error });
          }
        });
        nativeConnection.send({ action: "launch" });
      });
    };
    doLaunch().then(sendResponse);
    return true; // async response
  }

  return false;
});

// ============================================================================
// External message handling (legacy Chrome App migration)
// ============================================================================

const LEGACY_APP_ID = "ofhbbkphhbklhfoeikjpcbhemlocgigb";
let crostiniUiOpening = false;

async function openOrFocusCrostiniUi(
  launch: CrostiniLaunch,
  senderTab: chrome.tabs.Tab | undefined,
) {
  if (crostiniUiOpening) {
    if (senderTab?.id !== undefined) await chrome.tabs.remove(senderTab.id);
    return;
  }
  crostiniUiOpening = true;

  const baseUrl = chrome.runtime.getURL(CROSTINI_UI_PATH);
  const parameters = new URLSearchParams({
    claimed: String(launch.claimed),
    instanceId: launch.instanceId,
    port: String(launch.port),
  });
  if (launch.claimCode) parameters.set("claimCode", launch.claimCode);
  const targetUrl = `${baseUrl}?${parameters}`;
  const targetWindowType = launch.claimed ? "popup" : "normal";

  try {
    const contexts =
      typeof chrome.runtime.getContexts === "function"
        ? await chrome.runtime.getContexts({ contextTypes: ["TAB"] })
        : [];
    const existing = contexts.find(
      (context) =>
        context.tabId !== undefined &&
        isCrostiniUiUrl(context.documentUrl, baseUrl),
    );
    if (existing?.tabId !== undefined) {
      const existingWindow =
        existing.windowId === undefined
          ? undefined
          : await chrome.windows.get(existing.windowId);
      if (existingWindow?.type === targetWindowType) {
        await chrome.tabs.update(existing.tabId, {
          active: true,
          url: targetUrl,
        });
        if (existing.windowId !== undefined) {
          await chrome.windows.update(existing.windowId, { focused: true });
        }
        if (senderTab?.id !== undefined && senderTab.id !== existing.tabId) {
          await chrome.tabs.remove(senderTab.id);
        }
        return;
      }
      await chrome.tabs.remove(existing.tabId);
    }

    if (launch.claimed) {
      try {
        const popup = await chrome.windows.create({
          focused: true,
          height: 750,
          type: "popup",
          url: targetUrl,
          width: 700,
        });
        if (!popup)
          throw new Error("Chrome did not create a controller window");
        if (senderTab?.id !== undefined) await chrome.tabs.remove(senderTab.id);
        return;
      } catch (error) {
        console.warn(
          "[SW] Crostini popup unavailable; falling back to a normal tab:",
          error,
        );
      }
    }

    if (senderTab?.id !== undefined) {
      await chrome.tabs.create({
        active: true,
        url: targetUrl,
        windowId: senderTab.windowId,
      });
      await chrome.tabs.remove(senderTab.id);
    } else {
      await chrome.tabs.create({ url: targetUrl });
    }
  } catch (error) {
    console.error("[SW] Failed to open Crostini controller UI:", error);
  } finally {
    crostiniUiOpening = false;
  }
}

chrome.runtime.onMessageExternal.addListener(
  (message, sender, sendResponse) => {
    const crostiniLaunch = parseCrostiniLaunch(message, sender.url);
    if (crostiniLaunch) {
      sendResponse({ accepted: true });
      void openOrFocusCrostiniUi(crostiniLaunch, sender.tab);
      return false;
    }

    const isLegacyApp = sender.id === LEGACY_APP_ID;
    const isOk200Site = sender.url?.startsWith("https://ok200.app/");

    if (!isLegacyApp && !isOk200Site) return;

    if (message.type === "ping") {
      sendResponse({
        installed: true,
        version: chrome.runtime.getManifest().version,
      });
    }
  },
);

// Auto-connect on startup (skip on ChromeOS where native messaging is unsupported)
detectPlatformOs().then((os) => {
  isChromeOS = isChromeOs(os);
  if (shouldUseNativeMessaging(os)) {
    connectToNativeHost();
  }
});
