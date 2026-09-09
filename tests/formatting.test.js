import { test } from 'node:test';
import assert from 'node:assert/strict';

import { formatIdrShort, formatNumber, formatTime, formatDate, formatDeal } from '../src/formatting.js';

const deal = (over = {}) => ({
  date: 20260909, time: 162429, code: 'UNTR', stock_name: 'United Tractors Tbk.',
  buyer_code: 'AK', buyer_name: 'UBS Sekuritas Indonesia',
  seller_code: 'AK', seller_name: 'UBS Sekuritas Indonesia',
  price: 25637, volume: 5000000, value: 128185000000, ...over,
});

test('large values render in billions and trillions', () => {
  assert.equal(formatIdrShort(128185000000), 'Rp 128,19 bn');
  assert.equal(formatIdrShort(100000000000), 'Rp 100,00 bn');
  assert.equal(formatIdrShort(1209407832158), 'Rp 1,21 tn');
  assert.equal(formatIdrShort(58977291600), 'Rp 58,98 bn');
});

test('numbers use Indonesian thousands separators', () => {
  assert.equal(formatNumber(5000000), '5.000.000');
  assert.equal(formatNumber(25637), '25.637');
  assert.equal(formatNumber(42), '42');
});

test('HHMMSS integers become readable clock times, keeping leading zeros', () => {
  assert.equal(formatTime(162429), '16:24:29');
  assert.equal(formatTime(90006), '09:00:06');
});

test('YYYYMMDD integers become readable dates', () => {
  assert.equal(formatDate(20260909), '9 Sep 2026');
  assert.equal(formatDate(20260101), '1 Jan 2026');
});

test('a crossing names the single broker once and says so', () => {
  const msg = formatDeal(deal());
  assert.match(msg, /Crossing/);
  assert.match(msg, /UBS Sekuritas Indonesia \(AK\)/);
  assert.doesNotMatch(msg, /→/);
});

test('a two-broker deal shows seller to buyer, not "crossing"', () => {
  const msg = formatDeal(deal({ seller_code: 'YU', seller_name: 'CGS International Sekuritas Indonesia' }));
  assert.doesNotMatch(msg, /Crossing/);
  assert.match(msg, /CGS International Sekuritas Indonesia \(YU\).*→.*UBS Sekuritas Indonesia \(AK\)/s);
});

test('message carries code, name, value, price, volume and time', () => {
  const msg = formatDeal(deal());
  for (const part of ['UNTR', 'United Tractors Tbk.', 'Rp 128,19 bn', '25.637', '5.000.000', '16:24:29', '9 Sep 2026']) {
    assert.ok(msg.includes(part), `message is missing ${part}`);
  }
});

test('message links to the ticker page for the stock', () => {
  assert.match(formatDeal(deal()), /https:\/\/idx\.indoalgo\.com\/ticker\.html\?code=UNTR/);
});

test('HTML special characters in exchange-supplied text are escaped', () => {
  const msg = formatDeal(deal({ stock_name: 'Ace <b>Hardware</b> & Co', code: 'ACES' }));
  assert.ok(msg.includes('Ace &lt;b&gt;Hardware&lt;/b&gt; &amp; Co'));
  assert.ok(!msg.includes('<b>Hardware'));
});

test('a ticker code is URL-encoded in the link', () => {
  assert.match(formatDeal(deal({ code: 'INET-W2' })), /code=INET-W2/);
});
