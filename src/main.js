/**
 * Poll the IDX negotiated tape and push any deal at or above the threshold to Telegram, once.
 *
 * Usage:
 *   node src/main.js                                  # today (WIB), live send
 *   node src/main.js --dry-run                        # fetch and print, send nothing
 *   node src/main.js --date 20260909 --threshold 5e10 # replay a day at a lower bar
 */

import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { realpathSync } from 'node:fs';

import { fetchNego } from './fetch.js';
import { sendMessage } from './telegram.js';
import { bigDeals, selectNew, DEFAULT_THRESHOLD_IDR } from './filters.js';
import { formatDeal, formatIdrShort } from './formatting.js';
import { loadState, saveState, seenKeysFor } from './state.js';

const DEFAULT_STATE_PATH = fileURLToPath(new URL('../state/seen.json', import.meta.url));

/**
 * The trading date in Jakarta. CI runs in UTC, and after 17:00 UTC the UTC date has already
 * rolled over while Jakarta is still on the previous day — so the offset must be applied.
 */
export function wibDate(now = new Date()) {
  const jakarta = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return Number(jakarta.toISOString().slice(0, 10).replaceAll('-', ''));
}

export function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dry-run') opts.dryRun = true;
    else if (argv[i] === '--date') {
      const raw = argv[++i];
      if (!/^\d{8}$/.test(raw ?? '')) throw new Error(`--date must be YYYYMMDD, got: ${raw}`);
      opts.date = Number(raw);
    } else if (argv[i] === '--threshold') opts.threshold = Number(argv[++i]);
  }
  return opts;
}

export async function run({
  date = wibDate(),
  threshold = Number(process.env.NEGO_THRESHOLD_IDR) || DEFAULT_THRESHOLD_IDR,
  statePath = process.env.NEGO_STATE_PATH || DEFAULT_STATE_PATH,
  dryRun = false,
  fetchNegoImpl = fetchNego,
  sendImpl = (text) =>
    sendMessage(text, { token: process.env.TELEGRAM_BOT_TOKEN, chatId: process.env.TELEGRAM_CHAT_ID }),
  log = console.log,
} = {}) {
  const feed = await fetchNegoImpl(date);
  const matched = bigDeals(feed.rows, threshold);

  const state = loadState(statePath);
  const pending = selectNew(matched, seenKeysFor(state, date));

  log(
    `${date}: ${feed.rows.length} nego deals, ${matched.length} >= ${formatIdrShort(threshold)}, ` +
      `${pending.length} new${dryRun ? ' (dry run)' : ''}${feed.live ? ' [live feed]' : ''}`,
  );

  if (dryRun) {
    pending.forEach((deal) => log('\n' + formatDeal(deal) + '\n'));
    return { date, matched: matched.length, sent: 0, live: Boolean(feed.live) };
  }

  // Persist after every successful send, never in one batch at the end: if delivery fails
  // partway through, the deals already sent stay recorded and only the rest are retried.
  const sentKeys = seenKeysFor(state, date);
  let sent = 0;
  try {
    for (const deal of pending) {
      await sendImpl(formatDeal(deal), deal);
      sentKeys.add(deal.key);
      sent++;
      log(`sent ${deal.code} ${formatIdrShort(deal.value)}`);
    }
  } finally {
    if (sent > 0 || state.date !== date) saveState(statePath, { date, keys: [...sentKeys] });
  }

  return { date, matched: matched.length, sent, live: Boolean(feed.live) };
}

// Resolved through realpath on both sides: a mismatch here would make the CLI exit 0 having
// done nothing at all, which is the one failure mode that would never show up as a red run.
const isEntrypoint = (() => {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(resolve(process.argv[1]));
  } catch {
    return false;
  }
})();
if (isEntrypoint) {
  run(parseArgs(process.argv.slice(2))).catch((err) => {
    console.error(`nego-alert failed: ${err.message}`);
    process.exit(1); // a red run in the Actions tab is the outage signal
  });
}
