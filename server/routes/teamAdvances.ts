import { db } from '../db';
import { teamAdvances, teamMembers, teamPayments, projects, user, profiles } from '../db/schema';
import { eq, and, desc, sum } from 'drizzle-orm';
import { requireSelfOrRole, requirePermission } from '../lib/permissions';
import { logActivity, actorFromRequest } from '../lib/activityLog';
import { notifyUsers } from '../lib/notifications';
import { parseDateInput } from '../lib/dates';
import { broadcast } from '../lib/pubsub';

export default async function teamAdvanceRoutes(fastify: any) {
  // GET /api/team-advances — list entries (crew filtered to own)
  fastify.get('/', async (request: any) => {
    const { teamMemberId, type } = request.query;
    const isPrivileged = request.teamRole === 'owner' || request.teamRole === 'manager';

    const conditions: any[] = [];

    if (!isPrivileged) {
      if (request.teamMemberId) {
        conditions.push(eq(teamAdvances.teamMemberId, request.teamMemberId));
      } else {
        return { data: [] };
      }
    } else {
      if (teamMemberId) conditions.push(eq(teamAdvances.teamMemberId, teamMemberId));
    }

    if (type) conditions.push(eq(teamAdvances.type, type));

    const where = conditions.length > 0
      ? conditions.length === 1 ? conditions[0] : and(...conditions)
      : undefined;

    const data = await db
      .select({
        id: teamAdvances.id,
        teamMemberId: teamAdvances.teamMemberId,
        type: teamAdvances.type,
        amount: teamAdvances.amount,
        description: teamAdvances.description,
        advanceDate: teamAdvances.advanceDate,
        teamPaymentId: teamAdvances.teamPaymentId,
        createdBy: teamAdvances.createdBy,
        createdAt: teamAdvances.createdAt,
        projectTitle: projects.title,
        memberName: teamMembers.name,
        memberFirstName: profiles.firstName,
        memberLastName: profiles.lastName,
        memberDisplayName: profiles.displayName,
        memberEmail: user.email,
      })
      .from(teamAdvances)
      .leftJoin(teamPayments, eq(teamAdvances.teamPaymentId, teamPayments.id))
      .leftJoin(projects, eq(teamPayments.projectId, projects.id))
      .leftJoin(teamMembers, eq(teamAdvances.teamMemberId, teamMembers.id))
      .leftJoin(user, eq(teamMembers.userId, user.id))
      .leftJoin(profiles, eq(teamMembers.userId, profiles.id))
      .where(where)
      .orderBy(desc(teamAdvances.advanceDate));

    return { data };
  });

  // GET /api/team-advances/balance/:teamMemberId — computed balance
  fastify.get('/balance/:teamMemberId', {
    preHandler: [requireSelfOrRole('teamMemberId', 'owner', 'manager')],
  }, async (request: any) => {
    const { teamMemberId } = request.params;

    const [[{ totalAdvanced }], [{ totalRepaid }]] = await Promise.all([
      db.select({ totalAdvanced: sum(teamAdvances.amount) })
        .from(teamAdvances)
        .where(and(eq(teamAdvances.teamMemberId, teamMemberId), eq(teamAdvances.type, 'advance'))),
      db.select({ totalRepaid: sum(teamAdvances.amount) })
        .from(teamAdvances)
        .where(and(eq(teamAdvances.teamMemberId, teamMemberId), eq(teamAdvances.type, 'repayment'))),
    ]);

    const advanced = parseFloat(totalAdvanced as string) || 0;
    const repaid = parseFloat(totalRepaid as string) || 0;

    return {
      totalAdvanced: advanced,
      totalRepaid: repaid,
      balance: advanced - repaid,
    };
  });

  // POST /api/team-advances — create advance or repayment (owner, manager)
  fastify.post('/', { preHandler: [requirePermission('manage_advances')] }, async (request: any, reply: any) => {
    const { teamMemberId, type, amount, description, advanceDate, teamPaymentId } = request.body;

    if (!['advance', 'repayment'].includes(type)) {
      return reply.code(400).send({ error: 'Type must be "advance" or "repayment"' });
    }

    // Verify team member exists and has advances enabled
    const [member] = await db
      .select({ id: teamMembers.id, userId: teamMembers.userId, advancesEnabled: teamMembers.advancesEnabled })
      .from(teamMembers)
      .where(eq(teamMembers.id, teamMemberId));

    if (!member) return reply.code(404).send({ error: 'Team member not found' });
    if (!member.advancesEnabled) {
      return reply.code(400).send({ error: 'Advances not enabled for this team member' });
    }

    const [data] = await db.insert(teamAdvances).values({
      teamMemberId,
      type,
      amount,
      description,
      advanceDate: parseDateInput(advanceDate) ?? new Date(),
      teamPaymentId: teamPaymentId || null,
      createdBy: request.user.id,
    }).returning();

    logActivity({
      ...actorFromRequest(request),
      action: type === 'advance' ? 'recorded advance' : 'recorded repayment',
      entityType: 'team_advance',
      entityId: data.id,
      entityLabel: `$${amount} — ${description}`,
    });
    broadcast('team_advance', 'created', request.user.id, data.id);

    // Notify team member when a new advance is recorded
    if (type === 'advance') {
      notifyUsers({
        userIds: [member.userId],
        type: 'advance_created',
        title: 'New advance recorded',
        message: `$${Number(amount).toFixed(2)} — ${description}`,
        entityType: 'team_advance',
        entityId: data.id,
      });
    }

    return { data };
  });

  // PUT /api/team-advances/:id — update entry (owner, manager)
  fastify.put('/:id', { preHandler: [requirePermission('manage_advances')] }, async (request: any, reply: any) => {
    const { id } = request.params;
    const { type, amount, description, advanceDate, teamPaymentId } = request.body;

    const [existing] = await db.select({ id: teamAdvances.id }).from(teamAdvances).where(eq(teamAdvances.id, id));
    if (!existing) return reply.code(404).send({ error: 'Entry not found' });

    const [data] = await db.update(teamAdvances)
      .set({
        ...(type !== undefined && { type }),
        ...(amount !== undefined && { amount }),
        ...(description !== undefined && { description }),
        ...(advanceDate !== undefined && { advanceDate: parseDateInput(advanceDate) ?? new Date() }),
        ...(teamPaymentId !== undefined && { teamPaymentId: teamPaymentId || null }),
        updatedAt: new Date(),
      })
      .where(eq(teamAdvances.id, id))
      .returning();

    logActivity({ ...actorFromRequest(request), action: 'updated', entityType: 'team_advance', entityId: id });
    broadcast('team_advance', 'updated', request.user.id, id);
    return { data };
  });

  // DELETE /api/team-advances/:id — delete entry (owner only)
  fastify.delete('/:id', { preHandler: [requirePermission('manage_advances')] }, async (request: any, reply: any) => {
    const { id } = request.params;

    const [existing] = await db.select({ id: teamAdvances.id }).from(teamAdvances).where(eq(teamAdvances.id, id));
    if (!existing) return reply.code(404).send({ error: 'Entry not found' });

    await db.delete(teamAdvances).where(eq(teamAdvances.id, id));
    logActivity({ ...actorFromRequest(request), action: 'deleted', entityType: 'team_advance', entityId: id });
    broadcast('team_advance', 'deleted', request.user.id, id);

    return { success: true };
  });
}
