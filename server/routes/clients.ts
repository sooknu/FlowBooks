import { db } from '../db';
import { clients, clientNotes } from '../db/schema';
import { eq, ilike, or, asc as ascFn, desc as descFn, count } from 'drizzle-orm';
import { deleteClientAndRelatedData } from '../lib/rpc';
import { requirePermission } from '../lib/permissions';
import { logActivity, actorFromRequest } from '../lib/activityLog';

export default async function clientRoutes(fastify: any) {
  // GET /api/clients
  fastify.get('/', async (request: any) => {
    const {
      search,
      page = '0',
      pageSize = '50',
      orderBy = 'lastName',
      asc = 'true',
    } = request.query;

    const skip = parseInt(page) * parseInt(pageSize);
    const take = parseInt(pageSize);

    const conditions: any[] = [];
    if (search) {
      conditions.push(
        or(
          ilike(clients.displayName, `%${search}%`),
          ilike(clients.firstName, `%${search}%`),
          ilike(clients.lastName, `%${search}%`),
          ilike(clients.email, `%${search}%`),
          ilike(clients.company, `%${search}%`),
        )
      );
    }

    const where = conditions.length > 0 ? conditions[0] : undefined;
    const col = clients[orderBy as keyof typeof clients] as any;
    const orderFn = asc === 'true' ? ascFn(col) : descFn(col);

    const [data, [{ total }]] = await Promise.all([
      db.select().from(clients).where(where).orderBy(orderFn).limit(take).offset(skip),
      db.select({ total: count() }).from(clients).where(where),
    ]);

    return { data, count: total };
  });

  // GET /api/clients/export
  fastify.get('/export', async (request: any) => {
    const data = await db
      .select({
        displayName: clients.displayName,
        firstName: clients.firstName,
        lastName: clients.lastName,
        email: clients.email,
        phone: clients.phone,
        phone2: clients.phone2,
        company: clients.company,
        billingStreet: clients.billingStreet,
        billingCity: clients.billingCity,
        billingState: clients.billingState,
        billingPostalCode: clients.billingPostalCode,
        billingCountry: clients.billingCountry,
        shippingStreet: clients.shippingStreet,
        shippingCity: clients.shippingCity,
        shippingState: clients.shippingState,
        shippingPostalCode: clients.shippingPostalCode,
        shippingCountry: clients.shippingCountry,
      })
      .from(clients);
    return { data };
  });

  // GET /api/clients/:id
  fastify.get('/:id', async (request: any) => {
    const [data] = await db
      .select()
      .from(clients)
      .where(eq(clients.id, request.params.id));
    if (!data) throw new Error('Client not found');
    return { data };
  });

  // Map incoming body (camelCase or snake_case) to DB field names
  function mapClientBody(body: any) {
    return {
      displayName: body.displayName || body.display_name || null,
      firstName: body.firstName || body.first_name,
      lastName: body.lastName || body.last_name || null,
      email: body.email || null,
      phone: body.phone || null,
      phone2: body.phone2 || body.phone_2 || null,
      company: body.company || null,
      billingStreet: body.billingStreet || body.billing_street || null,
      billingCity: body.billingCity || body.billing_city || null,
      billingState: body.billingState || body.billing_state || null,
      billingPostalCode: body.billingPostalCode || body.billing_postal_code || null,
      billingCountry: body.billingCountry || body.billing_country || null,
      shippingStreet: body.shippingStreet || body.shipping_street || null,
      shippingCity: body.shippingCity || body.shipping_city || null,
      shippingState: body.shippingState || body.shipping_state || null,
      shippingPostalCode: body.shippingPostalCode || body.shipping_postal_code || null,
      shippingCountry: body.shippingCountry || body.shipping_country || null,
    };
  }

  // POST /api/clients
  fastify.post('/', async (request: any) => {
    const [data] = await db
      .insert(clients)
      .values({ ...mapClientBody(request.body), userId: request.user.id })
      .returning();
    logActivity({ ...actorFromRequest(request), action: 'created', entityType: 'client', entityId: data.id, entityLabel: data.displayName || [data.firstName, data.lastName].filter(Boolean).join(' ') });
    return { data };
  });

  // PUT /api/clients/:id
  fastify.put('/:id', async (request: any) => {
    const [data] = await db
      .update(clients)
      .set({ ...mapClientBody(request.body), updatedAt: new Date() })
      .where(eq(clients.id, request.params.id))
      .returning();
    logActivity({ ...actorFromRequest(request), action: 'updated', entityType: 'client', entityId: data.id, entityLabel: data.displayName || [data.firstName, data.lastName].filter(Boolean).join(' ') });
    return { data };
  });

  // POST /api/clients/upsert — bulk CSV import
  fastify.post('/upsert', async (request: any) => {
    const { clients: clientList } = request.body;
    const userId = request.user.id;
    const results: any[] = [];

    for (const client of clientList) {
      const mapped = mapClientBody(client);
      if (!mapped.email) {
        const [result] = await db
          .insert(clients)
          .values({ ...mapped, userId })
          .returning();
        results.push(result);
      } else {
        const [result] = await db
          .insert(clients)
          .values({ ...mapped, userId })
          .onConflictDoUpdate({
            target: [clients.userId, clients.email],
            set: { ...mapped, updatedAt: new Date() },
          })
          .returning();
        results.push(result);
      }
    }

    logActivity({ ...actorFromRequest(request), action: 'imported', entityType: 'client', entityLabel: `${results.length} clients` });
    return { count: results.length };
  });

  // DELETE /api/clients/:id — cascade delete
  fastify.delete('/:id', { preHandler: [requirePermission('manage_clients')] }, async (request: any) => {
    const [existing] = await db.select({ displayName: clients.displayName, firstName: clients.firstName, lastName: clients.lastName }).from(clients).where(eq(clients.id, request.params.id));
    await deleteClientAndRelatedData(request.params.id);
    if (existing) logActivity({ ...actorFromRequest(request), action: 'deleted', entityType: 'client', entityId: request.params.id, entityLabel: existing.displayName || [existing.firstName, existing.lastName].filter(Boolean).join(' ') });
    return { success: true };
  });

  // ── Client Notes ──

  // GET /api/clients/:id/notes
  fastify.get('/:id/notes', async (request: any) => {
    const data = await db
      .select()
      .from(clientNotes)
      .where(eq(clientNotes.clientId, request.params.id))
      .orderBy(descFn(clientNotes.createdAt));
    return { data };
  });

  // POST /api/clients/:id/notes
  fastify.post('/:id/notes', async (request: any) => {
    const [data] = await db
      .insert(clientNotes)
      .values({
        clientId: request.params.id,
        content: request.body.content,
        createdBy: request.userDisplayName || request.user.email,
      })
      .returning();
    return { data };
  });

  // DELETE /api/clients/:id/notes/:noteId
  fastify.delete('/:id/notes/:noteId', async (request: any) => {
    await db.delete(clientNotes).where(eq(clientNotes.id, request.params.noteId));
    return { success: true };
  });
}
