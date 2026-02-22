import { db } from '../db';
import { profiles, user, account, verification, teamMembers, session } from '../db/schema';
import { eq, and, count } from 'drizzle-orm';
import { auth } from '../auth';
import { requireAdmin, requirePermission, clearRoleCache, isSuperAdmin, SUPER_ADMIN_EMAIL, isAdmin } from '../lib/permissions';
import {
  getSmtpSettings,
  createTransporter,
  buildFromAddress,
  getCompanySettings,
  buildVerificationEmailHtml,
} from '../lib/mailer';
import crypto from 'crypto';
import { deleteUserAndRelatedData } from '../lib/rpc';
import { logActivity, actorFromRequest } from '../lib/activityLog';

export default async function userRoutes(fastify: any) {
  // GET /api/users/check-verification — public endpoint for polling verification status
  fastify.get('/check-verification', async (request: any, reply: any) => {
    const email = (request.query as any)?.email;
    if (!email) return reply.code(400).send({ error: 'Email is required' });

    const [found] = await db
      .select({ emailVerified: user.emailVerified })
      .from(user)
      .where(eq(user.email, email));

    return { verified: found?.emailVerified === true };
  });

  // GET /api/users/me/approval-status — check if current user is approved (exempt from approval middleware)
  fastify.get('/me/approval-status', async (request: any, reply: any) => {
    if (!request.user) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    const [profile] = await db
      .select({ approved: profiles.approved })
      .from(profiles)
      .where(eq(profiles.id, request.user.id));

    const [u] = await db
      .select({ emailVerified: user.emailVerified })
      .from(user)
      .where(eq(user.id, request.user.id));

    return {
      approved: profile?.approved ?? false,
      emailVerified: u?.emailVerified ?? false,
    };
  });

  // GET /api/users/pending-count — count of users awaiting approval (admin only)
  fastify.get('/pending-count', { preHandler: [requirePermission('approve_users')] }, async () => {
    const [{ total }] = await db
      .select({ total: count() })
      .from(profiles)
      .where(eq(profiles.approved, false));
    return { count: total };
  });

  // GET /api/users — all profiles (admin only)
  fastify.get('/', { preHandler: [requirePermission('approve_users')] }, async (request: any) => {
    const rows = await db.query.profiles.findMany({
      with: {
        user: { columns: { email: true, emailVerified: true, createdAt: true } },
      },
    });
    const data = rows.map((p: any) => ({
      ...p,
      email: p.user?.email || p.email,
      emailVerified: p.user?.emailVerified ?? false,
      userCreatedAt: p.user?.createdAt,
      isSuperAdmin: (p.user?.email || p.email) === SUPER_ADMIN_EMAIL,
    }));
    return { data };
  });

  // GET /api/users/me/profile
  fastify.get('/me/profile', async (request: any) => {
    let [profile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, request.user.id));

    if (!profile) {
      // If no admins exist at all, bootstrap this user as admin
      const [{ adminCount }] = await db.select({ adminCount: count() }).from(profiles).where(eq(profiles.role, 'admin'));
      const role = adminCount === 0 ? 'admin' : 'user';

      const [inserted] = await db
        .insert(profiles)
        .values({
          id: request.user.id,
          email: request.user.email,
          role,
          approved: role === 'admin' || request.user.email === SUPER_ADMIN_EMAIL,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoNothing()
        .returning();

      // If conflict (another request already created it), just fetch it
      profile = inserted ?? (await db.select().from(profiles).where(eq(profiles.id, request.user.id)))[0];
    }
    // Include advancesEnabled and salaryEnabled for crew finance visibility
    let advancesEnabled = false;
    let salaryEnabled = false;
    if (request.teamMemberId) {
      const [tm] = await db.select({ advancesEnabled: teamMembers.advancesEnabled, salaryEnabled: teamMembers.salaryEnabled })
        .from(teamMembers).where(eq(teamMembers.id, request.teamMemberId));
      advancesEnabled = tm?.advancesEnabled || false;
      salaryEnabled = tm?.salaryEnabled || false;
    }

    return { data: { ...profile, teamRole: request.teamRole || null, teamMemberId: request.teamMemberId || null, advancesEnabled, salaryEnabled, permissions: request.permissions || {} } };
  });

  // PUT /api/users/me/profile
  fastify.put('/me/profile', async (request: any) => {
    const body = request.body;
    // Strip role to prevent self-escalation
    const [data] = await db
      .update(profiles)
      .set({
        displayName: body.displayName || body.display_name,
        firstName: body.firstName || body.first_name,
        lastName: body.lastName || body.last_name,
        avatarUrl: body.avatarUrl || body.avatar_url,
        phone: body.phone,
        website: body.website,
        updatedAt: new Date(),
      })
      .where(eq(profiles.id, request.user.id))
      .returning();
    return { data };
  });

  // GET /api/users/me/accounts — linked auth providers
  fastify.get('/me/accounts', async (request: any) => {
    const accounts = await db
      .select({
        id: account.id,
        providerId: account.providerId,
        accountId: account.accountId,
        createdAt: account.createdAt,
      })
      .from(account)
      .where(eq(account.userId, request.user.id));

    // Filter out the 'credential' provider (email/password) — only show external
    const linked = accounts.filter(a => a.providerId !== 'credential');
    return { data: linked };
  });

  // DELETE /api/users/me/accounts/:providerId — unlink an auth provider
  fastify.delete('/me/accounts/:providerId', async (request: any, reply: any) => {
    const { providerId } = request.params;

    // Don't allow unlinking credential (password)
    if (providerId === 'credential') {
      return reply.code(400).send({ error: 'Cannot unlink password authentication' });
    }

    // Make sure user has at least one other way to log in (credential account)
    const allAccounts = await db
      .select({ providerId: account.providerId })
      .from(account)
      .where(eq(account.userId, request.user.id));

    const hasPassword = allAccounts.some(a => a.providerId === 'credential');
    const otherExternal = allAccounts.filter(a => a.providerId !== 'credential' && a.providerId !== providerId);

    if (!hasPassword && otherExternal.length === 0) {
      return reply.code(400).send({ error: 'Cannot unlink your only login method. Set a password first.' });
    }

    await db.delete(account).where(
      and(eq(account.userId, request.user.id), eq(account.providerId, providerId))
    );

    return { success: true };
  });

  // POST /api/users — create new user
  fastify.post('/', { preHandler: [requirePermission('approve_users')] }, async (request: any) => {
    const { email, password, name, role } = request.body;

    // Only admins can create admin accounts
    if (role === 'admin' && !(await isAdmin(request.user.id))) {
      return request.server.httpErrors.forbidden('Only admins can create admin accounts');
    }

    // Use Better Auth admin API to create user
    // This triggers databaseHooks.user.create.after which creates the profile
    const result = await auth.api.createUser({
      body: { email, password, name: name || email },
    });

    if (result?.user) {
      // Auto-verify admin-created users (admin vouches for them)
      await db.update(user)
        .set({ emailVerified: true, updatedAt: new Date() })
        .where(eq(user.id, result.user.id));

      // The databaseHook already created the profile with role='user'.
      // Admin-created users are auto-approved. Update role/displayName if needed.
      const updates: any = { approved: true, updatedAt: new Date() };
      if (name) updates.displayName = name;
      if (role && role !== 'user') updates.role = role;

      await db.update(profiles)
        .set(updates)
        .where(eq(profiles.id, result.user.id));

      clearRoleCache(result.user.id);
    }

    if (result?.user) {
      logActivity({ ...actorFromRequest(request), action: 'created', entityType: 'user', entityId: result.user.id, entityLabel: email });
    }

    return { data: result?.user || null };
  });

  // PUT /api/users/:id — update user
  fastify.put('/:id', { preHandler: [requirePermission('approve_users')] }, async (request: any, reply: any) => {
    const { role, firstName, lastName, displayName, password } = request.body;

    // Protect super admin from demotion
    if (await isSuperAdmin(request.params.id)) {
      if (role && role !== 'admin') {
        return reply.code(403).send({ error: 'Cannot change super admin role' });
      }
    }

    // Non-admin callers cannot modify admin accounts
    const callerIsAdmin = await isAdmin(request.user.id);
    if (!callerIsAdmin) {
      const [target] = await db.select({ role: profiles.role }).from(profiles).where(eq(profiles.id, request.params.id));
      if (target?.role === 'admin') {
        return reply.code(403).send({ error: 'Cannot modify admin accounts' });
      }
      // Non-admins cannot grant admin role
      if (role === 'admin') {
        return reply.code(403).send({ error: 'Cannot grant admin role' });
      }
    }

    // Admin password reset — upsert credential account
    // Creates credential account for OAuth-only users, updates existing for email/password users
    if (password) {
      const { hashPassword } = await import('better-auth/crypto');
      const hashedPassword = await hashPassword(password);

      const [existing] = await db.select({ id: account.id })
        .from(account)
        .where(and(eq(account.userId, request.params.id), eq(account.providerId, 'credential')))
        .limit(1);

      if (existing) {
        await db.update(account)
          .set({ password: hashedPassword, updatedAt: new Date() })
          .where(eq(account.id, existing.id));
      } else {
        await db.insert(account).values({
          id: crypto.randomUUID(),
          accountId: request.params.id,
          providerId: 'credential',
          userId: request.params.id,
          password: hashedPassword,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }

    const [data] = await db
      .update(profiles)
      .set({ role, firstName, lastName, displayName, updatedAt: new Date() })
      .where(eq(profiles.id, request.params.id))
      .returning();

    // Clear cached role so changes take effect immediately
    clearRoleCache(request.params.id);

    logActivity({ ...actorFromRequest(request), action: 'updated', entityType: 'user', entityId: request.params.id, entityLabel: data.email || data.displayName, details: role ? `Role set to ${role}` : undefined });

    return { data };
  });

  // PUT /api/users/:id/verify — manually verify a user's email
  fastify.put('/:id/verify', { preHandler: [requirePermission('approve_users')] }, async (request: any, reply: any) => {
    const [existing] = await db.select({ id: user.id }).from(user).where(eq(user.id, request.params.id));
    if (!existing) {
      return reply.code(404).send({ error: 'User not found' });
    }

    await db.update(user)
      .set({ emailVerified: true, updatedAt: new Date() })
      .where(eq(user.id, request.params.id));

    return { success: true };
  });

  // PUT /api/users/:id/send-verification — resend verification email
  fastify.put('/:id/send-verification', { preHandler: [requirePermission('approve_users')] }, async (request: any, reply: any) => {
    const [targetUser] = await db.select().from(user).where(eq(user.id, request.params.id));
    if (!targetUser) {
      return reply.code(404).send({ error: 'User not found' });
    }
    if (targetUser.emailVerified) {
      return reply.code(400).send({ error: 'User email is already verified' });
    }

    try {
      // Create a verification token
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await db.insert(verification).values({
        id: crypto.randomUUID(),
        identifier: targetUser.email,
        value: token,
        expiresAt,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Build verification URL (Better Auth's verify-email endpoint)
      const baseUrl = process.env.BETTER_AUTH_URL || 'http://localhost:3001';
      const verifyUrl = `${baseUrl}/api/auth/verify-email?token=${token}&callbackURL=${encodeURIComponent('/?verified=true')}`;

      // Send the email
      const smtpSettings = await getSmtpSettings();
      if (!smtpSettings.smtp_host || smtpSettings.smtp_enabled === 'false') {
        return reply.code(400).send({ error: 'SMTP is not configured' });
      }

      const companySettings = await getCompanySettings();
      const appName = companySettings.app_name || 'QuoteFlow';
      const companyName = companySettings.company_name || '';
      const accentColor = companySettings.accent_color || '#8b5cf6';

      const { html, subject } = buildVerificationEmailHtml({
        appName, companyName, accentColor,
        emailHeaderBgColor: companySettings.email_header_bg_color,
        emailAccentColor: companySettings.email_accent_color,
        emailHeaderTextColor: companySettings.email_header_text_color,
        verifyUrl,
        subjectTemplate: companySettings.verification_email_subject,
        bodyTemplate: companySettings.verification_email_body,
      });
      const transporter = createTransporter(smtpSettings);

      await transporter.sendMail({
        from: buildFromAddress(smtpSettings),
        to: targetUser.email,
        subject,
        html,
      });

      return { success: true };
    } catch (err: any) {
      return reply.code(500).send({ error: `Failed to send verification email: ${err.message}` });
    }
  });

  // PUT /api/users/:id/approve — approve a user with optional team role
  fastify.put('/:id/approve', { preHandler: [requirePermission('approve_users')] }, async (request: any, reply: any) => {
    const { teamRole, linkTeamMemberId } = request.body || {};
    const targetId = request.params.id;

    const [existing] = await db.select({ id: profiles.id, email: profiles.email, displayName: profiles.displayName }).from(profiles).where(eq(profiles.id, targetId));
    if (!existing) {
      return reply.code(404).send({ error: 'User not found' });
    }

    await db.update(profiles)
      .set({ approved: true, updatedAt: new Date() })
      .where(eq(profiles.id, targetId));

    if (linkTeamMemberId) {
      // Link an existing unlinked team member to this user
      const [member] = await db.select({ id: teamMembers.id, userId: teamMembers.userId, name: teamMembers.name }).from(teamMembers).where(eq(teamMembers.id, linkTeamMemberId));
      if (member && !member.userId) {
        const updates: any = { userId: targetId, updatedAt: new Date() };
        if (teamRole) updates.role = teamRole;
        // Backfill name from profile if team member has no name
        if (!member.name) updates.name = existing.displayName || existing.email;
        await db.update(teamMembers)
          .set(updates)
          .where(eq(teamMembers.id, linkTeamMemberId));
      }
    } else if (teamRole) {
      // Create new team_members record
      const VALID_ROLES = ['owner', 'manager', 'lead', 'crew'];
      if (!VALID_ROLES.includes(teamRole)) {
        return reply.code(400).send({ error: 'Invalid team role' });
      }
      // Only create if not already a team member
      const [existingMember] = await db.select({ id: teamMembers.id }).from(teamMembers).where(eq(teamMembers.userId, targetId));
      if (!existingMember) {
        await db.insert(teamMembers).values({ userId: targetId, role: teamRole, name: existing.displayName || existing.email });
      }
    }

    clearRoleCache(targetId);
    logActivity({ ...actorFromRequest(request), action: 'approved', entityType: 'user', entityId: targetId, entityLabel: existing.email || existing.displayName });
    return { success: true };
  });

  // PUT /api/users/:id/reject — reject and delete a pending user
  fastify.put('/:id/reject', { preHandler: [requirePermission('approve_users')] }, async (request: any, reply: any) => {
    const targetId = request.params.id;

    // Cannot reject super admin
    if (await isSuperAdmin(targetId)) {
      return reply.code(403).send({ error: 'Cannot reject super admin' });
    }

    // Cannot reject yourself
    if (targetId === request.user.id) {
      return reply.code(400).send({ error: 'Cannot reject your own account' });
    }

    const [target] = await db.select({ email: profiles.email, displayName: profiles.displayName }).from(profiles).where(eq(profiles.id, targetId));
    await deleteUserAndRelatedData(targetId);
    logActivity({ ...actorFromRequest(request), action: 'rejected', entityType: 'user', entityId: targetId, entityLabel: target?.email || target?.displayName });
    return { success: true };
  });

  // POST /api/users/:id/impersonate — log in as another user
  fastify.post('/:id/impersonate', { preHandler: [requirePermission('impersonate_users')] }, async (request: any, reply: any) => {
    const targetId = request.params.id;

    if (targetId === request.user.id) {
      return reply.code(400).send({ error: 'Cannot impersonate yourself' });
    }

    // Block impersonating admin-role users
    const [target] = await db.select({ id: profiles.id, role: profiles.role, email: profiles.email, displayName: profiles.displayName })
      .from(profiles).where(eq(profiles.id, targetId));
    if (!target) {
      return reply.code(404).send({ error: 'User not found' });
    }
    if (target.role === 'admin') {
      return reply.code(403).send({ error: 'Cannot impersonate admin accounts' });
    }

    // Create session via Better Auth's internal adapter
    const authCtx = await auth.$context;
    const newSession = await authCtx.internalAdapter.createSession(
      targetId,
      true, // dontRememberMe — short impersonation session
      {
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] || '',
        impersonatedBy: request.user.id,
      },
      true, // overrideAll — use our fields directly
    );

    // Helper: HMAC-SHA256 sign a cookie value (same as Better Auth / better-call)
    const { getWebcryptoSubtle } = await import('@better-auth/utils');
    const secretBuf = new TextEncoder().encode(authCtx.secret);
    const cryptoKey = await getWebcryptoSubtle().importKey('raw', secretBuf, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const signValue = async (val: string) => {
      const sig = await getWebcryptoSubtle().sign('HMAC', cryptoKey, new TextEncoder().encode(val));
      return encodeURIComponent(`${val}.${btoa(String.fromCharCode(...new Uint8Array(sig)))}`);
    };

    const { name: cookieName, attributes: cookieAttrs } = authCtx.authCookies.sessionToken;
    const { name: sessionDataName } = authCtx.authCookies.sessionData;
    const adminCookieProp = authCtx.createAuthCookie('admin_session');

    const cookiePath = cookieAttrs.path || '/';
    const sameSite = cookieAttrs.sameSite || 'lax';
    const isSecure = !!cookieAttrs.secure;
    const sharedAttrs = `Path=${cookiePath}; HttpOnly; SameSite=${sameSite}${isSecure ? '; Secure' : ''}`;

    // 1. Set new session_token cookie for the impersonated user
    const tokenCookie = `${cookieName}=${await signValue(newSession.token)}; ${sharedAttrs}; Max-Age=${authCtx.sessionConfig.expiresIn || 604800}`;

    // 2. Expire session_data cache cookie (forces DB lookup on next request)
    const expireDataCookie = `${sessionDataName}=; ${sharedAttrs}; Max-Age=0`;

    // 3. Save admin's session token in admin_session cookie (needed by stopImpersonating)
    const adminSessionValue = `${request.session.token}:`;
    const adminCookie = `${adminCookieProp.name}=${await signValue(adminSessionValue)}; ${sharedAttrs}; Max-Age=${authCtx.sessionConfig.expiresIn || 604800}`;

    reply.header('set-cookie', [tokenCookie, expireDataCookie, adminCookie]);

    logActivity({ ...actorFromRequest(request), action: 'impersonated', entityType: 'user', entityId: targetId, entityLabel: target.email || target.displayName });
    return { success: true };
  });

  // DELETE /api/users/:id — delete user and clean up related data
  fastify.delete('/:id', { preHandler: [requirePermission('approve_users')] }, async (request: any, reply: any) => {
    if (request.params.id === request.user.id) {
      return reply.code(400).send({ error: 'Cannot delete your own account' });
    }
    if (await isSuperAdmin(request.params.id)) {
      return reply.code(403).send({ error: 'Cannot delete super admin' });
    }

    // Non-admin callers cannot delete admin accounts
    if (!(await isAdmin(request.user.id))) {
      const [target] = await db.select({ role: profiles.role }).from(profiles).where(eq(profiles.id, request.params.id));
      if (target?.role === 'admin') {
        return reply.code(403).send({ error: 'Cannot delete admin accounts' });
      }
    }

    const [target] = await db.select({ email: profiles.email, displayName: profiles.displayName }).from(profiles).where(eq(profiles.id, request.params.id));
    await deleteUserAndRelatedData(request.params.id);
    logActivity({ ...actorFromRequest(request), action: 'deleted', entityType: 'user', entityId: request.params.id, entityLabel: target?.email || target?.displayName });
    return { success: true };
  });
}
