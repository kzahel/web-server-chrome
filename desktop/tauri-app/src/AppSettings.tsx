import { LanguagePicker, localizeDiagnostic, t, useLocale } from "@ok200/i18n";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface DesktopSettingsState {
  autostart: boolean;
  runInBackground: boolean;
  showTrayIcon: boolean;
  trayIconLabel: string;
}

type DesktopSettingsPatch = Partial<
  Pick<DesktopSettingsState, "autostart" | "runInBackground" | "showTrayIcon">
>;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface SettingToggleProps {
  checked: boolean;
  description: string;
  disabled: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}

function SettingToggle({
  checked,
  description,
  disabled,
  label,
  onChange,
}: SettingToggleProps) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold">{label}</span>
        <span className="mt-0.5 block text-[11px] leading-4 text-gray-500 dark:text-gray-400">
          {description}
        </span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-10 shrink-0 rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d2af00] focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60 dark:focus-visible:ring-offset-[#1a1a1a] ${
          checked ? "bg-[#e6c100]" : "bg-gray-300 dark:bg-gray-600"
        }`}
      >
        <span
          className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-[left] ${
            checked ? "left-5" : "left-1"
          }`}
        />
      </button>
    </div>
  );
}

export function AppSettings() {
  useLocale();
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<DesktopSettingsState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    let unlisten: UnlistenFn | undefined;

    void (async () => {
      try {
        unlisten = await listen<DesktopSettingsState>(
          "desktop-settings-changed",
          (event) => {
            if (!disposed) setSettings(event.payload);
          },
        );
        const current = await invoke<DesktopSettingsState>(
          "desktop_settings_get",
        );
        if (!disposed) setSettings(current);
      } catch (loadError) {
        if (!disposed) setError(errorMessage(loadError));
      }
    })();

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  const updateSettings = async (patch: DesktopSettingsPatch) => {
    setSaving(true);
    setError(null);
    try {
      const updated = await invoke<DesktopSettingsState>(
        "desktop_settings_update",
        { patch },
      );
      setSettings(updated);
    } catch (updateError) {
      setError(errorMessage(updateError));
    } finally {
      setSaving(false);
    }
  };

  const checkForUpdates = async () => {
    setError(null);
    try {
      await invoke("desktop_check_for_updates");
      setOpen(false);
    } catch (checkError) {
      setError(errorMessage(checkError));
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition hover:bg-black/5 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d2af00] dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white"
        aria-label={t("desktop.app.settings.d43fb8")}
        title={t("desktop.app.settings.d43fb8")}
        data-testid="app-settings-button"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          className="h-[18px] w-[18px]"
        >
          <path d="M12 15.25A3.25 3.25 0 1 0 12 8.75a3.25 3.25 0 0 0 0 6.5Z" />
          <path d="M19.43 15.1a1.7 1.7 0 0 0 .34 1.88l.06.06-2.79 2.79-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4.14v-.01A1.7 1.7 0 0 0 8.9 19.43a1.7 1.7 0 0 0-1.88.34l-.06.06-2.79-2.79.06-.06a1.7 1.7 0 0 0 .34-1.88A1.7 1.7 0 0 0 3.01 14H3V10h.01a1.7 1.7 0 0 0 1.56-1.1 1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.79-2.79.06.06a1.7 1.7 0 0 0 1.88.34A1.7 1.7 0 0 0 9.93 3.01V3h4.14v.01a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.79 2.79-.06.06a1.7 1.7 0 0 0-.34 1.88A1.7 1.7 0 0 0 20.99 10H21v4h-.01a1.7 1.7 0 0 0-1.56 1.1Z" />
        </svg>
      </button>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-3 backdrop-blur-[1px]"
            data-testid="app-settings-overlay"
          >
            <button
              type="button"
              className="fixed inset-0 cursor-default"
              onClick={() => setOpen(false)}
              aria-label={t("desktop.close.app.settings.4168da")}
            />
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="app-settings-title"
              className="relative z-10 mx-auto mt-8 w-full max-w-sm rounded-2xl border border-gray-300/80 bg-white p-4 text-gray-900 shadow-xl dark:border-[#3a3a3a] dark:bg-[#1a1a1a] dark:text-gray-100"
              data-testid="app-settings-dialog"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 id="app-settings-title" className="text-sm font-semibold">
                    {t("desktop.app.settings.d43fb8")}
                  </h2>
                  <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                    {t(
                      "desktop.these.controls.are.always.available.here.49809b",
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-lg text-gray-500 hover:bg-black/5 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d2af00] dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white"
                  aria-label={t("desktop.close.app.settings.4168da")}
                >
                  ×
                </button>
              </div>

              <LanguagePicker />
              {settings ? (
                <div className="mt-3 divide-y divide-gray-200 dark:divide-[#333]">
                  <SettingToggle
                    checked={settings.autostart}
                    disabled={saving}
                    label={t("desktop.start.at.login.5952eb")}
                    description={t(
                      "desktop.launch.200.ok.when.you.sign.in.b9ed74",
                    )}
                    onChange={(autostart) => void updateSettings({ autostart })}
                  />
                  <SettingToggle
                    checked={settings.runInBackground}
                    disabled={saving}
                    label={t("desktop.run.in.background.0db775")}
                    description={t(
                      "desktop.keep.running.when.the.main.window.is.closed.c46cc8",
                    )}
                    onChange={(runInBackground) =>
                      void updateSettings({ runInBackground })
                    }
                  />
                  <SettingToggle
                    checked={settings.showTrayIcon}
                    disabled={saving}
                    label={localizeDiagnostic(settings.trayIconLabel)}
                    description={t(
                      "desktop.keep.a.shortcut.to.200.ok.in.the.system.area.6f0b61",
                    )}
                    onChange={(showTrayIcon) =>
                      void updateSettings({ showTrayIcon })
                    }
                  />
                </div>
              ) : (
                <p className="mt-4 text-xs text-gray-500">
                  {t("desktop.loading.settings.e71a13")}
                </p>
              )}

              {error && (
                <p
                  className="mt-3 rounded-lg bg-red-50 px-2.5 py-2 text-[11px] leading-4 text-red-700 dark:bg-red-950/40 dark:text-red-200"
                  role="alert"
                >
                  {error}
                </p>
              )}

              <div className="mt-4 flex items-center justify-between gap-2 border-t border-gray-200 pt-3 dark:border-[#333]">
                <button
                  type="button"
                  onClick={() => void checkForUpdates()}
                  className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-[11px] font-semibold transition hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d2af00] dark:border-[#444] dark:hover:bg-white/10"
                >
                  {t("desktop.check.for.updates.9ed79e")}
                </button>
                <button
                  type="button"
                  onClick={() => void invoke("desktop_quit")}
                  className="rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-red-700 transition hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:text-red-300 dark:hover:bg-red-950/40"
                >
                  {t("desktop.quit.200.ok.686f8f")}
                </button>
              </div>
            </section>
          </div>,
          document.body,
        )}
    </>
  );
}
