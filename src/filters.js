/**
 * Selecting the deals worth alerting on, and giving each one a stable identity.
 *
 * /api/nego rows carry no server-side id, so identity has to be composed from the fields.
 * Only fields that never change once a deal has printed may be used, because the feed
 * *amends* rows after publishing them:
 *
 *   at print   {time: "090115", buyer_code: "--", seller_code: "--", price: 747, volume: 1677000000}
 *   settled    {time: 90116,    buyer_code: "NI", seller_code: "YU", price: 747, volume: 1677000000}
 *
 * Observed on VICI and BNBR on 2026-09-10. Broker codes start undisclosed and are filled in
 * on settlement, and the timestamp shifts by a second and changes from a zero-padded string
 * to a number. Keying on any of those three re-alerted both deals hours after they were sent.
 *
 * date + code + price + volume survive the amendment, and identify a deal just as tightly:
 * two separate deals in one stock at the same price *and* the same size are still told apart,
 * because the occurrence suffix in `withKeys` counts them rather than relying on the clock.
 *
 * Keys are assigned over the *whole* response before any threshold filtering, so lowering or
 * raising the threshold never renames a deal that was already sent.
 */

export const DEFAULT_THRESHOLD_IDR = 100_000_000_000; // Rp 100 billion

const KEY_FIELDS = ['date', 'code', 'price', 'volume'];

/** The feed has returned the same field as both a string and a number, so normalise before keying. */
const normalise = (field, value) =>
  field === 'code' ? String(value ?? '').trim().toUpperCase() : String(Number(value));

const baseKey = (row) => KEY_FIELDS.map((f) => normalise(f, row[f])).join('|');

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
