/**
 * Fires the IDX nego poll on a schedule, because GitHub's own cron does not run on this
 * repository. Two workflows with valid, active schedules produced zero runs across hours on
 * 2026-09-10 while workflow_dispatch worked every time, so the trigger had to move off GitHub.
 *
 * This Worker only pulls the trigger. All the polling, filtering and delivery logic stays in
 * the repo, unchanged, and still runs on GitHub Actions.
 */

const OWNER = 'NwLiu89';
const REPO = 'idx-nego-alert';
const WORKFLOW = 'nego-alert.yml';

export default {
  async scheduled(event, env, ctx) {
    if (!env.GITHUB_TOKEN) throw new Error('GITHUB_TOKEN secret is not set on this Worker');

    const url = `https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW}/dispatches`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        // GitHub rejects API requests with no User-Agent.
        'User-Agent': `${REPO}-pinger`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: 'main' }),
    });

    // A successful dispatch is 204 No Content. Throwing surfaces the failure in `wrangler tail`
    // and in the Workers dashboard, which is the only place this Worker can complain.
    if (res.status !== 204) {
      const detail = await res.text().catch(() => '');
      throw new Error(`workflow_dispatch failed: HTTP ${res.status} ${detail}`.trim());
    }
    console.log(`dispatched ${WORKFLOW} at ${new Date().toISOString()}`);
  },
};
