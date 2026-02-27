import type { ServerInfo } from "@ok200/engine";
import { useState } from "react";
import { ServerListItem } from "./ServerListItem";

interface MobileHeaderProps {
  servers: ServerInfo[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onOpenSettings: () => void;
}

export function MobileHeader({
  servers,
  selectedId,
  onSelect,
  onOpenSettings,
}: MobileHeaderProps) {
  const [open, setOpen] = useState(false);
  const selected = servers.find((s) => s.id === selectedId);
  const isRunning = selected?.status === "running";
  const port = selected?.actualPort ?? selected?.config.port;

  return (
    <div className="border-b border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 font-medium text-sm"
        >
          <span className={open ? "rotate-180" : ""}>&#9660;</span>
          {selected ? (
            <span>
              <span
                className={`inline-block w-2 h-2 rounded-full mr-1 ${isRunning ? "bg-green-500" : "bg-gray-300"}`}
              />
              :{port}
            </span>
          ) : (
            <span>No servers</span>
          )}
        </button>
        <button
          type="button"
          onClick={onOpenSettings}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          title="Settings"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492M5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0" />
            <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 0 0 2.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 0 0 1.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 0 0-1.115 2.693l.16.291c.415.764-.42 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 0 0-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 0 0-2.692-1.115l-.292.16c-.764.415-1.6-.42-1.184-1.185l.159-.291A1.873 1.873 0 0 0 1.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 0 0 3.06 4.377l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 0 0 2.692-1.116z" />
          </svg>
        </button>
      </div>
      {open && (
        <div className="px-2 pb-2 space-y-1">
          {servers.map((server) => (
            <ServerListItem
              key={server.id}
              server={server}
              selected={server.id === selectedId}
              onSelect={() => {
                onSelect(server.id);
                setOpen(false);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
