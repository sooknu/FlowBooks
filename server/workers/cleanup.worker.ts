import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Job } from 'bullmq';
import { db } from '../db';
import { pdfDocuments, activityLog, session, appSettings, backups, backupUploads } from '../db/schema';
import { lt, eq, and, inArray } from 'drizzle-orm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const documentsDir = path.join(__dirname, '..', 'uploads', 'documents');

export async function processCleanupJob(job: Job) {
  const results = {
    expiredPdfs: 0,
    prunedActivityLogs: 0,
    expiredSessions: 0,
    stuckBackups: 0,
  };

  const now = new Date();

  // ── 1. Clean up expired PDFs ──
  try {
    const expiredPdfs = await db
      .select({ id: pdfDocuments.id, fileName: pdfDocuments.fileName })
      .from(pdfDocuments)
      .where(lt(pdfDocuments.expiresAt, now));

    if (expiredPdfs.length > 0) {
      // Delete files from disk
      for (const pdf of expiredPdfs) {
        try {
          const filePath = path.join(documentsDir, pdf.fileName);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        } catch {
          // Best-effort file deletion
        }
      }

      // Delete DB rows
      const ids = expiredPdfs.map(p => p.id);
      for (const id of ids) {
        await db.delete(pdfDocuments).where(eq(pdfDocuments.id, id));
      }

      results.expiredPdfs = expiredPdfs.length;
    }
  } catch (err) {
    console.error('[cleanup] PDF cleanup error:', err);
  }

  // ── 2. Prune old activity logs ──
  try {
    const [retentionSetting] = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, 'activity_log_retention_days'));

    const retentionDays = parseInt(retentionSetting?.value || '90', 10);
    const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);

    const deleted = await db
      .delete(activityLog)
      .where(lt(activityLog.createdAt, cutoff));

    results.prunedActivityLogs = (deleted as any).rowCount || 0;
  } catch (err) {
    console.error('[cleanup] Activity log cleanup error:', err);
  }

  // ── 3. Clean up expired sessions ──
  try {
    const deleted = await db
      .delete(session)
      .where(lt(session.expiresAt, now));

    results.expiredSessions = (deleted as any).rowCount || 0;
  } catch (err) {
    console.error('[cleanup] Session cleanup error:', err);
  }

  // ── 4. Mark stuck backups as failed ──
  try {
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const thirtyMinAgo = new Date(now.getTime() - 30 * 60 * 1000);

    // Backups stuck in "running" for over 2 hours
    const stuckRunning = await db
      .select({ id: backups.id })
      .from(backups)
      .where(and(eq(backups.status, 'running'), lt(backups.startedAt, twoHoursAgo)));

    // Backups stuck in "pending" for over 30 minutes (never picked up by worker)
    const stuckPending = await db
      .select({ id: backups.id })
      .from(backups)
      .where(and(eq(backups.status, 'pending'), lt(backups.createdAt, thirtyMinAgo)));

    const stuckIds = [...stuckRunning, ...stuckPending].map(b => b.id);

    if (stuckIds.length > 0) {
      // Mark stuck upload rows as failed
      await db
        .update(backupUploads)
        .set({ status: 'failed', errorMessage: 'Backup timed out — worker may have crashed', completedAt: now })
        .where(and(
          inArray(backupUploads.backupId, stuckIds),
          inArray(backupUploads.status, ['pending', 'uploading']),
        ));

      // Mark the backup records as failed
      await db
        .update(backups)
        .set({ status: 'failed', errorMessage: 'Timed out — worker may have crashed', completedAt: now, updatedAt: now })
        .where(inArray(backups.id, stuckIds));

      results.stuckBackups = stuckIds.length;
    }
  } catch (err) {
    console.error('[cleanup] Stuck backup cleanup error:', err);
  }

  console.log(`[cleanup] Done — PDFs: ${results.expiredPdfs}, logs: ${results.prunedActivityLogs}, sessions: ${results.expiredSessions}, stuck backups: ${results.stuckBackups}`);
  return results;
}
