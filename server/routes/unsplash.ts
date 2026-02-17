import { db } from '../db';
import { appSettings } from '../db/schema';
import { eq, inArray } from 'drizzle-orm';
import { requireAdmin } from '../lib/permissions';

const UNSPLASH_SETTINGS_KEYS = [
  'unsplash_enabled',
  'unsplash_api_key',
  'unsplash_interval',
  'unsplash_query',
];

const CACHE_KEYS = [
  'unsplash_cached_url',
  'unsplash_cached_thumb',
  'unsplash_cached_color',
  'unsplash_cached_credit_name',
  'unsplash_cached_credit_url',
  'unsplash_cached_at',
];

async function getSettingsMap(keys: string[]): Promise<Record<string, string>> {
  const rows = await db.select().from(appSettings).where(inArray(appSettings.key, keys));
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  return map;
}

async function upsertSetting(key: string, value: string) {
  await db
    .insert(appSettings)
    .values({ key, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });
}

export default async function unsplashRoutes(fastify: any) {
  // GET /api/unsplash/background — public (no auth), returns cached image or fetches new one
  fastify.get('/background', async (_request: any, reply: any) => {
    try {
      const cfg = await getSettingsMap([...UNSPLASH_SETTINGS_KEYS, ...CACHE_KEYS]);

      if (cfg.unsplash_enabled !== 'true' || !cfg.unsplash_api_key) {
        return { enabled: false };
      }

      const interval = parseInt(cfg.unsplash_interval || '60', 10);
      const cachedAt = cfg.unsplash_cached_at ? parseInt(cfg.unsplash_cached_at, 10) : 0;
      const now = Date.now();
      const staleMs = interval * 60 * 1000; // interval is in minutes

      // Return cache if fresh (interval=0 means every page load)
      if (cachedAt && cfg.unsplash_cached_url && interval > 0 && (now - cachedAt) < staleMs) {
        return {
          enabled: true,
          url: cfg.unsplash_cached_url,
          thumb: cfg.unsplash_cached_thumb || '',
          color: cfg.unsplash_cached_color || '#333333',
          creditName: cfg.unsplash_cached_credit_name || '',
          creditUrl: cfg.unsplash_cached_credit_url || '',
        };
      }

      // Fetch new image from Unsplash
      let apiUrl = 'https://api.unsplash.com/photos/random?orientation=landscape&content_filter=high';
      if (cfg.unsplash_query) {
        apiUrl += `&query=${encodeURIComponent(cfg.unsplash_query)}`;
      }

      const res = await fetch(apiUrl, {
        headers: { Authorization: `Client-ID ${cfg.unsplash_api_key}` },
      });

      if (!res.ok) {
        // If API fails, return stale cache if available
        if (cfg.unsplash_cached_url) {
          return {
            enabled: true,
            url: cfg.unsplash_cached_url,
            thumb: cfg.unsplash_cached_thumb || '',
            color: cfg.unsplash_cached_color || '#333333',
            creditName: cfg.unsplash_cached_credit_name || '',
            creditUrl: cfg.unsplash_cached_credit_url || '',
          };
        }
        return { enabled: false };
      }

      const data = await res.json();
      const url = data.urls?.regular || '';
      const thumb = data.urls?.small || '';
      const color = data.color || '#333333';
      const creditName = data.user?.name || '';
      const creditUrl = data.user?.links?.html || '';

      // Cache the result
      await Promise.all([
        upsertSetting('unsplash_cached_url', url),
        upsertSetting('unsplash_cached_thumb', thumb),
        upsertSetting('unsplash_cached_color', color),
        upsertSetting('unsplash_cached_credit_name', creditName),
        upsertSetting('unsplash_cached_credit_url', creditUrl),
        upsertSetting('unsplash_cached_at', String(now)),
      ]);

      return { enabled: true, url, thumb, color, creditName, creditUrl };
    } catch (err: any) {
      fastify.log.error(err, 'Unsplash background fetch failed');
      return { enabled: false };
    }
  });

  // POST /api/unsplash/refresh — admin only, force-fetch a new image
  fastify.post('/refresh', { preHandler: [requireAdmin] }, async (_request: any, reply: any) => {
    try {
      const cfg = await getSettingsMap(UNSPLASH_SETTINGS_KEYS);

      if (cfg.unsplash_enabled !== 'true' || !cfg.unsplash_api_key) {
        return reply.code(400).send({ error: 'Unsplash is not enabled or API key is missing' });
      }

      let apiUrl = 'https://api.unsplash.com/photos/random?orientation=landscape&content_filter=high';
      if (cfg.unsplash_query) {
        apiUrl += `&query=${encodeURIComponent(cfg.unsplash_query)}`;
      }

      const res = await fetch(apiUrl, {
        headers: { Authorization: `Client-ID ${cfg.unsplash_api_key}` },
      });

      if (!res.ok) {
        const text = await res.text();
        return reply.code(502).send({ error: `Unsplash API error: ${res.status}`, details: text });
      }

      const data = await res.json();
      const url = data.urls?.regular || '';
      const thumb = data.urls?.small || '';
      const color = data.color || '#333333';
      const creditName = data.user?.name || '';
      const creditUrl = data.user?.links?.html || '';

      await Promise.all([
        upsertSetting('unsplash_cached_url', url),
        upsertSetting('unsplash_cached_thumb', thumb),
        upsertSetting('unsplash_cached_color', color),
        upsertSetting('unsplash_cached_credit_name', creditName),
        upsertSetting('unsplash_cached_credit_url', creditUrl),
        upsertSetting('unsplash_cached_at', String(Date.now())),
      ]);

      return { enabled: true, url, thumb, color, creditName, creditUrl };
    } catch (err: any) {
      fastify.log.error(err, 'Unsplash refresh failed');
      return reply.code(500).send({ error: 'Failed to refresh background' });
    }
  });
}
