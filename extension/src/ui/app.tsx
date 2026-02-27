import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";

const REPO_URL = "https://github.com/kzahel/web-server";

type AppState =
  | "loading"
  | "ready"
  | "launching"
  | "launched"
  | "not-installed"
  | "chromeos"
  | "error";

async function getPlatformOS(): Promise<string> {
  return new Promise((resolve) => {
    chrome.runtime.getPlatformInfo((info) => resolve(info.os));
  });
}

function App() {
  const [state, setState] = useState<AppState>("loading");
  const [error, setError] = useState("");
  const [hostVersion, setHostVersion] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const os = await getPlatformOS();

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
      } else if (os === "cros") {
        setState("chromeos");
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
        <span style={{ fontSize: 18, fontWeight: 600 }}>200 OK</span>
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
          App launched!
        </p>
      )}

      {state === "not-installed" && (
        <>
          <p style={{ color: "#666", margin: "0 0 12px", fontSize: 13 }}>
            Serve any folder over HTTP. Install the desktop app to get started.
          </p>
          <a
            href={REPO_URL}
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
            On ChromeOS, use the 200 OK Android app to serve files locally.
          </p>
          <a
            href="https://play.google.com/store/apps/details?id=app.ok200.android"
            target="_blank"
            rel="noopener noreferrer"
            style={primaryLink}
          >
            Get it on Google Play
          </a>
        </>
      )}

      {state === "error" && (
        <>
          <p style={{ color: "#ef4444", margin: "0 0 12px", fontSize: 13 }}>
            {error}
          </p>
          <button type="button" onClick={handleLaunch} style={secondaryButton}>
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
          color: "#999",
        }}
      >
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
  );
}

const primaryButton: React.CSSProperties = {
  display: "inline-block",
  padding: "8px 20px",
  background: "#2563eb",
  color: "#fff",
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

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");
ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
