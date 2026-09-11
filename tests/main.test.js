import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { run, wibDate, parseArgs } from '../src/main.js';
import { DEFAULT_THRESHOLD_IDR } from '../src/filters.js';
import { loadState, saveState } from '../src/state.js';

const statePath = () => join(mkdtempSync(join(tmpdir(), 'nego-')), 'seen.json');

const deal = (over = {}) => ({
  date: 20260909, time: 162429, code: 'UNTR', stock_name: 'United Tractors Tbk.',
  buyer_code: 'AK', buyer_name: 'UBS Sekuritas Indonesia',
  seller_code: 'AK', seller_name: 'UBS Sekuritas Indonesia',
  price: 25637, volume: 5000000, value: 128185000000, ...over,
});

const harness = (rows, over = {}) => {
  const sent = [];
  return {
    sent,
    opts: {
      date: 20260909,
      statePath: statePath(),
      fetchNegoImpl: async () => ({ rows, live: false }),
      sendImpl: async (text) => sent.push(text),
      log: () => {},
      ...over,
    },
  };
};

test('wibDate converts a UTC instant to the Jakarta trading date', () => {
  // 2026-09-09 22:30 UTC is already 2026-09-10 05:30 in Jakarta (UTC+7).
  assert.equal(wibDate(new Date('2026-09-09T22:30:00Z')), 20260910);
  assert.equal(wibDate(new Date('2026-09-09T09:00:00Z')), 20260909);
  assert.equal(wibDate(new Date('2026-09-09T16:59:00Z')), 20260909);
});

test('a qualifying deal is sent and its key recorded', async () => {
  const { sent, opts } = harness([deal()]);
  const summary = await run(opts);

  assert.equal(sent.length, 1);
  assert.match(sent[0], /UNTR/);
  assert.equal(summary.sent, 1);
  assert.equal(loadState(opts.statePath).keys.length, 1);
  assert.equal(loadState(opts.statePath).date, 20260909);
});

test('deals below the threshold are ignored entirely', async () => {
  const { sent, opts } = harness([deal({ value: DEFAULT_THRESHOLD_IDR - 1 })]);
  const summary = await run(opts);
  assert.equal(sent.length, 0);
  assert.equal(summary.matched, 0);
});

test('a second run over the same data sends nothing', async () => {
  const { sent, opts } = harness([deal()]);
  await run(opts);
  await run(opts);
  assert.equal(sent.length, 1);
});

test('a new deal later in the day is sent while the earlier one stays quiet', async () => {
  const first = deal();
  const second = deal({ code: 'BBCA', time: 163000, value: 250e9 });
  const { sent, opts } = harness([first]);
  await run(opts);
  await run({ ...opts, fetchNegoImpl: async () => ({ rows: [second, first], live: false }) });

  assert.equal(sent.length, 2);
  assert.match(sent[1], /BBCA/);
});

test('a new trading day clears yesterday\'s keys', async () => {
  const { sent, opts } = harness([deal()]);
  saveState(opts.statePath, { date: 20260908, keys: ['20260909|162429|UNTR|25637|5000000|AK|AK'] });
  await run(opts);
  assert.equal(sent.length, 1, 'yesterday key must not suppress today deal');
});

test('dry run sends nothing and leaves state untouched', async () => {
  const { sent, opts } = harness([deal()]);
  const summary = await run({ ...opts, dryRun: true });

  assert.equal(sent.length, 0);
  assert.equal(summary.matched, 1);
  assert.deepEqual(loadState(opts.statePath), { date: null, keys: [] });
});

test('a deal whose send fails is not marked seen, so the next run retries it', async () => {
  const { opts } = harness([deal()], { sendImpl: async () => { throw new Error('telegram down'); } });
  await assert.rejects(run(opts), /telegram down/);
  assert.deepEqual(loadState(opts.statePath).keys, []);
});

test('deals sent before a mid-batch failure are still recorded', async () => {
  let n = 0;
  const rows = [deal({ value: 300e9 }), deal({ code: 'BBCA', value: 200e9 })];
  const { opts } = harness(rows, { sendImpl: async () => { if (++n === 2) throw new Error('boom'); } });

  await assert.rejects(run(opts), /boom/);
  assert.equal(loadState(opts.statePath).keys.length, 1, 'the first successful send must not be resent');
});

test('a fetch failure propagates so the CI run goes red', async () => {
  const { opts } = harness([], { fetchNegoImpl: async () => { throw new Error('HTTP 503'); } });
  await assert.rejects(run(opts), /503/);
});

test('a custom threshold widens the net', async () => {
  const { sent, opts } = harness([deal({ value: 60e9 })]);
  await run({ ...opts, threshold: 50e9 });
  assert.equal(sent.length, 1);
});

test('parseArgs reads the CLI flags', () => {
  assert.deepEqual(parseArgs(['--dry-run']), { dryRun: true });
  assert.deepEqual(parseArgs(['--date', '20260101']), { date: 20260101 });
  assert.deepEqual(parseArgs(['--threshold', '50000000000']), { threshold: 50000000000 });
  assert.deepEqual(parseArgs([]), {});
});

test('parseArgs rejects a malformed date rather than silently querying nonsense', () => {
  assert.throws(() => parseArgs(['--date', '9 Sep']), /YYYYMMDD/);
});
