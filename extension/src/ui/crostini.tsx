import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type ControllerSettings,
  type ControllerStatus,
  CrostiniControllerClient,
  controllerTokenKey,
  validateControllerHealth,
} from "../lib/crostini-controller";
import {
  CROSTINI_HOST_PERMISSION,
  type CrostiniLaunch,
} from "../lib/crostini-launch";

type ControllerState =
  | "setup"
  | "checking-permission"
  | "permission-required"
  | "connecting"
  | "connected"
  | "error";

export function CrostiniController() {
  const launch = useMemo(readLaunchParameters, []);
  const client = useMemo(
    () => (launch ? new CrostiniControllerClient(launch.port) : null),
    [launch],
  );
  const [state, setState] = useState<ControllerState>(
    launch ? "checking-permission" : "setup",
  );
  const [detail, setDetail] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<ControllerStatus | null>(null);
  const [settings, setSettings] = useState<ControllerSettings | null>(null);
  const [busy, setBusy] = useState(false);

  const connect = useCallback(async () => {
    if (!launch || !client) {
      setState("setup");
      return;
    }

    setState("connecting");
    setDetail("");
    try {
      const health = await client.health();
      validateControllerHealth(health, launch.instanceId);
      let controllerToken = localStorage.getItem(
        controllerTokenKey(launch.instanceId),
      );

      if (!health.claimed) {
        if (!launch.claimCode) {
          throw new Error(
            "The one-time controller claim is missing. Launch 200 OK Linux again.",
          );
        }
        const claim = await client.claim(launch.instanceId, launch.claimCode);
        controllerToken = claim.controllerToken;
        localStorage.setItem(
          controllerTokenKey(launch.instanceId),
          controllerToken,
        );
      } else if (!controllerToken) {
        throw new Error(
          "This Linux controller is already paired, but this extension no longer has its token. Run ‘ok200-crostini reset-controller’ in Terminal, then launch 200 OK Linux again.",
        );
      }

      const nextStatus = await client.status(controllerToken);
      validateControllerHealth(
        {
          claimed: true,
          instanceId: nextStatus.instanceId,
          product: nextStatus.product,
          protocolVersion: nextStatus.protocolVersion,
          version: nextStatus.version,
        },
        launch.instanceId,
      );
      setToken(controllerToken);
      setStatus(nextStatus);
      setSettings(nextStatus.settings);
      setState("connected");
    } catch (error) {
      setDetail(
        error instanceof Error
          ? error.message
          : "Controller connection failed.",
      );
      setState("error");
    }
  }, [client, launch]);

  useEffect(() => {
    if (!launch) return;
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
  }, [connect, launch]);

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
            "Permission was not granted. Setup instructions remain available, but the extension cannot control Linux.",
          );
          setState("permission-required");
        }
      },
    );
  };

  const perform = async (
    action: (
      activeClient: CrostiniControllerClient,
      activeToken: string,
    ) => Promise<ControllerStatus>,
  ) => {
    if (!client || !token) return;
    setBusy(true);
    setDetail("");
    try {
      const nextStatus = await action(client, token);
      setStatus(nextStatus);
      setSettings(nextStatus.settings);
    } catch (error) {
      setDetail(error instanceof Error ? error.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  };

  const saveSettings = () => {
    if (!settings) return;
    void perform((activeClient, activeToken) =>
      activeClient.updateSettings(activeToken, settings),
    );
  };

  const startServer = () => {
    if (!settings) return;
    void perform(async (activeClient, activeToken) => {
      await activeClient.updateSettings(activeToken, settings);
      return activeClient.startServer(activeToken);
    });
  };

  const stopServer = () => {
    void perform((activeClient, activeToken) =>
      activeClient.stopServer(activeToken),
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

        {state === "setup" && <OfflineSetup />}
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
              style={primaryButtonStyle}
            >
              Allow Linux controller access
            </button>
            <details style={detailsStyle}>
              <summary>Linux setup and recovery</summary>
              <OfflineSetup compact />
            </details>
          </>
        )}
        {state === "connected" && status && settings && (
          <ControllerPanel
            busy={busy}
            detail={detail}
            onChange={setSettings}
            onRefresh={() =>
              void perform((activeClient, activeToken) =>
                activeClient.status(activeToken),
              )
            }
            onSave={saveSettings}
            onStart={startServer}
            onStop={stopServer}
            settings={settings}
            status={status}
          />
        )}
        {state === "error" && (
          <>
            <p style={errorStyle}>Could not connect to the Linux controller</p>
            <p style={bodyStyle}>{detail}</p>
            <button
              type="button"
              onClick={() => void connect()}
              style={primaryButtonStyle}
            >
              Try again
            </button>
            <details style={detailsStyle}>
              <summary>Linux setup and recovery</summary>
              <OfflineSetup compact />
            </details>
          </>
        )}

        {state === "permission-required" && detail && (
          <p style={errorDetailStyle}>{detail}</p>
        )}
      </section>
    </main>
  );
}

function ControllerPanel({
  busy,
  detail,
  onChange,
  onRefresh,
  onSave,
  onStart,
  onStop,
  settings,
  status,
}: {
  busy: boolean;
  detail: string;
  onChange: (settings: ControllerSettings) => void;
  onRefresh: () => void;
  onSave: () => void;
  onStart: () => void;
  onStop: () => void;
  settings: ControllerSettings;
  status: ControllerStatus;
}) {
  const running = status.server.state === "running";
  const active = status.server.state !== "stopped";
  const stateLabel =
    status.server.state === "error"
      ? "Server error"
      : running
        ? "Serving"
        : status.server.state === "stopping"
          ? "Stopping"
          : "Stopped";
  return (
    <>
      <div style={statusRowStyle}>
        <div>
          <div style={running ? successStyle : stoppedStyle}>{stateLabel}</div>
          <div style={mutedStyle}>Linux component v{status.version}</div>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={onRefresh}
          style={secondaryButtonStyle}
        >
          Refresh
        </button>
      </div>

      {status.server.url && (
        <a
          href={status.server.url}
          target="_blank"
          rel="noreferrer"
          style={serverUrlStyle}
        >
          {status.server.url}
        </a>
      )}

      <fieldset disabled={busy || active} style={fieldsetStyle}>
        <label style={labelStyle}>
          Folder to serve
          <input
            aria-label="Folder to serve"
            value={settings.root}
            onChange={(event) =>
              onChange({ ...settings, root: event.target.value })
            }
            style={inputStyle}
          />
        </label>
        <p style={hintStyle}>
          Use a folder under Linux files, or share a ChromeOS folder with Linux
          first and enter its <code>/mnt/chromeos/…</code> path.
        </p>
        <label style={labelStyle}>
          Port
          <input
            aria-label="Port"
            min={1024}
            max={65535}
            type="number"
            value={settings.port}
            onChange={(event) =>
              onChange({ ...settings, port: Number(event.target.value) })
            }
            style={inputStyle}
          />
        </label>
        <label style={checkboxStyle}>
          <input
            checked={settings.directoryListing}
            type="checkbox"
            onChange={(event) =>
              onChange({
                ...settings,
                directoryListing: event.target.checked,
              })
            }
          />
          Show directory listings
        </label>
        <label style={checkboxStyle}>
          <input
            checked={settings.spa}
            type="checkbox"
            onChange={(event) =>
              onChange({ ...settings, spa: event.target.checked })
            }
          />
          Single-page app fallback
        </label>
        <label style={checkboxStyle}>
          <input
            checked={settings.cors}
            type="checkbox"
            onChange={(event) =>
              onChange({ ...settings, cors: event.target.checked })
            }
          />
          Allow cross-origin requests
        </label>
        <label style={checkboxStyle}>
          <input
            checked={settings.lan}
            type="checkbox"
            onChange={(event) =>
              onChange({ ...settings, lan: event.target.checked })
            }
          />
          Listen for Chromebook LAN forwarding
        </label>
        {settings.lan && (
          <p style={warningStyle}>
            LAN access still requires adding TCP port {settings.port} in
            ChromeOS Linux port-forwarding settings. Never forward controller
            port 20080.
          </p>
        )}
      </fieldset>

      {detail && <p style={errorDetailStyle}>{detail}</p>}
      {status.server.error && (
        <p style={errorDetailStyle}>{status.server.error}</p>
      )}
      <div style={actionRowStyle}>
        {active ? (
          <button
            type="button"
            disabled={busy}
            onClick={onStop}
            style={stopButtonStyle}
          >
            {busy ? "Stopping…" : "Stop server"}
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={onStart}
            style={primaryButtonStyle}
          >
            {busy ? "Starting…" : "Start server"}
          </button>
        )}
        {!active && (
          <button
            type="button"
            disabled={busy}
            onClick={onSave}
            style={secondaryButtonStyle}
          >
            Save settings
          </button>
        )}
      </div>
    </>
  );
}

function OfflineSetup({ compact = false }: { compact?: boolean }) {
  return (
    <div style={compact ? compactSetupStyle : bodyStyle}>
      {!compact && <h2 style={subheadingStyle}>Set up the Linux version</h2>}
      <ol style={stepsStyle}>
        <li>
          Open ChromeOS Settings → About ChromeOS → Developers → Linux
          development environment and choose <strong>Set up</strong>.
        </li>
        <li>Open Terminal once after Linux finishes installing.</li>
        <li>
          Install the 200 OK Linux component. The verified public installer is
          not published yet; this source build is currently for testbed
          validation only.
        </li>
        <li>
          After installation, launch <strong>200 OK Linux</strong> from the
          ChromeOS Launcher whenever you want to use it after a reboot.
        </li>
      </ol>
      <p style={mutedStyle}>
        If the Linux setting is unavailable, your Chromebook, profile, or
        administrator may not allow Linux applications.
      </p>
    </div>
  );
}

export function readLaunchParameters(): CrostiniLaunch | null {
  const parameters = new URLSearchParams(window.location.search);
  const instanceId = parameters.get("instanceId");
  const port = Number(parameters.get("port"));
  const claimedValue = parameters.get("claimed");
  const claimCode = parameters.get("claimCode") ?? undefined;
  if (
    !instanceId ||
    !/^[A-Za-z0-9._-]{1,64}$/.test(instanceId) ||
    !Number.isInteger(port) ||
    port < 1024 ||
    port > 65_535 ||
    (claimedValue !== "true" && claimedValue !== "false")
  ) {
    return null;
  }
  const claimed = claimedValue === "true";
  if (
    (claimed && claimCode !== undefined) ||
    (!claimed && !/^[A-Fa-f0-9]{64}$/.test(claimCode ?? ""))
  ) {
    return null;
  }
  return { claimed, claimCode, instanceId, port };
}

const pageStyle = {
  minHeight: "100vh",
  boxSizing: "border-box" as const,
  margin: 0,
  padding: "clamp(18px, 5vw, 48px) 16px",
  background: "#f4f7fb",
  color: "#172033",
  fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
};

const cardStyle = {
  maxWidth: 620,
  margin: "0 auto",
  padding: "clamp(20px, 4vw, 30px)",
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
const subheadingStyle = { margin: "0 0 12px", fontSize: 19 };
const bodyStyle = { color: "#4d5b70", lineHeight: 1.55 };
const mutedStyle = { color: "#77849a", fontSize: 13, lineHeight: 1.45 };
const compactSetupStyle = { ...bodyStyle, fontSize: 14, marginTop: 14 };
const stepsStyle = { paddingLeft: 22, lineHeight: 1.55 };
const successStyle = { color: "#16824a", fontSize: 18, fontWeight: 700 };
const stoppedStyle = { color: "#526174", fontSize: 18, fontWeight: 700 };
const errorStyle = { color: "#bd2f2f", fontSize: 18, fontWeight: 700 };
const errorDetailStyle = { color: "#a92626", fontSize: 13, lineHeight: 1.45 };
const warningStyle = {
  padding: 10,
  borderRadius: 8,
  background: "#fff7d6",
  color: "#665700",
  fontSize: 13,
  lineHeight: 1.45,
};
const detailsStyle = { marginTop: 18, color: "#4d5b70" };
const statusRowStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 16,
  marginBottom: 16,
};
const serverUrlStyle = {
  display: "block",
  marginBottom: 16,
  color: "#1d58b7",
  overflowWrap: "anywhere" as const,
};
const fieldsetStyle = {
  display: "grid",
  gap: 12,
  margin: 0,
  padding: 0,
  border: 0,
};
const labelStyle = {
  display: "grid",
  gap: 5,
  color: "#354258",
  fontSize: 13,
  fontWeight: 650,
};
const inputStyle = {
  boxSizing: "border-box" as const,
  width: "100%",
  padding: "9px 10px",
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  color: "#172033",
  font: "inherit",
};
const hintStyle = { ...mutedStyle, margin: "-5px 0 1px" };
const checkboxStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  color: "#354258",
  fontSize: 14,
};
const actionRowStyle = {
  display: "flex",
  flexWrap: "wrap" as const,
  gap: 10,
  marginTop: 20,
};
const primaryButtonStyle = {
  padding: "10px 15px",
  border: 0,
  borderRadius: 9,
  background: "#f8d203",
  color: "#1a1a1a",
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 700,
};
const secondaryButtonStyle = {
  ...primaryButtonStyle,
  border: "1px solid #cbd5e1",
  background: "white",
  color: "#354258",
};
const stopButtonStyle = {
  ...primaryButtonStyle,
  background: "#bd2f2f",
  color: "white",
};
