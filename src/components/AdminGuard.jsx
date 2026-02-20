import { Navigate, Outlet } from 'react-router-dom';
import { useAppData } from '@/hooks/useAppData';
import { Loader2 } from 'lucide-react';

const AdminGuard = () => {
  const { isAdmin, can, isDataLoading, hasLoadedInitialData } = useAppData();

  if (isDataLoading && !hasLoadedInitialData) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Allow access if user has any system-level permission
  const hasSystemAccess = isAdmin || can('access_settings') || can('manage_permissions') || can('view_activity_log');
  if (!hasSystemAccess) return <Navigate to="/dashboard" replace />;

  return <Outlet />;
};

export default AdminGuard;
