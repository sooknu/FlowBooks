import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/apiClient';
import { queryKeys } from '@/lib/queryKeys';
import { useAuth } from '@/contexts/AuthContext';

/** Default project roles (used when API hasn't loaded yet or table is empty) */
export const DEFAULT_PROJECT_ROLES = [
  { label: 'Lead Photo' },
  { label: 'Lead Video' },
  { label: '2nd Shooter' },
  { label: 'Video Editor' },
  { label: 'Crew' },
];

/**
 * Hook that fetches project roles from /api/project-roles.
 * Returns { roles, roleMap }
 */
export function useProjectRoles() {
  const { user } = useAuth();

  const { data: roles = DEFAULT_PROJECT_ROLES } = useQuery({
    queryKey: queryKeys.projectRoles.list(),
    queryFn: () => api.get('/project-roles').then(r => {
      const data = r.data || [];
      return data.length > 0 ? data : DEFAULT_PROJECT_ROLES;
    }),
    enabled: !!user,
    staleTime: 5 * 60_000,
  });

  const roleMap = useMemo(() => {
    const m = {};
    for (const r of roles) {
      m[r.label] = r;
    }
    return m;
  }, [roles]);

  return { roles, roleMap };
}
