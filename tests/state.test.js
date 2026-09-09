import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadState, saveState, seenKeysFor } from '../src/state.js';

const tmpFile = (contents) => {
  const path = join(mkdtempSync(join(tmpdir(), 'nego-')), 'seen.json');
  if (contents !== undefined) writeFileSync(path, contents);
  return path;
};

test('a missing state file bootstraps to an empty state', () => {
  const state = loadState(tmpFile());
  assert.deepEqual(state, { date: null, keys: [] });
});

test('a corrupt state file degrades to empty rather than throwing', () => {
  assert.deepEqual(loadState(tmpFile('{not json')), { date: null, keys: [] });
});

test('an existing state file round-trips', () => {
  const path = tmpFile();
  saveState(path, { date: 20260909, keys: ['a', 'b'] });
  assert.deepEqual(loadState(path), { date: 20260909, keys: ['a', 'b'] });
});

test('keys from the same trading day are remembered', () => {
  const seen = seenKeysFor({ date: 20260909, keys: ['a', 'b'] }, 20260909);
  assert.ok(seen.has('a') && seen.has('b'));
});

test('keys from a previous trading day are discarded on rollover', () => {
  const seen = seenKeysFor({ date: 20260908, keys: ['a', 'b'] }, 20260909);
  assert.equal(seen.size, 0);
});

test('an empty state yields no seen keys', () => {
  assert.equal(seenKeysFor({ date: null, keys: [] }, 20260909).size, 0);
});

test('saved state is stable JSON so unchanged days produce no git diff', () => {
  const a = tmpFile();
  const b = tmpFile();
  saveState(a, { date: 20260909, keys: ['z', 'a', 'm'] });
  saveState(b, { date: 20260909, keys: ['m', 'z', 'a'] });
  assert.equal(readFileSync(a, 'utf8'), readFileSync(b, 'utf8'));
});

test('saving creates parent directories that do not exist yet', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'nego-')), 'nested', 'deep', 'seen.json');
  saveState(path, { date: 20260909, keys: ['a'] });
  assert.ok(existsSync(path));
});
