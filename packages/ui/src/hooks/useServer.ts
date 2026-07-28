import { useCallback, useEffect, useState } from "react";
import type {
  ManagedServerInfo,
  ServerConfig,
  StartOptions,
} from "../lib/server-manager";
import { useServerManager } from "../lib/server-manager-context";

export function useServer(serverId: string) {
  const manager = useServerManager();
  const [server, setServer] = useState<ManagedServerInfo | null>(null);
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

  useEffect(() => {
    if (!manager.subscribe) return;
    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    manager
      .subscribe((info) => {
        if (!disposed && info.id === serverId) setServer(info);
      })
      .then((cleanup) => {
        if (disposed) cleanup();
        else unsubscribe = cleanup;
      })
      .catch((error) => console.error("Failed to subscribe to server:", error));
    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, [manager, serverId]);

  const start = useCallback(
    async (options?: StartOptions) => {
      const info = await manager.startServer(serverId, options);
      setServer(info);
    },
    [manager, serverId],
  );

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

  const chooseRoot = useCallback(async () => {
    if (!manager.pickDirectory) {
      throw new Error("A native folder chooser is not available");
    }
    const path = await manager.pickDirectory(server?.config.root);
    if (path === null) return;
    const info = await manager.updateServer(serverId, { root: path });
    setServer(info);
  }, [manager, server?.config.root, serverId]);

  return {
    server,
    loading,
    start,
    stop,
    updateConfig,
    chooseRoot,
    hasNativeFolderChooser: Boolean(manager.pickDirectory),
    refresh,
  };
}
