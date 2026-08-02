import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CROSTINI_HOST_PERMISSION,
  controllerOrigin,
} from "../lib/crostini-launch";

type ControllerState =
  | "checking-permission"
  | "permission-required"
  | "connecting"
  | "connected"
  | "error";

type ControllerHealth = {
  instanceId?: string;
  product?: string;
  protocolVersion?: number;
};

const EXPECTED_PRODUCT = "ok200-crostini-controller";
const EXPECTED_PROTOCOL_VERSION = 1;

export function CrostiniController() {
  const launch = useMemo(readLaunchParameters, []);
  const [state, setState] = useState<ControllerState>("checking-permission");
  const [detail, setDetail] = useState("");

  const connect = useCallback(async () => {
    if (!launch) {
      setDetail("The Linux launch information is invalid or incomplete.");
      setState("error");
      return;
    }

    setState("connecting");
    setDetail("");
    try {
      const response = await fetch(`${controllerOrigin(launch.port)}/health`, {
        cache: "no-store",
        targetAddressSpace: "local",
      } as RequestInit & { targetAddressSpace: "local" });
      if (!response.ok)
        throw new Error(`Controller returned HTTP ${response.status}`);

      const health = (await response.json()) as ControllerHealth;
      if (
        health.product !== EXPECTED_PRODUCT ||
        health.protocolVersion !== EXPECTED_PROTOCOL_VERSION ||
        health.instanceId !== launch.instanceId
      ) {
        throw new Error("The listener is not the expected 200 OK controller.");
      }

      setDetail(`Connected to Linux controller ${launch.instanceId}.`);
      setState("connected");
    } catch (error) {
      setDetail(
        error instanceof Error
          ? error.message
          : "Controller connection failed.",
      );
      setState("error");
    }
  }, [launch]);

  useEffect(() => {
    chrome.permissions.contains(
      { origins: [CROSTINI_HOST_PERMISSION] },
      (granted) => {
        if (chrome.runtime.lastError) {
          setDetail(
            chrome.runtime.lastError.message || "Permission check failed.",
          );
          setState("error");
        } else if (granted) {
          void connect();
        } else {
          setState("permission-required");
        }
      },
    );
  }, [connect]);

  const requestPermission = () => {
    chrome.permissions.request(
      { origins: [CROSTINI_HOST_PERMISSION] },
      (granted) => {
        if (chrome.runtime.lastError) {
          setDetail(
            chrome.runtime.lastError.message || "Permission request failed.",
          );
          setState("error");
        } else if (granted) {
          void connect();
        } else {
          setDetail(
            "Permission was not granted. Linux setup help remains available.",
          );
          setState("permission-required");
        }
      },
    );
  };

  return (
    <main style={pageStyle}>
      <section style={cardStyle}>
        <header style={headerStyle}>
          <img src="../../icons/ok-48.png" width={48} height={48} alt="" />
          <div>
            <div style={eyebrowStyle}>ChromeOS Linux</div>
            <h1 style={headingStyle}>200 OK Web Server</h1>
          </div>
        </header>

        {state === "checking-permission" && <p>Checking Linux access…</p>}
        {state === "connecting" && <p>Connecting to your Linux controller…</p>}
        {state === "permission-required" && (
          <>
            <p style={bodyStyle}>
              Allow 200 OK to communicate with your Chromebook&apos;s Linux
              environment at <code>penguin.linux.test</code>. This private
              address stays on your Chromebook.
            </p>
            <button
              type="button"
              onClick={requestPermission}
              style={buttonStyle}
            >
              Allow Linux controller access
            </button>
          </>
        )}
        {state === "connected" && (
          <>
            <p style={successStyle}>Linux controller connected</p>
            <p style={bodyStyle}>{detail}</p>
          </>
        )}
        {state === "error" && (
          <>
            <p style={errorStyle}>Could not connect to the Linux controller</p>
            <p style={bodyStyle}>{detail}</p>
            <button
              type="button"
              onClick={() => void connect()}
              style={buttonStyle}
            >
              Try again
            </button>
          </>
        )}

        {state === "permission-required" && detail && (
          <p style={mutedStyle}>{detail}</p>
        )}
        <p style={mutedStyle}>
          This connection page is the first ChromeOS controller slice. Server
          settings remain unavailable until the Crostini controller ships.
        </p>
      </section>
    </main>
  );
}

function readLaunchParameters(): { instanceId: string; port: number } | null {
  const parameters = new URLSearchParams(window.location.search);
  const instanceId = parameters.get("instanceId");
  const port = Number(parameters.get("port"));
  if (
    !instanceId ||
    !/^[A-Za-z0-9._-]{1,64}$/.test(instanceId) ||
    !Number.isInteger(port) ||
    port < 1024 ||
    port > 65_535
  ) {
    return null;
  }
  return { instanceId, port };
}

const pageStyle = {
  minHeight: "100vh",
  boxSizing: "border-box" as const,
  margin: 0,
  padding: "48px 20px",
  background: "#f4f7fb",
  color: "#172033",
  fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
};

const cardStyle = {
  maxWidth: 560,
  margin: "0 auto",
  padding: 28,
  border: "1px solid #dfe5ee",
  borderRadius: 18,
  background: "white",
  boxShadow: "0 16px 40px rgba(25, 39, 63, 0.08)",
};

const headerStyle = {
  display: "flex",
  alignItems: "center",
  gap: 14,
  marginBottom: 24,
};

const eyebrowStyle = {
  color: "#60708a",
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase" as const,
};

const headingStyle = { margin: "3px 0 0", fontSize: 25 };
const bodyStyle = { color: "#4d5b70", lineHeight: 1.55 };
const mutedStyle = { color: "#77849a", fontSize: 13, lineHeight: 1.45 };
const successStyle = { color: "#16824a", fontSize: 18, fontWeight: 700 };
const errorStyle = { color: "#bd2f2f", fontSize: 18, fontWeight: 700 };

const buttonStyle = {
  width: "100%",
  padding: "11px 14px",
  border: 0,
  borderRadius: 9,
  background: "#2563eb",
  color: "white",
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 700,
};
