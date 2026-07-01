import dayjs from 'dayjs';
import { config } from './config.js';
import { classifyLevel } from './jobClassifier.js';

const TELEGRAM_LIMIT = 4096;

const LEVEL_EMOJI = { management: '👔', senior: '🔵', junior: '🟢' };

function esc(text) {
  return (text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escUrl(url) {
  return (url || '').replace(/&/g, '&amp;').replace(/"/g, '%22').replace(/'/g, '%27');
}

// Derive a careers board URL from a job-specific URL
function careersUrl(jobUrl) {
  if (!jobUrl) return null;
  try {
    const u = new URL(jobUrl);
    const p = u.pathname.split('/').filter(Boolean);
    if (u.hostname === 'boards.greenhouse.io' && p[0]) return `https://boards.greenhouse.io/${p[0]}`;
    if (u.hostname === 'jobs.lever.co' && p[0]) return `https://jobs.lever.co/${p[0]}`;
    if (u.hostname === 'apply.workable.com' && p[0]) return `https://apply.workable.com/${p[0]}`;
    if (u.hostname === 'jobs.ashbyhq.com' && p[0]) return `https://jobs.ashbyhq.com/${p[0]}`;
    if (u.hostname.endsWith('.bamboohr.com')) return `${u.origin}/careers`;
    return jobUrl;
  } catch { return jobUrl; }
}

function buildSourceSection(sourceName, jobs) {
  if (jobs.length === 0) return '';

  const shown = jobs.slice(0, config.maxJobsPerCategory);
  const extra = jobs.length - shown.length;

  const lines = [`🏢 <b>${esc(sourceName)}</b> (${jobs.length})`];

  for (const job of shown) {
    const level = LEVEL_EMOJI[classifyLevel(job.title)];
    const title = job.url
      ? `<a href="${escUrl(job.url)}">${esc(job.title)}</a>`
      : `<b>${esc(job.title)}</b>`;
    const company = esc(job.company);
    const location = job.location ? ` — ${esc(job.location)}` : '';
    lines.push(`${level} ${title} @ ${company}${location}`);
  }

  if (extra > 0) lines.push(`<i>   +${extra} more</i>`);

  return lines.join('\n');
}

export function formatMessage({ bySource, total }, date = new Date()) {
  const dateStr = dayjs(date).format('MMMM D, YYYY');

  if (total === 0) {
    return [[
      `📊 <b>Data Jobs Digest — ${dateStr}</b>`,
      `📍 Israel | Last 48 hours`,
      '',
      'No new data roles found today. Check again tomorrow!',
      '🤖 Next update tomorrow at 09:00 IL',
    ].join('\n')];
  }

  const sourceSections = Object.entries(bySource)
    .sort(([, a], [, b]) => b.length - a.length)
    .map(([source, jobs]) => buildSourceSection(source, jobs))
    .filter(Boolean);

  const lines = [
    `📊 <b>Data Jobs Digest — ${dateStr}</b>`,
    `📍 Israel | Last 48 hours | ${total} new roles`,
    '━━━━━━━━━━━━━━━━━━━━━',
    ...sourceSections.join('\n\n').split('\n'),
    '━━━━━━━━━━━━━━━━━━━━━',
    '🤖 Next update tomorrow at 09:00 IL',
  ];

  let mainMessage = lines.join('\n');
  if (mainMessage.length > TELEGRAM_LIMIT) {
    const trailer = '\n\n<i>[Message truncated — too many jobs!]</i>';
    const msgLines = mainMessage.split('\n');
    while (msgLines.join('\n').length + trailer.length > TELEGRAM_LIMIT && msgLines.length > 1) {
      msgLines.pop();
    }
    mainMessage = msgLines.join('\n') + trailer;
  }

  // Second message: company summary with hyperlinks to careers boards
  const companyMap = {};
  for (const jobs of Object.values(bySource)) {
    for (const job of jobs) {
      const co = job.company || 'Unknown';
      if (!companyMap[co]) companyMap[co] = { count: 0, url: careersUrl(job.url) };
      companyMap[co].count++;
    }
  }
  const summaryLines = Object.entries(companyMap)
    .sort(([, a], [, b]) => b.count - a.count)
    .map(([co, { count, url }]) => {
      const link = url ? `<a href="${escUrl(url)}">${esc(co)}</a>` : esc(co);
      return `${link} ${count}`;
    });

  const summaryMessage = [
    `🏢 <b>Companies (${Object.keys(companyMap).length})</b>`,
    ...summaryLines,
  ].join('\n');

  return [mainMessage, summaryMessage];
}
