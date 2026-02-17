import type { Job } from 'bullmq';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { db } from '../db';
import { backups, backupDestinations, backupUploads, appSettings } from '../db/schema';
import { eq, lt, and } from 'drizzle-orm';
import { createBackupArchive } from '../lib/backupArchive';
import { createProviderForDestination } from '../lib/backupStorage';
import { logActivity } from '../lib/activityLog';

export async function processBackupJob(job: Job) {
  const { backupId, triggeredBy, userId } = job.data;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-'));

  try {
    // If no backupId (scheduled job), create backup + upload records
    let effectiveBackupId = backupId;
    if (!effectiveBackupId) {
      const activeDests = await db
        .select()
        .from(backupDestinations)
        .where(eq(backupDestinations.isActive, true));

      if (activeDests.length === 0) {
        console.log('[backup] No active destinations, skipping scheduled backup');
        return;
      }

      const providerLabel = activeDests.length === 1 ? activeDests[0].provider : 'multi';
      const [record] = await db
        .insert(backups)
        .values({
          provider: providerLabel,
          triggeredBy: triggeredBy || 'scheduled',
          userId: userId || null,
        })
        .returning();

      effectiveBackupId = record.id;

      for (const dest of activeDests) {
        await db.insert(backupUploads).values({
          backupId: effectiveBackupId,
          destinationId: dest.id,
        });
      }
    }

    // Mark as running
    await db.update(backups).set({
      status: 'running',
      startedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(backups.id, effectiveBackupId));

    // Create archive once
    console.log('[backup] Creating archive...');
    const { archivePath, manifest } = await createBackupArchive(tempDir);
    const fileSize = fs.statSync(archivePath).size;
    const fileName = `backups/${path.basename(archivePath)}`;

    // Get upload rows with destinations
    const uploads = await db.query.backupUploads.findMany({
      where: eq(backupUploads.backupId, effectiveBackupId),
      with: { destination: true },
    });

    // If no upload rows (legacy backup), nothing to upload
    if (uploads.length === 0) {
      console.log('[backup] No upload rows found (legacy?), marking completed');
      await db.update(backups).set({
        status: 'completed',
        fileName,
        fileSize,
        manifest: JSON.stringify(manifest),
        completedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(backups.id, effectiveBackupId));
      return { backupId: effectiveBackupId, fileName, fileSize };
    }

    // Upload to all destinations in parallel
    console.log(`[backup] Uploading to ${uploads.length} destination(s)...`);
    const results = await Promise.allSettled(
      uploads.map(async (upload) => {
        // Mark uploading
        await db.update(backupUploads).set({
          status: 'uploading',
          startedAt: new Date(),
        }).where(eq(backupUploads.id, upload.id));

        try {
          const provider = await createProviderForDestination(upload.destination);
          await provider.upload(fileName, archivePath);

          // Mark completed
          await db.update(backupUploads).set({
            status: 'completed',
            completedAt: new Date(),
          }).where(eq(backupUploads.id, upload.id));

          console.log(`[backup] ✓ Uploaded to "${upload.destination.name}"`);
        } catch (err: any) {
          // Mark failed
          await db.update(backupUploads).set({
            status: 'failed',
            errorMessage: err.message,
            completedAt: new Date(),
          }).where(eq(backupUploads.id, upload.id));

          console.error(`[backup] ✗ Failed to upload to "${upload.destination.name}": ${err.message}`);
          throw err;
        }
      })
    );

    // Determine overall status
    const successes = results.filter((r) => r.status === 'fulfilled').length;
    const failures = results.filter((r) => r.status === 'rejected').length;

    let overallStatus: 'completed' | 'partial' | 'failed';
    if (failures === 0) {
      overallStatus = 'completed';
    } else if (successes === 0) {
      overallStatus = 'failed';
    } else {
      overallStatus = 'partial';
    }

    // Collect error messages from failed uploads
    const errorMessages = results
      .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      .map((r) => r.reason?.message || 'Unknown error');

    // Update backup record
    await db.update(backups).set({
      status: overallStatus,
      fileName,
      fileSize,
      manifest: JSON.stringify(manifest),
      ...(errorMessages.length > 0 && { errorMessage: errorMessages.join('; ') }),
      completedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(backups.id, effectiveBackupId));

    // Activity log
    logActivity({
      userId: userId || null,
      userDisplayName: triggeredBy === 'scheduled' ? 'System' : 'Admin',
      action: 'backup_created',
      entityType: 'backup',
      entityId: effectiveBackupId,
      entityLabel: path.basename(archivePath),
      details: `Size: ${(fileSize / 1024 / 1024).toFixed(1)} MB — ${successes}/${uploads.length} destinations`,
    });

    // Retention cleanup
    await cleanupOldBackups();

    console.log(`[backup] ${overallStatus} — ${path.basename(archivePath)} (${(fileSize / 1024 / 1024).toFixed(1)} MB) — ${successes}/${uploads.length} destinations`);
    return { backupId: effectiveBackupId, fileName, fileSize, status: overallStatus };
  } catch (err: any) {
    // Mark as failed (only if not already set by per-destination logic)
    if (backupId) {
      const [current] = await db.select({ status: backups.status }).from(backups).where(eq(backups.id, backupId));
      if (current?.status === 'running') {
        await db.update(backups).set({
          status: 'failed',
          errorMessage: err.message,
          updatedAt: new Date(),
        }).where(eq(backups.id, backupId));
      }
    }
    throw err;
  } finally {
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

    // Find expired backups with their upload details
    const expired = await db.query.backups.findMany({
      where: and(
        eq(backups.status, 'completed'),
        lt(backups.createdAt, cutoff),
      ),
      with: {
        uploads: {
          with: { destination: true },
        },
      },
    });

    if (expired.length === 0) return;

    for (const backup of expired) {
      // Delete from each destination where upload completed
      if (backup.fileName) {
        for (const upload of (backup.uploads || [])) {
          if (upload.status === 'completed' && upload.destination) {
            try {
              const provider = await createProviderForDestination(upload.destination);
              await provider.delete(backup.fileName);
            } catch { /* best effort */ }
          }
        }
      }
      // DB cascade handles upload rows
      await db.delete(backups).where(eq(backups.id, backup.id));
    }

    console.log(`[backup] Retention cleanup: removed ${expired.length} old backups`);
  } catch (err: any) {
    console.error('[backup] Retention cleanup failed:', err.message);
  }
}
