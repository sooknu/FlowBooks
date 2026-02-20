import { db } from '../db';
import { expenseCategories } from '../db/schema';
import { eq, asc } from 'drizzle-orm';
import { requirePermission } from '../lib/permissions';
import { logActivity, actorFromRequest } from '../lib/activityLog';

const readGuard = requirePermission('manage_expenses');
const writeGuard = requirePermission('manage_categories');

export default async function expenseCategoryRoutes(fastify: any) {

  // GET / — list all categories ordered by sortOrder
  fastify.get('/', { preHandler: [readGuard] }, async () => {
    const data = await db
      .select()
      .from(expenseCategories)
      .orderBy(asc(expenseCategories.sortOrder));
    return { data };
  });

  // POST / — create a category
  fastify.post('/', { preHandler: [writeGuard] }, async (request: any) => {
    const { name, color, sortOrder } = request.body;
    const [data] = await db
      .insert(expenseCategories)
      .values({ name, color: color || null, sortOrder: sortOrder ?? 0, userId: request.user.id })
      .returning();
    logActivity({ ...actorFromRequest(request), action: 'created', entityType: 'expense_category', entityId: data.id, entityLabel: data.name });
    return { data };
  });

  // PUT /reorder — bulk reorder
  fastify.put('/reorder', { preHandler: [writeGuard] }, async (request: any) => {
    const { ids } = request.body as { ids: string[] };
    await Promise.all(
      ids.map((id: string, i: number) =>
        db.update(expenseCategories).set({ sortOrder: i, updatedAt: new Date() }).where(eq(expenseCategories.id, id))
      )
    );
    return { success: true };
  });

  // PUT /:id — update a category
  fastify.put('/:id', { preHandler: [writeGuard] }, async (request: any) => {
    const { name, color, sortOrder } = request.body;
    const [data] = await db
      .update(expenseCategories)
      .set({ name, color: color || null, sortOrder: sortOrder ?? 0, updatedAt: new Date() })
      .where(eq(expenseCategories.id, request.params.id))
      .returning();
    if (data) logActivity({ ...actorFromRequest(request), action: 'updated', entityType: 'expense_category', entityId: data.id, entityLabel: data.name });
    return { data };
  });

  // DELETE /:id — delete a category (expenses get categoryId = null via ON DELETE SET NULL)
  fastify.delete('/:id', { preHandler: [writeGuard] }, async (request: any) => {
    const [existing] = await db.select({ name: expenseCategories.name }).from(expenseCategories).where(eq(expenseCategories.id, request.params.id));
    await db.delete(expenseCategories).where(eq(expenseCategories.id, request.params.id));
    if (existing) logActivity({ ...actorFromRequest(request), action: 'deleted', entityType: 'expense_category', entityId: request.params.id, entityLabel: existing.name });
    return { success: true };
  });
}
