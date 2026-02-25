import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Lightbulb, CheckSquare, Megaphone, Plus, Pin, PinOff,
  MessageCircle, ChevronLeft, Trash2, Send, Loader2,
  MoreHorizontal, Pencil, Users, Check, Calendar, AlertTriangle,
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

function formatDueDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // Use UTC to extract the calendar date that was stored (avoids timezone shift)
  const due = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const diffDays = Math.round((due - today) / 86400000);
  const label = due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (diffDays < 0) return { label, overdue: true, text: `Overdue (${label})` };
  if (diffDays === 0) return { label, overdue: false, today: true, text: `Due today` };
  if (diffDays === 1) return { label, overdue: false, text: `Due tomorrow` };
  return { label, overdue: false, text: `Due ${label}` };
}

// Format a Date or ISO string to YYYY-MM-DD for input[type=date]
function toDateInputValue(d) {
  if (!d) return '';
  const date = new Date(d);
  // Use UTC so the stored midnight-UTC date maps back to the correct calendar day
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ─── Post Card ──────────────────────────────────────────────────────────────

const PostCard = React.memo(({ post, index, onClick, onToggleComplete, onContextMenu, userId }) => {
  const tc = TYPE_CONFIG[post.type] || TYPE_CONFIG.idea;
  const Icon = tc.icon;
  const myDone = (post.completedBy || []).includes(userId);

  const handleContextMenu = (e) => {
    if (window.innerWidth < 1024) return;
    e.preventDefault();
    onContextMenu?.(e, post);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03, duration: 0.25 }}
      onClick={onClick}
      onContextMenu={handleContextMenu}
      className={cn(
        "list-card p-4 cursor-pointer group transition-colors",
        post.pinned
          ? "bg-amber-50/40 dark:bg-amber-950/20"
          : "hover:border-surface-200"
      )}
    >
      {/* Pinned left accent bar */}
      {post.pinned && (
        <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-amber-400 dark:bg-amber-500/60" />
      )}
      <div className="flex items-start gap-3">
        {/* Task checkbox — shows current user's completion */}
        {post.type === 'task' ? (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleComplete?.(post.id); }}
            className={cn(
              'mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all',
              myDone
                ? 'bg-blue-500 border-blue-500 text-white'
                : 'border-surface-300 hover:border-blue-400'
            )}
          >
            {myDone && <Check className="w-3 h-3" />}
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
              <span className="text-[10px] font-medium text-amber-500 dark:text-amber-400/80 flex items-center gap-0.5">
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

          {/* Footer: meta */}
          <div className="flex items-center gap-2 mt-2.5 flex-wrap">
            {post.assignedToAll ? (
              <span className="text-[11px] text-blue-500 flex items-center gap-0.5 font-medium">
                <Users className="w-3 h-3" /> Assigned to Everyone
              </span>
            ) : post.assigneeNames?.length > 0 ? (
              <span className="text-[11px] text-blue-500 flex items-center gap-0.5 font-medium">
                <Users className="w-3 h-3" /> Assigned to {post.assigneeNames.join(', ')}
              </span>
            ) : null}
            {(post.assignedToAll || post.assigneeNames?.length > 0) && <span className="text-surface-300">·</span>}
            <span className="text-[11px] text-surface-400">Created by <span className="text-surface-500 font-medium">{displayName(post)}</span></span>
            <span className="text-surface-300">·</span>
            <span className="text-[11px] text-surface-400">{timeAgo(post.createdAt)}</span>
            {post.type === 'task' && post.dueDate && !post.completed && (() => {
              const due = formatDueDate(post.dueDate);
              return due ? (
                <>
                  <span className="text-surface-300">·</span>
                  <span className={cn('text-[11px] flex items-center gap-0.5 font-medium', due.overdue ? 'text-red-500' : due.today ? 'text-amber-500' : 'text-surface-400')}>
                    {due.overdue && <AlertTriangle className="w-3 h-3" />}
                    <Calendar className="w-3 h-3" /> {due.text}
                  </span>
                </>
              ) : null;
            })()}
            {post.commentCount > 0 && (
              <>
                <span className="text-surface-300">·</span>
                <span className="text-[11px] text-surface-400 flex items-center gap-0.5">
                  <MessageCircle className="w-3 h-3" /> {post.commentCount}
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
  const [editAssigneeIds, setEditAssigneeIds] = useState([]);
  const [editAssignedToAll, setEditAssignedToAll] = useState(false);
  const [editDueDate, setEditDueDate] = useState('');
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

  // Load team members for task assignee editing
  const { data: teamMembers = [] } = useQuery({
    queryKey: queryKeys.team.list(),
    queryFn: () => api.get('/team').then(r => r.data || []),
    staleTime: 5 * 60_000,
    enabled: isEditing && detail?.type === 'task',
  });
  const assignableMembers = teamMembers.filter(m => m.userId && m.isActive);

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
    const payload = { id: postId, title: editTitle.trim(), body: editBody.trim() || null };
    if (detail?.type === 'task') {
      payload.assignedToAll = editAssignedToAll;
      payload.assigneeIds = editAssignedToAll ? [] : editAssigneeIds;
      payload.dueDate = editDueDate || null;
    }
    updatePost.mutate(payload, {
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
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-surface-400 bg-surface-100 px-2 py-0.5 rounded-md">
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
          {(isAuthor || canManage || detail.type === 'task') && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="icon-button p-1.5">
                  <MoreHorizontal className="w-4 h-4 text-surface-400" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[140px]">
                {(isAuthor || canManage) && (
                  <DropdownMenuItem onClick={() => { setEditTitle(detail.title); setEditBody(detail.body || ''); setEditAssigneeIds((detail.assigneeIds || []).slice()); setEditAssignedToAll(detail.assignedToAll || false); setEditDueDate(toDateInputValue(detail.dueDate)); setIsEditing(true); }}>
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
                    {(detail.completedBy || []).includes(userId) ? 'Undo complete' : 'Mark done'}
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
          <div className="mb-4">
            {/* Notion-style inline title */}
            <input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="w-full text-lg font-bold text-surface-900 bg-transparent outline-none placeholder:text-surface-300 mb-1"
              placeholder="Untitled"
              autoFocus
            />
            {/* Notion-style inline body */}
            <textarea
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
              className="w-full text-sm text-surface-600 bg-transparent outline-none resize-none min-h-[80px] placeholder:text-surface-300 leading-relaxed"
              placeholder="Add details..."
            />

            {/* Task properties — Notion property-panel style */}
            {detail.type === 'task' && (
              <div className="mt-2 border-t border-surface-100 pt-1">
                {/* Assignees row */}
                <div className="flex items-start gap-3 py-2.5 rounded-md px-2 -mx-2">
                  <span className="text-xs text-surface-400 w-20 shrink-0 pt-1 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5" /> Assignees
                  </span>
                  <div className="flex-1 min-w-0">
                    <label className="inline-flex items-center gap-1.5 text-xs cursor-pointer mb-2 px-2.5 py-1 rounded-md border border-dashed border-surface-200 text-surface-500 hover:border-surface-300 hover:text-surface-600 transition-colors">
                      <input
                        type="checkbox"
                        checked={editAssignedToAll}
                        onChange={(e) => { setEditAssignedToAll(e.target.checked); if (e.target.checked) setEditAssigneeIds([]); }}
                        className="rounded border-surface-300 w-3 h-3"
                      />
                      Everyone
                    </label>
                    {!editAssignedToAll && assignableMembers.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {assignableMembers.map(m => {
                          const checked = editAssigneeIds.includes(m.userId);
                          return (
                            <button
                              key={m.userId}
                              type="button"
                              onClick={() => setEditAssigneeIds(prev => checked ? prev.filter(id => id !== m.userId) : [...prev, m.userId])}
                              className={cn(
                                'text-xs px-2.5 py-1 rounded-md border transition-all',
                                checked
                                  ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800 font-medium'
                                  : 'bg-transparent text-surface-500 border-surface-200 hover:border-surface-300 hover:text-surface-600'
                              )}
                            >
                              {m.displayName || m.userName || m.name}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Due date row */}
                <div className="flex items-center gap-3 py-2.5 rounded-md px-2 -mx-2">
                  <span className="text-xs text-surface-400 w-20 shrink-0 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" /> Due date
                  </span>
                  <div className="flex-1 flex items-center gap-2">
                    <input
                      type="date"
                      value={editDueDate}
                      onChange={(e) => setEditDueDate(e.target.value)}
                      className="text-sm text-surface-700 bg-transparent outline-none border-b border-transparent focus:border-surface-300 transition-colors py-0.5"
                    />
                    {editDueDate && (
                      <button type="button" onClick={() => setEditDueDate('')} className="text-[11px] text-surface-400 hover:text-red-500 transition-colors">
                        Clear
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 mt-3 pt-3 border-t border-surface-100">
              <button onClick={handleSaveEdit} disabled={!editTitle.trim() || updatePost.isPending} className="action-btn text-sm">
                {updatePost.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save changes'}
              </button>
              <button onClick={() => setIsEditing(false)} className="text-sm text-surface-400 hover:text-surface-600 transition-colors px-3 py-1.5">
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
        <div className="flex items-center gap-2.5 pt-3 border-t border-surface-100 flex-wrap">
          <Avatar className="w-6 h-6">
            {detail.authorAvatarUrl && <AvatarImage src={detail.authorAvatarUrl} alt={displayName(detail)} />}
            <AvatarFallback className="text-[9px] font-medium bg-surface-100 text-surface-500">
              {getInitials(displayName(detail))}
            </AvatarFallback>
          </Avatar>
          <span className="text-xs font-medium text-surface-600">{displayName(detail)}</span>
          <span className="text-surface-300">·</span>
          <span className="text-xs text-surface-400">{timeAgo(detail.createdAt)}</span>
          {detail.assignedToAll ? (
            <>
              <span className="text-surface-300">·</span>
              <span className="text-xs text-blue-500 font-medium flex items-center gap-1">
                <Users className="w-3 h-3" /> Assigned to everyone
              </span>
            </>
          ) : detail.assigneeNames?.length > 0 && (
            <>
              <span className="text-surface-300">·</span>
              <span className="text-xs text-blue-500 font-medium flex items-center gap-1">
                <Users className="w-3 h-3" /> Assigned to {detail.assigneeNames.join(', ')}
              </span>
            </>
          )}
          {detail.type === 'task' && detail.dueDate && (() => {
            const due = formatDueDate(detail.dueDate);
            return due ? (
              <>
                <span className="text-surface-300">·</span>
                <span className={cn('text-xs flex items-center gap-1 font-medium', due.overdue && !detail.completed ? 'text-red-500' : due.today && !detail.completed ? 'text-amber-500' : 'text-surface-400')}>
                  {due.overdue && !detail.completed && <AlertTriangle className="w-3 h-3" />}
                  <Calendar className="w-3 h-3" /> {due.text}
                </span>
              </>
            ) : null;
          })()}
        </div>

        {/* Task complete toggle (per-user) */}
        {detail.type === 'task' && !isEditing && (() => {
          const completedBy = detail.completedBy || [];
          const myDone = completedBy.includes(userId);
          const assigneeCount = detail.assignedToAll ? null : (detail.assigneeIds || []).length;
          const doneCount = completedBy.length;
          return (
            <div className="mt-3 flex items-center gap-3">
              <button
                onClick={() => toggleComplete.mutate(postId)}
                className={cn(
                  'flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors',
                  myDone
                    ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-400'
                    : 'bg-surface-100 text-surface-500 hover:bg-surface-200/60'
                )}
              >
                <CheckSquare className="w-3.5 h-3.5" />
                {myDone ? 'You completed this — undo' : 'Mark as done'}
              </button>
              {assigneeCount > 1 && (
                <span className="text-[11px] text-surface-400">
                  {doneCount}/{assigneeCount} done
                </span>
              )}
            </div>
          );
        })()}
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
  const [selectedIds, setSelectedIds] = useState([]);
  const [assignedToAll, setAssignedToAll] = useState(false);
  const [dueDate, setDueDate] = useState('');

  const createPost = useCreateHubPost();

  // Load team members for task assignment
  const { data: teamMembers = [] } = useQuery({
    queryKey: queryKeys.team.list(),
    queryFn: () => api.get('/team').then(r => r.data || []),
    staleTime: 5 * 60_000,
    enabled: open && type === 'task',
  });
  const assignableMembers = teamMembers.filter(m => m.userId && m.isActive);

  const toggleAssignee = (userId) => {
    setSelectedIds(prev => prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    createPost.mutate({
      type,
      title: title.trim(),
      body: body.trim() || null,
      ...(type === 'task' && !assignedToAll && selectedIds.length > 0 ? { assigneeIds: selectedIds } : {}),
      ...(type === 'task' && assignedToAll ? { assignedToAll: true } : {}),
      ...(type === 'task' && dueDate ? { dueDate } : {}),
    }, {
      onSuccess: () => {
        setTitle('');
        setBody('');
        setSelectedIds([]);
        setAssignedToAll(false);
        setDueDate('');
        setType('idea');
        onOpenChange(false);
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="dialog-mobile-fullscreen sm:max-w-md">
        <DialogHeader className="dialog-mobile-fullscreen__header">
          <DialogTitle>New Post</DialogTitle>
          <DialogDescription>Share an idea, assign a task, or make an announcement.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="sm:space-y-4 max-sm:flex max-sm:flex-col max-sm:flex-1 max-sm:min-h-0">
          {/* Scrollable body on mobile */}
          <div className="dialog-mobile-fullscreen__body sm:contents space-y-4">
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
                        : 'bg-surface-100 text-surface-400 border-surface-200 hover:border-surface-300'
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
              className="glass-input w-full min-h-[100px] max-sm:min-h-[140px] text-sm"
            />

            {/* Task assignment — multi-select */}
            {type === 'task' && (
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm text-surface-600">
                  <input
                    type="checkbox"
                    checked={assignedToAll}
                    onChange={(e) => { setAssignedToAll(e.target.checked); if (e.target.checked) setSelectedIds([]); }}
                    className="rounded border-surface-300"
                  />
                  Assign to everyone
                </label>
                {!assignedToAll && assignableMembers.length > 0 && (
                  <div className="border border-surface-200 rounded-lg max-h-40 overflow-y-auto divide-y divide-surface-100">
                    {assignableMembers.map(m => {
                      const checked = selectedIds.includes(m.userId);
                      return (
                        <label key={m.userId} className="flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer hover:bg-surface-100 transition-colors">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleAssignee(m.userId)}
                            className="rounded border-surface-300"
                          />
                          <span className={cn('text-surface-700', checked && 'font-medium')}>
                            {m.displayName || m.userName || m.name}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Due date for tasks */}
            {type === 'task' && (
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-surface-400" />
                <span className="text-sm text-surface-500">Due date</span>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="glass-input text-sm py-1.5 flex-1"
                  placeholder="Due date"
                />
                {dueDate && (
                  <button type="button" onClick={() => setDueDate('')} className="text-xs text-surface-400 hover:text-red-500 transition-colors">
                    Clear
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Submit — sticky at bottom on mobile */}
          <div className="dialog-mobile-fullscreen__footer sm:!p-0 sm:!border-0">
            <button
              type="submit"
              disabled={!title.trim() || createPost.isPending}
              className="action-btn w-full justify-center"
            >
              {createPost.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
              Post
            </button>
          </div>
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedPostId, setSelectedPostId] = useState(() => searchParams.get('post'));

  // Clear ?post= param once we've consumed it
  useEffect(() => {
    if (searchParams.has('post')) {
      setSearchParams({}, { replace: true });
    }
  }, []);
  const [filterType, setFilterType] = useState('all');
  const [showCreate, setShowCreate] = useState(false);

  const toggleComplete = useToggleHubTaskComplete();
  const pinPost = usePinHubPost();
  const deletePost = useDeleteHubPost();

  // Context menu state
  const [contextMenu, setContextMenu] = useState(null);
  const contextMenuRef = useRef(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const handleContextMenu = useCallback((e, post) => {
    setContextMenu({ x: e.clientX, y: e.clientY, post });
  }, []);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  // Close context menu on click outside, scroll, or Escape
  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = (e) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target)) closeContextMenu();
    };
    const handleKey = (e) => { if (e.key === 'Escape') closeContextMenu(); };
    window.addEventListener('mousedown', handleClick);
    window.addEventListener('keydown', handleKey);
    window.addEventListener('scroll', closeContextMenu, true);
    return () => {
      window.removeEventListener('mousedown', handleClick);
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('scroll', closeContextMenu, true);
    };
  }, [contextMenu, closeContextMenu]);

  // Reposition context menu if it overflows viewport
  useEffect(() => {
    if (!contextMenu || !contextMenuRef.current) return;
    const el = contextMenuRef.current;
    const rect = el.getBoundingClientRect();
    let x = contextMenu.x, y = contextMenu.y;
    if (rect.right > window.innerWidth) x = window.innerWidth - rect.width - 8;
    if (rect.bottom > window.innerHeight) y = window.innerHeight - rect.height - 8;
    if (x !== contextMenu.x || y !== contextMenu.y) {
      setContextMenu(prev => prev ? { ...prev, x, y } : null);
    }
  }, [contextMenu]);

  const handleDeleteConfirm = () => {
    if (deleteTarget) {
      deletePost.mutate(deleteTarget);
    }
    setDeleteTarget(null);
  };

  const { data: feedData, isLoading } = useQuery({
    queryKey: queryKeys.hub.list({ type: filterType === 'all' ? undefined : filterType }),
    queryFn: () => api.get('/hub', {
      ...(filterType !== 'all' ? { type: filterType } : {}),
      page: '0',
      pageSize: '100',
    }),
  });

  const posts = useMemo(() => {
    const raw = feedData?.data || [];
    if (!raw.length) return raw;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const score = (p) => {
      if (p.pinned) return 0;
      if (p.completed) return 50;
      if (p.type === 'task' && p.dueDate) {
        const due = new Date(p.dueDate);
        const d = new Date(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
        const diff = Math.round((d - today) / 86400000);
        if (diff < 0) return 10;   // overdue
        if (diff === 0) return 15;  // due today
        if (diff <= 3) return 20;   // due very soon
      }
      return 30; // normal
    };

    return [...raw].sort((a, b) => {
      const sa = score(a), sb = score(b);
      if (sa !== sb) return sa - sb;
      // Within urgent groups — soonest due date first
      if (sa >= 10 && sa <= 20 && a.dueDate && b.dueDate) {
        return new Date(a.dueDate) - new Date(b.dueDate);
      }
      // Otherwise newest first
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  }, [feedData]);

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
                userId={user?.id}
                onClick={() => setSelectedPostId(post.id)}
                onToggleComplete={(id) => toggleComplete.mutate(id)}
                onContextMenu={handleContextMenu}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      <CreatePostDialog open={showCreate} onOpenChange={setShowCreate} canManage={canManage} />

      {/* Right-click context menu (desktop only) */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          {contextMenu.post.type === 'task' && (
            <button className="context-menu__item" onClick={() => { toggleComplete.mutate(contextMenu.post.id); closeContextMenu(); }}>
              <CheckSquare className="w-3.5 h-3.5" />
              {(contextMenu.post.completedBy || []).includes(user?.id) ? 'Undo complete' : 'Mark done'}
            </button>
          )}
          {(contextMenu.post.authorId === user?.id || canManage) && (
            <button className="context-menu__item" onClick={() => { setSelectedPostId(contextMenu.post.id); closeContextMenu(); }}>
              <Pencil className="w-3.5 h-3.5" /> Edit
            </button>
          )}
          {canManage && (
            <button className="context-menu__item" onClick={() => { pinPost.mutate(contextMenu.post.id); closeContextMenu(); }}>
              {contextMenu.post.pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
              {contextMenu.post.pinned ? 'Unpin' : 'Pin'}
            </button>
          )}
          {(contextMenu.post.authorId === user?.id || canManage) && (
            <>
              <div className="context-menu__separator" />
              <button className="context-menu__item context-menu__item--danger" onClick={() => { setDeleteTarget(contextMenu.post.id); closeContextMenu(); }}>
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </button>
            </>
          )}
        </div>
      )}

      {/* Delete confirmation (from context menu) */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete post?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-red-600 hover:bg-red-700 text-white">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default TeamHub;
