import React, { useState, useRef, useMemo, useEffect, useCallback, memo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import { motion, useMotionValue, animate } from 'framer-motion';
import { cn, fmtDate, tzDate } from '@/lib/utils';
import { useProjectTypes } from '@/lib/projectTypes';
import {
  FolderKanban, Plus, Search, X, ArrowUpDown, Loader2, Camera,
  Pencil, Archive, ArchiveRestore, Lock, Trash2,
} from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useDebounce } from '@/hooks/useDebounce';
import { useArchiveProject, useRestoreProject, useDeleteProjectPermanently } from '@/hooks/useMutations';
import { useAppData } from '@/hooks/useAppData';
import { useAuth } from '@/contexts/AuthContext';
import { queryKeys } from '@/lib/queryKeys';
import api from '@/lib/apiClient';
const PAGE_SIZE = 25;

const PROJECT_STATUSES = [
  { value: 'lead', label: 'Lead' },
  { value: 'booked', label: 'Booked' },
  { value: 'shooting', label: 'Shooting' },
  { value: 'editing', label: 'Editing' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'completed', label: 'Completed' },
];

const STATUS_COLORS = {
  lead: 'text-surface-500',
  booked: 'text-blue-400',
  shooting: 'text-rose-400',
  editing: 'text-amber-400',
  delivered: 'text-emerald-400',
  completed: 'text-emerald-400',
  archived: 'text-surface-400',
};

/* Status border colors are now in BEM CSS via data-status attribute */

const SORT_OPTIONS = [
  { label: 'Newest First', orderBy: 'createdAt', asc: false },
  { label: 'Oldest First', orderBy: 'createdAt', asc: true },
  { label: 'Shoot Date ↑', orderBy: 'shootStartDate', asc: true },
  { label: 'Shoot Date ↓', orderBy: 'shootStartDate', asc: false },
  { label: 'Title A-Z', orderBy: 'title', asc: true },
];

const STATUS_FILTERS = [
  { value: '', label: 'All Active' },
  ...PROJECT_STATUSES,
  { value: 'archived', label: 'Archived' },
];

function formatDate(d) {
  if (!d) return null;
  return fmtDate(d, { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── ProjectRow ──────────────────────────────────────────────────────────────

const DELETE_THRESHOLD = -80;

const ProjectRow = memo(({ project, onEdit, onArchive, onRestore, onDelete, onContextMenu, canEdit, canDelete, getTypeColor }) => {
  const navigate = useNavigate();
  const x = useMotionValue(0);
  const isArchived = project.status === 'archived';
  const isSwipeable = canEdit;

  const d = project.shootStartDate ? new Date(project.shootStartDate) : null;
  const endD = project.shootEndDate ? new Date(project.shootEndDate) : null;
  const typeColor = getTypeColor(project.projectTypeId || project.projectType);

  const clientName = project.client
    ? (project.client.company || `${project.client.firstName || ''} ${project.client.lastName || ''}`.trim())
    : null;

  const dateStr = d
    ? endD && endD.getTime() !== d.getTime()
      ? `${fmtDate(project.shootStartDate, { month: 'short', day: 'numeric' })} – ${fmtDate(project.shootEndDate, { month: 'short', day: 'numeric' })}`
      : fmtDate(project.shootStartDate, { weekday: 'short', month: 'short', day: 'numeric' })
    : null;

  const meta = [clientName, project.location].filter(Boolean);

  const handleContextMenu = (e) => {
    if (!canEdit || window.innerWidth < 1024) return;
    e.preventDefault();
    onContextMenu?.(e, project);
  };

  const cardContent = (
    <div className="event-card-row group" data-status={project.status || 'lead'} onContextMenu={handleContextMenu}>
      <div className="event-card-row__body">
        <div className="event-card-row__header">
          <span className="event-card-row__title">
            {project.title}
            {project.lockedBy && <Lock className="w-3 h-3 text-amber-500 inline-block ml-1.5 flex-shrink-0" />}
          </span>
        </div>

        <div className="event-card-row__meta">
          {project.projectTypeRel && (
            <span className={cn('event-card-row__pill', typeColor.pill)}>{project.projectTypeRel.label}</span>
          )}
          {meta.map((item, i) => (
            <span key={i} className="event-card-row__chip">{item}</span>
          ))}
        </div>
      </div>

      {d ? (
        <div className="event-card-row__date">
          <span className="event-card-row__date-month">{fmtDate(project.shootStartDate, { month: 'short' })}</span>
          <span className="event-card-row__date-day">{d.getDate()}</span>
        </div>
      ) : (
        <div className="event-card-row__date event-card-row__date--empty">
          <Camera className="w-4 h-4 text-muted-foreground" />
        </div>
      )}

      <div className="event-card-row__details">
        {dateStr && <span className="event-card-row__date-text">{dateStr}</span>}
        <span className={cn('event-card-row__status', STATUS_COLORS[project.status])}>{project.status}</span>
      </div>
    </div>
  );

  if (!isSwipeable) {
    return (
      <div onClick={() => navigate(`/projects/${project.id}`)}>
        {cardContent}
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-xl">
      <div
        className={cn('absolute inset-0 flex items-center justify-end pr-6 rounded-xl', isArchived ? 'bg-red-500' : 'bg-amber-500')}
        onClick={(e) => { e.stopPropagation(); isArchived ? onDelete(project) : onArchive(project); }}
      >
        {isArchived ? <Trash2 className="w-5 h-5 text-white" /> : <Archive className="w-5 h-5 text-white" />}
      </div>

      <motion.div
        className="relative z-10 swipe-card"
        style={{ x }}
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: DELETE_THRESHOLD, right: 0 }}
        dragElastic={0.1}
        onDragEnd={(_, info) => {
          if (info.offset.x < DELETE_THRESHOLD / 2) {
            animate(x, DELETE_THRESHOLD, { type: 'spring', stiffness: 300, damping: 30 });
          } else {
            animate(x, 0, { type: 'spring', stiffness: 300, damping: 30 });
          }
        }}
        onClick={() => {
          if (Math.abs(x.get()) < 5) navigate(`/projects/${project.id}`);
        }}
      >
        {cardContent}
      </motion.div>
    </div>
  );
});
ProjectRow.displayName = 'ProjectRow';

// ─── ProjectsManager ─────────────────────────────────────────────────────────

const ProjectsManager = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const archiveProject = useArchiveProject();
  const restoreProject = useRestoreProject();
  const deleteProject = useDeleteProjectPermanently();
  const { isPrivileged, can } = useAppData();
  const { user } = useAuth();

  const { getTypeColor } = useProjectTypes();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const mineFilter = searchParams.get('mine') === 'true';
  const [sortIndex, setSortIndex] = useState(0);
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const [contextMenu, setContextMenu] = useState(null);

  const debouncedSearch = useDebounce(searchTerm, 300);
  const currentSort = SORT_OPTIONS[sortIndex];

  const tabScrollRef = useRef(null);
  const contextMenuRef = useRef(null);
  const sentinelRef = useRef(null);

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: queryKeys.projects.list({ search: debouncedSearch, status: statusFilter, mine: mineFilter, orderBy: currentSort.orderBy, asc: currentSort.asc }),
    queryFn: async ({ pageParam = 0 }) => {
      return api.get('/projects', {
        search: debouncedSearch || undefined,
        status: statusFilter || undefined,
        mine: mineFilter || undefined,
        page: pageParam,
        pageSize: PAGE_SIZE,
        orderBy: currentSort.orderBy,
        asc: currentSort.asc,
      });
    },
    getNextPageParam: (lastPage, allPages) => {
      const totalFetched = allPages.reduce((sum, p) => sum + (p.data?.length || 0), 0);
      return totalFetched < (lastPage.count || 0) ? allPages.length : undefined;
    },
    initialPageParam: 0,
    staleTime: 2 * 60 * 1000, // 2 min — prevents refetch flash on back-navigation
  });

  const projects = useMemo(() => data?.pages.flatMap(p => p.data || []) ?? [], [data]);
  const totalCount = data?.pages[0]?.count ?? 0;

  // Auto-load next page when sentinel scrolls into view
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage(); },
      { rootMargin: '200px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleEdit = (project) => {
    navigate(`/projects/${project.id}/edit`);
  };

  const handleArchive = (project) => {
    setArchiveTarget(project);
  };

  const confirmArchive = () => {
    if (archiveTarget) {
      archiveProject.mutate(archiveTarget.id, {
        onSuccess: () => setArchiveTarget(null),
      });
    }
  };

  const handleRestore = (project) => {
    restoreProject.mutate(project.id);
  };

  const handleDelete = (project) => setDeleteTarget(project);

  const handleContextMenu = useCallback((e, project) => {
    setContextMenu({ x: e.clientX, y: e.clientY, project });
  }, []);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  // Close context menu on click-outside, scroll, or Escape
  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = (e) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target)) closeContextMenu();
    };
    const handleKey = (e) => { if (e.key === 'Escape') closeContextMenu(); };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    window.addEventListener('scroll', closeContextMenu, true);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
      window.removeEventListener('scroll', closeContextMenu, true);
    };
  }, [contextMenu, closeContextMenu]);

  // Clamp context menu to viewport bounds
  useEffect(() => {
    if (!contextMenu || !contextMenuRef.current) return;
    const el = contextMenuRef.current;
    const rect = el.getBoundingClientRect();
    const pad = 8;
    let x = contextMenu.x, y = contextMenu.y;
    if (rect.right > window.innerWidth - pad) x = window.innerWidth - rect.width - pad;
    if (rect.bottom > window.innerHeight - pad) y = window.innerHeight - rect.height - pad;
    if (x !== contextMenu.x || y !== contextMenu.y) {
      el.style.left = x + 'px';
      el.style.top = y + 'px';
    }
  }, [contextMenu]);

  const confirmDelete = () => {
    if (deleteTarget) {
      deleteProject.mutate(deleteTarget.id, {
        onSuccess: () => setDeleteTarget(null),
      });
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="hidden md:block">
          <h2 className="text-2xl font-bold text-surface-800">Projects</h2>
          <p className="text-surface-400 text-sm">Manage your photography projects</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSortIndex((sortIndex + 1) % SORT_OPTIONS.length)}
            className="action-btn action-btn--secondary"
            title={`Sort: ${currentSort.label}`}
          >
            <ArrowUpDown className="action-btn__icon" />
            <span className="hidden sm:inline">{currentSort.label}</span>
          </button>
          <button
            onClick={() => navigate('/projects/new')}
            className="action-btn"
          >
            <Plus className="action-btn__icon" />
            <span className="hidden md:inline">New Project</span>
          </button>
        </div>
      </div>

      {/* Search + scope + status filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-2 flex-1 min-w-0">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
            <input
              type="text"
              placeholder="Search projects..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="glass-input w-full pl-10 pr-9"
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-700 transition-colors">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="flex gap-0.5 p-1 bg-surface-100 rounded-lg flex-shrink-0">
            <button
              onClick={() => { if (mineFilter) setSearchParams({}); }}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                !mineFilter ? 'bg-white text-surface-800 shadow-sm' : 'text-surface-500 hover:text-surface-700'
              )}
            >All</button>
            <button
              onClick={() => { if (!mineFilter) setSearchParams({ mine: 'true' }); }}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                mineFilter ? 'bg-white text-surface-800 shadow-sm' : 'text-surface-500 hover:text-surface-700'
              )}
            >Mine</button>
          </div>
        </div>
        <div className="flex-shrink-0">
          <div
            ref={tabScrollRef}
            className="flex gap-1 px-2 py-1 bg-surface-100 rounded-lg overflow-x-auto scrollbar-hide"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            {STATUS_FILTERS.map(f => (
              <button
                key={f.value}
                onClick={(e) => {
                  setStatusFilter(f.value);
                  e.currentTarget.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                }}
                className={cn(
                  "px-3.5 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap flex-shrink-0",
                  statusFilter === f.value
                    ? 'bg-white text-surface-800 shadow-sm'
                    : 'text-surface-500 hover:text-surface-700'
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          {/* Dot indicators — mobile only */}
          <div className="flex justify-center gap-1.5 pt-1.5 sm:hidden">
            {STATUS_FILTERS.map(f => (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                className={cn(
                  "w-1.5 h-1.5 rounded-full transition-colors duration-200",
                  statusFilter === f.value ? "bg-surface-500" : "bg-surface-200"
                )}
              />
            ))}
          </div>
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : projects.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-16 h-16 rounded-2xl bg-surface-100 flex items-center justify-center mx-auto mb-4">
            <FolderKanban className="w-8 h-8 text-surface-400" />
          </div>
          <h3 className="text-lg font-semibold text-surface-700 mb-1">No projects yet</h3>
          <p className="text-surface-400 text-sm mb-4">Create your first project to get started.</p>
          <button onClick={() => navigate('/projects/new')} className="action-btn">
            <Plus className="w-4 h-4 mr-2" /> New Project
          </button>
        </div>
      ) : (
        <>
          <p className="text-xs text-surface-400">{totalCount} project{totalCount !== 1 ? 's' : ''}</p>
          <div className="space-y-2">
            {projects.map(p => (
              <ProjectRow key={p.id} project={p} onEdit={handleEdit} onArchive={handleArchive} onRestore={handleRestore} onDelete={handleDelete} onContextMenu={handleContextMenu} canEdit={isPrivileged || (p.userId === user?.id && !p.lockedBy)} canDelete={can('delete_projects')} getTypeColor={getTypeColor} />
            ))}
          </div>
          <div ref={sentinelRef} className="h-1" />
          {isFetchingNextPage && (
            <div className="flex justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-surface-300" />
            </div>
          )}
        </>
      )}

      {/* Archive Confirmation */}
      <AlertDialog open={!!archiveTarget} onOpenChange={(open) => { if (!open) setArchiveTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive project?</AlertDialogTitle>
            <AlertDialogDescription>
              "{archiveTarget?.title}" will be moved to the archive. You can find it later in the Archived filter.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmArchive}>Archive</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete project?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.title}" and all its notes and assignments will be permanently deleted. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700 text-white">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Desktop right-click context menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button className="context-menu__item" onClick={() => { handleEdit(contextMenu.project); closeContextMenu(); }}>
            <Pencil className="w-3.5 h-3.5" /> Edit
          </button>
          {contextMenu.project.status === 'archived' ? (
            <>
              <button className="context-menu__item" onClick={() => { handleRestore(contextMenu.project); closeContextMenu(); }}>
                <ArchiveRestore className="w-3.5 h-3.5" /> Restore
              </button>
              {can('delete_projects') && (
                <>
                  <div className="context-menu__separator" />
                  <button className="context-menu__item context-menu__item--danger" onClick={() => { handleDelete(contextMenu.project); closeContextMenu(); }}>
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </button>
                </>
              )}
            </>
          ) : (
            <>
              <div className="context-menu__separator" />
              <button className="context-menu__item context-menu__item--danger" onClick={() => { handleArchive(contextMenu.project); closeContextMenu(); }}>
                <Archive className="w-3.5 h-3.5" /> Archive
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default ProjectsManager;
