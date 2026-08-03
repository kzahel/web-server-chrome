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
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<ControllerStatus | null>(null);
  const [settings, setSettings] = useState<ControllerSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [updateMessage, setUpdateMessage] = useState("");

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

      const session = await client.openSession(controllerToken);
      const nextStatus = session.status;
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
      setSessionId(session.sessionId);
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

  useEffect(() => {
    if (!client || !token || !sessionId) return;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      void client.closeSession(token, sessionId, true).catch(() => undefined);
    };
    const heartbeat = window.setInterval(() => {
      void client
        .heartbeatSession(token, sessionId)
        .then((session) => {
          setStatus(session.status);
          setSettings(session.status.settings);
        })
        .catch((error) => {
          setDetail(
            error instanceof Error
              ? error.message
              : "The Linux control session expired.",
          );
          setState("error");
        });
    }, 20_000);
    window.addEventListener("pagehide", release);
    return () => {
      window.clearInterval(heartbeat);
      window.removeEventListener("pagehide", release);
      release();
    };
  }, [client, sessionId, token]);

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
    setUpdateMessage("");
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
    if (!settings || !sessionId) return;
    void perform(async (activeClient, activeToken) => {
      await activeClient.updateSettings(activeToken, settings);
      return activeClient.startServer(activeToken, sessionId);
    });
  };

  const stopServer = () => {
    void perform((activeClient, activeToken) =>
      activeClient.stopServer(activeToken),
    );
  };

  const checkUpdate = () => {
    void perform((activeClient, activeToken) =>
      activeClient.checkUpdate(activeToken),
    );
  };

  const installUpdate = async () => {
    if (!client || !token || !status) return;
    const wasRunning = status.server.state !== "stopped";
    if (
      wasRunning &&
      !window.confirm(
        "Updating stops the web server and does not restart it automatically. Continue?",
      )
    ) {
      return;
    }

    setBusy(true);
    setDetail("");
    setUpdateMessage("");
    const previousVersion = status.version;
    try {
      if (wasRunning) {
        const stopped = await client.stopServer(token);
        setStatus(stopped);
        setSettings(stopped.settings);
      }
      const scheduled = await client.installUpdate(token);
      setStatus(scheduled);
      setSettings(scheduled.settings);
      if (scheduled.update.state !== "installing") {
        setUpdateMessage("The Linux component is already current.");
        return;
      }
      setUpdateMessage(
        "Installing the signed update. The controller will briefly reconnect…",
      );

      for (let attempt = 0; attempt < 90; attempt += 1) {
        await delay(1_000);
        try {
          const health = await client.health();
          validateControllerHealth(health, status.instanceId);
          const nextStatus = await client.status(token);
          setStatus(nextStatus);
          setSettings(nextStatus.settings);
          if (nextStatus.version !== previousVersion) {
            setUpdateMessage(
              `Updated to Linux component v${nextStatus.version}. The web server remains stopped.`,
            );
            return;
          }
          if (nextStatus.update.state === "error") {
            setDetail(
              nextStatus.update.error || "The Linux component update failed.",
            );
            setUpdateMessage("");
            return;
          }
        } catch {
          // The controller is expected to disappear briefly during replacement.
        }
      }
      setDetail(
        "The update is taking longer than expected. Launch 200 OK Linux again, or run ‘ok200-crostini update’ in Terminal.",
      );
      setUpdateMessage("");
    } catch (error) {
      setDetail(error instanceof Error ? error.message : "Update failed.");
      setUpdateMessage("");
    } finally {
      setBusy(false);
    }
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
            onCheckUpdate={checkUpdate}
            onInstallUpdate={() => void installUpdate()}
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
            updateMessage={updateMessage}
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
  onCheckUpdate,
  onInstallUpdate,
  onRefresh,
  onSave,
  onStart,
  onStop,
  settings,
  status,
  updateMessage,
}: {
  busy: boolean;
  detail: string;
  onChange: (settings: ControllerSettings) => void;
  onCheckUpdate: () => void;
  onInstallUpdate: () => void;
  onRefresh: () => void;
  onSave: () => void;
  onStart: () => void;
  onStop: () => void;
  settings: ControllerSettings;
  status: ControllerStatus;
  updateMessage: string;
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
        <label style={checkboxStyle}>
          <input
            checked={settings.automaticUpdates}
            type="checkbox"
            onChange={(event) =>
              onChange({
                ...settings,
                automaticUpdates: event.target.checked,
              })
            }
          />
          Automatically install Linux component updates (recommended)
        </label>
        <p style={hintStyle}>
          Checks run only while Linux is already active. Automatic installation
          waits until the web server is stopped.
        </p>
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

      <section style={updateSectionStyle}>
        <div style={updateHeaderStyle}>
          <div>
            <strong>Linux component updates</strong>
            <div style={mutedStyle}>{updateStatusLabel(status)}</div>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onCheckUpdate}
            style={secondaryButtonStyle}
          >
            {status.update.state === "checking" ? "Checking…" : "Check now"}
          </button>
        </div>
        {status.update.state === "available" && (
          <button
            type="button"
            disabled={busy}
            onClick={onInstallUpdate}
            style={primaryButtonStyle}
          >
            Update to v{status.update.availableVersion}
          </button>
        )}
        {status.update.state === "installing" && (
          <p style={mutedStyle}>Installing and reconnecting…</p>
        )}
        {updateMessage && <p style={noticeStyle}>{updateMessage}</p>}
        {status.update.error && (
          <p style={errorDetailStyle}>{status.update.error}</p>
        )}
        <details style={detailsStyle}>
          <summary>Update recovery</summary>
          <p style={mutedStyle}>
            If an update causes trouble, run{" "}
            <code>ok200-crostini rollback</code> in Terminal. Rollback is local
            and does not need Internet access.
          </p>
        </details>
      </section>
    </>
  );
}

function updateStatusLabel(status: ControllerStatus): string {
  switch (status.update.state) {
    case "available":
      return `v${status.update.availableVersion} is available; currently v${status.version}.`;
    case "checking":
      return `Checking for an update; currently v${status.version}.`;
    case "installing":
      return `Installing an update; currently v${status.version}.`;
    case "error":
      return `Could not check for updates; currently v${status.version}.`;
    default:
      return status.update.lastCheckedAt
        ? `v${status.version} is current. Last checked ${new Date(
            status.update.lastCheckedAt * 1_000,
          ).toLocaleString()}.`
        : `Currently v${status.version}. An automatic check is pending.`;
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
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
          Install the 200 OK Linux component with the verified installer:
          <code style={commandStyle}>
            curl -fsSL https://ok200.app/install-crostini.sh | bash
          </code>
          <span style={{ ...mutedStyle, display: "block" }}>
            The installer selects the x86_64 or ARM64 release, verifies its
            signed manifest, and installs only for your Linux user. It does not
            use sudo or start the web server automatically.
          </span>
        </li>
        <li>
          After installation, launch <strong>200 OK Linux</strong> from the
          ChromeOS Launcher whenever you want to use it after a reboot.
        </li>
        <li>
          If the Launcher item cannot wake Linux, open Terminal once, wait for
          its prompt, close it, and try <strong>200 OK Linux</strong> again.
        </li>
      </ol>
      <p style={mutedStyle}>
        If the Linux setting is unavailable, your Chromebook, profile, or
        administrator may not allow Linux applications.
      </p>
      <details style={detailsStyle}>
        <summary>Folders under Linux files</summary>
        <p style={mutedStyle}>
          The default folder is <code>~/Downloads/200 OK</code>. To serve a
          Chromebook folder, right-click it in the Files app, choose
          <strong> Share with Linux</strong>, then enter its
          <code> /mnt/chromeos/…</code> path in the controller. Unshared
          ChromeOS folders are intentionally unavailable to Linux.
        </p>
      </details>
      <details style={detailsStyle}>
        <summary>Reach the server from another device</summary>
        <p style={mutedStyle}>
          First start the server. Then open ChromeOS Settings → About ChromeOS →
          Developers → Linux development environment → Port forwarding, add the
          content port shown in the controller (8080 by default) as TCP, and
          turn it on. Use your Chromebook&apos;s Wi-Fi IPv4 address from its
          network details. Never forward controller port 20080.
        </p>
      </details>
      <details style={detailsStyle}>
        <summary>Update, rollback, and uninstall commands</summary>
        <code style={commandStyle}>
          ok200-crostini check-update{"\n"}
          ok200-crostini update{"\n"}
          ok200-crostini rollback{"\n"}
          ok200-crostini uninstall
        </code>
        <p style={mutedStyle}>
          Uninstall preserves settings. Use <code>uninstall --purge</code> only
          when you also want to remove pairing and controller settings. Served
          folders are never deleted.
        </p>
      </details>
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
const commandStyle = {
  display: "block",
  boxSizing: "border-box" as const,
  margin: "8px 0",
  padding: "10px 12px",
  borderRadius: 8,
  background: "#edf2f7",
  color: "#172033",
  fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
  fontSize: 12,
  lineHeight: 1.5,
  overflowWrap: "anywhere" as const,
  whiteSpace: "pre-wrap" as const,
};
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
const updateSectionStyle = {
  display: "grid",
  gap: 12,
  marginTop: 24,
  paddingTop: 20,
  borderTop: "1px solid #e2e8f0",
};
const updateHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 14,
};
const noticeStyle = {
  margin: 0,
  padding: 10,
  borderRadius: 8,
  background: "#eaf7ef",
  color: "#12663c",
  fontSize: 13,
  lineHeight: 1.45,
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
