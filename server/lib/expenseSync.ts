import { db } from '../db';
import { expenses, expenseCategories, teamPayments, teamMembers, user, profiles } from '../db/schema';
import { eq, and, isNull } from 'drizzle-orm';

const TEAM_PAYMENTS_CATEGORY_NAME = 'Team Payments';
const TEAM_PAYMENTS_CATEGORY_COLOR = 'teal';

async function getOrCreateTeamPaymentsCategory(userId: string): Promise<string> {
  const [existing] = await db
    .select({ id: expenseCategories.id })
    .from(expenseCategories)
    .where(eq(expenseCategories.name, TEAM_PAYMENTS_CATEGORY_NAME))
    .limit(1);

  if (existing) return existing.id;

  const [created] = await db
    .insert(expenseCategories)
    .values({
      userId,
      name: TEAM_PAYMENTS_CATEGORY_NAME,
      color: TEAM_PAYMENTS_CATEGORY_COLOR,
      sortOrder: 999,
    })
    .returning();

  return created.id;
}

async function getTeamMemberName(teamMemberId: string): Promise<string> {
  const [member] = await db
    .select({
      name: teamMembers.name,
      firstName: profiles.firstName,
      lastName: profiles.lastName,
      displayName: profiles.displayName,
      email: user.email,
    })
    .from(teamMembers)
    .leftJoin(user, eq(teamMembers.userId, user.id))
    .leftJoin(profiles, eq(teamMembers.userId, profiles.id))
    .where(eq(teamMembers.id, teamMemberId));

  if (!member) return 'Unknown';
  return (
    member.displayName ||
    [member.firstName, member.lastName].filter(Boolean).join(' ') ||
    member.name ||
    member.email ||
    'Unknown'
  );
}

export async function syncTeamPaymentExpense(
  teamPaymentId: string,
  data: {
    teamMemberId: string;
    projectId: string | null;
    amount: number;
    paymentDate: Date;
    notes: string | null;
    status: string;
    userId: string;
  },
): Promise<void> {
  const categoryId = await getOrCreateTeamPaymentsCategory(data.userId);
  const memberName = await getTeamMemberName(data.teamMemberId);
  const description = `Payment to ${memberName}`;

  const [existingExpense] = await db
    .select({ id: expenses.id })
    .from(expenses)
    .where(eq(expenses.teamPaymentId, teamPaymentId));

  // Only create/keep expense for paid payments — pending shouldn't affect financials
  if (data.status !== 'paid') {
    if (existingExpense) {
      await db.delete(expenses).where(eq(expenses.id, existingExpense.id));
    }
    return;
  }

  const expenseData = {
    categoryId,
    projectId: data.projectId,
    description,
    amount: data.amount,
    expenseDate: data.paymentDate,
    notes: data.notes,
    updatedAt: new Date(),
  };

  if (existingExpense) {
    await db
      .update(expenses)
      .set(expenseData)
      .where(eq(expenses.id, existingExpense.id));
  } else {
    await db.insert(expenses).values({
      ...expenseData,
      userId: data.userId,
      teamPaymentId,
    });
  }
}

export async function getLinkedTeamPaymentId(expenseId: string): Promise<string | null> {
  const [expense] = await db
    .select({ teamPaymentId: expenses.teamPaymentId })
    .from(expenses)
    .where(eq(expenses.id, expenseId));
  return expense?.teamPaymentId || null;
}

export async function backfillTeamPaymentExpenses(userId: string): Promise<number> {
  // Find team payments with no linked expense
  const unlinked = await db
    .select({
      id: teamPayments.id,
      teamMemberId: teamPayments.teamMemberId,
      projectId: teamPayments.projectId,
      amount: teamPayments.amount,
      paymentDate: teamPayments.paymentDate,
      notes: teamPayments.notes,
      status: teamPayments.status,
    })
    .from(teamPayments)
    .leftJoin(expenses, eq(expenses.teamPaymentId, teamPayments.id))
    .where(isNull(expenses.id));

  for (const tp of unlinked) {
    await syncTeamPaymentExpense(tp.id, {
      teamMemberId: tp.teamMemberId,
      projectId: tp.projectId,
      amount: tp.amount,
      paymentDate: tp.paymentDate,
      notes: tp.notes,
      status: tp.status,
      userId,
    });
  }

  return unlinked.length;
}
