const SW_START_TIME = new Date().toISOString();
console.log(`[SW] Service Worker loaded at ${SW_START_TIME}`);

self.addEventListener("install", () => {
  console.log("[SW] Install event");
});

self.addEventListener("activate", () => {
  console.log("[SW] Activate event");
});

import { getNativeConnection } from "./lib/native-connection";

// ============================================================================
// Native Host Connection
// ============================================================================

const nativeConnection = getNativeConnection();
let hostVersion: string | null = null;

async function connectToNativeHost() {
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

// Auto-connect on startup
connectToNativeHost();
