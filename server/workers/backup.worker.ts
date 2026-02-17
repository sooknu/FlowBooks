import type { Job } from 'bullmq';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { db } from '../db';
import { backups, appSettings } from '../db/schema';
import { eq, lt, and } from 'drizzle-orm';
import { createBackupArchive } from '../lib/backupArchive';
import { getStorageProvider } from '../lib/backupStorage';
import { logActivity } from '../lib/activityLog';

export async function processBackupJob(job: Job) {
  const { backupId, triggeredBy, userId } = job.data;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-'));

  try {
    // Mark as running
    await db.update(backups).set({
      status: 'running',
      startedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(backups.id, backupId));

    // Create archive
    console.log('[backup] Creating archive...');
    const { archivePath, manifest } = await createBackupArchive(tempDir);
    const fileSize = fs.statSync(archivePath).size;
    const fileName = `backups/${path.basename(archivePath)}`;

    // Upload to cloud storage
    console.log('[backup] Uploading to cloud storage...');
    const provider = await getStorageProvider();
    await provider.upload(fileName, archivePath);

    // Update record as completed
    await db.update(backups).set({
      status: 'completed',
      fileName,
      fileSize,
      manifest: JSON.stringify(manifest),
      completedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(backups.id, backupId));

    // Activity log
    logActivity({
      userId: userId || null,
      userDisplayName: triggeredBy === 'scheduled' ? 'System' : 'Admin',
      action: 'backup_created',
      entityType: 'backup',
      entityId: backupId,
      entityLabel: path.basename(archivePath),
      details: `Size: ${(fileSize / 1024 / 1024).toFixed(1)} MB`,
    });

    // Retention cleanup
    await cleanupOldBackups();

    console.log(`[backup] Completed — ${path.basename(archivePath)} (${(fileSize / 1024 / 1024).toFixed(1)} MB)`);
    return { backupId, fileName, fileSize };
  } catch (err: any) {
    // Mark as failed
    await db.update(backups).set({
      status: 'failed',
      errorMessage: err.message,
      updatedAt: new Date(),
    }).where(eq(backups.id, backupId));

    throw err;
  } finally {
    // Always clean up temp directory
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function cleanupOldBackups() {
  try {
    const [retentionSetting] = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, 'backup_retention_days'));

    const retentionDays = parseInt(retentionSetting?.value || '30', 10);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);

    const expired = await db
      .select()
      .from(backups)
      .where(and(
        eq(backups.status, 'completed'),
        lt(backups.createdAt, cutoff),
      ));

    if (expired.length === 0) return;

    const provider = await getStorageProvider().catch(() => null);

    for (const backup of expired) {
      if (provider && backup.fileName) {
        try {
          await provider.delete(backup.fileName);
        } catch { /* best effort */ }
      }
      await db.delete(backups).where(eq(backups.id, backup.id));
    }

    console.log(`[backup] Retention cleanup: removed ${expired.length} old backups`);
  } catch (err: any) {
    console.error('[backup] Retention cleanup failed:', err.message);
  }
}
