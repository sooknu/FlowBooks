import { db } from '../db';
import { payments, invoices } from '../db/schema';
import { eq } from 'drizzle-orm';
import { logActivity, actorFromRequest } from '../lib/activityLog';
import { recalculateInvoice, checkDepositAndBookProject, docLabel } from '../lib/stripe';
import { createPayPalOrder, capturePayPalOrder } from '../lib/paypal';
import { notifyUsers, getPrivilegedUserIds } from '../lib/notifications';

export default async function paypalRoutes(fastify: any) {
  // POST /api/paypal/create-order
  fastify.post('/create-order', async (request: any) => {
    const { invoiceId, amount } = request.body;
    if (!invoiceId || !amount || amount <= 0) throw new Error('Invalid request');

    const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
    if (!inv) throw new Error('Invoice not found');

    const balance = inv.total - inv.paidAmount;
    if (amount > balance + 0.01) throw new Error('Amount exceeds balance due');

    const result = await createPayPalOrder(amount, invoiceId, inv.invoiceNumber);
    return result;
  });

  // POST /api/paypal/capture-order
  fastify.post('/capture-order', async (request: any) => {
    const { invoiceId, orderID } = request.body;
    if (!invoiceId || !orderID) throw new Error('Invalid request');

    // Idempotent: check if already recorded
    const existing = await db.select().from(payments).where(eq(payments.paypalOrderId, orderID));
    if (existing.length > 0) return { data: existing[0], alreadyRecorded: true };

    const capture = await capturePayPalOrder(orderID);

    const [payment] = await db
      .insert(payments)
      .values({
        invoiceId,
        amount: capture.amount,
        method: 'PayPal',
        paymentDate: new Date(),
        paypalOrderId: orderID,
      })
      .returning();

    await recalculateInvoice(invoiceId);
    await checkDepositAndBookProject(invoiceId);

    const [parentInv] = await db.select({ invoiceNumber: invoices.invoiceNumber, clientName: invoices.clientName }).from(invoices).where(eq(invoices.id, invoiceId));
    logActivity({ ...actorFromRequest(request), action: 'created', entityType: 'payment', entityId: payment.id, entityLabel: `$${capture.amount.toFixed(2)} PayPal payment for ${docLabel(parentInv?.invoiceNumber)}` });

    const privilegedIds = await getPrivilegedUserIds();
    notifyUsers({
      userIds: privilegedIds,
      type: 'payment_received',
      title: 'Payment Received',
      message: `${parentInv?.clientName || 'Client'} paid $${capture.amount.toFixed(2)} on ${docLabel(parentInv?.invoiceNumber)}`,
      entityType: 'invoice',
      entityId: invoiceId,
    });

    return { data: payment };
  });
}
