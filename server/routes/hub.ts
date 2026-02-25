import { db } from '../db';
import { hubPosts, hubComments, user, profiles } from '../db/schema';
import { eq, and, desc, count, sql, inArray } from 'drizzle-orm';
import { requirePermission, hasPermission } from '../lib/permissions';
import { logActivity, actorFromRequest } from '../lib/activityLog';
import { notifyUsers } from '../lib/notifications';
import { broadcast } from '../lib/pubsub';

const viewGuard = requirePermission('view_hub');
const manageGuard = requirePermission('manage_hub');

const authorFields = {
  authorName: user.name,
  authorAvatarUrl: profiles.avatarUrl,
  authorDisplayName: profiles.displayName,
};

/** Resolve display names for an array of user IDs */
async function resolveAssigneeNames(ids: string[]): Promise<{ id: string; name: string }[]> {
  if (!ids?.length) return [];
  const rows = await db.select({
    id: user.id,
    name: user.name,
    displayName: profiles.displayName,
  })
    .from(user)
    .leftJoin(profiles, eq(user.id, profiles.id))
    .where(inArray(user.id, ids));
  return rows.map(r => ({ id: r.id, name: r.displayName || r.name || 'Unknown' }));
}

export default async function hubRoutes(fastify: any) {

  // GET / — list posts with pagination + optional type filter
  fastify.get('/', { preHandler: [viewGuard] }, async (request: any) => {
    const { type, page = '0', pageSize = '50' } = request.query;
    const skip = parseInt(page) * parseInt(pageSize);
    const take = parseInt(pageSize);

    const commentCountSql = sql<number>`(SELECT COUNT(*) FROM hub_comments WHERE hub_comments.post_id = hub_posts.id)::int`;

    const conditions: any[] = [];
    if (type && ['idea', 'task', 'announcement'].includes(type)) {
      conditions.push(eq(hubPosts.type, type));
    }
    const where = conditions.length ? and(...conditions) : undefined;

    const [data, [{ total }]] = await Promise.all([
      db.select({
        id: hubPosts.id,
        authorId: hubPosts.authorId,
        type: hubPosts.type,
        title: hubPosts.title,
        body: hubPosts.body,
        pinned: hubPosts.pinned,
        assigneeIds: hubPosts.assigneeIds,
        assignedToAll: hubPosts.assignedToAll,
        completed: hubPosts.completed,
        completedBy: hubPosts.completedBy,
        thumbsUpIds: hubPosts.thumbsUpIds,
        thumbsDownIds: hubPosts.thumbsDownIds,
        dueDate: hubPosts.dueDate,
        createdAt: hubPosts.createdAt,
        ...authorFields,
        commentCount: commentCountSql,
      })
        .from(hubPosts)
        .leftJoin(user, eq(hubPosts.authorId, user.id))
        .leftJoin(profiles, eq(hubPosts.authorId, profiles.id))
        .where(where)
        .orderBy(desc(hubPosts.pinned), desc(hubPosts.createdAt))
        .limit(take)
        .offset(skip),
      db.select({ total: count() }).from(hubPosts).where(where),
    ]);

    // Batch-resolve assignee names for all posts
    const allIds = [...new Set(data.flatMap((p: any) => (p.assigneeIds as string[]) || []))];
    const nameMap = new Map((await resolveAssigneeNames(allIds)).map(n => [n.id, n.name]));
    const enriched = data.map((p: any) => ({
      ...p,
      assigneeNames: ((p.assigneeIds as string[]) || []).map((id: string) => nameMap.get(id) || 'Unknown'),
    }));

    return { data: enriched, count: total };
  });

  // GET /:id — single post with all comments
  fastify.get('/:id', { preHandler: [viewGuard] }, async (request: any, reply: any) => {
    const { id } = request.params;

    const [post] = await db.select({
      id: hubPosts.id,
      authorId: hubPosts.authorId,
      type: hubPosts.type,
      title: hubPosts.title,
      body: hubPosts.body,
      pinned: hubPosts.pinned,
      assigneeIds: hubPosts.assigneeIds,
      assignedToAll: hubPosts.assignedToAll,
      completed: hubPosts.completed,
      completedBy: hubPosts.completedBy,
      thumbsUpIds: hubPosts.thumbsUpIds,
      thumbsDownIds: hubPosts.thumbsDownIds,
      dueDate: hubPosts.dueDate,
      createdAt: hubPosts.createdAt,
      updatedAt: hubPosts.updatedAt,
      ...authorFields,
    })
      .from(hubPosts)
      .leftJoin(user, eq(hubPosts.authorId, user.id))
      .leftJoin(profiles, eq(hubPosts.authorId, profiles.id))
      .where(eq(hubPosts.id, id));

    if (!post) return reply.code(404).send({ error: 'Post not found' });

    const assigneeNames = await resolveAssigneeNames((post.assigneeIds as string[]) || []);

    const comments = await db.select({
      id: hubComments.id,
      authorId: hubComments.authorId,
      body: hubComments.body,
      createdAt: hubComments.createdAt,
      authorName: user.name,
      authorAvatarUrl: profiles.avatarUrl,
      authorDisplayName: profiles.displayName,
    })
      .from(hubComments)
      .leftJoin(user, eq(hubComments.authorId, user.id))
      .leftJoin(profiles, eq(hubComments.authorId, profiles.id))
      .where(eq(hubComments.postId, id))
      .orderBy(hubComments.createdAt);

    return { data: { ...post, assigneeNames: assigneeNames.map(a => a.name), comments } };
  });

  // POST / — create post
  fastify.post('/', { preHandler: [viewGuard] }, async (request: any) => {
    const { type, title, body, assigneeIds, assignedToAll, dueDate } = request.body;

    const ids: string[] = type === 'task' && Array.isArray(assigneeIds) ? assigneeIds.filter(Boolean) : [];

    const [data] = await db.insert(hubPosts).values({
      authorId: request.user.id,
      type,
      title,
      body: body || null,
      assigneeIds: ids,
      assignedToAll: type === 'task' ? (assignedToAll || false) : false,
      ...(type === 'task' && dueDate ? { dueDate: new Date(dueDate) } : {}),
    }).returning();

    logActivity({ ...actorFromRequest(request), action: 'created', entityType: 'hub_post', entityId: data.id, entityLabel: title });
    broadcast('hub_post', 'created', request.user.id, data.id);

    // Notify assignees for tasks
    if (type === 'task' && ids.length > 0) {
      const toNotify = ids.filter((id: string) => id !== request.user.id);
      if (toNotify.length > 0) {
        notifyUsers({
          userIds: toNotify,
          type: 'hub_task_assigned',
          title: 'New Task Assigned',
          message: `${request.userDisplayName || request.user.email} assigned you: "${title}"`,
          entityType: 'hub_post',
          entityId: data.id,
        });
      }
    }

    return { data };
  });

  // PUT /:id — update post (author or manager only)
  fastify.put('/:id', { preHandler: [viewGuard] }, async (request: any, reply: any) => {
    const { id } = request.params;
    const canManage = hasPermission(request, 'manage_hub');

    const [existing] = await db.select({ authorId: hubPosts.authorId, assigneeIds: hubPosts.assigneeIds, title: hubPosts.title, type: hubPosts.type }).from(hubPosts).where(eq(hubPosts.id, id));
    if (!existing) return reply.code(404).send({ error: 'Post not found' });
    if (existing.authorId !== request.user.id && !canManage) {
      return reply.code(403).send({ error: 'Not authorized' });
    }

    const { title, body, assigneeIds, assignedToAll, dueDate } = request.body;
    const [data] = await db.update(hubPosts).set({
      ...(title !== undefined && { title }),
      ...(body !== undefined && { body: body || null }),
      ...(assigneeIds !== undefined && { assigneeIds: Array.isArray(assigneeIds) ? assigneeIds.filter(Boolean) : [] }),
      ...(assignedToAll !== undefined && { assignedToAll }),
      ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
      updatedAt: new Date(),
    }).where(eq(hubPosts.id, id)).returning();

    logActivity({ ...actorFromRequest(request), action: 'updated', entityType: 'hub_post', entityId: id, entityLabel: data.title });
    broadcast('hub_post', 'updated', request.user.id, id);

    // Notify newly added assignees
    if (existing.type === 'task' && assigneeIds !== undefined) {
      const prevIds = (existing.assigneeIds as string[]) || [];
      const newIds: string[] = (Array.isArray(assigneeIds) ? assigneeIds.filter(Boolean) : []).filter((id: string) => !prevIds.includes(id) && id !== request.user.id);
      if (newIds.length > 0) {
        notifyUsers({
          userIds: newIds,
          type: 'hub_task_assigned',
          title: 'New Task Assigned',
          message: `${request.userDisplayName || request.user.email} assigned you: "${data.title}"`,
          entityType: 'hub_post',
          entityId: id,
        });
      }
    }

    return { data };
  });

  // PUT /:id/pin — toggle pinned (manager only)
  fastify.put('/:id/pin', { preHandler: [manageGuard] }, async (request: any, reply: any) => {
    const { id } = request.params;
    const [existing] = await db.select({ pinned: hubPosts.pinned, title: hubPosts.title }).from(hubPosts).where(eq(hubPosts.id, id));
    if (!existing) return reply.code(404).send({ error: 'Post not found' });

    const [data] = await db.update(hubPosts).set({
      pinned: !existing.pinned,
      updatedAt: new Date(),
    }).where(eq(hubPosts.id, id)).returning();

    logActivity({ ...actorFromRequest(request), action: data.pinned ? 'pinned' : 'unpinned', entityType: 'hub_post', entityId: id, entityLabel: existing.title });
    broadcast('hub_post', 'updated', request.user.id, id);
    return { data };
  });

  // PUT /:id/complete — toggle per-user task completion
  fastify.put('/:id/complete', { preHandler: [viewGuard] }, async (request: any, reply: any) => {
    const { id } = request.params;
    const userId = request.user.id;
    const [existing] = await db.select({
      type: hubPosts.type,
      completed: hubPosts.completed,
      completedBy: hubPosts.completedBy,
      assigneeIds: hubPosts.assigneeIds,
      assignedToAll: hubPosts.assignedToAll,
      authorId: hubPosts.authorId,
      title: hubPosts.title,
    }).from(hubPosts).where(eq(hubPosts.id, id));

    if (!existing) return reply.code(404).send({ error: 'Post not found' });
    if (existing.type !== 'task') return reply.code(400).send({ error: 'Only tasks can be completed' });

    // Toggle this user's completion
    const prevBy = (existing.completedBy as string[]) || [];
    const alreadyDone = prevBy.includes(userId);
    const newBy = alreadyDone ? prevBy.filter((id: string) => id !== userId) : [...prevBy, userId];

    // Task is fully completed when all assignees have checked off (or anyone if assignedToAll/no assignees)
    const assignees = (existing.assigneeIds as string[]) || [];
    const allDone = assignees.length > 0 && !existing.assignedToAll
      ? assignees.every((aid: string) => newBy.includes(aid))
      : newBy.length > 0;

    const [data] = await db.update(hubPosts).set({
      completedBy: newBy,
      completed: allDone,
      updatedAt: new Date(),
    }).where(eq(hubPosts.id, id)).returning();

    logActivity({ ...actorFromRequest(request), action: alreadyDone ? 'reopened' : 'completed', entityType: 'hub_post', entityId: id, entityLabel: existing.title });
    broadcast('hub_post', 'updated', request.user.id, id);

    // Notify when task is fully completed — tell the author + other assignees
    if (allDone && !existing.completed) {
      const toNotify = [...new Set([...assignees, existing.authorId])].filter((id: string) => id !== userId);
      if (toNotify.length > 0) {
        notifyUsers({
          userIds: toNotify,
          type: 'hub_task_completed',
          title: 'Task Completed',
          message: `"${existing.title}" has been completed by all assignees`,
          entityType: 'hub_post',
          entityId: id,
        });
      }
    }

    return { data };
  });

  // PUT /:id/vote — toggle thumbs up/down on idea posts
  fastify.put('/:id/vote', { preHandler: [viewGuard] }, async (request: any, reply: any) => {
    const { id } = request.params;
    const userId = request.user.id;
    const { vote } = request.body || {};
    if (!['up', 'down'].includes(vote)) return reply.code(400).send({ error: 'vote must be "up" or "down"' });

    const [existing] = await db.select({
      type: hubPosts.type,
      thumbsUpIds: hubPosts.thumbsUpIds,
      thumbsDownIds: hubPosts.thumbsDownIds,
    }).from(hubPosts).where(eq(hubPosts.id, id));

    if (!existing) return reply.code(404).send({ error: 'Post not found' });
    if (existing.type !== 'idea') return reply.code(400).send({ error: 'Only ideas can be voted on' });

    let ups = (existing.thumbsUpIds as string[]) || [];
    let downs = (existing.thumbsDownIds as string[]) || [];

    if (vote === 'up') {
      downs = downs.filter((uid: string) => uid !== userId);
      ups = ups.includes(userId) ? ups.filter((uid: string) => uid !== userId) : [...ups, userId];
    } else {
      ups = ups.filter((uid: string) => uid !== userId);
      downs = downs.includes(userId) ? downs.filter((uid: string) => uid !== userId) : [...downs, userId];
    }

    const [data] = await db.update(hubPosts).set({
      thumbsUpIds: ups,
      thumbsDownIds: downs,
      updatedAt: new Date(),
    }).where(eq(hubPosts.id, id)).returning();

    broadcast('hub_post', 'updated', request.user.id, id);
    return { data };
  });

  // DELETE /:id — delete post (author or manager only)
  fastify.delete('/:id', { preHandler: [viewGuard] }, async (request: any, reply: any) => {
    const { id } = request.params;
    const canManage = hasPermission(request, 'manage_hub');

    const [existing] = await db.select({ authorId: hubPosts.authorId, title: hubPosts.title }).from(hubPosts).where(eq(hubPosts.id, id));
    if (!existing) return reply.code(404).send({ error: 'Post not found' });
    if (existing.authorId !== request.user.id && !canManage) {
      return reply.code(403).send({ error: 'Not authorized' });
    }

    await db.delete(hubPosts).where(eq(hubPosts.id, id));
    logActivity({ ...actorFromRequest(request), action: 'deleted', entityType: 'hub_post', entityId: id, entityLabel: existing.title });
    broadcast('hub_post', 'deleted', request.user.id, id);
    return { success: true };
  });

  // POST /:id/comments — add comment
  fastify.post('/:id/comments', { preHandler: [viewGuard] }, async (request: any, reply: any) => {
    const { id } = request.params;
    const { body } = request.body;

    const [post] = await db.select({ authorId: hubPosts.authorId, title: hubPosts.title, assigneeIds: hubPosts.assigneeIds }).from(hubPosts).where(eq(hubPosts.id, id));
    if (!post) return reply.code(404).send({ error: 'Post not found' });

    const [data] = await db.insert(hubComments).values({
      postId: id,
      authorId: request.user.id,
      body,
    }).returning();

    logActivity({ ...actorFromRequest(request), action: 'commented', entityType: 'hub_post', entityId: id, entityLabel: post.title });
    broadcast('hub_comment', 'created', request.user.id, data.id);

    // Notify post author + assignees (excluding commenter)
    const commentNotifyIds = [...new Set([post.authorId, ...((post.assigneeIds as string[]) || [])])].filter((uid: string) => uid !== request.user.id);
    if (commentNotifyIds.length > 0) {
      notifyUsers({
        userIds: commentNotifyIds,
        type: 'hub_comment',
        title: 'New Comment',
        message: `${request.userDisplayName || request.user.email} commented on "${post.title}"`,
        entityType: 'hub_post',
        entityId: id,
      });
    }

    return { data };
  });

  // DELETE /comments/:commentId — delete comment (author or manager only)
  fastify.delete('/comments/:commentId', { preHandler: [viewGuard] }, async (request: any, reply: any) => {
    const { commentId } = request.params;
    const canManage = hasPermission(request, 'manage_hub');

    const [existing] = await db.select({ authorId: hubComments.authorId, postId: hubComments.postId }).from(hubComments).where(eq(hubComments.id, commentId));
    if (!existing) return reply.code(404).send({ error: 'Comment not found' });
    if (existing.authorId !== request.user.id && !canManage) {
      return reply.code(403).send({ error: 'Not authorized' });
    }

    await db.delete(hubComments).where(eq(hubComments.id, commentId));
    logActivity({ ...actorFromRequest(request), action: 'deleted', entityType: 'hub_comment', entityId: commentId });
    broadcast('hub_comment', 'deleted', request.user.id, commentId);
    return { success: true };
  });
}
