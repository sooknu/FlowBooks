import { useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/apiClient';
import { queryKeys } from '@/lib/queryKeys';
import { useAuth } from '@/contexts/AuthContext';

/** Tailwind class sets for each color name */
export const COLOR_PALETTE = {
  pink:    { bg: 'bg-pink-50',    text: 'text-pink-700',    dot: 'bg-pink-500',    border: 'border-pink-200',    bar: 'bg-pink-500',    pill: 'bg-pink-700' },
  blue:    { bg: 'bg-blue-50',    text: 'text-blue-700',    dot: 'bg-blue-500',    border: 'border-blue-200',    bar: 'bg-blue-500',    pill: 'bg-blue-700' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', border: 'border-emerald-200', bar: 'bg-emerald-500', pill: 'bg-emerald-700' },
  violet:  { bg: 'bg-violet-50',  text: 'text-violet-700',  dot: 'bg-violet-500',  border: 'border-violet-200',  bar: 'bg-violet-500',  pill: 'bg-violet-700' },
  amber:   { bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-500',   border: 'border-amber-200',   bar: 'bg-amber-500',   pill: 'bg-amber-700' },
  rose:    { bg: 'bg-rose-50',    text: 'text-rose-700',    dot: 'bg-rose-500',    border: 'border-rose-200',    bar: 'bg-rose-500',    pill: 'bg-rose-700' },
  sky:     { bg: 'bg-sky-50',     text: 'text-sky-700',     dot: 'bg-sky-500',     border: 'border-sky-200',     bar: 'bg-sky-500',     pill: 'bg-sky-700' },
  teal:    { bg: 'bg-teal-50',    text: 'text-teal-700',    dot: 'bg-teal-500',    border: 'border-teal-200',    bar: 'bg-teal-500',    pill: 'bg-teal-700' },
  orange:  { bg: 'bg-orange-50',  text: 'text-orange-700',  dot: 'bg-orange-500',  border: 'border-orange-200',  bar: 'bg-orange-500',  pill: 'bg-orange-700' },
  slate:   { bg: 'bg-slate-50',   text: 'text-slate-700',   dot: 'bg-slate-500',   border: 'border-slate-200',   bar: 'bg-slate-500',   pill: 'bg-slate-700' },
  indigo:  { bg: 'bg-indigo-50',  text: 'text-indigo-700',  dot: 'bg-indigo-500',  border: 'border-indigo-200',  bar: 'bg-indigo-500',  pill: 'bg-indigo-700' },
  cyan:    { bg: 'bg-cyan-50',    text: 'text-cyan-700',    dot: 'bg-cyan-500',    border: 'border-cyan-200',    bar: 'bg-cyan-500',    pill: 'bg-cyan-700' },
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
