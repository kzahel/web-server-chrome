import type { ServerConfig, ServerInfo } from "@ok200/engine";

interface ServingSettingsProps {
  server: ServerInfo;
  onConfigChange: (partial: Partial<ServerConfig>) => Promise<void>;
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between py-2 cursor-pointer">
      <span className="text-sm">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${
          checked ? "bg-blue-500" : "bg-gray-300 dark:bg-gray-600"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform mt-0.5 ${
            checked ? "translate-x-4 ml-0.5" : "translate-x-0 ml-0.5"
          }`}
        />
      </button>
    </label>
  );
}

export function ServingSettings({
  server,
  onConfigChange,
}: ServingSettingsProps) {
  const { config } = server;

  return (
    <div className="divide-y divide-gray-100 dark:divide-gray-800">
      <Toggle
        label="LAN access"
        checked={config.host === "0.0.0.0"}
        onChange={(on) =>
          onConfigChange({ host: on ? "0.0.0.0" : "127.0.0.1" })
        }
      />
      <Toggle
        label="Directory listing"
        checked={config.directoryListing}
        onChange={(on) => onConfigChange({ directoryListing: on })}
      />
      <Toggle
        label="CORS"
        checked={config.cors}
        onChange={(on) => onConfigChange({ cors: on })}
      />
      <Toggle
        label="SPA mode"
        checked={config.spa}
        onChange={(on) => onConfigChange({ spa: on })}
      />
    </div>
  );
}
