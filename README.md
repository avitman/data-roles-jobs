# Data Roles Community — Daily Telegram Job Bot

Sends a daily digest of new data-role job postings (last 48 hours, Israel) to a Telegram group. Jobs are split into Management, Senior, and Mid/Junior sections.

**Sources**: Israeli VC portfolio boards (JVP, F2 VC, Vertex Ventures, Viola Group, Team8, Glilot Capital, Entree Capital, Aleph VC, TechAviv) — scraped directly, no paid API needed  
**Cost**: $0/month  
**Schedule**: Every day at 09:00 Israel time (configurable)

---

## Prerequisites

- Node.js 18+
- A Telegram bot token (from @BotFather)

### System dependencies (Ubuntu/Debian — required for Puppeteer/Chromium)

```bash
sudo apt-get install -y \
  libgbm-dev libasound2 libatk1.0-0 libatk-bridge2.0-0 libc6 libcairo2 \
  libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgcc1 libgdk-pixbuf2.0-0 \
  libglib2.0-0 libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 libpangocairo-1.0-0 \
  libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 \
  libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 \
  libxtst6 ca-certificates fonts-liberation wget
```

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create a Telegram bot

1. Open Telegram and message **@BotFather**
2. Send `/newbot` and follow the prompts
3. Copy the bot token you receive

### 3. Get your group chat ID

1. Add the bot to your Telegram group
2. Send any message in the group
3. Open `https://api.telegram.org/bot<TOKEN>/getUpdates` in a browser
4. Find `"chat":{"id":...}` — that is your `TELEGRAM_CHAT_ID` (negative number for groups)

### 4. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and fill in:
```
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_CHAT_ID=your_chat_id_here
```

---

## Running

### Test run (fires immediately)

```bash
# In .env set: RUN_NOW=true
npm start
```

Check that the message arrives in your group, then set `RUN_NOW=false`.

### Development (auto-restart on file changes)

```bash
npm run dev
```

### Production (keeps running, sends daily at 09:00 IL)

```bash
npm start
```

### With PM2 (auto-restart, survives reboots)

```bash
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup   # follow the printed command to enable on boot
```

Useful PM2 commands:
```bash
pm2 logs data-jobs-bot      # view live logs
pm2 status                  # check if running
pm2 restart data-jobs-bot   # restart after config change
pm2 stop data-jobs-bot      # stop the bot
```

---

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `TELEGRAM_BOT_TOKEN` | required | Bot token from @BotFather |
| `TELEGRAM_CHAT_ID` | required | Target group chat ID |
| `CRON_SCHEDULE` | `0 9 * * *` | Cron schedule (Asia/Jerusalem) |
| `MAX_JOBS_PER_CATEGORY` | `15` | Max jobs per section in message |
| `RUN_NOW` | `false` | Fire immediately on startup |
| `FORCE` | `false` | Skip "already sent today" guard |

---

## Message Format

```
📊 Data Jobs Digest — June 3, 2026
📍 Israel | Last 48 hours | 24 new roles
━━━━━━━━━━━━━━━━━━━━━

👔 MANAGEMENT & LEADERSHIP (3)

• Head of Data Engineering @ Wix
  📍 Tel Aviv | 💼 Full-time
  🔗 https://...

🔵 SENIOR ROLES (12)
...

🟢 MID & JUNIOR ROLES (9)
...
━━━━━━━━━━━━━━━━━━━━━
🤖 Next update tomorrow at 09:00 IL
```

---

## Data Role Detection

The bot matches jobs in two ways:

**Keyword match** (title contains any of):
`data engineer`, `data architect`, `analytics engineer`, `business intelligence`, `bi developer`, `bi engineer`, `etl`, `data platform`, `dbt`, `ai engineer`, `airflow`, `snowflake`, `data lead`, `data tech`, `data ops`, `dataops`, `data operations`, `data governance`, `data strategy`, `data infrastructure`, `data insights`, `data intelligence`

**Pattern match** (title matches any of):
- `(head|vp|director|manager|chief|lead) ... data` → e.g. "Head of Data", "VP Data"
- `data ... (lead|product|tech|platform|team)` → e.g. "Data Lead", "Data Product Manager"

---

## Important Notes

- Job deduplication is tracked in `data/seen_jobs.json` (7-day retention) so the same job is never sent twice.
- Deleting `data/seen_jobs.json` causes all currently-visible jobs to be re-sent on the next run.
