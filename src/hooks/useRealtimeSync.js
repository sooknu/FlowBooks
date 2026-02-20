import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';

// Entity type → array of query key prefixes to invalidate
const INVALIDATION_MAP = {
  project:            [['projects'], ['stats'], ['calendar']],
  client:             [['clients'], ['stats']],
  quote:              [['quotes'], ['stats']],
  invoice:            [['invoices'], ['stats']],
  payment:            [['invoices'], ['stats']],
  product:            [['products']],
  expense:            [['expenses'], ['stats']],
  expense_category:   [['expense-categories']],
  vendor:             [['vendors']],
  recurring_expense:  [['recurring-expenses']],
  credit:             [['credits'], ['stats']],
  team_member:        [['team']],
  team_payment:       [['team-payments'], ['expenses'], ['stats'], ['projects']],
  team_advance:       [['team-advances']],
  team_salary:        [['team-salary']],
  project_assignment: [['assignments'], ['projects']],
  project_note:       [['projects']],
  settings:           [['settings']],
  notification:       [['notifications']],
};

export function useRealtimeSync() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const esRef = useRef(null);
  const reconnectRef = useRef(null);
  const delayRef = useRef(1000);
  const pendingRef = useRef(new Set());
  const debounceRef = useRef(null);

  const flush = useCallback(() => {
    const keys = [...pendingRef.current];
    pendingRef.current.clear();
    for (const k of keys) {
      queryClient.invalidateQueries({ queryKey: JSON.parse(k) });
    }
  }, [queryClient]);

  const scheduleInvalidation = useCallback((prefixes) => {
    for (const p of prefixes) {
      pendingRef.current.add(JSON.stringify(p));
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(flush, 500);
  }, [flush]);

  const connect = useCallback(() => {
    if (!user) return;

    const es = new EventSource('/api/sse');
    esRef.current = es;

    es.onopen = () => { delayRef.current = 1000; };

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'connected') return;
        if (data.actorUserId === user.id) return;
        const keys = INVALIDATION_MAP[data.entity];
        if (keys) scheduleInvalidation(keys);
      } catch { /* ignore parse errors / heartbeats */ }
    };

    es.onerror = () => {
      es.close();
      esRef.current = null;
      const d = delayRef.current;
      delayRef.current = Math.min(d * 2, 30000);
      reconnectRef.current = setTimeout(connect, d);
    };
  }, [user, scheduleInvalidation]);

  useEffect(() => {
    connect();
    return () => {
      if (esRef.current) { esRef.current.close(); esRef.current = null; }
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [connect]);
}
