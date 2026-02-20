import { db } from '../db';
import { quotes, quoteItems } from '../db/schema';
import { eq, ilike, or, and, asc as ascFn, desc as descFn, count, inArray, sql } from 'drizzle-orm';
import { getNextQuoteNumber } from '../lib/rpc';
import { serializeItems, parseQuoteItems, replaceQuoteItems } from '../lib/items';
import { logActivity, actorFromRequest } from '../lib/activityLog';
import { parseDateInput } from '../lib/dates';
import { broadcast } from '../lib/pubsub';

function docLabel(num: number) {
  return 'Quote #' + String(num).padStart(5, '0');
}

const itemsOrdered = { orderBy: (items: any, { asc }: any) => [asc(items.sortOrder)] };

function getProjectId(body: any): string | null {
  return body.projectId || body.project_id || null;
}

function mapQuoteBody(body: any) {
  return {
    clientName: body.clientName || body.client_name || null,
    notes: body.notes ?? null,
    subtotal: body.subtotal ?? 0,
    tax: body.tax ?? 0,
    taxRate: body.taxRate ?? body.tax_rate ?? 0,
    discountType: body.discountType || body.discount_type || null,
    discountValue: body.discountValue ?? body.discount_value ?? null,
    discountAmount: body.discountAmount ?? body.discount_amount ?? null,
    total: body.total ?? 0,
    eventDate: parseDateInput(body.eventDate || body.event_date),
    eventEndDate: parseDateInput(body.eventEndDate || body.event_end_date),
    eventLocation: body.eventLocation || body.event_location || null,
    eventType: body.eventType || body.event_type || null,
    projectTypeId: body.projectTypeId || body.project_type_id || null,
    terms: body.terms ?? null,
  };
}

function getClientId(body: any): string | null {
  return body.clientId || body.client_id || null;
}

function withSerializedItems(doc: any) {
  return { ...doc, items: serializeItems(doc.items ?? []) };
}

export default async function quoteRoutes(fastify: any) {
  // GET /api/quotes
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
      conditions.push(eq(quotes.clientId, clientId));
    }
    if (search) {
      const asNum = parseInt(search);
      conditions.push(
        isNaN(asNum)
          ? ilike(quotes.clientName, `%${search}%`)
          : or(
              ilike(quotes.clientName, `%${search}%`),
              eq(quotes.quoteNumber, asNum),
            )
      );
    }

    const where = conditions.length > 1 ? and(...conditions) : conditions[0] ?? undefined;
    const col = quotes[orderBy as keyof typeof quotes] as any;
    // For approvedAt, push NULLs last so approved quotes sort to the top
    const orderFn = orderBy === 'approvedAt'
      ? sql`${col} DESC NULLS LAST`
      : asc === 'true' ? ascFn(col) : descFn(col);

    const [data, [{ total }]] = await Promise.all([
      db.query.quotes.findMany({
        where: where ? () => where : undefined,
        with: { client: true, items: itemsOrdered, projectTypeRel: true },
        orderBy: orderFn,
        limit: take,
        offset: skip,
      }),
      db.select({ total: count() }).from(quotes).where(where),
    ]);

    return { data: data.map(withSerializedItems), count: total };
  });

  // GET /api/quotes/:id
  fastify.get('/:id', async (request: any, reply: any) => {
    const data = await db.query.quotes.findFirst({
      where: eq(quotes.id, request.params.id),
      with: { client: true, items: itemsOrdered },
    });
    if (!data) throw new Error('Quote not found');
    return { data: withSerializedItems(data) };
  });

  // POST /api/quotes
  fastify.post('/', async (request: any) => {
    const userId = request.user.id;
    const quoteNumber = await getNextQuoteNumber();
    const itemsData = request.body.items ?? [];

    const [created] = await db
      .insert(quotes)
      .values({
        ...mapQuoteBody(request.body),
        clientId: getClientId(request.body),
        projectId: getProjectId(request.body),
        userId,
        quoteNumber,
        createdBy: request.userDisplayName || request.user.email,
        lastEditedBy: request.userDisplayName || request.user.email,
      })
      .returning();

    if (itemsData.length > 0) {
      await db.insert(quoteItems).values(parseQuoteItems(itemsData, created.id));
    }

    const data = await db.query.quotes.findFirst({
      where: eq(quotes.id, created.id),
      with: { client: true, items: itemsOrdered },
    });

    logActivity({ ...actorFromRequest(request), action: 'created', entityType: 'quote', entityId: created.id, entityLabel: docLabel(quoteNumber) });
    broadcast('quote', 'created', request.user.id, created.id);

    return { data: withSerializedItems(data) };
  });

  // PUT /api/quotes/:id
  fastify.put('/:id', async (request: any) => {
    const itemsData = request.body.items ?? [];

    const setData: any = {
      ...mapQuoteBody(request.body),
      clientId: getClientId(request.body),
      lastEditedBy: request.userDisplayName || request.user.email,
      updatedAt: new Date(),
    };
    // Only update projectId if explicitly provided — don't null it out
    if (request.body.projectId !== undefined || request.body.project_id !== undefined) {
      setData.projectId = getProjectId(request.body);
    }

    const [updated] = await db
      .update(quotes)
      .set(setData)
      .where(eq(quotes.id, request.params.id))
      .returning();

    await replaceQuoteItems(updated.id, itemsData);

    const data = await db.query.quotes.findFirst({
      where: eq(quotes.id, updated.id),
      with: { client: true, items: itemsOrdered },
    });

    logActivity({ ...actorFromRequest(request), action: 'updated', entityType: 'quote', entityId: updated.id, entityLabel: docLabel(updated.quoteNumber) });
    broadcast('quote', 'updated', request.user.id, updated.id);

    return { data: withSerializedItems(data) };
  });

  // DELETE /api/quotes/:id
  fastify.delete('/:id', async (request: any) => {
    const [existing] = await db.select({ quoteNumber: quotes.quoteNumber }).from(quotes).where(eq(quotes.id, request.params.id));
    await db.delete(quotes).where(eq(quotes.id, request.params.id));
    if (existing) {
      logActivity({ ...actorFromRequest(request), action: 'deleted', entityType: 'quote', entityId: request.params.id, entityLabel: docLabel(existing.quoteNumber) });
      broadcast('quote', 'deleted', request.user.id, request.params.id);
    }
    return { success: true };
  });

  // DELETE /api/quotes/bulk
  fastify.delete('/bulk', async (request: any) => {
    const { ids } = request.body;
    await db.delete(quotes).where(inArray(quotes.id, ids));
    logActivity({ ...actorFromRequest(request), action: 'deleted', entityType: 'quote', entityLabel: `${ids.length} quotes` });
    broadcast('quote', 'deleted', request.user.id);
    return { success: true };
  });
}
