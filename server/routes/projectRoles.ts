import { db } from '../db';
import { projectRoles } from '../db/schema';
import { eq, asc as ascFn } from 'drizzle-orm';
import { requirePermission } from '../lib/permissions';
import { logActivity, actorFromRequest } from '../lib/activityLog';

export default async function projectRoleRoutes(fastify: any) {
  // GET /api/project-roles — list all (any authenticated user)
  fastify.get('/', async () => {
    const data = await db.select().from(projectRoles).orderBy(ascFn(projectRoles.sortOrder), ascFn(projectRoles.label));
    return { data };
  });

  // POST /api/project-roles — create (settings perm)
  fastify.post('/', { preHandler: [requirePermission('access_settings')] }, async (request: any) => {
    const { label, sortOrder } = request.body;
    const [data] = await db.insert(projectRoles).values({
      label,
      sortOrder: sortOrder ?? 0,
    }).returning();

    logActivity({ ...actorFromRequest(request), action: 'created', entityType: 'project_role', entityId: data.id, entityLabel: label });
    return { data };
  });

  // PUT /api/project-roles/:id — update (settings perm)
  fastify.put('/:id', { preHandler: [requirePermission('access_settings')] }, async (request: any) => {
    const { label, sortOrder } = request.body;
    const updates: any = { updatedAt: new Date() };
    if (label !== undefined) updates.label = label;
    if (sortOrder !== undefined) updates.sortOrder = sortOrder;

    const [data] = await db.update(projectRoles).set(updates)
      .where(eq(projectRoles.id, request.params.id)).returning();
    if (!data) throw new Error('Project role not found');

    logActivity({ ...actorFromRequest(request), action: 'updated', entityType: 'project_role', entityId: data.id, entityLabel: data.label });
    return { data };
  });

  // DELETE /api/project-roles/:id — delete (settings perm)
  fastify.delete('/:id', { preHandler: [requirePermission('access_settings')] }, async (request: any) => {
    const [existing] = await db.select({ label: projectRoles.label })
      .from(projectRoles).where(eq(projectRoles.id, request.params.id));
    if (!existing) throw new Error('Project role not found');

    await db.delete(projectRoles).where(eq(projectRoles.id, request.params.id));

    logActivity({ ...actorFromRequest(request), action: 'deleted', entityType: 'project_role', entityId: request.params.id, entityLabel: existing.label });
    return { success: true };
  });
}
