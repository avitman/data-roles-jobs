# /send-job — Send daily Telegram job digest

Trigger the job bot to fetch and send data roles to Telegram right now.

Rules enforced by this skill:
- **No duplicate jobs within a single message** — `fetchAllJobs` deduplicates by URL/ID before returning.
- The same job **will** appear again on subsequent runs (seen-jobs filter is bypassed).

## Steps

1. Run the bot with seen-jobs filtering disabled and daily guard bypassed:
   ```
   SKIP_SEEN=true FORCE=true RUN_NOW=true TZ=Asia/Jerusalem node src/index.js
   ```
2. Report whether the message was sent successfully or failed.
