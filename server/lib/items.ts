import { db } from '../db';
import { quoteItems, invoiceItems } from '../db/schema';
import { eq } from 'drizzle-orm';

// ── Serialize: DB rows → frontend-compatible objects ──

export function serializeItems(rows: any[]) {
  return rows.map((row) => {
    const base: Record<string, any> = {
      type: row.itemType,
      name: row.name,
      description: row.description,
      qty: row.qty,
      total: row.total,
      isTaxable: row.isTaxable,
    };

    base.price = row.price;
    if (row.itemType === 'product') {
      base.productId = row.productId;
      base.productType = row.productType;
    }

    return base;
  });
}

// ── Parse: frontend objects → DB insert values ──

function parseItem(item: any, index: number) {
  const isProduct = (item.type || 'product') === 'product';

  return {
    sortOrder: index,
    itemType: item.type || 'product',
    name: item.name || 'Unnamed Item',
    description: item.description || null,
    qty: item.qty || item.quantity || 1,
    total: item.total || 0,
    isTaxable: item.isTaxable ?? item.is_taxable ?? item.taxable ?? false,
    productId: isProduct ? (item.productId || item.product_id || null) : null,
    productType: isProduct ? (item.productType || item.product_type || null) : null,
    price: item.price ?? null,
  };
}

export function parseQuoteItems(items: any[], quoteId: string) {
  return items.map((item, i) => ({ ...parseItem(item, i), quoteId }));
}

export function parseInvoiceItems(items: any[], invoiceId: string) {
  return items.map((item, i) => ({ ...parseItem(item, i), invoiceId }));
}

// ── Replace: delete-and-reinsert in a transaction (for PUT) ──

export async function replaceQuoteItems(quoteId: string, items: any[]) {
  await db.delete(quoteItems).where(eq(quoteItems.quoteId, quoteId));
  if (items.length > 0) {
    await db.insert(quoteItems).values(parseQuoteItems(items, quoteId));
  }
}

export async function replaceInvoiceItems(invoiceId: string, items: any[]) {
  await db.delete(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId));
  if (items.length > 0) {
    await db.insert(invoiceItems).values(parseInvoiceItems(items, invoiceId));
  }
}
