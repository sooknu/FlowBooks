import { db } from '../db';
import { appSettings } from '../db/schema';
import { eq, inArray } from 'drizzle-orm';
import { requireAdmin } from '../lib/permissions';
import { logActivity, actorFromRequest } from '../lib/activityLog';

const SENSITIVE_KEYS = ['oidc_client_secret', 'google_client_secret', 'smtp_pass', 'stripe_secret_key', 'stripe_test_secret_key', 'paypal_client_secret', 'paypal_test_client_secret', 'unsplash_api_key', 'backup_s3_secret_key', 'backup_b2_app_key', 'backup_gdrive_credentials'];

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
      'login_logo_light_url',
      'login_logo_size',
      'header_logo_url',
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

  // PUT /api/settings — upsert multiple settings (admin only)
  fastify.put('/', { preHandler: [requireAdmin] }, async (request: any) => {
    const { settings } = request.body;
    const userId = request.user.id;

    const results: any[] = [];
    for (const { key, value } of settings) {
      if (SENSITIVE_KEYS.includes(key) && value === '********') continue;
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

    const changedKeys = settings
      .filter((s: any) => !(SENSITIVE_KEYS.includes(s.key) && s.value === '********'))
      .map((s: any) => s.key);
    if (changedKeys.length > 0) {
      logActivity({ ...actorFromRequest(request), action: 'settings_changed', entityType: 'settings', details: 'Updated: ' + changedKeys.join(', ') });
    }

    return { data: results };
  });
}
