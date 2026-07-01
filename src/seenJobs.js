import fs from 'fs';
import path from 'path';
import { config } from './config.js';

export function loadSeenJobs() {
  try {
    const raw = fs.readFileSync(config.seenJobsPath, 'utf-8');
    return JSON.parse(raw).jobs || {};
  } catch {
    return {};
  }
}

export function saveSeenJobs(jobs) {
  const dir = path.dirname(config.seenJobsPath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = config.seenJobsPath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify({ jobs }, null, 2), 'utf-8');
  fs.renameSync(tmp, config.seenJobsPath);
}

export function pruneOldEntries(seen) {
  const cutoff = Date.now() - config.seenJobsRetentionDays * 24 * 60 * 60 * 1000;
  const pruned = {};
  for (const [id, ts] of Object.entries(seen)) {
    if (new Date(ts).getTime() >= cutoff) {
      pruned[id] = ts;
    }
  }
  return pruned;
}

export function loadLastSent() {
  try {
    const raw = fs.readFileSync(config.lastSentPath, 'utf-8');
    return JSON.parse(raw).date || null;
  } catch {
    return null;
  }
}

export function saveLastSent(date) {
  const dir = path.dirname(config.lastSentPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(config.lastSentPath, JSON.stringify({ date }, null, 2), 'utf-8');
}

export function filterAndMarkSeen(jobs, seen) {
  const now = new Date().toISOString();
  const newJobs = jobs.filter(j => !seen[j.id]);
  for (const j of newJobs) {
    seen[j.id] = now;
  }
  return { newJobs, updatedSeen: seen };
}
