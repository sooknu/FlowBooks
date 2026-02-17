import type { FastifyInstance } from 'fastify';
import { logActivity } from '../lib/activityLog';

export default async function errorRoutes(fastify: FastifyInstance) {
  // POST /api/errors — log frontend errors to activity_log
  // Works for both authenticated and anonymous users
  fastify.post('/', async (request: any) => {
    const { message, stack, url, componentStack } = request.body as {
      message?: string;
      stack?: string;
      url?: string;
      componentStack?: string;
    };

    if (!message) return { ok: true }; // silently ignore empty reports

    // Build details: stack trace + component stack + page URL
    const parts: string[] = [];
    if (url) parts.push(`URL: ${url}`);
    if (stack) parts.push(stack.slice(0, 2000));
    if (componentStack) parts.push(`Component stack: ${componentStack.slice(0, 500)}`);

    logActivity({
      userId: request.user?.id ?? null,
      userDisplayName: request.userDisplayName || request.user?.email || 'Anonymous',
      action: 'frontend_error',
      entityType: 'error',
      entityId: null,
      entityLabel: message.slice(0, 200),
      details: parts.join('\n') || null,
    });

    return { ok: true };
  });
}
