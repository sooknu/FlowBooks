import { db } from '../db';
import { appSettings, backups } from '../db/schema';
import { eq, desc, inArray } from 'drizzle-orm';
import { requirePermission } from '../lib/permissions';
import { logActivity, actorFromRequest } from '../lib/activityLog';
import { backupQueue } from '../lib/queue';
import { createProviderFromCredentials, getStorageProvider } from '../lib/backupStorage';

const ALL_BACKUP_KEYS = [
  'backup_provider',
  'backup_enabled',
  'backup_schedule',
  'backup_retention_days',
  'backup_s3_access_key',
  'backup_s3_secret_key',
  'backup_s3_bucket',
  'backup_s3_region',
  'backup_s3_endpoint',
  'backup_b2_key_id',
  'backup_b2_app_key',
  'backup_b2_bucket',
  'backup_b2_endpoint',
  'backup_gdrive_credentials',
  'backup_gdrive_folder_id',
];

const SENSITIVE_BACKUP_KEYS = [
  'backup_s3_secret_key',
  'backup_b2_app_key',
  'backup_gdrive_credentials',
];

export default async function backupRoutes(fastify: any) {
  // GET /api/backups — get backup configuration
  fastify.get('/', { preHandler: [requirePermission('manage_backups')] }, async (request: any) => {
    const settings = await db
      .select()
      .from(appSettings)
      .where(inArray(appSettings.key, ALL_BACKUP_KEYS));

    const map: Record<string, string> = {};
    for (const s of settings) {
      map[s.key] = s.value;
    }

    return { data: map };
  });

  // PUT /api/backups — save backup configuration
  fastify.put('/', { preHandler: [requirePermission('manage_backups')] }, async (request: any) => {
    const { settings } = request.body;
    const userId = request.user.id;

    let scheduleChanged = false;
    let newSchedule = '';

    for (const { key, value } of settings) {
      if (!ALL_BACKUP_KEYS.includes(key)) continue;
      if (SENSITIVE_BACKUP_KEYS.includes(key) && value === '********') continue;

      await db
        .insert(appSettings)
        .values({
          key,
          value: String(value),
          updatedAt: new Date(),
          lastEditedBy: userId,
        })
        .onConflictDoUpdate({
          target: appSettings.key,
          set: {
            value: String(value),
            updatedAt: new Date(),
            lastEditedBy: userId,
          },
        });

      if (key === 'backup_schedule') {
        scheduleChanged = true;
        newSchedule = String(value);
      }
    }

    // Update BullMQ scheduler if schedule changed
    if (scheduleChanged) {
      if (newSchedule === 'daily') {
        await backupQueue.upsertJobScheduler(
          'scheduled-backup',
          { pattern: '0 2 * * *' },
          { name: 'scheduled-backup', data: { triggeredBy: 'scheduled' } } as any
        );
      } else if (newSchedule === 'weekly') {
        await backupQueue.upsertJobScheduler(
          'scheduled-backup',
          { pattern: '0 2 * * 0' },
          { name: 'scheduled-backup', data: { triggeredBy: 'scheduled' } } as any
        );
      } else {
        // 'manual' or any other value — remove scheduler
        await backupQueue.removeJobScheduler('scheduled-backup').catch(() => {});
      }
    }

    const changedKeys = settings
      .filter((s: any) => ALL_BACKUP_KEYS.includes(s.key))
      .filter((s: any) => !(SENSITIVE_BACKUP_KEYS.includes(s.key) && s.value === '********'))
      .map((s: any) => s.key);

    if (changedKeys.length > 0) {
      logActivity({
        ...actorFromRequest(request),
        action: 'settings_changed',
        entityType: 'backup',
        details: 'Updated backup settings: ' + changedKeys.join(', '),
      });
    }

    return { data: { success: true } };
  });

  // POST /api/backups/create — trigger a manual backup
  fastify.post('/create', { preHandler: [requirePermission('manage_backups')] }, async (request: any, reply: any) => {
    // Check that a provider is configured
    const providerSetting = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, 'backup_provider'));

    const provider = providerSetting[0]?.value;
    if (!provider || provider === 'none') {
      return reply.code(400).send({ error: 'No backup storage provider configured' });
    }

    // Create backup record
    const [record] = await db
      .insert(backups)
      .values({
        provider,
        triggeredBy: 'manual',
        userId: request.user.id,
      })
      .returning();

    // Queue the backup job
    await backupQueue.add('manual-backup', {
      triggeredBy: 'manual',
      userId: request.user.id,
      backupId: record.id,
    });

    return { data: { id: record.id } };
  });

  // GET /api/backups/history — list recent backups
  fastify.get('/history', { preHandler: [requirePermission('manage_backups')] }, async (request: any) => {
    const rows = await db
      .select()
      .from(backups)
      .orderBy(desc(backups.createdAt))
      .limit(50);

    return { data: rows };
  });

  // DELETE /api/backups/:id — delete a backup record and its cloud file
  fastify.delete('/:id', { preHandler: [requirePermission('manage_backups')] }, async (request: any, reply: any) => {
    const { id } = request.params;

    const [backup] = await db
      .select()
      .from(backups)
      .where(eq(backups.id, id));

    if (!backup) {
      return reply.code(404).send({ error: 'Backup not found' });
    }

    // If completed and has a file, try to delete from cloud storage (best effort)
    if (backup.status === 'completed' && backup.fileName) {
      const provider = await getStorageProvider().catch(() => null);
      if (provider && backup.fileName) {
        await provider.delete(backup.fileName).catch(() => {});
      }
    }

    // Delete from database
    await db.delete(backups).where(eq(backups.id, id));

    logActivity({
      ...actorFromRequest(request),
      action: 'backup_deleted',
      entityType: 'backup',
      entityId: id,
      entityLabel: backup.fileName || id,
    });

    return { data: { success: true } };
  });

  // POST /api/backups/test-connection — test storage provider connectivity
  fastify.post('/test-connection', { preHandler: [requirePermission('manage_backups')] }, async (request: any) => {
    const { provider, ...credentials } = request.body;

    try {
      // If any credential is masked ('********'), the form was saved and
      // the real values are in the DB — use getStorageProvider() instead.
      const hasMasked = Object.values(credentials).some((v) => v === '********');
      const storageProvider = hasMasked
        ? await getStorageProvider()
        : createProviderFromCredentials(provider, credentials);
      const result = await storageProvider.testConnection();
      return { data: result };
    } catch (err: any) {
      return { data: { success: false, message: err.message } };
    }
  });
}
