// Pure rules that decide WHEN the system asks AbacatePay about a PIX, so we don't poll for nothing.

/** Orders already expired/cancelled locally are only re-checked while they are this recent (a late webhook edge case). */
export const CLOSED_RECHECK_WINDOW_MS = 6 * 3_600_000;

/**
 * Backoff for expired/cancelled orders, stateless (the reconcile cron runs every ~2 min):
 * < 30 min old → every run; < 2 h → once every 10 min; < 6 h → once every 30 min; older → never.
 */
export function shouldRecheckClosedOrder(ageMs: number, nowMs: number): boolean {
  if (ageMs < 0 || ageMs >= CLOSED_RECHECK_WINDOW_MS) return false;
  const minute = Math.floor(nowMs / 60_000);
  if (ageMs < 30 * 60_000) return true;
  if (ageMs < 2 * 3_600_000) return minute % 10 < 2;
  return minute % 30 < 2;
}

/** In-memory "at most once per minMs per key". Returns true when the caller may proceed. */
export function createThrottle(minMs: number, maxKeys = 500) {
  const last = new Map<string, number>();
  return (key: string, nowMs: number): boolean => {
    const prev = last.get(key);
    if (prev !== undefined && nowMs - prev < minMs) return false;
    if (last.size >= maxKeys) {
      for (const [k, t] of last) if (nowMs - t >= minMs) last.delete(k);
      if (last.size >= maxKeys) last.clear();
    }
    last.set(key, nowMs);
    return true;
  };
}

/** Runs fn over items with at most `limit` in flight. */
export async function mapLimit<T>(items: readonly T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  const worker = async () => { while (i < items.length) { const item = items[i++] as T; await fn(item); } };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

/**
 * Stateless "run roughly every N minutes" for a cron that fires every ~2 min on any server instance:
 * true during the first `widthMin` minutes of each N-minute slot, so a 2-minute cron hits it once per slot.
 */
export function inRunSlot(nowMs: number, everyMin: number, widthMin = 2): boolean {
  return Math.floor(nowMs / 60_000) % everyMin < widthMin;
}
