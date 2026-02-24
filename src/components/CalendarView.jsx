import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  CalendarDays, ChevronLeft, ChevronRight, MapPin, Clock,
  Users as UsersIcon, Eye, Loader2, Plus,
} from 'lucide-react';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, addMonths, addWeeks, addDays,
  format, isSameMonth, isSameDay, isToday,
  startOfDay, endOfDay,
} from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useCalendarProjects } from '@/hooks/useCalendar';
import { useAppData } from '@/hooks/useAppData';
import { useProjectTypes } from '@/lib/projectTypes';
import { queryKeys } from '@/lib/queryKeys';
import api from '@/lib/apiClient';
const STATUS_LABELS = {
  lead: 'Lead', booked: 'Booked', shooting: 'Shooting',
  editing: 'Editing', delivered: 'Delivered', completed: 'Completed',
};

const STATUS_TEXT = {
  lead: 'text-surface-500', booked: 'text-blue-400', shooting: 'text-rose-400',
  editing: 'text-amber-400', delivered: 'text-emerald-400', completed: 'text-emerald-400',
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAYS_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function formatTime12(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

function getClientDisplay(p) {
  return p.clientName || p.clientCompany || [p.clientFirstName, p.clientLastName].filter(Boolean).join(' ') || '';
}

/* ─── Group projects by date ─── */

function groupByDate(projects) {
  const map = {};
  for (const p of projects) {
    if (p.sessions?.length > 0) {
      for (const s of p.sessions) {
        if (!s.sessionDate) continue;
        const key = format(startOfDay(new Date(s.sessionDate)), 'yyyy-MM-dd');
        if (!map[key]) map[key] = [];
        map[key].push({ ...p, _session: s });
      }
    } else {
      if (!p.shootStartDate) continue;
      const start = startOfDay(new Date(p.shootStartDate));
      const end = p.shootEndDate ? startOfDay(new Date(p.shootEndDate)) : start;
      let d = start;
      while (d <= end) {
        const key = format(d, 'yyyy-MM-dd');
        if (!map[key]) map[key] = [];
        map[key].push(p);
        d = addDays(d, 1);
      }
    }
  }
  return map;
}

/* ─── CalendarHeader ─── */

const CalendarHeader = ({ currentDate, view, onViewChange, onNavigate, teamMembers, teamMemberFilter, onTeamMemberChange, isPrivileged }) => (
  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-5">
    {/* Left: icon + title */}
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 bg-surface-100 rounded-xl flex items-center justify-center">
        <CalendarDays className="w-[18px] h-[18px] text-surface-400" />
      </div>
      <h1 className="text-xl font-bold text-surface-800 tracking-tight">
        {view === 'day'
          ? format(currentDate, 'EEEE, MMMM d, yyyy')
          : view === 'week'
            ? `${format(startOfWeek(currentDate, { weekStartsOn: 0 }), 'MMM d')} – ${format(endOfWeek(currentDate, { weekStartsOn: 0 }), 'MMM d, yyyy')}`
            : format(currentDate, 'MMMM yyyy')
        }
      </h1>
    </div>

    {/* Right: controls */}
    <div className="flex items-center gap-2 flex-wrap">
      {/* Team member filter */}
      {isPrivileged && teamMembers && teamMembers.length > 0 && (
        <select
          value={teamMemberFilter}
          onChange={(e) => onTeamMemberChange(e.target.value)}
          className="glass-input text-xs h-8 pl-2 pr-7 rounded-lg min-w-[140px]"
        >
          <option value="">All Members</option>
          {teamMembers.filter(m => m.isActive).map(m => (
            <option key={m.id} value={m.id}>
              {m.displayName || m.firstName || m.userName || m.userEmail}
            </option>
          ))}
        </select>
      )}

      {/* View toggle */}
      <div className="flex rounded-lg border border-surface-200 overflow-hidden">
        {['month', 'week', 'day'].map(v => (
          <button
            key={v}
            onClick={() => onViewChange(v)}
            className={cn(
              'px-3 py-1.5 text-xs font-medium capitalize transition-colors',
              view === v
                ? 'bg-surface-800 text-[#C8C6C2] dark:text-surface-100'
                : 'text-surface-500 hover:bg-surface-100',
            )}
          >
            {v}
          </button>
        ))}
      </div>

      {/* Navigation */}
      <button onClick={() => onNavigate('today')} className="action-btn action-btn--secondary text-xs px-3 h-8">
        Today
      </button>
      <div className="flex rounded-lg border border-surface-200 overflow-hidden">
        <button onClick={() => onNavigate('prev')} className="p-1.5 hover:bg-surface-100 transition-colors">
          <ChevronLeft className="w-4 h-4 text-surface-500" />
        </button>
        <button onClick={() => onNavigate('next')} className="p-1.5 hover:bg-surface-100 transition-colors">
          <ChevronRight className="w-4 h-4 text-surface-500" />
        </button>
      </div>
    </div>
  </div>
);

/* ─── MonthView ─── */

const MonthView = ({ currentDate, projects, onDayClick, getTypeColor }) => {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  const projectsByDate = useMemo(() => groupByDate(projects), [projects]);

  return (
    <div className="glass-card overflow-hidden">
      {/* Weekday header */}
      <div className="grid grid-cols-7 border-b border-surface-200">
        {WEEKDAYS.map((d, i) => (
          <div key={d} className="py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-surface-400">
            <span className="hidden sm:inline">{d}</span>
            <span className="sm:hidden">{WEEKDAYS_SHORT[i]}</span>
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7">
        {days.map(day => {
          const key = format(day, 'yyyy-MM-dd');
          const dayProjects = projectsByDate[key] || [];
          const inMonth = isSameMonth(day, currentDate);
          const today = isToday(day);

          return (
            <button
              key={key}
              onClick={() => onDayClick(day)}
              className={cn(
                'min-h-[48px] sm:min-h-[100px] p-1 sm:p-1.5 border-b border-r border-surface-100 text-left transition-colors hover:bg-surface-50 relative',
                !inMonth && 'bg-surface-50/50',
              )}
            >
              {/* Date number */}
              <div className={cn(
                'text-[11px] sm:text-[12px] font-medium w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded-full mb-0.5',
                today && 'bg-surface-800 text-[#C8C6C2] dark:text-surface-100',
                !today && inMonth && 'text-surface-700',
                !today && !inMonth && 'text-surface-300',
              )}>
                {format(day, 'd')}
              </div>

              {/* Desktop: text chips */}
              <div className="hidden sm:block space-y-0.5">
                {dayProjects.slice(0, 3).map(p => {
                  const c = getTypeColor(p.projectTypeId || p.projectType);
                  return (
                    <div key={p.id} className={cn(
                      'text-[10px] font-medium px-1.5 py-0.5 rounded truncate border',
                      c.bg, c.text, c.border,
                    )}>
                      {p.title}
                    </div>
                  );
                })}
                {dayProjects.length > 3 && (
                  <div className="text-[10px] text-surface-400 font-medium px-1.5">
                    +{dayProjects.length - 3} more
                  </div>
                )}
              </div>

              {/* Mobile: colored dots */}
              {dayProjects.length > 0 && (
                <div className="sm:hidden flex items-center gap-0.5 justify-center mt-0.5">
                  {dayProjects.slice(0, 4).map(p => (
                    <span key={p.id} className={cn('w-1.5 h-1.5 rounded-full', getTypeColor(p.projectTypeId || p.projectType).dot)} />
                  ))}
                  {dayProjects.length > 4 && (
                    <span className="text-[8px] text-surface-400 font-medium">+{dayProjects.length - 4}</span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

/* ─── WeekView ─── */

const WeekView = ({ currentDate, projects, onProjectClick, getTypeColor }) => {
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const projectsByDate = useMemo(() => groupByDate(projects), [projects]);

  return (
    <div className="glass-card overflow-hidden">
      {/* Desktop: 7 columns */}
      <div className="hidden md:grid grid-cols-7 divide-x divide-surface-100">
        {days.map(day => {
          const key = format(day, 'yyyy-MM-dd');
          const dayProjects = projectsByDate[key] || [];
          const today = isToday(day);

          return (
            <div key={key} className="min-h-[300px]">
              {/* Day header */}
              <div className={cn(
                'px-2 py-2.5 border-b border-surface-100 text-center',
                today && 'bg-surface-50',
              )}>
                <div className="text-[10px] uppercase tracking-wider text-surface-400 font-medium">
                  {format(day, 'EEE')}
                </div>
                <div className={cn(
                  'text-sm font-semibold mt-0.5 w-7 h-7 mx-auto flex items-center justify-center rounded-full',
                  today ? 'bg-surface-800 text-[#C8C6C2] dark:text-surface-100' : 'text-surface-700',
                )}>
                  {format(day, 'd')}
                </div>
              </div>

              {/* Events */}
              <div className="p-1.5 space-y-1.5">
                {dayProjects.map(p => {
                  const c = getTypeColor(p.projectTypeId || p.projectType);
                  const client = getClientDisplay(p);
                  return (
                    <button
                      key={p.id}
                      onClick={() => onProjectClick(p.id)}
                      className={cn(
                        'w-full text-left rounded-lg border p-2 transition-all hover:shadow-sm',
                        c.bg, c.border,
                      )}
                    >
                      <div className={cn('text-[11px] font-semibold truncate', c.text)}>
                        {p.title}
                      </div>
                      {client && (
                        <div className="text-[10px] text-surface-500 truncate mt-0.5">{client}</div>
                      )}
                      {p.location && (
                        <div className="text-[10px] text-surface-400 truncate mt-0.5 flex items-center gap-0.5">
                          <MapPin className="w-2.5 h-2.5 flex-shrink-0" />
                          {p.location}
                        </div>
                      )}
                    </button>
                  );
                })}
                {dayProjects.length === 0 && (
                  <div className="text-[10px] text-surface-300 text-center py-4">No projects</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Mobile: stacked days */}
      <div className="md:hidden divide-y divide-surface-100">
        {days.map(day => {
          const key = format(day, 'yyyy-MM-dd');
          const dayProjects = projectsByDate[key] || [];
          const today = isToday(day);

          if (dayProjects.length === 0) return null;

          return (
            <div key={key} className="p-3">
              <div className="flex items-center gap-2 mb-2">
                <div className={cn(
                  'text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full',
                  today ? 'bg-surface-800 text-[#C8C6C2] dark:text-surface-100' : 'text-surface-600',
                )}>
                  {format(day, 'd')}
                </div>
                <span className="text-[11px] text-surface-400 font-medium uppercase">
                  {format(day, 'EEEE')}
                </span>
              </div>
              <div className="space-y-1.5 pl-1">
                {dayProjects.map(p => {
                  const c = getTypeColor(p.projectTypeId || p.projectType);
                  const client = getClientDisplay(p);
                  return (
                    <button
                      key={p.id}
                      onClick={() => onProjectClick(p.id)}
                      className={cn(
                        'w-full text-left rounded-lg border p-2.5 flex items-start gap-2',
                        c.bg, c.border,
                      )}
                    >
                      <div className={cn('w-1 h-full min-h-[28px] rounded-full flex-shrink-0', c.bar)} />
                      <div className="flex-1 min-w-0">
                        <div className={cn('text-xs font-semibold truncate', c.text)}>{p.title}</div>
                        {client && <div className="text-[10px] text-surface-500 truncate">{client}</div>}
                        {p.location && (
                          <div className="text-[10px] text-surface-400 truncate flex items-center gap-0.5 mt-0.5">
                            <MapPin className="w-2.5 h-2.5 flex-shrink-0" />
                            {p.location}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* ─── DayView ─── */

const DayView = ({ currentDate, projects, onProjectClick, getTypeColor }) => {
  const key = format(currentDate, 'yyyy-MM-dd');
  const projectsByDate = useMemo(() => groupByDate(projects), [projects]);
  const dayProjects = projectsByDate[key] || [];

  if (dayProjects.length === 0) {
    return (
      <div className="glass-card p-8 text-center">
        <CalendarDays className="w-8 h-8 text-surface-300 mx-auto mb-3" />
        <p className="text-sm font-medium text-surface-500">No projects scheduled</p>
        <p className="text-xs text-surface-400 mt-1">{format(currentDate, 'EEEE, MMMM d, yyyy')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {dayProjects.map(p => {
        const c = getTypeColor(p.projectTypeId || p.projectType);
        const client = getClientDisplay(p);
        const multi = p.shootEndDate && !isSameDay(new Date(p.shootStartDate), new Date(p.shootEndDate));

        return (
          <button
            key={p.id}
            onClick={() => onProjectClick(p.id)}
            className="glass-card w-full text-left flex items-stretch overflow-hidden hover:shadow-sm transition-shadow"
          >
            {/* Color bar */}
            <div className={cn('w-1.5 flex-shrink-0', c.bar)} />

            <div className="flex-1 p-4 flex items-center gap-4">
              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-sm font-semibold text-surface-800 truncate">
                    {p.title}
                    {p._session?.label && <span className="text-surface-400 font-normal"> — {p._session.label}</span>}
                  </h3>
                  {p.status && (
                    <span className={cn('text-[10px] font-medium capitalize', STATUS_TEXT[p.status])}>
                      {STATUS_LABELS[p.status]}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  {client && (
                    <span className="text-xs text-surface-500 flex items-center gap-1">
                      <UsersIcon className="w-3 h-3" />
                      {client}
                    </span>
                  )}
                  {p.location && (
                    <span className="text-xs text-surface-400 flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {p.location}
                    </span>
                  )}
                  {(p.projectTypeLabel || p.projectType) && (
                    <span className={cn(
                      'text-[10px] font-medium px-1.5 py-0.5 rounded border',
                      c.bg, c.text, c.border,
                    )}>
                      {p.projectTypeLabel || p.projectType?.replace('_', ' ')}
                    </span>
                  )}
                  {multi && (
                    <span className="text-[10px] text-surface-400">
                      {format(new Date(p.shootStartDate), 'MMM d')} – {format(new Date(p.shootEndDate), 'MMM d')}
                    </span>
                  )}
                  {!multi && (p._session?.startTime || p.shootStartTime) && (
                    <span className="text-xs text-surface-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatTime12(p._session?.startTime || p.shootStartTime)}{(p._session?.endTime || p.shootEndTime) ? ` – ${formatTime12(p._session?.endTime || p.shootEndTime)}` : ''}
                    </span>
                  )}
                </div>
              </div>

              {/* View icon */}
              <Eye className="w-4 h-4 text-surface-300 flex-shrink-0" />
            </div>
          </button>
        );
      })}
    </div>
  );
};

/* ─── DayDetailDialog ─── */

const DayDetailDialog = ({ date, projects, open, onClose, onProjectClick, onViewDay, onNewProject, getTypeColor }) => {
  if (!date) return null;

  const key = format(date, 'yyyy-MM-dd');
  const projectsByDate = groupByDate(projects);
  const dayProjects = projectsByDate[key] || [];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="glass-elevated sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="w-4 h-4 text-accent" />
            {format(date, 'EEEE, MMMM d, yyyy')}
          </DialogTitle>
        </DialogHeader>

        {dayProjects.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-sm text-surface-400">No projects scheduled</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {dayProjects.map(p => {
              const c = getTypeColor(p.projectTypeId || p.projectType);
              const client = getClientDisplay(p);

              return (
                <button
                  key={p.id}
                  onClick={() => { onClose(); onProjectClick(p.id); }}
                  className={cn(
                    'w-full text-left rounded-lg border p-3 flex items-start gap-3 transition-colors hover:shadow-sm',
                    c.bg, c.border,
                  )}
                >
                  <div className={cn('w-1 min-h-[32px] rounded-full flex-shrink-0 mt-0.5', c.bar)} />
                  <div className="flex-1 min-w-0">
                    <div className={cn('text-sm font-semibold truncate', c.text)}>{p.title}</div>
                    {client && <div className="text-xs text-surface-500 truncate mt-0.5">{client}</div>}
                    <div className="flex items-center gap-3 mt-1">
                      {p.location && (
                        <span className="text-[10px] text-surface-400 flex items-center gap-0.5 truncate">
                          <MapPin className="w-2.5 h-2.5 flex-shrink-0" />
                          {p.location}
                        </span>
                      )}
                      {p.status && (
                        <span className={cn('text-[10px] font-medium capitalize', STATUS_TEXT[p.status])}>
                          {STATUS_LABELS[p.status]}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <div className="flex flex-col gap-2 mt-1">
          {dayProjects.length > 0 && (
            <button
              onClick={() => { onClose(); onViewDay(); }}
              className="action-btn action-btn--secondary w-full text-xs"
            >
              View in Day Mode
            </button>
          )}
          <button
            onClick={() => { onClose(); onNewProject(date); }}
            className="action-btn w-full text-xs"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" /> New Project
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

/* ─── Legend ─── */

const Legend = ({ types, getTypeColor }) => (
  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-4 px-1">
    {types.map(pt => {
      const c = getTypeColor(pt.id || pt.slug || pt.value);
      return (
        <div key={pt.id || pt.slug || pt.value} className="flex items-center gap-1.5">
          <span className={cn('w-2.5 h-2.5 rounded-full', c.dot)} />
          <span className="text-[11px] text-surface-500 font-medium">{pt.label}</span>
        </div>
      );
    })}
  </div>
);

/* ─── Main CalendarView ─── */

const CalendarView = () => {
  const navigate = useNavigate();
  const { teamRole, isPrivileged, can } = useAppData();
  const canFilterByTeam = can('filter_calendar_by_team');
  const { types: projectTypes, getTypeColor } = useProjectTypes();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState('month');
  const [selectedDate, setSelectedDate] = useState(null);
  const [teamMemberFilter, setTeamMemberFilter] = useState('');
  // Compute date range for the API query
  const { rangeStart, rangeEnd } = useMemo(() => {
    if (view === 'month') {
      const ms = startOfMonth(currentDate);
      const me = endOfMonth(currentDate);
      return {
        rangeStart: startOfWeek(ms, { weekStartsOn: 0 }).toISOString(),
        rangeEnd: endOfWeek(me, { weekStartsOn: 0 }).toISOString(),
      };
    }
    if (view === 'week') {
      return {
        rangeStart: startOfWeek(currentDate, { weekStartsOn: 0 }).toISOString(),
        rangeEnd: endOfWeek(currentDate, { weekStartsOn: 0 }).toISOString(),
      };
    }
    // day
    return {
      rangeStart: startOfDay(currentDate).toISOString(),
      rangeEnd: endOfDay(currentDate).toISOString(),
    };
  }, [currentDate, view]);

  const { data: projects = [], isLoading } = useCalendarProjects(rangeStart, rangeEnd, teamMemberFilter || undefined);

  // Team members for filter (privileged only)
  const { data: teamData } = useQuery({
    queryKey: queryKeys.team.list(),
    queryFn: () => api.get('/team').then(r => r.data || []),
    enabled: canFilterByTeam,
    staleTime: 5 * 60_000,
  });

  const handleNavigate = (action) => {
    if (action === 'today') {
      setCurrentDate(new Date());
      return;
    }
    const delta = action === 'prev' ? -1 : 1;
    setCurrentDate(prev => {
      if (view === 'month') return addMonths(prev, delta);
      if (view === 'week') return addWeeks(prev, delta);
      return addDays(prev, delta);
    });
  };

  const handleDayClick = (date) => {
    setSelectedDate(date);
  };

  const handleProjectClick = (id) => {
    const main = document.querySelector('main');
    if (main) sessionStorage.setItem('scroll:/calendar', String(main.scrollTop));
    navigate(`/projects/${id}`);
  };

  const handleViewDay = (date) => {
    setCurrentDate(date || selectedDate);
    setView('day');
  };

  const handleNewProject = (date) => {
    navigate(`/projects/new?shootDate=${format(date, 'yyyy-MM-dd')}`);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      <CalendarHeader
        currentDate={currentDate}
        view={view}
        onViewChange={setView}
        onNavigate={handleNavigate}
        teamMembers={teamData}
        teamMemberFilter={teamMemberFilter}
        onTeamMemberChange={setTeamMemberFilter}
        isPrivileged={canFilterByTeam}
      />

      {isLoading ? (
        <div className="glass-card flex flex-col items-center justify-center py-16 gap-3">
          <Loader2 className="w-7 h-7 animate-spin text-surface-400" />
          <p className="text-sm text-surface-400">Loading calendar...</p>
        </div>
      ) : (
        <>
          {view === 'month' && (
            <MonthView
              currentDate={currentDate}
              projects={projects}
              onDayClick={handleDayClick}
              getTypeColor={getTypeColor}
            />
          )}
          {view === 'week' && (
            <WeekView
              currentDate={currentDate}
              projects={projects}
              onProjectClick={handleProjectClick}
              getTypeColor={getTypeColor}
            />
          )}
          {view === 'day' && (
            <DayView
              currentDate={currentDate}
              projects={projects}
              onProjectClick={handleProjectClick}
              getTypeColor={getTypeColor}
            />
          )}
        </>
      )}

      <Legend types={projectTypes} getTypeColor={getTypeColor} />

      {/* Day detail dialog (from month view click) */}
      <DayDetailDialog
        date={selectedDate}
        projects={projects}
        open={!!selectedDate}
        onClose={() => setSelectedDate(null)}
        onProjectClick={handleProjectClick}
        onViewDay={() => handleViewDay(selectedDate)}
        onNewProject={handleNewProject}
        getTypeColor={getTypeColor}
      />

    </motion.div>
  );
};

export default CalendarView;
