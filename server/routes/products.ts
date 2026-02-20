import { db } from '../db';
import { products } from '../db/schema';
import { eq, ilike, and, asc as ascFn, desc as descFn, count, isNotNull, inArray } from 'drizzle-orm';
import { requireAdmin } from '../lib/permissions';
import { logActivity, actorFromRequest } from '../lib/activityLog';
import { broadcast } from '../lib/pubsub';

function mapProductBody(body: any) {
  const category = (body.category ?? null);
  return {
    name: body.name,
    description: body.description || null,
    category: category ? category.trim() : null,
    retailPrice: body.retailPrice ?? body.retail_price ?? null,
    productType: (body.productType || body.product_type || 'product') as 'product' | 'service',
    cost: body.cost !== undefined ? (parseFloat(body.cost) || null) : null,
  };
}

export default async function productRoutes(fastify: any) {
  // GET /api/products
  fastify.get('/', async (request: any) => {
    const {
      search,
      type,
      page = '0',
      pageSize = '20',
      orderBy = 'name',
      asc = 'true',
    } = request.query;

    const skip = parseInt(page) * parseInt(pageSize);
    const take = parseInt(pageSize);

    const conditions: any[] = [];
    if (type) {
      conditions.push(eq(products.productType, type));
    }
    if (search) {
      conditions.push(ilike(products.name, `%${search}%`));
    }

    const where = conditions.length > 0
      ? conditions.length === 1 ? conditions[0] : and(...conditions)
      : undefined;

    const col = products[orderBy as keyof typeof products] as any;
    const orderFn = asc === 'true' ? ascFn(col) : descFn(col);

    const [data, [{ total }]] = await Promise.all([
      db.select().from(products).where(where).orderBy(orderFn).limit(take).offset(skip),
      db.select({ total: count() }).from(products).where(where),
    ]);

    return { data, count: total };
  });

  // GET /api/products/categories
  fastify.get('/categories', async (request: any) => {
    const rows = await db
      .selectDistinct({ category: products.category })
      .from(products)
      .where(isNotNull(products.category))
      .orderBy(ascFn(products.category));
    return { data: rows.map(r => r.category) };
  });

  // GET /api/products/export (admin only)
  fastify.get('/export', { preHandler: [requireAdmin] }, async (request: any) => {
    const data = await db
      .select({
        name: products.name,
        retailPrice: products.retailPrice,
        cost: products.cost,
        description: products.description,
        category: products.category,
        productType: products.productType,
      })
      .from(products);
    return { data };
  });

  // POST /api/products (admin only)
  fastify.post('/', { preHandler: [requireAdmin] }, async (request: any) => {
    const [data] = await db
      .insert(products)
      .values({ ...mapProductBody(request.body), userId: request.user.id })
      .returning();
    logActivity({ ...actorFromRequest(request), action: 'created', entityType: 'product', entityId: data.id, entityLabel: data.name });
    broadcast('product', 'created', request.user.id, data.id);
    return { data };
  });

  // PUT /api/products/:id (admin only)
  fastify.put('/:id', { preHandler: [requireAdmin] }, async (request: any) => {
    const [data] = await db
      .update(products)
      .set({ ...mapProductBody(request.body), updatedAt: new Date() })
      .where(eq(products.id, request.params.id))
      .returning();
    logActivity({ ...actorFromRequest(request), action: 'updated', entityType: 'product', entityId: data.id, entityLabel: data.name });
    broadcast('product', 'updated', request.user.id, data.id);
    return { data };
  });

  // POST /api/products/upsert — bulk CSV import (admin only)
  fastify.post('/upsert', { preHandler: [requireAdmin] }, async (request: any) => {
    const { products: productList } = request.body;
    const userId = request.user.id;
    const results: any[] = [];

    for (const product of productList) {
      const mapped = mapProductBody(product);
      // name is not unique in the DB, so check-then-insert/update
      const [existing] = await db
        .select({ id: products.id })
        .from(products)
        .where(eq(products.name, mapped.name))
        .limit(1);

      if (existing) {
        const [result] = await db
          .update(products)
          .set({ ...mapped, userId, updatedAt: new Date() })
          .where(eq(products.id, existing.id))
          .returning();
        results.push(result);
      } else {
        const [result] = await db
          .insert(products)
          .values({ ...mapped, userId })
          .returning();
        results.push(result);
      }
    }

    logActivity({ ...actorFromRequest(request), action: 'imported', entityType: 'product', entityLabel: `${results.length} products` });
    broadcast('product', 'imported', request.user.id);
    return { count: results.length };
  });

  // DELETE /api/products/:id (admin only)
  fastify.delete('/:id', { preHandler: [requireAdmin] }, async (request: any) => {
    const [existing] = await db.select({ name: products.name }).from(products).where(eq(products.id, request.params.id));
    await db.delete(products).where(eq(products.id, request.params.id));
    if (existing) logActivity({ ...actorFromRequest(request), action: 'deleted', entityType: 'product', entityId: request.params.id, entityLabel: existing.name });
    broadcast('product', 'deleted', request.user.id, request.params.id);
    return { success: true };
  });

  // DELETE /api/products/bulk (admin only)
  fastify.delete('/bulk', { preHandler: [requireAdmin] }, async (request: any) => {
    const { ids } = request.body;
    await db.delete(products).where(inArray(products.id, ids));
    logActivity({ ...actorFromRequest(request), action: 'deleted', entityType: 'product', entityLabel: `${ids.length} products` });
    broadcast('product', 'deleted', request.user.id);
    return { success: true };
  });
}
