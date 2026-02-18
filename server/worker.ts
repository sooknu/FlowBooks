import IORedis from 'ioredis';
import { Worker } from 'bullmq';
import { cleanupQueue, invoiceReminderQueue, recurringExpensesQueue, salaryAccrualQueue, backupQueue } from './lib/queue';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6380';
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });

// ── Email worker ──
import { processEmailJob } from './workers/email.worker';

const emailWorker = new Worker('email', processEmailJob, {
  connection,
  concurrency: 1,
});

emailWorker.on('completed', (job) => {
  console.log(`[email] Job ${job.id} completed`);
});
emailWorker.on('failed', (job, err) => {
  console.error(`[email] Job ${job?.id} failed (attempt ${job?.attemptsMade}):`, err.message);
});

// ── Cleanup worker ──
import { processCleanupJob } from './workers/cleanup.worker';

const cleanupWorker = new Worker('cleanup', processCleanupJob, {
  connection,
});

cleanupWorker.on('completed', (job) => {
  console.log(`[cleanup] Job ${job.id} completed`);
});
cleanupWorker.on('failed', (job, err) => {
  console.error(`[cleanup] Job ${job?.id} failed:`, err.message);
});

// ── Invoice reminder worker ──
import { processInvoiceReminderJob } from './workers/invoiceReminders.worker';

const invoiceReminderWorker = new Worker('invoice-reminders', processInvoiceReminderJob, {
  connection,
});

invoiceReminderWorker.on('completed', (job) => {
  console.log(`[invoice-reminders] Job ${job.id} completed`);
});
invoiceReminderWorker.on('failed', (job, err) => {
  console.error(`[invoice-reminders] Job ${job?.id} failed:`, err.message);
});

// ── Recurring expenses worker ──
import { processRecurringExpensesJob } from './workers/recurringExpenses.worker';

const recurringExpensesWorker = new Worker('recurring-expenses', processRecurringExpensesJob, {
  connection,
});

recurringExpensesWorker.on('completed', (job) => {
  console.log(`[recurring-expenses] Job ${job.id} completed`);
});
recurringExpensesWorker.on('failed', (job, err) => {
  console.error(`[recurring-expenses] Job ${job?.id} failed:`, err.message);
});

// ── Salary accrual worker ──
import { processSalaryAccrualJob } from './workers/salaryAccrual.worker';

const salaryAccrualWorker = new Worker('salary-accrual', processSalaryAccrualJob, {
  connection,
});

salaryAccrualWorker.on('completed', (job) => {
  console.log(`[salary-accrual] Job ${job.id} completed`);
});
salaryAccrualWorker.on('failed', (job, err) => {
  console.error(`[salary-accrual] Job ${job?.id} failed:`, err.message);
});

// ── Backup worker ──
import { processBackupJob } from './workers/backup.worker';

const backupWorker = new Worker('backup', processBackupJob, {
  connection,
  concurrency: 1,
});

backupWorker.on('completed', (job) => {
  console.log(`[backup] Job ${job.id} completed`);
});
backupWorker.on('failed', (job, err) => {
  console.error(`[backup] Job ${job?.id} failed:`, err.message);
});

// ── Schedule repeatable cron jobs ──
async function scheduleCronJobs() {
  // Daily cleanup at 3:00 AM
  await cleanupQueue.upsertJobScheduler(
    'daily-cleanup',
    { pattern: '0 3 * * *' },
    { name: 'daily-cleanup' },
  );

  // Daily invoice reminder check at 9:00 AM
  await invoiceReminderQueue.upsertJobScheduler(
    'daily-invoice-reminders',
    { pattern: '0 9 * * *' },
    { name: 'daily-invoice-reminders' },
  );

  // Daily recurring expense generation at 12:01 AM
  await recurringExpensesQueue.upsertJobScheduler(
    'daily-recurring-expenses',
    { pattern: '1 0 * * *' },
    { name: 'daily-recurring-expenses' },
  );

  // Weekly salary accrual on Monday at 12:01 AM
  await salaryAccrualQueue.upsertJobScheduler(
    'weekly-salary-accrual',
    { pattern: '1 0 * * 1' },
    { name: 'weekly-salary-accrual' },
  );

  // Backup schedule (dynamic — reads from settings)
  try {
    const { db } = await import('./db');
    const { appSettings } = await import('./db/schema');
    const { eq } = await import('drizzle-orm');
    const [scheduleSetting] = await db.select().from(appSettings).where(eq(appSettings.key, 'backup_schedule'));
    const schedule = scheduleSetting?.value || 'manual';

    if (schedule === 'daily') {
      await backupQueue.upsertJobScheduler('scheduled-backup', { pattern: '0 2 * * *' }, { name: 'scheduled-backup', data: { triggeredBy: 'scheduled' } } as any);
    } else if (schedule === 'weekly') {
      await backupQueue.upsertJobScheduler('scheduled-backup', { pattern: '0 2 * * 0' }, { name: 'scheduled-backup', data: { triggeredBy: 'scheduled' } } as any);
    } else {
      await backupQueue.removeJobScheduler('scheduled-backup').catch(() => {});
    }
  } catch (err: any) {
    console.error('[worker] Failed to configure backup schedule:', err.message);
  }

  console.log('[worker] Cron jobs scheduled');
}

scheduleCronJobs().catch(console.error);

// ── Graceful shutdown ──
async function shutdown() {
  console.log('[worker] Shutting down...');
  await emailWorker.close();
  await cleanupWorker.close();
  await invoiceReminderWorker.close();
  await recurringExpensesWorker.close();
  await salaryAccrualWorker.close();
  await backupWorker.close();
  await connection.quit();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

console.log('[worker] Started — listening for jobs');
