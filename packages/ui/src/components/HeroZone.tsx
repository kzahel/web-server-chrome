import { useEffect, useState } from "react";
import type {
  ManagedServerInfo,
  ServerConfig,
  StartOptions,
} from "../lib/server-manager";
import { LockedControl } from "./LockedControl";
import { ServerUrl } from "./ServerUrl";

interface HeroZoneProps {
  server: ManagedServerInfo;
  onStart: (options?: StartOptions) => Promise<void>;
  onStop: () => Promise<void>;
  onConfigChange: (partial: Partial<ServerConfig>) => Promise<void>;
  onChooseRoot: () => Promise<void>;
  onOpenUrl: (url: string) => Promise<void>;
  hasNativeFolderChooser: boolean;
}

const statusLabels: Record<ManagedServerInfo["status"], string> = {
  stopped: "Stopped",
  starting: "Starting",
  running: "Running",
  stopping: "Stopping",
  error: "Error",
};

export function HeroZone({
  server,
  onStart,
  onStop,
  onConfigChange,
  onChooseRoot,
  onOpenUrl,
  hasNativeFolderChooser,
}: HeroZoneProps) {
  const isRunning = server.status === "running";
  const isBusy = server.status === "starting" || server.status === "stopping";
  const canEdit = !isRunning && !isBusy;
  const [actionPending, setActionPending] = useState(false);
  const [choosingRoot, setChoosingRoot] = useState(false);
  const [confirmStart, setConfirmStart] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [portDraft, setPortDraft] = useState(String(server.config.port));

  useEffect(() => {
    setPortDraft(String(server.config.port));
  }, [server.config.port]);

  const runAction = async (options?: StartOptions) => {
    setActionPending(true);
    setError(null);
    try {
      if (isRunning) await onStop();
      else await onStart(options);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionPending(false);
    }
  };

  const handleAction = () => {
    if (!isRunning && server.startAssessment?.requiresConfirmation) {
      setConfirmStart(true);
      return;
    }
    void runAction();
  };

  const handleConfirmedStart = () => {
    setConfirmStart(false);
    void runAction({ acknowledgeRisk: true });
  };

  const handleChooseRoot = async () => {
    setChoosingRoot(true);
    setError(null);
    try {
      await onChooseRoot();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setChoosingRoot(false);
    }
  };

  const commitPort = async () => {
    const parsed = Number(portDraft);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
      setError("Port must be between 0 and 65535");
      setPortDraft(String(server.config.port));
      return;
    }
    if (parsed === server.config.port) return;
    try {
      await onConfigChange({ port: parsed });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPortDraft(String(server.config.port));
    }
  };

  const assessment = server.startAssessment;
  const hasRoot = server.config.root.trim().length > 0;
  const startAllowed = hasRoot && (assessment?.allowed ?? true);
  const pending = actionPending || isBusy;
  const displayedStatus = actionPending
    ? isRunning
      ? "stopping"
      : "starting"
    : server.status;
  const switchOn =
    displayedStatus === "running" || displayedStatus === "starting";
  const switchDisabled =
    pending || choosingRoot || (!isRunning && !startAllowed);
  const switchTitle = !hasRoot
    ? "Choose a folder to start the server"
    : displayedStatus === "running"
      ? "Stop web server"
      : displayedStatus === "stopped" || displayedStatus === "error"
        ? "Start web server"
        : statusLabels[displayedStatus];
  const assessmentTone = assessment?.allowed
    ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200"
    : hasRoot
      ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-200"
      : "border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400";

  return (
    <>
      <section className="overflow-hidden rounded-xl border border-gray-300/80 bg-white shadow-sm dark:border-[#333] dark:bg-[#1a1a1a]">
        <div className="flex items-center justify-between border-b border-gray-200 px-3.5 py-3 dark:border-[#333]">
          <h2 className="text-sm font-semibold">Web server</h2>
          <div className="flex items-center gap-2.5">
            <div
              className="flex min-w-[76px] items-center justify-end gap-1.5 text-xs font-medium"
              data-testid="server-status"
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  displayedStatus === "running"
                    ? "bg-green-500"
                    : displayedStatus === "error"
                      ? "bg-red-500"
                      : displayedStatus === "starting" ||
                          displayedStatus === "stopping"
                        ? "animate-pulse bg-amber-500"
                        : "bg-gray-400"
                }`}
              />
              {statusLabels[displayedStatus]}
            </div>
            <button
              type="button"
              role="switch"
              aria-label={switchTitle}
              aria-checked={switchOn}
              onClick={handleAction}
              disabled={switchDisabled}
              data-testid={isRunning ? "stop-btn" : "start-btn"}
              title={switchTitle}
              className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f8d203] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-55 dark:focus-visible:ring-offset-[#1a1a1a] ${
                displayedStatus === "running"
                  ? "border-[#d9b700] bg-[#f8d203]"
                  : displayedStatus === "starting"
                    ? "border-amber-500 bg-amber-400"
                    : "border-gray-300 bg-gray-300 dark:border-gray-600 dark:bg-gray-600"
              }`}
            >
              <span
                className={`mt-0.5 ml-0.5 inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
                  switchOn ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>

        <div className="space-y-3 p-3.5">
          <div>
            <span className="mb-1 block text-xs font-medium">Folder</span>
            <LockedControl locked={!canEdit}>
              {hasNativeFolderChooser ? (
                <button
                  type="button"
                  onClick={() => void handleChooseRoot()}
                  disabled={!canEdit || choosingRoot}
                  data-testid="choose-folder-btn"
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-left transition hover:border-[#d9b700] hover:bg-[#f8d203]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f8d203] disabled:pointer-events-none disabled:opacity-50 dark:border-gray-700 dark:bg-[#111] dark:hover:border-[#f8d203] dark:hover:bg-[#f8d203]/10"
                >
                  <span
                    className={`min-w-0 truncate text-xs ${
                      hasRoot
                        ? "font-mono text-gray-800 dark:text-gray-200"
                        : "text-gray-500"
                    }`}
                    data-testid="selected-folder"
                    title={hasRoot ? server.config.root : undefined}
                  >
                    {hasRoot ? server.config.root : "No folder selected"}
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-[#8a6800] dark:text-[#f8d203]">
                    {choosingRoot
                      ? "Choosing…"
                      : hasRoot
                        ? "Change…"
                        : "Choose…"}
                  </span>
                </button>
              ) : (
                <input
                  type="text"
                  value={server.config.root}
                  onChange={(event) =>
                    void onConfigChange({ root: event.target.value })
                  }
                  disabled={!canEdit}
                  data-testid="dir-input"
                  className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f8d203] disabled:pointer-events-none disabled:opacity-50 dark:border-gray-700 dark:bg-[#111]"
                  placeholder="/path/to/directory"
                />
              )}
            </LockedControl>
            {assessment?.message && (
              <div
                className={`mt-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] leading-4 ${assessmentTone}`}
                data-testid="root-assessment"
              >
                {assessment.message}
              </div>
            )}
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label htmlFor="port" className="text-xs font-medium">
                Port
              </label>
              <span className="text-[10px] text-gray-400">0 = automatic</span>
            </div>
            <LockedControl locked={!canEdit}>
              <input
                id="port"
                type="number"
                min={0}
                max={65535}
                value={portDraft}
                onChange={(event) => setPortDraft(event.target.value)}
                onBlur={() => void commitPort()}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                }}
                disabled={!canEdit}
                data-testid="port-input"
                className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f8d203] disabled:pointer-events-none disabled:opacity-50 dark:border-gray-700 dark:bg-[#111]"
              />
            </LockedControl>
          </div>

          {isRunning && server.actualPort && (
            <ServerUrl
              host={server.config.host}
              port={server.actualPort}
              onOpen={onOpenUrl}
            />
          )}

          {(error || server.error) && (
            <div
              className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs text-red-700 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-200"
              data-testid="error-msg"
            >
              {error || server.error}
            </div>
          )}
        </div>
      </section>

      {confirmStart && assessment?.message && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-start-title"
            className="w-full max-w-sm rounded-xl bg-white p-4 shadow-2xl dark:bg-[#1a1a1a]"
          >
            <h2 id="confirm-start-title" className="text-base font-semibold">
              Share this folder?
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-gray-600 dark:text-gray-300">
              {assessment.message}
            </p>
            <p className="mt-2 break-all rounded-lg bg-gray-100 px-2.5 py-2 font-mono text-[11px] dark:bg-gray-800">
              {assessment.canonicalRoot || server.config.root}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmStart(false)}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmedStart}
                data-testid="confirm-start-btn"
                className="rounded-lg bg-[#f8d203] px-3 py-1.5 text-xs font-semibold text-gray-950 hover:bg-[#fde047]"
              >
                Start anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
