import { db } from '../db';
import { payments, invoices } from '../db/schema';
import { eq } from 'drizzle-orm';
import { logActivity, actorFromRequest } from '../lib/activityLog';
import { getStripeInstance, recalculateInvoice, checkDepositAndBookProject, docLabel } from '../lib/stripe';
import { notifyUsers, getPrivilegedUserIds } from '../lib/notifications';

export default async function stripeRoutes(fastify: any) {
  // POST /api/stripe/create-payment-intent
  fastify.post('/create-payment-intent', async (request: any) => {
    const { invoiceId, amount } = request.body;
    if (!invoiceId || !amount || amount <= 0) throw new Error('Invalid request');

    const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
    if (!inv) throw new Error('Invoice not found');

    const balance = inv.total - inv.paidAmount;
    if (amount > balance + 0.01) throw new Error('Amount exceeds balance due');

    const stripe = await getStripeInstance();
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: 'usd',
      metadata: {
        invoiceId,
        invoiceNumber: String(inv.invoiceNumber),
      },
      payment_method_types: ['card', 'link'],
      capture_method: 'manual',
    });

    return {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    };
  });

  // POST /api/stripe/confirm-payment
  fastify.post('/confirm-payment', async (request: any, reply: any) => {
    const { invoiceId, paymentIntentId, amount } = request.body;
    if (!invoiceId || !paymentIntentId) throw new Error('Invalid request');

    const stripe = await getStripeInstance();
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ['latest_charge'],
    });

    if (pi.status === 'requires_capture') {
      // Verify CVC for card payments before capturing
      const charge = pi.latest_charge as any;
      if (charge?.payment_method_details?.card) {
        const cvcCheck = charge.payment_method_details.card.checks?.cvc_check;
        if (cvcCheck === 'fail') {
          await stripe.paymentIntents.cancel(paymentIntentId);
          return reply.code(400).send({ error: 'Card security code (CVC) is incorrect. Payment was not charged. Please try again.' });
        }
      }
      await stripe.paymentIntents.capture(paymentIntentId);
    } else if (pi.status !== 'succeeded') {
      return reply.code(400).send({ error: 'Payment has not been confirmed by Stripe' });
    }

    const stripeAmount = pi.amount / 100;
    if (Math.abs(stripeAmount - amount) > 0.01) throw new Error('Amount mismatch');

    const [payment] = await db
      .insert(payments)
      .values({
        invoiceId,
        amount: stripeAmount,
        method: 'Stripe',
        paymentDate: new Date(),
        stripePaymentIntentId: paymentIntentId,
        stripeRefundedAmount: 0,
      })
      .returning();

    await recalculateInvoice(invoiceId);
    await checkDepositAndBookProject(invoiceId);

    const [parentInv] = await db.select({ invoiceNumber: invoices.invoiceNumber, clientName: invoices.clientName }).from(invoices).where(eq(invoices.id, invoiceId));
    logActivity({ ...actorFromRequest(request), action: 'created', entityType: 'payment', entityId: payment.id, entityLabel: `$${stripeAmount.toFixed(2)} Stripe payment for ${docLabel(parentInv?.invoiceNumber)}` });

    const privilegedIds = await getPrivilegedUserIds();
    notifyUsers({
      userIds: privilegedIds,
      type: 'payment_received',
      title: 'Payment Received',
      message: `${parentInv?.clientName || 'Client'} paid $${stripeAmount.toFixed(2)} on ${docLabel(parentInv?.invoiceNumber)}`,
      entityType: 'invoice',
      entityId: invoiceId,
    });

    return { data: payment };
  });

  // POST /api/stripe/refund
  fastify.post('/refund', async (request: any) => {
    const { paymentId, amount } = request.body;
    if (!paymentId) throw new Error('Invalid request');

    const [payment] = await db.select().from(payments).where(eq(payments.id, paymentId));
    if (!payment) throw new Error('Payment not found');
    if (!payment.stripePaymentIntentId) throw new Error('This payment was not made via Stripe');

    const refundableAmount = payment.amount - (payment.stripeRefundedAmount || 0);
    const refundAmount = amount ? Math.min(parseFloat(amount), refundableAmount) : refundableAmount;
    if (refundAmount <= 0) throw new Error('Nothing to refund');

    const stripe = await getStripeInstance();
    const refund = await stripe.refunds.create({
      payment_intent: payment.stripePaymentIntentId,
      amount: Math.round(refundAmount * 100),
    });

    const newRefundedAmount = (payment.stripeRefundedAmount || 0) + refundAmount;

    if (newRefundedAmount >= payment.amount) {
      await db.delete(payments).where(eq(payments.id, paymentId));
    } else {
      await db.update(payments).set({
        amount: payment.amount - newRefundedAmount,
        stripeRefundedAmount: newRefundedAmount,
      }).where(eq(payments.id, paymentId));
    }

    await recalculateInvoice(payment.invoiceId);

    const [parentInv] = await db.select({ invoiceNumber: invoices.invoiceNumber }).from(invoices).where(eq(invoices.id, payment.invoiceId));
    logActivity({ ...actorFromRequest(request), action: 'deleted', entityType: 'payment', entityId: paymentId, entityLabel: `$${refundAmount.toFixed(2)} Stripe refund for ${docLabel(parentInv?.invoiceNumber)}` });

    return { data: { refundId: refund.id, amount: refundAmount, status: refund.status } };
  });
}
