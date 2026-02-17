import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6380';
export const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });

export const emailQueue = new Queue('email', { connection });
export const cleanupQueue = new Queue('cleanup', { connection });
export const invoiceReminderQueue = new Queue('invoice-reminders', { connection });
export const recurringExpensesQueue = new Queue('recurring-expenses', { connection });
export const salaryAccrualQueue = new Queue('salary-accrual', { connection });

export async function closeQueues() {
  await emailQueue.close();
  await cleanupQueue.close();
  await invoiceReminderQueue.close();
  await recurringExpensesQueue.close();
  await salaryAccrualQueue.close();
  await connection.quit();
}
