import { db } from '../db';
import { appSettings, backups, backupDestinations, backupUploads } from '../db/schema';
import { eq, desc, inArray } from 'drizzle-orm';
import { requirePermission } from '../lib/permissions';
import { logActivity, actorFromRequest } from '../lib/activityLog';
import { backupQueue } from '../lib/queue';
import { createProviderForDestination } from '../lib/backupStorage';

// ── Credential masking ──

const SENSITIVE_FIELDS: Record<string, string[]> = {
  s3: ['secretAccessKey'],
  b2: ['appKey'],
  gdrive: ['credentialsJson', 'refreshToken'],
};

function maskCredentials(provider: string, creds: Record<string, any>): Record<string, any> {
  const sensitive = SENSITIVE_FIELDS[provider] || [];
  const masked = { ...creds };
  for (const key of sensitive) {
    if (masked[key]) masked[key] = '********';
  }
  return masked;
}

function mergeCredentials(
  existing: Record<string, any>,
  incoming: Record<string, any>,
  provider: string
): Record<string, any> {
  const sensitive = SENSITIVE_FIELDS[provider] || [];
  const merged = { ...incoming };
  for (const key of sensitive) {
    if (merged[key] === '********') {
      merged[key] = existing[key];
    }
  }
  return merged;
}

// ── Global settings keys ──

const GLOBAL_BACKUP_KEYS = ['backup_schedule', 'backup_retention_days'];

// ── Legacy flat config keys (for migration) ──

const LEGACY_BACKUP_KEYS = [
  'backup_provider',
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

// ── Migration from flat config to destinations table ──

async function migrateToMultiDestination() {
  // Skip if destinations already exist
  const existing = await db.select({ id: backupDestinations.id }).from(backupDestinations).limit(1);
  if (existing.length > 0) return;

  // Read old flat config
  const rows = await db
    .select()
    .from(appSettings)
    .where(inArray(appSettings.key, LEGACY_BACKUP_KEYS));

  const settings: Record<string, string> = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }

  const provider = settings.backup_provider;
  if (!provider || provider === 'none') return;

  // Build credentials JSONB from flat keys
  let credentials: Record<string, string> = {};
  let name = '';

  switch (provider) {
    case 's3':
      credentials = {
        accessKeyId: settings.backup_s3_access_key || '',
        secretAccessKey: settings.backup_s3_secret_key || '',
        bucket: settings.backup_s3_bucket || '',
        region: settings.backup_s3_region || 'us-east-1',
        endpoint: settings.backup_s3_endpoint || '',
      };
      name = `S3 — ${credentials.bucket || 'Migrated'}`;
      break;
    case 'b2':
      credentials = {
        keyId: settings.backup_b2_key_id || '',
        appKey: settings.backup_b2_app_key || '',
        bucket: settings.backup_b2_bucket || '',
        endpoint: settings.backup_b2_endpoint || '',
      };
      name = `B2 — ${credentials.bucket || 'Migrated'}`;
      break;
    case 'gdrive':
      credentials = {
        credentialsJson: settings.backup_gdrive_credentials || '',
        folderId: settings.backup_gdrive_folder_id || '',
      };
      name = 'Google Drive — Migrated';
      break;
    default:
      return;
  }

  // Only migrate if at least one credential field has a value
  const hasValues = Object.values(credentials).some((v) => v && v.length > 0);
  if (!hasValues) return;

  await db.insert(backupDestinations).values({
    name,
    provider,
    credentials,
  });

  console.log(`[backup] Migrated legacy ${provider} config to backup_destinations`);
}

export default async function backupRoutes(fastify: any) {
  // Run migration on startup
  fastify.addHook('onReady', migrateToMultiDestination);

  // ── GET /api/backup — config + destinations ──

  fastify.get('/', { preHandler: [requirePermission('manage_backups')] }, async () => {
    // Global settings
    const settingRows = await db
      .select()
      .from(appSettings)
      .where(inArray(appSettings.key, GLOBAL_BACKUP_KEYS));

    const settings: Record<string, string> = {};
    for (const row of settingRows) {
      settings[row.key] = row.value;
    }

    // Destinations (masked)
    const dests = await db.select().from(backupDestinations).orderBy(backupDestinations.createdAt);
    const maskedDests = dests.map((d) => ({
      ...d,
      credentials: maskCredentials(d.provider, d.credentials as Record<string, any>),
    }));

    return { data: { settings, destinations: maskedDests } };
  });

  // ── PUT /api/backup — save global settings (schedule + retention) ──

  fastify.put('/', { preHandler: [requirePermission('manage_backups')] }, async (request: any) => {
    const { settings } = request.body;
    const userId = request.user.id;

    let scheduleChanged = false;
    let newSchedule = '';

    for (const { key, value } of settings) {
      if (!GLOBAL_BACKUP_KEYS.includes(key)) continue;

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
        await backupQueue.removeJobScheduler('scheduled-backup').catch(() => {});
      }
    }

    logActivity({
      ...actorFromRequest(request),
      action: 'settings_changed',
      entityType: 'backup',
      details: 'Updated backup global settings',
    });

    return { data: { success: true } };
  });

  // ── Destination CRUD ──

  // GET /api/backup/destinations
  fastify.get('/destinations', { preHandler: [requirePermission('manage_backups')] }, async () => {
    const dests = await db.select().from(backupDestinations).orderBy(backupDestinations.createdAt);
    return {
      data: dests.map((d) => ({
        ...d,
        credentials: maskCredentials(d.provider, d.credentials as Record<string, any>),
      })),
    };
  });

  // POST /api/backup/destinations
  fastify.post('/destinations', { preHandler: [requirePermission('manage_backups')] }, async (request: any) => {
    const { name, provider, credentials, isActive } = request.body;

    const [dest] = await db
      .insert(backupDestinations)
      .values({
        name,
        provider,
        credentials,
        isActive: isActive !== false,
      })
      .returning();

    logActivity({
      ...actorFromRequest(request),
      action: 'destination_created',
      entityType: 'backup',
      entityId: dest.id,
      entityLabel: name,
    });

    return {
      data: {
        ...dest,
        credentials: maskCredentials(dest.provider, dest.credentials as Record<string, any>),
      },
    };
  });

  // PUT /api/backup/destinations/:id
  fastify.put('/destinations/:id', { preHandler: [requirePermission('manage_backups')] }, async (request: any, reply: any) => {
    const { id } = request.params;
    const { name, provider, credentials, isActive } = request.body;

    // Get existing to merge masked credentials
    const [existing] = await db.select().from(backupDestinations).where(eq(backupDestinations.id, id));
    if (!existing) {
      return reply.code(404).send({ error: 'Destination not found' });
    }

    const mergedCreds = mergeCredentials(
      existing.credentials as Record<string, any>,
      credentials,
      provider || existing.provider
    );

    const [updated] = await db
      .update(backupDestinations)
      .set({
        ...(name !== undefined && { name }),
        ...(provider !== undefined && { provider }),
        credentials: mergedCreds,
        ...(isActive !== undefined && { isActive }),
        updatedAt: new Date(),
      })
      .where(eq(backupDestinations.id, id))
      .returning();

    logActivity({
      ...actorFromRequest(request),
      action: 'destination_updated',
      entityType: 'backup',
      entityId: id,
      entityLabel: updated.name,
    });

    return {
      data: {
        ...updated,
        credentials: maskCredentials(updated.provider, updated.credentials as Record<string, any>),
      },
    };
  });

  // DELETE /api/backup/destinations/:id
  fastify.delete('/destinations/:id', { preHandler: [requirePermission('manage_backups')] }, async (request: any, reply: any) => {
    const { id } = request.params;

    const [dest] = await db.select().from(backupDestinations).where(eq(backupDestinations.id, id));
    if (!dest) {
      return reply.code(404).send({ error: 'Destination not found' });
    }

    await db.delete(backupDestinations).where(eq(backupDestinations.id, id));

    logActivity({
      ...actorFromRequest(request),
      action: 'destination_deleted',
      entityType: 'backup',
      entityId: id,
      entityLabel: dest.name,
    });

    return { data: { success: true } };
  });

  // PUT /api/backup/destinations/:id/toggle
  fastify.put('/destinations/:id/toggle', { preHandler: [requirePermission('manage_backups')] }, async (request: any, reply: any) => {
    const { id } = request.params;

    const [dest] = await db.select().from(backupDestinations).where(eq(backupDestinations.id, id));
    if (!dest) {
      return reply.code(404).send({ error: 'Destination not found' });
    }

    const [updated] = await db
      .update(backupDestinations)
      .set({ isActive: !dest.isActive, updatedAt: new Date() })
      .where(eq(backupDestinations.id, id))
      .returning();

    return {
      data: {
        ...updated,
        credentials: maskCredentials(updated.provider, updated.credentials as Record<string, any>),
      },
    };
  });

  // POST /api/backup/destinations/:id/test
  fastify.post('/destinations/:id/test', { preHandler: [requirePermission('manage_backups')] }, async (request: any, reply: any) => {
    const { id } = request.params;

    const [dest] = await db.select().from(backupDestinations).where(eq(backupDestinations.id, id));
    if (!dest) {
      return reply.code(404).send({ error: 'Destination not found' });
    }

    try {
      const provider = await createProviderForDestination(dest);
      const result = await provider.testConnection();
      return { data: result };
    } catch (err: any) {
      return { data: { success: false, message: err.message } };
    }
  });

  // POST /api/backup/destinations/test-unsaved — test with raw credentials (before saving)
  fastify.post('/destinations/test-unsaved', { preHandler: [requirePermission('manage_backups')] }, async (request: any) => {
    const { provider, credentials } = request.body;

    try {
      const storageProvider = await createProviderForDestination({ provider, credentials });
      const result = await storageProvider.testConnection();
      return { data: result };
    } catch (err: any) {
      return { data: { success: false, message: err.message } };
    }
  });

  // ── POST /api/backup/create — trigger manual backup ──

  fastify.post('/create', { preHandler: [requirePermission('manage_backups')] }, async (request: any, reply: any) => {
    // Get active destinations
    const activeDests = await db
      .select()
      .from(backupDestinations)
      .where(eq(backupDestinations.isActive, true));

    if (activeDests.length === 0) {
      return reply.code(400).send({ error: 'No active backup destinations configured' });
    }

    // Create backup record
    const providerLabel = activeDests.length === 1 ? activeDests[0].provider : 'multi';
    const [record] = await db
      .insert(backups)
      .values({
        provider: providerLabel,
        triggeredBy: 'manual',
        userId: request.user.id,
      })
      .returning();

    // Create upload rows for each destination
    for (const dest of activeDests) {
      await db.insert(backupUploads).values({
        backupId: record.id,
        destinationId: dest.id,
      });
    }

    // Queue the backup job
    await backupQueue.add('manual-backup', {
      triggeredBy: 'manual',
      userId: request.user.id,
      backupId: record.id,
    });

    return { data: { id: record.id } };
  });

  // ── GET /api/backup/history — list recent backups with upload details ──

  fastify.get('/history', { preHandler: [requirePermission('manage_backups')] }, async () => {
    const rows = await db.query.backups.findMany({
      orderBy: [desc(backups.createdAt)],
      limit: 50,
      with: {
        uploads: {
          with: {
            destination: true,
          },
        },
      },
    });

    return { data: rows };
  });

  // ── DELETE /api/backup/:id — delete backup + cloud files ──

  fastify.delete('/:id', { preHandler: [requirePermission('manage_backups')] }, async (request: any, reply: any) => {
    const { id } = request.params;

    const backup = await db.query.backups.findFirst({
      where: eq(backups.id, id),
      with: {
        uploads: {
          with: { destination: true },
        },
      },
    });

    if (!backup) {
      return reply.code(404).send({ error: 'Backup not found' });
    }

    // Delete from cloud storage for each completed upload (best effort)
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

    // Delete from database (cascades to backup_uploads)
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
}
