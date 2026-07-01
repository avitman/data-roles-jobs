import 'dotenv/config';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const required = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`[config] Missing required env var: ${key}`);
    process.exit(1);
  }
}

export const config = {
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    chatId: process.env.TELEGRAM_CHAT_ID,
  },
  cron: {
    schedule: process.env.CRON_SCHEDULE || '0 9 * * *',
  },
  maxJobsPerCategory: parseInt(process.env.MAX_JOBS_PER_CATEGORY || '15', 10),
  runNow: process.env.RUN_NOW === 'true',
  force: process.env.FORCE === 'true',
  skipSeen: process.env.SKIP_SEEN === 'true',
  sourceFilter: process.env.SOURCE ? process.env.SOURCE.split(',').map(s => s.trim()) : null,
  seenJobsPath: join(__dirname, '..', 'data', 'seen_jobs.json'),
  lastSentPath: join(__dirname, '..', 'data', 'last_sent.json'),
  seenJobsRetentionDays: 7,
};

export const DATA_ROLE_KEYWORDS = [
  'data engineer', 'data architect', 'analytics engineer',
  'business intelligence', 'bi developer', 'bi engineer',
  'etl', 'data platform', 'dbt', 'airflow', 'snowflake',
  'data lead', 'data tech', 'data ops', 'dataops',
  'data operations', 'data governance', 'data strategy',
  'data infrastructure', 'data insights', 'data intelligence',
];

export const DATA_ROLE_BLOCKLIST = [
  'data scientist', 'data science',
  'data analyst',
  'software engineer', 'software data engineer',
];

// Secondary patterns — catch "Head of Data", "VP Data", "Data Product Manager", etc.
export const DATA_MANAGEMENT_PATTERNS = [
  /\b(head|vp|vice president|director|manager|chief|lead)\b.*\bdata\b/i,
  /\bdata\b.*(lead|product|tech|platform|team|chapter|guild)/i,
];

export const LEVEL_PATTERNS = {
  management: /\b(manager|director|vp|vice president|head of|chief|cdo)\b/i,
  senior: /\b(senior|sr\.?|principal|staff|lead)\b/i,
};
