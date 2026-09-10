# Trigger

GitHub's `schedule` trigger is unusable on this repository. On 2026-09-10 the alert workflow
fired **1 scheduled run out of ~94 slots**, and a minimal probe (`*/5 * * * *`, no secrets, one
`date` command) fired **1 out of ~67** — long silences broken by an occasional run, with no
pattern. Both workflows were `active` and both dispatched in seconds every time. Every documented
precondition was met: public repo, default branch, valid cron, not a fork, Actions enabled,
minutes available, no GitHub incident. The cause was never identified and is open with GitHub
Support.

An alerter cannot run on a trigger that delivers ~1% of its slots, so the clock moved off GitHub.

This Worker calls `workflow_dispatch` every five minutes; the polling, filtering and delivery
logic is untouched and still runs in Actions.

## Setup

**1. Create a fine-grained token** at github.com/settings/personal-access-tokens/new

| Field | Value |
|---|---|
| Repository access | Only select repositories → `idx-nego-alert` |
| Permissions → Actions | **Read and write** |
| Expiration | Set a reminder — the alerts go silent when it lapses |

Read-and-write on Actions for one repository is the whole blast radius: this token cannot read
your code beyond that repo, touch other repos, or reach your account settings.

**2. Deploy the Worker** (needs a free Cloudflare account)

```bash
cd pinger
npx wrangler login
npx wrangler secret put GITHUB_TOKEN   # paste the token from step 1
npx wrangler deploy
```

**3. Confirm it fires**

```bash
npx wrangler tail        # watch live; expect a "dispatched nego-alert.yml" line every 5 min
```

Or check the repo's Actions tab — runs should appear on their own, five minutes apart, during
Jakarta trading hours.

## If the token expires or is revoked

The Worker starts throwing `workflow_dispatch failed: HTTP 401`, visible in `wrangler tail` and
in the Cloudflare dashboard. **Nothing else tells you.** The alerter simply goes quiet, which
looks identical to a day with no large deals — so the token expiry date is worth a calendar entry.

## If GitHub cron ever becomes reliable

Delete this Worker (`npx wrangler delete`) and the `cron-probe.yml` workflow. The schedule block
in `nego-alert.yml` was left in place, so scheduling resumes by itself the moment GitHub does.
Until then it is dormant, not harmful — a dispatch and a schedule cannot double-fire, because the
seen-set in `state/seen.json` stops any deal being sent twice.
