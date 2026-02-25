import { db } from '../db';
import { hubPosts, hubComments, user, profiles } from '../db/schema';
import { eq, and, desc, count, sql } from 'drizzle-orm';
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

function authorJoin(query: any) {
  return query
    .leftJoin(user, eq(hubPosts.authorId, user.id))
    .leftJoin(profiles, eq(hubPosts.authorId, profiles.id));
}

export default async function hubRoutes(fastify: any) {

  // GET / — list posts with pagination + optional type filter
  fastify.get('/', { preHandler: [viewGuard] }, async (request: any) => {
    const { type, page = '0', pageSize = '50' } = request.query;
    const skip = parseInt(page) * parseInt(pageSize);
    const take = parseInt(pageSize);

    const commentCountSql = sql<number>`(SELECT COUNT(*) FROM hub_comments WHERE hub_comments.post_id = hub_posts.id)::int`;

    // Alias tables for assignee join
    const assigneeUser = sql`u2`;

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
        assigneeId: hubPosts.assigneeId,
        assignedToAll: hubPosts.assignedToAll,
        completed: hubPosts.completed,
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

    return { data, count: total };
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
      assigneeId: hubPosts.assigneeId,
      assignedToAll: hubPosts.assignedToAll,
      completed: hubPosts.completed,
      createdAt: hubPosts.createdAt,
      updatedAt: hubPosts.updatedAt,
      ...authorFields,
    })
      .from(hubPosts)
      .leftJoin(user, eq(hubPosts.authorId, user.id))
      .leftJoin(profiles, eq(hubPosts.authorId, profiles.id))
      .where(eq(hubPosts.id, id));

    if (!post) return reply.code(404).send({ error: 'Post not found' });

    // Fetch assignee name if task has assigneeId
    let assigneeName: string | null = null;
    if (post.assigneeId) {
      const [assignee] = await db.select({
        name: user.name,
        displayName: profiles.displayName,
      })
        .from(user)
        .leftJoin(profiles, eq(user.id, profiles.id))
        .where(eq(user.id, post.assigneeId));
      assigneeName = assignee?.displayName || assignee?.name || null;
    }

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

    return { data: { ...post, assigneeName, comments } };
  });

  // POST / — create post
  fastify.post('/', { preHandler: [viewGuard] }, async (request: any) => {
    const { type, title, body, assigneeId, assignedToAll } = request.body;

    const [data] = await db.insert(hubPosts).values({
      authorId: request.user.id,
      type,
      title,
      body: body || null,
      assigneeId: type === 'task' ? (assigneeId || null) : null,
      assignedToAll: type === 'task' ? (assignedToAll || false) : false,
    }).returning();

    logActivity({ ...actorFromRequest(request), action: 'created', entityType: 'hub_post', entityId: data.id, entityLabel: title });
    broadcast('hub_post', 'created', request.user.id, data.id);

    // Notify assignee for tasks
    if (type === 'task' && assigneeId && assigneeId !== request.user.id) {
      notifyUsers({
        userIds: [assigneeId],
        type: 'hub_task_assigned',
        title: 'New Task Assigned',
        message: `${request.userDisplayName || request.user.email} assigned you: "${title}"`,
        entityType: 'hub_post',
        entityId: data.id,
      });
    }

    return { data };
  });

  // PUT /:id — update post
  fastify.put('/:id', { preHandler: [viewGuard] }, async (request: any, reply: any) => {
    const { id } = request.params;
    const canManage = hasPermission(request, 'manage_hub');

    const [existing] = await db.select({ authorId: hubPosts.authorId }).from(hubPosts).where(eq(hubPosts.id, id));
    if (!existing) return reply.code(404).send({ error: 'Post not found' });
    if (existing.authorId !== request.user.id && !canManage) {
      return reply.code(403).send({ error: 'Not authorized' });
    }

    const { title, body, assigneeId, assignedToAll } = request.body;
    const [data] = await db.update(hubPosts).set({
      ...(title !== undefined && { title }),
      ...(body !== undefined && { body: body || null }),
      ...(assigneeId !== undefined && { assigneeId: assigneeId || null }),
      ...(assignedToAll !== undefined && { assignedToAll }),
      updatedAt: new Date(),
    }).where(eq(hubPosts.id, id)).returning();

    logActivity({ ...actorFromRequest(request), action: 'updated', entityType: 'hub_post', entityId: id, entityLabel: data.title });
    broadcast('hub_post', 'updated', request.user.id, id);
    return { data };
  });

  // PUT /:id/pin — toggle pinned (admin only)
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

  // PUT /:id/complete — toggle task completed
  fastify.put('/:id/complete', { preHandler: [viewGuard] }, async (request: any, reply: any) => {
    const { id } = request.params;
    const [existing] = await db.select({
      type: hubPosts.type,
      completed: hubPosts.completed,
      authorId: hubPosts.authorId,
      assigneeId: hubPosts.assigneeId,
      assignedToAll: hubPosts.assignedToAll,
      title: hubPosts.title,
    }).from(hubPosts).where(eq(hubPosts.id, id));

    if (!existing) return reply.code(404).send({ error: 'Post not found' });
    if (existing.type !== 'task') return reply.code(400).send({ error: 'Only tasks can be completed' });

    const canManage = hasPermission(request, 'manage_hub');
    const isAuthor = existing.authorId === request.user.id;
    const isAssignee = existing.assigneeId === request.user.id;
    if (!isAuthor && !isAssignee && !existing.assignedToAll && !canManage) {
      return reply.code(403).send({ error: 'Not authorized' });
    }

    const [data] = await db.update(hubPosts).set({
      completed: !existing.completed,
      updatedAt: new Date(),
    }).where(eq(hubPosts.id, id)).returning();

    logActivity({ ...actorFromRequest(request), action: data.completed ? 'completed' : 'reopened', entityType: 'hub_post', entityId: id, entityLabel: existing.title });
    broadcast('hub_post', 'updated', request.user.id, id);
    return { data };
  });

  // DELETE /:id — delete post
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

    const [post] = await db.select({ authorId: hubPosts.authorId, title: hubPosts.title }).from(hubPosts).where(eq(hubPosts.id, id));
    if (!post) return reply.code(404).send({ error: 'Post not found' });

    const [data] = await db.insert(hubComments).values({
      postId: id,
      authorId: request.user.id,
      body,
    }).returning();

    logActivity({ ...actorFromRequest(request), action: 'commented', entityType: 'hub_post', entityId: id, entityLabel: post.title });
    broadcast('hub_comment', 'created', request.user.id, data.id);

    // Notify post author if different from commenter
    if (post.authorId !== request.user.id) {
      notifyUsers({
        userIds: [post.authorId],
        type: 'hub_comment',
        title: 'New Comment on Your Post',
        message: `${request.userDisplayName || request.user.email} commented on "${post.title}"`,
        entityType: 'hub_post',
        entityId: id,
      });
    }

    return { data };
  });

  // DELETE /comments/:commentId — delete comment
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
