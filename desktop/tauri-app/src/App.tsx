import { App as SharedApp } from "@ok200/ui/App";
import { ServerManagerProvider } from "@ok200/ui/lib/server-manager-context";
import { useMemo } from "react";
import { DesktopUpdater } from "./DesktopUpdater";
import { TauriServerManager } from "./tauri-server-manager";

function App() {
  const manager = useMemo(() => new TauriServerManager(), []);

  return (
    <ServerManagerProvider manager={manager}>
      <SharedApp notification={<DesktopUpdater />} />
    </ServerManagerProvider>
  );
}

export default App;
