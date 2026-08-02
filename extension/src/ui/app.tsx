import type React from "react";
import { useEffect, useState } from "react";
import {
  CHROMEOS_HELP_URL,
  CHROMEOS_INTENT_URL,
  DESKTOP_DOWNLOAD_URL,
  PLAY_STORE_URL,
  type PlatformRoute,
  PRODUCT_URL,
  platformRoute,
} from "../lib/platform-routing";

const FEEDBACK_URL = "https://ok200.app/feedback";
const SOURCE_URL = "https://github.com/kzahel/web-server-chrome";

type AppState =
  | "loading"
  | "ready"
  | "launching"
  | "launched"
  | "not-installed"
  | "chromeos"
  | "unsupported"
  | "error";

async function getPlatformOS(): Promise<string> {
  return new Promise((resolve) => {
    chrome.runtime.getPlatformInfo((info) => resolve(info.os));
  });
}

export function App() {
  const [state, setState] = useState<AppState>("loading");
  const [route, setRoute] = useState<PlatformRoute | null>(null);
  const [error, setError] = useState("");
  const [hostVersion, setHostVersion] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const os = await getPlatformOS();
      const nextRoute = platformRoute(os);
      if (!cancelled) setRoute(nextRoute);

      if (nextRoute === "chromeos") {
        if (!cancelled) setState("chromeos");
        return;
      }

      if (nextRoute === "unsupported") {
        if (!cancelled) setState("unsupported");
        return;
      }

      const response = await new Promise<{
        connected: boolean;
        hostVersion?: string;
      } | null>((resolve) => {
        chrome.runtime.sendMessage({ type: "get-status" }, (r) => {
          if (chrome.runtime.lastError || !r) resolve(null);
          else resolve(r);
        });
      });

      if (cancelled) return;

      if (response?.connected) {
        setState("ready");
        if (response.hostVersion) setHostVersion(response.hostVersion);
        return;
      }

      // Try connecting
      const connectResponse = await new Promise<{
        connected: boolean;
        hostVersion?: string;
      } | null>((resolve) => {
        chrome.runtime.sendMessage({ type: "connect" }, (r) => {
          if (chrome.runtime.lastError || !r) resolve(null);
          else resolve(r);
        });
      });

      if (cancelled) return;

      if (connectResponse?.connected) {
        setState("ready");
        if (connectResponse.hostVersion)
          setHostVersion(connectResponse.hostVersion);
      } else {
        setState("not-installed");
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLaunch = () => {
    setState("launching");
    chrome.runtime.sendMessage(
      { type: "launch" },
      (response: { ok?: boolean; error?: string } | undefined) => {
        if (response?.ok) {
          setState("launched");
          setTimeout(() => window.close(), 1200);
        } else {
          setError(response?.error || "Failed to launch app");
          setState("error");
        }
      },
    );
  };

  const handleChromeOsLaunch = () => {
    setState("launching");
    chrome.tabs.create({ url: CHROMEOS_INTENT_URL }, () => {
      if (chrome.runtime.lastError) {
        setError(
          chrome.runtime.lastError.message || "Failed to open Android app",
        );
        setState("error");
        return;
      }
      setState("launched");
      setTimeout(() => window.close(), 200);
    });
  };

  const handleLinuxSetup = () => {
    chrome.tabs.create(
      { url: chrome.runtime.getURL("src/ui/crostini.html") },
      () => {
        if (chrome.runtime.lastError) {
          setError(
            chrome.runtime.lastError.message ||
              "Failed to open the Linux setup guide",
          );
          setState("error");
          return;
        }
        window.close();
      },
    );
  };

  const handleRetry =
    route === "chromeos" ? handleChromeOsLaunch : handleLaunch;

  return (
    <div
      style={{
        padding: 20,
        minWidth: 300,
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 16,
        }}
      >
        <img src="../../icons/ok-32.png" width={32} height={32} alt="" />
        <span style={{ fontSize: 18, fontWeight: 600 }}>200 OK Web Server</span>
      </div>

      {state === "loading" && (
        <p style={{ color: "#666", margin: 0 }}>Connecting...</p>
      )}

      {state === "ready" && (
        <>
          <p style={{ color: "#666", margin: "0 0 12px", fontSize: 13 }}>
            Desktop app detected{hostVersion ? ` (v${hostVersion})` : ""}.
          </p>
          <button type="button" onClick={handleLaunch} style={primaryButton}>
            Open 200 OK
          </button>
        </>
      )}

      {state === "launching" && (
        <p style={{ color: "#666", margin: 0 }}>Launching...</p>
      )}

      {state === "launched" && (
        <p style={{ color: "#22c55e", margin: 0, fontWeight: 500 }}>
          {route === "chromeos" ? "Opening Android app..." : "App launched!"}
        </p>
      )}

      {state === "not-installed" && (
        <>
          <p style={{ color: "#666", margin: "0 0 12px", fontSize: 13 }}>
            Serve any folder over HTTP. Install the desktop app to get started.
          </p>
          <a
            href={DESKTOP_DOWNLOAD_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={primaryLink}
          >
            Get the Desktop App
          </a>
        </>
      )}

      {state === "chromeos" && (
        <>
          <p style={{ color: "#666", margin: "0 0 12px", fontSize: 13 }}>
            Already installed? Open the 200 OK Android app and confirm the
            ChromeOS prompt. Otherwise use the install options—Android apps and
            Google Play aren&apos;t available on every Chromebook.
          </p>
          <button
            type="button"
            onClick={handleChromeOsLaunch}
            style={primaryButton}
          >
            Open installed Android app
          </button>
          <div style={{ marginTop: 8 }}>
            <button
              type="button"
              onClick={handleLinuxSetup}
              style={secondaryButton}
            >
              Use the Linux version
            </button>
          </div>
          <div style={{ marginTop: 8 }}>
            <a
              href={CHROMEOS_HELP_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={secondaryActionLink}
            >
              Compare ChromeOS options
            </a>
          </div>
          <div style={{ marginTop: 8 }}>
            <a
              href={PLAY_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={secondaryLink}
            >
              Google Play
            </a>
          </div>
        </>
      )}

      {state === "unsupported" && (
        <>
          <p style={{ color: "#666", margin: "0 0 12px", fontSize: 13 }}>
            This Chrome platform does not have a supported 200 OK launcher path.
          </p>
          <a
            href={PRODUCT_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={primaryLink}
          >
            See supported platforms
          </a>
        </>
      )}

      {state === "error" && (
        <>
          <p style={{ color: "#ef4444", margin: "0 0 12px", fontSize: 13 }}>
            {error}
          </p>
          <button type="button" onClick={handleRetry} style={secondaryButton}>
            Try Again
          </button>
        </>
      )}

      <div
        style={{
          marginTop: 16,
          paddingTop: 12,
          borderTop: "1px solid #eee",
          fontSize: 11,
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 12,
            marginBottom: 10,
            fontSize: 12,
            fontWeight: 500,
          }}
        >
          <a
            href={FEEDBACK_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#665700" }}
          >
            Feedback &amp; support
          </a>
          <a
            href={SOURCE_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#665700" }}
          >
            Source · MIT
          </a>
        </div>
        <div style={{ color: "#999" }}>
          Successor to{" "}
          <a
            href="https://chromewebstore.google.com/detail/web-server-for-chrome/ofhbbkphhbklhfoeikjpcbhemlocgigb"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#999" }}
          >
            Web Server for Chrome
          </a>
        </div>
      </div>
    </div>
  );
}

const primaryButton: React.CSSProperties = {
  display: "inline-block",
  padding: "8px 20px",
  background: "#f8d203",
  color: "#1a1a1a",
  border: "none",
  borderRadius: 6,
  fontSize: 14,
  fontWeight: 500,
  cursor: "pointer",
};

const primaryLink: React.CSSProperties = {
  ...primaryButton,
  textDecoration: "none",
  textAlign: "center",
};

const secondaryButton: React.CSSProperties = {
  ...primaryButton,
  background: "#f5f5f5",
  color: "#333",
  border: "1px solid #ddd",
};

const secondaryLink: React.CSSProperties = {
  color: "#666",
  fontSize: 12,
  textDecoration: "none",
};

const secondaryActionLink: React.CSSProperties = {
  ...secondaryButton,
  display: "inline-block",
  textDecoration: "none",
};
