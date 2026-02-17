import fs from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import { google } from 'googleapis';
import { inArray } from 'drizzle-orm';
import { db } from '../db';
import { appSettings } from '../db/schema';

// ── Interface ──

export interface BackupStorageProvider {
  upload(key: string, filePath: string): Promise<void>;
  download(key: string, destPath: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(): Promise<{ key: string; size: number; lastModified: Date }[]>;
  testConnection(): Promise<{ success: boolean; message: string }>;
}

// ── S3 Provider (works for AWS S3 and Backblaze B2) ──

interface S3ProviderConfig {
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  region: string;
  endpoint?: string;
}

export class S3Provider implements BackupStorageProvider {
  private client: S3Client;
  private bucket: string;

  constructor(config: S3ProviderConfig) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint || undefined,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: !!config.endpoint, // Required for B2 and other S3-compatible providers
    });
  }

  async upload(key: string, filePath: string): Promise<void> {
    const body = fs.createReadStream(filePath);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
      })
    );
  }

  async download(key: string, destPath: string): Promise<void> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      })
    );

    if (!response.Body) {
      throw new Error(`Empty response body when downloading ${key}`);
    }

    const writeStream = fs.createWriteStream(destPath);

    // The SDK may return a web ReadableStream or a Node Readable depending on environment
    let readable: Readable;
    if (response.Body instanceof Readable) {
      readable = response.Body;
    } else {
      readable = Readable.fromWeb(response.Body as any);
    }

    await pipeline(readable, writeStream);
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      })
    );
  }

  async list(): Promise<{ key: string; size: number; lastModified: Date }[]> {
    const response = await this.client.send(
      new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: 'backups/',
      })
    );

    if (!response.Contents) return [];

    return response.Contents.map((obj) => ({
      key: obj.Key || '',
      size: obj.Size || 0,
      lastModified: obj.LastModified || new Date(),
    }));
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return { success: true, message: `Successfully connected to bucket "${this.bucket}"` };
    } catch (err: any) {
      return { success: false, message: err.message || 'Failed to connect to S3 bucket' };
    }
  }
}

// ── Google Drive Provider ──

interface GoogleDriveProviderConfig {
  credentialsJson: string;
  folderId: string;
}

export class GoogleDriveProvider implements BackupStorageProvider {
  private folderId: string;
  private drive: ReturnType<typeof google.drive>;

  constructor(config: GoogleDriveProviderConfig) {
    this.folderId = config.folderId;

    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(config.credentialsJson),
      scopes: ['https://www.googleapis.com/auth/drive.file'],
    });

    this.drive = google.drive({ version: 'v3', auth });
  }

  async upload(key: string, filePath: string): Promise<void> {
    await this.drive.files.create({
      requestBody: {
        name: key,
        parents: [this.folderId],
      },
      media: {
        body: fs.createReadStream(filePath),
      },
    });
  }

  async download(key: string, destPath: string): Promise<void> {
    const fileId = await this.findFileByName(key);
    if (!fileId) {
      throw new Error(`File not found in Google Drive: ${key}`);
    }

    const response = await this.drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'stream' }
    );

    const writeStream = fs.createWriteStream(destPath);
    await pipeline(response.data as any, writeStream);
  }

  async delete(key: string): Promise<void> {
    const fileId = await this.findFileByName(key);
    if (!fileId) {
      throw new Error(`File not found in Google Drive: ${key}`);
    }

    await this.drive.files.delete({ fileId });
  }

  async list(): Promise<{ key: string; size: number; lastModified: Date }[]> {
    const response = await this.drive.files.list({
      q: `'${this.folderId}' in parents and name contains 'backup-' and trashed = false`,
      fields: 'files(id, name, size, modifiedTime)',
      orderBy: 'modifiedTime desc',
    });

    if (!response.data.files) return [];

    return response.data.files.map((file) => ({
      key: file.name || '',
      size: parseInt(file.size || '0', 10),
      lastModified: new Date(file.modifiedTime || Date.now()),
    }));
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      await this.drive.files.list({
        q: `'${this.folderId}' in parents and trashed = false`,
        pageSize: 1,
        fields: 'files(id)',
      });
      return { success: true, message: 'Successfully connected to Google Drive folder' };
    } catch (err: any) {
      return { success: false, message: err.message || 'Failed to connect to Google Drive' };
    }
  }

  private async findFileByName(name: string): Promise<string | null> {
    const response = await this.drive.files.list({
      q: `'${this.folderId}' in parents and name = '${name}' and trashed = false`,
      fields: 'files(id)',
      pageSize: 1,
    });

    return response.data.files?.[0]?.id || null;
  }
}

// ── Factory: create from DB settings ──

const BACKUP_SETTINGS_KEYS = [
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

export async function getStorageProvider(): Promise<BackupStorageProvider> {
  const rows = await db
    .select()
    .from(appSettings)
    .where(inArray(appSettings.key, BACKUP_SETTINGS_KEYS));

  const settings: Record<string, string> = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }

  const provider = settings.backup_provider;

  if (!provider || provider === 'none') {
    throw new Error('No backup storage provider configured');
  }

  return createProviderFromCredentials(provider, settings);
}

// ── Factory: create from directly passed credentials (for test-connection) ──

export function createProviderFromCredentials(
  provider: string,
  credentials: Record<string, string>
): BackupStorageProvider {
  switch (provider) {
    case 's3':
      return new S3Provider({
        accessKeyId: credentials.backup_s3_access_key || credentials.accessKey,
        secretAccessKey: credentials.backup_s3_secret_key || credentials.secretKey,
        bucket: credentials.backup_s3_bucket || credentials.bucket,
        region: credentials.backup_s3_region || credentials.region || 'us-east-1',
        endpoint: credentials.backup_s3_endpoint || credentials.endpoint || undefined,
      });

    case 'b2':
      return new S3Provider({
        accessKeyId: credentials.backup_b2_key_id || credentials.keyId,
        secretAccessKey: credentials.backup_b2_app_key || credentials.appKey,
        bucket: credentials.backup_b2_bucket || credentials.bucket,
        region: 'auto',
        endpoint: credentials.backup_b2_endpoint || credentials.endpoint,
      });

    case 'gdrive':
      return new GoogleDriveProvider({
        credentialsJson: credentials.backup_gdrive_credentials || credentials.credentials,
        folderId: credentials.backup_gdrive_folder_id || credentials.folderId,
      });

    default:
      throw new Error(`Unknown backup provider: ${provider}`);
  }
}
