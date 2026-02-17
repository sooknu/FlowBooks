import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { appSettings } from '../db/schema';
import { requirePermission } from '../lib/permissions';
import { getGoogleClientSettings } from '../lib/backupStorage';

const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

// Guard: only allow when setup is not complete (for setup wizard routes)
async function requireSetupIncomplete(request: any, reply: any) {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, 'setup_complete'));
  if (row?.value === 'true') {
    return reply.code(403).send({ error: 'Setup already completed' });
  }
}

function buildRedirectUrl(clientId: string, state: string, origin: string): string {
  const callbackUrl = `${origin}/api/backup/gdrive/callback`;
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: callbackUrl,
    scope: 'https://www.googleapis.com/auth/drive.file email',
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`;
}

export default async function gdriveAuthRoutes(fastify: any) {
  // GET /api/backup/gdrive/authorize — Opens Google consent in popup (authenticated)
  fastify.get('/authorize', { preHandler: [requirePermission('manage_backups')] }, async (request: any, reply: any) => {
    const googleCreds = await getGoogleClientSettings();
    if (!googleCreds) {
      return reply.status(400).send({ error: 'Google OAuth not configured' });
    }

    const state = crypto.randomBytes(32).toString('hex');

    // Store state in signed cookie (no client creds — callback reads from appSettings)
    reply.setCookie('gdrive_state', JSON.stringify({ state }), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      signed: true,
      maxAge: 10 * 60,
    });

    const origin = process.env.BETTER_AUTH_URL || 'http://localhost:3001';
    return reply.redirect(buildRedirectUrl(googleCreds.clientId, state, origin));
  });

  // POST /api/backup/gdrive/authorize-setup — Setup wizard version (no auth)
  // Accepts clientId + clientSecret in body, stores in signed cookie, returns URL
  fastify.post('/authorize-setup', { preHandler: [requireSetupIncomplete] }, async (request: any, reply: any) => {
    const { clientId, clientSecret } = request.body;

    if (!clientId || !clientSecret) {
      return reply.status(400).send({ error: 'Client ID and Client Secret are required' });
    }

    const state = crypto.randomBytes(32).toString('hex');

    // Store state + client credentials in signed cookie (setup has no appSettings yet)
    reply.setCookie('gdrive_state', JSON.stringify({ state, clientId, clientSecret }), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      signed: true,
      maxAge: 10 * 60,
    });

    const origin = process.env.BETTER_AUTH_URL || 'http://localhost:3001';
    return { data: { url: buildRedirectUrl(clientId, state, origin) } };
  });

  // GET /api/backup/gdrive/callback — Exchange code, write to localStorage
  fastify.get('/callback', async (request: any, reply: any) => {
    const { code, state, error: googleError } = request.query;
    const origin = process.env.BETTER_AUTH_URL || 'http://localhost:3001';

    if (googleError) {
      return reply.type('text/html').send(errorPage('Google authorization was denied.', origin));
    }

    if (!code || !state) {
      return reply.type('text/html').send(errorPage('Missing authorization code.', origin));
    }

    // Validate state cookie
    const stateCookieRaw = request.cookies.gdrive_state;
    if (!stateCookieRaw) {
      return reply.type('text/html').send(errorPage('State mismatch — please try again.', origin));
    }

    let statePayload: { state: string; clientId?: string; clientSecret?: string };
    try {
      const unsigned = request.unsignCookie(stateCookieRaw);
      if (!unsigned.valid) {
        return reply.type('text/html').send(errorPage('Invalid state cookie.', origin));
      }
      statePayload = JSON.parse(unsigned.value);
    } catch {
      return reply.type('text/html').send(errorPage('Failed to read state cookie.', origin));
    }

    reply.clearCookie('gdrive_state', { path: '/' });

    if (statePayload.state !== state) {
      return reply.type('text/html').send(errorPage('State mismatch — possible CSRF.', origin));
    }

    try {
      // Get client credentials: from cookie (setup mode) or appSettings (normal mode)
      let clientId = statePayload.clientId;
      let clientSecret = statePayload.clientSecret;

      if (!clientId || !clientSecret) {
        const googleCreds = await getGoogleClientSettings();
        if (!googleCreds) {
          return reply.type('text/html').send(errorPage('Google OAuth not configured.', origin));
        }
        clientId = googleCreds.clientId;
        clientSecret = googleCreds.clientSecret;
      }

      const callbackUrl = `${origin}/api/backup/gdrive/callback`;

      // Exchange code for tokens (direct fetch to preserve refresh_token)
      const tokenRes = await fetch(GOOGLE_TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: callbackUrl,
          grant_type: 'authorization_code',
        }),
      });

      const tokenData = await tokenRes.json() as any;

      if (!tokenRes.ok || !tokenData.refresh_token) {
        const msg = tokenData.error_description || tokenData.error || 'Failed to get refresh token';
        return reply.type('text/html').send(errorPage(msg, origin));
      }

      // Fetch user email for display
      const userInfoRes = await fetch(`https://www.googleapis.com/oauth2/v2/userinfo?access_token=${tokenData.access_token}`);
      const userInfo = await userInfoRes.json() as any;
      const email = userInfo.email || '';

      return reply.type('text/html').send(successPage(tokenData.refresh_token, email, origin));
    } catch (err: any) {
      fastify.log.error(`GDrive OAuth callback error: ${err.message}`);
      return reply.type('text/html').send(errorPage('An unexpected error occurred.', origin));
    }
  });
}

function successPage(refreshToken: string, email: string, _origin: string): string {
  return `<!DOCTYPE html>
<html><head><title>Google Drive Linked</title>
<style>
  body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f9fafb; }
  .card { background: white; border-radius: 12px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); max-width: 400px; text-align: center; }
  h2 { margin: 0 0 8px; font-size: 18px; color: #059669; }
  p { color: #6b7280; margin: 0; }
</style></head>
<body>
<div class="card">
  <h2>Google Drive Linked</h2>
  <p>You can close this window.</p>
</div>
<script>
  try {
    localStorage.setItem('gdrive-auth-result', JSON.stringify({
      type: 'gdrive-linked',
      refreshToken: ${JSON.stringify(refreshToken)},
      email: ${JSON.stringify(email)}
    }));
  } catch(e) {}
  setTimeout(function() { window.close(); }, 1500);
</script>
</body></html>`;
}

function errorPage(message: string, _origin: string): string {
  return `<!DOCTYPE html>
<html><head><title>Google Drive Error</title>
<style>
  body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f9fafb; }
  .card { background: white; border-radius: 12px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); max-width: 400px; text-align: center; }
  h2 { margin: 0 0 8px; font-size: 18px; color: #dc2626; }
  p { color: #6b7280; margin: 0 0 16px; }
  button { background: #374151; color: white; border: none; border-radius: 8px; padding: 10px 20px; cursor: pointer; font-size: 14px; }
</style></head>
<body>
<div class="card">
  <h2>Link Failed</h2>
  <p>${escapeHtml(message)}</p>
  <button onclick="window.close()">Close</button>
</div>
<script>
  try {
    localStorage.setItem('gdrive-auth-result', JSON.stringify({
      type: 'gdrive-error',
      message: ${JSON.stringify(message)}
    }));
  } catch(e) {}
</script>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
