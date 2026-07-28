import type { ServerConfig } from "@ok200/engine";
import type { ManagedServerInfo } from "../lib/server-manager";
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
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <h2 className="font-semibold">Serving options</h2>
      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
        Stop the server before changing these options.
      </p>
      <div className="mt-3">
        <ServingSettings
          server={server}
          onConfigChange={onConfigChange}
          disabled={disabled}
        />
      </div>
    </section>
  );
}
