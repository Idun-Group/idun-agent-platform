/**
 * Single canonical duration formatter for the trace surface (and any
 * future timing display in the admin UI).
 *
 * Branches:
 *   value == null       → "—"
 *   0 <= value < 1ms    → microseconds, no decimals (e.g. "300 µs")
 *   1ms <= value < 1s   → milliseconds, no decimals (e.g. "123 ms")
 *   1s <= value < 60s   → seconds with 2 decimals  (e.g. "3.80 s")
 *   60s <= value        → "Xm Ys"                  (e.g. "1m 18s")
 *
 * `0` collapses to "0 ms" rather than "0 µs" — operators read 0 as the
 * absence of timing data more naturally on the millisecond scale.
 */

const MS_PER_SECOND = 1_000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;

export function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms === 0) return "0 ms";
  if (ms < 1) {
    const us = Math.round(ms * 1000);
    return `${us} µs`;
  }
  if (ms < MS_PER_SECOND) {
    return `${Math.round(ms)} ms`;
  }
  if (ms < MS_PER_MINUTE) {
    return `${(ms / MS_PER_SECOND).toFixed(2)} s`;
  }
  const minutes = Math.floor(ms / MS_PER_MINUTE);
  const seconds = Math.floor((ms % MS_PER_MINUTE) / MS_PER_SECOND);
  return `${minutes}m ${seconds}s`;
}
