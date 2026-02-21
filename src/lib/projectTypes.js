import { useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/apiClient';
import { queryKeys } from '@/lib/queryKeys';
import { useAuth } from '@/contexts/AuthContext';

/** Tailwind class sets for each color name (light + dark variants) */
export const COLOR_PALETTE = {
  pink:    { bg: 'bg-pink-50 dark:bg-pink-950/40',       text: 'text-pink-700 dark:text-pink-300',       dot: 'bg-pink-500 dark:bg-pink-400',    border: 'border-pink-200 dark:border-pink-800/50',       bar: 'bg-pink-500',    pill: 'bg-pink-700 dark:bg-pink-950/50 dark:text-pink-300' },
  blue:    { bg: 'bg-blue-50 dark:bg-blue-950/40',       text: 'text-blue-700 dark:text-blue-300',       dot: 'bg-blue-500 dark:bg-blue-400',    border: 'border-blue-200 dark:border-blue-800/50',       bar: 'bg-blue-500',    pill: 'bg-blue-700 dark:bg-blue-950/50 dark:text-blue-300' },
  emerald: { bg: 'bg-emerald-50 dark:bg-emerald-950/40', text: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500 dark:bg-emerald-400', border: 'border-emerald-200 dark:border-emerald-800/50', bar: 'bg-emerald-500', pill: 'bg-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' },
  violet:  { bg: 'bg-violet-50 dark:bg-violet-950/40',   text: 'text-violet-700 dark:text-violet-300',   dot: 'bg-violet-500 dark:bg-violet-400',  border: 'border-violet-200 dark:border-violet-800/50',   bar: 'bg-violet-500',  pill: 'bg-violet-700 dark:bg-violet-950/50 dark:text-violet-300' },
  amber:   { bg: 'bg-amber-50 dark:bg-amber-950/40',     text: 'text-amber-700 dark:text-amber-300',     dot: 'bg-amber-500 dark:bg-amber-400',   border: 'border-amber-200 dark:border-amber-800/50',     bar: 'bg-amber-500',   pill: 'bg-amber-700 dark:bg-amber-950/50 dark:text-amber-300' },
  rose:    { bg: 'bg-rose-50 dark:bg-rose-950/40',       text: 'text-rose-700 dark:text-rose-300',       dot: 'bg-rose-500 dark:bg-rose-400',    border: 'border-rose-200 dark:border-rose-800/50',       bar: 'bg-rose-500',    pill: 'bg-rose-700 dark:bg-rose-950/50 dark:text-rose-300' },
  sky:     { bg: 'bg-sky-50 dark:bg-sky-950/40',         text: 'text-sky-700 dark:text-sky-300',         dot: 'bg-sky-500 dark:bg-sky-400',      border: 'border-sky-200 dark:border-sky-800/50',         bar: 'bg-sky-500',     pill: 'bg-sky-700 dark:bg-sky-950/50 dark:text-sky-300' },
  teal:    { bg: 'bg-teal-50 dark:bg-teal-950/40',       text: 'text-teal-700 dark:text-teal-300',       dot: 'bg-teal-500 dark:bg-teal-400',    border: 'border-teal-200 dark:border-teal-800/50',       bar: 'bg-teal-500',    pill: 'bg-teal-700 dark:bg-teal-950/50 dark:text-teal-300' },
  orange:  { bg: 'bg-orange-50 dark:bg-orange-950/40',   text: 'text-orange-700 dark:text-orange-300',   dot: 'bg-orange-500 dark:bg-orange-400',  border: 'border-orange-200 dark:border-orange-800/50',   bar: 'bg-orange-500',  pill: 'bg-orange-700 dark:bg-orange-950/50 dark:text-orange-300' },
  slate:   { bg: 'bg-slate-50 dark:bg-slate-800/40',     text: 'text-slate-700 dark:text-slate-300',     dot: 'bg-slate-500 dark:bg-slate-400',   border: 'border-slate-200 dark:border-slate-700/50',     bar: 'bg-slate-500',   pill: 'bg-slate-700 dark:bg-slate-800/50 dark:text-slate-300' },
  indigo:  { bg: 'bg-indigo-50 dark:bg-indigo-950/40',   text: 'text-indigo-700 dark:text-indigo-300',   dot: 'bg-indigo-500 dark:bg-indigo-400', border: 'border-indigo-200 dark:border-indigo-800/50',   bar: 'bg-indigo-500',  pill: 'bg-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300' },
  cyan:    { bg: 'bg-cyan-50 dark:bg-cyan-950/40',       text: 'text-cyan-700 dark:text-cyan-300',       dot: 'bg-cyan-500 dark:bg-cyan-400',    border: 'border-cyan-200 dark:border-cyan-800/50',       bar: 'bg-cyan-500',    pill: 'bg-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-300' },
};

/** Human-friendly labels for colors (for the settings color picker) */
export const COLOR_LABELS = {
  pink: 'Pink', blue: 'Blue', emerald: 'Emerald', violet: 'Violet',
  amber: 'Amber', rose: 'Rose', sky: 'Sky', teal: 'Teal',
  orange: 'Orange', slate: 'Slate', indigo: 'Indigo', cyan: 'Cyan',
};

/** Default project types (used when API hasn't loaded yet or table is empty) */
export const DEFAULT_PROJECT_TYPES = [
  { value: 'wedding', label: 'Wedding', color: 'pink' },
  { value: 'commercial', label: 'Commercial', color: 'blue' },
  { value: 'real_estate', label: 'Real Estate', color: 'emerald' },
  { value: 'portrait', label: 'Portrait', color: 'violet' },
  { value: 'event', label: 'Event', color: 'amber' },
];

const FALLBACK_COLOR = COLOR_PALETTE.amber;

/**
 * Hook that fetches project types from /api/project-types and provides helpers.
 * Returns { types, typeMap, getTypeColor, getTypeById }
 */
export function useProjectTypes() {
  const { user } = useAuth();

  const { data: types = DEFAULT_PROJECT_TYPES } = useQuery({
    queryKey: queryKeys.projectTypes.list(),
    queryFn: () => api.get('/project-types').then(r => {
      const data = r.data || [];
      return data.length > 0 ? data : DEFAULT_PROJECT_TYPES;
    }),
    enabled: !!user,
    staleTime: 5 * 60_000,
  });

  const typeMap = useMemo(() => {
    const m = {};
    for (const t of types) {
      // Index by slug (for backward compat with old projectType text values)
      if (t.slug) m[t.slug] = t;
      if (t.value) m[t.value] = t;
      // Index by id (for new projectTypeId FK lookups)
      if (t.id) m[t.id] = t;
    }
    return m;
  }, [types]);

  const getTypeColor = useCallback((typeValue) => {
    if (!typeValue) return FALLBACK_COLOR;
    const entry = typeMap[typeValue];
    if (!entry) return FALLBACK_COLOR;
    return COLOR_PALETTE[entry.color] || FALLBACK_COLOR;
  }, [typeMap]);

  const getTypeById = useCallback((typeId) => {
    if (!typeId) return null;
    return typeMap[typeId] || null;
  }, [typeMap]);

  return { types, typeMap, getTypeColor, getTypeById };
}
