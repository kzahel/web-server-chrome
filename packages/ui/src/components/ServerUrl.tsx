import { useState } from "react";

interface ServerUrlProps {
  host: string;
  port: number;
  onOpen: (url: string) => Promise<void>;
}

function ExternalLinkIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="M11 4h5v5M9 11l7-7" />
      <path d="M16 11v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h4" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <rect x="7" y="7" width="9" height="9" rx="1.5" />
      <path d="M13 7V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h2" />
    </svg>
  );
}

export function ServerUrl({ host, port, onOpen }: ServerUrlProps) {
  const [copied, setCopied] = useState(false);
  const displayHost = host === "0.0.0.0" ? "localhost" : host;
  const url = `http://${displayHost}:${port}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may not be available
    }
  };

  return (
    <div className="flex items-stretch overflow-hidden rounded-lg border border-gray-300 bg-gray-50 dark:border-gray-700 dark:bg-gray-800">
      <button
        type="button"
        onClick={() => void onOpen(url)}
        data-testid="server-url"
        className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-left font-mono text-xs font-medium text-[#8a6800] transition hover:bg-[#f8d203]/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#f8d203] dark:text-[#f8d203]"
        title="Open in default browser"
      >
        <span className="min-w-0 flex-1 truncate">{url}</span>
        <ExternalLinkIcon />
      </button>
      <button
        type="button"
        onClick={handleCopy}
        className="flex w-10 shrink-0 items-center justify-center border-l border-gray-300 text-gray-500 transition hover:bg-gray-100 hover:text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#f8d203] dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100"
        title="Copy URL"
        aria-label={copied ? "URL copied" : "Copy URL"}
      >
        {copied ? (
          <span className="text-[10px] font-semibold">Copied</span>
        ) : (
          <CopyIcon />
        )}
      </button>
    </div>
  );
}
