import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type ControllerSettings,
  type ControllerStatus,
  CrostiniControllerClient,
  controllerTokenKey,
  type FolderListing,
  type FolderRoot,
  validateControllerHealth,
} from "../lib/crostini-controller";
import {
  CROSTINI_HOST_PERMISSION,
  type CrostiniLaunch,
} from "../lib/crostini-launch";
import "./crostini.css";

type ControllerState =
  | "setup"
  | "checking-permission"
  | "permission-required"
  | "connecting"
  | "connected"
  | "error";

type ServerPending = "starting" | "stopping" | null;

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
  const [busy, setBusy] = useState(false);
  const [serverPending, setServerPending] = useState<ServerPending>(null);
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
      validateControllerHealth(
        {
          claimed: true,
          instanceId: session.status.instanceId,
          product: session.status.product,
          protocolVersion: session.status.protocolVersion,
          version: session.status.version,
        },
        launch.instanceId,
      );
      setToken(controllerToken);
      setSessionId(session.sessionId);
      setStatus(session.status);
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
    let syncing = false;
    const release = () => {
      if (released) return;
      released = true;
      void client.closeSession(token, sessionId, true).catch(() => undefined);
    };
    const sync = async () => {
      if (syncing || released) return;
      syncing = true;
      try {
        const session = await client.heartbeatSession(token, sessionId);
        setStatus(session.status);
      } catch (error) {
        setDetail(
          error instanceof Error
            ? error.message
            : "The Linux control session expired.",
        );
        setState("error");
      } finally {
        syncing = false;
      }
    };
    const heartbeat = window.setInterval(() => void sync(), 15_000);
    const syncWhenFocused = () => void sync();
    window.addEventListener("focus", syncWhenFocused);
    window.addEventListener("pagehide", release);
    return () => {
      window.clearInterval(heartbeat);
      window.removeEventListener("focus", syncWhenFocused);
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
    if (!client || !token) return null;
    setBusy(true);
    setDetail("");
    setUpdateMessage("");
    try {
      const nextStatus = await action(client, token);
      setStatus(nextStatus);
      return nextStatus;
    } catch (error) {
      setDetail(error instanceof Error ? error.message : "Action failed.");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const changeSettings = (partial: Partial<ControllerSettings>) => {
    if (!status) return;
    void perform((activeClient, activeToken) =>
      activeClient.updateSettings(activeToken, {
        ...status.settings,
        ...partial,
      }),
    );
  };

  const toggleServer = async () => {
    if (!client || !token || !sessionId || !status || serverPending) return;
    const running = status.server.state === "running";
    setServerPending(running ? "stopping" : "starting");
    setDetail("");
    try {
      const nextStatus = running
        ? await client.stopServer(token)
        : await client.startServer(token, sessionId);
      setStatus(nextStatus);
    } catch (error) {
      setDetail(
        error instanceof Error ? error.message : "Server action failed.",
      );
    } finally {
      setServerPending(null);
    }
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
        setStatus(await client.stopServer(token));
      }
      const scheduled = await client.installUpdate(token);
      setStatus(scheduled);
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
          const session = await client.openSession(token);
          setSessionId(session.sessionId);
          setStatus(session.status);
          if (session.status.version !== previousVersion) {
            setUpdateMessage(
              `Updated to Linux component v${session.status.version}. The web server remains stopped.`,
            );
            return;
          }
          if (session.status.update.state === "error") {
            setDetail(
              session.status.update.error ||
                "The Linux component update failed.",
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
    <main className="crostini-page">
      <div className="crostini-shell">
        <ProductHeader connected={state === "connected"} />

        {state === "setup" && (
          <section className="surface setup-surface">
            <OfflineSetup />
          </section>
        )}
        {state === "checking-permission" && (
          <LoadingSurface label="Checking Linux access…" />
        )}
        {state === "connecting" && (
          <LoadingSurface label="Connecting to your Linux controller…" />
        )}
        {state === "permission-required" && (
          <section className="surface permission-surface">
            <div className="surface-icon surface-icon-accent">
              <LinkIcon />
            </div>
            <div>
              <h2>Connect to Linux</h2>
              <p>
                Allow 200 OK to communicate with your Chromebook&apos;s Linux
                environment at <code>penguin.linux.test</code>. This private
                address stays on your Chromebook.
              </p>
            </div>
            <button
              type="button"
              onClick={requestPermission}
              className="button button-primary"
            >
              Allow Linux access
            </button>
            <details className="disclosure">
              <summary>Linux setup and recovery</summary>
              <OfflineSetup compact />
            </details>
          </section>
        )}
        {state === "connected" && status && client && token && (
          <ControllerPanel
            busy={busy}
            client={client}
            detail={detail}
            onChangeSettings={changeSettings}
            onCheckUpdate={checkUpdate}
            onInstallUpdate={() => void installUpdate()}
            onStatus={setStatus}
            onToggleServer={() => void toggleServer()}
            serverPending={serverPending}
            status={status}
            token={token}
            updateMessage={updateMessage}
          />
        )}
        {state === "error" && (
          <section className="surface error-surface" role="alert">
            <div className="surface-icon surface-icon-error">
              <WarningIcon />
            </div>
            <div>
              <h2>Couldn&apos;t connect to Linux</h2>
              <p>{detail}</p>
            </div>
            <button
              type="button"
              onClick={() => void connect()}
              className="button button-primary"
            >
              <RefreshIcon />
              Try again
            </button>
            <details className="disclosure">
              <summary>Linux setup and recovery</summary>
              <OfflineSetup compact />
            </details>
          </section>
        )}

        {state === "permission-required" && detail && (
          <div className="inline-alert" role="alert">
            {detail}
          </div>
        )}
      </div>
    </main>
  );
}

function ProductHeader({ connected }: { connected: boolean }) {
  return (
    <header className="product-header">
      <img src="../../icons/ok-48.png" width={44} height={44} alt="" />
      <div className="product-title">
        <h1>200 OK</h1>
        <span>Web Server for ChromeOS Linux</span>
      </div>
      {connected && (
        <div className="connection-pill">
          <span aria-hidden="true" />
          Linux connected
        </div>
      )}
    </header>
  );
}

function LoadingSurface({ label }: { label: string }) {
  return (
    <section className="surface loading-surface" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <p>{label}</p>
    </section>
  );
}

function ControllerPanel({
  busy,
  client,
  detail,
  onChangeSettings,
  onCheckUpdate,
  onInstallUpdate,
  onStatus,
  onToggleServer,
  serverPending,
  status,
  token,
  updateMessage,
}: {
  busy: boolean;
  client: CrostiniControllerClient;
  detail: string;
  onChangeSettings: (partial: Partial<ControllerSettings>) => void;
  onCheckUpdate: () => void;
  onInstallUpdate: () => void;
  onStatus: (status: ControllerStatus) => void;
  onToggleServer: () => void;
  serverPending: ServerPending;
  status: ControllerStatus;
  token: string;
  updateMessage: string;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const running = status.server.state === "running";
  const active = running || serverPending === "starting";
  const settingsLocked = running || serverPending !== null || busy;
  const stateLabel = serverPending
    ? serverPending === "starting"
      ? "Starting"
      : "Stopping"
    : status.server.state === "error"
      ? "Error"
      : running
        ? "Running"
        : status.server.state === "stopping"
          ? "Stopping"
          : "Stopped";
  const stateDetail = running
    ? status.settings.keepServingOnClose
      ? "Serving continues when this window closes"
      : "Serving stops when this window closes"
    : status.server.error || "Choose a folder, then turn the server on";

  return (
    <div className="controller-stack">
      <section
        className={`surface server-surface ${running ? "is-running" : ""}`}
        aria-live="polite"
      >
        <div className="surface-icon surface-icon-accent">
          <PowerIcon />
        </div>
        <div className="server-copy">
          <div className="section-label">Web server</div>
          <div className="server-state">{stateLabel}</div>
          <p>{stateDetail}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={active}
          aria-label={running ? "Stop web server" : "Start web server"}
          title={running ? "Stop web server" : "Start web server"}
          className="server-switch"
          disabled={busy || serverPending !== null}
          onClick={onToggleServer}
          data-testid="server-toggle"
        >
          <span />
        </button>
      </section>

      {status.server.url && (
        <UrlCard label="This Chromebook" url={status.server.url} />
      )}

      <section className="surface settings-surface">
        <div className="section-heading">
          <div>
            <div className="section-label">Content</div>
            <h2>Folder and address</h2>
          </div>
          {settingsLocked && (
            <span className="locked-note">Stop to make changes</span>
          )}
        </div>

        <button
          type="button"
          className="folder-control"
          disabled={settingsLocked}
          onClick={() => setPickerOpen(true)}
          data-testid="choose-folder"
        >
          <span className="setting-icon">
            <FolderIcon />
          </span>
          <span className="folder-copy">
            <strong>{folderName(status.settings.root)}</strong>
            <span title={status.settings.root}>{status.settings.root}</span>
          </span>
          <span className="folder-action">Change</span>
          <ChevronRightIcon />
        </button>

        <div className="setting-row port-row">
          <span className="setting-icon">
            <GlobeIcon />
          </span>
          <label htmlFor="content-port">
            <strong>Port</strong>
            <span>Used in the server address</span>
          </label>
          <PortInput
            disabled={settingsLocked}
            onCommit={(port) => onChangeSettings({ port })}
            value={status.settings.port}
          />
        </div>

        <SettingSwitch
          checked={status.settings.lan}
          description="Allow ChromeOS to forward this port to your network"
          disabled={settingsLocked}
          icon={<NetworkIcon />}
          label="Available on local network"
          onChange={(lan) => onChangeSettings({ lan })}
        />
      </section>

      {status.settings.lan && <LanAccessCard status={status} />}

      <section className="surface behavior-surface">
        <div className="section-heading compact-heading">
          <div>
            <div className="section-label">Server lifetime</div>
            <h2>When controls close</h2>
          </div>
        </div>
        <SettingSwitch
          checked={status.settings.keepServingOnClose}
          description={
            status.settings.keepServingOnClose
              ? "The server keeps running until you stop it or Linux shuts down"
              : "The server stops after the final 200 OK control window closes"
          }
          disabled={settingsLocked}
          icon={<WindowIcon />}
          label="Keep serving when controls close"
          onChange={(keepServingOnClose) =>
            onChangeSettings({ keepServingOnClose })
          }
        />
      </section>

      {(detail || status.server.error) && (
        <div className="inline-alert" role="alert">
          <WarningIcon />
          <span>{detail || status.server.error}</span>
        </div>
      )}

      <details className="surface advanced-surface">
        <summary>
          <span className="summary-icon">
            <SettingsIcon />
          </span>
          <span>
            <strong>Advanced</strong>
            <small>Directory behavior, access, and updates</small>
          </span>
          <ChevronDownIcon />
        </summary>
        <div className="advanced-content">
          <SettingSwitch
            checked={status.settings.directoryListing}
            description="Show an index when a folder has no index file"
            disabled={settingsLocked}
            label="Directory listings"
            onChange={(directoryListing) =>
              onChangeSettings({ directoryListing })
            }
          />
          <SettingSwitch
            checked={status.settings.spa}
            description="Serve index.html for routes that do not match a file"
            disabled={settingsLocked}
            label="Single-page app fallback"
            onChange={(spa) => onChangeSettings({ spa })}
          />
          <SettingSwitch
            checked={status.settings.cors}
            description="Allow pages on other origins to request these files"
            disabled={settingsLocked}
            label="Cross-origin requests"
            onChange={(cors) => onChangeSettings({ cors })}
          />
          <SettingSwitch
            checked={status.settings.automaticUpdates}
            description="Install signed Linux component updates while stopped"
            disabled={settingsLocked}
            label="Automatic Linux updates"
            onChange={(automaticUpdates) =>
              onChangeSettings({ automaticUpdates })
            }
          />

          <div className="update-panel">
            <div>
              <strong>Linux component v{status.version}</strong>
              <p>{updateStatusLabel(status)}</p>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={onCheckUpdate}
              className="button button-secondary button-small"
            >
              <RefreshIcon />
              {status.update.state === "checking" ? "Checking…" : "Check now"}
            </button>
          </div>
          {status.update.state === "available" && (
            <button
              type="button"
              disabled={busy}
              onClick={onInstallUpdate}
              className="button button-primary"
            >
              Update to v{status.update.availableVersion}
            </button>
          )}
          {updateMessage && <p className="notice-copy">{updateMessage}</p>}
          {status.update.error && (
            <p className="error-copy">{status.update.error}</p>
          )}
        </div>
      </details>

      <details className="help-disclosure">
        <summary>Setup, sharing, and recovery</summary>
        <OfflineSetup compact />
      </details>

      <footer className="controller-footer">
        <span>Linux component v{status.version}</span>
        <span aria-hidden="true">•</span>
        <span>Controller port 20080 stays private</span>
      </footer>

      {pickerOpen && (
        <FolderPicker
          client={client}
          currentRoot={status.settings.root}
          onClose={() => setPickerOpen(false)}
          onSelected={(nextStatus) => {
            onStatus(nextStatus);
            setPickerOpen(false);
          }}
          token={token}
        />
      )}
    </div>
  );
}

function PortInput({
  disabled,
  onCommit,
  value,
}: {
  disabled: boolean;
  onCommit: (port: number) => void;
  value: number;
}) {
  const [draft, setDraft] = useState(String(value));
  const [error, setError] = useState(false);

  useEffect(() => setDraft(String(value)), [value]);

  const commit = () => {
    const port = Number(draft);
    if (
      !Number.isInteger(port) ||
      port < 1024 ||
      port > 65_535 ||
      port === 20_080
    ) {
      setError(true);
      setDraft(String(value));
      return;
    }
    setError(false);
    if (port !== value) onCommit(port);
  };

  return (
    <input
      id="content-port"
      className={error ? "port-input has-error" : "port-input"}
      disabled={disabled}
      inputMode="numeric"
      min={1024}
      max={65_535}
      type="number"
      value={draft}
      aria-invalid={error}
      aria-label="Content port"
      onBlur={commit}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
    />
  );
}

function SettingSwitch({
  checked,
  description,
  disabled,
  icon,
  label,
  onChange,
}: {
  checked: boolean;
  description: string;
  disabled: boolean;
  icon?: React.ReactNode;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="setting-row switch-row">
      {icon && <span className="setting-icon">{icon}</span>}
      <div className="setting-copy">
        <strong>{label}</strong>
        <span>{description}</span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className="mini-switch"
        disabled={disabled}
        onClick={() => onChange(!checked)}
      >
        <span />
      </button>
    </div>
  );
}

function UrlCard({ label, url }: { label: string; url: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="surface url-surface">
      <div className="surface-icon surface-icon-success">
        <GlobeIcon />
      </div>
      <div className="url-copy">
        <div className="section-label">{label}</div>
        <a href={url} target="_blank" rel="noreferrer" title="Open server">
          {url}
        </a>
      </div>
      <div className="url-actions">
        <a
          className="icon-button"
          href={url}
          target="_blank"
          rel="noreferrer"
          aria-label="Open server URL"
          title="Open"
        >
          <ExternalLinkIcon />
        </a>
        <button
          type="button"
          className="icon-button"
          aria-label={copied ? "URL copied" : "Copy server URL"}
          title={copied ? "Copied" : "Copy"}
          onClick={() => void copy()}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
        </button>
      </div>
      {copied && <output className="copy-toast">Copied</output>}
    </section>
  );
}

function LanAccessCard({ status }: { status: ControllerStatus }) {
  const storageKey = `ok200-crostini-lan-host:${status.instanceId}`;
  const [address, setAddress] = useState(
    () => localStorage.getItem(storageKey) ?? "",
  );
  const host = validIpv4(address) ? address : null;
  const url = host ? `http://${host}:${status.settings.port}/` : null;

  return (
    <section className="surface lan-surface">
      <div className="section-heading compact-heading">
        <div>
          <div className="section-label">Local network</div>
          <h2>Finish ChromeOS forwarding</h2>
        </div>
        <span className="step-pill">2 steps</span>
      </div>
      <ol className="lan-steps">
        <li>
          <span>1</span>
          <p>
            In ChromeOS Settings, open{" "}
            <strong>Developers → Linux → Port forwarding</strong> and add TCP
            port {status.settings.port}.
          </p>
        </li>
        <li>
          <span>2</span>
          <div className="lan-address-field">
            <label htmlFor="chromebook-address">Chromebook IPv4 address</label>
            <input
              id="chromebook-address"
              value={address}
              inputMode="decimal"
              placeholder="192.168.1.42"
              aria-invalid={address.length > 0 && !host}
              onChange={(event) => {
                const value = event.target.value.trim();
                setAddress(value);
                if (validIpv4(value)) localStorage.setItem(storageKey, value);
              }}
            />
            <small>Find it in your connected Wi-Fi network details.</small>
          </div>
        </li>
      </ol>
      {url && status.server.state === "running" && (
        <UrlCard label="Other devices" url={url} />
      )}
      <p className="security-note">
        <LockIcon /> Controller port 20080 stays on this Chromebook and should
        never be forwarded.
      </p>
    </section>
  );
}

function FolderPicker({
  client,
  currentRoot,
  onClose,
  onSelected,
  token,
}: {
  client: CrostiniControllerClient;
  currentRoot: string;
  onClose: () => void;
  onSelected: (status: ControllerStatus) => void;
  token: string;
}) {
  const preferredRoot = currentRoot.startsWith("/mnt/chromeos/")
    ? "shared-chromeos"
    : "linux-files";
  const [roots, setRoots] = useState<FolderRoot[]>([]);
  const [rootId, setRootId] = useState(preferredRoot);
  const [listing, setListing] = useState<FolderListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const loadListing = useCallback(
    async (nextRootId: string, path: string[]) => {
      setLoading(true);
      setError("");
      try {
        const next = await client.listFolders(token, nextRootId, path);
        setRootId(nextRootId);
        setListing(next);
      } catch (caught) {
        setListing(null);
        setError(
          caught instanceof Error ? caught.message : "Could not open folder.",
        );
      } finally {
        setLoading(false);
      }
    },
    [client, token],
  );

  const refreshRoots = useCallback(
    async (openPreferred = false) => {
      try {
        const next = await client.folderRoots(token);
        setRoots(next.roots);
        const selectedId = openPreferred ? preferredRoot : rootId;
        const selected = next.roots.find((root) => root.id === selectedId);
        if (selected?.available) {
          const path =
            !openPreferred && listing?.rootId === selectedId
              ? listing.path
              : [];
          await loadListing(selectedId, path);
        } else {
          setRootId(selectedId);
          setListing(null);
          setLoading(false);
        }
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Could not read folder locations.",
        );
        setLoading(false);
      }
    },
    [
      client,
      listing?.path,
      listing?.rootId,
      loadListing,
      preferredRoot,
      rootId,
      token,
    ],
  );

  useEffect(() => {
    let cancelled = false;
    const initialize = async () => {
      setLoading(true);
      try {
        const next = await client.folderRoots(token);
        if (cancelled) return;
        setRoots(next.roots);
        const selected = next.roots.find((root) => root.id === preferredRoot);
        if (selected?.available) {
          await loadListing(preferredRoot, []);
        } else {
          setRootId(preferredRoot);
          setListing(null);
          setLoading(false);
        }
      } catch (caught) {
        if (cancelled) return;
        setError(
          caught instanceof Error
            ? caught.message
            : "Could not read folder locations.",
        );
        setLoading(false);
      }
    };
    void initialize();
    return () => {
      cancelled = true;
    };
  }, [client, loadListing, preferredRoot, token]);

  const selectedRoot = roots.find((root) => root.id === rootId);
  const waitingForShare =
    rootId === "shared-chromeos" && selectedRoot?.available === false;

  const folderLabel = (component: string, depth: number) =>
    rootId === "shared-chromeos" && depth === 0 && component === "MyFiles"
      ? "My files"
      : component;

  useEffect(() => {
    const refresh = () => void refreshRoots(false);
    window.addEventListener("focus", refresh);
    const interval = waitingForShare
      ? window.setInterval(refresh, 2_500)
      : undefined;
    return () => {
      window.removeEventListener("focus", refresh);
      if (interval !== undefined) window.clearInterval(interval);
    };
  }, [refreshRoots, waitingForShare]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const chooseRoot = (root: FolderRoot) => {
    setRootId(root.id);
    setListing(null);
    setError("");
    if (root.available) void loadListing(root.id, []);
  };

  const createFolder = async () => {
    if (!listing || !newFolderName.trim()) return;
    setLoading(true);
    setError("");
    try {
      const next = await client.createFolder(
        token,
        listing.rootId,
        listing.path,
        newFolderName.trim(),
      );
      setListing(next);
      setNewFolderName("");
      setNewFolderOpen(false);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not create folder.",
      );
    } finally {
      setLoading(false);
    }
  };

  const selectCurrent = async () => {
    if (!listing?.canSelect) return;
    setLoading(true);
    setError("");
    try {
      onSelected(
        await client.selectFolder(token, listing.rootId, listing.path),
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not select folder.",
      );
      setLoading(false);
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        className="folder-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="folder-dialog-title"
      >
        <header className="dialog-header">
          <div>
            <div className="section-label">Content</div>
            <h2 id="folder-dialog-title">Choose a folder</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close folder picker"
            title="Close"
          >
            <CloseIcon />
          </button>
        </header>

        <div className="root-tabs" role="tablist" aria-label="Folder locations">
          {roots.map((root) => (
            <button
              key={root.id}
              type="button"
              role="tab"
              aria-selected={root.id === rootId}
              className={root.id === rootId ? "root-tab is-active" : "root-tab"}
              onClick={() => chooseRoot(root)}
            >
              {root.id === "linux-files" ? <LaptopIcon /> : <ChromeIcon />}
              <span className="root-tab-copy">
                <span>{root.name}</span>
                {!root.available && <small>Not shared yet</small>}
              </span>
            </button>
          ))}
        </div>

        {listing && (
          <nav className="breadcrumbs" aria-label="Current folder">
            <button
              type="button"
              onClick={() => void loadListing(listing.rootId, [])}
            >
              {listing.rootName}
            </button>
            {listing.path.map((component, index) => (
              <span key={listing.path.slice(0, index + 1).join("/")}>
                <ChevronRightIcon />
                <button
                  type="button"
                  onClick={() =>
                    void loadListing(
                      listing.rootId,
                      listing.path.slice(0, index + 1),
                    )
                  }
                >
                  {folderLabel(component, index)}
                </button>
              </span>
            ))}
          </nav>
        )}

        <div className="folder-browser">
          {loading && (
            <div className="browser-message">
              <span className="spinner" aria-hidden="true" />
              <p>Opening folder…</p>
            </div>
          )}
          {!loading && waitingForShare && (
            <div className="share-helper">
              <div className="surface-icon surface-icon-accent">
                <FolderIcon />
              </div>
              <h3>Share a Chromebook folder with Linux</h3>
              <ol>
                <li>Open the ChromeOS Files app.</li>
                <li>Right-click the folder you want to serve.</li>
                <li>
                  Choose <strong>Share with Linux</strong>, then return here.
                </li>
              </ol>
              <p className="waiting-copy">
                <span className="pulse-dot" aria-hidden="true" />
                Waiting for a shared folder…
              </p>
              <button
                type="button"
                className="button button-secondary button-small"
                onClick={() => void refreshRoots(false)}
              >
                <RefreshIcon />
                Check again
              </button>
            </div>
          )}
          {!loading && !waitingForShare && error && (
            <div className="browser-message browser-error" role="alert">
              <WarningIcon />
              <p>{error}</p>
              <button
                type="button"
                className="button button-secondary button-small"
                onClick={() => void refreshRoots(false)}
              >
                Try again
              </button>
            </div>
          )}
          {!loading && listing && listing.entries.length === 0 && !error && (
            <div className="browser-message">
              <FolderIcon />
              <p>This folder has no subfolders.</p>
            </div>
          )}
          {!loading && listing && listing.entries.length > 0 && !error && (
            <div className="folder-list">
              {listing.entries.map((entry) => (
                <button
                  type="button"
                  key={entry.name}
                  onClick={() =>
                    void loadListing(listing.rootId, [
                      ...listing.path,
                      entry.name,
                    ])
                  }
                >
                  <span className="folder-row-icon">
                    <FolderIcon />
                  </span>
                  <span>{folderLabel(entry.name, listing.path.length)}</span>
                  <ChevronRightIcon />
                </button>
              ))}
            </div>
          )}
        </div>

        {newFolderOpen && listing && (
          <div className="new-folder-row">
            <FolderPlusIcon />
            <input
              aria-label="New folder name"
              placeholder="New folder name"
              value={newFolderName}
              onChange={(event) => setNewFolderName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void createFolder();
                if (event.key === "Escape") setNewFolderOpen(false);
              }}
            />
            <button
              type="button"
              className="button button-primary button-small"
              disabled={!newFolderName.trim()}
              onClick={() => void createFolder()}
            >
              Create
            </button>
          </div>
        )}

        <footer className="dialog-footer">
          <button
            type="button"
            className="button button-secondary"
            disabled={
              !listing ||
              loading ||
              (listing.rootId === "shared-chromeos" &&
                listing.path.length === 0)
            }
            onClick={() => setNewFolderOpen(true)}
          >
            <FolderPlusIcon />
            New folder
          </button>
          <span className="dialog-spacer" />
          <button
            type="button"
            className="button button-quiet"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="button button-primary"
            disabled={!listing?.canSelect || loading}
            onClick={() => void selectCurrent()}
          >
            Choose this folder
          </button>
        </footer>
      </section>
    </div>
  );
}

function updateStatusLabel(status: ControllerStatus): string {
  switch (status.update.state) {
    case "available":
      return `v${status.update.availableVersion} is available.`;
    case "checking":
      return "Checking for a signed update…";
    case "installing":
      return "Installing and reconnecting…";
    case "error":
      return "The last update check failed.";
    default:
      return status.update.lastCheckedAt
        ? `Current · checked ${new Date(
            status.update.lastCheckedAt * 1_000,
          ).toLocaleDateString()}`
        : "Current · automatic check pending";
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function folderName(path: string): string {
  const components = path.split("/").filter(Boolean);
  return components[components.length - 1] || "Choose a folder";
}

function validIpv4(value: string): boolean {
  const parts = value.split(".");
  return (
    parts.length === 4 &&
    parts.every(
      (part) =>
        /^\d{1,3}$/.test(part) && Number(part) >= 0 && Number(part) <= 255,
    )
  );
}

function OfflineSetup({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "setup-copy is-compact" : "setup-copy"}>
      {!compact && <h2>Set up the Linux version</h2>}
      <ol className="setup-steps">
        <li>
          Open ChromeOS Settings → About ChromeOS → Developers → Linux
          development environment and choose <strong>Set up</strong>.
        </li>
        <li>Open Terminal once after Linux finishes installing.</li>
        <li>
          Install the verified 200 OK Linux component:
          <code className="command-block">
            curl -fsSL https://ok200.app/install-crostini.sh | bash
          </code>
          <small>
            The installer verifies the signed release, installs only for your
            Linux user, and leaves the web server stopped.
          </small>
        </li>
        <li>
          Open <strong>200 OK Linux</strong> from the ChromeOS Launcher.
        </li>
      </ol>
      <p>
        If the Launcher cannot wake Linux, open Terminal once, wait for its
        prompt, close it, and try again.
      </p>
      <details className="nested-disclosure">
        <summary>Sharing Chromebook folders</summary>
        <p>
          In Files, right-click the folder and choose{" "}
          <strong>Share with Linux</strong>. The 200 OK folder picker detects
          the new share when you return.
        </p>
      </details>
      <details className="nested-disclosure">
        <summary>Reach the server from another device</summary>
        <p>
          Turn on <strong>Available on local network</strong>, then add the
          content port under ChromeOS Settings → Developers → Linux → Port
          forwarding. Use the Chromebook&apos;s Wi-Fi IPv4 address. Never
          forward controller port 20080.
        </p>
      </details>
      <details className="nested-disclosure">
        <summary>Update, rollback, and uninstall</summary>
        <code className="command-block">
          ok200-crostini check-update{"\n"}
          ok200-crostini update{"\n"}
          ok200-crostini rollback{"\n"}
          ok200-crostini uninstall
        </code>
        <p>
          Uninstall preserves settings and never deletes a served folder. Use
          <code> uninstall --purge</code> only to remove pairing and controller
          settings too.
        </p>
        <p>
          Close the 200 OK controls and any <strong>Opening 200 OK…</strong>
          window before uninstalling. ChromeOS removes the Launcher entry
          asynchronously; wait for it to disappear before stopping Linux. If an
          unpinned loading icon remains, do not reopen it—restart ChromeOS to
          clear that shelf placeholder.
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

type IconProps = { className?: string };

function SvgIcon({
  children,
  className,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      className={className ? `icon ${className}` : "icon"}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

function PowerIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M12 2v10" />
      <path d="M18.4 6.6a9 9 0 1 1-12.8 0" />
    </SvgIcon>
  );
}

function FolderIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M3 6.5a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </SvgIcon>
  );
}

function FolderPlusIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M12 10v6M9 13h6" />
    </SvgIcon>
  );
}

function GlobeIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
    </SvgIcon>
  );
}

function NetworkIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M5 12.5a10 10 0 0 1 14 0M8 15.5a6 6 0 0 1 8 0M11 18.5a2 2 0 0 1 2 0" />
    </SvgIcon>
  );
}

function WindowIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 8h18M7 6h.01M10 6h.01" />
    </SvgIcon>
  );
}

function SettingsIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1z" />
    </SvgIcon>
  );
}

function CopyIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <rect x="8" y="8" width="11" height="11" rx="2" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </SvgIcon>
  );
}

function ExternalLinkIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M14 4h6v6M12 12l8-8" />
      <path d="M20 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5" />
    </SvgIcon>
  );
}

function CheckIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="m5 12 4 4L19 6" />
    </SvgIcon>
  );
}

function CloseIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="m6 6 12 12M18 6 6 18" />
    </SvgIcon>
  );
}

function RefreshIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M20 6v5h-5M4 18v-5h5" />
      <path d="M18.4 9A7 7 0 0 0 6.3 6.3L4 11M20 13l-2.3 4.7A7 7 0 0 1 5.6 15" />
    </SvgIcon>
  );
}

function WarningIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M10.3 3.7 2.5 17.2A2 2 0 0 0 4.2 20h15.6a2 2 0 0 0 1.7-2.8L13.7 3.7a2 2 0 0 0-3.4 0z" />
      <path d="M12 9v4M12 17h.01" />
    </SvgIcon>
  );
}

function LinkIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" />
      <path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1" />
    </SvgIcon>
  );
}

function LockIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </SvgIcon>
  );
}

function LaptopIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <rect x="4" y="4" width="16" height="12" rx="2" />
      <path d="M2 20h20M9 16v4M15 16v4" />
    </SvgIcon>
  );
}

function ChromeIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 8.5h8M8.8 14 5 7.5M15.2 14 11 21" />
    </SvgIcon>
  );
}

function ChevronRightIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="m9 18 6-6-6-6" />
    </SvgIcon>
  );
}

function ChevronDownIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="m6 9 6 6 6-6" />
    </SvgIcon>
  );
}
