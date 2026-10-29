import { t, useLocale } from "@ok200/i18n";
import { useServer } from "../hooks/useServer";
import { HeroZone } from "./HeroZone";
import { SettingsZone } from "./SettingsZone";

interface ServerPageProps {
  serverId: string;
}

export function ServerPage({ serverId }: ServerPageProps) {
  useLocale();
  const {
    server,
    loading,
    start,
    stop,
    updateConfig,
    chooseRoot,
    openUrl,
    hasNativeFolderChooser,
  } = useServer(serverId);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        {t("desktop.loading.47d2a5")}
      </div>
    );
  }

  if (!server) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        {t("desktop.server.not.found.d7783f")}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-3 p-3">
      <HeroZone
        server={server}
        onStart={start}
        onStop={stop}
        onConfigChange={updateConfig}
        onChooseRoot={chooseRoot}
        onOpenUrl={openUrl}
        hasNativeFolderChooser={hasNativeFolderChooser}
      />
      <SettingsZone server={server} onConfigChange={updateConfig} />
    </div>
  );
}
