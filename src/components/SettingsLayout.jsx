import React, { Suspense, useMemo } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Settings as SettingsIcon, CreditCard, Mail, Loader2, Layers, HardDrive } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppData } from '@/hooks/useAppData';

const ALL_TABS = [
  { path: '/settings/general', label: 'General', icon: SettingsIcon, permission: 'access_settings' },
  { path: '/settings/categories', label: 'Categories', icon: Layers, permission: 'manage_categories' },
  { path: '/settings/payments', label: 'Payments & Auth', icon: CreditCard, permission: 'manage_payment_settings' },
  { path: '/settings/email', label: 'Email', icon: Mail, permissions: ['manage_email_smtp', 'manage_email_templates'] },
  { path: '/settings/backup', label: 'Backup', icon: HardDrive, permission: 'manage_backups' },
];

const SettingsLayout = () => {
  const location = useLocation();
  const { can } = useAppData();

  const tabs = useMemo(() => ALL_TABS.filter(tab => {
    if (tab.permissions) return tab.permissions.some(p => can(p));
    return can(tab.permission);
  }), [can]);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-surface-800">Settings</h2>
        <p className="text-muted-foreground text-sm mt-1">Manage your application settings.</p>
      </div>

      <div className="nav-tabs flex gap-1 w-full md:w-fit relative">
        {tabs.map((tab) => (
          <NavLink
            key={tab.path}
            to={tab.path}
            className={({ isActive }) => cn(
              "nav-tab relative flex items-center gap-2 px-3 pb-2.5 text-sm whitespace-nowrap transition-colors duration-200",
              isActive ? "nav-tab--active" : ""
            )}
          >
            {({ isActive }) => (
              <>
                <tab.icon className="w-4 h-4" />
                <span className="hidden md:inline">{tab.label}</span>
                {isActive && (
                  <motion.div
                    layoutId="settings-tab-glass"
                    className="nav-tab__glass"
                    transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  />
                )}
              </>
            )}
          </NavLink>
        ))}
      </div>

      <motion.div
        key={location.pathname}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.1, ease: 'easeOut' }}
      >
        <Suspense fallback={
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        }>
          <Outlet />
        </Suspense>
      </motion.div>
    </div>
  );
};

export default SettingsLayout;
