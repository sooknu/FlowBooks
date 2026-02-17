import Stripe from 'stripe';
import { db } from '../db';
import { appSettings, payments, invoices, projects } from '../db/schema';
import { eq, inArray } from 'drizzle-orm';
import { logActivity } from './activityLog';
import { recalculateProjectTeamFinancials } from './teamCalc';

export async function getStripeInstance(): Promise<Stripe> {
  const rows = await db
    .select({ key: appSettings.key, value: appSettings.value })
    .from(appSettings)
    .where(inArray(appSettings.key, ['stripe_secret_key', 'stripe_test_secret_key', 'stripe_test_mode']));
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;

  const isTestMode = map.stripe_test_mode === 'true';
  const secretKey = isTestMode ? map.stripe_test_secret_key : map.stripe_secret_key;
  if (!secretKey) throw new Error(isTestMode ? 'Stripe test secret key is not configured' : 'Stripe is not configured');
  return new Stripe(secretKey);
}

export async function recalculateInvoice(invoiceId: string) {
  const allPayments = await db.select().from(payments).where(eq(payments.invoiceId, invoiceId));
  const totalPaid = allPayments.reduce((s, p) => s + p.amount, 0);

  const [inv] = await db.select({ total: invoices.total, projectId: invoices.projectId }).from(invoices).where(eq(invoices.id, invoiceId));
  let status: 'pending' | 'partial' | 'paid' = 'pending';
  if (totalPaid >= inv.total) status = 'paid';
  else if (totalPaid > 0) status = 'partial';

  await db.update(invoices).set({ paidAmount: totalPaid, status, updatedAt: new Date() }).where(eq(invoices.id, invoiceId));

  // Recalculate project margin when invoice payment status changes
  recalculateProjectTeamFinancials(inv.projectId);

  // If fully refunded (zero payments), revert linked project from 'booked' → 'lead'
  if (totalPaid === 0) {
    await revertProjectIfUnpaid(invoiceId);
  }
}

/**
 * After a payment is recorded and invoice recalculated, check if the deposit
 * threshold has been met. If so, transition the linked project from 'lead' → 'booked'.
 */
export async function checkDepositAndBookProject(invoiceId: string) {
  const [inv] = await db
    .select({
      projectId: invoices.projectId,
      depositAmount: invoices.depositAmount,
      paidAmount: invoices.paidAmount,
    })
    .from(invoices)
    .where(eq(invoices.id, invoiceId));

  if (!inv?.projectId) return;

  const [project] = await db
    .select({ status: projects.status })
    .from(projects)
    .where(eq(projects.id, inv.projectId));

  if (!project || project.status !== 'lead') return;

  const depositMet = inv.depositAmount && inv.depositAmount > 0
    ? (inv.paidAmount || 0) >= inv.depositAmount
    : (inv.paidAmount || 0) > 0;

  if (depositMet) {
    await db.update(projects)
      .set({ status: 'booked', updatedAt: new Date() })
      .where(eq(projects.id, inv.projectId));

    logActivity({
      userId: 'system',
      userDisplayName: 'Auto-Booking',
      action: 'updated',
      entityType: 'project',
      entityId: inv.projectId,
      entityLabel: 'Project auto-booked (deposit received)',
    });
  }
}

/**
 * Reverse of checkDepositAndBookProject: if all payments are removed from an
 * invoice linked to a project that was auto-booked, revert it to 'lead'.
 */
export async function revertProjectIfUnpaid(invoiceId: string) {
  const [inv] = await db
    .select({ projectId: invoices.projectId, paidAmount: invoices.paidAmount })
    .from(invoices)
    .where(eq(invoices.id, invoiceId));

  if (!inv?.projectId || (inv.paidAmount || 0) > 0) return;

  const [project] = await db
    .select({ status: projects.status })
    .from(projects)
    .where(eq(projects.id, inv.projectId));

  // Only revert if the project is still in 'booked' (the auto-set status)
  if (!project || project.status !== 'booked') return;

  await db.update(projects)
    .set({ status: 'lead', updatedAt: new Date() })
    .where(eq(projects.id, inv.projectId));

  logActivity({
    userId: 'system',
    userDisplayName: 'Auto-Status',
    action: 'updated',
    entityType: 'project',
    entityId: inv.projectId,
    entityLabel: 'Project reverted to lead (all payments removed)',
  });
}

/**
 * Archive a project linked to a deleted invoice.
 */
export async function archiveProjectForDeletedInvoice(projectId: string) {
  const [project] = await db
    .select({ status: projects.status })
    .from(projects)
    .where(eq(projects.id, projectId));

  if (!project || project.status === 'archived') return;

  await db.update(projects)
    .set({ status: 'archived', updatedAt: new Date() })
    .where(eq(projects.id, projectId));

  logActivity({
    userId: 'system',
    userDisplayName: 'Auto-Status',
    action: 'updated',
    entityType: 'project',
    entityId: projectId,
    entityLabel: 'Project archived (linked invoice deleted)',
  });
}

export function docLabel(invoiceNumber: number | null): string {
  return invoiceNumber ? 'Invoice #' + String(invoiceNumber).padStart(5, '0') : '';
}
