import { db } from '../db';
import { teamPayments, teamMembers, teamAdvances, teamSalary, projects, user, profiles } from '../db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { requirePermission } from '../lib/permissions';
import { logActivity, actorFromRequest } from '../lib/activityLog';
import { recalculateProjectTeamFinancials } from '../lib/teamCalc';
import { syncTeamPaymentExpense } from '../lib/expenseSync';
import { parseDateInput } from '../lib/dates';
import { broadcast } from '../lib/pubsub';

export default async function teamPaymentRoutes(fastify: any) {
  // GET /api/team-payments — list payments (filtered by role)
  fastify.get('/', async (request: any) => {
    const { teamMemberId, projectId, status } = request.query;
    const isPrivileged = request.teamRole === 'owner' || request.teamRole === 'manager';

    const conditions: any[] = [];

    if (!isPrivileged) {
      if (request.teamMemberId) {
        conditions.push(eq(teamPayments.teamMemberId, request.teamMemberId));
      } else {
        return { data: [] };
      }
    } else {
      if (teamMemberId) conditions.push(eq(teamPayments.teamMemberId, teamMemberId));
    }

    if (projectId) conditions.push(eq(teamPayments.projectId, projectId));
    if (status) conditions.push(eq(teamPayments.status, status));

    const where = conditions.length > 0
      ? conditions.length === 1 ? conditions[0] : and(...conditions)
      : undefined;

    const data = await db
      .select({
        id: teamPayments.id,
        teamMemberId: teamPayments.teamMemberId,
        projectId: teamPayments.projectId,
        amount: teamPayments.amount,
        paymentDate: teamPayments.paymentDate,
        paymentMethod: teamPayments.paymentMethod,
        status: teamPayments.status,
        notes: teamPayments.notes,
        paidBy: teamPayments.paidBy,
        createdAt: teamPayments.createdAt,
        projectTitle: projects.title,
        memberName: teamMembers.name,
        memberFirstName: profiles.firstName,
        memberLastName: profiles.lastName,
        memberDisplayName: profiles.displayName,
        memberEmail: user.email,
      })
      .from(teamPayments)
      .leftJoin(projects, eq(teamPayments.projectId, projects.id))
      .leftJoin(teamMembers, eq(teamPayments.teamMemberId, teamMembers.id))
      .leftJoin(user, eq(teamMembers.userId, user.id))
      .leftJoin(profiles, eq(teamMembers.userId, profiles.id))
      .where(where)
      .orderBy(desc(teamPayments.paymentDate));

    return { data };
  });

  // POST /api/team-payments — record payment (owner, manager)
  fastify.post('/', { preHandler: [requirePermission('manage_team_payments')] }, async (request: any, reply: any) => {
    const { teamMemberId, projectId, amount, paymentDate, paymentMethod, status, notes, advanceRepayment, salaryDeduction } = request.body;

    // Verify team member exists
    const [member] = await db.select({ id: teamMembers.id }).from(teamMembers).where(eq(teamMembers.id, teamMemberId));
    if (!member) return reply.code(404).send({ error: 'Team member not found' });

    // Verify project if provided
    if (projectId) {
      const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId));
      if (!project) return reply.code(404).send({ error: 'Project not found' });
    }

    const [data] = await db.insert(teamPayments).values({
      teamMemberId,
      projectId: projectId || null,
      amount,
      paymentDate: parseDateInput(paymentDate) ?? new Date(),
      paymentMethod: paymentMethod || null,
      status: status || 'pending',
      notes: notes || null,
      paidBy: request.user.id,
    }).returning();

    await recalculateProjectTeamFinancials(data.projectId);
    logActivity({ ...actorFromRequest(request), action: 'created', entityType: 'team_payment', entityId: data.id, entityLabel: `$${amount}` });
    broadcast('team_payment', 'created', request.user.id, data.id);

    await syncTeamPaymentExpense(data.id, {
      teamMemberId,
      projectId: data.projectId,
      amount: data.amount,
      paymentDate: data.paymentDate,
      notes: data.notes,
      status: data.status,
      userId: request.user.id,
    });

    // Auto-create repayment entry if advanceRepayment > 0
    if (advanceRepayment && Number(advanceRepayment) > 0) {
      const [member] = await db.select({ advancesEnabled: teamMembers.advancesEnabled })
        .from(teamMembers).where(eq(teamMembers.id, teamMemberId));

      if (member?.advancesEnabled) {
        await db.insert(teamAdvances).values({
          teamMemberId,
          type: 'repayment',
          amount: Number(advanceRepayment),
          description: `Deducted from team payment${notes ? ' — ' + notes : ''}`,
          advanceDate: data.paymentDate,
          teamPaymentId: data.id,
          createdBy: request.user.id,
        });
      }
    }

    // Auto-create salary paid entry if salaryDeduction > 0
    if (salaryDeduction && Number(salaryDeduction) > 0) {
      const [salaryMember] = await db.select({ salaryEnabled: teamMembers.salaryEnabled })
        .from(teamMembers).where(eq(teamMembers.id, teamMemberId));

      if (salaryMember?.salaryEnabled) {
        await db.insert(teamSalary).values({
          teamMemberId,
          type: 'paid',
          amount: Number(salaryDeduction),
          description: `Deducted from team payment${notes ? ' — ' + notes : ''}`,
          entryDate: data.paymentDate,
          teamPaymentId: data.id,
          createdBy: request.user.id,
        });
      }
    }

    return { data };
  });

  // PUT /api/team-payments/:id — update payment (owner, manager)
  fastify.put('/:id', { preHandler: [requirePermission('manage_team_payments')] }, async (request: any, reply: any) => {
    const { id } = request.params;
    const { teamMemberId, projectId, amount, paymentDate, paymentMethod, status, notes } = request.body;

    const [existing] = await db.select({ id: teamPayments.id, projectId: teamPayments.projectId }).from(teamPayments).where(eq(teamPayments.id, id));
    if (!existing) return reply.code(404).send({ error: 'Payment not found' });

    const [data] = await db.update(teamPayments)
      .set({
        ...(teamMemberId !== undefined && { teamMemberId }),
        ...(projectId !== undefined && { projectId: projectId || null }),
        ...(amount !== undefined && { amount }),
        ...(paymentDate !== undefined && { paymentDate: parseDateInput(paymentDate) ?? new Date() }),
        ...(paymentMethod !== undefined && { paymentMethod }),
        ...(status !== undefined && { status }),
        ...(notes !== undefined && { notes }),
        updatedAt: new Date(),
      })
      .where(eq(teamPayments.id, id))
      .returning();

    // Recalculate for both old and new project if changed
    await recalculateProjectTeamFinancials(data.projectId);
    if (existing.projectId && existing.projectId !== data.projectId) {
      await recalculateProjectTeamFinancials(existing.projectId);
    }

    logActivity({ ...actorFromRequest(request), action: 'updated', entityType: 'team_payment', entityId: id });
    broadcast('team_payment', 'updated', request.user.id, id);

    await syncTeamPaymentExpense(data.id, {
      teamMemberId: data.teamMemberId,
      projectId: data.projectId,
      amount: data.amount,
      paymentDate: data.paymentDate,
      notes: data.notes,
      status: data.status,
      userId: request.user.id,
    });

    return { data };
  });

  // DELETE /api/team-payments/:id — delete payment (owner only)
  fastify.delete('/:id', { preHandler: [requirePermission('delete_team_payments')] }, async (request: any, reply: any) => {
    const { id } = request.params;

    const [existing] = await db.select({ id: teamPayments.id, projectId: teamPayments.projectId }).from(teamPayments).where(eq(teamPayments.id, id));
    if (!existing) return reply.code(404).send({ error: 'Payment not found' });

    await db.delete(teamPayments).where(eq(teamPayments.id, id));

    await recalculateProjectTeamFinancials(existing.projectId);
    logActivity({ ...actorFromRequest(request), action: 'deleted', entityType: 'team_payment', entityId: id });
    broadcast('team_payment', 'deleted', request.user.id, id);

    return { success: true };
  });
}
