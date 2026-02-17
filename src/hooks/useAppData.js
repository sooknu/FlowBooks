import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/apiClient';
import { queryKeys } from '@/lib/queryKeys';
import { useAuth } from '@/contexts/AuthContext';

export function useProfile() {
  const { user } = useAuth();
  return useQuery({
    queryKey: queryKeys.profile.me(),
    queryFn: () => api.get('/users/me/profile').then(r => r.data),
    enabled: !!user,
  });
}

export function useSettings() {
  const { user } = useAuth();
  return useQuery({
    queryKey: queryKeys.settings.full(),
    queryFn: () => api.get('/settings').then(r => r.data || {}),
    enabled: !!user,
  });
}

export function usePublicSettings() {
  return useQuery({
    queryKey: queryKeys.settings.public(),
    queryFn: () => api.get('/settings/public').then(r => r.data || {}),
    staleTime: 5 * 60_000,
  });
}

export function useClientsCatalog() {
  const { user } = useAuth();
  return useQuery({
    queryKey: queryKeys.clients.catalog(),
    queryFn: () => api.get('/clients', {
      orderBy: 'lastName', asc: 'true', pageSize: '10000',
    }).then(r => r.data || []),
    enabled: !!user,
    staleTime: 5 * 60_000,
  });
}

export function useProductsCatalog() {
  const { user } = useAuth();
  return useQuery({
    queryKey: queryKeys.products.catalog(),
    queryFn: () => api.get('/products', {
      orderBy: 'name', asc: 'true', pageSize: '10000',
    }).then(r => r.data || []),
    enabled: !!user,
    staleTime: 5 * 60_000,
  });
}

export function useApprovalStatus() {
  const { user } = useAuth();
  return useQuery({
    queryKey: queryKeys.profile.approvalStatus(),
    queryFn: async () => {
      try {
        const res = await api.get('/users/me/approval-status');
        return res.approved === true;
      } catch {
        // If endpoint fails, assume approved to avoid blocking existing users
        return true;
      }
    },
    enabled: !!user,
    staleTime: 60_000,
  });
}

export function useAppData() {
  const profileQuery = useProfile();
  const settingsQuery = useSettings();

  const appData = {
    settings: settingsQuery.data || {},
  };

  const userProfile = profileQuery.data || null;
  const isAdmin = userProfile?.role === 'admin';
  const teamRole = userProfile?.teamRole || null;
  const teamMemberId = userProfile?.teamMemberId || null;
  const advancesEnabled = userProfile?.advancesEnabled || false;
  const salaryEnabled = userProfile?.salaryEnabled || false;

  // Granular permissions from server
  const permissions = userProfile?.permissions || {};

  // Permission check helper
  const can = useCallback((key) => permissions[key] === true, [permissions]);

  // Privileged = full nav (filtered by permissions). Crew = limited nav.
  const PRIVILEGED_ROLES = ['owner', 'manager', 'lead'];
  const isPrivileged = isAdmin || PRIVILEGED_ROLES.includes(teamRole);
  const canSeePrices = can('view_prices');

  const isDataLoading = profileQuery.isLoading || settingsQuery.isLoading;

  const hasLoadedInitialData = profileQuery.isSuccess && settingsQuery.isSuccess;

  return {
    appData,
    userProfile,
    isAdmin,
    teamRole,
    teamMemberId,
    isPrivileged,
    canSeePrices,
    can,
    permissions,
    advancesEnabled,
    salaryEnabled,
    isDataLoading,
    hasLoadedInitialData,
  };
}
