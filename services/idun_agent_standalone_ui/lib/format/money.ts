/**
 * Single canonical USD cost formatter for trace cost displays
 * (list table, detail header, span tree, span rail).
 *
 * Branches:
 *   value == null      → "—"
 *   value === 0        → "$0"   (no decimals; "$0.00" is noisier)
 *   0 < value < 1      → 4 fraction digits  (e.g. "$0.0042")
 *   value >= 1         → 2 fraction digits  (e.g. "$12.50")
 *
 * The optional `partial` flag prefixes the result with `~` for streaming
 * partial-cost values (the design KB names this the "tilde streaming"
 * UX). Null returns "—" regardless of partial.
 */

export type FormatCostOptions = {
  /** Prefix with `~` to indicate the value is a streaming partial. */
  partial?: boolean;
};

export function formatCostUSD(
  usd: number | null,
  options: FormatCostOptions = {},
): string {
  if (usd == null) return "—";
  const partial = options.partial === true;
  if (usd === 0) return partial ? "~$0" : "$0";
  const digits = usd < 1 ? 4 : 2;
  const formatted = `$${usd.toFixed(digits)}`;
  return partial ? `~${formatted}` : formatted;
}
