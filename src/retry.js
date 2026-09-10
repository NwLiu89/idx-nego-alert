/** Shared retry-with-backoff used by both network callers. */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Runs `attempt` until it resolves or the budget runs out. `attempt` should throw to signal
 * a retryable failure; throw an error carrying `fatal: true` to stop retrying immediately
 * (a 4xx will not fix itself, so hammering it is pointless).
 *
 * `retries` is the total number of attempts, not the number of extra tries after the first.
 * It is clamped to at least 1: `retries: 0` reads as "just try once, do not retry", and
 * silently skipping the call to throw an undefined error would be a trap.
 */
export async function withRetry(attempt, { retries = 3, backoffMs = 1000 } = {}) {
  const attempts = Math.max(1, retries);
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      return await attempt();
    } catch (err) {
      lastError = err;
      if (err?.fatal) break;
      if (i < attempts - 1) await sleep(backoffMs * 2 ** i);
    }
  }
  throw lastError;
}

export function fatal(message) {
  const err = new Error(message);
  err.fatal = true;
  return err;
}
