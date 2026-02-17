import { db } from '../db';
import { notifications, teamMembers, user } from '../db/schema';
import { eq, inArray } from 'drizzle-orm';

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
