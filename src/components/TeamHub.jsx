import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Lightbulb, CheckSquare, Megaphone, Plus, Pin, PinOff,
  MessageCircle, ChevronLeft, Trash2, Send, Loader2,
  MoreHorizontal, Pencil, Users, Check,
} from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { cn, timeAgo } from '@/lib/utils';
import api from '@/lib/apiClient';
import { queryKeys } from '@/lib/queryKeys';
import { useAuth } from '@/contexts/AuthContext';
import { useAppData } from '@/hooks/useAppData';
import {
  useCreateHubPost, useUpdateHubPost, useDeleteHubPost,
  usePinHubPost, useToggleHubTaskComplete,
  useCreateHubComment, useDeleteHubComment,
} from '@/hooks/useMutations';

// ─── Constants ──────────────────────────────────────────────────────────────

const TYPE_CONFIG = {
  idea:         { icon: Lightbulb,   label: 'Idea',         bg: 'bg-amber-50 dark:bg-amber-950/40', text: 'text-amber-600 dark:text-amber-400', border: 'border-amber-200 dark:border-amber-800', dot: 'bg-amber-500' },
  task:         { icon: CheckSquare, label: 'Task',         bg: 'bg-blue-50 dark:bg-blue-950/40',   text: 'text-blue-600 dark:text-blue-400',   border: 'border-blue-200 dark:border-blue-800',   dot: 'bg-blue-500' },
  announcement: { icon: Megaphone,  label: 'Announcement', bg: 'bg-rose-50 dark:bg-rose-950/40',   text: 'text-rose-600 dark:text-rose-400',   border: 'border-rose-200 dark:border-rose-800',   dot: 'bg-rose-500' },
};

const FILTER_TABS = [
  { key: 'all', label: 'All' },
  { key: 'idea', label: 'Ideas' },
  { key: 'task', label: 'Tasks' },
  { key: 'announcement', label: 'Announcements' },
];

function getInitials(name) {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.substring(0, 2).toUpperCase();
}

function displayName(post) {
  return post.authorDisplayName || post.authorName || 'Unknown';
}

// ─── Post Card ──────────────────────────────────────────────────────────────

const PostCard = React.memo(({ post, index, onClick, onToggleComplete }) => {
  const tc = TYPE_CONFIG[post.type] || TYPE_CONFIG.idea;
  const Icon = tc.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03, duration: 0.25 }}
      onClick={onClick}
      className="list-card p-4 cursor-pointer group hover:border-surface-200 transition-colors"
    >
      <div className="flex items-start gap-3">
        {/* Task checkbox */}
        {post.type === 'task' ? (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleComplete?.(post.id); }}
            className={cn(
              'mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all',
              post.completed
                ? 'bg-blue-500 border-blue-500 text-white'
                : 'border-surface-300 hover:border-blue-400'
            )}
          >
            {post.completed && <Check className="w-3 h-3" />}
          </button>
        ) : (
          <div className={cn('mt-0.5 w-5 h-5 rounded-md flex items-center justify-center shrink-0', tc.bg)}>
            <Icon className={cn('w-3 h-3', tc.text)} />
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={cn('inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border', tc.bg, tc.text, tc.border)}>
              {tc.label}
            </span>
            {post.pinned && (
              <span className="text-[10px] font-medium text-surface-400 flex items-center gap-0.5">
                <Pin className="w-2.5 h-2.5" /> Pinned
              </span>
            )}
          </div>
          <h3 className={cn('text-sm font-semibold text-surface-800 leading-snug', post.completed && 'line-through opacity-50')}>
            {post.title}
          </h3>
          {post.body && (
            <p className="text-xs text-surface-400 mt-1 line-clamp-2 leading-relaxed">{post.body}</p>
          )}

          {/* Footer: author + meta */}
          <div className="flex items-center gap-2 mt-2.5">
            <Avatar className="w-5 h-5">
              {post.authorAvatarUrl && <AvatarImage src={post.authorAvatarUrl} alt={displayName(post)} />}
              <AvatarFallback className="text-[8px] font-medium bg-surface-100 text-surface-500">
                {getInitials(displayName(post))}
              </AvatarFallback>
            </Avatar>
            <span className="text-[11px] text-surface-500 font-medium">{displayName(post)}</span>
            <span className="text-surface-300">·</span>
            <span className="text-[11px] text-surface-400">{timeAgo(post.createdAt)}</span>
            {post.commentCount > 0 && (
              <>
                <span className="text-surface-300">·</span>
                <span className="text-[11px] text-surface-400 flex items-center gap-0.5">
                  <MessageCircle className="w-3 h-3" /> {post.commentCount}
                </span>
              </>
            )}
            {post.assignedToAll && (
              <>
                <span className="text-surface-300">·</span>
                <span className="text-[11px] text-blue-500 flex items-center gap-0.5 font-medium">
                  <Users className="w-3 h-3" /> Everyone
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
});

// ─── Post Detail ────────────────────────────────────────────────────────────

const PostDetail = ({ postId, onBack, userId, canManage }) => {
  const [commentText, setCommentText] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null); // 'post' | commentId
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');
  const commentInputRef = useRef(null);

  const { data: detail, isLoading } = useQuery({
    queryKey: queryKeys.hub.detail(postId),
    queryFn: () => api.get('/hub/' + postId).then(r => r.data),
    enabled: !!postId,
  });

  const pinPost = usePinHubPost();
  const toggleComplete = useToggleHubTaskComplete();
  const updatePost = useUpdateHubPost();
  const deletePost = useDeleteHubPost();
  const createComment = useCreateHubComment();
  const deleteComment = useDeleteHubComment();

  if (isLoading || !detail) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-5 h-5 animate-spin text-surface-400" />
      </div>
    );
  }

  const tc = TYPE_CONFIG[detail.type] || TYPE_CONFIG.idea;
  const Icon = tc.icon;
  const isAuthor = detail.authorId === userId;

  const handleSubmitComment = (e) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    createComment.mutate({ postId, body: commentText.trim() }, {
      onSuccess: () => setCommentText(''),
    });
  };

  const handleDelete = () => {
    if (deleteTarget === 'post') {
      deletePost.mutate(postId, { onSuccess: () => onBack() });
    } else if (deleteTarget) {
      deleteComment.mutate(deleteTarget);
    }
    setDeleteTarget(null);
  };

  const handleSaveEdit = () => {
    if (!editTitle.trim()) return;
    updatePost.mutate({ id: postId, title: editTitle.trim(), body: editBody.trim() || null }, {
      onSuccess: () => setIsEditing(false),
    });
  };

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2 }}>
      {/* Back button */}
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-surface-500 hover:text-surface-700 transition-colors mb-4">
        <ChevronLeft className="w-4 h-4" /> Back to feed
      </button>

      {/* Post content */}
      <div className="content-card p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn('inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider px-2 py-1 rounded-md border', tc.bg, tc.text, tc.border)}>
              <Icon className="w-3.5 h-3.5" />
              {tc.label}
            </span>
            {detail.pinned && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-surface-400 bg-surface-50 px-2 py-0.5 rounded-md">
                <Pin className="w-3 h-3" /> Pinned
              </span>
            )}
            {detail.completed && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md dark:bg-emerald-950/40 dark:text-emerald-400">
                <Check className="w-3 h-3" /> Done
              </span>
            )}
          </div>

          {/* Actions menu */}
          {(isAuthor || canManage) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="icon-button p-1.5">
                  <MoreHorizontal className="w-4 h-4 text-surface-400" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[140px]">
                {isAuthor && (
                  <DropdownMenuItem onClick={() => { setEditTitle(detail.title); setEditBody(detail.body || ''); setIsEditing(true); }}>
                    <Pencil className="w-3.5 h-3.5 mr-2" /> Edit
                  </DropdownMenuItem>
                )}
                {canManage && (
                  <DropdownMenuItem onClick={() => pinPost.mutate(postId)}>
                    {detail.pinned ? <PinOff className="w-3.5 h-3.5 mr-2" /> : <Pin className="w-3.5 h-3.5 mr-2" />}
                    {detail.pinned ? 'Unpin' : 'Pin'}
                  </DropdownMenuItem>
                )}
                {detail.type === 'task' && (
                  <DropdownMenuItem onClick={() => toggleComplete.mutate(postId)}>
                    <CheckSquare className="w-3.5 h-3.5 mr-2" />
                    {detail.completed ? 'Reopen' : 'Mark done'}
                  </DropdownMenuItem>
                )}
                {(isAuthor || canManage) && (
                  <DropdownMenuItem onClick={() => setDeleteTarget('post')} className="text-red-600 focus:text-red-600">
                    <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Title + body */}
        {isEditing ? (
          <div className="space-y-3 mb-4">
            <input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="glass-input w-full text-lg font-bold"
              placeholder="Title"
            />
            <textarea
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
              className="glass-input w-full min-h-[120px] text-sm"
              placeholder="Details (optional)"
            />
            <div className="flex gap-2">
              <button onClick={handleSaveEdit} disabled={!editTitle.trim() || updatePost.isPending} className="action-btn text-sm">
                {updatePost.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save'}
              </button>
              <button onClick={() => setIsEditing(false)} className="glass-button-secondary text-sm px-4 py-2 rounded-lg">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <h2 className={cn('text-lg font-bold text-surface-900 mb-2', detail.completed && 'line-through opacity-50')}>
              {detail.title}
            </h2>
            {detail.body && (
              <p className="text-sm text-surface-600 whitespace-pre-wrap leading-relaxed mb-4">{detail.body}</p>
            )}
          </>
        )}

        {/* Author + meta */}
        <div className="flex items-center gap-2.5 pt-3 border-t border-surface-100">
          <Avatar className="w-6 h-6">
            {detail.authorAvatarUrl && <AvatarImage src={detail.authorAvatarUrl} alt={displayName(detail)} />}
            <AvatarFallback className="text-[9px] font-medium bg-surface-100 text-surface-500">
              {getInitials(displayName(detail))}
            </AvatarFallback>
          </Avatar>
          <span className="text-xs font-medium text-surface-600">{displayName(detail)}</span>
          <span className="text-surface-300">·</span>
          <span className="text-xs text-surface-400">{timeAgo(detail.createdAt)}</span>
          {detail.assigneeName && (
            <>
              <span className="text-surface-300">·</span>
              <span className="text-xs text-blue-500 font-medium flex items-center gap-1">
                <Users className="w-3 h-3" /> Assigned to {detail.assigneeName}
              </span>
            </>
          )}
          {detail.assignedToAll && (
            <>
              <span className="text-surface-300">·</span>
              <span className="text-xs text-blue-500 font-medium flex items-center gap-1">
                <Users className="w-3 h-3" /> Assigned to everyone
              </span>
            </>
          )}
        </div>

        {/* Task complete toggle (quick action) */}
        {detail.type === 'task' && !isEditing && (
          <button
            onClick={() => toggleComplete.mutate(postId)}
            className={cn(
              'mt-3 flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors',
              detail.completed
                ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-400'
                : 'bg-surface-50 text-surface-500 hover:bg-surface-100'
            )}
          >
            <CheckSquare className="w-3.5 h-3.5" />
            {detail.completed ? 'Completed — click to reopen' : 'Mark as done'}
          </button>
        )}
      </div>

      {/* Comments section */}
      <div className="mt-4">
        <h3 className="text-sm font-semibold text-surface-700 mb-3 flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-surface-400" />
          Comments ({detail.comments?.length || 0})
        </h3>

        {detail.comments?.length > 0 ? (
          <div className="space-y-1">
            {detail.comments.map((comment, i) => (
              <motion.div
                key={comment.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="list-card p-3 group/comment"
              >
                <div className="flex items-start gap-2.5">
                  <Avatar className="w-6 h-6 mt-0.5">
                    {comment.authorAvatarUrl && <AvatarImage src={comment.authorAvatarUrl} alt={displayName(comment)} />}
                    <AvatarFallback className="text-[9px] font-medium bg-surface-100 text-surface-500">
                      {getInitials(displayName(comment))}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-surface-700">{displayName(comment)}</span>
                      <span className="text-[11px] text-surface-400">{timeAgo(comment.createdAt)}</span>
                      {(comment.authorId === userId || canManage) && (
                        <button
                          onClick={() => setDeleteTarget(comment.id)}
                          className="ml-auto opacity-0 group-hover/comment:opacity-100 transition-opacity p-1 text-surface-400 hover:text-red-500"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    <p className="text-sm text-surface-600 whitespace-pre-wrap leading-relaxed mt-0.5">{comment.body}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-surface-400 mb-3">No comments yet. Be the first to share your thoughts.</p>
        )}

        {/* Comment input */}
        <form onSubmit={handleSubmitComment} className="mt-3 flex gap-2">
          <input
            ref={commentInputRef}
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="Write a comment..."
            className="glass-input flex-1 text-sm"
          />
          <button
            type="submit"
            disabled={!commentText.trim() || createComment.isPending}
            className="action-btn shrink-0 px-3"
          >
            {createComment.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </form>
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget === 'post' ? 'post' : 'comment'}?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700 text-white">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
};

// ─── Create Post Dialog ─────────────────────────────────────────────────────

const CreatePostDialog = ({ open, onOpenChange, canManage }) => {
  const [type, setType] = useState('idea');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [assignedToAll, setAssignedToAll] = useState(false);

  const createPost = useCreateHubPost();

  // Load team members for task assignment
  const { data: teamMembers = [] } = useQuery({
    queryKey: queryKeys.team.list(),
    queryFn: () => api.get('/team').then(r => r.data || []),
    staleTime: 5 * 60_000,
    enabled: open && type === 'task',
  });
  const assignableMembers = teamMembers.filter(m => m.userId && m.isActive);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    createPost.mutate({
      type,
      title: title.trim(),
      body: body.trim() || null,
      ...(type === 'task' && !assignedToAll && assigneeId ? { assigneeId } : {}),
      ...(type === 'task' && assignedToAll ? { assignedToAll: true } : {}),
    }, {
      onSuccess: () => {
        setTitle('');
        setBody('');
        setAssigneeId('');
        setAssignedToAll(false);
        setType('idea');
        onOpenChange(false);
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Post</DialogTitle>
          <DialogDescription>Share an idea, assign a task, or make an announcement.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Type selector */}
          <div className="flex gap-2">
            {Object.entries(TYPE_CONFIG).map(([key, tc]) => {
              const Icon = tc.icon;
              const isActive = type === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setType(key)}
                  className={cn(
                    'flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border transition-all',
                    isActive
                      ? cn(tc.bg, tc.text, tc.border)
                      : 'bg-surface-50 text-surface-400 border-surface-200 hover:border-surface-300'
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tc.label}
                </button>
              );
            })}
          </div>

          {/* Title */}
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            className="glass-input w-full font-medium"
            autoFocus
            required
          />

          {/* Body */}
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Details (optional)"
            className="glass-input w-full min-h-[100px] text-sm"
          />

          {/* Task assignment */}
          {type === 'task' && (
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm text-surface-600">
                <input
                  type="checkbox"
                  checked={assignedToAll}
                  onChange={(e) => { setAssignedToAll(e.target.checked); if (e.target.checked) setAssigneeId(''); }}
                  className="rounded border-surface-300"
                />
                Assign to everyone
              </label>
              {!assignedToAll && (
                <select
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                  className="glass-input w-full text-sm"
                >
                  <option value="">No assignee</option>
                  {assignableMembers.map(m => (
                    <option key={m.userId} value={m.userId}>
                      {m.displayName || m.userName || m.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={!title.trim() || createPost.isPending}
            className="action-btn w-full justify-center"
          >
            {createPost.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
            Post
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

// ─── Main Component ─────────────────────────────────────────────────────────

const TeamHub = () => {
  const { user } = useAuth();
  const { can } = useAppData();
  const canManage = can('manage_hub');
  const [selectedPostId, setSelectedPostId] = useState(null);
  const [filterType, setFilterType] = useState('all');
  const [showCreate, setShowCreate] = useState(false);

  const toggleComplete = useToggleHubTaskComplete();

  const { data: feedData, isLoading } = useQuery({
    queryKey: queryKeys.hub.list({ type: filterType === 'all' ? undefined : filterType }),
    queryFn: () => api.get('/hub', {
      ...(filterType !== 'all' ? { type: filterType } : {}),
      page: '0',
      pageSize: '100',
    }),
  });

  const posts = feedData?.data || [];

  if (selectedPostId) {
    return (
      <div className="space-y-4 pb-10 lg:pb-4">
        <PostDetail
          postId={selectedPostId}
          onBack={() => setSelectedPostId(null)}
          userId={user?.id}
          canManage={canManage}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-10 lg:pb-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold text-surface-900 tracking-tight">Team Hub</h1>
            <span className="text-[9px] font-bold uppercase tracking-widest text-blue-500 bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 rounded-full border border-blue-200 dark:border-blue-800">
              Beta
            </span>
          </div>
          <p className="text-surface-400 text-sm mt-0.5">Ideas, tasks, and announcements for the team</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="action-btn">
          <Plus className="w-4 h-4 mr-2" /> New Post
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-surface-100/50 rounded-lg p-1">
        {FILTER_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilterType(tab.key)}
            className={cn(
              'text-xs font-medium px-3 py-1.5 rounded-md transition-all',
              filterType === tab.key
                ? 'bg-white dark:bg-surface-200/80 text-surface-800 shadow-sm'
                : 'text-surface-400 hover:text-surface-600'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Feed */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-5 h-5 animate-spin text-surface-400" />
        </div>
      ) : posts.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-16"
        >
          <div className="w-12 h-12 rounded-full bg-surface-100 flex items-center justify-center mx-auto mb-3">
            <MessageCircle className="w-6 h-6 text-surface-400" />
          </div>
          <h3 className="text-lg font-semibold text-surface-700 mb-1">
            {filterType === 'all' ? 'No posts yet' : `No ${filterType}s yet`}
          </h3>
          <p className="text-surface-400 text-sm mb-4">Be the first to share something with the team.</p>
          <button onClick={() => setShowCreate(true)} className="action-btn mx-auto">
            <Plus className="w-4 h-4 mr-2" /> Create Post
          </button>
        </motion.div>
      ) : (
        <div className="space-y-1.5">
          <AnimatePresence>
            {posts.map((post, i) => (
              <PostCard
                key={post.id}
                post={post}
                index={i}
                onClick={() => setSelectedPostId(post.id)}
                onToggleComplete={(id) => toggleComplete.mutate(id)}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      <CreatePostDialog open={showCreate} onOpenChange={setShowCreate} canManage={canManage} />
    </div>
  );
};

export default TeamHub;
