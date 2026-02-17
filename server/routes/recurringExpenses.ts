import { db } from '../db';
import { recurringExpenses, expenses, expenseCategories, vendors, projects } from '../db/schema';
import { eq, and, desc, asc } from 'drizzle-orm';
import { requirePermission } from '../lib/permissions';
import { logActivity, actorFromRequest } from '../lib/activityLog';
import { parseDateInput } from '../lib/dates';

const guard = requirePermission('manage_expenses');

function mapBody(body: any) {
  return {
    categoryId: body.categoryId || null,
    projectId: body.projectId || null,
    description: body.description,
    amount: parseFloat(body.amount),
    vendorId: body.vendorId || null,
    notes: body.notes || null,
    frequency: body.frequency || 'monthly',
    startDate: parseDateInput(body.startDate) ?? new Date(),
    nextDueDate: parseDateInput(body.nextDueDate) ?? new Date(),
    endDate: parseDateInput(body.endDate),
    isActive: body.isActive !== undefined ? body.isActive : true,
  };
}

export function calculateNextDueDate(currentDate: Date, frequency: string): Date {
  const next = new Date(currentDate);
  switch (frequency) {
    case 'weekly':
      next.setDate(next.getDate() + 7);
      break;
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      break;
    case 'yearly':
      next.setFullYear(next.getFullYear() + 1);
      break;
  }
  return next;
}

export default async function recurringExpenseRoutes(fastify: any) {

  // GET / — list all recurring expenses
  fastify.get('/', { preHandler: [guard] }, async (request: any) => {
    const data = await db.select({
      id: recurringExpenses.id,
      description: recurringExpenses.description,
      amount: recurringExpenses.amount,
      vendorId: recurringExpenses.vendorId,
      vendorName: vendors.name,
      notes: recurringExpenses.notes,
      frequency: recurringExpenses.frequency,
      startDate: recurringExpenses.startDate,
      nextDueDate: recurringExpenses.nextDueDate,
      endDate: recurringExpenses.endDate,
      isActive: recurringExpenses.isActive,
      lastGeneratedDate: recurringExpenses.lastGeneratedDate,
      categoryId: recurringExpenses.categoryId,
      categoryName: expenseCategories.name,
      categoryColor: expenseCategories.color,
      projectId: recurringExpenses.projectId,
      projectTitle: projects.title,
      createdAt: recurringExpenses.createdAt,
    })
      .from(recurringExpenses)
      .leftJoin(expenseCategories, eq(recurringExpenses.categoryId, expenseCategories.id))
      .leftJoin(vendors, eq(recurringExpenses.vendorId, vendors.id))
      .leftJoin(projects, eq(recurringExpenses.projectId, projects.id))
      .where(eq(recurringExpenses.userId, request.user.id))
      .orderBy(desc(recurringExpenses.isActive), asc(recurringExpenses.nextDueDate));

    return { data };
  });

  // POST / — create recurring expense + first entry
  fastify.post('/', { preHandler: [guard] }, async (request: any) => {
    const mapped = mapBody(request.body);

    const [template] = await db
      .insert(recurringExpenses)
      .values({ ...mapped, userId: request.user.id })
      .returning();

    // Create first expense entry immediately
    await db.insert(expenses).values({
      userId: request.user.id,
      categoryId: template.categoryId,
      projectId: template.projectId,
      description: template.description,
      amount: template.amount,
      vendorId: template.vendorId,
      notes: template.notes,
      expenseDate: template.startDate,
      recurringExpenseId: template.id,
    });

    // Advance nextDueDate and set lastGeneratedDate
    const nextDue = calculateNextDueDate(template.startDate, template.frequency);
    await db
      .update(recurringExpenses)
      .set({ lastGeneratedDate: template.startDate, nextDueDate: nextDue, updatedAt: new Date() })
      .where(eq(recurringExpenses.id, template.id));

    logActivity({ ...actorFromRequest(request), action: 'created', entityType: 'recurring_expense', entityId: template.id, entityLabel: template.description });
    return { data: { ...template, nextDueDate: nextDue, lastGeneratedDate: template.startDate } };
  });

  // PUT /:id — update recurring expense
  fastify.put('/:id', { preHandler: [guard] }, async (request: any) => {
    const [data] = await db
      .update(recurringExpenses)
      .set({ ...mapBody(request.body), updatedAt: new Date() })
      .where(and(eq(recurringExpenses.id, request.params.id), eq(recurringExpenses.userId, request.user.id)))
      .returning();
    if (data) logActivity({ ...actorFromRequest(request), action: 'updated', entityType: 'recurring_expense', entityId: data.id, entityLabel: data.description });
    return { data };
  });

  // PUT /:id/toggle — toggle active/paused
  fastify.put('/:id/toggle', { preHandler: [guard] }, async (request: any) => {
    const [existing] = await db
      .select({ isActive: recurringExpenses.isActive })
      .from(recurringExpenses)
      .where(and(eq(recurringExpenses.id, request.params.id), eq(recurringExpenses.userId, request.user.id)));

    if (!existing) return { error: 'Not found' };

    const [data] = await db
      .update(recurringExpenses)
      .set({ isActive: !existing.isActive, updatedAt: new Date() })
      .where(eq(recurringExpenses.id, request.params.id))
      .returning();

    logActivity({ ...actorFromRequest(request), action: data.isActive ? 'activated' : 'paused', entityType: 'recurring_expense', entityId: data.id, entityLabel: data.description });
    return { data };
  });

  // DELETE /:id — delete recurring expense
  fastify.delete('/:id', { preHandler: [guard] }, async (request: any) => {
    const [existing] = await db
      .select({ description: recurringExpenses.description })
      .from(recurringExpenses)
      .where(and(eq(recurringExpenses.id, request.params.id), eq(recurringExpenses.userId, request.user.id)));

    await db.delete(recurringExpenses).where(eq(recurringExpenses.id, request.params.id));
    if (existing) logActivity({ ...actorFromRequest(request), action: 'deleted', entityType: 'recurring_expense', entityId: request.params.id, entityLabel: existing.description });
    return { success: true };
  });
}
