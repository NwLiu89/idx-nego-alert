import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fetchNego } from '../src/fetch.js';
import { sendMessage } from '../src/telegram.js';

const ok = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
const httpError = (status) => ({ ok: false, status, json: async () => ({}), text: async () => 'boom' });
const noRetry = { retries: 3, backoffMs: 0 };

// ---- fetchNego -------------------------------------------------------------

test('fetchNego requests a single day and returns its rows', async () => {
  const calls = [];
  const body = { rows: [{ code: 'UNTR' }], from: 20260909, to: 20260909, live: false };
  const res = await fetchNego(20260909, { ...noRetry, fetchImpl: async (url) => (calls.push(url), ok(body)) });

  assert.equal(calls.length, 1);
  assert.match(calls[0], /\/api\/nego\?from=20260909&to=20260909$/);
  assert.deepEqual(res.rows, body.rows);
});

test('fetchNego retries a 5xx and succeeds on a later attempt', async () => {
  let n = 0;
  const res = await fetchNego(20260909, {
    ...noRetry,
    fetchImpl: async () => (++n < 3 ? httpError(503) : ok({ rows: [{ code: 'BBCA' }] })),
  });
  assert.equal(n, 3);
  assert.equal(res.rows[0].code, 'BBCA');
});

test('fetchNego retries a thrown network error', async () => {
  let n = 0;
  const res = await fetchNego(20260909, {
    ...noRetry,
    fetchImpl: async () => { if (++n < 2) throw new Error('ECONNRESET'); return ok({ rows: [] }); },
  });
  assert.equal(n, 2);
  assert.deepEqual(res.rows, []);
});

test('fetchNego treats an unparseable body as a failed attempt', async () => {
  let n = 0;
  const res = await fetchNego(20260909, {
    ...noRetry,
    fetchImpl: async () => (++n < 2 ? { ok: true, status: 200, json: async () => { throw new Error('bad json'); } } : ok({ rows: [] })),
  });
  assert.equal(n, 2);
});

test('fetchNego gives up after the retry budget and throws', async () => {
  let n = 0;
  await assert.rejects(
    fetchNego(20260909, { ...noRetry, fetchImpl: async () => (n++, httpError(500)) }),
    /500/,
  );
  assert.equal(n, 3);
});

test('fetchNego does not retry a 4xx — a bad request will not fix itself', async () => {
  let n = 0;
  await assert.rejects(fetchNego(20260909, { ...noRetry, fetchImpl: async () => (n++, httpError(404)) }), /404/);
  assert.equal(n, 1);
});

test('fetchNego defends against a response with no rows array', async () => {
  const res = await fetchNego(20260909, { ...noRetry, fetchImpl: async () => ok({ live: false }) });
  assert.deepEqual(res.rows, []);
});

// ---- sendMessage -----------------------------------------------------------

test('sendMessage posts HTML to the Bot API sendMessage endpoint', async () => {
  const calls = [];
  await sendMessage('hello', {
    token: 'TOK', chatId: '42', ...noRetry,
    fetchImpl: async (url, init) => (calls.push({ url, init }), ok({ ok: true })),
  });

  assert.match(calls[0].url, /^https:\/\/api\.telegram\.org\/botTOK\/sendMessage$/);
  assert.equal(calls[0].init.method, 'POST');
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.chat_id, '42');
  assert.equal(body.text, 'hello');
  assert.equal(body.parse_mode, 'HTML');
  assert.equal(body.disable_web_page_preview, true);
});

test('sendMessage retries once before giving up', async () => {
  let n = 0;
  await assert.rejects(
    sendMessage('x', { token: 'T', chatId: '1', retries: 2, backoffMs: 0, fetchImpl: async () => (n++, httpError(500)) }),
    /Telegram/,
  );
  assert.equal(n, 2);
});

test('sendMessage refuses to run without credentials', async () => {
  await assert.rejects(sendMessage('x', { token: '', chatId: '1' }), /TELEGRAM_BOT_TOKEN/);
  await assert.rejects(sendMessage('x', { token: 'T', chatId: '' }), /TELEGRAM_CHAT_ID/);
});

test('sendMessage surfaces the API description when Telegram rejects the call', async () => {
  await assert.rejects(
    sendMessage('x', {
      token: 'T', chatId: '1', ...noRetry,
      fetchImpl: async () => ({ ok: false, status: 400, text: async () => '{"description":"chat not found"}' }),
    }),
    /chat not found/,
  );
});
