import { db } from '../db';
import { vendors } from '../db/schema';
import { eq, asc } from 'drizzle-orm';
import { requirePermission } from '../lib/permissions';
import { logActivity, actorFromRequest } from '../lib/activityLog';

const guard = requirePermission('manage_expenses');

export default async function vendorRoutes(fastify: any) {

  // GET / — list all vendors ordered by sortOrder
  fastify.get('/', { preHandler: [guard] }, async () => {
    const data = await db
      .select()
      .from(vendors)
      .orderBy(asc(vendors.sortOrder));
    return { data };
  });

  // POST / — create a vendor
  fastify.post('/', { preHandler: [guard] }, async (request: any) => {
    const { name, sortOrder } = request.body;
    const [data] = await db
      .insert(vendors)
      .values({ name, sortOrder: sortOrder ?? 0, userId: request.user.id })
      .returning();
    logActivity({ ...actorFromRequest(request), action: 'created', entityType: 'vendor', entityId: data.id, entityLabel: data.name });
    return { data };
  });

  // PUT /reorder — bulk reorder
  fastify.put('/reorder', { preHandler: [guard] }, async (request: any) => {
    const { ids } = request.body as { ids: string[] };
    await Promise.all(
      ids.map((id: string, i: number) =>
        db.update(vendors).set({ sortOrder: i, updatedAt: new Date() }).where(eq(vendors.id, id))
      )
    );
    return { success: true };
  });

  // PUT /:id — update a vendor
  fastify.put('/:id', { preHandler: [guard] }, async (request: any) => {
    const { name, sortOrder } = request.body;
    const [data] = await db
      .update(vendors)
      .set({ name, sortOrder: sortOrder ?? 0, updatedAt: new Date() })
      .where(eq(vendors.id, request.params.id))
      .returning();
    if (data) logActivity({ ...actorFromRequest(request), action: 'updated', entityType: 'vendor', entityId: data.id, entityLabel: data.name });
    return { data };
  });

  // DELETE /:id — delete a vendor (expenses get vendorId = null via ON DELETE SET NULL)
  fastify.delete('/:id', { preHandler: [guard] }, async (request: any) => {
    const [existing] = await db.select({ name: vendors.name }).from(vendors).where(eq(vendors.id, request.params.id));
    await db.delete(vendors).where(eq(vendors.id, request.params.id));
    if (existing) logActivity({ ...actorFromRequest(request), action: 'deleted', entityType: 'vendor', entityId: request.params.id, entityLabel: existing.name });
    return { success: true };
  });
}
