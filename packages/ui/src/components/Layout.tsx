import { useState } from "react";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { useServers } from "../hooks/useServers";
import { MobileHeader } from "./MobileHeader";
import { ServerPage } from "./ServerPage";
import { Sidebar } from "./Sidebar";

interface LayoutProps {
  onOpenSettings: () => void;
}

export function Layout({ onOpenSettings }: LayoutProps) {
  const { servers, refresh } = useServers();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const isWide = useMediaQuery("(min-width: 600px)");

  // Auto-select first server if none selected
  const activeId =
    selectedId && servers.some((s) => s.id === selectedId)
      ? selectedId
      : (servers[0]?.id ?? null);

  return (
    <div className="h-screen flex flex-col md:flex-row bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      {isWide ? (
        <>
          <Sidebar
            servers={servers}
            selectedId={activeId}
            onSelect={setSelectedId}
            onOpenSettings={onOpenSettings}
          />
          <main className="flex-1 overflow-y-auto">
            {activeId ? (
              <ServerPage serverId={activeId} onServerChange={refresh} />
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400">
                No servers
              </div>
            )}
          </main>
        </>
      ) : (
        <>
          <MobileHeader
            servers={servers}
            selectedId={activeId}
            onSelect={setSelectedId}
            onOpenSettings={onOpenSettings}
          />
          <main className="flex-1 overflow-y-auto">
            {activeId ? (
              <ServerPage serverId={activeId} onServerChange={refresh} />
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400">
                No servers
              </div>
            )}
          </main>
        </>
      )}
    </div>
  );
}
