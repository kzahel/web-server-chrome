export const STARTUP_CHECK_DELAY_MS = 5_000;
export const PERIODIC_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

export type AutomaticCheckReason = "startup" | "periodic";

type TimerHandle = ReturnType<typeof globalThis.setTimeout>;

interface UpdateCheckTimers {
  setTimeout(callback: () => void, delay: number): TimerHandle;
  clearTimeout(handle: TimerHandle): void;
  setInterval(callback: () => void, delay: number): TimerHandle;
  clearInterval(handle: TimerHandle): void;
}

/**
 * Mirror JSTorrent's shipped app cadence: check shortly after every launch,
 * then once per day for as long as this app instance remains open.
 */
export function scheduleAutomaticUpdateChecks(
  check: (reason: AutomaticCheckReason) => void,
  timers: UpdateCheckTimers = globalThis,
): () => void {
  const startupTimer = timers.setTimeout(
    () => check("startup"),
    STARTUP_CHECK_DELAY_MS,
  );
  const periodicTimer = timers.setInterval(
    () => check("periodic"),
    PERIODIC_CHECK_INTERVAL_MS,
  );

  return () => {
    timers.clearTimeout(startupTimer);
    timers.clearInterval(periodicTimer);
  };
}
