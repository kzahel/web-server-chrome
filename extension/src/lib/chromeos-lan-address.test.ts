import { describe, expect, it, vi } from "vitest";
import {
  detectChromeOsLanIpv4Address,
  type LanAddressPeerConnection,
  pickChromeOsLanIpv4Address,
  validIpv4,
} from "./chromeos-lan-address";

describe("ChromeOS LAN address discovery", () => {
  it("rejects internal ChromeOS addresses and selects the Wi-Fi candidate", () => {
    expect(
      pickChromeOsLanIpv4Address([
        "127.0.0.1",
        "100.115.92.25",
        "192.168.1.106",
      ]),
    ).toBe("192.168.1.106");
  });

  it("prefers a private LAN candidate over a public interface", () => {
    expect(pickChromeOsLanIpv4Address(["203.0.113.8", "10.42.0.7"])).toBe(
      "10.42.0.7",
    );
  });

  it("validates complete IPv4 literals", () => {
    expect(validIpv4("192.168.1.106")).toBe(true);
    expect(validIpv4("192.168.1.999")).toBe(false);
    expect(validIpv4("192.168.1")).toBe(false);
  });

  it("gathers host candidates without an external discovery server", async () => {
    const close = vi.fn();
    let listener:
      | ((event: { candidate: FakeCandidate | null }) => void)
      | null = null;
    type FakeCandidate = { address?: string; candidate: string };
    const peer: LanAddressPeerConnection = {
      addEventListener(_type, nextListener) {
        listener = nextListener;
      },
      close,
      createDataChannel: vi.fn(),
      async createOffer() {
        return { sdp: "", type: "offer" };
      },
      async setLocalDescription() {
        listener?.({
          candidate: {
            address: "100.115.92.25",
            candidate: "candidate:1 1 udp 1 100.115.92.25 40000 typ host",
          },
        });
        listener?.({
          candidate: {
            candidate: "candidate:2 1 udp 1 192.168.1.106 40001 typ host",
          },
        });
        listener?.({ candidate: null });
      },
    };

    await expect(
      detectChromeOsLanIpv4Address({
        createPeerConnection: () => peer,
        timeoutMs: 50,
      }),
    ).resolves.toBe("192.168.1.106");
    expect(peer.createDataChannel).toHaveBeenCalledWith(
      "ok200-lan-address-probe",
    );
    expect(close).toHaveBeenCalledOnce();
  });
});
