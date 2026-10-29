import { configureLanguage } from "@ok200/i18n";
import { App as SharedApp } from "@ok200/ui/App";
import { ServerManagerProvider } from "@ok200/ui/lib/server-manager-context";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useMemo } from "react";
import { AppSettings } from "./AppSettings";
import { DesktopUpdater } from "./DesktopUpdater";
import { TauriServerManager } from "./tauri-server-manager";

function App() {
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    type LanguageState = { preference: string; systemLanguages: string[] };
    const apply = (state: LanguageState) =>
      configureLanguage(state.preference, state.systemLanguages, (preference) =>
        invoke("desktop_language_set", { preference }),
      );
    void (async () => {
      const stop = await listen<LanguageState>(
        "desktop-language-changed",
        (event) => {
          if (!disposed) apply(event.payload);
        },
      );
      if (disposed) {
        stop();
        return;
      }
      unlisten = stop;
      const state = await invoke<LanguageState>("desktop_language_get");
      if (!disposed) apply(state);
    })().catch(console.error);
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);
  const manager = useMemo(() => new TauriServerManager(), []);

  return (
    <ServerManagerProvider manager={manager}>
      <SharedApp
        notification={<DesktopUpdater />}
        headerAction={<AppSettings />}
      />
    </ServerManagerProvider>
  );
}

export default App;
