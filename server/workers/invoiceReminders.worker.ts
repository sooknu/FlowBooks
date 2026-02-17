import type { Job } from 'bullmq';
import { db } from '../db';
import { invoices, appSettings } from '../db/schema';
import { eq, and, lt, ne, inArray } from 'drizzle-orm';
import { emailQueue } from '../lib/queue';

export async function processInvoiceReminderJob(job: Job) {
  // Check if reminders are enabled
  const [enabledSetting] = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, 'invoice_reminders_enabled'));

  if (enabledSetting?.value !== 'true') {
    console.log('[invoice-reminders] Reminders are disabled, skipping');
    return { skipped: true, reason: 'disabled' };
  }

  // Get reminder config
  const [daysSetting] = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, 'invoice_reminder_days'));

  const reminderDays = (daysSetting?.value || '7,14,30')
    .split(',')
    .map((d: string) => parseInt(d.trim(), 10))
    .filter((d: number) => !isNaN(d));

  const now = new Date();

  // Find overdue invoices (due_date < now AND status is not 'paid')
  const overdueInvoices = await db.query.invoices.findMany({
    where: and(
      lt(invoices.dueDate, now),
      ne(invoices.status, 'paid'),
    ),
    with: { client: true },
  });

  let remindersQueued = 0;

  for (const invoice of overdueInvoices) {
    if (!invoice.dueDate) continue;

    const daysOverdue = Math.floor(
      (now.getTime() - new Date(invoice.dueDate).getTime()) / (1000 * 60 * 60 * 24)
    );

    // Only send on the exact configured days
    if (!reminderDays.includes(daysOverdue)) continue;

    // Only queue if client has an email
    const clientEmail = invoice.client?.email;
    if (!clientEmail) continue;

    await emailQueue.add('send', {
      to: clientEmail,
      type: 'invoice' as const,
      documentId: invoice.id,
      userId: invoice.userId,
      userDisplayName: 'System',
    }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 60_000 },
      jobId: `reminder-${invoice.id}-day${daysOverdue}`, // Deduplicate
    });

    remindersQueued++;
  }

  console.log(`[invoice-reminders] Found ${overdueInvoices.length} overdue, queued ${remindersQueued} reminders`);
  return { overdueCount: overdueInvoices.length, remindersQueued };
}
