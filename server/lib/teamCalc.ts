import { db } from '../db';
import { teamPayments, invoices, projects } from '../db/schema';
import { eq, and, sum } from 'drizzle-orm';

/**
 * Recalculate all team financial fields on a project:
 *   teamCost     = SUM(amount) from paid team_payments (actual payments are source of truth)
 *   teamCostPaid = same as teamCost
 *   margin       = totalInvoiceRevenue - teamCost
 */
export async function recalculateProjectTeamFinancials(projectId: string | null) {
  if (!projectId) return;

  // 1. teamCost from paid team_payments
  const [paidResult] = await db
    .select({ total: sum(teamPayments.amount) })
    .from(teamPayments)
    .where(and(eq(teamPayments.projectId, projectId), eq(teamPayments.status, 'paid')));
  const teamCost = parseFloat(paidResult?.total as string) || 0;
  const teamCostPaid = teamCost;

  // 2. invoiceRevenue from all invoices linked to this project
  const [revenueResult] = await db
    .select({ total: sum(invoices.total) })
    .from(invoices)
    .where(eq(invoices.projectId, projectId));
  const invoiceRevenue = parseFloat(revenueResult?.total as string) || 0;

  // 3. margin
  const margin = invoiceRevenue - teamCost;

  // 4. Update project
  await db.update(projects)
    .set({ teamCost, teamCostPaid, margin, updatedAt: new Date() })
    .where(eq(projects.id, projectId));

  return { teamCost, teamCostPaid, margin, invoiceRevenue };
}
