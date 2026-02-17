import { db } from '../db';
import { projectTypes } from '../db/schema';
import { eq, asc as ascFn } from 'drizzle-orm';
import { requirePermission } from '../lib/permissions';
import { logActivity, actorFromRequest } from '../lib/activityLog';

export default async function projectTypeRoutes(fastify: any) {
  // GET /api/project-types — list all (any authenticated user)
  fastify.get('/', async () => {
    const data = await db.select().from(projectTypes).orderBy(ascFn(projectTypes.sortOrder), ascFn(projectTypes.label));
    return { data };
  });

  // POST /api/project-types — create (admin only)
  fastify.post('/', { preHandler: [requirePermission('access_settings')] }, async (request: any) => {
    const { slug, label, color, sortOrder } = request.body;
    const [data] = await db.insert(projectTypes).values({
      slug,
      label,
      color: color || 'amber',
      sortOrder: sortOrder ?? 0,
    }).returning();

    logActivity({ ...actorFromRequest(request), action: 'created', entityType: 'project_type', entityId: data.id, entityLabel: label });
    return { data };
  });

  // PUT /api/project-types/:id — update (admin only)
  fastify.put('/:id', { preHandler: [requirePermission('access_settings')] }, async (request: any) => {
    const { slug, label, color, sortOrder } = request.body;
    const updates: any = { updatedAt: new Date() };
    if (slug !== undefined) updates.slug = slug;
    if (label !== undefined) updates.label = label;
    if (color !== undefined) updates.color = color;
    if (sortOrder !== undefined) updates.sortOrder = sortOrder;

    const [data] = await db.update(projectTypes).set(updates)
      .where(eq(projectTypes.id, request.params.id)).returning();
    if (!data) throw new Error('Project type not found');

    logActivity({ ...actorFromRequest(request), action: 'updated', entityType: 'project_type', entityId: data.id, entityLabel: data.label });
    return { data };
  });

  // DELETE /api/project-types/:id — delete (admin only)
  // FK onDelete: set null handles referencing projects/quotes/invoices
  fastify.delete('/:id', { preHandler: [requirePermission('access_settings')] }, async (request: any) => {
    const [existing] = await db.select({ label: projectTypes.label })
      .from(projectTypes).where(eq(projectTypes.id, request.params.id));
    if (!existing) throw new Error('Project type not found');

    await db.delete(projectTypes).where(eq(projectTypes.id, request.params.id));

    logActivity({ ...actorFromRequest(request), action: 'deleted', entityType: 'project_type', entityId: request.params.id, entityLabel: existing.label });
    return { success: true };
  });
}
