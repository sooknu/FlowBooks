import { db } from '../db';
import { appSettings } from '../db/schema';
import { eq, inArray } from 'drizzle-orm';
import { requirePermission, hasPermission } from '../lib/permissions';
import { logActivity, actorFromRequest } from '../lib/activityLog';
import { broadcast } from '../lib/pubsub';
import type { PermissionKey } from '../lib/permissionConfig';

const SENSITIVE_KEYS = ['oidc_client_secret', 'google_client_secret', 'smtp_pass', 'stripe_secret_key', 'stripe_test_secret_key', 'paypal_client_secret', 'paypal_test_client_secret', 'unsplash_api_key', 'backup_s3_secret_key', 'backup_b2_app_key', 'backup_gdrive_credentials'];

// Map settings keys to the permission required to write them.
// Keys not listed here require only `access_settings` (the base permission).
const KEY_PERMISSION: Record<string, PermissionKey> = {
  // SMTP settings
  smtp_host: 'manage_email_smtp', smtp_port: 'manage_email_smtp', smtp_user: 'manage_email_smtp',
  smtp_pass: 'manage_email_smtp', smtp_from: 'manage_email_smtp', smtp_from_name: 'manage_email_smtp',
  smtp_encryption: 'manage_email_smtp', smtp_enabled: 'manage_email_smtp',
  // Email templates & header
  email_template_quote: 'manage_email_templates', email_template_invoice: 'manage_email_templates',
  email_subject_quote: 'manage_email_templates', email_subject_invoice: 'manage_email_templates',
  verification_email_subject: 'manage_email_templates', verification_email_body: 'manage_email_templates',
  email_header_bg_color: 'manage_email_templates', email_accent_color: 'manage_email_templates',
  email_header_text_color: 'manage_email_templates',
  // Payment & auth settings
  stripe_enabled: 'manage_payment_settings', stripe_publishable_key: 'manage_payment_settings',
  stripe_secret_key: 'manage_payment_settings', stripe_test_mode: 'manage_payment_settings',
  stripe_test_publishable_key: 'manage_payment_settings', stripe_test_secret_key: 'manage_payment_settings',
  paypal_enabled: 'manage_payment_settings', paypal_client_id: 'manage_payment_settings',
  paypal_client_secret: 'manage_payment_settings', paypal_test_mode: 'manage_payment_settings',
  paypal_test_client_id: 'manage_payment_settings', paypal_test_client_secret: 'manage_payment_settings',
  oidc_enabled: 'manage_payment_settings', oidc_provider_name: 'manage_payment_settings',
  oidc_issuer: 'manage_payment_settings', oidc_client_id: 'manage_payment_settings',
  oidc_client_secret: 'manage_payment_settings', oidc_scope: 'manage_payment_settings',
  google_enabled: 'manage_payment_settings', google_client_id: 'manage_payment_settings',
  google_client_secret: 'manage_payment_settings',
  // Backup settings
  backup_s3_bucket: 'manage_backups', backup_s3_region: 'manage_backups',
  backup_s3_access_key: 'manage_backups', backup_s3_secret_key: 'manage_backups',
  backup_s3_endpoint: 'manage_backups', backup_b2_bucket: 'manage_backups',
  backup_b2_key_id: 'manage_backups', backup_b2_app_key: 'manage_backups',
  backup_gdrive_credentials: 'manage_backups', backup_gdrive_folder_id: 'manage_backups',
  backup_schedule_enabled: 'manage_backups', backup_schedule_cron: 'manage_backups',
  backup_schedule_destinations: 'manage_backups',
};

export default async function settingRoutes(fastify: any) {
  // GET /api/settings — all settings (authenticated)
  fastify.get('/', async (request: any) => {
    const settings = await db.select().from(appSettings);
    const map: Record<string, string> = {};
    for (const s of settings) {
      if (SENSITIVE_KEYS.includes(s.key) && s.value) {
        map[s.key] = '********';
      } else {
        map[s.key] = s.value;
      }
    }
    return { data: map };
  });

  // GET /api/settings/public — subset for login page (no auth required)
  fastify.get('/public', async (request: any) => {
    const publicKeys = [
      'app_name',
      'login_logo_url',
      'login_logo_dark_url',
      'login_logo_light_url',
      'login_logo_size',
      'header_logo_url',
      'header_logo_dark_url',
      'header_logo_light_url',
      'favicon_url',
      'accent_color',
      'oidc_enabled',
      'oidc_provider_name',
      'google_enabled',
      'stripe_enabled',
      'stripe_publishable_key',
      'stripe_test_mode',
      'stripe_test_publishable_key',
      'paypal_enabled',
      'paypal_client_id',
      'paypal_test_mode',
      'paypal_test_client_id',
      'unsplash_enabled',
      'setup_complete',
    ];
    const settings = await db
      .select()
      .from(appSettings)
      .where(inArray(appSettings.key, publicKeys));
    const map: Record<string, string> = {};
    for (const s of settings) {
      map[s.key] = s.value;
    }
    return { data: map };
  });

  // PUT /api/settings — upsert multiple settings (permission-gated per key)
  fastify.put('/', { preHandler: [requirePermission('access_settings')] }, async (request: any) => {
    const { settings } = request.body;
    const userId = request.user.id;

    // Filter to only keys the user has permission to write
    const allowed = settings.filter((s: any) => {
      if (SENSITIVE_KEYS.includes(s.key) && s.value === '********') return false;
      const requiredPerm = KEY_PERMISSION[s.key];
      if (!requiredPerm) return true; // No specific permission = base access_settings suffices
      return hasPermission(request, requiredPerm);
    });

    const results: any[] = [];
    for (const { key, value } of allowed) {
      const [result] = await db
        .insert(appSettings)
        .values({
          key,
          value: String(value),
          lastEditedBy: userId,
        })
        .onConflictDoUpdate({
          target: appSettings.key,
          set: {
            value: String(value),
            updatedAt: new Date(),
            lastEditedBy: userId,
          },
        })
        .returning();
      results.push(result);
    }

    const changedKeys = allowed.map((s: any) => s.key);
    if (changedKeys.length > 0) {
      logActivity({ ...actorFromRequest(request), action: 'settings_changed', entityType: 'settings', details: 'Updated: ' + changedKeys.join(', ') });
      broadcast('settings', 'updated', request.user.id);
    }

    return { data: results };
  });
}
