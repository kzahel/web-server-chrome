import type { ManagedServerInfo, ServerConfig } from "../lib/server-manager";
import { ServingSettings } from "./ServingSettings";

interface SettingsZoneProps {
  server: ManagedServerInfo;
  onConfigChange: (partial: Partial<ServerConfig>) => Promise<void>;
}

export function SettingsZone({ server, onConfigChange }: SettingsZoneProps) {
  const disabled =
    server.status === "running" ||
    server.status === "starting" ||
    server.status === "stopping";

  return (
    <section className="rounded-xl border border-gray-300/80 bg-white px-3.5 py-3 shadow-sm dark:border-[#333] dark:bg-[#1a1a1a]">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Serving options</h2>
        {disabled && (
          <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
            Locked
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
