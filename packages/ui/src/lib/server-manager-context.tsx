import { createContext, type ReactNode, useContext } from "react";
import type { ServerManager } from "./server-manager";

const ServerManagerContext = createContext<ServerManager | null>(null);

export function ServerManagerProvider({
  manager,
  children,
}: {
  manager: ServerManager;
  children: ReactNode;
}) {
  return (
    <ServerManagerContext value={manager}>{children}</ServerManagerContext>
  );
}

export function useServerManager(): ServerManager {
  const ctx = useContext(ServerManagerContext);
  if (!ctx) {
    throw new Error(
      "useServerManager must be used within ServerManagerProvider",
    );
  }
  return ctx;
}
