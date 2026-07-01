import { DATA_ROLE_KEYWORDS, DATA_ROLE_BLOCKLIST, DATA_MANAGEMENT_PATTERNS, LEVEL_PATTERNS } from './config.js';

export function isDataRole(title) {
  const lower = (title || '').toLowerCase();
  if (DATA_ROLE_BLOCKLIST.some(kw => lower.includes(kw))) return false;
  if (DATA_ROLE_KEYWORDS.some(kw => lower.includes(kw))) return true;
  if (DATA_MANAGEMENT_PATTERNS.some(re => re.test(title))) return true;
  return false;
}

export function classifyLevel(title) {
  if (LEVEL_PATTERNS.management.test(title)) return 'management';
  if (LEVEL_PATTERNS.senior.test(title)) return 'senior';
  return 'junior';
}

export function classifyJobs(jobs) {
  const dataJobs = jobs.filter(j => isDataRole(j.title));
  return {
    management: dataJobs.filter(j => classifyLevel(j.title) === 'management'),
    senior: dataJobs.filter(j => classifyLevel(j.title) === 'senior'),
    junior: dataJobs.filter(j => classifyLevel(j.title) === 'junior'),
    total: dataJobs.length,
  };
}
