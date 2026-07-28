import { describe, expect, it } from "vitest";
import {
  LAST_SUCCESSFUL_CHECK_KEY,
  recordSuccessfulCheck,
  shouldCheckForUpdate,
  UPDATE_CHECK_INTERVAL_MS,
} from "./update-check-schedule";

function memoryStorage(initialValue?: string) {
  let value = initialValue;
  return {
    getItem: () => value ?? null,
    setItem: (_key: string, nextValue: string) => {
      value = nextValue;
    },
    value: () => value,
  };
}

describe("desktop update check schedule", () => {
  it("checks when no successful check has been recorded", () => {
    expect(shouldCheckForUpdate(memoryStorage(), 100)).toBe(true);
  });

  it("waits until 24 hours have elapsed", () => {
    const now = 1_000_000;
    const storage = memoryStorage(String(now));

    expect(
      shouldCheckForUpdate(storage, now + UPDATE_CHECK_INTERVAL_MS - 1),
    ).toBe(false);
    expect(shouldCheckForUpdate(storage, now + UPDATE_CHECK_INTERVAL_MS)).toBe(
      true,
    );
  });

  it("checks again when stored state is invalid or from the future", () => {
    expect(shouldCheckForUpdate(memoryStorage("invalid"), 100)).toBe(true);
    expect(shouldCheckForUpdate(memoryStorage("101"), 100)).toBe(true);
  });

  it("records the timestamp after a successful check", () => {
    const storage = memoryStorage();
    recordSuccessfulCheck(storage, 1234);

    expect(storage.value()).toBe("1234");
  });

  it("continues safely when storage is unavailable", () => {
    const unavailable = {
      getItem: () => {
        throw new Error("unavailable");
      },
      setItem: () => {
        throw new Error("unavailable");
      },
    };

    expect(shouldCheckForUpdate(unavailable, 100)).toBe(true);
    expect(() => recordSuccessfulCheck(unavailable, 100)).not.toThrow();
  });

  it("uses the stable persisted key", () => {
    expect(LAST_SUCCESSFUL_CHECK_KEY).toBe(
      "ok200.desktop.last-successful-update-check",
    );
  });
});
