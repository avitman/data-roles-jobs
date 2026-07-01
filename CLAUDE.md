# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with this repository.

## What this is

A Node.js bot that scrapes Israeli VC portfolio job boards daily, filters for data roles, and sends a digest to a Telegram group. It runs on a cron schedule (default 09:00 Asia/Jerusalem).

## Commands

```bash
npm install          # install dependencies
npm start            # run bot (TZ=Asia/Jerusalem node src/index.js)
npm run dev          # run with --watch (auto-restart on file changes)
```

**Trigger immediately without waiting for cron**: set `RUN_NOW=true` in `.env`, then `npm start`.

**Skip the "already sent today" guard**: set `FORCE=true` in `.env`.

**PM2 (production)**:
```bash
pm2 start ecosystem.config.cjs
pm2 logs data-jobs-bot
pm2 restart data-jobs-bot
```

## Architecture

The pipeline in `src/index.js` runs as: fetch → deduplicate → classify → format → send.

**`src/jobFetcher.js`** — all scraping logic. Sources are defined in the `SOURCES` array, each with a `type` that maps to a scraper strategy:

| type | scraper | used for |
|------|---------|----------|
| `consider` | Puppeteer, waits for `.job-list-job` | JVP, F2 VC (Consider platform) |
| `direct` | axios + Next.js `__NEXT_DATA__` extraction, falls back to Cheerio selectors | Vertex Ventures IL, Viola Group |
| `browser` | Puppeteer generic | Team8 (WordPress) |
| `portfolio` | axios to VC page → extracts portfolio company links → `fetchCompanyJobs` per company | Glilot, Entree, TechAviv |
| `portfolio-browser` | Puppeteer to VC page → same ATS detection flow | Aleph VC (Webflow SPA) |

`fetchCompanyJobs` detects which ATS a company uses (Greenhouse, Lever, Workable, Ashby, BambooHR) by scanning their homepage HTML for known URL patterns, then queries the ATS API directly. This is the most productive scraping path when it works.

Puppeteer is lazy-initialized (singleton `_browser`) and closed after all sources complete.

Job IDs are stable strings: `"SourceName:normalized-url"`. Deduplication happens both within a single run (in `deduplicateJobs`) and across days (via `data/seen_jobs.json`).

**`src/config.js`** — central place for env vars, `DATA_ROLE_KEYWORDS`, `DATA_MANAGEMENT_PATTERNS`, and `LEVEL_PATTERNS`. Edit keywords/patterns here to change what counts as a data role or how levels are classified.

**`src/jobClassifier.js`** — classifies jobs into management / senior / junior based on `LEVEL_PATTERNS` from config.

**`src/messageFormatter.js`** — formats jobs into HTML for Telegram (uses `<b>`, `<i>` tags). Splits into 4096-char chunks if needed.

**`src/telegramClient.js`** — thin wrapper around `node-telegram-bot-api` in polling-off mode (send-only).

**`src/seenJobs.js`** — persists seen job IDs to `data/seen_jobs.json` with timestamps; prunes entries older than 7 days. Also tracks `data/last_sent.json` (date of last successful send) to prevent double-sending on the same day.

## Environment variables

Required: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`  
Optional (see `.env.example`): `CRON_SCHEDULE`, `MAX_JOBS_PER_CATEGORY`, `RUN_NOW`, `FORCE`

## Key notes

- The project uses **ES modules** (`"type": "module"` in package.json). Use `.js` extensions in all imports.
- `data/seen_jobs.json` is the dedup store — deleting it causes all current jobs to be re-sent on the next run.
- Adding a new job source: add an entry to `SOURCES` in `jobFetcher.js` with the appropriate `type`. If the site uses an unsupported ATS, add a new `tryXxx` function and wire it into `detectATS`.
- `.wwebjs_auth/` and `.wwebjs_cache/` are leftover artifacts from a previous implementation; they can be deleted.
