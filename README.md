# IDX Nego Alert

Telegram alerts for large **negotiated-market (pasar negosiasi / crossing)** transactions on the
Indonesia Stock Exchange. When a single deal worth **Rp 100 billion or more** prints, you get a
message — once, never repeated.

```
🔔 Big Nego Deal — Rp 128,19 bn

UNTR · United Tractors Tbk.
Rp 25.637 × 5.000.000 shares
16:24:29 WIB · 9 Sep 2026

🔁 Crossing: UBS Sekuritas Indonesia (AK)
```

Expect roughly **3 alerts per trading day** — 61 qualifying deals across the 20 sessions from
2026‑08‑10 to 2026‑09‑09, ranging from 1 to 10 a day.

## How it works

A GitHub Actions job polls [`idx.indoalgo.com/api/nego`](https://idx.indoalgo.com/nego.html) every
five minutes during Jakarta trading hours, keeps deals at or above the threshold, drops any it has
already sent, and pushes the rest to your Telegram bot.

```
fetch.js      GET /api/nego?from=&to=  ·  retry with backoff, no retry on 4xx
filters.js    threshold + a stable per-deal key (the feed has no deal ids)
state.js      the keys already sent today, committed to state/seen.json
formatting.js one deal → one Telegram message
telegram.js   Bot API sendMessage
main.js       fetch → filter → subtract seen → send → persist
```

Node standard library only — no dependencies, no install step.

### Why the deal key looks like that

`/api/nego` rows carry no server-side id, so a deal is identified by the composite of
`date|time|code|price|volume|buyer_code|seller_code`, plus an occurrence suffix if two
byte-identical deals appear in one response. Keys are assigned before threshold filtering, so
changing the threshold never renames a deal that has already been sent.

The seen-set resets when the trading date changes. That makes a missed poll self-healing: a deal
skipped by one run is simply picked up by the next.

### Why state is committed rather than cached

`actions/cache` entries are evicted after a week of disuse, and an evicted cache would re-alert an
entire day. The committed file survives, doubles as an audit log, and keeps the repo active so
GitHub does not auto-disable the schedule after 60 days.

## Setup

**1. Create your bot.** Message [@BotFather](https://t.me/BotFather) in Telegram, send
`/newbot`, follow the prompts, and copy the token it gives you.

> This project uses **your own** bot. `@indoalgobot` belongs to idx.indoalgo.com and cannot be
> driven from here.

**2. Open your new bot and press Start.** A bot cannot message you until you have messaged it.

**3. Find your chat id:**

```bash
TELEGRAM_BOT_TOKEN=<your-token> node scripts/get-chat-id.js
```

**4. Add two repository secrets** (Settings ▸ Secrets and variables ▸ Actions):

| Secret | Value |
|---|---|
| `TELEGRAM_BOT_TOKEN` | the token from BotFather |
| `TELEGRAM_CHAT_ID` | the id printed in step 3 |

**5. Push to GitHub.** The schedule starts on its own. Trigger a manual run from the Actions tab
(**IDX Nego Alert ▸ Run workflow**) to confirm delivery — tick *dry run* first if you only want to
see what it would send.

## Local use

```bash
npm test                                                  # 56 tests, no network stubbing needed
node src/main.js --dry-run                                # today: fetch, print, send nothing
node src/main.js --dry-run --date 20260908 --threshold 150000000000
node src/main.js                                          # live send (needs the two env vars)
```

| Flag / variable | Meaning |
|---|---|
| `--dry-run` | Fetch and print matches; send nothing, write no state |
| `--date YYYYMMDD` | Replay a specific trading day |
| `--threshold <rupiah>` | Override the Rp 100 bn bar |
| `NEGO_THRESHOLD_IDR` | Same, as an environment variable |
| `NEGO_STATE_PATH` | Point the seen-set somewhere other than `state/seen.json` |

## Known limits

- **Feed latency is not yet characterised.** `/api/nego` returns a `live` flag that was `false`
  when this was built (outside market hours). Whether the endpoint fills in *during* the session or
  only after the close is still unverified — see below. Either way the alerts are correct; only
  their timeliness differs.
- **GitHub cron is best-effort** and can lag 5–15 minutes under load. Five minutes is also the
  finest granularity GitHub offers.
- **The data source is a third party.** `idx.indoalgo.com` is not operated by this project. If
  `/api/nego` changes shape or starts requiring auth, the poll fails loudly (a red run) rather than
  going quiet.
- Only **single deals** count toward the threshold. A position split across several smaller tickets
  will not trigger an alert even if the day's total for that stock exceeds Rp 100 bn.

### Checking feed latency

Run this a few times ~15 minutes apart during 09:00–16:00 WIB and see whether `total_count` grows
and whether `live` flips to `true`:

```bash
curl -s "https://idx.indoalgo.com/api/nego" \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log(new Date().toISOString(), j.total_count, 'live:', j.live)})"
```

If it turns out the feed is end-of-day only, narrowing the cron window to the post-close hours
would cut the run count without losing a single alert.
