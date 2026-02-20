import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useEffect, useCallback } from 'react';
import api from '@/lib/apiClient';

export function useNotifications() {
  const qc = useQueryClient();
  const prevUnreadRef = useRef(null);

  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get('/notifications'),
  });

  const unreadCount = notifications.filter(n => !n.isRead).length;

  // Browser notifications for new items
  useEffect(() => {
    if (prevUnreadRef.current === null) {
      prevUnreadRef.current = unreadCount;
      return;
    }
    if (unreadCount > prevUnreadRef.current && 'Notification' in window && Notification.permission === 'granted') {
      const newest = notifications.find(n => !n.isRead);
      if (newest) {
        new Notification(newest.title, { body: newest.message });
      }
    }
    prevUnreadRef.current = unreadCount;
  }, [unreadCount, notifications]);

  // Request permission on mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const markRead = useMutation({
    mutationFn: (id) => api.post(`/notifications/read/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markAllRead = useMutation({
    mutationFn: () => api.post('/notifications/read-all'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const clearAll = useMutation({
    mutationFn: () => api.delete('/notifications'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  return { notifications, unreadCount, markRead, markAllRead, clearAll };
}
