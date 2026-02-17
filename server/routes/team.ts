import { db } from '../db';
import { teamMembers, user, profiles, projectAssignments, projects } from '../db/schema';
import { eq, asc, isNull } from 'drizzle-orm';
import { requireRole, requireSelfOrRole, requirePermission, clearRoleCache } from '../lib/permissions';
import { logActivity, actorFromRequest } from '../lib/activityLog';

export default async function teamRoutes(fastify: any) {
  // GET /api/team — list all team members (owner, manager)
  fastify.get('/', { preHandler: [requirePermission('view_team')] }, async () => {
    const data = await db
      .select({
        id: teamMembers.id,
        userId: teamMembers.userId,
        name: teamMembers.name,
        role: teamMembers.role,
        paymentMethod: teamMembers.paymentMethod,
        isActive: teamMembers.isActive,
        notes: teamMembers.notes,
        createdAt: teamMembers.createdAt,
        updatedAt: teamMembers.updatedAt,
        advancesEnabled: teamMembers.advancesEnabled,
        salaryEnabled: teamMembers.salaryEnabled,
        weeklySalary: teamMembers.weeklySalary,
        userName: user.name,
        userEmail: user.email,
        userImage: user.image,
        firstName: profiles.firstName,
        lastName: profiles.lastName,
        displayName: profiles.displayName,
        avatarUrl: profiles.avatarUrl,
      })
      .from(teamMembers)
      .leftJoin(user, eq(teamMembers.userId, user.id))
      .leftJoin(profiles, eq(teamMembers.userId, profiles.id))
      .orderBy(asc(teamMembers.role));

    return { data };
  });

  // GET /api/team/unlinked — list team members without a user account
  fastify.get('/unlinked', { preHandler: [requirePermission('manage_team_members')] }, async () => {
    const data = await db
      .select({ id: teamMembers.id, name: teamMembers.name, role: teamMembers.role })
      .from(teamMembers)
      .where(isNull(teamMembers.userId))
      .orderBy(asc(teamMembers.name));
    return { data };
  });

  // GET /api/team/me — get own team membership (any authenticated user)
  fastify.get('/me', async (request: any) => {
    if (!request.user?.id) return { data: null };
    const [data] = await db
      .select()
      .from(teamMembers)
      .where(eq(teamMembers.userId, request.user.id));
    return { data: data || null };
  });

  // GET /api/team/:id — get single team member + assignments (self or owner/manager)
  fastify.get('/:id', { preHandler: [requireSelfOrRole('id', 'owner', 'manager')] }, async (request: any, reply: any) => {
    const { id } = request.params;
    const [member] = await db
      .select({
        id: teamMembers.id,
        userId: teamMembers.userId,
        name: teamMembers.name,
        role: teamMembers.role,
        paymentMethod: teamMembers.paymentMethod,
        isActive: teamMembers.isActive,
        notes: teamMembers.notes,
        createdAt: teamMembers.createdAt,
        updatedAt: teamMembers.updatedAt,
        advancesEnabled: teamMembers.advancesEnabled,
        salaryEnabled: teamMembers.salaryEnabled,
        weeklySalary: teamMembers.weeklySalary,
        userName: user.name,
        userEmail: user.email,
        userImage: user.image,
        firstName: profiles.firstName,
        lastName: profiles.lastName,
        displayName: profiles.displayName,
        avatarUrl: profiles.avatarUrl,
      })
      .from(teamMembers)
      .leftJoin(user, eq(teamMembers.userId, user.id))
      .leftJoin(profiles, eq(teamMembers.userId, profiles.id))
      .where(eq(teamMembers.id, id));

    if (!member) return reply.code(404).send({ error: 'Team member not found' });

    const assignments = await db
      .select({
        id: projectAssignments.id,
        projectId: projectAssignments.projectId,
        role: projectAssignments.role,
        hoursWorked: projectAssignments.hoursWorked,
        daysWorked: projectAssignments.daysWorked,
        notes: projectAssignments.notes,
        projectTitle: projects.title,
        projectStatus: projects.status,
      })
      .from(projectAssignments)
      .leftJoin(projects, eq(projectAssignments.projectId, projects.id))
      .where(eq(projectAssignments.teamMemberId, id));

    return { data: { ...member, assignments } };
  });

  // POST /api/team — add team member
  fastify.post('/', { preHandler: [requirePermission('manage_team_members')] }, async (request: any, reply: any) => {
    const { userId, name, role, paymentMethod, notes } = request.body;

    if (userId) {
      // Linked member — verify user exists
      const [existingUser] = await db.select({ id: user.id, name: user.name }).from(user).where(eq(user.id, userId));
      if (!existingUser) return reply.code(404).send({ error: 'User not found' });

      // Check for existing team membership
      const [existing] = await db.select({ id: teamMembers.id }).from(teamMembers).where(eq(teamMembers.userId, userId));
      if (existing) return reply.code(409).send({ error: 'User is already a team member' });

      const [data] = await db.insert(teamMembers).values({
        userId,
        name: name || existingUser.name || null,
        role,
        paymentMethod: paymentMethod || null,
        notes: notes || null,
      }).returning();

      clearRoleCache(userId);
      logActivity({ ...actorFromRequest(request), action: 'created', entityType: 'team_member', entityId: data.id, entityLabel: existingUser.name || name || userId });
      return { data };
    } else {
      // Unlinked member — name required
      if (!name || !name.trim()) return reply.code(400).send({ error: 'Name is required for team members without a user account' });

      const [data] = await db.insert(teamMembers).values({
        name: name.trim(),
        role,
        paymentMethod: paymentMethod || null,
        notes: notes || null,
      }).returning();

      logActivity({ ...actorFromRequest(request), action: 'created', entityType: 'team_member', entityId: data.id, entityLabel: name.trim() });
      return { data };
    }
  });

  // PUT /api/team/:id — update team member
  fastify.put('/:id', { preHandler: [requirePermission('manage_team_members')] }, async (request: any, reply: any) => {
    const { id } = request.params;
    const { role, name, userId, paymentMethod, isActive, notes, advancesEnabled, salaryEnabled, weeklySalary } = request.body;

    const [existing] = await db.select({ userId: teamMembers.userId }).from(teamMembers).where(eq(teamMembers.id, id));
    if (!existing) return reply.code(404).send({ error: 'Team member not found' });

    // If linking a user to an unlinked member
    const updates: any = {
      ...(role !== undefined && { role }),
      ...(name !== undefined && { name }),
      ...(paymentMethod !== undefined && { paymentMethod }),
      ...(isActive !== undefined && { isActive }),
      ...(notes !== undefined && { notes }),
      ...(advancesEnabled !== undefined && { advancesEnabled }),
      ...(salaryEnabled !== undefined && { salaryEnabled }),
      ...(weeklySalary !== undefined && { weeklySalary }),
      updatedAt: new Date(),
    };

    // Allow linking/unlinking user
    if (userId !== undefined) {
      if (userId) {
        // Verify user isn't already linked to another team member
        const [existingLink] = await db.select({ id: teamMembers.id }).from(teamMembers).where(eq(teamMembers.userId, userId));
        if (existingLink && existingLink.id !== id) {
          return reply.code(409).send({ error: 'User is already linked to another team member' });
        }
        updates.userId = userId;
      } else {
        updates.userId = null;
      }
    }

    const [data] = await db.update(teamMembers)
      .set(updates)
      .where(eq(teamMembers.id, id))
      .returning();

    if (existing.userId) clearRoleCache(existing.userId);
    if (data.userId && data.userId !== existing.userId) clearRoleCache(data.userId);
    logActivity({ ...actorFromRequest(request), action: 'updated', entityType: 'team_member', entityId: id, entityLabel: data.name || data.role });

    return { data };
  });

  // DELETE /api/team/:id — remove team membership (owner only)
  fastify.delete('/:id', { preHandler: [requirePermission('manage_team_members')] }, async (request: any, reply: any) => {
    const { id } = request.params;

    const [existing] = await db.select({ userId: teamMembers.userId }).from(teamMembers).where(eq(teamMembers.id, id));
    if (!existing) return reply.code(404).send({ error: 'Team member not found' });

    await db.delete(teamMembers).where(eq(teamMembers.id, id));

    if (existing.userId) clearRoleCache(existing.userId);
    logActivity({ ...actorFromRequest(request), action: 'deleted', entityType: 'team_member', entityId: id });

    return { success: true };
  });
}
