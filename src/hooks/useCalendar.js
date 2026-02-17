import { useQuery } from '@tanstack/react-query';
import api from '@/lib/apiClient';
import { queryKeys } from '@/lib/queryKeys';

export function useCalendarProjects(start, end, teamMemberId) {
  return useQuery({
    queryKey: queryKeys.calendar.range(start, end, teamMemberId),
    queryFn: () =>
      api.get('/calendar', {
        start,
        end,
        ...(teamMemberId ? { teamMemberId } : {}),
      }).then(r => r.data || []),
    enabled: !!start && !!end,
    staleTime: 2 * 60_000,
  });
}
