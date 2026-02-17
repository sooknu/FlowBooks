import crypto from 'crypto';
import { db } from '../db';
import { appSettings, user, account, profiles } from '../db/schema';
import { eq, and, inArray, count } from 'drizzle-orm';
import { auth } from '../auth';
import { exchangeCodeForTokens, decodeIdToken } from '../lib/oidc';

// Google's fixed OAuth endpoints
const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

async function getGoogleSettings() {
  const keys = ['google_enabled', 'google_client_id', 'google_client_secret'];
  const rows = await db.select().from(appSettings).where(inArray(appSettings.key, keys));
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  if (map.google_enabled !== 'true' || !map.google_client_id || !map.google_client_secret) {
    return null;
  }
  return map;
}

// Sign a cookie value using the same HMAC-SHA-256 method as Better Auth / better-call
async function signSessionCookie(token: string, secret: string) {
  const { getWebcryptoSubtle } = await import('@better-auth/utils');
  const algorithm = { name: 'HMAC', hash: 'SHA-256' };
  const secretBuf = new TextEncoder().encode(secret);
  const key = await getWebcryptoSubtle().importKey('raw', secretBuf, algorithm, false, ['sign']);
  const signature = await getWebcryptoSubtle().sign('HMAC', key, new TextEncoder().encode(token));
  const base64Sig = btoa(String.fromCharCode(...new Uint8Array(signature)));
  return encodeURIComponent(`${token}.${base64Sig}`);
}

async function googleRoutes(fastify: any) {
  // GET /api/google/authorize — Redirect to Google's OAuth consent screen
  fastify.get('/authorize', async (request: any, reply: any) => {
    const settings = await getGoogleSettings();
    if (!settings) {
      return reply.status(400).send({ error: 'Google login is not configured' });
    }

    const state = crypto.randomBytes(32).toString('hex');
    const nonce = crypto.randomBytes(32).toString('hex');

    // Detect if user is already logged in (link mode)
    let linkUserId: string | null = null;
    try {
      const headers = new Headers();
      Object.entries(request.headers).forEach(([key, value]: [string, any]) => {
        if (value) headers.append(key, String(value));
      });
      const session = await auth.api.getSession({ headers });
      if (session?.user?.id) {
        linkUserId = session.user.id;
      }
    } catch {
      // Not logged in — proceed with normal login flow
    }

    // Store state in signed cookie (include linkUserId if linking)
    const statePayload = JSON.stringify({ state, nonce, ...(linkUserId ? { linkUserId } : {}) });
    reply.setCookie('google_state', statePayload, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      signed: true,
      maxAge: 10 * 60,
    });

    const callbackUrl = `${process.env.BETTER_AUTH_URL || 'http://localhost:3001'}/api/google/callback`;

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: settings.google_client_id,
      redirect_uri: callbackUrl,
      scope: 'openid email profile',
      state,
      nonce,
      access_type: 'offline',
      prompt: 'consent',
    });

    return reply.redirect(`${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`);
  });

  // GET /api/google/callback — Handle Google's redirect
  fastify.get('/callback', async (request: any, reply: any) => {
    const { code, state, error: googleError } = request.query;

    if (googleError) {
      return reply.redirect('/?error=google_denied');
    }

    if (!code || !state) {
      return reply.redirect('/?error=google_failed');
    }

    // Read and validate state cookie
    const stateCookieRaw = request.cookies.google_state;
    if (!stateCookieRaw) {
      return reply.redirect('/?error=google_state_mismatch');
    }

    let statePayload: any;
    try {
      const unsigned = request.unsignCookie(stateCookieRaw);
      if (!unsigned.valid) {
        return reply.redirect('/?error=google_state_mismatch');
      }
      statePayload = JSON.parse(unsigned.value);
    } catch {
      return reply.redirect('/?error=google_state_mismatch');
    }

    // Clear state cookie
    reply.clearCookie('google_state', { path: '/' });

    // Validate state (CSRF protection)
    if (statePayload.state !== state) {
      return reply.redirect('/?error=google_state_mismatch');
    }

    try {
      const settings = await getGoogleSettings();
      if (!settings) {
        return reply.redirect('/?error=google_failed');
      }

      const callbackUrl = `${process.env.BETTER_AUTH_URL || 'http://localhost:3001'}/api/google/callback`;

      // Exchange code for tokens (reuse OIDC helper — Google uses the same standard)
      const tokens = await exchangeCodeForTokens({
        tokenEndpoint: GOOGLE_TOKEN_ENDPOINT,
        code,
        clientId: settings.google_client_id,
        clientSecret: settings.google_client_secret,
        callbackUrl,
      });

      // Decode ID token
      const claims = decodeIdToken(tokens.id_token, statePayload.nonce);

      if (!claims.sub) {
        return reply.redirect('/?error=google_failed');
      }

      // ── Link mode: user is already logged in and wants to link their Google account ──
      if (statePayload.linkUserId) {
        const linkUserId = statePayload.linkUserId;

        // Check if this Google subject is already linked to another user
        const [existingAccount] = await db
          .select()
          .from(account)
          .where(and(eq(account.providerId, 'google'), eq(account.accountId, claims.sub)));

        if (existingAccount) {
          if (existingAccount.userId === linkUserId) {
            return reply.redirect('/#view=settings&tab=profile');
          }
          return reply.redirect('/?error=google_already_linked');
        }

        // Link Google account to the logged-in user
        await db.insert(account).values({
          id: crypto.randomUUID(),
          accountId: claims.sub,
          providerId: 'google',
          userId: linkUserId,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        return reply.redirect('/#view=settings&tab=profile');
      }

      // ── Normal login flow ──
      let foundUser: any = null;
      const [existingAccount] = await db
        .select()
        .from(account)
        .where(and(eq(account.providerId, 'google'), eq(account.accountId, claims.sub)));

      if (existingAccount) {
        const [u] = await db.select().from(user).where(eq(user.id, existingAccount.userId));
        foundUser = u || null;
      }

      // If not found by Google subject, try email match
      if (!foundUser && claims.email) {
        const [u] = await db.select().from(user).where(eq(user.email, claims.email.toLowerCase()));
        foundUser = u || null;

        // Auto-link Google to existing email account
        if (foundUser) {
          await db.insert(account).values({
            id: crypto.randomUUID(),
            accountId: claims.sub,
            providerId: 'google',
            userId: foundUser.id,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }
      }

      // If still no user, auto-create
      if (!foundUser) {
        const email = claims.email?.toLowerCase() || `google-${claims.sub}@placeholder.local`;
        const name = claims.name || 'Google User';

        const [newUser] = await db.insert(user).values({
          id: crypto.randomUUID(),
          email,
          name,
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        }).returning();

        foundUser = newUser;

        // Create Google account link
        await db.insert(account).values({
          id: crypto.randomUUID(),
          accountId: claims.sub,
          providerId: 'google',
          userId: foundUser.id,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        // Create profile (first user becomes admin)
        const [{ adminCount }] = await db.select({ adminCount: count() }).from(profiles).where(eq(profiles.role, 'admin'));
        const role = adminCount === 0 ? 'admin' : 'user';

        await db.insert(profiles).values({
          id: foundUser.id,
          email: foundUser.email,
          displayName: name,
          role,
          createdAt: new Date(),
          updatedAt: new Date(),
        }).onConflictDoNothing();
      }

      // Create session via Better Auth's internal adapter
      const authCtx = await auth.$context;
      const session = await authCtx.internalAdapter.createSession(
        foundUser.id,
        false,
        {
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'] || '',
        },
      );

      // Sign and set session cookie
      const { name: cookieName, attributes: cookieAttrs } = authCtx.authCookies.sessionToken;
      const signedValue = await signSessionCookie(session.token, authCtx.secret);

      const parts = [
        `${cookieName}=${signedValue}`,
        `Path=${cookieAttrs.path || '/'}`,
        'HttpOnly',
        `SameSite=${cookieAttrs.sameSite || 'lax'}`,
        `Max-Age=${cookieAttrs.maxAge || 604800}`,
      ];
      if (cookieAttrs.secure) parts.push('Secure');
      reply.header('set-cookie', parts.join('; '));

      return reply.redirect('/');

    } catch (err: any) {
      fastify.log.error(`Google callback error: ${err.message}`);
      return reply.redirect('/?error=google_failed');
    }
  });
}

export default googleRoutes;
