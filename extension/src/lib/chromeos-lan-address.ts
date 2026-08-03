type IceCandidateLike = {
  address?: string | null;
  candidate: string;
};

type IceCandidateEventLike = {
  candidate: IceCandidateLike | null;
};

export type LanAddressPeerConnection = {
  addEventListener(
    type: "icecandidate",
    listener: (event: IceCandidateEventLike) => void,
  ): void;
  close(): void;
  createDataChannel(label: string): unknown;
  createOffer(): Promise<RTCSessionDescriptionInit>;
  setLocalDescription(description: RTCSessionDescriptionInit): Promise<void>;
};

type DetectLanAddressOptions = {
  createPeerConnection?: () => LanAddressPeerConnection;
  timeoutMs?: number;
};

export function validIpv4(value: string): boolean {
  const parts = value.split(".");
  return (
    parts.length === 4 &&
    parts.every(
      (part) =>
        /^\d{1,3}$/.test(part) && Number(part) >= 0 && Number(part) <= 255,
    )
  );
}

export function pickChromeOsLanIpv4Address(
  addresses: Iterable<string>,
): string | null {
  const candidates = [...new Set(addresses)].filter(isUsableHostIpv4);
  return candidates.find(isPrivateIpv4) ?? candidates[0] ?? null;
}

export async function detectChromeOsLanIpv4Address(
  options: DetectLanAddressOptions = {},
): Promise<string | null> {
  const createPeerConnection =
    options.createPeerConnection ?? defaultPeerConnectionFactory;
  const timeoutMs = options.timeoutMs ?? 3_000;
  let peer: LanAddressPeerConnection | null = null;
  let gatheringTimeout: ReturnType<typeof globalThis.setTimeout> | null = null;

  try {
    peer = createPeerConnection();
    const addresses: string[] = [];
    const gatheringComplete = new Promise<void>((resolve) => {
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        if (gatheringTimeout !== null) {
          globalThis.clearTimeout(gatheringTimeout);
          gatheringTimeout = null;
        }
        resolve();
      };
      gatheringTimeout = globalThis.setTimeout(finish, timeoutMs);
      peer?.addEventListener("icecandidate", (event) => {
        if (!event.candidate) {
          finish();
          return;
        }
        const address = candidateAddress(event.candidate);
        if (address) addresses.push(address);
      });
    });

    peer.createDataChannel("ok200-lan-address-probe");
    await peer.setLocalDescription(await peer.createOffer());
    await gatheringComplete;
    return pickChromeOsLanIpv4Address(addresses);
  } catch {
    return null;
  } finally {
    if (gatheringTimeout !== null) {
      globalThis.clearTimeout(gatheringTimeout);
    }
    peer?.close();
  }
}

function defaultPeerConnectionFactory(): LanAddressPeerConnection {
  if (typeof RTCPeerConnection === "undefined") {
    throw new Error("WebRTC is unavailable");
  }
  return new RTCPeerConnection({ iceServers: [] });
}

function candidateAddress(candidate: IceCandidateLike): string | null {
  if (candidate.address) return candidate.address;
  const fields = candidate.candidate.trim().split(/\s+/);
  return fields[4] ?? null;
}

function isUsableHostIpv4(address: string): boolean {
  if (!validIpv4(address)) return false;
  const [first = 0, second = 0] = address.split(".").map(Number);
  if (first === 0 || first === 127 || first >= 224) return false;
  if (first === 169 && second === 254) return false;
  // ChromeOS uses this host/VM/ARC range internally. It is not a peer-facing
  // Chromebook address and must never become the displayed LAN URL.
  if (first === 100 && second === 115) return false;
  return true;
}

function isPrivateIpv4(address: string): boolean {
  const [first = 0, second = 0] = address.split(".").map(Number);
  return (
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}
