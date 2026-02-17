import { db } from '../db';
import { teamSalary, teamMembers, teamPayments, projects, user, profiles } from '../db/schema';
import { eq, and, desc, sum } from 'drizzle-orm';
import { requireSelfOrRole, requirePermission, hasPermission } from '../lib/permissions';
import { logActivity, actorFromRequest } from '../lib/activityLog';
import { parseDateInput } from '../lib/dates';

export default async function teamSalaryRoutes(fastify: any) {
  // GET /api/team-salary — list entries (privileged see all, crew see own)
  fastify.get('/', async (request: any) => {
    const { teamMemberId, type } = request.query;
    const canViewAll = hasPermission(request, 'view_salary') || hasPermission(request, 'manage_salary');

    const conditions: any[] = [];

    if (!canViewAll) {
      if (request.teamMemberId) {
        conditions.push(eq(teamSalary.teamMemberId, request.teamMemberId));
      } else {
        return { data: [] };
      }
    } else {
      if (teamMemberId) conditions.push(eq(teamSalary.teamMemberId, teamMemberId));
    }

    if (type) conditions.push(eq(teamSalary.type, type));

    const where = conditions.length > 0
      ? conditions.length === 1 ? conditions[0] : and(...conditions)
      : undefined;

    const data = await db
      .select({
        id: teamSalary.id,
        teamMemberId: teamSalary.teamMemberId,
        type: teamSalary.type,
        amount: teamSalary.amount,
        description: teamSalary.description,
        entryDate: teamSalary.entryDate,
        periodStart: teamSalary.periodStart,
        periodEnd: teamSalary.periodEnd,
        teamPaymentId: teamSalary.teamPaymentId,
        createdBy: teamSalary.createdBy,
        createdAt: teamSalary.createdAt,
        projectTitle: projects.title,
        memberFirstName: profiles.firstName,
        memberLastName: profiles.lastName,
        memberDisplayName: profiles.displayName,
        memberEmail: user.email,
      })
      .from(teamSalary)
      .leftJoin(teamPayments, eq(teamSalary.teamPaymentId, teamPayments.id))
      .leftJoin(projects, eq(teamPayments.projectId, projects.id))
      .leftJoin(teamMembers, eq(teamSalary.teamMemberId, teamMembers.id))
      .leftJoin(user, eq(teamMembers.userId, user.id))
      .leftJoin(profiles, eq(teamMembers.userId, profiles.id))
      .where(where)
      .orderBy(desc(teamSalary.entryDate));

    return { data };
  });

  // GET /api/team-salary/balance/:teamMemberId — computed balance
  fastify.get('/balance/:teamMemberId', {
    preHandler: [async (request: any, reply: any) => {
      const selfId = request.teamMemberId;
      const paramId = request.params?.teamMemberId;
      if (selfId && paramId && selfId === paramId) return; // self-access
      if (hasPermission(request, 'view_salary') || hasPermission(request, 'manage_salary')) return;
      return reply.code(403).send({ error: 'Forbidden: insufficient permissions' });
    }],
  }, async (request: any) => {
    const { teamMemberId } = request.params;

    const [[{ totalAccrued }], [{ totalPaid }]] = await Promise.all([
      db.select({ totalAccrued: sum(teamSalary.amount) })
        .from(teamSalary)
        .where(and(eq(teamSalary.teamMemberId, teamMemberId), eq(teamSalary.type, 'accrued'))),
      db.select({ totalPaid: sum(teamSalary.amount) })
        .from(teamSalary)
        .where(and(eq(teamSalary.teamMemberId, teamMemberId), eq(teamSalary.type, 'paid'))),
    ]);

    const accrued = parseFloat(totalAccrued as string) || 0;
    const paid = parseFloat(totalPaid as string) || 0;

    return {
      totalAccrued: accrued,
      totalPaid: paid,
      balance: accrued - paid, // positive = company owes member
    };
  });

  // POST /api/team-salary — create entry (owner, manager)
  fastify.post('/', { preHandler: [requirePermission('manage_salary')] }, async (request: any, reply: any) => {
    const { teamMemberId, type, amount, description, entryDate, periodStart, periodEnd, teamPaymentId } = request.body;

    if (!['accrued', 'paid'].includes(type)) {
      return reply.code(400).send({ error: 'Type must be "accrued" or "paid"' });
    }

    const [member] = await db
      .select({ id: teamMembers.id, salaryEnabled: teamMembers.salaryEnabled })
      .from(teamMembers)
      .where(eq(teamMembers.id, teamMemberId));

    if (!member) return reply.code(404).send({ error: 'Team member not found' });
    if (!member.salaryEnabled) {
      return reply.code(400).send({ error: 'Salary not enabled for this team member' });
    }

    const [data] = await db.insert(teamSalary).values({
      teamMemberId,
      type,
      amount,
      description: description || null,
      entryDate: parseDateInput(entryDate) ?? new Date(),
      periodStart: parseDateInput(periodStart),
      periodEnd: parseDateInput(periodEnd),
      teamPaymentId: teamPaymentId || null,
      createdBy: request.user.id,
    }).returning();

    logActivity({
      ...actorFromRequest(request),
      action: type === 'accrued' ? 'recorded salary accrual' : 'recorded salary payment',
      entityType: 'team_salary',
      entityId: data.id,
      entityLabel: `$${amount}`,
    });

    return { data };
  });

  // PUT /api/team-salary/:id — update entry (owner, manager)
  fastify.put('/:id', { preHandler: [requirePermission('manage_salary')] }, async (request: any, reply: any) => {
    const { id } = request.params;
    const { type, amount, description, entryDate, periodStart, periodEnd } = request.body;

    const [existing] = await db.select({ id: teamSalary.id }).from(teamSalary).where(eq(teamSalary.id, id));
    if (!existing) return reply.code(404).send({ error: 'Entry not found' });

    const [data] = await db.update(teamSalary)
      .set({
        ...(type !== undefined && { type }),
        ...(amount !== undefined && { amount }),
        ...(description !== undefined && { description }),
        ...(entryDate !== undefined && { entryDate: parseDateInput(entryDate) ?? new Date() }),
        ...(periodStart !== undefined && { periodStart: parseDateInput(periodStart) }),
        ...(periodEnd !== undefined && { periodEnd: parseDateInput(periodEnd) }),
        updatedAt: new Date(),
      })
      .where(eq(teamSalary.id, id))
      .returning();

    logActivity({ ...actorFromRequest(request), action: 'updated', entityType: 'team_salary', entityId: id });
    return { data };
  });

  // DELETE /api/team-salary/:id — delete entry (owner, manager — since they need to fix auto-accrued entries)
  fastify.delete('/:id', { preHandler: [requirePermission('manage_salary')] }, async (request: any, reply: any) => {
    const { id } = request.params;

    const [existing] = await db.select({ id: teamSalary.id }).from(teamSalary).where(eq(teamSalary.id, id));
    if (!existing) return reply.code(404).send({ error: 'Entry not found' });

    await db.delete(teamSalary).where(eq(teamSalary.id, id));
    logActivity({ ...actorFromRequest(request), action: 'deleted', entityType: 'team_salary', entityId: id });

    return { success: true };
  });
}
