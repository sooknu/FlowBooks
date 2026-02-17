#!/usr/bin/env node

/**
 * Restore Script — Disaster Recovery CLI
 *
 * Restores a backup from cloud storage (AWS S3, Backblaze B2, or Google Drive).
 * Run after cloning the repo and running `npm install` on a fresh VPS.
 *
 * Usage:  npm run restore
 *         node scripts/restore.js
 */

import readline from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

// ─── Readline helpers ──────────────────────────────────────────────────────

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

function askPassword(question) {
  return new Promise((resolve) => {
    process.stdout.write(question);
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    if (stdin.isTTY) stdin.setRawMode(true);

    let input = '';
    const onData = (ch) => {
      const c = ch.toString();
      if (c === '\n' || c === '\r') {
        if (stdin.isTTY) stdin.setRawMode(wasRaw);
        stdin.removeListener('data', onData);
        process.stdout.write('\n');
        resolve(input);
      } else if (c === '\u0003') {
        // Ctrl+C
        process.exit(1);
      } else if (c === '\u007F' || c === '\b') {
        if (input.length > 0) {
          input = input.slice(0, -1);
          process.stdout.write('\b \b');
        }
      } else {
        input += c;
        process.stdout.write('*');
      }
    };
    stdin.on('data', onData);
  });
}

function banner(text) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ${text}`);
  console.log(`${'─'.repeat(60)}\n`);
}

function success(msg) { console.log(`  \x1b[32m✓\x1b[0m ${msg}`); }
function info(msg) { console.log(`  \x1b[34mℹ\x1b[0m ${msg}`); }
function warn(msg) { console.log(`  \x1b[33m⚠\x1b[0m ${msg}`); }
function error(msg) { console.log(`  \x1b[31m✗\x1b[0m ${msg}`); }

// ─── Provider factories ────────────────────────────────────────────────────

async function createS3Provider(config) {
  const {
    S3Client, ListObjectsV2Command, GetObjectCommand,
  } = await import('@aws-sdk/client-s3');

  const client = new S3Client({
    region: config.region || 'us-east-1',
    endpoint: config.endpoint || undefined,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: !!config.endpoint,
  });

  return {
    async list() {
      const response = await client.send(new ListObjectsV2Command({
        Bucket: config.bucket,
        Prefix: 'backups/',
      }));
      if (!response.Contents) return [];
      return response.Contents
        .filter((obj) => obj.Key && obj.Key.endsWith('.tar.gz'))
        .map((obj) => ({
          key: obj.Key,
          size: obj.Size || 0,
          lastModified: obj.LastModified || new Date(),
        }))
        .sort((a, b) => b.lastModified - a.lastModified);
    },

    async download(key, destPath) {
      const response = await client.send(new GetObjectCommand({
        Bucket: config.bucket,
        Key: key,
      }));
      if (!response.Body) throw new Error('Empty response body');
      const writeStream = fs.createWriteStream(destPath);
      let readable;
      if (response.Body instanceof Readable) {
        readable = response.Body;
      } else {
        readable = Readable.fromWeb(response.Body);
      }
      await pipeline(readable, writeStream);
    },
  };
}

async function createGDriveProvider(config) {
  const { google } = await import('googleapis');

  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(config.credentialsJson),
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  });
  const drive = google.drive({ version: 'v3', auth });

  return {
    async list() {
      const response = await drive.files.list({
        q: `'${config.folderId}' in parents and name contains 'backup-' and trashed = false`,
        fields: 'files(id, name, size, modifiedTime)',
        orderBy: 'modifiedTime desc',
      });
      if (!response.data.files) return [];
      return response.data.files.map((file) => ({
        key: file.name,
        fileId: file.id,
        size: parseInt(file.size || '0', 10),
        lastModified: new Date(file.modifiedTime || Date.now()),
      }));
    },

    async download(key, destPath, fileId) {
      const id = fileId || (await this.list()).find((f) => f.key === key)?.fileId;
      if (!id) throw new Error(`File not found: ${key}`);
      const response = await drive.files.get(
        { fileId: id, alt: 'media' },
        { responseType: 'stream' },
      );
      const writeStream = fs.createWriteStream(destPath);
      await pipeline(response.data, writeStream);
    },
  };
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  banner('Backup Restore — Disaster Recovery');

  info('This script restores your app from a cloud backup.');
  info('You need your cloud storage credentials to proceed.\n');

  // 1. Select provider
  console.log('  Select your backup storage provider:\n');
  console.log('    1) AWS S3');
  console.log('    2) Backblaze B2');
  console.log('    3) Google Drive');
  console.log();

  const providerChoice = await ask('  Choice (1-3): ');
  const providerMap = { '1': 's3', '2': 'b2', '3': 'gdrive' };
  const providerType = providerMap[providerChoice.trim()];

  if (!providerType) {
    error('Invalid choice. Exiting.');
    process.exit(1);
  }

  // 2. Collect credentials
  let provider;

  if (providerType === 's3') {
    banner('AWS S3 Credentials');
    const accessKeyId = await ask('  Access Key ID: ');
    const secretAccessKey = await askPassword('  Secret Access Key: ');
    const bucket = await ask('  Bucket name: ');
    const region = (await ask('  Region [us-east-1]: ')) || 'us-east-1';
    const endpoint = await ask('  Endpoint (leave blank for AWS): ');

    provider = await createS3Provider({
      accessKeyId: accessKeyId.trim(),
      secretAccessKey: secretAccessKey.trim(),
      bucket: bucket.trim(),
      region: region.trim(),
      endpoint: endpoint.trim() || undefined,
    });
  } else if (providerType === 'b2') {
    banner('Backblaze B2 Credentials');
    const keyId = await ask('  Key ID: ');
    const appKey = await askPassword('  Application Key: ');
    const bucket = await ask('  Bucket name: ');
    const endpoint = await ask('  Endpoint (e.g. https://s3.us-west-004.backblazeb2.com): ');

    provider = await createS3Provider({
      accessKeyId: keyId.trim(),
      secretAccessKey: appKey.trim(),
      bucket: bucket.trim(),
      region: 'auto',
      endpoint: endpoint.trim(),
    });
  } else {
    banner('Google Drive Credentials');
    info('Paste your service account JSON (then press Enter twice):');
    let jsonInput = '';
    while (true) {
      const line = await ask('');
      if (line === '' && jsonInput.trim().endsWith('}')) break;
      jsonInput += line + '\n';
    }

    const folderId = await ask('  Folder ID: ');

    // Validate JSON
    try {
      JSON.parse(jsonInput.trim());
    } catch {
      error('Invalid JSON credentials. Exiting.');
      process.exit(1);
    }

    provider = await createGDriveProvider({
      credentialsJson: jsonInput.trim(),
      folderId: folderId.trim(),
    });
  }

  // 3. List available backups
  banner('Available Backups');
  info('Connecting to cloud storage...\n');

  let backupList;
  try {
    backupList = await provider.list();
  } catch (err) {
    error(`Failed to list backups: ${err.message}`);
    process.exit(1);
  }

  if (backupList.length === 0) {
    warn('No backups found in the configured storage.');
    process.exit(0);
  }

  const formatSize = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  backupList.forEach((b, i) => {
    const date = b.lastModified.toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
    console.log(`    ${i + 1}) ${b.key}  [${formatSize(b.size)}]  ${date}`);
  });
  console.log();

  const backupChoice = await ask(`  Select backup to restore (1-${backupList.length}): `);
  const backupIndex = parseInt(backupChoice.trim(), 10) - 1;

  if (isNaN(backupIndex) || backupIndex < 0 || backupIndex >= backupList.length) {
    error('Invalid choice. Exiting.');
    process.exit(1);
  }

  const selectedBackup = backupList[backupIndex];
  console.log();
  info(`Selected: ${selectedBackup.key}`);

  // 4. Confirm restore
  banner('Confirm Restore');
  warn('This will overwrite the following:');
  console.log('    - .env file (environment variables & secrets)');
  console.log('    - PostgreSQL database (all tables will be replaced)');
  console.log('    - server/uploads/ directory (avatars, branding, documents)');
  console.log();

  const confirm = await ask('  Type "RESTORE" to proceed: ');
  if (confirm.trim() !== 'RESTORE') {
    info('Restore cancelled.');
    process.exit(0);
  }

  // 5. Download
  banner('Downloading Backup');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'restore-'));
  const archivePath = path.join(tempDir, 'backup.tar.gz');

  try {
    info(`Downloading ${selectedBackup.key}...`);
    await provider.download(selectedBackup.key, archivePath, selectedBackup.fileId);
    success(`Downloaded (${formatSize(fs.statSync(archivePath).size)})`);
  } catch (err) {
    error(`Download failed: ${err.message}`);
    fs.rmSync(tempDir, { recursive: true, force: true });
    process.exit(1);
  }

  // 6. Extract
  info('Extracting archive...');
  const extractDir = path.join(tempDir, 'extracted');
  fs.mkdirSync(extractDir, { recursive: true });

  try {
    execSync(`tar -xzf "${archivePath}" -C "${extractDir}"`, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    success('Archive extracted');
  } catch (err) {
    error(`Extraction failed: ${err.stderr?.toString() || err.message}`);
    fs.rmSync(tempDir, { recursive: true, force: true });
    process.exit(1);
  }

  // Read manifest
  const manifestPath = path.join(extractDir, 'manifest.json');
  let manifest = {};
  if (fs.existsSync(manifestPath)) {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    info(`Backup from: ${manifest.timestamp}`);
    info(`App version: ${manifest.appVersion || 'unknown'}`);
    info(`Database: ${manifest.dbName || 'unknown'}`);
  }

  // 7. Restore .env
  banner('Restoring .env');
  const envBackupPath = path.join(extractDir, '.env');
  const envDestPath = path.join(PROJECT_ROOT, '.env');

  if (fs.existsSync(envBackupPath)) {
    // Back up existing .env if present
    if (fs.existsSync(envDestPath)) {
      const backupEnvPath = `${envDestPath}.pre-restore.${Date.now()}`;
      fs.copyFileSync(envDestPath, backupEnvPath);
      info(`Existing .env backed up to ${path.basename(backupEnvPath)}`);
    }
    fs.copyFileSync(envBackupPath, envDestPath);
    success('.env restored');
  } else {
    warn('No .env found in backup — you may need to configure manually');
  }

  // 8. Restore database
  banner('Restoring Database');
  const sqlPath = path.join(extractDir, 'database.sql');

  if (fs.existsSync(sqlPath)) {
    // Parse DATABASE_URL from the restored .env
    let dbUrl;
    if (fs.existsSync(envDestPath)) {
      const envContents = fs.readFileSync(envDestPath, 'utf-8');
      const match = envContents.match(/^DATABASE_URL\s*=\s*"?([^"\n]+)"?/m);
      if (match) {
        dbUrl = new URL(match[1]);
      }
    }

    if (!dbUrl) {
      warn('Could not find DATABASE_URL in .env');
      const dbUrlInput = await ask('  Enter DATABASE_URL (postgres://user:pass@host:port/dbname): ');
      dbUrl = new URL(dbUrlInput.trim());
    }

    const host = dbUrl.hostname;
    const port = dbUrl.port || '5432';
    const username = dbUrl.username;
    const password = decodeURIComponent(dbUrl.password);
    const dbName = dbUrl.pathname.replace(/^\//, '');

    info(`Restoring to database "${dbName}" on ${host}:${port}...`);

    // Ensure the database exists
    try {
      execSync(
        `psql -h ${host} -p ${port} -U ${username} -tc "SELECT 1 FROM pg_database WHERE datname='${dbName}'" | grep -q 1 || createdb -h ${host} -p ${port} -U ${username} ${dbName}`,
        { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, PGPASSWORD: password } },
      );
    } catch {
      warn(`Could not verify/create database "${dbName}" — it may already exist`);
    }

    try {
      execSync(
        `psql -h ${host} -p ${port} -U ${username} -d ${dbName} -f "${sqlPath}"`,
        { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, PGPASSWORD: password } },
      );
      success('Database restored');
    } catch (err) {
      // psql often emits warnings on STDERR even on success
      const stderr = err.stderr?.toString() || '';
      if (stderr.includes('ERROR')) {
        error(`Database restore had errors: ${stderr.slice(0, 200)}`);
      } else {
        success('Database restored (with warnings)');
      }
    }
  } else {
    warn('No database.sql found in backup');
  }

  // 9. Restore uploads
  banner('Restoring Uploads');
  const uploadsBackupPath = path.join(extractDir, 'uploads');
  const uploadsDestPath = path.join(PROJECT_ROOT, 'server/uploads');

  if (fs.existsSync(uploadsBackupPath)) {
    fs.cpSync(uploadsBackupPath, uploadsDestPath, { recursive: true });
    const fileCount = countFiles(uploadsBackupPath);
    success(`Uploads restored (${fileCount} files)`);
  } else {
    warn('No uploads directory found in backup');
  }

  // 10. Clean up
  fs.rmSync(tempDir, { recursive: true, force: true });

  // 11. Next steps
  banner('Restore Complete!');
  success('Your data has been restored.\n');
  console.log('  Next steps:\n');
  console.log('    1. Review your .env file and update any host-specific settings:');
  console.log(`       ${envDestPath}`);
  console.log('       - DATABASE_URL (if the new DB host/port differs)');
  console.log('       - REDIS_URL');
  console.log('       - BETTER_AUTH_URL (update to your new domain)');
  console.log('       - API_PORT');
  console.log();
  console.log('    2. Push schema (ensures any new columns since the backup exist):');
  console.log('       npm run db:push');
  console.log();
  console.log('    3. Build the frontend:');
  console.log('       npm run build');
  console.log();
  console.log('    4. Start the app:');
  console.log('       pm2 start ecosystem.config.cjs');
  console.log();

  rl.close();
}

function countFiles(dir) {
  let count = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      count += countFiles(path.join(dir, entry.name));
    } else {
      count++;
    }
  }
  return count;
}

main().catch((err) => {
  error(`Unexpected error: ${err.message}`);
  console.error(err);
  process.exit(1);
});
