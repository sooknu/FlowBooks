import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2 } from 'lucide-react';
import { usePublicSettings } from '@/hooks/useAppData';

const AccountVerified = () => {
  const { data: publicSettings } = usePublicSettings();

  const settings = {
    app_name: publicSettings?.app_name || 'QuoteFlow',
    login_logo_url: publicSettings?.login_logo_url || '',
    header_logo_url: publicSettings?.header_logo_url || '',
    login_logo_size: publicSettings?.login_logo_size || '64',
  };

  const logoUrl = settings.login_logo_url || settings.header_logo_url;
  const logoSize = parseInt(settings.login_logo_size, 10) || 64;

  return (
    <div className="min-h-screen flex items-start justify-center pt-[15vh] p-4 bg-surface-50 relative">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="glass-card p-8 w-full max-w-md text-center"
      >
        <div className="mb-6 flex flex-col justify-center items-center">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={`${settings.app_name} Logo`}
              className="mx-auto"
              style={{ height: `${logoSize}px`, maxHeight: `${logoSize}px`, objectFit: 'contain' }}
            />
          ) : (
            <h1 className="font-display text-4xl font-bold text-gradient mb-2">
              {settings.app_name}
            </h1>
          )}
        </div>

        <div className="flex justify-center mb-4">
          <CheckCircle2 className="w-16 h-16 text-emerald-400" />
        </div>

        <h2 className="text-xl font-semibold text-foreground mb-2">
          Email Verified
        </h2>
        <p className="text-muted-foreground text-sm mb-6">
          Your email has been verified successfully. You can close this tab and return to your original browser to continue.
        </p>

        <button
          onClick={() => { window.location.href = '/'; }}
          className="action-btn w-full py-2.5 text-sm font-medium"
        >
          Sign in on this device
        </button>
      </motion.div>
    </div>
  );
};

export default AccountVerified;
