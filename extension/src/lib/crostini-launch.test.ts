import { describe, expect, it } from "vitest";
import {
  CROSTINI_HOST_PERMISSION,
  CROSTINI_POPUP_SIZE,
  controllerOrigin,
  isCrostiniUiUrl,
  parseCrostiniLaunch,
} from "./crostini-launch";

const request = {
  type: "open-linux-controller",
  claimed: false,
  claimCode: "a".repeat(64),
  instanceId: "probe-1",
  port: 18182,
};

describe("Crostini launch bridge", () => {
  it("uses the accepted portrait control window", () => {
    expect(CROSTINI_POPUP_SIZE).toEqual({ height: 750, width: 460 });
  });

  it("accepts the exact local launch page and matching controller port", () => {
    expect(
      parseCrostiniLaunch(
        request,
        "http://penguin.linux.test:18182/launch-chromeos",
      ),
    ).toEqual({
      claimed: false,
      claimCode: "a".repeat(64),
      instanceId: "probe-1",
      port: 18182,
    });
    expect(controllerOrigin(18182)).toBe("http://penguin.linux.test:18182");
    expect(CROSTINI_HOST_PERMISSION).toBe("http://penguin.linux.test/*");
  });

  it.each([
    "https://penguin.linux.test:18182/launch-chromeos",
    "http://localhost:18182/launch-chromeos",
    "http://penguin.linux.test:18182/not-the-launch-page",
    "http://penguin.linux.test.evil.example:18182/launch-chromeos",
  ])("rejects sender URL %s", (senderUrl) => {
    expect(parseCrostiniLaunch(request, senderUrl)).toBeNull();
  });

  it("rejects a port that does not match the sender URL", () => {
    expect(
      parseCrostiniLaunch(
        { ...request, port: 18183 },
        "http://penguin.linux.test:18182/launch-chromeos",
      ),
    ).toBeNull();
  });

  it("matches only the controller UI and its query string", () => {
    const baseUrl = "chrome-extension://example/src/ui/crostini.html";
    expect(isCrostiniUiUrl(baseUrl, baseUrl)).toBe(true);
    expect(isCrostiniUiUrl(`${baseUrl}?port=18182`, baseUrl)).toBe(true);
    expect(isCrostiniUiUrl(`${baseUrl}.evil?port=18182`, baseUrl)).toBe(false);
    expect(isCrostiniUiUrl(undefined, baseUrl)).toBe(false);
  });

  it.each([
    undefined,
    null,
    "probe with spaces",
    "x".repeat(65),
  ])("rejects invalid instance ID %s", (instanceId) => {
    expect(
      parseCrostiniLaunch(
        { ...request, instanceId },
        "http://penguin.linux.test:18182/launch-chromeos",
      ),
    ).toBeNull();
  });

  it("accepts a claimed controller without a claim code", () => {
    expect(
      parseCrostiniLaunch(
        { ...request, claimed: true, claimCode: undefined },
        "http://penguin.linux.test:18182/launch-chromeos",
      ),
    ).toEqual({
      claimed: true,
      claimCode: undefined,
      instanceId: "probe-1",
      port: 18182,
    });
  });

  it.each([
    { claimed: false, claimCode: undefined },
    { claimed: false, claimCode: "short" },
    { claimed: true, claimCode: "a".repeat(64) },
    { claimed: "yes", claimCode: undefined },
  ])("rejects invalid claim state %#", (claim) => {
    expect(
      parseCrostiniLaunch(
        { ...request, ...claim },
        "http://penguin.linux.test:18182/launch-chromeos",
      ),
    ).toBeNull();
  });
});
