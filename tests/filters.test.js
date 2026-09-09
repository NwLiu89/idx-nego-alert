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
  assert.equal(a, '20260909|162429|UNTR|25637|5000000|AK|AK');
});

test('key changes when any identifying field changes', () => {
  const base = withKeys([deal()])[0].key;
  for (const field of ['date', 'time', 'code', 'price', 'volume', 'buyer_code', 'seller_code']) {
    const other = withKeys([deal({ [field]: 'X' })])[0].key;
    assert.notEqual(other, base, `key ignored a change to ${field}`);
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
