import { useServer } from "../hooks/useServer";
import { HeroZone } from "./HeroZone";
import { SettingsZone } from "./SettingsZone";

interface ServerPageProps {
  serverId: string;
  onServerChange: () => void;
}

export function ServerPage({ serverId, onServerChange }: ServerPageProps) {
  const { server, loading, start, stop, updateConfig } = useServer(serverId);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        Loading...
      </div>
    );
  }

  if (!server) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        Server not found
      </div>
    );
  }

  const handleStart = async () => {
    await start();
    onServerChange();
  };

  const handleStop = async () => {
    await stop();
    onServerChange();
  };

  return (
    <div className="p-4 max-w-xl mx-auto space-y-6">
      <HeroZone
        server={server}
        onStart={handleStart}
        onStop={handleStop}
        onConfigChange={updateConfig}
      />
      <SettingsZone server={server} onConfigChange={updateConfig} />
    </div>
  );
}
