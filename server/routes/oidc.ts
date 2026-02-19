import crypto from 'crypto';
import { db } from '../db';
import { appSettings, user, account, profiles } from '../db/schema';
import { eq, and, inArray, count } from 'drizzle-orm';
import { auth } from '../auth';
import {
  discoverEndpoints,
  buildAuthorizationUrl,
  exchangeCodeForTokens,
  decodeIdToken,
  fetchUserInfo,
} from '../lib/oidc';
import { notifyNewUserSignup } from '../lib/notifications';

async function getOidcSettings() {
  const keys = ['oidc_enabled', 'oidc_provider_name', 'oidc_client_id', 'oidc_client_secret', 'oidc_base_url', 'oidc_callback_url'];
  const rows = await db.select().from(appSettings).where(inArray(appSettings.key, keys));
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  if (map.oidc_enabled !== 'true' || !map.oidc_client_id || !map.oidc_client_secret || !map.oidc_base_url) {
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

async function oidcRoutes(fastify: any) {
  // GET /api/oidc/authorize — Redirect to OIDC provider
  fastify.get('/authorize', async (request: any, reply: any) => {
    const settings = await getOidcSettings();
    if (!settings) {
      return reply.status(400).send({ error: 'OIDC is not configured' });
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
    reply.setCookie('oidc_state', statePayload, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      signed: true,
      maxAge: 10 * 60, // 10 minutes in seconds
    });

    const callbackUrl = settings.oidc_callback_url || `${process.env.BETTER_AUTH_URL || 'http://localhost:3001'}/api/oidc/callback`;

    const endpoints = await discoverEndpoints(settings.oidc_base_url);
    const authUrl = buildAuthorizationUrl({
      authEndpoint: endpoints.authorization_endpoint,
      clientId: settings.oidc_client_id,
      callbackUrl,
      state,
      nonce,
    });

    return reply.redirect(authUrl);
  });

  // GET /api/oidc/callback — Handle OIDC provider callback
  fastify.get('/callback', async (request: any, reply: any) => {
    const { code, state, error: oidcError } = request.query;

    if (oidcError) {
      return reply.redirect('/?error=oidc_denied');
    }

    if (!code || !state) {
      return reply.redirect('/?error=oidc_failed');
    }

    // Read and validate state cookie
    const stateCookieRaw = request.cookies.oidc_state;
    if (!stateCookieRaw) {
      return reply.redirect('/?error=oidc_state_mismatch');
    }

    let statePayload: any;
    try {
      const unsigned = request.unsignCookie(stateCookieRaw);
      if (!unsigned.valid) {
        return reply.redirect('/?error=oidc_state_mismatch');
      }
      statePayload = JSON.parse(unsigned.value);
    } catch {
      return reply.redirect('/?error=oidc_state_mismatch');
    }

    // Clear state cookie
    reply.clearCookie('oidc_state', { path: '/' });

    // Validate state (CSRF protection)
    if (statePayload.state !== state) {
      return reply.redirect('/?error=oidc_state_mismatch');
    }

    try {
      const settings = await getOidcSettings();
      if (!settings) {
        return reply.redirect('/?error=oidc_failed');
      }

      const callbackUrl = settings.oidc_callback_url || `${process.env.BETTER_AUTH_URL || 'http://localhost:3001'}/api/oidc/callback`;
      const endpoints = await discoverEndpoints(settings.oidc_base_url);

      // Exchange code for tokens
      const tokens = await exchangeCodeForTokens({
        tokenEndpoint: endpoints.token_endpoint,
        code,
        clientId: settings.oidc_client_id,
        clientSecret: settings.oidc_client_secret,
        callbackUrl,
      });

      // Decode ID token
      let claims = decodeIdToken(tokens.id_token, statePayload.nonce);

      // Fallback to userinfo if email not in ID token
      if (!claims.email && endpoints.userinfo_endpoint && tokens.access_token) {
        const userInfo = await fetchUserInfo(endpoints.userinfo_endpoint, tokens.access_token);
        claims.email = claims.email || userInfo.email;
        claims.name = claims.name || userInfo.name;
      }

      if (!claims.sub) {
        return reply.redirect('/?error=oidc_failed');
      }

      // ── Link mode: user is already logged in and wants to link their OIDC account ──
      if (statePayload.linkUserId) {
        const linkUserId = statePayload.linkUserId;

        // Check if this OIDC subject is already linked to another user
        const [existingAccount] = await db
          .select()
          .from(account)
          .where(and(eq(account.providerId, 'oidc'), eq(account.accountId, claims.sub)));

        if (existingAccount) {
          if (existingAccount.userId === linkUserId) {
            // Already linked to this user — just redirect
            return reply.redirect('/#view=settings&tab=profile');
          }
          // Linked to a different user — can't link
          return reply.redirect('/?error=oidc_already_linked');
        }

        // Link OIDC account to the logged-in user
        await db.insert(account).values({
          id: crypto.randomUUID(),
          accountId: claims.sub,
          providerId: 'oidc',
          userId: linkUserId,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        return reply.redirect('/#view=settings&tab=profile');
      }

      // ── Normal login flow ──
      // Find user by OIDC account (provider + subject)
      let foundUser: any = null;
      const [existingAccount] = await db
        .select()
        .from(account)
        .where(and(eq(account.providerId, 'oidc'), eq(account.accountId, claims.sub)));

      if (existingAccount) {
        const [u] = await db.select().from(user).where(eq(user.id, existingAccount.userId));
        foundUser = u || null;
      }

      // If not found by OIDC subject, try email match
      if (!foundUser && claims.email) {
        const [u] = await db.select().from(user).where(eq(user.email, claims.email.toLowerCase()));
        foundUser = u || null;

        // Auto-link OIDC to existing email account
        if (foundUser) {
          await db.insert(account).values({
            id: crypto.randomUUID(),
            accountId: claims.sub,
            providerId: 'oidc',
            userId: foundUser.id,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }
      }

      // If still no user, auto-create
      if (!foundUser) {
        const email = claims.email?.toLowerCase() || `oidc-${claims.sub}@placeholder.local`;
        const name = claims.name || 'OIDC User';

        const [newUser] = await db.insert(user).values({
          id: crypto.randomUUID(),
          email,
          name,
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        }).returning();

        foundUser = newUser;

        // Create OIDC account link
        await db.insert(account).values({
          id: crypto.randomUUID(),
          accountId: claims.sub,
          providerId: 'oidc',
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

        // Notify admins/managers about new signup (skip if first user / auto-admin)
        if (role !== 'admin') {
          notifyNewUserSignup({ id: foundUser.id, email: foundUser.email, name });
        }
      }

      // Create session via Better Auth's internal adapter (correct token format + storage)
      const authCtx = await auth.$context;
      const session = await authCtx.internalAdapter.createSession(
        foundUser.id,
        false, // dontRememberMe
        {
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'] || '',
        },
      );

      // Sign and set session cookie using Better Auth's exact config
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
      fastify.log.error(`OIDC callback error: ${err.message}`);
      return reply.redirect('/?error=oidc_failed');
    }
  });
}

export default oidcRoutes;
