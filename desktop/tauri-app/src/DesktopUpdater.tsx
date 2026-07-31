import { getBundleType, getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { relaunch } from "@tauri-apps/plugin-process";
import {
  check,
  type DownloadEvent,
  type Update,
} from "@tauri-apps/plugin-updater";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type AutomaticCheckReason,
  scheduleAutomaticUpdateChecks,
} from "./update-check-schedule";
import {
  DOWNLOAD_PAGE_URL,
  type UpdateInstallPolicy,
  updateInstallPolicy,
} from "./update-install-policy";

const UPDATE_TIMEOUT_MS = 20_000;

type CheckReason = "manual" | AutomaticCheckReason;

type Notice =
  | { status: "hidden" }
  | { status: "checking" }
  | { status: "up-to-date" }
  | { status: "available"; version: string; body?: string }
  | { status: "manual-install"; packageLabel: string }
  | {
      status: "downloading";
      version: string;
      downloadedBytes: number;
      totalBytes?: number;
    }
  | { status: "installing"; version: string }
  | {
      status: "error";
      message: string;
      retry: "check" | "install";
      version?: string;
    };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatProgress(downloadedBytes: number, totalBytes?: number): string {
  if (totalBytes && totalBytes > 0) {
    return `${Math.min(100, Math.round((downloadedBytes / totalBytes) * 100))}%`;
  }
  if (downloadedBytes < 1024 * 1024) {
    return `${Math.round(downloadedBytes / 1024)} KB`;
  }
  return `${(downloadedBytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DesktopUpdater() {
  const [notice, setNotice] = useState<Notice>({ status: "hidden" });
  const [currentVersion, setCurrentVersion] = useState("");
  const updateRef = useRef<Update | null>(null);
  const checkPromiseRef = useRef<Promise<void> | null>(null);
  const showCheckResultRef = useRef(false);
  const installPolicyPromiseRef = useRef<Promise<UpdateInstallPolicy> | null>(
    null,
  );

  useEffect(() => {
    void getVersion().then(setCurrentVersion).catch(console.error);
  }, []);

  const closeCurrentUpdate = useCallback(() => {
    const current = updateRef.current;
    updateRef.current = null;
    if (current) void current.close().catch(console.error);
  }, []);

  const loadInstallPolicy = useCallback((): Promise<UpdateInstallPolicy> => {
    if (!installPolicyPromiseRef.current) {
      installPolicyPromiseRef.current = getBundleType()
        .then(updateInstallPolicy)
        .catch((error) => {
          console.error("Could not determine desktop package type:", error);
          return updateInstallPolicy(null);
        });
    }
    return installPolicyPromiseRef.current;
  }, []);

  const performCheck = useCallback(
    async (reason: CheckReason) => {
      if (reason === "manual") {
        showCheckResultRef.current = true;
        setNotice({ status: "checking" });
      }

      const installPolicy = await loadInstallPolicy();
      if (!installPolicy.canInstallInApp) {
        if (reason === "manual") {
          showCheckResultRef.current = false;
          setNotice({
            status: "manual-install",
            packageLabel: installPolicy.packageLabel,
          });
        }
        return;
      }

      // Leave an already-discovered update intact during silent periodic work.
      if (reason !== "manual" && updateRef.current) return;

      if (checkPromiseRef.current) {
        await checkPromiseRef.current;
        return;
      }

      const request = (async () => {
        closeCurrentUpdate();
        try {
          const update = await check({
            headers: { "X-Check-Reason": reason },
            timeout: UPDATE_TIMEOUT_MS,
          });

          if (update) {
            updateRef.current = update;
            setNotice({
              status: "available",
              version: update.version,
              body: update.body,
            });
          } else if (showCheckResultRef.current) {
            setNotice({ status: "up-to-date" });
          } else {
            setNotice({ status: "hidden" });
          }
        } catch (error) {
          if (showCheckResultRef.current) {
            setNotice({
              status: "error",
              message: errorMessage(error),
              retry: "check",
            });
          } else {
            console.error("Automatic update check failed:", error);
          }
        } finally {
          showCheckResultRef.current = false;
          checkPromiseRef.current = null;
        }
      })();

      checkPromiseRef.current = request;
      await request;
    },
    [closeCurrentUpdate, loadInstallPolicy],
  );

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    let disposed = false;

    void listen("check-for-updates", () => {
      void performCheck("manual");
    }).then((stopListening) => {
      if (disposed) stopListening();
      else unlisten = stopListening;
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [performCheck]);

  useEffect(() => {
    return scheduleAutomaticUpdateChecks((reason) => {
      void performCheck(reason);
    });
  }, [performCheck]);

  useEffect(
    () => () => {
      closeCurrentUpdate();
    },
    [closeCurrentUpdate],
  );

  const installUpdate = async () => {
    const update = updateRef.current;
    if (!update) {
      await performCheck("manual");
      return;
    }

    const version = update.version;
    let downloadedBytes = 0;
    let totalBytes: number | undefined;
    setNotice({
      status: "downloading",
      version,
      downloadedBytes,
      totalBytes,
    });

    try {
      await update.downloadAndInstall((event: DownloadEvent) => {
        if (event.event === "Started") {
          totalBytes = event.data.contentLength;
          downloadedBytes = 0;
          setNotice({
            status: "downloading",
            version,
            downloadedBytes,
            totalBytes,
          });
        } else if (event.event === "Progress") {
          downloadedBytes += event.data.chunkLength;
          setNotice({
            status: "downloading",
            version,
            downloadedBytes,
            totalBytes,
          });
        } else {
          setNotice({ status: "installing", version });
        }
      });
      setNotice({ status: "installing", version });
      await relaunch();
    } catch (error) {
      setNotice({
        status: "error",
        message: errorMessage(error),
        retry: "install",
        version,
      });
    }
  };

  const dismiss = () => {
    closeCurrentUpdate();
    setNotice({ status: "hidden" });
  };

  const openDownloadPage = async () => {
    try {
      await invoke("plugin:opener|open_url", {
        url: DOWNLOAD_PAGE_URL,
        with: null,
      });
    } catch (error) {
      setNotice({
        status: "error",
        message: `Could not open ${DOWNLOAD_PAGE_URL}: ${errorMessage(error)}`,
        retry: "check",
      });
    }
  };

  if (notice.status === "hidden") return null;

  const isBusy =
    notice.status === "checking" ||
    notice.status === "downloading" ||
    notice.status === "installing";
  const progress =
    notice.status === "downloading" &&
    notice.totalBytes &&
    notice.totalBytes > 0
      ? Math.min(100, (notice.downloadedBytes / notice.totalBytes) * 100)
      : undefined;

  return (
    <section
      className={`rounded-xl border px-3.5 py-3 shadow-sm ${
        notice.status === "error"
          ? "border-red-200 bg-red-50 dark:border-red-900/70 dark:bg-red-950/40"
          : "border-[#e2c000] bg-[#fffbe5] dark:border-[#695a00] dark:bg-[#292500]"
      }`}
      aria-live="polite"
      data-testid="update-notice"
    >
      <div className="flex items-start gap-2.5">
        <div
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
            notice.status === "error"
              ? "bg-red-100 text-red-700 dark:bg-red-900/60 dark:text-red-200"
              : "bg-[#f8d203] text-gray-950"
          }`}
          aria-hidden="true"
        >
          {notice.status === "checking" ||
          notice.status === "downloading" ||
          notice.status === "installing" ? (
            <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-current border-r-transparent" />
          ) : notice.status === "error" ? (
            <span className="text-xs font-bold">!</span>
          ) : (
            <span className="text-xs font-bold">✓</span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-xs font-semibold">
                {notice.status === "checking" && "Checking for updates…"}
                {notice.status === "up-to-date" && "You’re up to date"}
                {notice.status === "available" &&
                  `200 OK ${notice.version} is available`}
                {notice.status === "manual-install" &&
                  "Install updates manually"}
                {notice.status === "downloading" &&
                  `Downloading 200 OK ${notice.version}…`}
                {notice.status === "installing" && "Installing update…"}
                {notice.status === "error" && "Update failed"}
              </h2>
              <p className="mt-0.5 text-[11px] leading-4 text-gray-600 dark:text-gray-300">
                {notice.status === "checking" &&
                  "Contacting the 200 OK update server."}
                {notice.status === "up-to-date" &&
                  `200 OK${currentVersion ? ` ${currentVersion}` : ""} is the newest version.`}
                {notice.status === "available" &&
                  "The update is signed and ready to install."}
                {notice.status === "manual-install" &&
                  `Updates for the ${notice.packageLabel} stay with that package type. Download the matching package from ok200.app.`}
                {notice.status === "downloading" &&
                  formatProgress(notice.downloadedBytes, notice.totalBytes)}
                {notice.status === "installing" &&
                  "200 OK will restart when installation finishes."}
                {notice.status === "error" && notice.message}
              </p>
            </div>

            {!isBusy && (
              <button
                type="button"
                onClick={dismiss}
                className="-mr-1 -mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-sm text-gray-500 hover:bg-black/5 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f8d203] dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white"
                aria-label="Dismiss update notice"
                title="Dismiss"
              >
                ×
              </button>
            )}
          </div>

          {notice.status === "available" && notice.body && (
            <div className="mt-2 max-h-28 overflow-y-auto whitespace-pre-wrap rounded-md bg-black/5 px-2.5 py-2 text-[11px] leading-4 text-gray-700 dark:bg-white/10 dark:text-gray-200">
              {notice.body}
            </div>
          )}

          {notice.status === "downloading" && progress !== undefined && (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/15">
              <div
                className="h-full rounded-full bg-[#d2af00] transition-[width] dark:bg-[#f8d203]"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}

          {(notice.status === "available" ||
            notice.status === "manual-install" ||
            notice.status === "error") && (
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  if (notice.status === "manual-install") {
                    void openDownloadPage();
                  } else if (
                    notice.status === "available" ||
                    notice.retry === "install"
                  ) {
                    void installUpdate();
                  } else {
                    void performCheck("manual");
                  }
                }}
                className="rounded-lg bg-[#f8d203] px-2.5 py-1.5 text-[11px] font-semibold text-gray-950 transition hover:bg-[#fde047] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d2af00] focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#292500]"
                data-testid="update-action"
              >
                {notice.status === "manual-install"
                  ? "Open downloads"
                  : notice.status === "available" || notice.retry === "install"
                    ? "Install & Restart"
                    : "Check again"}
              </button>
              {notice.status === "available" && (
                <button
                  type="button"
                  onClick={dismiss}
                  className="rounded-lg border border-black/15 px-2.5 py-1.5 text-[11px] font-semibold text-gray-700 transition hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d2af00] dark:border-white/20 dark:text-gray-200 dark:hover:bg-white/10"
                >
                  Later
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
