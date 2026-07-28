import type { ServerConfig, ServerInfo } from "../lib/server-manager";
import { LockedControl } from "./LockedControl";

interface ServingSettingsProps {
  server: ServerInfo;
  onConfigChange: (partial: Partial<ServerConfig>) => Promise<void>;
  disabled?: boolean;
}

function Toggle({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <LockedControl locked={disabled}>
      <div
        className={`flex items-center justify-between py-1.5 ${
          disabled ? "opacity-50" : ""
        }`}
      >
        <span className="text-[13px]">{label}</span>
        <button
          type="button"
          role="switch"
          aria-label={label}
          aria-checked={checked}
          disabled={disabled}
          onClick={() => onChange(!checked)}
          className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f8d203] focus-visible:ring-offset-2 disabled:pointer-events-none dark:focus-visible:ring-offset-gray-900 ${
            checked ? "bg-[#f8d203]" : "bg-gray-300 dark:bg-gray-600"
          }`}
        >
          <span
            className={`mt-0.5 ml-0.5 inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              checked ? "translate-x-4" : "translate-x-0"
            }`}
          />
        </button>
      </div>
    </LockedControl>
  );
}

export function ServingSettings({
  server,
  onConfigChange,
  disabled = false,
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
        disabled={disabled}
      />
      <Toggle
        label="Directory listing"
        checked={config.directoryListing}
        onChange={(on) => onConfigChange({ directoryListing: on })}
        disabled={disabled}
      />
      <Toggle
        label="CORS"
        checked={config.cors}
        onChange={(on) => onConfigChange({ cors: on })}
        disabled={disabled}
      />
      <Toggle
        label="SPA mode"
        checked={config.spa}
        onChange={(on) => onConfigChange({ spa: on })}
        disabled={disabled}
      />
    </div>
  );
}
