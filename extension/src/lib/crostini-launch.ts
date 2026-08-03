export const CROSTINI_HOST = "penguin.linux.test";
export const CROSTINI_LAUNCH_PATH = "/launch-chromeos";
export const CROSTINI_HOST_PERMISSION = `http://${CROSTINI_HOST}/*`;
export const CROSTINI_UI_PATH = "src/ui/crostini.html";
export const CROSTINI_POPUP_SIZE = { height: 750, width: 460 } as const;

export type CrostiniLaunch = {
  claimed: boolean;
  claimCode?: string;
  instanceId: string;
  port: number;
};

export function parseCrostiniLaunch(
  message: unknown,
  senderUrl: string | undefined,
): CrostiniLaunch | null {
  if (!senderUrl || !isRecord(message)) return null;
  if (message.type !== "open-linux-controller") return null;

  let url: URL;
  try {
    url = new URL(senderUrl);
  } catch {
    return null;
  }

  if (
    url.protocol !== "http:" ||
    url.hostname !== CROSTINI_HOST ||
    url.pathname !== CROSTINI_LAUNCH_PATH ||
    url.username ||
    url.password
  ) {
    return null;
  }

  const senderPort = Number(url.port || "80");
  if (!isControllerPort(senderPort) || message.port !== senderPort) {
    return null;
  }

  if (
    typeof message.instanceId !== "string" ||
    !/^[A-Za-z0-9._-]{1,64}$/.test(message.instanceId)
  ) {
    return null;
  }

  if (typeof message.claimed !== "boolean") return null;
  if (message.claimed) {
    if (message.claimCode !== undefined) return null;
  } else if (
    typeof message.claimCode !== "string" ||
    !/^[A-Fa-f0-9]{64}$/.test(message.claimCode)
  ) {
    return null;
  }

  return {
    claimed: message.claimed,
    claimCode: message.claimCode,
    instanceId: message.instanceId,
    port: senderPort,
  };
}

export function controllerOrigin(port: number): string {
  if (!isControllerPort(port))
    throw new Error("Invalid Crostini controller port");
  return `http://${CROSTINI_HOST}:${port}`;
}

export function isCrostiniUiUrl(
  candidate: string | undefined,
  baseUrl: string,
): boolean {
  return candidate === baseUrl || candidate?.startsWith(`${baseUrl}?`) === true;
}

function isControllerPort(value: number): boolean {
  return Number.isInteger(value) && value >= 1024 && value <= 65_535;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
