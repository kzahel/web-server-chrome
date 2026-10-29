import { t, useLocale } from "@ok200/i18n";
import type { ManagedServerInfo, ServerConfig } from "../lib/server-manager";
import { ServingSettings } from "./ServingSettings";

interface SettingsZoneProps {
  server: ManagedServerInfo;
  onConfigChange: (partial: Partial<ServerConfig>) => Promise<void>;
}

export function SettingsZone({ server, onConfigChange }: SettingsZoneProps) {
  useLocale();
  const disabled =
    server.status === "running" ||
    server.status === "starting" ||
    server.status === "stopping";

  return (
    <section className="rounded-xl border border-gray-300/80 bg-white px-3.5 py-3 shadow-sm dark:border-[#333] dark:bg-[#1a1a1a]">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">
          {t("desktop.serving.options.ac430f")}
        </h2>
        {disabled && (
          <span className="text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {t("desktop.locked.a424e3")}
          </span>
        )}
      </div>
      <div className="mt-1.5">
        <ServingSettings
          server={server}
          onConfigChange={onConfigChange}
          disabled={disabled}
        />
      </div>
    </section>
  );
}
