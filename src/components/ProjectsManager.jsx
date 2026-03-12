import React, { useState, useRef, useMemo, useEffect, useCallback, memo } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { motion, useMotionValue, animate, AnimatePresence } from 'framer-motion';
import { cn, fmtDate, tzDate } from '@/lib/utils';
import { useProjectTypes } from '@/lib/projectTypes';
import {
  FolderKanban, Plus, Search, X, Loader2, Camera,
  Pencil, Archive, ArchiveRestore, Trash2, DollarSign, TrendingUp, ChevronDown,
  Calendar, Tag, Filter, XCircle, Users,
} from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useDebounce } from '@/hooks/useDebounce';
import { useArchiveProject, useRestoreProject, useDeleteProjectPermanently } from '@/hooks/useMutations';
import { useAppData } from '@/hooks/useAppData';
import AnniversaryBanner from '@/components/AnniversaryBanner';
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

const DEFAULT_SORT = { orderBy: 'shootStartDate', asc: true };

const currentYear = new Date().getFullYear();
const YEAR_OPTIONS = [
  { value: '', label: 'All' },
  { value: String(currentYear - 1), label: String(currentYear - 1) },
  { value: String(currentYear), label: String(currentYear) },
  { value: String(currentYear + 1), label: String(currentYear + 1) },
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

const fmtCurrency = (v) => {
  if (v == null || isNaN(v)) return null;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);
};

const ProjectRow = memo(({ project, onEdit, onArchive, onRestore, onDelete, onContextMenu, canEdit, canDelete, getTypeColor, backTo, financialMode, onBeforeNavigate }) => {
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

      {parseFloat(project.balanceOwed) > 0 && (
        <span className="event-card-row__balance-chip lg:hidden">{fmtCurrency(project.balanceOwed)}</span>
      )}

      {d ? (
        <div className="event-card-row__date">
          <span className="event-card-row__date-month">{fmtDate(project.shootStartDate, { month: 'short' })}</span>
          <span className="event-card-row__date-day">{d.getDate()}</span>
          <span className="event-card-row__date-year">{d.getFullYear()}</span>
        </div>
      ) : (
        <div className="event-card-row__date event-card-row__date--empty">
          <Camera className="w-4 h-4 text-muted-foreground" />
        </div>
      )}

      <div className="event-card-row__details">
        {financialMode === 'balanceOwed' && project.balanceOwed != null ? (
          <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">{fmtCurrency(project.balanceOwed)}</span>
        ) : financialMode === 'profit' && project.profit != null ? (
          <span className={cn('text-xs font-semibold', project.profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500')}>{fmtCurrency(project.profit)}</span>
        ) : (
          dateStr && <span className="event-card-row__date-text">{dateStr}</span>
        )}
        <span className={cn('event-card-row__status', STATUS_COLORS[project.status])}>{project.status}</span>
      </div>
    </div>
  );

  if (!isSwipeable) {
    return (
      <div onClick={() => { onBeforeNavigate?.(); navigate(`/projects/${project.id}`, { state: { backTo } }); }}>
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
        {isArchived ? <Trash2 className="w-5 h-5 text-[#C8C6C2]" /> : <Archive className="w-5 h-5 text-[#C8C6C2]" />}
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
          if (Math.abs(x.get()) < 5) { onBeforeNavigate?.(); navigate(`/projects/${project.id}`, { state: { backTo } }); }
        }}
      >
        {cardContent}
      </motion.div>
    </div>
  );
});
ProjectRow.displayName = 'ProjectRow';

// AnniversaryBanner imported from @/components/AnniversaryBanner

// ─── ProjectsManager ─────────────────────────────────────────────────────────

const ProjectsManager = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const archiveProject = useArchiveProject();
  const restoreProject = useRestoreProject();
  const deleteProject = useDeleteProjectPermanently();
  const { isPrivileged, can, teamRole } = useAppData();
  const isCrew = teamRole === 'crew';
  const { user } = useAuth();

  const { types: projectTypes, getTypeColor } = useProjectTypes();

  const today = new Date().toISOString().slice(0, 10);
  const [dismissedAnniversary, setDismissedAnniversary] = useState(() => {
    try { return JSON.parse(localStorage.getItem('dismissed-anniversaries') || '{}'); } catch { return {}; }
  });
  const { data: anniversaryRaw } = useQuery({
    queryKey: ['projects', 'upcoming-anniversary'],
    queryFn: () => api.get('/projects/upcoming-anniversary'),
    staleTime: 10 * 60 * 1000,
    select: (res) => res.data,
  });
  const anniversary = anniversaryRaw && dismissedAnniversary[`${anniversaryRaw.projectId}-${anniversaryRaw.yearsAgo}`] !== today ? anniversaryRaw : null;
  const dismissAnniversary = useCallback(() => {
    if (!anniversaryRaw) return;
    const key = `${anniversaryRaw.projectId}-${anniversaryRaw.yearsAgo}`;
    const updated = { ...dismissedAnniversary, [key]: today };
    setDismissedAnniversary(updated);
    try { localStorage.setItem('dismissed-anniversaries', JSON.stringify(updated)); } catch {}
  }, [anniversaryRaw, dismissedAnniversary]);

  const { data: teamMembers } = useQuery({
    queryKey: ['team-members-list'],
    queryFn: () => api.get('/team'),
    staleTime: 5 * 60 * 1000,
    select: (res) => (res.data || res).map(m => ({ id: m.id, name: m.name || [m.firstName, m.lastName].filter(Boolean).join(' ') })),
  });

  const [searchTerm, setSearchTerm] = useState('');
  const statusFilter = searchParams.get('status') || '';
  const assignedToFilter = searchParams.get('assignedTo') || (isCrew ? 'mine' : '');
  const yearFilter = searchParams.get('year') || '';
  const typeFilter = searchParams.get('typeId') || '';
  const financialFilter = searchParams.get('financial') || ''; // 'balanceOwed' | 'profit' | ''
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const [contextMenu, setContextMenu] = useState(null);

  const debouncedSearch = useDebounce(searchTerm, 300);

  const tabScrollRef = useRef(null);
  const contextMenuRef = useRef(null);
  const sentinelRef = useRef(null);

  // Save scroll position before navigating to a project detail
  const saveScroll = useCallback(() => {
    const main = document.querySelector('main');
    if (main) sessionStorage.setItem('scroll:/projects', String(main.scrollTop));
  }, []);

  // When a financial sort is active, override the normal sort
  const effectiveOrderBy = financialFilter || DEFAULT_SORT.orderBy;
  const effectiveAsc = financialFilter ? false : DEFAULT_SORT.asc;

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: queryKeys.projects.list({ search: debouncedSearch, status: statusFilter, assignedTo: assignedToFilter, year: yearFilter, typeId: typeFilter, orderBy: effectiveOrderBy, asc: effectiveAsc }),
    queryFn: async ({ pageParam = 0 }) => {
      return api.get('/projects', {
        search: debouncedSearch || undefined,
        status: statusFilter || undefined,
        ...(assignedToFilter === 'mine' ? { mine: 'true' } : assignedToFilter ? { assignedTo: assignedToFilter } : {}),
        year: yearFilter || undefined,
        typeId: typeFilter || undefined,
        page: pageParam,
        pageSize: PAGE_SIZE,
        orderBy: effectiveOrderBy,
        asc: effectiveAsc,
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
          {can('manage_projects') && (
            <button
              onClick={() => navigate('/projects/new')}
              className="action-btn"
            >
              <Plus className="action-btn__icon" />
              New Project
            </button>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="relative">
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

      {/* Filter bar */}
      <div className="project-filter-bar">
        {/* Status tabs */}
        <div
          ref={tabScrollRef}
          className="project-filter-bar__status"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {STATUS_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={(e) => {
                setSearchParams(prev => {
                  const next = new URLSearchParams(prev);
                  if (f.value) next.set('status', f.value); else next.delete('status');
                  return next;
                });
                e.currentTarget.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
              }}
              className={cn(
                "project-filter-bar__status-btn",
                statusFilter === f.value && 'project-filter-bar__status-btn--active'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Dropdowns row — year, type, assigned to */}
        <div className="project-filter-bar__filters">
          {/* Year */}
          <div className="project-filter-bar__select-wrap">
            <select
              value={yearFilter}
              onChange={e => setSearchParams(prev => {
                const next = new URLSearchParams(prev);
                if (e.target.value) next.set('year', e.target.value); else next.delete('year');
                return next;
              })}
              className={cn(
                "project-filter-bar__select",
                yearFilter && 'project-filter-bar__select--active'
              )}
            >
              <option value="">All Years</option>
              {YEAR_OPTIONS.filter(y => y.value).map(y => (
                <option key={y.value} value={y.value}>{y.label}</option>
              ))}
            </select>
            <ChevronDown className="project-filter-bar__select-icon" />
          </div>

          {/* Event type */}
          <div className="project-filter-bar__select-wrap">
            <select
              value={typeFilter}
              onChange={e => setSearchParams(prev => {
                const next = new URLSearchParams(prev);
                if (e.target.value) next.set('typeId', e.target.value); else next.delete('typeId');
                return next;
              })}
              className={cn(
                "project-filter-bar__select",
                typeFilter && 'project-filter-bar__select--active'
              )}
            >
              <option value="">Event Type</option>
              {projectTypes.map(t => (
                <option key={t.id || t.value} value={t.id || t.value}>{t.label}</option>
              ))}
            </select>
            <ChevronDown className="project-filter-bar__select-icon" />
          </div>

          {/* Assigned to */}
          {!isCrew && teamMembers && teamMembers.length > 0 && (
            <div className="project-filter-bar__select-wrap">
              <select
                value={assignedToFilter}
                onChange={e => setSearchParams(prev => {
                  const next = new URLSearchParams(prev);
                  if (e.target.value) {
                    next.set('assignedTo', e.target.value);
                    next.delete('mine');
                  } else {
                    next.delete('assignedTo');
                    next.delete('mine');
                  }
                  return next;
                })}
                className={cn(
                  "project-filter-bar__select",
                  assignedToFilter && 'project-filter-bar__select--active'
                )}
              >
                <option value="">Any Member</option>
                <option value="mine">Me</option>
                {teamMembers.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
              <ChevronDown className="project-filter-bar__select-icon" />
            </div>
          )}

          <div className="project-filter-bar__divider hidden sm:block" />

          {/* Financial toggles */}
          <button
            onClick={() => setSearchParams(prev => {
              const next = new URLSearchParams(prev);
              if (financialFilter === 'balanceOwed') next.delete('financial'); else next.set('financial', 'balanceOwed');
              return next;
            })}
            className={cn(
              "project-filter-bar__chip",
              financialFilter === 'balanceOwed' && 'project-filter-bar__chip--balance'
            )}
          >
            <DollarSign className="w-3.5 h-3.5" />
            <span>Balance</span>
          </button>

          <button
            onClick={() => setSearchParams(prev => {
              const next = new URLSearchParams(prev);
              if (financialFilter === 'profit') next.delete('financial'); else next.set('financial', 'profit');
              return next;
            })}
            className={cn(
              "project-filter-bar__chip",
              financialFilter === 'profit' && 'project-filter-bar__chip--profit'
            )}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Profit</span>
          </button>
        </div>

        {/* Active filters summary — shows what's active with dismiss */}
        <AnimatePresence>
          {(yearFilter || typeFilter || assignedToFilter || financialFilter) && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="project-filter-bar__active"
            >
              <span className="project-filter-bar__active-label">Filters:</span>
              {yearFilter && (
                <motion.span layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="project-filter-bar__active-chip project-filter-bar__active-chip--year">
                  <Calendar className="w-3 h-3" />
                  {yearFilter}
                  <button onClick={() => setSearchParams(prev => { const n = new URLSearchParams(prev); n.delete('year'); return n; })} className="project-filter-bar__active-x"><X className="w-2.5 h-2.5" /></button>
                </motion.span>
              )}
              {typeFilter && (
                <motion.span layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="project-filter-bar__active-chip project-filter-bar__active-chip--type">
                  <Tag className="w-3 h-3" />
                  {projectTypes.find(t => (t.id || t.value) === typeFilter)?.label || typeFilter}
                  <button onClick={() => setSearchParams(prev => { const n = new URLSearchParams(prev); n.delete('typeId'); return n; })} className="project-filter-bar__active-x"><X className="w-2.5 h-2.5" /></button>
                </motion.span>
              )}
              {assignedToFilter && (
                <motion.span layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="project-filter-bar__active-chip project-filter-bar__active-chip--member">
                  <Users className="w-3 h-3" />
                  {assignedToFilter === 'mine' ? 'Me' : teamMembers?.find(m => m.id === assignedToFilter)?.name || 'Member'}
                  <button onClick={() => setSearchParams(prev => { const n = new URLSearchParams(prev); n.delete('assignedTo'); n.delete('mine'); return n; })} className="project-filter-bar__active-x"><X className="w-2.5 h-2.5" /></button>
                </motion.span>
              )}
              {financialFilter && (
                <motion.span layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className={cn('project-filter-bar__active-chip', financialFilter === 'balanceOwed' ? 'project-filter-bar__active-chip--balance' : 'project-filter-bar__active-chip--profit')}>
                  {financialFilter === 'balanceOwed' ? <DollarSign className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
                  {financialFilter === 'balanceOwed' ? 'Balance Owed' : 'Most Profitable'}
                  <button onClick={() => setSearchParams(prev => { const n = new URLSearchParams(prev); n.delete('financial'); return n; })} className="project-filter-bar__active-x"><X className="w-2.5 h-2.5" /></button>
                </motion.span>
              )}
              <button
                onClick={() => setSearchParams(prev => {
                  const next = new URLSearchParams(prev);
                  next.delete('year'); next.delete('typeId'); next.delete('financial'); next.delete('assignedTo'); next.delete('mine');
                  return next;
                })}
                className="project-filter-bar__clear"
              >
                <X className="w-3 h-3" />
                <span>Clear all</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Anniversary Banner */}
      {anniversary && (
        <AnniversaryBanner anniversary={anniversary} navigate={navigate} saveScroll={saveScroll} onDismiss={dismissAnniversary} />
      )}

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
              <ProjectRow key={p.id} project={p} onEdit={handleEdit} onArchive={handleArchive} onRestore={handleRestore} onDelete={handleDelete} onContextMenu={handleContextMenu} canEdit={can('manage_projects')} canDelete={can('delete_projects')} getTypeColor={getTypeColor} backTo={`/projects${location.search}`} financialMode={financialFilter} onBeforeNavigate={saveScroll} />
            ))}
          </div>
          {/* Fade-out gradient — sticks to bottom of scroll viewport */}
          {(hasNextPage || projects.length > 6) && (
            <div className="sticky bottom-0 h-16 -mt-16 pointer-events-none z-10" style={{ background: 'linear-gradient(to bottom, transparent, rgb(var(--surface-50)))' }} />
          )}
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
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700 text-[#C8C6C2]">Delete</AlertDialogAction>
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
