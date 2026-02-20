import { db } from '../db';
import { payments, invoices } from '../db/schema';
import { eq } from 'drizzle-orm';
import { logActivity, actorFromRequest } from '../lib/activityLog';
import { checkDepositAndBookProject, revertProjectIfUnpaid } from '../lib/stripe';
import { notifyUsers, getPrivilegedUserIds } from '../lib/notifications';
import { recalculateProjectTeamFinancials } from '../lib/teamCalc';
import { parseDateInput } from '../lib/dates';
import { broadcast } from '../lib/pubsub';

export default async function paymentRoutes(fastify: any) {
  // POST /api/payments
  fastify.post('/', async (request: any) => {
    const { invoiceId, amount, method, paymentDate } = request.body;

    const [payment] = await db
      .insert(payments)
      .values({
        invoiceId,
        amount: parseFloat(amount),
        method: method || 'Cash',
        paymentDate: parseDateInput(paymentDate) ?? new Date(),
      })
      .returning();

    // Recalculate invoice paid_amount and status
    const allPayments = await db
      .select()
      .from(payments)
      .where(eq(payments.invoiceId, invoiceId));
    const totalPaid = allPayments.reduce((s, p) => s + p.amount, 0);

    const [inv] = await db
      .select({ total: invoices.total, projectId: invoices.projectId })
      .from(invoices)
      .where(eq(invoices.id, invoiceId));

    let status: 'pending' | 'partial' | 'paid' = 'pending';
    if (totalPaid >= inv.total) {
      status = 'paid';
    } else if (totalPaid > 0) {
      status = 'partial';
    }

    await db
      .update(invoices)
      .set({ paidAmount: totalPaid, status, updatedAt: new Date() })
      .where(eq(invoices.id, invoiceId));

    await checkDepositAndBookProject(invoiceId);
    recalculateProjectTeamFinancials(inv.projectId);

    const [parentInv] = await db.select({ invoiceNumber: invoices.invoiceNumber, clientName: invoices.clientName }).from(invoices).where(eq(invoices.id, invoiceId));
    const invLabel = parentInv ? 'Invoice #' + String(parentInv.invoiceNumber).padStart(5, '0') : '';
    logActivity({ ...actorFromRequest(request), action: 'created', entityType: 'payment', entityId: payment.id, entityLabel: `$${parseFloat(amount).toFixed(2)} for ${invLabel}` });
    broadcast('payment', 'created', request.user.id, payment.id);

    const privilegedIds = await getPrivilegedUserIds();
    notifyUsers({
      userIds: privilegedIds,
      type: 'payment_received',
      title: 'Payment Received',
      message: `${parentInv?.clientName || 'Client'} paid $${parseFloat(amount).toFixed(2)} on ${invLabel}`,
      entityType: 'invoice',
      entityId: invoiceId,
    });

    return { data: payment };
  });

  // DELETE /api/payments/:id
  fastify.delete('/:id', async (request: any, reply: any) => {
    const [payment] = await db
      .select()
      .from(payments)
      .where(eq(payments.id, request.params.id));
    if (!payment) throw new Error('Payment not found');

    const { invoiceId } = payment;
    await db.delete(payments).where(eq(payments.id, request.params.id));

    // Recalculate invoice paid_amount and status
    const remainingPayments = await db
      .select()
      .from(payments)
      .where(eq(payments.invoiceId, invoiceId));
    const totalPaid = remainingPayments.reduce((s, p) => s + p.amount, 0);

    const [inv] = await db
      .select({ total: invoices.total, projectId: invoices.projectId })
      .from(invoices)
      .where(eq(invoices.id, invoiceId));

    let status: 'pending' | 'partial' | 'paid' = 'pending';
    if (totalPaid >= inv.total) {
      status = 'paid';
    } else if (totalPaid > 0) {
      status = 'partial';
    }

    await db
      .update(invoices)
      .set({ paidAmount: totalPaid, status, updatedAt: new Date() })
      .where(eq(invoices.id, invoiceId));

    recalculateProjectTeamFinancials(inv.projectId);

    // If all payments removed, revert linked project from 'booked' → 'lead'
    if (totalPaid === 0) {
      await revertProjectIfUnpaid(invoiceId);
    }

    const [parentInv] = await db.select({ invoiceNumber: invoices.invoiceNumber }).from(invoices).where(eq(invoices.id, invoiceId));
    const invLabel = parentInv ? 'Invoice #' + String(parentInv.invoiceNumber).padStart(5, '0') : '';
    logActivity({ ...actorFromRequest(request), action: 'deleted', entityType: 'payment', entityId: request.params.id, entityLabel: `$${payment.amount.toFixed(2)} from ${invLabel}` });
    broadcast('payment', 'deleted', request.user.id, request.params.id);

    return { success: true };
  });
}
