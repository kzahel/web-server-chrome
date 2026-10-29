import { getLocale, LanguagePicker, rich, t, useLocale } from "@ok200/i18n";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { detectChromeOsLanIpv4Address } from "../lib/chromeos-lan-address";
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
  useLocale();
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
            t(
              "extension.the.one.time.controller.claim.is.missing.launch.200.ok.f9593f",
            ),
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
          t(
            "extension.this.linux.controller.is.already.paired.but.this.extens.ed282f",
          ),
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
          : t("extension.controller.connection.failed.f25b70"),
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
            chrome.runtime.lastError.message ||
              t("extension.permission.check.failed.144b96"),
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
            : t("extension.the.linux.control.session.expired.fbba79"),
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
            chrome.runtime.lastError.message ||
              t("extension.permission.request.failed.4c774d"),
          );
          setState("error");
        } else if (granted) {
          void connect();
        } else {
          setDetail(
            t(
              "extension.permission.was.not.granted.setup.instructions.remain.av.41abf6",
            ),
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
      setDetail(
        error instanceof Error
          ? error.message
          : t("extension.action.failed.f71340"),
      );
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
        error instanceof Error
          ? error.message
          : t("extension.server.action.failed.c2bc8c"),
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
        t(
          "extension.updating.stops.the.web.server.and.does.not.restart.it.a.8f22e4",
        ),
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
        setUpdateMessage(
          t("extension.the.linux.component.is.already.current.b8579d"),
        );
        return;
      }
      setUpdateMessage(
        t(
          "extension.installing.the.signed.update.the.controller.will.briefl.ab10e2",
        ),
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
              t(
                "extension.updated.to.linux.component.v.value0.the.web.server.rema.b21a35",
                { value0: session.status.version },
              ),
            );
            return;
          }
          if (session.status.update.state === "error") {
            setDetail(
              session.status.update.error ||
                t("extension.the.linux.component.update.failed.426563"),
            );
            setUpdateMessage("");
            return;
          }
        } catch {
          // The controller is expected to disappear briefly during replacement.
        }
      }
      setDetail(
        t(
          "extension.the.update.is.taking.longer.than.expected.launch.200.ok.449ff3",
        ),
      );
      setUpdateMessage("");
    } catch (error) {
      setDetail(
        error instanceof Error
          ? error.message
          : t("extension.update.failed.f1d764"),
      );
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
          <LoadingSurface label={t("extension.checking.linux.access.2a9213")} />
        )}
        {state === "connecting" && (
          <LoadingSurface
            label={t("extension.connecting.to.your.linux.controller.095b18")}
          />
        )}
        {state === "permission-required" && (
          <section className="surface permission-surface">
            <div className="surface-icon surface-icon-accent">
              <LinkIcon />
            </div>
            <div>
              <h2>{t("extension.connect.to.linux.67d25d")}</h2>
              <p>
                {rich(
                  "extension.allow.200.ok.to.communicate.with.your.chromebook.s.linu.76c804",
                  { tag0: (chunks) => <code>{chunks}</code> },
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={requestPermission}
              className="button button-primary"
            >
              {t("extension.allow.linux.access.38fc0e")}
            </button>
            <details className="disclosure">
              <summary>
                {t("extension.linux.setup.and.recovery.803759")}
              </summary>
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
              <h2>{t("extension.couldn.t.connect.to.linux.6e31bc")}</h2>
              <p>{detail}</p>
            </div>
            <button
              type="button"
              onClick={() => void connect()}
              className="button button-primary"
            >
              <RefreshIcon />
              {t("extension.try.again.d8b839")}
            </button>
            <details className="disclosure">
              <summary>
                {t("extension.linux.setup.and.recovery.803759")}
              </summary>
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
        <span>{t("extension.web.server.for.chromeos.linux.9d8ef3")}</span>
      </div>
      <div className="language-row">
        <LanguagePicker />
      </div>
      {connected && (
        <div className="connection-pill">
          <span aria-hidden="true" />
          {t("extension.linux.connected.a353b4")}
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
  const [lockNotice, setLockNotice] = useState("");
  const lockNoticeTimer = useRef<number | null>(null);
  const running = status.server.state === "running";
  const active = running || serverPending === "starting";
  const settingsLockReason = running
    ? t("extension.stop.the.server.to.change.settings.fd75f3")
    : serverPending
      ? t("extension.wait.for.the.server.to.finish.value0.da806d", {
          value0: serverPending,
        })
      : busy
        ? t("extension.wait.for.the.current.action.to.finish.a99bab")
        : "";
  const settingsLocked = settingsLockReason.length > 0;
  const stateLabel = serverPending
    ? serverPending === "starting"
      ? t("extension.starting.aeed4d")
      : t("extension.stopping.a71ee1")
    : status.server.state === "error"
      ? t("extension.error.54a0e8")
      : running
        ? t("extension.running.f4ccae")
        : status.server.state === "stopping"
          ? t("extension.stopping.a71ee1")
          : t("extension.stopped.1a4f63");
  const stateDetail = running
    ? status.settings.keepServingOnClose
      ? t("extension.serving.continues.when.this.window.closes.b6048a")
      : t("extension.serving.stops.when.this.window.closes.49b856")
    : status.server.error ||
      t("extension.choose.a.folder.then.turn.the.server.on.3707c6");

  useEffect(
    () => () => {
      if (lockNoticeTimer.current !== null) {
        window.clearTimeout(lockNoticeTimer.current);
      }
    },
    [],
  );

  const explainSettingsLock = () => {
    if (!settingsLockReason) return;
    setLockNotice(settingsLockReason);
    if (lockNoticeTimer.current !== null) {
      window.clearTimeout(lockNoticeTimer.current);
    }
    lockNoticeTimer.current = window.setTimeout(() => {
      setLockNotice("");
      lockNoticeTimer.current = null;
    }, 3_000);
  };

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
          <div className="section-label">
            {t("extension.web.server.1643cf")}
          </div>
          <div className="server-state">{stateLabel}</div>
          <p>{stateDetail}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={active}
          aria-label={
            running
              ? t("extension.stop.web.server.a00a97")
              : t("extension.start.web.server.9b82f9")
          }
          title={
            running
              ? t("extension.stop.web.server.a00a97")
              : t("extension.start.web.server.9b82f9")
          }
          className="server-switch"
          disabled={busy || serverPending !== null}
          onClick={onToggleServer}
          data-testid="server-toggle"
        >
          <span />
        </button>
      </section>

      {status.server.url && (
        <UrlCard
          label={t("extension.this.chromebook.31f18d")}
          url={status.server.url}
        />
      )}

      <section className="surface settings-surface">
        <div className="section-heading">
          <div>
            <div className="section-label">{t("extension.content.47bd29")}</div>
            <h2>{t("extension.folder.and.address.d090b6")}</h2>
          </div>
          {settingsLocked && (
            <span className="locked-note">
              {t("extension.stop.to.make.changes.a30d16")}
            </span>
          )}
        </div>

        <button
          type="button"
          className="folder-control"
          aria-disabled={settingsLocked}
          title={
            settingsLocked
              ? settingsLockReason
              : t("extension.choose.a.different.folder.1792fc")
          }
          onClick={() => {
            if (settingsLocked) {
              explainSettingsLock();
            } else {
              setPickerOpen(true);
            }
          }}
          data-testid="choose-folder"
        >
          <span className="setting-icon">
            <FolderIcon />
          </span>
          <span className="folder-copy">
            <strong>{folderName(status.settings.root)}</strong>
            <span title={status.settings.root}>{status.settings.root}</span>
          </span>
          <span className="folder-action">{t("extension.change.c0bf75")}</span>
          <ChevronRightIcon />
        </button>

        <div
          className={`setting-row port-row ${settingsLocked ? "is-locked" : ""}`}
          title={settingsLocked ? settingsLockReason : undefined}
        >
          <span className="setting-icon">
            <GlobeIcon />
          </span>
          <label htmlFor="content-port">
            {rich(
              "extension..tag0.port.tag0.tag1.used.in.the.server.address.tag1.1ad047",
              {
                tag0: (chunks) => <strong>{chunks}</strong>,
                tag1: (chunks) => <span>{chunks}</span>,
              },
            )}
          </label>
          <PortInput
            lockedReason={settingsLockReason}
            onLocked={explainSettingsLock}
            onCommit={(port) => onChangeSettings({ port })}
            value={status.settings.port}
          />
        </div>

        <SettingSwitch
          checked={status.settings.lan}
          description={t(
            "extension.allow.chromeos.to.forward.this.port.to.your.network.5e770a",
          )}
          icon={<NetworkIcon />}
          label={t("extension.available.on.local.network.f4bd53")}
          lockedReason={settingsLockReason}
          onLocked={explainSettingsLock}
          onChange={(lan) => onChangeSettings({ lan })}
        />
      </section>

      {status.settings.lan && <LanAccessCard status={status} />}

      <section className="surface behavior-surface">
        <div className="section-heading compact-heading">
          <div>
            <div className="section-label">
              {t("extension.server.lifetime.b391f8")}
            </div>
            <h2>{t("extension.when.controls.close.8a761e")}</h2>
          </div>
        </div>
        <SettingSwitch
          checked={status.settings.keepServingOnClose}
          description={
            status.settings.keepServingOnClose
              ? t(
                  "extension.the.server.keeps.running.until.you.stop.it.or.linux.shu.c725a6",
                )
              : t(
                  "extension.the.server.stops.after.the.final.200.ok.control.window.e84d80",
                )
          }
          icon={<WindowIcon />}
          label={t("extension.keep.serving.when.controls.close.3afb77")}
          lockedReason={settingsLockReason}
          onLocked={explainSettingsLock}
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
            {rich(
              "extension..tag0.advanced.tag0.tag1.directory.behavior.access.and.305a04",
              {
                tag0: (chunks) => <strong>{chunks}</strong>,
                tag1: (chunks) => <small>{chunks}</small>,
              },
            )}
          </span>
          <ChevronDownIcon />
        </summary>
        <div className="advanced-content">
          <SettingSwitch
            checked={status.settings.directoryListing}
            description={t(
              "extension.show.an.index.when.a.folder.has.no.index.file.dd0caa",
            )}
            label={t("extension.directory.listings.a49eb4")}
            lockedReason={settingsLockReason}
            onLocked={explainSettingsLock}
            onChange={(directoryListing) =>
              onChangeSettings({ directoryListing })
            }
          />
          <SettingSwitch
            checked={status.settings.spa}
            description={t(
              "extension.serve.index.html.for.routes.that.do.not.match.a.file.07862d",
            )}
            label={t("extension.single.page.app.fallback.f6dac9")}
            lockedReason={settingsLockReason}
            onLocked={explainSettingsLock}
            onChange={(spa) => onChangeSettings({ spa })}
          />
          <SettingSwitch
            checked={status.settings.cors}
            description={t(
              "extension.allow.pages.on.other.origins.to.request.these.files.7a07f1",
            )}
            label={t("extension.cross.origin.requests.86c1f5")}
            lockedReason={settingsLockReason}
            onLocked={explainSettingsLock}
            onChange={(cors) => onChangeSettings({ cors })}
          />
          <SettingSwitch
            checked={status.settings.automaticUpdates}
            description={t(
              "extension.install.signed.linux.component.updates.while.stopped.6155e8",
            )}
            label={t("extension.automatic.linux.updates.04a336")}
            lockedReason={settingsLockReason}
            onLocked={explainSettingsLock}
            onChange={(automaticUpdates) =>
              onChangeSettings({ automaticUpdates })
            }
          />

          <div className="update-panel">
            <div>
              <strong>
                {t("extension.linux.component.v.value0.23fcc0", {
                  value0: status.version,
                })}
              </strong>
              <p>{updateStatusLabel(status)}</p>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={onCheckUpdate}
              className="button button-secondary button-small"
            >
              <RefreshIcon />
              {status.update.state === "checking"
                ? t("extension.checking.ec963f")
                : t("extension.check.now.2937cf")}
            </button>
          </div>
          {status.update.state === "available" && (
            <button
              type="button"
              disabled={busy}
              onClick={onInstallUpdate}
              className="button button-primary"
            >
              {t("extension.update.to.v.value0.d7bb82", {
                value0: status.update.availableVersion,
              })}
            </button>
          )}
          {updateMessage && <p className="notice-copy">{updateMessage}</p>}
          {status.update.error && (
            <p className="error-copy">{status.update.error}</p>
          )}
        </div>
      </details>

      <details className="help-disclosure">
        <summary>{t("extension.setup.sharing.and.recovery.e978bc")}</summary>
        <OfflineSetup compact />
      </details>

      <footer className="controller-footer">
        {rich(
          "extension..tag1.linux.component.v.value0.tag1.tag2.tag2.tag3.cont.193b14",
          {
            value0: status.version,
            tag1: (chunks) => <span>{chunks}</span>,
            tag2: (chunks) => <span aria-hidden="true">{chunks}</span>,
            tag3: (chunks) => <span>{chunks}</span>,
          },
        )}
      </footer>

      {lockNotice && settingsLocked && (
        <output
          className="settings-lock-feedback"
          aria-live="polite"
          data-testid="settings-lock-feedback"
        >
          <LockIcon />
          <span>{lockNotice}</span>
        </output>
      )}

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
  lockedReason,
  onLocked,
  onCommit,
  value,
}: {
  lockedReason: string;
  onLocked: () => void;
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
      aria-disabled={lockedReason.length > 0}
      inputMode="numeric"
      min={1024}
      max={65_535}
      readOnly={lockedReason.length > 0}
      title={lockedReason || t("extension.content.server.port.9f26d1")}
      type="number"
      value={draft}
      aria-invalid={error}
      aria-label={t("extension.content.port.838a49")}
      onBlur={commit}
      onChange={(event) => setDraft(event.target.value)}
      onFocus={() => {
        if (lockedReason) onLocked();
      }}
      onKeyDown={(event) => {
        if (lockedReason) {
          onLocked();
        } else if (event.key === "Enter") {
          event.currentTarget.blur();
        }
      }}
    />
  );
}

function SettingSwitch({
  checked,
  description,
  icon,
  label,
  lockedReason,
  onLocked,
  onChange,
}: {
  checked: boolean;
  description: string;
  icon?: React.ReactNode;
  label: string;
  lockedReason: string;
  onLocked: () => void;
  onChange: (checked: boolean) => void;
}) {
  const locked = lockedReason.length > 0;
  return (
    <div
      className={`setting-row switch-row ${locked ? "is-locked" : ""}`}
      title={locked ? lockedReason : undefined}
    >
      {icon && <span className="setting-icon">{icon}</span>}
      <div className="setting-copy">
        <strong>{label}</strong>
        <span>{description}</span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-disabled={locked}
        aria-label={label}
        className="mini-switch"
        title={locked ? lockedReason : label}
        onClick={(event) => {
          event.stopPropagation();
          if (locked) {
            onLocked();
          } else {
            onChange(!checked);
          }
        }}
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
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          title={t("extension.open.server.520174")}
        >
          {url}
        </a>
      </div>
      <div className="url-actions">
        <a
          className="icon-button"
          href={url}
          target="_blank"
          rel="noreferrer"
          aria-label={t("extension.open.server.url.646642")}
          title={t("extension.open.ed077f")}
        >
          <ExternalLinkIcon />
        </a>
        <button
          type="button"
          className="icon-button"
          aria-label={
            copied
              ? t("extension.url.copied.0017bd")
              : t("extension.copy.server.url.3f8f6c")
          }
          title={
            copied ? t("extension.copied.8d525e") : t("extension.copy.e21f93")
          }
          onClick={() => void copy()}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
        </button>
      </div>
      {copied && (
        <output className="copy-toast">{t("extension.copied.8d525e")}</output>
      )}
    </section>
  );
}

function LanAccessCard({ status }: { status: ControllerStatus }) {
  const [detectedAddress, setDetectedAddress] = useState<string | null>(null);
  const [detecting, setDetecting] = useState(true);
  const detectionGeneration = useRef(0);
  const url = detectedAddress
    ? `http://${detectedAddress}:${status.settings.port}/`
    : null;

  const detectAddress = useCallback(async () => {
    const generation = detectionGeneration.current + 1;
    detectionGeneration.current = generation;
    setDetecting(true);
    const detected = await detectChromeOsLanIpv4Address();
    if (detectionGeneration.current !== generation) return;
    setDetectedAddress(detected);
    setDetecting(false);
  }, []);

  useEffect(() => {
    localStorage.removeItem(`ok200-crostini-lan-host:${status.instanceId}`);
    void detectAddress();
    return () => {
      detectionGeneration.current += 1;
    };
  }, [detectAddress, status.instanceId]);

  const addressHelp = detecting
    ? t("extension.detecting.this.chromebook.s.address.c5a43d")
    : detectedAddress
      ? t("extension.detected.automatically.from.chromeos.04302a")
      : t(
          "extension.chromeos.shows.this.address.just.above.the.port.forward.3c5208",
        );

  return (
    <section className="surface lan-surface">
      <div className="section-heading compact-heading">
        <div>
          <div className="section-label">
            {t("extension.local.network.4fda69")}
          </div>
          <h2>{t("extension.finish.chromeos.forwarding.39f117")}</h2>
        </div>
        <span className="step-pill">{t("extension.1.step.3ce601")}</span>
      </div>
      <ol className="lan-steps">
        <li>
          <span>1</span>
          <p>
            {rich(
              "extension.in.chromeos.settings.open.tag0.developers.linux.port.fo.49e854",
              {
                tag0: (chunks) => <strong>{chunks}</strong>,
                value1: status.settings.port,
              },
            )}
          </p>
        </li>
      </ol>
      <div className="lan-address-summary">
        <strong>{t("extension.chromebook.ipv4.address.94e487")}</strong>
        <div className="lan-address-row">
          <code className="lan-address-value" data-testid="chromebook-address">
            {detecting
              ? t("extension.detecting.805eb9")
              : detectedAddress || t("extension.not.detected.9f4a10")}
          </code>
          <button
            type="button"
            className="icon-button detect-address-button"
            aria-label={t("extension.detect.chromebook.address.again.198bd4")}
            title={t("extension.detect.again.bf6732")}
            disabled={detecting}
            onClick={() => void detectAddress()}
          >
            <RefreshIcon />
          </button>
        </div>
        <small aria-live="polite">{addressHelp}</small>
      </div>
      {url && status.server.state === "running" && (
        <UrlCard label={t("extension.other.devices.4e027d")} url={url} />
      )}
      <p className="security-note">
        <LockIcon />{" "}
        {t(
          "extension.controller.port.20080.stays.on.this.chromebook.and.shou.270d00",
        )}
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
          caught instanceof Error
            ? caught.message
            : t("extension.could.not.open.folder.bcd29f"),
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
            : t("extension.could.not.read.folder.locations.871ce6"),
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
            : t("extension.could.not.read.folder.locations.871ce6"),
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
      ? t("extension.my.files.985698")
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
        caught instanceof Error
          ? caught.message
          : t("extension.could.not.create.folder.13a151"),
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
        caught instanceof Error
          ? caught.message
          : t("extension.could.not.select.folder.4293fe"),
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
            <div className="section-label">{t("extension.content.47bd29")}</div>
            <h2 id="folder-dialog-title">
              {t("extension.choose.a.folder.5c71b8")}
            </h2>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label={t("extension.close.folder.picker.2db6d3")}
            title={t("extension.close.7d9eb7")}
          >
            <CloseIcon />
          </button>
        </header>

        <div
          className="root-tabs"
          role="tablist"
          aria-label={t("extension.folder.locations.23edda")}
        >
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
                {!root.available && (
                  <small>{t("extension.not.shared.yet.bd0b09")}</small>
                )}
              </span>
            </button>
          ))}
        </div>

        {listing && (
          <nav
            className="breadcrumbs"
            aria-label={t("extension.current.folder.1a5db5")}
          >
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
              <p>{t("extension.opening.folder.c3ab98")}</p>
            </div>
          )}
          {!loading && waitingForShare && (
            <div className="share-helper">
              <div className="surface-icon surface-icon-accent">
                <FolderIcon />
              </div>
              <h3>
                {t("extension.share.a.chromebook.folder.with.linux.e50ee9")}
              </h3>
              <ol>
                <li>{t("extension.open.the.chromeos.files.app.ce4973")}</li>
                <li>
                  {t(
                    "extension.right.click.the.folder.you.want.to.serve.ed4508",
                  )}
                </li>
                <li>
                  {rich(
                    "extension.choose.tag0.share.with.linux.tag0.then.return.here.d837a8",
                    { tag0: (chunks) => <strong>{chunks}</strong> },
                  )}
                </li>
              </ol>
              <p className="waiting-copy">
                <span className="pulse-dot" aria-hidden="true" />
                {t("extension.waiting.for.a.shared.folder.676047")}
              </p>
              <button
                type="button"
                className="button button-secondary button-small"
                onClick={() => void refreshRoots(false)}
              >
                <RefreshIcon />
                {t("extension.check.again.fb7099")}
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
                {t("extension.try.again.d8b839")}
              </button>
            </div>
          )}
          {!loading && listing && listing.entries.length === 0 && !error && (
            <div className="browser-message">
              <FolderIcon />
              <p>{t("extension.this.folder.has.no.subfolders.7b6d8d")}</p>
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
              aria-label={t("extension.new.folder.name.489b9f")}
              placeholder={t("extension.new.folder.name.489b9f")}
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
              {t("extension.create.475949")}
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
            {t("extension.new.folder.cf28f4")}
          </button>
          <span className="dialog-spacer" />
          <button
            type="button"
            className="button button-quiet"
            onClick={onClose}
          >
            {t("extension.cancel.19766e")}
          </button>
          <button
            type="button"
            className="button button-primary"
            disabled={!listing?.canSelect || loading}
            onClick={() => void selectCurrent()}
          >
            {t("extension.choose.this.folder.0f3b23")}
          </button>
        </footer>
      </section>
    </div>
  );
}

function updateStatusLabel(status: ControllerStatus): string {
  switch (status.update.state) {
    case "available":
      return t("extension.v.value0.is.available.46d0d0", {
        value0: status.update.availableVersion,
      });
    case "checking":
      return t("extension.checking.for.a.signed.update.8e194a");
    case "installing":
      return t("extension.installing.and.reconnecting.eea5c0");
    case "error":
      return t("extension.the.last.update.check.failed.c03ab6");
    default:
      return status.update.lastCheckedAt
        ? t("extension.current.checked.value0.c23fb5", {
            value0: new Date(
              status.update.lastCheckedAt * 1_000,
            ).toLocaleDateString(getLocale()),
          })
        : t("extension.current.automatic.check.pending.acd44c");
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function folderName(path: string): string {
  const components = path.split("/").filter(Boolean);
  return (
    components[components.length - 1] || t("extension.choose.a.folder.5c71b8")
  );
}

function OfflineSetup({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "setup-copy is-compact" : "setup-copy"}>
      {!compact && <h2>{t("extension.set.up.the.linux.version.8554b6")}</h2>}
      <ol className="setup-steps">
        <li>
          {rich(
            "extension.open.chromeos.settings.about.chromeos.developers.linux.b6dec2",
            { tag0: (chunks) => <strong>{chunks}</strong> },
          )}
        </li>
        <li>
          {t(
            "extension.open.terminal.once.after.linux.finishes.installing.a18d10",
          )}
        </li>
        <li>
          {rich(
            "extension.install.the.verified.200.ok.linux.component.tag0.curl.f.93b255",
            {
              tag0: (chunks) => <code className="command-block">{chunks}</code>,
              tag1: (chunks) => <small>{chunks}</small>,
            },
          )}
        </li>
        <li>
          {rich(
            "extension.open.tag0.200.ok.web.server.tag0.from.the.chromeos.laun.75dcac",
            { tag0: (chunks) => <strong>{chunks}</strong> },
          )}
        </li>
      </ol>
      <p>
        {t(
          "extension.if.the.launcher.cannot.wake.linux.open.terminal.once.wa.27611b",
        )}
      </p>
      <details className="nested-disclosure">
        <summary>{t("extension.sharing.chromebook.folders.8bf65f")}</summary>
        <p>
          {rich(
            "extension.in.files.right.click.the.folder.and.choose.tag0.share.w.f5a943",
            { tag0: (chunks) => <strong>{chunks}</strong> },
          )}
        </p>
      </details>
      <details className="nested-disclosure">
        <summary>
          {t("extension.reach.the.server.from.another.device.7f1eab")}
        </summary>
        <p>
          {rich(
            "extension.turn.on.tag0.available.on.local.network.tag0.then.add.t.571f67",
            { tag0: (chunks) => <strong>{chunks}</strong> },
          )}
        </p>
      </details>
      <details className="nested-disclosure">
        <summary>{t("extension.update.rollback.and.uninstall.2121a4")}</summary>
        <code className="command-block">
          {t(
            "extension.ok200.crostini.check.update.value0.ok200.crostini.updat.a13096",
            { value0: "\n", value1: "\n", value2: "\n" },
          )}
        </code>
        <p>
          {rich(
            "extension.uninstall.preserves.settings.and.never.deletes.a.served.d54c53",
            { tag0: (chunks) => <code>{chunks}</code> },
          )}
        </p>
        <p>
          {rich(
            "extension.close.the.200.ok.controls.and.any.tag0.opening.200.ok.t.79941c",
            { tag0: (chunks) => <strong>{chunks}</strong> },
          )}
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
