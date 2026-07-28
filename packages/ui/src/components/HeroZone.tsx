import { useEffect, useState } from "react";
import type {
  ManagedServerInfo,
  ServerConfig,
  StartOptions,
} from "../lib/server-manager";
import { ServerUrl } from "./ServerUrl";

interface HeroZoneProps {
  server: ManagedServerInfo;
  onStart: (options?: StartOptions) => Promise<void>;
  onStop: () => Promise<void>;
  onConfigChange: (partial: Partial<ServerConfig>) => Promise<void>;
  onChooseRoot: () => Promise<void>;
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
  const assessmentTone = assessment?.allowed
    ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200"
    : hasRoot
      ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-200"
      : "border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400";

  return (
    <>
      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-gray-800">
          <div>
            <h2 className="font-semibold">Web server</h2>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              Choose a folder, then start serving it over HTTP.
            </p>
          </div>
          <div
            className="flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1.5 text-xs font-medium dark:bg-gray-800"
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
        </div>

        <div className="space-y-5 p-5">
          <div>
            <span className="mb-1.5 block text-sm font-medium">Folder</span>
            {hasNativeFolderChooser ? (
              <button
                type="button"
                onClick={() => void handleChooseRoot()}
                disabled={!canEdit || choosingRoot}
                data-testid="choose-folder-btn"
                className="flex w-full items-center justify-between gap-4 rounded-xl border border-gray-300 bg-white px-3.5 py-3 text-left transition hover:border-blue-400 hover:bg-blue-50/40 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-950 dark:hover:border-blue-600 dark:hover:bg-blue-950/20"
              >
                <span
                  className={`min-w-0 break-all text-sm ${
                    hasRoot
                      ? "font-mono text-gray-800 dark:text-gray-200"
                      : "text-gray-500"
                  }`}
                  data-testid="selected-folder"
                >
                  {hasRoot ? server.config.root : "No folder selected"}
                </span>
                <span className="shrink-0 text-sm font-medium text-blue-600 dark:text-blue-400">
                  {choosingRoot ? "Choosing…" : hasRoot ? "Change…" : "Choose…"}
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
                className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-950"
                placeholder="/path/to/directory"
              />
            )}
            {assessment?.message && (
              <div
                className={`mt-2 rounded-lg border px-3 py-2 text-xs leading-relaxed ${assessmentTone}`}
                data-testid="root-assessment"
              >
                {assessment.message}
              </div>
            )}
          </div>

          <div>
            <label htmlFor="port" className="mb-1.5 block text-sm font-medium">
              Port
            </label>
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
              className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-950"
            />
            <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
              Use port 0 to let the system choose an available port.
            </p>
          </div>

          <button
            type="button"
            onClick={handleAction}
            disabled={pending || choosingRoot || (!isRunning && !startAllowed)}
            data-testid={isRunning ? "stop-btn" : "start-btn"}
            className={`w-full rounded-xl py-3 font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-45 ${
              isRunning
                ? "bg-red-500 hover:bg-red-600"
                : "bg-green-500 hover:bg-green-600"
            }`}
          >
            {pending
              ? isRunning
                ? "Stopping…"
                : "Starting…"
              : isRunning
                ? "Stop server"
                : "Start server"}
          </button>

          {(error || server.error) && (
            <div
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-200"
              data-testid="error-msg"
            >
              {error || server.error}
            </div>
          )}

          {isRunning && server.actualPort && (
            <ServerUrl host={server.config.host} port={server.actualPort} />
          )}
        </div>
      </section>

      {confirmStart && assessment?.message && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-5">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-start-title"
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl dark:bg-gray-900"
          >
            <h2 id="confirm-start-title" className="text-lg font-semibold">
              Share this folder?
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
              {assessment.message}
            </p>
            <p className="mt-3 break-all rounded-lg bg-gray-100 px-3 py-2 font-mono text-xs dark:bg-gray-800">
              {assessment.canonicalRoot || server.config.root}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmStart(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmedStart}
                data-testid="confirm-start-btn"
                className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600"
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
