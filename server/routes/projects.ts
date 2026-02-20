import { db } from '../db';
import { projects, projectNotes, projectAssignments, projectSessions, teamMembers, user, notifications, expenses } from '../db/schema';
import { eq, ilike, or, and, asc as ascFn, desc as descFn, count, ne, exists, sql, gte, lt } from 'drizzle-orm';
import { logActivity, actorFromRequest } from '../lib/activityLog';
import { requireRole, requirePermission, hasPermission } from '../lib/permissions';
import { notifyUsers, getPrivilegedUserIds } from '../lib/notifications';
import { parseDateInput } from '../lib/dates';
import { broadcast } from '../lib/pubsub';

function mapProjectBody(body: any) {
  return {
    title: body.title || 'Untitled Project',
    description: body.description ?? null,
    projectType: body.projectType || body.project_type || null,
    projectTypeId: body.projectTypeId || body.project_type_id || null,
    status: body.status || 'lead',
    shootStartDate: parseDateInput(body.shootStartDate || body.shoot_start_date),
    shootEndDate: parseDateInput(body.shootEndDate || body.shoot_end_date),
    shootStartTime: body.shootStartTime || body.shoot_start_time || null,
    shootEndTime: body.shootEndTime || body.shoot_end_time || null,
    deliveryDate: parseDateInput(body.deliveryDate || body.delivery_date),
    location: body.location ?? null,
    addressStreet: body.addressStreet ?? null,
    addressCity: body.addressCity ?? null,
    addressState: body.addressState ?? null,
    addressZip: body.addressZip ?? null,
    projectPrice: body.projectPrice != null ? parseFloat(body.projectPrice) || null : null,
    placeId: body.placeId || body.place_id || null,
    coverPhotoUrl: body.coverPhotoUrl || body.cover_photo_url || null,
  };
}

function getClientId(body: any): string {
  return body.clientId || body.client_id;
}

async function syncSessions(projectId: string, sessions: any[]) {
  await db.delete(projectSessions).where(eq(projectSessions.projectId, projectId));

  if (!sessions || sessions.length === 0) return;

  await db.insert(projectSessions).values(
    sessions.map((s: any, i: number) => ({
      projectId,
      label: s.label || null,
      sessionDate: parseDateInput(s.sessionDate || s.session_date)!,
      startTime: s.startTime || s.start_time || null,
      endTime: s.endTime || s.end_time || null,
      sortOrder: s.sortOrder ?? i,
    }))
  );

  // Auto-sync shootStartDate/shootEndDate from session bounds
  const dates = sessions
    .map((s: any) => parseDateInput(s.sessionDate || s.session_date))
    .filter(Boolean) as Date[];
  if (dates.length > 0) {
    const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
    const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
    await db.update(projects).set({
      shootStartDate: minDate,
      shootEndDate: dates.length > 1 ? maxDate : null,
      shootStartTime: null,
      shootEndTime: null,
      updatedAt: new Date(),
    }).where(eq(projects.id, projectId));
  }
}

export default async function projectRoutes(fastify: any) {
  // GET /api/projects
  fastify.get('/', async (request: any) => {
    const {
      search,
      clientId,
      status,
      year,
      typeId,
      page = '0',
      pageSize = '50',
      orderBy = 'createdAt',
      asc = 'false',
    } = request.query;

    const skip = parseInt(page) * parseInt(pageSize);
    const take = parseInt(pageSize);

    const conditions: any[] = [];

    // Exclude archived by default unless explicitly requested
    if (status) {
      conditions.push(eq(projects.status, status));
    } else {
      conditions.push(ne(projects.status, 'archived'));
    }

    if (clientId) {
      conditions.push(eq(projects.clientId, clientId));
    }
    if (search) {
      conditions.push(
        or(
          ilike(projects.title, `%${search}%`),
          ilike(projects.location, `%${search}%`),
        )
      );
    }

    // Year filter on shootStartDate (falls back to createdAt)
    if (year) {
      const y = parseInt(year);
      const yearStart = new Date(y, 0, 1);
      const yearEnd = new Date(y + 1, 0, 1);
      conditions.push(
        or(
          and(gte(projects.shootStartDate, yearStart), lt(projects.shootStartDate, yearEnd)),
          and(sql`${projects.shootStartDate} IS NULL`, gte(projects.createdAt, yearStart), lt(projects.createdAt, yearEnd)),
        )
      );
    }

    // Project type filter
    if (typeId) {
      conditions.push(eq(projects.projectTypeId, typeId));
    }

    // Filter to only projects where current user is assigned as team member
    if (request.query.mine === 'true' && request.teamMemberId) {
      conditions.push(
        exists(
          db.select({ one: sql`1` })
            .from(projectAssignments)
            .where(and(
              eq(projectAssignments.projectId, projects.id),
              eq(projectAssignments.teamMemberId, request.teamMemberId),
            ))
        )
      );
    }

    const where = conditions.length > 1 ? and(...conditions) : conditions[0] ?? undefined;

    // Financial sort modes use raw SQL with subqueries
    const isFinancialSort = orderBy === 'balanceOwed' || orderBy === 'profit';

    if (isFinancialSort) {
      // Balance = projectPrice - credits received
      const balanceSql = sql`COALESCE(${projects.projectPrice}, 0) - COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.project_id = ${projects.id} AND e.type = 'credit'), 0)`;
      // Profit = credits (revenue) - expenses (team payments already included via expenseSync)
      const profitSql = sql`COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.project_id = ${projects.id} AND e.type = 'credit'), 0) - COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.project_id = ${projects.id} AND e.type = 'expense'), 0)`;

      const sortExpr = orderBy === 'balanceOwed' ? balanceSql : profitSql;
      const orderFn = asc === 'true' ? ascFn(sortExpr) : descFn(sortExpr);

      // Balance Owed: only projects with a price set AND positive balance remaining
      const extraConditions = [...(where ? [where] : [])];
      if (orderBy === 'balanceOwed') {
        extraConditions.push(sql`${projects.projectPrice} IS NOT NULL AND ${projects.projectPrice} > 0`);
        extraConditions.push(sql`(COALESCE(${projects.projectPrice}, 0) - COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.project_id = ${projects.id} AND e.type = 'credit'), 0)) > 0`);
      }

      const finalWhere = extraConditions.length > 1 ? and(...extraConditions) : extraConditions[0] ?? undefined;

      const [data, [{ total }]] = await Promise.all([
        db.query.projects.findMany({
          where: finalWhere ? () => finalWhere : undefined,
          with: { client: true, projectTypeRel: true, sessions: { orderBy: (s: any, { asc }: any) => [asc(s.sortOrder)] } },
          orderBy: orderFn,
          limit: take,
          offset: skip,
          extras: {
            balanceOwed: balanceSql.as('balance_owed'),
            profit: profitSql.as('profit'),
          },
        }),
        db.select({ total: count() }).from(projects).where(finalWhere),
      ]);

      return { data, count: total };
    }

    const col = projects[orderBy as keyof typeof projects] as any;
    // Push NULLs to the end regardless of sort direction
    const orderFn = orderBy === 'shootStartDate'
      ? asc === 'true'
        ? sql`${col} ASC NULLS LAST`
        : sql`${col} DESC NULLS LAST`
      : asc === 'true' ? ascFn(col) : descFn(col);

    const [data, [{ total }]] = await Promise.all([
      db.query.projects.findMany({
        where: where ? () => where : undefined,
        with: { client: true, projectTypeRel: true, sessions: { orderBy: (s: any, { asc }: any) => [asc(s.sortOrder)] } },
        orderBy: orderFn,
        limit: take,
        offset: skip,
      }),
      db.select({ total: count() }).from(projects).where(where),
    ]);

    return { data, count: total };
  });

  // GET /api/projects/:id
  fastify.get('/:id', async (request: any) => {
    const data = await db.query.projects.findFirst({
      where: eq(projects.id, request.params.id),
      with: {
        client: true,
        projectTypeRel: true,
        quotes: { orderBy: (q: any, { desc }: any) => [desc(q.createdAt)] },
        invoices: { orderBy: (i: any, { desc }: any) => [desc(i.createdAt)], with: { items: { orderBy: (it: any, { asc }: any) => [asc(it.sortOrder)] } } },
        assignments: {
          with: {
            teamMember: {
              with: { user: { columns: { id: true, name: true, email: true, image: true }, with: { profile: { columns: { displayName: true } } } } },
            },
          },
        },
        teamPayments: {
          orderBy: (tp: any, { desc }: any) => [desc(tp.paymentDate)],
          with: {
            teamMember: {
              with: { user: { columns: { id: true, name: true, email: true }, with: { profile: { columns: { displayName: true } } } } },
            },
          },
        },
        expenses: {
          orderBy: (e: any, { desc }: any) => [desc(e.expenseDate)],
          with: { category: true, vendor: true },
        },
        sessions: { orderBy: (s: any, { asc }: any) => [asc(s.sortOrder)] },
      },
    });
    if (!data) throw new Error('Project not found');
    return { data };
  });

  // POST /api/projects
  fastify.post('/', async (request: any) => {
    const clientId = getClientId(request.body) || null;

    const [data] = await db
      .insert(projects)
      .values({
        ...mapProjectBody(request.body),
        clientId,
        userId: request.user.id,
      })
      .returning();

    if (request.body.sessions?.length) {
      await syncSessions(data.id, request.body.sessions);
    }

    logActivity({ ...actorFromRequest(request), action: 'created', entityType: 'project', entityId: data.id, entityLabel: data.title });
    broadcast('project', 'created', request.user.id, data.id);

    // Re-fetch with relations
    const full = await db.query.projects.findFirst({
      where: eq(projects.id, data.id),
      with: { client: true, projectTypeRel: true, sessions: { orderBy: (s: any, { asc }: any) => [asc(s.sortOrder)] } },
    });
    return { data: full };
  });

  // PUT /api/projects/:id
  fastify.put('/:id', async (request: any, reply: any) => {
    const privilegedRoles = ['owner', 'manager'];
    const isPrivileged = privilegedRoles.includes(request.teamRole);

    // Check ownership — privileged can always edit, others need to be creator
    if (!isPrivileged) {
      const [existing] = await db.select({ userId: projects.userId }).from(projects).where(eq(projects.id, request.params.id));
      if (!existing || existing.userId !== request.user.id) {
        return reply.code(403).send({ error: 'You can only edit your own projects' });
      }
    }

    // Only include fields actually sent in the body (partial update)
    const updates: any = { updatedAt: new Date() };
    const b = request.body;
    if ('title' in b) updates.title = b.title || 'Untitled Project';
    if ('description' in b) updates.description = b.description ?? null;
    if ('projectType' in b || 'project_type' in b) updates.projectType = b.projectType || b.project_type || null;
    if ('projectTypeId' in b || 'project_type_id' in b) updates.projectTypeId = b.projectTypeId || b.project_type_id || null;
    if ('status' in b) updates.status = b.status || 'lead';
    if ('shootStartDate' in b || 'shoot_start_date' in b) updates.shootStartDate = parseDateInput(b.shootStartDate || b.shoot_start_date);
    if ('shootEndDate' in b || 'shoot_end_date' in b) updates.shootEndDate = parseDateInput(b.shootEndDate || b.shoot_end_date);
    if ('shootStartTime' in b || 'shoot_start_time' in b) updates.shootStartTime = b.shootStartTime || b.shoot_start_time || null;
    if ('shootEndTime' in b || 'shoot_end_time' in b) updates.shootEndTime = b.shootEndTime || b.shoot_end_time || null;
    if ('deliveryDate' in b || 'delivery_date' in b) updates.deliveryDate = parseDateInput(b.deliveryDate || b.delivery_date);
    if ('location' in b) updates.location = b.location ?? null;
    if ('addressStreet' in b) updates.addressStreet = b.addressStreet ?? null;
    if ('addressCity' in b) updates.addressCity = b.addressCity ?? null;
    if ('addressState' in b) updates.addressState = b.addressState ?? null;
    if ('addressZip' in b) updates.addressZip = b.addressZip ?? null;
    if ('placeId' in b || 'place_id' in b) updates.placeId = b.placeId || b.place_id || null;
    if ('coverPhotoUrl' in b || 'cover_photo_url' in b) updates.coverPhotoUrl = b.coverPhotoUrl || b.cover_photo_url || null;
    if ('projectPrice' in b) updates.projectPrice = b.projectPrice != null ? parseFloat(b.projectPrice) || null : null;

    // Strip status if user lacks edit_project_status permission
    if (!hasPermission(request, 'edit_project_status')) {
      delete updates.status;
    }

    // Allow updating or clearing clientId
    if ('clientId' in b || 'client_id' in b) {
      updates.clientId = getClientId(b) || null;
    }

    const [data] = await db
      .update(projects)
      .set(updates)
      .where(eq(projects.id, request.params.id))
      .returning();

    if ('sessions' in b) {
      await syncSessions(request.params.id, b.sessions || []);
    }

    logActivity({ ...actorFromRequest(request), action: 'updated', entityType: 'project', entityId: data.id, entityLabel: data.title });
    broadcast('project', 'updated', request.user.id, data.id);

    const full = await db.query.projects.findFirst({
      where: eq(projects.id, data.id),
      with: { client: true, projectTypeRel: true, sessions: { orderBy: (s: any, { asc }: any) => [asc(s.sortOrder)] } },
    });
    return { data: full };
  });

  // DELETE /api/projects/:id — soft delete (archive)
  fastify.delete('/:id', async (request: any) => {
    const [existing] = await db
      .select({ title: projects.title })
      .from(projects)
      .where(eq(projects.id, request.params.id));

    const [data] = await db
      .update(projects)
      .set({ status: 'archived', updatedAt: new Date() })
      .where(eq(projects.id, request.params.id))
      .returning();

    if (existing) {
      logActivity({ ...actorFromRequest(request), action: 'archived', entityType: 'project', entityId: request.params.id, entityLabel: existing.title });
      broadcast('project', 'deleted', request.user.id, request.params.id);
    }

    return { data };
  });

  // PUT /api/projects/:id/restore — restore archived project back to completed
  fastify.put('/:id/restore', async (request: any, reply: any) => {
    const [existing] = await db
      .select({ title: projects.title, status: projects.status })
      .from(projects)
      .where(eq(projects.id, request.params.id));

    if (!existing) return reply.code(404).send({ error: 'Not found' });
    if (existing.status !== 'archived') {
      return reply.code(400).send({ error: 'Only archived projects can be restored' });
    }

    const [data] = await db
      .update(projects)
      .set({ status: 'completed', updatedAt: new Date() })
      .where(eq(projects.id, request.params.id))
      .returning();

    logActivity({ ...actorFromRequest(request), action: 'restored', entityType: 'project', entityId: request.params.id, entityLabel: existing.title });
    broadcast('project', 'updated', request.user.id, request.params.id);

    return { data };
  });

  // DELETE /api/projects/:id/permanent — hard delete (must be archived first)
  fastify.delete('/:id/permanent', { preHandler: [requirePermission('delete_projects')] }, async (request: any, reply: any) => {
    const [existing] = await db
      .select({ title: projects.title, status: projects.status })
      .from(projects)
      .where(eq(projects.id, request.params.id));

    if (!existing) return reply.code(404).send({ error: 'Not found' });
    if (existing.status !== 'archived') {
      return reply.code(400).send({ error: 'Project must be archived before it can be permanently deleted' });
    }

    // Cascade: project_notes + project_assignments auto-delete; quotes/invoices/team_payments set projectId=null
    await db.delete(projects).where(eq(projects.id, request.params.id));

    logActivity({ ...actorFromRequest(request), action: 'permanently deleted', entityType: 'project', entityId: request.params.id, entityLabel: existing.title });
    broadcast('project', 'deleted', request.user.id, request.params.id);
    return { success: true };
  });

  // GET /api/projects/:id/notes
  fastify.get('/:id/notes', async (request: any) => {
    const data = await db
      .select()
      .from(projectNotes)
      .where(eq(projectNotes.projectId, request.params.id))
      .orderBy(descFn(projectNotes.createdAt));
    return { data };
  });

  // POST /api/projects/:id/notes
  fastify.post('/:id/notes', async (request: any) => {
    const [data] = await db
      .insert(projectNotes)
      .values({
        projectId: request.params.id,
        content: request.body.content,
        createdBy: request.userDisplayName || request.user.email,
        userId: request.user.id,
      })
      .returning();
    broadcast('project_note', 'created', request.user.id, data.id);
    return { data };
  });

  // PUT /api/projects/:id/notes/:noteId — edit own note
  fastify.put('/:id/notes/:noteId', async (request: any) => {
    const [existing] = await db.select().from(projectNotes).where(eq(projectNotes.id, request.params.noteId));
    if (!existing) return fastify.httpErrors.notFound('Note not found');
    if (existing.userId && existing.userId !== request.user.id) {
      return fastify.httpErrors.forbidden('You can only edit your own notes');
    }
    const [data] = await db
      .update(projectNotes)
      .set({ content: request.body.content, updatedAt: new Date() })
      .where(eq(projectNotes.id, request.params.noteId))
      .returning();
    broadcast('project_note', 'updated', request.user.id, data.id);
    return { data };
  });

  // DELETE /api/projects/:id/notes/:noteId
  fastify.delete('/:id/notes/:noteId', async (request: any) => {
    await db.delete(projectNotes).where(eq(projectNotes.id, request.params.noteId));
    broadcast('project_note', 'deleted', request.user.id, request.params.noteId);
    return { success: true };
  });
}
