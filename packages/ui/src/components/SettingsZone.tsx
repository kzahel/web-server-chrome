import type { ServerConfig, ServerInfo } from "@ok200/engine";
import { ServingSettings } from "./ServingSettings";
import { SettingsSection } from "./SettingsSection";

interface SettingsZoneProps {
  server: ServerInfo;
  onConfigChange: (partial: Partial<ServerConfig>) => Promise<void>;
}

function servingSummary(config: ServerConfig): string {
  const parts: string[] = [];
  if (config.host === "0.0.0.0") parts.push("LAN");
  if (config.cors) parts.push("CORS");
  if (config.spa) parts.push("SPA");
  if (!config.directoryListing) parts.push("No listing");
  return parts.length > 0 ? parts.join(", ") : "Default";
}

export function SettingsZone({ server, onConfigChange }: SettingsZoneProps) {
  return (
    <div className="space-y-3">
      <SettingsSection title="Serving" summary={servingSummary(server.config)}>
        <ServingSettings server={server} onConfigChange={onConfigChange} />
      </SettingsSection>

      <SettingsSection title="Security" summary="Coming soon">
        <p className="text-sm text-gray-400">
          HTTPS, Basic Auth, and IP whitelist settings are planned.
        </p>
      </SettingsSection>

      <SettingsSection title="Advanced" summary="Coming soon">
        <p className="text-sm text-gray-400">
          File upload, precompression, cache control, and more are planned.
        </p>
      </SettingsSection>
    </div>
  );
}
