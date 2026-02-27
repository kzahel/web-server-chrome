import type { ServerInfo } from "@ok200/engine";

interface ServerListItemProps {
  server: ServerInfo;
  selected: boolean;
  onSelect: () => void;
}

function shortenPath(path: string): string {
  if (path.startsWith("/home/")) {
    return `~/${path.slice(path.indexOf("/", 6) + 1)}`;
  }
  if (path.startsWith("/Users/")) {
    return `~/${path.slice(path.indexOf("/", 7) + 1)}`;
  }
  return path;
}

export function ServerListItem({
  server,
  selected,
  onSelect,
}: ServerListItemProps) {
  const isRunning = server.status === "running";
  const port = server.actualPort ?? server.config.port;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
        selected
          ? "bg-blue-50 dark:bg-blue-900/30"
          : "hover:bg-gray-50 dark:hover:bg-gray-800"
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`w-2 h-2 rounded-full shrink-0 ${
            isRunning ? "bg-green-500" : "bg-gray-300 dark:bg-gray-600"
          }`}
        />
        <span className="font-medium text-sm truncate">
          :{port} &middot; {shortenPath(server.config.root)}
        </span>
      </div>
    </button>
  );
}
