import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const run = promisify(execFile);
const MAIN = fileURLToPath(new URL('../src/main.js', import.meta.url));

/** Every CLI test gets a throwaway state file so a test run can never touch the repo's own. */
const isolated = (env = {}) => ({
  timeout: 60_000,
  env: { ...process.env, NEGO_STATE_PATH: join(mkdtempSync(join(tmpdir(), 'nego-cli-')), 'seen.json'), ...env },
});

/**
 * These drive the real binary as CI does. The failure mode they exist to catch is the entrypoint
 * guard not matching, which would make every scheduled run exit 0 having done nothing.
 */

test('the CLI runs, reaches the network, and reports what it found', async () => {
  const { stdout } = await run(process.execPath, [MAIN, '--dry-run'], isolated());
  assert.match(stdout, /\d{8}: \d+ nego deals, \d+ >= Rp/, `unexpected CLI output:\n${stdout}`);
});

test('a replayed day with a low bar prints a formatted alert', async () => {
  const { stdout } = await run(
    process.execPath,
    [MAIN, '--dry-run', '--date', '20260908', '--threshold', '150000000000'],
    isolated(),
  );
  assert.match(stdout, /Big Nego Deal/);
  assert.match(stdout, /ticker\.html\?code=/);
});

test('a bad --date exits non-zero instead of querying nonsense', async () => {
  await assert.rejects(
    run(process.execPath, [MAIN, '--dry-run', '--date', 'yesterday'], isolated()),
    (err) => {
      assert.equal(err.code, 1);
      assert.match(err.stderr, /YYYYMMDD/);
      return true;
    },
  );
});

test('a live send without credentials exits non-zero rather than failing silently', async () => {
  await assert.rejects(
    run(process.execPath, [MAIN, '--date', '20260908'], isolated({ TELEGRAM_BOT_TOKEN: '', TELEGRAM_CHAT_ID: '' })),
    (err) => {
      assert.equal(err.code, 1);
      assert.match(err.stderr, /TELEGRAM_BOT_TOKEN/);
      return true;
    },
  );
});
