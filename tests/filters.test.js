import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { DEFAULT_THRESHOLD_IDR, withKeys, bigDeals, selectNew } from '../src/filters.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/nego_20260909.json', import.meta.url)));

const deal = (over = {}) => ({
  date: 20260909, time: 162429, code: 'UNTR', stock_name: 'United Tractors Tbk.',
  buyer_code: 'AK', buyer_name: 'UBS Sekuritas Indonesia',
  seller_code: 'AK', seller_name: 'UBS Sekuritas Indonesia',
  price: 25637, volume: 5000000, value: 128185000000, ...over,
});

test('threshold defaults to Rp 100 billion', () => {
  assert.equal(DEFAULT_THRESHOLD_IDR, 100_000_000_000);
});

test('keeps deals at or above the threshold, drops those below', () => {
  const rows = [deal({ value: 200e9 }), deal({ value: 100e9, code: 'AAAA' }), deal({ value: 99.9e9, code: 'BBBB' })];
  const kept = bigDeals(rows).map((d) => d.code);
  assert.deepEqual(kept, ['UNTR', 'AAAA']);
});

test('a deal key is stable across separate calls', () => {
  const a = withKeys([deal()])[0].key;
  const b = withKeys([deal()])[0].key;
  assert.equal(a, b);
  assert.equal(a, '20260909|UNTR|25637|5000000');
});

test('key changes when any identifying field changes', () => {
  const base = withKeys([deal()])[0].key;
  for (const field of ['date', 'code', 'price', 'volume']) {
    const other = withKeys([deal({ [field]: 'X' })])[0].key;
    assert.notEqual(other, base, `key ignored a change to ${field}`);
  }
});

test('key ignores the fields the feed amends after publishing', () => {
  const base = withKeys([deal()])[0].key;
  for (const field of ['time', 'buyer_code', 'seller_code']) {
    const other = withKeys([deal({ [field]: 'X' })])[0].key;
    assert.equal(other, base, `key still depends on ${field}, which the feed rewrites`);
  }
});

test('two byte-identical deals in one response get distinct keys', () => {
  const keys = withKeys([deal(), deal()]).map((d) => d.key);
  assert.equal(new Set(keys).size, 2);
  assert.equal(keys[1], keys[0] + '#1');
});

test('keys do not shift when the threshold changes', () => {
  const rows = [deal({ value: 200e9 }), deal({ value: 50e9, code: 'AAAA' }), deal({ value: 200e9 })];
  const strict = bigDeals(rows, 100e9).map((d) => d.key);
  const loose = bigDeals(rows, 10e9).filter((d) => d.code === 'UNTR').map((d) => d.key);
  assert.deepEqual(strict, loose);
});

test('selectNew drops deals whose key was already alerted', () => {
  const deals = bigDeals([deal({ value: 200e9 }), deal({ value: 300e9, code: 'BBCA' })]);
  const seen = new Set([deals[0].key]);
  assert.deepEqual(selectNew(deals, seen).map((d) => d.code), ['BBCA']);
});

test('selectNew with an empty seen set passes everything through', () => {
  const deals = bigDeals([deal()]);
  assert.deepEqual(selectNew(deals, new Set()), deals);
});

test('real captured response yields exactly the one UNTR deal above Rp 100 bn', () => {
  const found = bigDeals(fixture.rows);
  assert.equal(found.length, 1);
  assert.equal(found[0].code, 'UNTR');
  assert.equal(found[0].value, 128185000000);
});

test('every key from the real response is unique', () => {
  const keys = withKeys(fixture.rows).map((d) => d.key);
  assert.equal(new Set(keys).size, keys.length);
});

// The feed amends rows after publishing them. These are the exact mutations seen on VICI and
// BNBR on 2026-09-10, which re-alerted both deals hours after they were first sent.
test('a settled deal keeps the key it had while undisclosed', () => {
  const atPrint = deal({ date: 20260910, time: '090115', code: 'VICI', price: 747, volume: 1677000000, buyer_code: '--', seller_code: '--' });
  const settled = deal({ date: 20260910, time: 90116, code: 'VICI', price: 747, volume: 1677000000, buyer_code: 'NI', seller_code: 'YU' });
  assert.equal(withKeys([settled])[0].key, withKeys([atPrint])[0].key);
});

test('an amended deal is not selected as new', () => {
  const atPrint = deal({ date: 20260910, time: '150933', code: 'BNBR', price: 125, volume: 800000000, buyer_code: '--', seller_code: '--', value: 100e9 });
  const settled = deal({ date: 20260910, time: 150934, code: 'BNBR', price: 125, volume: 800000000, buyer_code: 'FS', seller_code: 'BQ', value: 100e9 });
  const sent = new Set(bigDeals([atPrint]).map((d) => d.key));
  assert.deepEqual(selectNew(bigDeals([settled]), sent), []);
});

test('a numeric field keys the same whether it arrives as a string or a number', () => {
  assert.equal(withKeys([deal({ price: 25637 })])[0].key, withKeys([deal({ price: '25637' })])[0].key);
});

test('two same-price same-size deals in one stock stay distinct without the clock', () => {
  const morning = deal({ date: 20260910, time: 90000, code: 'AAAA', price: 100, volume: 1e9 });
  const afternoon = deal({ date: 20260910, time: 150000, code: 'AAAA', price: 100, volume: 1e9 });
  const keys = withKeys([morning, afternoon]).map((d) => d.key);
  assert.equal(new Set(keys).size, 2, 'the occurrence suffix must separate them');
});

test('a second identical deal appearing later alerts, while the first does not repeat', () => {
  const one = deal({ date: 20260910, code: 'AAAA', price: 100, volume: 1e9, value: 100e9 });
  const sent = new Set(bigDeals([one]).map((d) => d.key));
  const pending = selectNew(bigDeals([one, { ...one }]), sent);
  assert.equal(pending.length, 1);
});
