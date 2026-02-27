import type { ServerConfig, ServerInfo } from "@ok200/engine";
import { useCallback, useEffect, useState } from "react";
import { useServerManager } from "../lib/server-manager-context";

export function useServer(serverId: string) {
  const manager = useServerManager();
  const [server, setServer] = useState<ServerInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const info = await manager.getServer(serverId);
      setServer(info ?? null);
    } catch (err) {
      console.error("Failed to fetch server:", err);
    }
    setLoading(false);
  }, [manager, serverId]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 2000);
    return () => clearInterval(interval);
  }, [refresh]);

  const start = useCallback(async () => {
    const info = await manager.startServer(serverId);
    setServer(info);
  }, [manager, serverId]);

  const stop = useCallback(async () => {
    const info = await manager.stopServer(serverId);
    setServer(info);
  }, [manager, serverId]);

  const updateConfig = useCallback(
    async (partial: Partial<ServerConfig>) => {
      const info = await manager.updateServer(serverId, partial);
      setServer(info);
    },
    [manager, serverId],
  );

  return { server, loading, start, stop, updateConfig, refresh };
}
