import type { ServerInfo } from "@ok200/engine";
import { useCallback, useEffect, useState } from "react";
import { useServerManager } from "../lib/server-manager-context";

export function useServers() {
  const manager = useServerManager();
  const [servers, setServers] = useState<ServerInfo[]>([]);

  const refresh = useCallback(() => {
    manager.listServers().then(setServers).catch(console.error);
  }, [manager]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 2000);
    return () => clearInterval(interval);
  }, [refresh]);

  return { servers, refresh };
}
