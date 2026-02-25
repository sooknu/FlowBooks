import { db } from '../db';
import { expenses, expenseCategories, projects, teamPayments, recurringExpenses } from '../db/schema';
import { eq, and, ilike, or, desc, asc, count, sum, sql, gte, lte, isNull } from 'drizzle-orm';
import { requirePermission } from '../lib/permissions';
import { logActivity, actorFromRequest } from '../lib/activityLog';
import { parseDateInput } from '../lib/dates';
import { getLinkedTeamPaymentId, syncTeamPaymentExpense } from '../lib/expenseSync';
import { recalculateProjectTeamFinancials } from '../lib/teamCalc';
import { broadcast } from '../lib/pubsub';

const readGuard = requirePermission('view_expenses');
const guard = requirePermission('manage_expenses');

/** Find or create the "Uncategorized" expense category. */
async function getOrCreateUncategorizedId(userId: string): Promise<string> {
  const [existing] = await db
    .select({ id: expenseCategories.id })
    .from(expenseCategories)
    .where(eq(expenseCategories.name, 'Uncategorized'))
    .limit(1);
  if (existing) return existing.id;
  const [created] = await db
    .insert(expenseCategories)
    .values({ userId, name: 'Uncategorized', color: 'slate', sortOrder: 9999 })
    .returning({ id: expenseCategories.id });
  return created.id;
}

/** Find or create the "Customer Payment" expense category for credits. */
async function getOrCreateCustomerPaymentId(userId: string): Promise<string> {
  const [existing] = await db
    .select({ id: expenseCategories.id })
    .from(expenseCategories)
    .where(eq(expenseCategories.name, 'Customer Payment'))
    .limit(1);
  if (existing) return existing.id;
  const [created] = await db
    .insert(expenseCategories)
    .values({ userId, name: 'Customer Payment', color: 'emerald', sortOrder: 998 })
    .returning({ id: expenseCategories.id });
  return created.id;
}

async function mapBody(body: any, userId: string) {
  const isCredit = body.type === 'credit';
  const categoryId = body.categoryId
    || (isCredit ? await getOrCreateCustomerPaymentId(userId) : await getOrCreateUncategorizedId(userId));
  return {
    categoryId,
    projectId: body.projectId || null,
    description: body.description,
    amount: parseFloat(body.amount),
    type: isCredit ? 'credit' as const : 'expense' as const,
    expenseDate: parseDateInput(body.expenseDate) ?? new Date(),
    notes: body.notes || null,
  };
}

export default async function expenseRoutes(fastify: any) {

  // GET / — paginated list with filters
  fastify.get('/', { preHandler: [readGuard] }, async (request: any) => {
    const {
      search,
      page = '0',
      pageSize = '50',
      orderBy = 'expenseDate',
      asc: ascending = 'false',
      categoryId,
      projectId,
      startDate,
      endDate,
      source,
    } = request.query;

    const skip = parseInt(page) * parseInt(pageSize);
    const take = parseInt(pageSize);

    const conditions: any[] = [];
    if (search) {
      conditions.push(or(
        ilike(expenses.description, `%${search}%`),
        ilike(projects.title, `%${search}%`),
      ));
    }
    if (categoryId) conditions.push(eq(expenses.categoryId, categoryId));
    if (projectId) conditions.push(eq(expenses.projectId, projectId));
    if (source === 'team') conditions.push(sql`${expenses.teamPaymentId} IS NOT NULL`);
    if (startDate) conditions.push(gte(expenses.expenseDate, parseDateInput(startDate)!));
    if (endDate) conditions.push(lte(expenses.expenseDate, parseDateInput(endDate)!));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const sortCol = orderBy === 'amount' ? expenses.amount : orderBy === 'createdAt' ? expenses.createdAt : expenses.expenseDate;
    const orderFn = ascending === 'true' ? asc(sortCol) : desc(sortCol);

    const [data, [{ total }]] = await Promise.all([
      db.select({
        id: expenses.id,
        description: expenses.description,
        amount: expenses.amount,
        expenseDate: expenses.expenseDate,
        notes: expenses.notes,
        categoryId: expenses.categoryId,
        categoryName: expenseCategories.name,
        categoryColor: expenseCategories.color,
        projectId: expenses.projectId,
        projectTitle: projects.title,
        type: expenses.type,
        teamPaymentId: expenses.teamPaymentId,
        createdAt: expenses.createdAt,
      })
        .from(expenses)
        .leftJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
        .leftJoin(projects, eq(expenses.projectId, projects.id))
        .where(where)
        .orderBy(orderFn)
        .limit(take)
        .offset(skip),
      db.select({ total: count() })
        .from(expenses)
        .leftJoin(projects, eq(expenses.projectId, projects.id))
        .where(where),
    ]);

    return { data, count: total };
  });

  // GET /stats — aggregated stats for dashboard
  fastify.get('/stats', { preHandler: [readGuard] }, async () => {
    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Expenses only (exclude credits which are revenue tracking)
    const expenseOnly = eq(expenses.type, sql`'expense'`);
    const notTeamPayment = isNull(expenses.teamPaymentId);
    const expenseSum = sql<number>`COALESCE(SUM(${expenses.amount}), 0)`;

    const [
      [{ totalAllTime }],
      [{ totalThisYear }],
      [{ totalThisMonth }],
      byCategory,
      byMonth,
      activeSubscriptions,
    ] = await Promise.all([
      // Total all time
      db.select({ totalAllTime: expenseSum })
        .from(expenses)
        .where(and(expenseOnly, notTeamPayment)),
      // Total this year
      db.select({ totalThisYear: expenseSum })
        .from(expenses)
        .where(and(expenseOnly, notTeamPayment, gte(expenses.expenseDate, yearStart))),
      // Total this month
      db.select({ totalThisMonth: expenseSum })
        .from(expenses)
        .where(and(expenseOnly, notTeamPayment, gte(expenses.expenseDate, monthStart))),
      // By category (exclude team-payment-linked expenses — tracked in Finance tab)
      db.select({
        categoryId: expenses.categoryId,
        name: expenseCategories.name,
        color: expenseCategories.color,
        total: expenseSum,
      })
        .from(expenses)
        .leftJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
        .where(and(expenseOnly, notTeamPayment, gte(expenses.expenseDate, yearStart)))
        .groupBy(expenses.categoryId, expenseCategories.name, expenseCategories.color)
        .orderBy(desc(expenseSum)),
      // By month (current year)
      db.select({
        month: sql<number>`EXTRACT(MONTH FROM ${expenses.expenseDate})::int`,
        total: expenseSum,
      })
        .from(expenses)
        .where(and(expenseOnly, notTeamPayment, gte(expenses.expenseDate, yearStart)))
        .groupBy(sql`EXTRACT(MONTH FROM ${expenses.expenseDate})`),
      // Active recurring expenses (subscriptions)
      db.select({
        id: recurringExpenses.id,
        description: recurringExpenses.description,
        amount: recurringExpenses.amount,
        frequency: recurringExpenses.frequency,
        nextDueDate: recurringExpenses.nextDueDate,
        categoryName: expenseCategories.name,
        categoryColor: expenseCategories.color,
      })
        .from(recurringExpenses)
        .leftJoin(expenseCategories, eq(recurringExpenses.categoryId, expenseCategories.id))
        .where(eq(recurringExpenses.isActive, true))
        .orderBy(asc(recurringExpenses.nextDueDate)),
    ]);

    return {
      totalAllTime: parseFloat(totalAllTime as string) || 0,
      totalThisYear: parseFloat(totalThisYear as string) || 0,
      totalThisMonth: parseFloat(totalThisMonth as string) || 0,
      byCategory: byCategory.map(c => ({ ...c, total: parseFloat(c.total as string) || 0 })),
      byMonth: byMonth.map(m => ({ month: m.month, total: parseFloat(m.total as string) || 0 })),
      activeSubscriptions,
    };
  });

  // POST / — create expense
  fastify.post('/', { preHandler: [guard] }, async (request: any) => {
    const [data] = await db
      .insert(expenses)
      .values({ ...await mapBody(request.body, request.user.id), userId: request.user.id })
      .returning();
    logActivity({ ...actorFromRequest(request), action: 'created', entityType: 'expense', entityId: data.id, entityLabel: data.description });
    broadcast('expense', 'created', request.user.id, data.id);
    return { data };
  });

  // PUT /:id — update expense
  fastify.put('/:id', { preHandler: [guard] }, async (request: any, reply: any) => {
    const { id } = request.params;
    const linkedTeamPaymentId = await getLinkedTeamPaymentId(id);

    if (linkedTeamPaymentId) {
      // Update the team payment (source of truth), then sync back to expense
      const body = request.body;
      const [updatedPayment] = await db
        .update(teamPayments)
        .set({
          ...(body.amount !== undefined && { amount: parseFloat(body.amount) }),
          ...(body.expenseDate !== undefined && { paymentDate: parseDateInput(body.expenseDate) ?? new Date() }),
          ...(body.notes !== undefined && { notes: body.notes || null }),
          ...(body.projectId !== undefined && { projectId: body.projectId || null }),
          updatedAt: new Date(),
        })
        .where(eq(teamPayments.id, linkedTeamPaymentId))
        .returning();

      if (!updatedPayment) return reply.code(404).send({ error: 'Linked team payment not found' });

      await recalculateProjectTeamFinancials(updatedPayment.projectId);

      await syncTeamPaymentExpense(linkedTeamPaymentId, {
        teamMemberId: updatedPayment.teamMemberId,
        projectId: updatedPayment.projectId,
        amount: updatedPayment.amount,
        paymentDate: updatedPayment.paymentDate,
        notes: updatedPayment.notes,
        status: updatedPayment.status,
        userId: request.user.id,
      });

      const [data] = await db.select().from(expenses).where(eq(expenses.teamPaymentId, linkedTeamPaymentId));
      logActivity({ ...actorFromRequest(request), action: 'updated', entityType: 'expense', entityId: id, entityLabel: data?.description || '' });
      broadcast('expense', 'updated', request.user.id, id);
      return { data };
    }

    // Regular expense update
    const [data] = await db
      .update(expenses)
      .set({ ...await mapBody(request.body, request.user.id), updatedAt: new Date() })
      .where(eq(expenses.id, id))
      .returning();
    if (data) logActivity({ ...actorFromRequest(request), action: 'updated', entityType: 'expense', entityId: data.id, entityLabel: data.description });
    if (data) broadcast('expense', 'updated', request.user.id, data.id);
    return { data };
  });

  // DELETE /:id — delete expense
  fastify.delete('/:id', { preHandler: [guard] }, async (request: any) => {
    const { id } = request.params;
    const linkedTeamPaymentId = await getLinkedTeamPaymentId(id);

    if (linkedTeamPaymentId) {
      // Get projectId for recalculation before deletion
      const [tp] = await db
        .select({ projectId: teamPayments.projectId })
        .from(teamPayments)
        .where(eq(teamPayments.id, linkedTeamPaymentId));

      const [existing] = await db.select({ description: expenses.description }).from(expenses).where(eq(expenses.id, id));

      // Delete team payment — expense auto-cascades via FK
      await db.delete(teamPayments).where(eq(teamPayments.id, linkedTeamPaymentId));

      if (tp?.projectId) await recalculateProjectTeamFinancials(tp.projectId);
      if (existing) logActivity({ ...actorFromRequest(request), action: 'deleted', entityType: 'expense', entityId: id, entityLabel: existing.description });
      logActivity({ ...actorFromRequest(request), action: 'deleted', entityType: 'team_payment', entityId: linkedTeamPaymentId });
      broadcast('expense', 'deleted', request.user.id, id);

      return { success: true };
    }

    // Regular expense deletion
    const [existing] = await db.select({ description: expenses.description }).from(expenses).where(eq(expenses.id, id));
    await db.delete(expenses).where(eq(expenses.id, id));
    if (existing) logActivity({ ...actorFromRequest(request), action: 'deleted', entityType: 'expense', entityId: id, entityLabel: existing.description });
    broadcast('expense', 'deleted', request.user.id, id);
    return { success: true };
  });
}
