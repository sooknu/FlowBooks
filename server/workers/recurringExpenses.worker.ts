import type { Job } from 'bullmq';
import { db } from '../db';
import { recurringExpenses, expenses } from '../db/schema';
import { eq, and, lte } from 'drizzle-orm';
import { calculateNextDueDate } from '../routes/recurringExpenses';

export async function processRecurringExpensesJob(job: Job) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Find active recurring expenses where nextDueDate <= today
  const due = await db
    .select()
    .from(recurringExpenses)
    .where(and(
      eq(recurringExpenses.isActive, true),
      lte(recurringExpenses.nextDueDate, today),
    ));

  let generated = 0;

  for (const template of due) {
    // Idempotency: skip if already generated today
    if (template.lastGeneratedDate) {
      const lastGen = new Date(template.lastGeneratedDate);
      lastGen.setHours(0, 0, 0, 0);
      if (lastGen.getTime() === today.getTime()) continue;
    }

    // Deactivate if past end date
    if (template.endDate && new Date(template.endDate) < today) {
      await db
        .update(recurringExpenses)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(recurringExpenses.id, template.id));
      continue;
    }

    // Create expense entry
    await db.insert(expenses).values({
      userId: template.userId,
      categoryId: template.categoryId,
      projectId: template.projectId,
      description: template.description,
      amount: template.amount,
      vendorId: template.vendorId,
      notes: template.notes,
      expenseDate: template.nextDueDate,
      recurringExpenseId: template.id,
    });

    // Advance nextDueDate
    const next = calculateNextDueDate(template.nextDueDate, template.frequency);
    await db
      .update(recurringExpenses)
      .set({ lastGeneratedDate: template.nextDueDate, nextDueDate: next, updatedAt: new Date() })
      .where(eq(recurringExpenses.id, template.id));

    generated++;
  }

  console.log(`[recurring-expenses] Processed ${due.length} templates, generated ${generated} expenses`);
  return { processed: due.length, generated };
}
