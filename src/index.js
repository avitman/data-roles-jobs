import cron from 'node-cron';
import { config } from './config.js';
import { fetchAllJobs } from './jobFetcher.js';
import { isDataRole } from './jobClassifier.js';
import { formatMessage } from './messageFormatter.js';
import { createClient, waitForReady, sendToGroup } from './telegramClient.js';
import { loadSeenJobs, saveSeenJobs, pruneOldEntries, filterAndMarkSeen, loadLastSent, saveLastSent } from './seenJobs.js';

async function runDailyJob() {
  console.log(`[bot] Running daily job fetch — ${new Date().toLocaleString('en-IL', { timeZone: 'Asia/Jerusalem' })}`);
  try {
    const todayIL = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
    if (!config.force && loadLastSent() === todayIL) {
      console.log('[bot] Already sent today — skipping. Use FORCE=true to override.');
      return;
    }

    const allJobs = await fetchAllJobs({ sourceFilter: config.sourceFilter });
    console.log(`[bot] Fetched ${allJobs.length} total jobs from all sources.`);

    let jobsToSend;
    if (config.skipSeen) {
      jobsToSend = allJobs;
      console.log('[bot] SKIP_SEEN=true — skipping seen-jobs filter.');
    } else {
      let seen = loadSeenJobs();
      seen = pruneOldEntries(seen);
      const { newJobs, updatedSeen } = filterAndMarkSeen(allJobs, seen);
      saveSeenJobs(updatedSeen);
      jobsToSend = newJobs;
    }
    console.log(`[bot] ${jobsToSend.length} jobs to send.`);

    const dataJobs = jobsToSend.filter(j => {
      if (!isDataRole(j.title)) return false;
      const loc = (j.location || '').toLowerCase();
      if (/\bremote\b/.test(loc) && !loc.includes('israel')) return false;
      return true;
    });
    const bySource = {};
    for (const job of dataJobs) {
      (bySource[job.source] = bySource[job.source] || []).push(job);
    }
    console.log(`[bot] ${dataJobs.length} data roles across ${Object.keys(bySource).length} sources.`);

    const messages = formatMessage({ bySource, total: dataJobs.length });
    for (const msg of messages) {
      await sendToGroup(config.telegram.chatId, msg);
    }
    saveLastSent(todayIL);
    console.log('[bot] Messages sent successfully!');
  } catch (err) {
    console.error('[bot] Daily job run failed:', err.message);
  }
}

async function main() {
  console.log('╔══════════════════════════════════════╗');
  console.log('║   Data Roles Community — Job Bot     ║');
  console.log('╚══════════════════════════════════════╝');

  createClient(config.telegram.botToken);
  await waitForReady();

  cron.schedule(config.cron.schedule, runDailyJob, {
    timezone: 'Asia/Jerusalem',
  });

  console.log(`[bot] Scheduled: "${config.cron.schedule}" (Asia/Jerusalem)`);
  console.log('[bot] Bot is running. Press Ctrl+C to stop.');

  if (config.runNow) {
    console.log('[bot] RUN_NOW=true — firing immediately...');
    await runDailyJob();
    process.exit(0);
  }
}

process.on('SIGINT', () => {
  console.log('\n[bot] Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n[bot] SIGTERM received, shutting down...');
  process.exit(0);
});

main().catch(err => {
  console.error('[bot] Fatal error:', err.message);
  process.exit(1);
});
