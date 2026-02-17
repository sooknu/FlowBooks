import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { LogOut, ShieldCheck } from 'lucide-react';
import api from '@/lib/apiClient';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';

const PendingApprovalPage = ({ appSettings, onSignOut, onApproved }) => {
  const appName = appSettings?.app_name || 'QuoteFlow';
  const loginLogoUrl = appSettings?.login_logo_url || '';
  const headerLogoUrl = appSettings?.header_logo_url || '';
  const loginLogoSize = appSettings?.login_logo_size || '64';
  const hasLogo = loginLogoUrl || headerLogoUrl;

  const { data: isApproved } = useQuery({
    queryKey: queryKeys.profile.approvalStatus(),
    queryFn: async () => {
      try {
        const res = await api.get('/users/me/approval-status');
        return res.approved === true;
      } catch {
        return false;
      }
    },
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (isApproved) {
      onApproved?.();
    }
  }, [isApproved, onApproved]);

  return (
    <div className="min-h-screen flex items-start justify-center pt-[15vh] p-4 bg-surface-50 relative">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="glass-card p-8 w-full max-w-md"
      >
        {/* Logo */}
        <div className="text-center mb-6 flex flex-col justify-center items-center">
          {hasLogo ? (
            <img
              src={loginLogoUrl || headerLogoUrl}
              alt={`${appName} Logo`}
              className="mx-auto"
              style={{ height: `${parseInt(loginLogoSize, 10) || 64}px`, objectFit: 'contain' }}
            />
          ) : (
            <h1 className="font-display text-4xl font-bold text-gradient mb-2">
              {appName}
            </h1>
          )}
        </div>

        {/* Shield icon with accent glow */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.4, ease: 'easeOut' }}
          className="flex justify-center mb-6"
        >
          <div className="relative">
            <div
              className="absolute inset-0 rounded-full blur-xl opacity-20"
              style={{ background: `rgba(var(--accent-rgb) / 0.4)` }}
            />
            <div
              className="relative w-16 h-16 rounded-full flex items-center justify-center"
              style={{
                background: `rgba(var(--accent-rgb) / 0.1)`,
                border: `1px solid rgba(var(--accent-rgb) / 0.2)`,
              }}
            >
              <ShieldCheck className="w-8 h-8" style={{ color: `rgba(var(--accent-rgb) / 0.7)` }} />
            </div>
          </div>
        </motion.div>

        {/* Heading */}
        <h2 className="text-xl font-semibold text-surface-800 text-center mb-3">
          Account Pending Approval
        </h2>

        {/* Message */}
        <p className="text-surface-400 text-sm text-center leading-relaxed mb-6">
          Your account has been created and verified. An administrator needs to approve your account before you can access the application.
        </p>

        {/* Animated waiting bar */}
        <div className="relative h-1 rounded-full overflow-hidden mb-8" style={{ background: `rgba(var(--accent-rgb) / 0.1)` }}>
          <motion.div
            className="absolute inset-y-0 w-1/3 rounded-full"
            style={{ background: `rgba(var(--accent-rgb) / 0.5)` }}
            animate={{ x: ['-100%', '400%'] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>

        {/* Sign out button */}
        <button
          onClick={onSignOut}
          className="action-btn action-btn--secondary w-full py-2.5 flex items-center justify-center gap-2"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>

        {/* Auto-refresh note */}
        <p className="text-surface-500 text-xs text-center mt-6">
          This page will automatically refresh when your account is approved.
        </p>
      </motion.div>
    </div>
  );
};

export default PendingApprovalPage;
