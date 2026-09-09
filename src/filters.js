/**
 * Selecting the deals worth alerting on, and giving each one a stable identity.
 *
 * /api/nego rows carry no server-side id, so identity is the composite of the seven fields
 * that describe the deal. Keys are assigned over the *whole* response before any threshold
 * filtering, so lowering or raising the threshold never renames a deal that was already sent.
 */

export const DEFAULT_THRESHOLD_IDR = 100_000_000_000; // Rp 100 billion

const KEY_FIELDS = ['date', 'time', 'code', 'price', 'volume', 'buyer_code', 'seller_code'];

const baseKey = (row) => KEY_FIELDS.map((f) => row[f]).join('|');

/**
 * Attach a unique `key` to every row. Two byte-identical deals can legitimately appear in one
 * response (same second, stock, price, size and brokers); the occurrence suffix keeps them
 * distinct so one never silently swallows the other.
 */
export function withKeys(rows) {
  const seen = new Map();
  return rows.map((row) => {
    const base = baseKey(row);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return { ...row, key: n === 0 ? base : `${base}#${n}` };
  });
}

/** Keyed deals worth at least `threshold` rupiah. */
export function bigDeals(rows, threshold = DEFAULT_THRESHOLD_IDR) {
  return withKeys(rows).filter((row) => Number(row.value) >= threshold);
}

/** Deals we have not already sent to Telegram. */
export function selectNew(deals, seenKeys) {
  return deals.filter((deal) => !seenKeys.has(deal.key));
}
