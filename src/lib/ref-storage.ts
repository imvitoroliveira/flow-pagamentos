// Campaign attribution kept in the browser (last click wins, expires): the stored ref code is only used when the
// customer comes back WITHOUT a fresh ?ref=, and only within the attribution window.
export const REF_KEY = "natv_ref";
export const REF_TTL_MS = 30 * 86_400_000; // 30-day attribution window

export const serializeRef = (ref: string, nowMs: number) => JSON.stringify({ ref, t: nowMs });

/** Returns the stored ref if it is still inside the window. Old values saved without a timestamp are discarded. */
export function readStoredRef(raw: string | null, nowMs: number): string | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as { ref?: unknown; t?: unknown } | null;
    if (typeof o?.ref !== "string" || typeof o.t !== "number") return null;
    if (o.t > nowMs + 60_000 || nowMs - o.t >= REF_TTL_MS) return null;
    return o.ref.trim().toUpperCase().slice(0, 16) || null;
  } catch {
    return null;
  }
}
