import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PERIODIC_CHECK_INTERVAL_MS,
  STARTUP_CHECK_DELAY_MS,
  scheduleAutomaticUpdateChecks,
} from "./update-check-schedule";

describe("desktop update check schedule", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("checks five seconds after every app launch", () => {
    vi.useFakeTimers();
    const check = vi.fn();

    scheduleAutomaticUpdateChecks(check);
    vi.advanceTimersByTime(STARTUP_CHECK_DELAY_MS - 1);
    expect(check).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(check).toHaveBeenCalledOnce();
    expect(check).toHaveBeenLastCalledWith("startup");
  });

  it("checks every 24 hours while the app remains open", () => {
    vi.useFakeTimers();
    const check = vi.fn();

    scheduleAutomaticUpdateChecks(check);
    vi.advanceTimersByTime(STARTUP_CHECK_DELAY_MS);
    check.mockClear();

    vi.advanceTimersByTime(
      PERIODIC_CHECK_INTERVAL_MS - STARTUP_CHECK_DELAY_MS - 1,
    );
    expect(check).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(check).toHaveBeenCalledOnce();
    expect(check).toHaveBeenLastCalledWith("periodic");

    vi.advanceTimersByTime(PERIODIC_CHECK_INTERVAL_MS);
    expect(check).toHaveBeenCalledTimes(2);
  });

  it("cancels both timers when the updater is disposed", () => {
    vi.useFakeTimers();
    const check = vi.fn();

    const dispose = scheduleAutomaticUpdateChecks(check);
    dispose();
    vi.runOnlyPendingTimers();

    expect(check).not.toHaveBeenCalled();
  });
});
