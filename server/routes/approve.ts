import { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { db } from '../db';
import { quotes, invoices, invoiceItems, projects, projectTypes, appSettings } from '../db/schema';
import { eq, ilike, inArray } from 'drizzle-orm';
// Invoice number matches the quote number (Q-00108 → I-00108)
import { parseInvoiceItems, serializeItems } from '../lib/items';
import { emailQueue } from '../lib/queue';
import { logActivity } from '../lib/activityLog';
import { notifyUsers, getPrivilegedUserIds } from '../lib/notifications';

const TOKEN_REGEX = /^[a-f0-9]{32}$/;

const BRANDING_KEYS = [
  'company_name', 'app_name', 'accent_color',
  'header_logo_url', 'header_logo_light_url',
  'login_logo_url', 'login_logo_light_url',
  'favicon_url',
  'stripe_enabled', 'paypal_enabled',
];

async function findQuoteByToken(token: string) {
  if (!TOKEN_REGEX.test(token)) return null;
  return db.query.quotes.findFirst({
    where: eq(quotes.approvalToken, token),
    with: { items: true, client: true },
  });
}

async function getBranding() {
  const rows = await db.select().from(appSettings).where(inArray(appSettings.key, BRANDING_KEYS));
  const m: Record<string, string> = {};
  for (const r of rows) m[r.key] = r.value;
  return {
    companyName: m.company_name || m.app_name || '',
    appName: m.app_name || '',
    accentColor: m.accent_color || '#8b5cf6',
    headerLogoUrl: m.header_logo_url || '',
    headerLogoLightUrl: m.header_logo_light_url || '',
    loginLogoUrl: m.login_logo_url || '',
    loginLogoLightUrl: m.login_logo_light_url || '',
    faviconUrl: m.favicon_url || '',
    hasPaymentGateway: m.stripe_enabled === 'true' || m.paypal_enabled === 'true',
  };
}

export default async function approveRoutes(fastify: FastifyInstance) {

  // POST /:token — Approve quote, convert to invoice, auto-send email
  fastify.post('/:token', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, async (request: any, reply: any) => {
    const { token } = request.params;
    const quote = await findQuoteByToken(token);
    if (!quote) return reply.code(404).send({ error: 'Quote not found or link has expired' });

    const branding = await getBranding();

    // Idempotent: if already approved, return existing invoice info
    const existingInvoice = await db.query.invoices.findFirst({
      where: eq(invoices.quoteId, quote.id),
    });
    if (existingInvoice) {
      return {
        alreadyApproved: true,
        branding,
        quote: { number: quote.quoteNumber, clientName: quote.clientName, total: quote.total },
        invoice: {
          number: existingInvoice.invoiceNumber,
          total: existingInvoice.total,
          depositAmount: existingInvoice.depositAmount || 0,
          paymentToken: existingInvoice.paymentToken,
        },
      };
    }

    // Convert quote to invoice — use same number so Q-00108 → I-00108
    const invoiceNumber = quote.quoteNumber;
    const paymentToken = crypto.randomBytes(16).toString('hex');
    const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    const [created] = await db.insert(invoices).values({
      userId: quote.userId,
      invoiceNumber,
      quoteId: quote.id,
      clientId: quote.clientId,
      projectId: quote.projectId,
      clientName: quote.clientName,
      subtotal: quote.subtotal,
      tax: quote.tax,
      taxRate: quote.taxRate,
      total: quote.total,
      discountType: quote.discountType,
      discountValue: quote.discountValue,
      discountAmount: quote.discountAmount,
      notes: quote.notes,
      eventDate: quote.eventDate,
      eventEndDate: quote.eventEndDate,
      eventLocation: quote.eventLocation,
      eventType: quote.eventType,
      projectTypeId: quote.projectTypeId,
      terms: quote.terms,
      status: 'pending',
      paidAmount: 0,
      dueDate,
      paymentToken,
      createdBy: 'Auto-Approval',
      lastEditedBy: 'Auto-Approval',
    }).returning();

    // Calculate deposit if setting exists
    const depositRows = await db.select().from(appSettings).where(eq(appSettings.key, 'deposit_percent'));
    const depositPercent = parseFloat(depositRows[0]?.value || '0');
    if (depositPercent > 0) {
      const depositAmt = quote.total * (depositPercent / 100);
      await db.update(invoices).set({ depositAmount: depositAmt, updatedAt: new Date() }).where(eq(invoices.id, created.id));
    }

    // Mark quote as approved
    await db.update(quotes).set({ approvedAt: new Date(), updatedAt: new Date() }).where(eq(quotes.id, quote.id));

    // Copy line items from quote to invoice
    if (quote.items && quote.items.length > 0) {
      const serialized = serializeItems(quote.items);
      await db.insert(invoiceItems).values(parseInvoiceItems(serialized, created.id));
    }

    // Log activities
    const quoteLabel = `Quote #${String(quote.quoteNumber).padStart(5, '0')}`;
    const invoiceLabel = `Invoice #${String(invoiceNumber).padStart(5, '0')}`;

    logActivity({
      userId: quote.userId,
      userDisplayName: 'Client Approval',
      action: 'approved',
      entityType: 'quote',
      entityId: quote.id,
      entityLabel: `${quoteLabel} approved by client`,
    });

    logActivity({
      userId: quote.userId,
      userDisplayName: 'Auto-Approval',
      action: 'created',
      entityType: 'invoice',
      entityId: created.id,
      entityLabel: `${invoiceLabel} (from ${quoteLabel})`,
    });

    // Queue invoice email to client
    const clientEmail = quote.client?.email;
    if (clientEmail) {
      await emailQueue.add('send', {
        to: clientEmail,
        type: 'invoice',
        documentId: created.id,
        userId: 'system',
        userDisplayName: 'Auto-Approval',
      }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 60_000 },
      });
    }

    // Auto-create or update project
    if (quote.projectId) {
      // Linked project exists → link invoice (don't change status — respect manual progression)
      await db.update(invoices).set({ projectId: quote.projectId, updatedAt: new Date() }).where(eq(invoices.id, created.id));
    } else {
      // No project → auto-create
      const clientDisplayName = quote.clientName || 'Client';
      const evtType = quote.eventType ? quote.eventType.charAt(0).toUpperCase() + quote.eventType.slice(1) : '';
      const projectTitle = evtType ? `${clientDisplayName} — ${evtType}` : clientDisplayName;

      const shootStart = quote.eventDate || null;
      const shootEnd = quote.eventEndDate || null;
      let deliveryDate: Date | null = null;
      if (shootStart) {
        const base = new Date(shootEnd || shootStart);
        base.setDate(base.getDate() + 28);
        deliveryDate = base;
      }

      // Resolve projectTypeId: prefer quote's FK, fall back to label lookup
      let resolvedTypeId = quote.projectTypeId || null;
      if (!resolvedTypeId && quote.eventType) {
        const matched = await db.query.projectTypes.findFirst({
          where: ilike(projectTypes.label, quote.eventType),
        });
        if (matched) resolvedTypeId = matched.id;
      }

      const [project] = await db.insert(projects).values({
        userId: quote.userId,
        clientId: quote.clientId!,
        title: projectTitle,
        projectTypeId: resolvedTypeId,
        status: 'lead',
        shootStartDate: shootStart,
        shootEndDate: shootEnd,
        deliveryDate,
        location: quote.eventLocation || null,
      }).returning();

      // Link quote + invoice to the new project
      await db.update(quotes).set({ projectId: project.id, updatedAt: new Date() }).where(eq(quotes.id, quote.id));
      await db.update(invoices).set({ projectId: project.id, updatedAt: new Date() }).where(eq(invoices.id, created.id));

      logActivity({
        userId: quote.userId,
        userDisplayName: 'Auto-Approval',
        action: 'created',
        entityType: 'project',
        entityId: project.id,
        entityLabel: `${projectTitle} (from ${quoteLabel})`,
      });
    }

    const depositAmount = depositPercent > 0 ? quote.total * (depositPercent / 100) : 0;

    // Notify admins/managers
    const privilegedIds = await getPrivilegedUserIds();
    notifyUsers({
      userIds: privilegedIds,
      type: 'quote_approved',
      title: 'Quote Approved',
      message: `${quote.clientName} approved Quote #${String(quote.quoteNumber).padStart(5, '0')}`,
      entityType: 'quote',
      entityId: quote.id,
    });

    return {
      alreadyApproved: false,
      branding,
      quote: { number: quote.quoteNumber, clientName: quote.clientName, total: quote.total },
      invoice: {
        number: invoiceNumber,
        total: created.total,
        depositAmount,
        paymentToken,
      },
    };
  });
}
