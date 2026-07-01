# /fetch-source — Fetch and send jobs from a single source

Scrape one specific data source and send its jobs to Telegram immediately.

## Available sources

| Name | Type |
|------|------|
| JVP | Consider platform |
| F2 Venture Capital | Consider platform |
| Vertex Ventures IL | Getro platform |
| Viola Group | Getro platform |
| Team8 | Browser (WordPress) |
| Glilot Capital | Portfolio scraper |
| Entree Capital | Portfolio scraper |
| Aleph VC | Portfolio browser scraper |
| TechAviv | Consider platform |

## Steps

1. Identify the source name from the user's request (case-insensitive match).
2. Run:
   ```
   SOURCE="<name>" SKIP_SEEN=true FORCE=true RUN_NOW=true TZ=Asia/Jerusalem node src/index.js
   ```
3. Report how many jobs were found and whether the message was sent.

## Example

User: "fetch Team8" →
```
SOURCE="Team8" SKIP_SEEN=true FORCE=true RUN_NOW=true TZ=Asia/Jerusalem node src/index.js
```
