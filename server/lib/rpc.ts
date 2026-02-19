import { db } from '../db';
import { appSettings, invoices, invoiceItems, payments, quotes, quoteItems, clients, products, pdfDocuments, profiles, user, teamMembers } from '../db/schema';
import { eq, and, inArray, or, isNull } from 'drizzle-orm';
import { clearRoleCache } from './permissions';
import fs from 'fs';
import path from 'path';

const UPLOADS_DIR = path.join(import.meta.dirname, '..', 'uploads', 'documents');

const START_NUMBER = 100;

/**
 * Returns the next document number from a single shared counter
 * stored in app_settings. Quotes and invoices share one sequence
 * so numbers never collide. Uses a transaction to prevent races.
 */
export async function getNextDocumentNumber() {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, 'next_document_number'));

    const current = row ? parseInt(row.value, 10) : START_NUMBER;
    const next = current + 1;

    await tx
      .insert(appSettings)
      .values({ key: 'next_document_number', value: String(next) })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: { value: String(next) },
      });

    return current;
  });
}

// Keep old names as aliases for backward compat in route files
export async function getNextQuoteNumber() {
  return getNextDocumentNumber();
}

export async function getNextInvoiceNumber() {
  return getNextDocumentNumber();
}

/**
 * Deletes a user and cleans up related data.
 * - Quotes and invoices are KEPT (with orphaned user_id) so admins can still see them.
 * - Clients and products owned by the user are deleted (FKs cascade to set null on items).
 * - PDF documents linked to user's quotes/invoices are deleted (DB rows + files on disk).
 * - Profile, sessions, accounts are deleted (via FK cascades on user table).
 */
export async function deleteUserAndRelatedData(userId: string) {
  // Gather IDs outside the transaction for the PDF file cleanup
  const userQuotes = await db.select({ id: quotes.id }).from(quotes).where(eq(quotes.userId, userId));
  const userInvoices = await db.select({ id: invoices.id }).from(invoices).where(eq(invoices.userId, userId));
  const quoteIds = userQuotes.map(q => q.id);
  const invoiceIds = userInvoices.map(i => i.id);

  // Find PDF documents to clean up on disk
  const pdfConditions = [];
  if (quoteIds.length > 0) {
    pdfConditions.push(inArray(pdfDocuments.documentId, quoteIds));
  }
  if (invoiceIds.length > 0) {
    pdfConditions.push(inArray(pdfDocuments.documentId, invoiceIds));
  }

  let pdfRows: { fileName: string }[] = [];
  if (pdfConditions.length > 0) {
    pdfRows = await db
      .select({ fileName: pdfDocuments.fileName })
      .from(pdfDocuments)
      .where(pdfConditions.length === 1 ? pdfConditions[0] : or(...pdfConditions));
  }

  // Backfill team member name before deleting user (SET NULL will clear userId but preserve the record)
  const [profile] = await db.select({ displayName: profiles.displayName, email: profiles.email }).from(profiles).where(eq(profiles.id, userId));
  const [usr] = await db.select({ name: user.name, email: user.email }).from(user).where(eq(user.id, userId));
  const preservedName = profile?.displayName || usr?.name || usr?.email;
  if (preservedName) {
    await db.update(teamMembers)
      .set({ name: preservedName })
      .where(and(eq(teamMembers.userId, userId), or(isNull(teamMembers.name), eq(teamMembers.name, ''))));
  }

  await db.transaction(async (tx) => {
    // Delete PDF document rows
    if (pdfConditions.length > 0) {
      await tx.delete(pdfDocuments).where(
        pdfConditions.length === 1 ? pdfConditions[0] : or(...pdfConditions)
      );
    }

    // Delete user's clients (FK on quotes/invoices sets client_id to null)
    await tx.delete(clients).where(eq(clients.userId, userId));

    // Delete user's products (FK on quote_items/invoice_items sets product_id to null)
    await tx.delete(products).where(eq(products.userId, userId));

    // Delete profile then user (cascades sessions, accounts)
    await tx.delete(profiles).where(eq(profiles.id, userId)).catch(() => {});
    await tx.delete(user).where(eq(user.id, userId));
  });

  // Clean up PDF files on disk (non-blocking, best-effort)
  for (const row of pdfRows) {
    try {
      const filePath = path.join(UPLOADS_DIR, row.fileName);
      fs.unlinkSync(filePath);
    } catch {
      // File may already be missing — ignore
    }
  }

  clearRoleCache(userId);
}

export async function deleteClientAndRelatedData(clientId: string) {
  return db.transaction(async (tx) => {
    const clientInvoices = await tx
      .select({ id: invoices.id })
      .from(invoices)
      .where(eq(invoices.clientId, clientId));
    const invoiceIds = clientInvoices.map((i) => i.id);

    const clientQuotes = await tx
      .select({ id: quotes.id })
      .from(quotes)
      .where(eq(quotes.clientId, clientId));
    const quoteIds = clientQuotes.map((q) => q.id);

    if (invoiceIds.length > 0) {
      await tx.delete(invoiceItems).where(inArray(invoiceItems.invoiceId, invoiceIds));
      await tx.delete(payments).where(inArray(payments.invoiceId, invoiceIds));
      await tx.delete(invoices).where(inArray(invoices.id, invoiceIds));
    }

    if (quoteIds.length > 0) {
      await tx.delete(quoteItems).where(inArray(quoteItems.quoteId, quoteIds));
    }
    await tx.delete(quotes).where(eq(quotes.clientId, clientId));
    await tx.delete(clients).where(eq(clients.id, clientId));
  });
}
