import { db } from '../db';
import { activityLog } from '../db/schema';

export interface LogActivityParams {
  userId: string | null;
  userDisplayName: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  entityLabel?: string | null;
  details?: string | null;
}

/**
 * Fire-and-forget activity logging.
 * Never throws — errors are logged to console but do not affect the caller.
 */
export function logActivity(params: LogActivityParams): void {
  db.insert(activityLog)
    .values({
      userId: params.userId,
      userDisplayName: params.userDisplayName,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId ?? null,
      entityLabel: params.entityLabel ?? null,
      details: params.details ?? null,
    })
    .catch((err) => {
      console.error('[ActivityLog] Failed to write log entry:', err);
    });
}

/** Extract common user fields from a Fastify request for logging */
export function actorFromRequest(request: any): { userId: string; userDisplayName: string } {
  return {
    userId: request.user.id,
    userDisplayName: request.userDisplayName || request.user.email,
  };
}
