import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { eq, count } from 'drizzle-orm';
import { db } from '../db';
import { appSettings, user } from '../db/schema';
import { auth } from '../auth';
import { createProviderFromCredentials } from '../lib/backupStorage';
import { extractBackupArchive } from '../lib/backupArchive';

const projectRoot = path.resolve(import.meta.dirname, '../..');

// ── Guard: block all setup routes if setup is already done ──

async function requireSetupIncomplete(request: any, reply: any) {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, 'setup_complete'));
  if (row?.value === 'true') {
    return reply.code(403).send({ error: 'Setup already completed' });
  }
}

// ── Routes ──

export default async function setupRoutes(fastify: any) {
  // GET /api/setup — check setup status
  fastify.get('/', async () => {
    const [row] = await db.select().from(appSettings).where(eq(appSettings.key, 'setup_complete'));

    if (row) {
      return { data: { complete: row.value === 'true' } };
    }

    // No setup_complete key — check if users already exist (migration safety)
    const [{ total }] = await db.select({ total: count() }).from(user);

    if (total > 0) {
      // Users exist but no setup_complete flag — mark as complete
      await db
        .insert(appSettings)
        .values({ key: 'setup_complete', value: 'true', updatedAt: new Date() })
        .onConflictDoUpdate({ target: appSettings.key, set: { value: 'true', updatedAt: new Date() } });
      return { data: { complete: true } };
    }

    // No users — fresh install
    await db
      .insert(appSettings)
      .values({ key: 'setup_complete', value: 'false', updatedAt: new Date() })
      .onConflictDoUpdate({ target: appSettings.key, set: { value: 'false', updatedAt: new Date() } });
    return { data: { complete: false } };
  });

  // POST /api/setup/fresh — create first user and mark setup complete
  fastify.post('/fresh', { preHandler: [requireSetupIncomplete] }, async (request: any, reply: any) => {
    try {
      const { name, email, password, companyName } = request.body;

      // Create the first user via Better Auth (databaseHooks auto-creates admin profile)
      await auth.api.createUser({ body: { email, password, name } });

      // Save company name
      if (companyName) {
        await db
          .insert(appSettings)
          .values({ key: 'company_name', value: companyName, updatedAt: new Date() })
          .onConflictDoUpdate({ target: appSettings.key, set: { value: companyName, updatedAt: new Date() } });
      }

      // Mark setup complete
      await db
        .insert(appSettings)
        .values({ key: 'setup_complete', value: 'true', updatedAt: new Date() })
        .onConflictDoUpdate({ target: appSettings.key, set: { value: 'true', updatedAt: new Date() } });

      return { data: { success: true } };
    } catch (err: any) {
      return reply.code(400).send({ error: err.message || 'Failed to create user' });
    }
  });

  // POST /api/setup/restore/test — test backup storage connection
  fastify.post('/restore/test', { preHandler: [requireSetupIncomplete] }, async (request: any) => {
    try {
      const { provider, ...credentials } = request.body;
      const storageProvider = createProviderFromCredentials(provider, credentials);
      const result = await storageProvider.testConnection();
      return { data: result };
    } catch (err: any) {
      return { data: { success: false, message: err.message || 'Connection test failed' } };
    }
  });

  // POST /api/setup/restore/list — list available backups
  fastify.post('/restore/list', { preHandler: [requireSetupIncomplete] }, async (request: any) => {
    try {
      const { provider, ...credentials } = request.body;
      const storageProvider = createProviderFromCredentials(provider, credentials);
      const items = await storageProvider.list();

      // Sort newest first
      items.sort((a: any, b: any) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime());

      return { data: items };
    } catch (err: any) {
      return { data: [] };
    }
  });

  // POST /api/setup/restore/execute — download and restore a backup
  fastify.post(
    '/restore/execute',
    { preHandler: [requireSetupIncomplete], config: { timeout: 300000 } },
    async (request: any, reply: any) => {
      let tempDir: string | null = null;

      try {
        const { provider, backupKey, fileId, ...credentials } = request.body;

        // 1. Create storage provider
        const storageProvider = createProviderFromCredentials(provider, credentials);

        // 2. Create temp directory
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'setup-restore-'));
        const archivePath = path.join(tempDir, 'backup.tar.gz');
        const extractDir = path.join(tempDir, 'extracted');

        // 3. Download the backup archive
        await storageProvider.download(backupKey, archivePath);

        // 4. Extract the archive
        const manifest = await extractBackupArchive(archivePath, extractDir);

        // 5. Restore database via psql
        const sqlPath = path.join(extractDir, 'database.sql');
        if (fs.existsSync(sqlPath)) {
          const dbUrl = new URL(process.env.DATABASE_URL!);
          execSync(
            `psql -h ${dbUrl.hostname} -p ${dbUrl.port || '5432'} -U ${dbUrl.username} -d ${dbUrl.pathname.replace(/^\//, '')} -f "${sqlPath}"`,
            {
              stdio: ['pipe', 'pipe', 'pipe'],
              env: { ...process.env, PGPASSWORD: decodeURIComponent(dbUrl.password) },
            },
          );
        }

        // 6. Restore uploads
        const uploadsPath = path.join(extractDir, 'uploads');
        if (fs.existsSync(uploadsPath)) {
          fs.cpSync(uploadsPath, path.join(projectRoot, 'server/uploads'), { recursive: true });
        }

        // 7. Run drizzle-kit push to sync schema
        execSync('npx drizzle-kit push', {
          cwd: projectRoot,
          env: process.env,
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        // 8. Mark setup complete
        await db
          .insert(appSettings)
          .values({ key: 'setup_complete', value: 'true', updatedAt: new Date() })
          .onConflictDoUpdate({ target: appSettings.key, set: { value: 'true', updatedAt: new Date() } });

        return { data: { success: true, manifest } };
      } catch (err: any) {
        return reply.code(500).send({ error: err.message || 'Restore failed' });
      } finally {
        // 9. Clean up temp directory
        if (tempDir && fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
      }
    },
  );
}
