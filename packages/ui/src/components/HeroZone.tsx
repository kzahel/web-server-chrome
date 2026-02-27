import type { ServerConfig, ServerInfo } from "@ok200/engine";
import { useState } from "react";
import { ServerUrl } from "./ServerUrl";

interface HeroZoneProps {
  server: ServerInfo;
  onStart: () => Promise<void>;
  onStop: () => Promise<void>;
  onConfigChange: (partial: Partial<ServerConfig>) => Promise<void>;
}

export function HeroZone({
  server,
  onStart,
  onStop,
  onConfigChange,
}: HeroZoneProps) {
  const isRunning = server.status === "running";
  const [actionPending, setActionPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAction = async () => {
    setActionPending(true);
    setError(null);
    try {
      if (isRunning) {
        await onStop();
      } else {
        await onStart();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setActionPending(false);
  };

  return (
    <div className="space-y-4">
      {/* Directory */}
      <div>
        <label
          htmlFor="root"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
        >
          Directory
        </label>
        <input
          id="root"
          type="text"
          value={server.config.root}
          onChange={(e) => onConfigChange({ root: e.target.value })}
          disabled={isRunning}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          placeholder="/path/to/directory"
        />
      </div>

      {/* Port */}
      <div>
        <label
          htmlFor="port"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
        >
          Port
        </label>
        <input
          id="port"
          type="number"
          min={0}
          max={65535}
          value={server.config.port}
          onChange={(e) =>
            onConfigChange({ port: Number.parseInt(e.target.value, 10) || 0 })
          }
          disabled={isRunning}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        />
      </div>

      {/* Start / Stop */}
      <button
        type="button"
        onClick={handleAction}
        disabled={actionPending}
        className={`w-full py-3 rounded-lg font-semibold text-lg transition-colors disabled:opacity-50 ${
          isRunning
            ? "bg-red-500 hover:bg-red-600 text-white"
            : "bg-green-500 hover:bg-green-600 text-white"
        }`}
      >
        {actionPending
          ? isRunning
            ? "Stopping..."
            : "Starting..."
          : isRunning
            ? "Stop"
            : "Start"}
      </button>

      {/* Error */}
      {(error || server.error) && (
        <div className="text-red-500 text-sm">{error || server.error}</div>
      )}

      {/* Server URL */}
      {isRunning && server.actualPort && (
        <ServerUrl host={server.config.host} port={server.actualPort} />
      )}
    </div>
  );
}
