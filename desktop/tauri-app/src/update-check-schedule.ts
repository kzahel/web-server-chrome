export const LAST_SUCCESSFUL_CHECK_KEY =
  "ok200.desktop.last-successful-update-check";
export const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

type UpdateCheckStorage = Pick<Storage, "getItem" | "setItem">;

export function shouldCheckForUpdate(
  storage: UpdateCheckStorage,
  now = Date.now(),
): boolean {
  try {
    const stored = storage.getItem(LAST_SUCCESSFUL_CHECK_KEY);
    if (!stored) return true;
    const lastCheck = Number(stored);
    return (
      !Number.isFinite(lastCheck) ||
      lastCheck > now ||
      now - lastCheck >= UPDATE_CHECK_INTERVAL_MS
    );
  } catch {
    return true;
  }
}

export function recordSuccessfulCheck(
  storage: UpdateCheckStorage,
  now = Date.now(),
): void {
  try {
    storage.setItem(LAST_SUCCESSFUL_CHECK_KEY, String(now));
  } catch {
    // Update checks should still work if web storage is unavailable.
  }
}
