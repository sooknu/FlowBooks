import { FastifyInstance } from 'fastify';
import { db } from '../db';
import { notifications } from '../db/schema';
import { eq, and, desc } from 'drizzle-orm';

export default async function notificationRoutes(fastify: FastifyInstance) {
  // GET /api/notifications — list for current user
  fastify.get('/', async (request: any) => {
    const userId = request.user.id;
    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(50);
    return rows;
  });

  // POST /api/notifications/read/:id — mark single as read
  fastify.post('/read/:id', async (request: any, reply: any) => {
    const userId = request.user.id;
    const { id } = request.params;
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
    return { success: true };
  });

  // POST /api/notifications/read-all — mark all as read
  fastify.post('/read-all', async (request: any) => {
    const userId = request.user.id;
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
    return { success: true };
  });

  // DELETE /api/notifications/:id — dismiss a single notification
  fastify.delete('/:id', async (request: any) => {
    const userId = request.user.id;
    const { id } = request.params;
    await db.delete(notifications).where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
    return { success: true };
  });

  // DELETE /api/notifications — clear all notifications for current user
  fastify.delete('/', async (request: any) => {
    const userId = request.user.id;
    await db.delete(notifications).where(eq(notifications.userId, userId));
    return { success: true };
  });
}
