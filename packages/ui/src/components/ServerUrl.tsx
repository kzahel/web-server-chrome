import { useState } from "react";

interface ServerUrlProps {
  host: string;
  port: number;
}

export function ServerUrl({ host, port }: ServerUrlProps) {
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
    <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-500 hover:text-blue-600 text-sm font-mono flex-1 truncate"
      >
        {url}
      </a>
      <button
        type="button"
        onClick={handleCopy}
        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 shrink-0 text-sm"
        title="Copy URL"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
