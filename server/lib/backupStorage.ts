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

// ── S3 Provider ──

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
      forcePathStyle: !!config.endpoint,
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

// ── Factory: create from DB settings ──

const BACKUP_SETTINGS_KEYS = [
  'backup_provider',
  'backup_s3_access_key',
  'backup_s3_secret_key',
  'backup_s3_bucket',
  'backup_s3_region',
  'backup_s3_endpoint',
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

// ── Factory: create from backup_destinations row ──

export async function createProviderForDestination(
  dest: { provider: string; credentials: Record<string, any> }
): Promise<BackupStorageProvider> {
  return createProviderFromCredentials(dest.provider, dest.credentials as Record<string, string>);
}

// ── Factory: create from directly passed credentials (for test-connection) ──

export function createProviderFromCredentials(
  provider: string,
  credentials: Record<string, string>
): BackupStorageProvider {
  if (provider !== 's3') {
    throw new Error(`Unsupported backup provider: ${provider}. Only S3 is supported.`);
  }

  return new S3Provider({
    accessKeyId: credentials.accessKeyId || credentials.backup_s3_access_key || credentials.accessKey,
    secretAccessKey: credentials.secretAccessKey || credentials.backup_s3_secret_key || credentials.secretKey,
    bucket: credentials.backup_s3_bucket || credentials.bucket,
    region: credentials.backup_s3_region || credentials.region || 'us-east-1',
    endpoint: credentials.backup_s3_endpoint || credentials.endpoint || undefined,
  });
}
