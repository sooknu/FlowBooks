import { db } from '../db';
import { invoices, payments, appSettings } from '../db/schema';
import { eq, inArray } from 'drizzle-orm';
import { getStripeInstance, recalculateInvoice, checkDepositAndBookProject } from '../lib/stripe';
import { createPayPalOrder, capturePayPalOrder } from '../lib/paypal';
import { logActivity } from '../lib/activityLog';
import { sendPaymentNotification } from '../lib/mailer';
import { composeCompanyInfo, COMPANY_INFO_KEYS } from '../lib/companyInfo';
import { generateReceiptPdf } from '../lib/generateReceiptPdf';
import { notifyUsers, getPrivilegedUserIds } from '../lib/notifications';

const TOKEN_REGEX = /^[a-f0-9]{32}$/;

async function findInvoiceByToken(token: string) {
  if (!TOKEN_REGEX.test(token)) return null;
  return db.query.invoices.findFirst({
    where: eq(invoices.paymentToken, token),
    with: { client: true, payments: true },
  });
}

export default async function payRoutes(fastify: any) {
  // GET /api/pay/:token — public invoice summary + stripe config + branding
  fastify.get('/:token', async (request: any, reply: any) => {
    const { token } = request.params;
    const invoice = await findInvoiceByToken(token);
    if (!invoice) return reply.code(404).send({ error: 'Invoice not found or link has expired' });

    // Fetch branding + stripe config
    const settingsRows = await db
      .select()
      .from(appSettings)
      .where(inArray(appSettings.key, [
        'company_name', 'app_name', 'accent_color', 'favicon_url',
        ...COMPANY_INFO_KEYS,
        'header_logo_url', 'header_logo_light_url',
        'login_logo_url', 'login_logo_light_url',
        'stripe_enabled', 'stripe_publishable_key', 'stripe_test_mode', 'stripe_test_publishable_key',
        'paypal_enabled', 'paypal_client_id', 'paypal_test_mode', 'paypal_test_client_id',
      ]));
    const settings: Record<string, string> = {};
    for (const s of settingsRows) settings[s.key] = s.value;

    const totalPaid = (invoice.payments || []).reduce((s: number, p: any) => s + p.amount, 0);
    const balanceDue = Math.max(0, parseFloat((invoice.total - totalPaid).toFixed(2)));
    const hasOnlinePayment = (invoice.payments || []).some((p: any) =>
      (p.method === 'Stripe' && p.stripePaymentIntentId) || (p.method === 'PayPal' && p.paypalOrderId)
    );
    const companyInfo = composeCompanyInfo(settings);

    return {
      invoice: {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        clientName: invoice.clientName || invoice.client?.name || '',
        total: invoice.total,
        paidAmount: totalPaid,
        balanceDue,
        hasOnlinePayment,
        status: invoice.status,
        createdAt: invoice.createdAt,
      },
      stripe: {
        enabled: settings.stripe_enabled === 'true',
        publishableKey: (settings.stripe_test_mode === 'true' ? settings.stripe_test_publishable_key : settings.stripe_publishable_key) || null,
      },
      paypal: {
        enabled: settings.paypal_enabled === 'true',
        clientId: (settings.paypal_test_mode === 'true' ? settings.paypal_test_client_id : settings.paypal_client_id) || null,
      },
      branding: {
        companyName: settings.company_name || '',
        appName: settings.app_name || 'QuoteFlow',
        accentColor: settings.accent_color || '#8b5cf6',
        faviconUrl: settings.favicon_url || null,
        companyAddress: companyInfo.addressLines.join('\n') || null,
        companyContact: [companyInfo.phone, companyInfo.email].filter(Boolean).join('  ·  ') || null,
        headerLogoUrl: settings.header_logo_url || null,
        headerLogoLightUrl: settings.header_logo_light_url || null,
        loginLogoUrl: settings.login_logo_url || null,
        loginLogoLightUrl: settings.login_logo_light_url || null,
      },
    };
  });

  // POST /api/pay/:token/create-intent — create Stripe PaymentIntent for balance due
  fastify.post('/:token/create-intent', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (request: any, reply: any) => {
    const { token } = request.params;
    const invoice = await findInvoiceByToken(token);
    if (!invoice) return reply.code(404).send({ error: 'Invoice not found' });

    const totalPaid = (invoice.payments || []).reduce((s: number, p: any) => s + p.amount, 0);
    const balanceDue = Math.max(0, parseFloat((invoice.total - totalPaid).toFixed(2)));
    if (balanceDue <= 0) return reply.code(400).send({ error: 'Invoice is already paid' });

    const { amount } = request.body || {};
    const payAmount = amount ? parseFloat(amount) : balanceDue;
    if (payAmount <= 0 || payAmount > balanceDue + 0.01) {
      return reply.code(400).send({ error: 'Invalid payment amount' });
    }

    const stripe = await getStripeInstance();
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(payAmount * 100),
      currency: 'usd',
      metadata: {
        invoiceId: invoice.id,
        invoiceNumber: String(invoice.invoiceNumber),
        source: 'pay_online',
      },
      payment_method_types: ['card', 'link'],
      capture_method: 'manual',
    });

    return {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: payAmount,
    };
  });

  // POST /api/pay/:token/confirm — verify PI with Stripe, CVC check, capture, record payment
  fastify.post('/:token/confirm', async (request: any, reply: any) => {
    const { token } = request.params;
    const invoice = await findInvoiceByToken(token);
    if (!invoice) return reply.code(404).send({ error: 'Invoice not found' });

    const { paymentIntentId } = request.body || {};
    if (!paymentIntentId) return reply.code(400).send({ error: 'Missing paymentIntentId' });

    // Idempotent: check if payment already recorded for this PI
    const existingPayments = await db.select().from(payments).where(eq(payments.stripePaymentIntentId, paymentIntentId));
    if (existingPayments.length > 0) {
      return { data: existingPayments[0], alreadyRecorded: true };
    }

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

    // Cross-check PI metadata matches this invoice
    if (pi.metadata?.invoiceId !== invoice.id) {
      return reply.code(400).send({ error: 'Payment intent does not match this invoice' });
    }

    const stripeAmount = pi.amount / 100;

    const [payment] = await db
      .insert(payments)
      .values({
        invoiceId: invoice.id,
        amount: stripeAmount,
        method: 'Stripe',
        paymentDate: new Date(),
        stripePaymentIntentId: paymentIntentId,
        stripeRefundedAmount: 0,
      })
      .returning();

    await recalculateInvoice(invoice.id);
    await checkDepositAndBookProject(invoice.id);

    const docLabel = invoice.invoiceNumber ? `Invoice #${String(invoice.invoiceNumber).padStart(5, '0')}` : '';
    logActivity({
      userId: 'system',
      userDisplayName: 'Online Payment',
      action: 'created',
      entityType: 'payment',
      entityId: payment.id,
      entityLabel: `$${stripeAmount.toFixed(2)} online payment for ${docLabel}`,
    });

    sendPaymentNotification({
      invoiceNumber: invoice.invoiceNumber,
      clientName: invoice.clientName,
      amount: stripeAmount,
      method: 'Stripe',
      balanceDue: invoice.total - (invoice.paidAmount || 0) - stripeAmount,
    });

    const privilegedIds = await getPrivilegedUserIds();
    notifyUsers({
      userIds: privilegedIds,
      type: 'payment_received',
      title: 'Payment Received',
      message: `${invoice.clientName || 'Client'} paid $${stripeAmount.toFixed(2)} on Invoice #${String(invoice.invoiceNumber).padStart(5, '0')}`,
      entityType: 'invoice',
      entityId: invoice.id,
    });

    return { data: payment };
  });

  // POST /api/pay/:token/paypal-create-order — public PayPal order creation
  fastify.post('/:token/paypal-create-order', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (request: any, reply: any) => {
    const { token } = request.params;
    const invoice = await findInvoiceByToken(token);
    if (!invoice) return reply.code(404).send({ error: 'Invoice not found' });

    const totalPaid = (invoice.payments || []).reduce((s: number, p: any) => s + p.amount, 0);
    const balanceDue = Math.max(0, parseFloat((invoice.total - totalPaid).toFixed(2)));
    if (balanceDue <= 0) return reply.code(400).send({ error: 'Invoice is already paid' });

    const { amount } = request.body || {};
    const payAmount = amount ? parseFloat(amount) : balanceDue;
    if (payAmount <= 0 || payAmount > balanceDue + 0.01) {
      return reply.code(400).send({ error: 'Invalid payment amount' });
    }

    const result = await createPayPalOrder(payAmount, invoice.id, invoice.invoiceNumber);
    return result;
  });

  // POST /api/pay/:token/paypal-capture-order — public PayPal order capture
  fastify.post('/:token/paypal-capture-order', async (request: any, reply: any) => {
    const { token } = request.params;
    const invoice = await findInvoiceByToken(token);
    if (!invoice) return reply.code(404).send({ error: 'Invoice not found' });

    const { orderID } = request.body || {};
    if (!orderID) return reply.code(400).send({ error: 'Missing orderID' });

    // Idempotent
    const existing = await db.select().from(payments).where(eq(payments.paypalOrderId, orderID));
    if (existing.length > 0) return { data: existing[0], alreadyRecorded: true };

    const capture = await capturePayPalOrder(orderID);

    const [payment] = await db
      .insert(payments)
      .values({
        invoiceId: invoice.id,
        amount: capture.amount,
        method: 'PayPal',
        paymentDate: new Date(),
        paypalOrderId: orderID,
      })
      .returning();

    await recalculateInvoice(invoice.id);
    await checkDepositAndBookProject(invoice.id);

    const docLabel = invoice.invoiceNumber ? `Invoice #${String(invoice.invoiceNumber).padStart(5, '0')}` : '';
    logActivity({
      userId: 'system',
      userDisplayName: 'Online Payment',
      action: 'created',
      entityType: 'payment',
      entityId: payment.id,
      entityLabel: `$${capture.amount.toFixed(2)} PayPal payment for ${docLabel}`,
    });

    sendPaymentNotification({
      invoiceNumber: invoice.invoiceNumber,
      clientName: invoice.clientName,
      amount: capture.amount,
      method: 'PayPal',
      balanceDue: invoice.total - (invoice.paidAmount || 0) - capture.amount,
    });

    const privilegedIds2 = await getPrivilegedUserIds();
    notifyUsers({
      userIds: privilegedIds2,
      type: 'payment_received',
      title: 'Payment Received',
      message: `${invoice.clientName || 'Client'} paid $${capture.amount.toFixed(2)} on Invoice #${String(invoice.invoiceNumber).padStart(5, '0')}`,
      entityType: 'invoice',
      entityId: invoice.id,
    });

    return { data: payment };
  });

  // GET /api/pay/:token/receipt — download payment receipt PDF
  fastify.get('/:token/receipt', {
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
  }, async (request: any, reply: any) => {
    const { token } = request.params;
    const invoice = await findInvoiceByToken(token);
    if (!invoice) return reply.code(404).send({ error: 'Invoice not found' });

    // Find the most recent online payment (Stripe or PayPal)
    const onlinePayment = (invoice.payments || [])
      .filter((p: any) => (p.method === 'Stripe' && p.stripePaymentIntentId) || (p.method === 'PayPal' && p.paypalOrderId))
      .sort((a: any, b: any) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime())[0];

    if (!onlinePayment) {
      return reply.code(404).send({ error: 'No online payment found for this invoice' });
    }

    // Fetch company settings
    const settingsRows = await db
      .select()
      .from(appSettings)
      .where(inArray(appSettings.key, [
        'company_name',
        ...COMPANY_INFO_KEYS,
        'secondary_logo_url', 'secondary_logo_light_url', 'header_logo_url', 'header_logo_light_url',
      ]));
    const settings: Record<string, string> = {};
    for (const s of settingsRows) settings[s.key] = s.value;

    // Calculate previously paid (all payments except this one)
    const previouslyPaid = (invoice.payments || [])
      .filter((p: any) => p.id !== onlinePayment.id)
      .reduce((sum: number, p: any) => sum + p.amount, 0);

    const transactionId = onlinePayment.stripePaymentIntentId || onlinePayment.paypalOrderId || 'N/A';
    const paymentMethod = onlinePayment.method === 'PayPal' ? 'PayPal' : 'Stripe (Credit Card)';

    const pdfBytes = await generateReceiptPdf({
      invoiceNumber: invoice.invoiceNumber,
      clientName: invoice.clientName || invoice.client?.name || 'Customer',
      amount: onlinePayment.amount,
      invoiceTotal: invoice.total,
      previouslyPaid,
      paymentDate: onlinePayment.paymentDate,
      transactionId,
      paymentMethod,
      settings,
    });

    const fileName = `Receipt-${String(invoice.invoiceNumber).padStart(5, '0')}.pdf`;
    reply.header('Content-Type', 'application/pdf');
    reply.header('Content-Disposition', `attachment; filename="${fileName}"`);
    reply.header('Content-Length', pdfBytes.length);
    return reply.send(Buffer.from(pdfBytes));
  });
}
