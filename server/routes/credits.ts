import { db } from '../db';
import { clientCredits } from '../db/schema';
import { eq, desc } from 'drizzle-orm';
import { logActivity, actorFromRequest } from '../lib/activityLog';
import { broadcast } from '../lib/pubsub';

export default async function creditRoutes(fastify: any) {
  // GET /api/credits?clientId=xxx
  fastify.get('/', async (request: any) => {
    const { clientId } = request.query;
    if (!clientId) return { data: [] };

    const data = await db
      .select()
      .from(clientCredits)
      .where(eq(clientCredits.clientId, clientId))
      .orderBy(desc(clientCredits.createdAt));

    return { data };
  });

  // POST /api/credits
  fastify.post('/', async (request: any) => {
    const { clientId, amount, reason } = request.body;

    const [credit] = await db
      .insert(clientCredits)
      .values({
        clientId,
        amount: parseFloat(amount),
        reason: reason || null,
        createdBy: request.userDisplayName || request.user.email,
      })
      .returning();

    logActivity({
      ...actorFromRequest(request),
      action: 'created',
      entityType: 'credit',
      entityId: credit.id,
      entityLabel: `$${parseFloat(amount).toFixed(2)} credit`,
    });
    broadcast('credit', 'created', request.user.id, credit.id);

    return { data: credit };
  });

  // DELETE /api/credits/:id
  fastify.delete('/:id', async (request: any) => {
    const [credit] = await db
      .select()
      .from(clientCredits)
      .where(eq(clientCredits.id, request.params.id));

    if (!credit) throw new Error('Credit not found');

    await db.delete(clientCredits).where(eq(clientCredits.id, request.params.id));

    logActivity({
      ...actorFromRequest(request),
      action: 'deleted',
      entityType: 'credit',
      entityId: request.params.id,
      entityLabel: `$${credit.amount.toFixed(2)} credit`,
    });
    broadcast('credit', 'deleted', request.user.id, request.params.id);

    return { success: true };
  });
}
