import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

export interface BackupManifest {
  version: string;
  appVersion: string;
  timestamp: string;
  dbName: string;
  nodeVersion: string;
}

/**
 * Creates a full backup archive containing:
 *   - database.sql  (pg_dump of the app database)
 *   - uploads/      (copy of server/uploads)
 *   - .env          (environment file)
 *   - manifest.json (metadata about the backup)
 *
 * The resulting .tar.gz is written into `tempDir` and the temporary
 * working directory is cleaned up before returning.
 */
export async function createBackupArchive(
  tempDir: string,
): Promise<{ archivePath: string; manifest: BackupManifest }> {
  const workDir = path.join(tempDir, 'backup-work');
  fs.mkdirSync(workDir, { recursive: true });

  const projectRoot = path.resolve(import.meta.dirname, '../..');

  // --- pg_dump -----------------------------------------------------------
  const dbUrl = new URL(process.env.DATABASE_URL!);
  const host = dbUrl.hostname;
  const port = dbUrl.port || '5432';
  const username = dbUrl.username;
  const password = dbUrl.password;
  const dbName = dbUrl.pathname.replace(/^\//, '');

  try {
    execSync(
      `pg_dump -h ${host} -p ${port} -U ${username} -d ${dbName} --format=plain --no-owner --no-privileges > database.sql`,
      { cwd: workDir, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, PGPASSWORD: password } },
    );
  } catch (err: any) {
    const stderr = err.stderr?.toString() || '';
    throw new Error(`pg_dump failed: ${stderr || err.message}`);
  }

  // --- Copy uploads ------------------------------------------------------
  const uploadsSource = path.join(projectRoot, 'server/uploads');
  if (fs.existsSync(uploadsSource)) {
    fs.cpSync(uploadsSource, path.join(workDir, 'uploads'), { recursive: true });
  }

  // --- Copy .env ---------------------------------------------------------
  const envSource = path.join(projectRoot, '.env');
  if (fs.existsSync(envSource)) {
    fs.copyFileSync(envSource, path.join(workDir, '.env'));
  }

  // --- Build manifest ----------------------------------------------------
  const pkgPath = path.join(projectRoot, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

  const manifest: BackupManifest = {
    version: '1.0.0',
    appVersion: pkg.version,
    timestamp: new Date().toISOString(),
    dbName,
    nodeVersion: process.version,
  };

  fs.writeFileSync(
    path.join(workDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
  );

  // --- Create tar.gz -----------------------------------------------------
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const datePart = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const timePart = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const filename = `backup-${datePart}-${timePart}.tar.gz`;

  try {
    execSync(`tar -czf ${filename} -C backup-work .`, {
      cwd: tempDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err: any) {
    const stderr = err.stderr?.toString() || '';
    throw new Error(`tar archive creation failed: ${stderr || err.message}`);
  }

  // --- Clean up work dir -------------------------------------------------
  fs.rmSync(workDir, { recursive: true, force: true });

  return { archivePath: path.join(tempDir, filename), manifest };
}

/**
 * Extracts a previously-created backup archive into `destDir` and
 * returns the embedded manifest.
 */
export async function extractBackupArchive(
  archivePath: string,
  destDir: string,
): Promise<BackupManifest> {
  fs.mkdirSync(destDir, { recursive: true });

  try {
    execSync(`tar -xzf ${archivePath} -C ${destDir}`, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err: any) {
    const stderr = err.stderr?.toString() || '';
    throw new Error(`tar extraction failed: ${stderr || err.message}`);
  }

  const manifestPath = path.join(destDir, 'manifest.json');
  const manifest: BackupManifest = JSON.parse(
    fs.readFileSync(manifestPath, 'utf-8'),
  );

  return manifest;
}
