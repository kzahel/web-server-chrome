import { LanguagePicker, rich, t, useLocale } from "@ok200/i18n";
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

type LaunchAction = "android" | "desktop" | "linux";

async function getPlatformOS(): Promise<string> {
  return new Promise((resolve) => {
    chrome.runtime.getPlatformInfo((info) => resolve(info.os));
  });
}

export function App() {
  useLocale();
  const [state, setState] = useState<AppState>("loading");
  const [route, setRoute] = useState<PlatformRoute | null>(null);
  const [error, setError] = useState("");
  const [hostVersion, setHostVersion] = useState("");
  const [lastAction, setLastAction] = useState<LaunchAction>("desktop");

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
    setLastAction("desktop");
    setState("launching");
    chrome.runtime.sendMessage(
      { type: "launch" },
      (response: { ok?: boolean; error?: string } | undefined) => {
        if (response?.ok) {
          setState("launched");
          setTimeout(() => window.close(), 1200);
        } else {
          setError(
            response?.error || t("extension.failed.to.launch.app.fba450"),
          );
          setState("error");
        }
      },
    );
  };

  const handleChromeOsLaunch = () => {
    setLastAction("android");
    setState("launching");
    chrome.tabs.create({ url: CHROMEOS_INTENT_URL }, () => {
      if (chrome.runtime.lastError) {
        setError(
          chrome.runtime.lastError.message ||
            t("extension.failed.to.open.android.app.73ba16"),
        );
        setState("error");
        return;
      }
      setState("launched");
      setTimeout(() => window.close(), 200);
    });
  };

  const handleLinuxSetup = () => {
    setLastAction("linux");
    chrome.tabs.create(
      { url: chrome.runtime.getURL("src/ui/crostini.html") },
      () => {
        if (chrome.runtime.lastError) {
          setError(
            chrome.runtime.lastError.message ||
              t("extension.failed.to.open.the.linux.setup.guide.a903f0"),
          );
          setState("error");
          return;
        }
        window.close();
      },
    );
  };

  const handleRetry = () => {
    if (lastAction === "linux") handleLinuxSetup();
    else if (lastAction === "android") handleChromeOsLaunch();
    else handleLaunch();
  };

  return (
    <div
      style={{
        padding: 20,
        minWidth: 300,
        boxSizing: "border-box",
        maxWidth: "100%",
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
        <span style={{ fontSize: 18, fontWeight: 600 }}>
          {t("extension.200.ok.web.server.bf6c0d")}
        </span>
      </div>

      <LanguagePicker />
      {state === "loading" && (
        <p style={{ color: "#666", margin: 0 }}>
          {t("extension.connecting.5f04ae")}
        </p>
      )}

      {state === "ready" && (
        <>
          <p style={{ color: "#666", margin: "0 0 12px", fontSize: 13 }}>
            {t("extension.desktop.app.detected.value0.6e9c58", {
              value0: hostVersion ? ` (v${hostVersion})` : "",
            })}
          </p>
          <button type="button" onClick={handleLaunch} style={primaryButton}>
            {t("extension.open.200.ok.06ebd0")}
          </button>
        </>
      )}

      {state === "launching" && (
        <p style={{ color: "#666", margin: 0 }}>
          {t("extension.launching.b1601d")}
        </p>
      )}

      {state === "launched" && (
        <p style={{ color: "#22c55e", margin: 0, fontWeight: 500 }}>
          {route === "chromeos"
            ? t("extension.opening.android.app.708ae6")
            : t("extension.app.launched.931931")}
        </p>
      )}

      {state === "not-installed" && (
        <>
          <p style={{ color: "#666", margin: "0 0 12px", fontSize: 13 }}>
            {t(
              "extension.serve.any.folder.over.http.install.the.desktop.app.to.g.cbebff",
            )}
          </p>
          <a
            href={DESKTOP_DOWNLOAD_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={primaryLink}
          >
            {t("extension.get.the.desktop.app.39b7d5")}
          </a>
        </>
      )}

      {state === "chromeos" && (
        <>
          <p style={{ color: "#666", margin: "0 0 12px", fontSize: 13 }}>
            {t(
              "extension.choose.the.implementation.you.prefer.chromeos.linux.avo.737672",
            )}
          </p>
          <button
            type="button"
            onClick={handleLinuxSetup}
            style={primaryButton}
          >
            {t("extension.use.chromeos.linux.1c2722")}
          </button>
          <div style={{ marginTop: 8 }}>
            <button
              type="button"
              onClick={handleChromeOsLaunch}
              style={secondaryButton}
            >
              {t("extension.open.installed.android.app.82b23f")}
            </button>
          </div>
          <div style={{ marginTop: 8 }}>
            {rich("extension..tag0.compare.chromeos.options.tag0.081566", {
              tag0: (chunks) => (
                <a
                  href={CHROMEOS_HELP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={secondaryActionLink}
                >
                  {chunks}
                </a>
              ),
            })}
          </div>
          <div style={{ marginTop: 8 }}>
            {rich("extension..tag0.google.play.tag0.60819d", {
              tag0: (chunks) => (
                <a
                  href={PLAY_STORE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={secondaryLink}
                >
                  {chunks}
                </a>
              ),
            })}
          </div>
        </>
      )}

      {state === "unsupported" && (
        <>
          <p style={{ color: "#666", margin: "0 0 12px", fontSize: 13 }}>
            {t(
              "extension.this.chrome.platform.does.not.have.a.supported.200.ok.l.154016",
            )}
          </p>
          <a
            href={PRODUCT_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={primaryLink}
          >
            {t("extension.see.supported.platforms.bc2221")}
          </a>
        </>
      )}

      {state === "error" && (
        <>
          <p style={{ color: "#b91c1c", margin: "0 0 12px", fontSize: 13 }}>
            {error}
          </p>
          <button type="button" onClick={handleRetry} style={secondaryButton}>
            {t("extension.try.again.df0fe9")}
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
          {rich(
            "extension..tag0.feedback.support.tag0.tag1.source.mit.tag1.83ed4c",
            {
              tag0: (chunks) => (
                <a
                  href={FEEDBACK_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "#665700" }}
                >
                  {chunks}
                </a>
              ),
              tag1: (chunks) => (
                <a
                  href={SOURCE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "#665700" }}
                >
                  {chunks}
                </a>
              ),
            },
          )}
        </div>
        <div style={{ color: "#666" }}>
          {rich(
            "extension.successor.to.tag0.web.server.for.chrome.tag0.7ca3a6",
            {
              tag0: (chunks) => (
                <a
                  href="https://chromewebstore.google.com/detail/web-server-for-chrome/ofhbbkphhbklhfoeikjpcbhemlocgigb"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "#666" }}
                >
                  {chunks}
                </a>
              ),
            },
          )}
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
