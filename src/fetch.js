/** Reading the negotiated-deal tape from idx.indoalgo.com. */

import { withRetry, fatal } from './retry.js';

export const NEGO_URL = 'https://idx.indoalgo.com/api/nego';
const USER_AGENT = 'idx-nego-alert/1.0 (+https://github.com/)';

/**
 * Fetch every negotiated deal for one trading day.
 *
 * The endpoint returns rows sorted by value descending and truncates long ranges to the top
 * 2000, so a single-day query can never hide a large deal behind the truncation limit.
 */
export async function fetchNego(date, { fetchImpl = fetch, retries = 3, backoffMs = 1000 } = {}) {
  const url = `${NEGO_URL}?from=${date}&to=${date}`;

  const body = await withRetry(async () => {
    const res = await fetchImpl(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
    if (!res.ok) {
      const message = `GET /api/nego failed: HTTP ${res.status}`;
      throw res.status >= 400 && res.status < 500 ? fatal(message) : new Error(message);
    }
    return await res.json(); // a truncated/garbled body throws here and counts as a failed attempt
  }, { retries, backoffMs });

  return { ...body, rows: Array.isArray(body?.rows) ? body.rows : [] };
}
