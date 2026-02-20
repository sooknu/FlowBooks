import { useEffect, useRef } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { useAppData, usePublicSettings } from '@/hooks/useAppData';
import { queryClient } from '@/lib/queryClient';
import Sidebar from '@/components/Sidebar';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';

const AppLayout = () => {
  const { user, signOut, isImpersonating } = useAuth();
  const { appData, userProfile, isAdmin, isPrivileged, teamRole, advancesEnabled, salaryEnabled, can, hasLoadedInitialData } = useAppData();
  const { data: publicSettings } = usePublicSettings();
  const location = useLocation();
  const navigate = useNavigate();

  const effectiveSettings = hasLoadedInitialData ? appData.settings : (publicSettings || {});

  // Real-time cross-user data sync via SSE
  useRealtimeSync();

  // Reset cache on user identity change
  const userId = user?.id;
  useEffect(() => {
    // On unmount/remount with different user, clear cache
    return () => {
      const currentId = user?.id;
      if (currentId && currentId !== userId) {
        queryClient.clear();
      }
    };
  }, [userId]);

  // Legacy hash redirect
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash) return;

    const pathMap = {
      dashboard: '/dashboard', quotes: '/quotes', invoices: '/invoices',
      clients: '/clients', settings: '/settings', profile: '/profile',
    };

    if (hash.startsWith('#view=')) {
      const view = new URLSearchParams(hash.slice(1)).get('view');
      if (view && pathMap[view]) {
        navigate(pathMap[view], { replace: true });
      }
    } else if (hash.startsWith('#approve=')) {
      const token = hash.match(/[a-f0-9]{32}/)?.[0];
      if (token) navigate('/approve/' + token, { replace: true });
    } else if (hash.startsWith('#pay=')) {
      const token = hash.match(/[a-f0-9]{32}/)?.[0];
      if (token) navigate('/pay/' + token, { replace: true });
    }
  }, [navigate]);

  // Scroll main content to top on route change
  const mainRef = useRef(null);
  useEffect(() => {
    mainRef.current?.scrollTo(0, 0);
  }, [location.pathname]);

  const appName = effectiveSettings?.app_name || 'QuoteFlow';
  const faviconUrl = effectiveSettings?.favicon_url;
  const headerLogoUrl = effectiveSettings?.header_logo_url;
  const headerLogoDarkUrl = effectiveSettings?.header_logo_dark_url;
  const headerLogoSize = effectiveSettings?.header_logo_size || '28';

  return (
    <>
      <Helmet>
        <title>{appName}</title>
        {faviconUrl && <link rel="icon" href={faviconUrl} />}
      </Helmet>

      <div className="flex overflow-hidden bg-surface-50 app-shell">
        <Sidebar
          isAdmin={isAdmin}
          isPrivileged={isPrivileged}
          teamRole={teamRole}
          advancesEnabled={advancesEnabled}
          salaryEnabled={salaryEnabled}
          can={can}
          appName={appName}
          headerLogoUrl={headerLogoUrl}
          headerLogoDarkUrl={headerLogoDarkUrl}
          headerLogoSize={headerLogoSize}
          faviconUrl={faviconUrl}
          userProfile={userProfile}
          user={user}
          onSignOut={signOut}
        />

        <main ref={mainRef} className="flex-1 overflow-y-auto">
          <div className={`app-container lg:pt-10 ${isImpersonating ? 'pt-[93px]' : 'pt-[61px]'}`}>
            <motion.div
              key={location.pathname.startsWith('/settings') ? '/settings' : location.pathname}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.1, ease: 'easeOut' }}
            >
              <Outlet />
            </motion.div>
          </div>
        </main>
      </div>
    </>
  );
};

export default AppLayout;
