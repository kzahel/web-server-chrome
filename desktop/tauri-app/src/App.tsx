import type { TauriInvokeFn } from "@ok200/engine";
import { defaultConfig, ServerRegistry } from "@ok200/engine";
import { App as SharedApp } from "@ok200/ui/App";
import { DirectServerManager } from "@ok200/ui/lib/direct-server-manager";
import { ServerManagerProvider } from "@ok200/ui/lib/server-manager-context";
import { Channel, invoke } from "@tauri-apps/api/core";
import { useMemo } from "react";
import { createDesktopServer, stopDesktopServer } from "./server";

const registry = new ServerRegistry();
registry.register("default", defaultConfig(""));

function App() {
  const manager = useMemo(() => {
    return new DirectServerManager(registry, {
      onStart: async (id) => {
        const server = registry.getServer(id);
        if (!server) throw new Error(`Server not found: ${id}`);
        const actualPort = await createDesktopServer(
          server.config,
          invoke as TauriInvokeFn,
          Channel,
        );
        registry.setStatus(id, "running", actualPort);
        const info = registry.getServer(id);
        if (!info) throw new Error(`Server not found: ${id}`);
        return info;
      },
      onStop: async (id) => {
        await stopDesktopServer();
        registry.setStatus(id, "stopped");
        const info = registry.getServer(id);
        if (!info) throw new Error(`Server not found: ${id}`);
        return info;
      },
    });
  }, []);

  return (
    <ServerManagerProvider manager={manager}>
      <SharedApp />
    </ServerManagerProvider>
  );
}

export default App;
