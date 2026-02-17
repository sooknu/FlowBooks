import React, { Suspense } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useApprovalStatus, usePublicSettings } from '@/hooks/useAppData';
import { queryClient } from '@/lib/queryClient';
import { queryKeys } from '@/lib/queryKeys';
import { Loader2 } from 'lucide-react';

const LoginPage = React.lazy(() => import('@/components/LoginPage'));
const PendingApprovalPage = React.lazy(() => import('@/components/PendingApprovalPage'));

const Spinner = () => (
  <div className="min-h-screen flex items-center justify-center bg-surface-50">
    <Loader2 className="w-10 h-10 text-primary animate-spin" />
  </div>
);

const AuthGuard = () => {
  const { user, session, loading, signOut } = useAuth();
  const { data: isApproved, isLoading: isCheckingApproval } = useApprovalStatus();
  const { data: publicSettings } = usePublicSettings();

  if (loading) return <Spinner />;

  if (!session) {
    // Fresh install: setup_complete explicitly set to 'false' → redirect to setup wizard
    if (publicSettings && publicSettings.setup_complete === 'false') {
      return <Navigate to="/setup" replace />;
    }
    return (
      <Suspense fallback={<Spinner />}>
        <LoginPage appSettings={publicSettings || {}} />
      </Suspense>
    );
  }

  if (isCheckingApproval) return <Spinner />;

  if (isApproved === false) {
    return (
      <Suspense fallback={<Spinner />}>
        <PendingApprovalPage
          appSettings={publicSettings || {}}
          onSignOut={signOut}
          onApproved={() => queryClient.setQueryData(queryKeys.profile.approvalStatus(), true)}
        />
      </Suspense>
    );
  }

  return <Outlet />;
};

export default AuthGuard;
