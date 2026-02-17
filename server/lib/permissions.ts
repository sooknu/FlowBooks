import { db } from '../db';
import { profiles, user, teamMembers, rolePermissions, userPermissionOverrides } from '../db/schema';
import { eq } from 'drizzle-orm';
import { PERMISSION_KEYS, DEFAULT_ROLE_PERMISSIONS, type PermissionKey } from './permissionConfig';

export const SUPER_ADMIN_EMAIL = 'sahid@live.com';

export const TEAM_ROLES = ['crew', 'lead', 'manager', 'owner'] as const;
export type TeamRole = typeof TEAM_ROLES[number];

export type Permissions = Record<PermissionKey, boolean>;

// In-memory cache with 60s TTL to avoid per-request DB hits
interface CacheEntry {
  role: string;
  teamRole: TeamRole | null;
  teamMemberId: string | null;
  approved: boolean;
  displayName: string;
  permissions: Permissions;
  ts: number;
}
const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 60_000;

/**
 * Resolve permissions for a user by merging:
 * 1. Owner → all true (safety)
 * 2. User-specific overrides (highest precedence)
 * 3. Role-level overrides
 * 4. Hardcoded defaults
 */
async function resolvePermissions(userId: string, teamRole: TeamRole | null): Promise<Permissions> {
  // Owner always gets everything
  if (teamRole === 'owner') {
    return Object.fromEntries(PERMISSION_KEYS.map(k => [k, true])) as Permissions;
  }

  // No team role → all denied
  if (!teamRole) {
    return Object.fromEntries(PERMISSION_KEYS.map(k => [k, false])) as Permissions;
  }

  // Fetch overrides from DB
  const [roleOverrides, userOverrides] = await Promise.all([
    db.select({ permission: rolePermissions.permission, granted: rolePermissions.granted })
      .from(rolePermissions)
      .where(eq(rolePermissions.role, teamRole)),
    db.select({ permission: userPermissionOverrides.permission, granted: userPermissionOverrides.granted })
      .from(userPermissionOverrides)
      .where(eq(userPermissionOverrides.userId, userId)),
  ]);

  // Build lookup maps
  const roleMap = new Map(roleOverrides.map(r => [r.permission, r.granted]));
  const userMap = new Map(userOverrides.map(u => [u.permission, u.granted]));

  // Merge: user override → role override → hardcoded default
  const defaults = DEFAULT_ROLE_PERMISSIONS[teamRole];
  const permissions = {} as Permissions;
  for (const key of PERMISSION_KEYS) {
    if (userMap.has(key)) {
      permissions[key] = userMap.get(key)!;
    } else if (roleMap.has(key)) {
      permissions[key] = roleMap.get(key)!;
    } else {
      permissions[key] = defaults[key];
    }
  }

  return permissions;
}

export async function getUserRoleAndApproval(userId: string) {
  const cached = cache.get(userId);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return { role: cached.role, teamRole: cached.teamRole, approved: cached.approved, displayName: cached.displayName, teamMemberId: cached.teamMemberId, permissions: cached.permissions };
  }

  const [[profile], [tm]] = await Promise.all([
    db.select({ role: profiles.role, approved: profiles.approved, firstName: profiles.firstName, displayName: profiles.displayName, email: profiles.email })
      .from(profiles)
      .where(eq(profiles.id, userId)),
    db.select({ id: teamMembers.id, role: teamMembers.role, isActive: teamMembers.isActive })
      .from(teamMembers)
      .where(eq(teamMembers.userId, userId)),
  ]);

  const role = profile?.role || 'user';
  const approved = profile?.approved ?? false;
  const displayName = profile?.firstName || profile?.displayName || profile?.email || '';

  // Resolve team role: admin with no team_member → owner; active team_member → their role; else null
  let teamRole: TeamRole | null = null;
  let teamMemberId: string | null = null;
  if (tm && tm.isActive) {
    teamRole = tm.role as TeamRole;
    teamMemberId = tm.id;
  } else if (role === 'admin') {
    teamRole = 'owner';
  }

  // Resolve granular permissions
  const permissions = await resolvePermissions(userId, teamRole);

  cache.set(userId, { role, teamRole, teamMemberId, approved, displayName, permissions, ts: Date.now() });
  return { role, approved, displayName, teamRole, teamMemberId, permissions };
}

export async function getUserRole(userId: string): Promise<string> {
  return (await getUserRoleAndApproval(userId)).role;
}

export function clearRoleCache(userId: string) {
  cache.delete(userId);
}

/** Clear all cached entries — use when role-level permissions change (affects all users with that role) */
export function clearAllPermissionCaches() {
  cache.clear();
}

export async function isSuperAdmin(userId: string): Promise<boolean> {
  const [u] = await db
    .select({ email: user.email })
    .from(user)
    .where(eq(user.id, userId));
  return u?.email === SUPER_ADMIN_EMAIL;
}

export async function isSuperAdminEmail(email: string): Promise<boolean> {
  return email === SUPER_ADMIN_EMAIL;
}

/**
 * Fastify preHandler hook — rejects non-admin users with 403.
 */
export async function requireAdmin(request: any, reply: any) {
  const role = request.userRole || (await getUserRole(request.user.id));
  if (role !== 'admin') {
    return reply.code(403).send({ error: 'Forbidden: admin access required' });
  }
}

export async function isAdmin(userId: string): Promise<boolean> {
  return (await getUserRole(userId)) === 'admin';
}

/**
 * Fastify preHandler hook — rejects users whose teamRole is not in allowedRoles.
 */
export function requireRole(...allowedRoles: TeamRole[]) {
  return async function (request: any, reply: any) {
    const teamRole = request.teamRole as TeamRole | null;
    if (!teamRole || !allowedRoles.includes(teamRole)) {
      return reply.code(403).send({ error: 'Forbidden: insufficient role' });
    }
  };
}

/**
 * Fastify preHandler hook — allows access if the user is accessing their own resource
 * (identified by request.params[paramName] matching request.teamMemberId),
 * OR if the user has one of the allowed roles.
 */
export function requireSelfOrRole(paramName: string, ...allowedRoles: TeamRole[]) {
  return async function (request: any, reply: any) {
    const selfId = request.teamMemberId;
    const paramId = request.params?.[paramName];
    if (selfId && paramId && selfId === paramId) return; // self-access
    const teamRole = request.teamRole as TeamRole | null;
    if (!teamRole || !allowedRoles.includes(teamRole)) {
      return reply.code(403).send({ error: 'Forbidden: insufficient role' });
    }
  };
}

/**
 * Check if the current request has a specific permission.
 */
export function hasPermission(request: any, key: PermissionKey): boolean {
  return request.permissions?.[key] === true;
}

/**
 * Fastify preHandler hook — rejects users who lack ALL of the specified permissions.
 * User must have at least one of the listed permissions.
 */
export function requirePermission(...keys: PermissionKey[]) {
  return async function (request: any, reply: any) {
    const perms = request.permissions as Permissions | undefined;
    if (!perms || !keys.some(k => perms[k])) {
      return reply.code(403).send({ error: 'Forbidden: insufficient permissions' });
    }
  };
}
