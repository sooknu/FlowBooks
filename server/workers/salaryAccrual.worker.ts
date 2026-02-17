import type { Job } from 'bullmq';
import { db } from '../db';
import { teamSalary, teamMembers } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { notifyUsers } from '../lib/notifications';

function getWeekRange(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  // Monday of this week
  const day = d.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMonday);
  // Sunday
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: monday, end: sunday };
}

function formatDate(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export async function processSalaryAccrualJob(job: Job) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { start: periodStart, end: periodEnd } = getWeekRange(today);

  // Find all members with salary enabled and weekly salary set
  const members = await db
    .select({
      id: teamMembers.id,
      userId: teamMembers.userId,
      weeklySalary: teamMembers.weeklySalary,
    })
    .from(teamMembers)
    .where(and(
      eq(teamMembers.salaryEnabled, true),
      eq(teamMembers.isActive, true),
    ));

  let generated = 0;

  for (const member of members) {
    if (!member.weeklySalary || member.weeklySalary <= 0) continue;

    // Idempotency: check if an 'accrued' entry already exists for this period
    const [existing] = await db
      .select({ id: teamSalary.id })
      .from(teamSalary)
      .where(and(
        eq(teamSalary.teamMemberId, member.id),
        eq(teamSalary.type, 'accrued'),
        eq(teamSalary.periodStart, periodStart),
      ))
      .limit(1);

    if (existing) continue;

    const description = `Weekly salary — ${formatDate(periodStart)} to ${formatDate(periodEnd)}`;

    await db.insert(teamSalary).values({
      teamMemberId: member.id,
      type: 'accrued',
      amount: member.weeklySalary,
      description,
      entryDate: today,
      periodStart,
      periodEnd,
    });

    // Notify the team member
    notifyUsers({
      userIds: [member.userId],
      type: 'salary_accrued',
      title: 'Salary accrued',
      message: `$${member.weeklySalary.toFixed(2)} — ${formatDate(periodStart)} to ${formatDate(periodEnd)}`,
      entityType: 'team_salary',
    });

    generated++;
  }

  console.log(`[salary-accrual] Processed ${members.length} members, generated ${generated} accruals`);
  return { processed: members.length, generated };
}
