import { db } from '../db';
import { invoices, invoiceItems, payments, clientCredits } from '../db/schema';
import { eq, ilike, or, and, asc as ascFn, desc as descFn, count, inArray } from 'drizzle-orm';
import { getNextInvoiceNumber } from '../lib/rpc';
import { serializeItems, parseInvoiceItems, replaceInvoiceItems } from '../lib/items';
import { logActivity, actorFromRequest } from '../lib/activityLog';
import { archiveProjectForDeletedInvoice } from '../lib/stripe';
import { recalculateProjectTeamFinancials } from '../lib/teamCalc';
import { parseDateInput } from '../lib/dates';

function docLabel(num: number) {
  return 'Invoice #' + String(num).padStart(5, '0');
}

const itemsOrdered = { orderBy: (items: any, { asc }: any) => [asc(items.sortOrder)] };

function mapInvoiceBody(body: any) {
  return {
    clientName: body.clientName || body.client_name || null,
    status: body.status || 'pending',
    notes: body.notes ?? null,
    subtotal: body.subtotal ?? 0,
    tax: body.tax ?? 0,
    taxRate: body.taxRate ?? body.tax_rate ?? 0,
    discountType: body.discountType || body.discount_type || null,
    discountValue: body.discountValue ?? body.discount_value ?? null,
    discountAmount: body.discountAmount ?? body.discount_amount ?? null,
    paidAmount: body.paidAmount ?? body.paid_amount ?? 0,
    dueDate: parseDateInput(body.dueDate || body.due_date),
    total: body.total ?? 0,
    eventDate: parseDateInput(body.eventDate || body.event_date),
    eventEndDate: parseDateInput(body.eventEndDate || body.event_end_date),
    eventLocation: body.eventLocation || body.event_location || null,
    eventType: body.eventType || body.event_type || null,
    projectTypeId: body.projectTypeId || body.project_type_id || null,
    terms: body.terms ?? null,
    deliveryStatus: body.deliveryStatus || body.delivery_status || null,
    depositAmount: body.depositAmount ?? body.deposit_amount ?? null,
  };
}

function getClientId(body: any): string | null {
  return body.clientId || body.client_id || null;
}

function getQuoteId(body: any): string | null {
  return body.quoteId || body.quote_id || null;
}

function getProjectId(body: any): string | null {
  return body.projectId || body.project_id || null;
}

const invoiceWith = {
  client: {
    columns: { id: true, firstName: true, lastName: true, email: true },
  },
  payments: true,
  items: itemsOrdered,
  projectTypeRel: true,
} as const;

function withSerializedItems(doc: any) {
  return { ...doc, items: serializeItems(doc.items ?? []) };
}

export default async function invoiceRoutes(fastify: any) {
  // GET /api/invoices
  fastify.get('/', async (request: any) => {
    const {
      search,
      clientId,
      page = '0',
      pageSize = '50',
      orderBy = 'createdAt',
      asc = 'false',
    } = request.query;

    const skip = parseInt(page) * parseInt(pageSize);
    const take = parseInt(pageSize);

    const conditions: any[] = [];
    if (clientId) {
      conditions.push(eq(invoices.clientId, clientId));
    }
    if (search) {
      const asNum = parseInt(search);
      conditions.push(
        isNaN(asNum)
          ? ilike(invoices.clientName, `%${search}%`)
          : or(
              ilike(invoices.clientName, `%${search}%`),
              eq(invoices.invoiceNumber, asNum),
            )
      );
    }

    const where = conditions.length > 1 ? and(...conditions) : conditions[0] ?? undefined;
    const col = invoices[orderBy as keyof typeof invoices] as any;
    const orderFn = asc === 'true' ? ascFn(col) : descFn(col);

    const [data, [{ total }]] = await Promise.all([
      db.query.invoices.findMany({
        where: where ? () => where : undefined,
        with: invoiceWith,
        orderBy: orderFn,
        limit: take,
        offset: skip,
      }),
      db.select({ total: count() }).from(invoices).where(where),
    ]);

    return { data: data.map(withSerializedItems), count: total };
  });

  // GET /api/invoices/:id
  fastify.get('/:id', async (request: any, reply: any) => {
    const data = await db.query.invoices.findFirst({
      where: eq(invoices.id, request.params.id),
      with: invoiceWith,
    });
    if (!data) throw new Error('Invoice not found');
    return { data: withSerializedItems(data) };
  });

  // POST /api/invoices
  fastify.post('/', async (request: any) => {
    const userId = request.user.id;
    const invoiceNumber = await getNextInvoiceNumber();
    const itemsData = request.body.items ?? [];

    const [created] = await db
      .insert(invoices)
      .values({
        ...mapInvoiceBody(request.body),
        clientId: getClientId(request.body),
        quoteId: getQuoteId(request.body),
        projectId: getProjectId(request.body),
        userId,
        invoiceNumber,
        createdBy: request.userDisplayName || request.user.email,
        lastEditedBy: request.userDisplayName || request.user.email,
      })
      .returning();

    if (itemsData.length > 0) {
      await db.insert(invoiceItems).values(parseInvoiceItems(itemsData, created.id));
    }

    const data = await db.query.invoices.findFirst({
      where: eq(invoices.id, created.id),
      with: invoiceWith,
    });

    logActivity({ ...actorFromRequest(request), action: 'created', entityType: 'invoice', entityId: created.id, entityLabel: docLabel(invoiceNumber) });

    return { data: withSerializedItems(data) };
  });

  // PUT /api/invoices/:id
  fastify.put('/:id', async (request: any) => {
    const itemsData = request.body.items ?? [];

    const setData: any = {
      ...mapInvoiceBody(request.body),
      clientId: getClientId(request.body),
      quoteId: getQuoteId(request.body),
      lastEditedBy: request.userDisplayName || request.user.email,
      updatedAt: new Date(),
    };
    // Only update projectId if explicitly provided — don't null it out
    if (request.body.projectId !== undefined || request.body.project_id !== undefined) {
      setData.projectId = getProjectId(request.body);
    }

    const [updated] = await db
      .update(invoices)
      .set(setData)
      .where(eq(invoices.id, request.params.id))
      .returning();

    await replaceInvoiceItems(updated.id, itemsData);

    const data = await db.query.invoices.findFirst({
      where: eq(invoices.id, updated.id),
      with: invoiceWith,
    });

    logActivity({ ...actorFromRequest(request), action: 'updated', entityType: 'invoice', entityId: updated.id, entityLabel: docLabel(updated.invoiceNumber) });

    return { data: withSerializedItems(data) };
  });

  // DELETE /api/invoices/:id (items + payments cascade via DB)
  fastify.delete('/:id', async (request: any) => {
    const [existing] = await db
      .select({
        invoiceNumber: invoices.invoiceNumber,
        clientId: invoices.clientId,
        paidAmount: invoices.paidAmount,
        projectId: invoices.projectId,
      })
      .from(invoices)
      .where(eq(invoices.id, request.params.id));

    if (!existing) throw new Error('Invoice not found');

    let creditCreated = false;
    let creditAmount = 0;

    // Auto-create credit if the invoice had payments
    if (existing.clientId && existing.paidAmount > 0) {
      creditAmount = existing.paidAmount;
      await db.insert(clientCredits).values({
        clientId: existing.clientId,
        amount: creditAmount,
        reason: `Invoice ${docLabel(existing.invoiceNumber)} deleted — payments converted to credit`,
        sourceInvoiceNumber: existing.invoiceNumber,
        createdBy: request.userDisplayName || request.user.email,
      });
      creditCreated = true;
      logActivity({
        ...actorFromRequest(request),
        action: 'created',
        entityType: 'credit',
        entityLabel: `$${creditAmount.toFixed(2)} credit from ${docLabel(existing.invoiceNumber)}`,
      });
    }

    await db.delete(invoices).where(eq(invoices.id, request.params.id));
    logActivity({ ...actorFromRequest(request), action: 'deleted', entityType: 'invoice', entityId: request.params.id, entityLabel: docLabel(existing.invoiceNumber) });

    // Archive linked project and recalculate its financials
    if (existing.projectId) {
      await archiveProjectForDeletedInvoice(existing.projectId);
      recalculateProjectTeamFinancials(existing.projectId);
    }

    return { success: true, creditCreated, creditAmount };
  });

  // DELETE /api/invoices/bulk
  fastify.delete('/bulk', async (request: any) => {
    const { ids } = request.body;

    // Delete payments first, then invoices (items cascade via FK)
    await db.delete(payments).where(inArray(payments.invoiceId, ids));
    await db.delete(invoices).where(inArray(invoices.id, ids));
    logActivity({ ...actorFromRequest(request), action: 'deleted', entityType: 'invoice', entityLabel: `${ids.length} invoices` });
    return { success: true };
  });
}
