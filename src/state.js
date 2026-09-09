/**
 * Remembering which deals have already been sent, so a deal alerts exactly once.
 *
 * The file is committed back to the repo by the workflow. That is deliberate: an
 * actions/cache entry is evicted after a week of disuse, and an evicted cache would
 * re-alert the whole day. A committed file also doubles as an audit trail.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const EMPTY = { date: null, keys: [] };

/** Never throws: a missing or damaged state file just means "nothing sent yet". */
export function loadState(path) {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    if (!Array.isArray(parsed?.keys)) return { ...EMPTY };
    return { date: parsed.date ?? null, keys: parsed.keys };
  } catch {
    return { ...EMPTY };
  }
}

/** Keys are sorted so that an unchanged day rewrites byte-identical JSON — no empty commits. */
export function saveState(path, state) {
  mkdirSync(dirname(path), { recursive: true });
  const stable = { date: state.date, keys: [...state.keys].sort() };
  writeFileSync(path, JSON.stringify(stable, null, 2) + '\n');
}

/**
 * The seen set only applies within one trading day. On rollover it resets, which is also
 * what makes a missed poll self-healing: yesterday's keys can never suppress today's deals.
 */
export function seenKeysFor(state, date) {
  return new Set(state.date === date ? state.keys : []);
}
