import { db } from '../db';
import { rolePermissions, userPermissionOverrides, teamMembers } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { requireRole, clearRoleCache, clearAllPermissionCaches, type TeamRole, TEAM_ROLES } from '../lib/permissions';
import { PERMISSION_KEYS, PERMISSION_META, PERMISSION_GROUPS, DEFAULT_ROLE_PERMISSIONS, type PermissionKey } from '../lib/permissionConfig';

export default async function permissionRoutes(fastify: any) {
  // GET /api/permissions/keys — permission metadata for UI
  fastify.get('/keys', { preHandler: [requireRole('owner')] }, async () => {
    return { data: { keys: PERMISSION_KEYS, meta: PERMISSION_META, groups: PERMISSION_GROUPS, roles: TEAM_ROLES } };
  });

  // GET /api/permissions/defaults — full role matrix including overrides
  fastify.get('/defaults', { preHandler: [requireRole('owner')] }, async () => {
    // Fetch all role-level overrides
    const overrides = await db.select().from(rolePermissions);
    const overrideMap = new Map<string, boolean>();
    for (const o of overrides) {
      overrideMap.set(`${o.role}:${o.permission}`, o.granted);
    }

    // Build full matrix: hardcoded defaults + overrides
    const matrix: Record<string, Record<string, boolean>> = {};
    for (const role of TEAM_ROLES) {
      matrix[role] = {};
      for (const key of PERMISSION_KEYS) {
        const overrideKey = `${role}:${key}`;
        if (overrideMap.has(overrideKey)) {
          matrix[role][key] = overrideMap.get(overrideKey)!;
        } else {
          matrix[role][key] = DEFAULT_ROLE_PERMISSIONS[role][key];
        }
      }
    }

    return { data: { matrix, hardcodedDefaults: DEFAULT_ROLE_PERMISSIONS } };
  });

  // PUT /api/permissions/defaults — update role permissions
  // Body: { role: TeamRole, permissions: Record<PermissionKey, boolean | null> }
  // null value = remove override (revert to hardcoded default)
  fastify.put('/defaults', { preHandler: [requireRole('owner')] }, async (request: any, reply: any) => {
    const { role, permissions } = request.body as { role: TeamRole; permissions: Record<string, boolean | null> };

    if (!role || !TEAM_ROLES.includes(role)) {
      return reply.code(400).send({ error: 'Invalid role' });
    }
    if (role === 'owner') {
      return reply.code(400).send({ error: 'Cannot modify owner permissions' });
    }

    const defaults = DEFAULT_ROLE_PERMISSIONS[role];

    for (const [key, value] of Object.entries(permissions)) {
      if (!PERMISSION_KEYS.includes(key as PermissionKey)) continue;

      if (value === null) {
        // Remove override — revert to hardcoded default
        await db.delete(rolePermissions)
          .where(and(eq(rolePermissions.role, role), eq(rolePermissions.permission, key)));
      } else if (value !== defaults[key as PermissionKey]) {
        // Only store if different from hardcoded default
        await db.insert(rolePermissions)
          .values({ role, permission: key, granted: value, updatedAt: new Date() })
          .onConflictDoUpdate({
            target: [rolePermissions.role, rolePermissions.permission],
            set: { granted: value, updatedAt: new Date() },
          });
      } else {
        // Value matches default — remove any existing override
        await db.delete(rolePermissions)
          .where(and(eq(rolePermissions.role, role), eq(rolePermissions.permission, key)));
      }
    }

    // Clear all caches since role-level changes affect multiple users
    clearAllPermissionCaches();

    return { success: true };
  });

  // PUT /api/permissions/defaults/reset — reset a role to hardcoded defaults
  fastify.put('/defaults/reset', { preHandler: [requireRole('owner')] }, async (request: any, reply: any) => {
    const { role } = request.body as { role: TeamRole };
    if (!role || !TEAM_ROLES.includes(role) || role === 'owner') {
      return reply.code(400).send({ error: 'Invalid role' });
    }

    await db.delete(rolePermissions).where(eq(rolePermissions.role, role));
    clearAllPermissionCaches();
    return { success: true };
  });

  // GET /api/permissions/user/:userId — user effective permissions + overrides
  fastify.get('/user/:userId', { preHandler: [requireRole('owner')] }, async (request: any) => {
    const { userId } = request.params;

    // Get user's team role
    const [tm] = await db.select({ role: teamMembers.role })
      .from(teamMembers)
      .where(eq(teamMembers.userId, userId));

    const teamRole = (tm?.role || null) as TeamRole | null;

    // Get user-specific overrides
    const overrides = await db.select({ permission: userPermissionOverrides.permission, granted: userPermissionOverrides.granted })
      .from(userPermissionOverrides)
      .where(eq(userPermissionOverrides.userId, userId));

    const overrideMap: Record<string, boolean> = {};
    for (const o of overrides) {
      overrideMap[o.permission] = o.granted;
    }

    return { data: { teamRole, overrides: overrideMap } };
  });

  // PUT /api/permissions/user/:userId — set user-specific overrides
  // Body: { permissions: Record<PermissionKey, boolean | null> }
  // null = remove override (inherit from role)
  fastify.put('/user/:userId', { preHandler: [requireRole('owner')] }, async (request: any, reply: any) => {
    const { userId } = request.params;
    const { permissions } = request.body as { permissions: Record<string, boolean | null> };

    for (const [key, value] of Object.entries(permissions)) {
      if (!PERMISSION_KEYS.includes(key as PermissionKey)) continue;

      if (value === null) {
        // Remove override
        await db.delete(userPermissionOverrides)
          .where(and(eq(userPermissionOverrides.userId, userId), eq(userPermissionOverrides.permission, key)));
      } else {
        await db.insert(userPermissionOverrides)
          .values({ userId, permission: key, granted: value, updatedAt: new Date() })
          .onConflictDoUpdate({
            target: [userPermissionOverrides.userId, userPermissionOverrides.permission],
            set: { granted: value, updatedAt: new Date() },
          });
      }
    }

    // Clear this user's cache
    clearRoleCache(userId);

    return { success: true };
  });

  // PUT /api/permissions/user/:userId/clear — clear all overrides for a user
  fastify.put('/user/:userId/clear', { preHandler: [requireRole('owner')] }, async (request: any) => {
    const { userId } = request.params;
    await db.delete(userPermissionOverrides).where(eq(userPermissionOverrides.userId, userId));
    clearRoleCache(userId);
    return { success: true };
  });
}
