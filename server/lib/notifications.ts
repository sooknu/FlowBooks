import { db } from '../db';
import { notifications, teamMembers, user, profiles } from '../db/schema';
import { eq, and, inArray, isNotNull } from 'drizzle-orm';
import { getSmtpSettings, createTransporter, buildFromAddress, getCompanySettings } from './mailer';

/**
 * Get user IDs of all privileged users (owner/manager team roles + admin users).
 */
export async function getPrivilegedUserIds(): Promise<string[]> {
  const [teamRows, adminRows] = await Promise.all([
    // Team members with owner or manager role
    db.select({ userId: teamMembers.userId })
      .from(teamMembers)
      .where(
        inArray(teamMembers.role, ['owner', 'manager'])
      ),
    // Admin users who may not have a team_member record
    db.select({ id: user.id })
      .from(user)
      .where(eq(user.role, 'admin')),
  ]);

  const ids = new Set<string>();
  for (const r of teamRows) ids.add(r.userId);
  for (const r of adminRows) ids.add(r.id);
  return Array.from(ids);
}

/**
 * Fire-and-forget: create notification rows for multiple users.
 */
export async function notifyUsers(opts: {
  userIds: string[];
  type: string;
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
}): Promise<void> {
  try {
    if (!opts.userIds.length) return;
    const rows = opts.userIds.map(userId => ({
      userId,
      type: opts.type,
      title: opts.title,
      message: opts.message,
      entityType: opts.entityType ?? null,
      entityId: opts.entityId ?? null,
    }));
    await db.insert(notifications).values(rows);
  } catch (err) {
    console.error('[notifications] Failed to create notifications:', err);
  }
}

/**
 * Fire-and-forget: notify admins/managers when a new user signs up.
 * Creates in-app notifications AND sends email with a link to the users page.
 */
export function notifyNewUserSignup(newUser: { id: string; email: string; name?: string }) {
  _notifyNewUserSignup(newUser).catch(err =>
    console.error('[NewUserSignup] Notification failed:', err.message)
  );
}

async function _notifyNewUserSignup(newUser: { id: string; email: string; name?: string }) {
  const privilegedIds = await getPrivilegedUserIds();
  if (!privilegedIds.length) return;

  const displayName = newUser.name || newUser.email;

  // In-app notification
  await notifyUsers({
    userIds: privilegedIds,
    type: 'new_user_signup',
    title: 'New User Signup',
    message: `${displayName} (${newUser.email}) has signed up and is waiting for approval.`,
    entityType: 'user',
    entityId: newUser.id,
  });

  // Email notification
  const smtpSettings = await getSmtpSettings();
  if (smtpSettings.smtp_enabled !== 'true' || !smtpSettings.smtp_host) return;

  const companySettings = await getCompanySettings();
  const appName = companySettings.app_name || 'FlowBooks';
  const companyName = companySettings.company_name || '';
  const accent = companySettings.email_accent_color || companySettings.accent_color || '#8b5cf6';
  const darkBg = companySettings.email_header_bg_color || '#1a1a2e';
  const headerTextColor = companySettings.email_header_text_color || '#ffffff';
  const baseUrl = process.env.BETTER_AUTH_URL || 'http://localhost:3002';
  const usersUrl = `${baseUrl}/team?tab=accounts&approve=${newUser.id}`;
  const date = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;">
<tr><td align="center" style="padding:40px 20px;">
<table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
  <tr><td style="background:${darkBg};padding:20px 28px;">
    <span style="font-size:16px;font-weight:700;color:${headerTextColor};">${appName}</span>
  </td></tr>
  <tr><td style="height:3px;background:${accent};"></td></tr>
  <tr><td style="padding:28px;">
    <p style="margin:0 0 8px;font-size:18px;font-weight:700;color:#1f2937;">New User Signup</p>
    <p style="margin:0 0 20px;font-size:14px;color:#6b7280;">${date}</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;color:#4b5563;">
      <tr><td style="padding:10px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Name</td><td style="padding:10px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;color:#1f2937;">${displayName}</td></tr>
      <tr><td style="padding:10px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Email</td><td style="padding:10px 0;border-bottom:1px solid #e5e7eb;text-align:right;color:#1f2937;">${newUser.email}</td></tr>
      <tr><td style="padding:10px 0;color:#6b7280;">Status</td><td style="padding:10px 0;text-align:right;font-weight:600;color:#f59e0b;">Pending Approval</td></tr>
    </table>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto 0;">
      <tr><td align="center" style="border-radius:8px;background:${accent};">
        <a href="${usersUrl}" target="_blank" style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
          Review &amp; Approve
        </a>
      </td></tr>
    </table>
  </td></tr>
  <tr><td style="background:#f9fafb;padding:16px 28px;border-top:1px solid #e5e7eb;">
    <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">${companyName || appName}</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;

  // Get emails of privileged users
  const privilegedUsers = await db
    .select({ email: user.email })
    .from(user)
    .where(inArray(user.id, privilegedIds));

  const emails = privilegedUsers.map(u => u.email).filter(Boolean);
  if (!emails.length) return;

  const transporter = createTransporter(smtpSettings);
  await transporter.sendMail({
    from: buildFromAddress(smtpSettings),
    to: emails.join(', '),
    subject: `New signup: ${displayName} is waiting for approval`,
    html,
  });
}
