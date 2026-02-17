import { db } from '../db';
import { activityLog } from '../db/schema';
import { eq, and, desc, count, gte, lte, SQL } from 'drizzle-orm';
import { requireAdmin } from '../lib/permissions';
import { parseDateInput } from '../lib/dates';

export default async function activityLogRoutes(fastify: any) {
  // GET /api/activity-log — paginated log entries (admin only)
  fastify.get('/', { preHandler: [requireAdmin] }, async (request: any) => {
    const {
      page = '0',
      pageSize = '50',
      entityType,
      userId,
      startDate,
      endDate,
    } = request.query;

    const skip = parseInt(page) * parseInt(pageSize);
    const take = parseInt(pageSize);

    const conditions: SQL[] = [];
    if (entityType) {
      conditions.push(eq(activityLog.entityType, entityType));
    }
    if (userId) {
      conditions.push(eq(activityLog.userId, userId));
    }
    if (startDate) {
      conditions.push(gte(activityLog.createdAt, parseDateInput(startDate)!));
    }
    if (endDate) {
      conditions.push(lte(activityLog.createdAt, parseDateInput(endDate)!));
    }

    const where = conditions.length > 0
      ? conditions.length === 1 ? conditions[0] : and(...conditions)
      : undefined;

    const [data, [{ total }]] = await Promise.all([
      db.select().from(activityLog).where(where).orderBy(desc(activityLog.createdAt)).limit(take).offset(skip),
      db.select({ total: count() }).from(activityLog).where(where),
    ]);

    return { data, count: total };
  });
}
