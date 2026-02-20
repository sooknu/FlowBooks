import { db } from '../db';
import { projectAssignments, teamMembers, projects, user, profiles } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { requirePermission } from '../lib/permissions';
import { logActivity, actorFromRequest } from '../lib/activityLog';
import { recalculateProjectTeamFinancials } from '../lib/teamCalc';
import { broadcast } from '../lib/pubsub';

export default async function assignmentRoutes(fastify: any) {
  // GET /api/assignments — list assignments (filtered by role)
  // Owner/manager see all; others see only their own
  fastify.get('/', async (request: any) => {
    const { projectId, teamMemberId } = request.query;
    const isPrivileged = request.teamRole === 'owner' || request.teamRole === 'manager';

    const conditions: any[] = [];
    if (projectId) conditions.push(eq(projectAssignments.projectId, projectId));

    if (!isPrivileged) {
      // Non-privileged users can only see their own assignments
      if (request.teamMemberId) {
        conditions.push(eq(projectAssignments.teamMemberId, request.teamMemberId));
      } else {
        return { data: [] }; // Not a team member, no assignments
      }
    } else if (teamMemberId) {
      conditions.push(eq(projectAssignments.teamMemberId, teamMemberId));
    }

    const where = conditions.length > 0
      ? conditions.length === 1 ? conditions[0] : and(...conditions)
      : undefined;

    const data = await db
      .select({
        id: projectAssignments.id,
        projectId: projectAssignments.projectId,
        teamMemberId: projectAssignments.teamMemberId,
        role: projectAssignments.role,
        hoursWorked: projectAssignments.hoursWorked,
        daysWorked: projectAssignments.daysWorked,
        notes: projectAssignments.notes,
        createdAt: projectAssignments.createdAt,
        projectTitle: projects.title,
        projectStatus: projects.status,
        memberFirstName: profiles.firstName,
        memberLastName: profiles.lastName,
        memberDisplayName: profiles.displayName,
        memberEmail: user.email,
      })
      .from(projectAssignments)
      .leftJoin(projects, eq(projectAssignments.projectId, projects.id))
      .leftJoin(teamMembers, eq(projectAssignments.teamMemberId, teamMembers.id))
      .leftJoin(user, eq(teamMembers.userId, user.id))
      .leftJoin(profiles, eq(teamMembers.userId, profiles.id))
      .where(where);

    return { data };
  });

  // POST /api/assignments — assign team member to project (owner, manager)
  fastify.post('/', { preHandler: [requirePermission('manage_assignments')] }, async (request: any, reply: any) => {
    const { projectId, teamMemberId, role, hoursWorked, daysWorked, notes } = request.body;

    // Verify project exists
    const [project] = await db.select({ id: projects.id, title: projects.title }).from(projects).where(eq(projects.id, projectId));
    if (!project) return reply.code(404).send({ error: 'Project not found' });

    // Verify team member exists
    const [member] = await db.select({ id: teamMembers.id, role: teamMembers.role }).from(teamMembers).where(eq(teamMembers.id, teamMemberId));
    if (!member) return reply.code(404).send({ error: 'Team member not found' });

    const [data] = await db.insert(projectAssignments).values({
      projectId,
      teamMemberId,
      role: role || member.role,
      hoursWorked: hoursWorked || null,
      daysWorked: daysWorked || null,
      notes: notes || null,
    }).returning();

    await recalculateProjectTeamFinancials(projectId);
    logActivity({ ...actorFromRequest(request), action: 'created', entityType: 'project_assignment', entityId: data.id, entityLabel: project.title });
    broadcast('project_assignment', 'created', request.user.id, data.id);

    return { data };
  });

  // PUT /api/assignments/:id — update assignment (owner, manager)
  fastify.put('/:id', { preHandler: [requirePermission('manage_assignments')] }, async (request: any, reply: any) => {
    const { id } = request.params;
    const { role, hoursWorked, daysWorked, notes } = request.body;

    const [existing] = await db.select({ id: projectAssignments.id, projectId: projectAssignments.projectId }).from(projectAssignments).where(eq(projectAssignments.id, id));
    if (!existing) return reply.code(404).send({ error: 'Assignment not found' });

    const [data] = await db.update(projectAssignments)
      .set({
        ...(role !== undefined && { role }),
        ...(hoursWorked !== undefined && { hoursWorked }),
        ...(daysWorked !== undefined && { daysWorked }),
        ...(notes !== undefined && { notes }),
        updatedAt: new Date(),
      })
      .where(eq(projectAssignments.id, id))
      .returning();

    await recalculateProjectTeamFinancials(existing.projectId);
    logActivity({ ...actorFromRequest(request), action: 'updated', entityType: 'project_assignment', entityId: id });
    broadcast('project_assignment', 'updated', request.user.id, id);

    return { data };
  });

  // DELETE /api/assignments/:id — remove assignment (owner, manager)
  fastify.delete('/:id', { preHandler: [requirePermission('manage_assignments')] }, async (request: any, reply: any) => {
    const { id } = request.params;

    const [existing] = await db.select({ id: projectAssignments.id, projectId: projectAssignments.projectId }).from(projectAssignments).where(eq(projectAssignments.id, id));
    if (!existing) return reply.code(404).send({ error: 'Assignment not found' });

    await db.delete(projectAssignments).where(eq(projectAssignments.id, id));

    await recalculateProjectTeamFinancials(existing.projectId);
    logActivity({ ...actorFromRequest(request), action: 'deleted', entityType: 'project_assignment', entityId: id });
    broadcast('project_assignment', 'deleted', request.user.id, id);

    return { success: true };
  });
}
