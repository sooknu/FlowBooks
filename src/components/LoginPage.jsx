import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2, KeyRound, Fingerprint } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import PasswordInput from '@/components/ui/PasswordInput';
import { authClient } from '@/lib/authClient';

const LoginPage = ({ appSettings }) => {
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [name, setName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [verificationNeeded, setVerificationNeeded] = useState(() => {
    try { return sessionStorage.getItem('verification_pending') === 'true'; } catch { return false; }
  });

  // Unsplash background (desktop only — skipped on mobile via CSS)
  const [bg, setBg] = useState(null);
  const [bgLoaded, setBgLoaded] = useState(false);

  useEffect(() => {
    if (appSettings?.unsplash_enabled !== 'true') return;
    let cancelled = false;
    fetch('/api/unsplash/background')
      .then(r => r.json())
      .then(data => {
        if (cancelled || !data.enabled || !data.url) return;
        setBg(data);
        const img = new Image();
        img.onload = () => { if (!cancelled) setBgLoaded(true); };
        img.src = data.url;
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [appSettings?.unsplash_enabled]);

  const settings = {
    app_name: appSettings?.app_name || 'QuoteFlow',
    login_logo_url: appSettings?.login_logo_url || '',
    header_logo_url: appSettings?.header_logo_url || '',
    login_logo_size: appSettings?.login_logo_size || '64',
  };
  const oidcEnabled = appSettings?.oidc_enabled === 'true';
  const oidcProviderName = appSettings?.oidc_provider_name || '';
  const googleEnabled = appSettings?.google_enabled === 'true';

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oidcError = params.get('error');
    if (oidcError) {
      const messages = {
        oidc_failed: 'Authentication failed. Please try again.',
        oidc_denied: 'Authentication was cancelled.',
        oidc_state_mismatch: 'Session expired. Please try again.',
        google_failed: 'Google authentication failed. Please try again.',
        google_denied: 'Google authentication was cancelled.',
        google_state_mismatch: 'Session expired. Please try again.',
        google_already_linked: 'This Google account is already linked to another user.',
        oidc_already_linked: 'This account is already linked to another user.',
      };
      setError(messages[oidcError] || 'Authentication failed.');
      window.history.replaceState({}, '', window.location.pathname + window.location.hash);
    }
  }, []);

  // Poll for email verification
  const autoSigningIn = useRef(false);
  const pendingEmail = (() => { try { return sessionStorage.getItem('verification_pending_email'); } catch { return null; } })();
  const pendingPass = (() => { try { return sessionStorage.getItem('verification_pending_pass'); } catch { return null; } })();

  const { data: verificationData } = useQuery({
    queryKey: queryKeys.verification.check(pendingEmail),
    queryFn: async () => {
      const res = await fetch(`/api/users/check-verification?email=${encodeURIComponent(pendingEmail)}`);
      return res.json();
    },
    refetchInterval: 5_000,
    enabled: verificationNeeded && !!pendingEmail && !!pendingPass,
  });

  useEffect(() => {
    if (verificationData?.verified && !autoSigningIn.current) {
      autoSigningIn.current = true;
      try { sessionStorage.removeItem('verification_pending'); sessionStorage.removeItem('verification_pending_email'); sessionStorage.removeItem('verification_pending_pass'); } catch {}
      setVerificationNeeded(false);
      signIn(pendingEmail, pendingPass).then(r => {
        if (!r?.error) navigate('/dashboard', { replace: true });
      });
    }
  }, [verificationData, pendingEmail, pendingPass, signIn, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    if (isSignUp) {
      if (!name.trim()) { setError('Name is required'); setIsSubmitting(false); return; }
      if (!/\S+@\S+\.\S+/.test(email)) { setError('Please enter a valid email address'); setIsSubmitting(false); return; }
      if (password.length < 8) { setError('Password must be at least 8 characters'); setIsSubmitting(false); return; }
      if (password !== confirmPassword) { setError('Passwords do not match'); setIsSubmitting(false); return; }
    }
    setError('');
    setVerificationNeeded(false);
    try { sessionStorage.removeItem('verification_pending'); } catch {}
    if (isSignUp) {
      const { error } = await signUp(email, password, { data: { name } });
      if (!error) {
        setVerificationNeeded(true);
        try {
          sessionStorage.setItem('verification_pending', 'true');
          sessionStorage.setItem('verification_pending_email', email);
          sessionStorage.setItem('verification_pending_pass', password);
        } catch {}
        setIsSignUp(false);
      }
    } else {
      const result = await signIn(email, password);
      if (result?.isVerificationError) {
        setVerificationNeeded(true);
        try {
          sessionStorage.setItem('verification_pending', 'true');
          sessionStorage.setItem('verification_pending_email', email);
          sessionStorage.setItem('verification_pending_pass', password);
        } catch {}
      } else if (!result?.error) {
        navigate('/dashboard', { replace: true });
      }
    }
    setIsSubmitting(false);
  };

  const hasLogo = settings.login_logo_url || settings.header_logo_url;
  const hasSocialLogin = googleEnabled || (oidcEnabled && oidcProviderName);
  const hasBg = bg && bg.enabled;

  // Shared input classes
  const inputCls = 'w-full h-12 md:h-10 px-4 md:px-3 rounded-xl md:rounded-lg bg-surface-50 md:bg-white border border-surface-150 md:border-surface-200 text-[15px] md:text-sm text-surface-800 placeholder:text-surface-400 outline-none focus:border-surface-400 focus:ring-1 focus:ring-surface-300 md:focus:border-blue-500 md:focus:ring-blue-500 transition-colors';
  const btnSocialCls = 'w-full flex items-center h-12 md:h-10 px-4 rounded-xl md:rounded-lg border border-surface-150 md:border-surface-200 hover:bg-surface-100 md:hover:bg-surface-50 active:scale-[0.98] transition-all text-[15px] md:text-sm font-medium text-surface-700';

  // ─── Form content (shared between mobile and desktop) ─────────────────────

  const formContent = (
    <>
      {/* Verification banner */}
      <AnimatePresence>
        {verificationNeeded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl md:rounded-lg mb-5 text-sm">
              <p className="font-medium">Please verify your email address</p>
              <p className="mt-1 text-amber-700">Check your inbox for a verification link.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error banner */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl md:rounded-lg mb-5 text-sm"
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Social login buttons */}
      {hasSocialLogin && (
        <>
          <div className="space-y-2.5 md:space-y-2">
            {googleEnabled && (
              <motion.button
                type="button"
                whileTap={{ scale: 0.98 }}
                onClick={() => { window.location.href = '/api/google/authorize'; }}
                className={btnSocialCls}
              >
                <svg className="w-5 h-5 mr-auto" viewBox="0 0 24 24" fill="none">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                <span className="flex-1 text-center">{isSignUp ? 'Sign up with Google' : 'Continue with Google'}</span>
                <span className="w-5" />
              </motion.button>
            )}

            {oidcEnabled && oidcProviderName && (
              <motion.button
                type="button"
                whileTap={{ scale: 0.98 }}
                onClick={() => { window.location.href = '/api/oidc/authorize'; }}
                className={btnSocialCls}
              >
                <KeyRound className="w-4 h-4 mr-auto text-surface-500" />
                <span className="flex-1 text-center">{isSignUp ? 'Sign up' : 'Continue'} with {oidcProviderName}</span>
                <span className="w-5" />
              </motion.button>
            )}

            {!isSignUp && (
              <motion.button
                type="button"
                whileTap={{ scale: 0.98 }}
                onClick={async () => {
                  try {
                    const { data, error: err } = await authClient.signIn.passkey();
                    if (err) {
                      toast({ title: err.message || 'Passkey login failed', variant: 'destructive' });
                    } else if (data) {
                      navigate('/dashboard', { replace: true });
                    }
                  } catch {
                    toast({ title: 'Passkey login cancelled or not available', variant: 'destructive' });
                  }
                }}
                className={btnSocialCls}
              >
                <Fingerprint className="w-4 h-4 mr-auto text-surface-500" />
                <span className="flex-1 text-center">Log in with passkey</span>
                <span className="w-5" />
              </motion.button>
            )}
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3 my-6 md:my-5">
            <div className="flex-1 h-px bg-surface-150 md:bg-surface-200" />
            <span className="text-surface-400 text-xs uppercase tracking-wider">or</span>
            <div className="flex-1 h-px bg-surface-150 md:bg-surface-200" />
          </div>
        </>
      )}

      {/* Email / password form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {isSignUp && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} transition={{ duration: 0.2 }}>
            <label className="block text-sm font-medium text-surface-600 mb-1.5">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputCls}
              placeholder="Your name"
              required
            />
          </motion.div>
        )}

        <div>
          <label className="block text-sm font-medium text-surface-600 mb-1.5">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputCls}
            placeholder="you@email.com"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-surface-600 mb-1.5">Password</label>
          <PasswordInput
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputCls + ' pr-10'}
            placeholder="Enter password"
            required
          />
        </div>

        {isSignUp && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} transition={{ duration: 0.2, delay: 0.05 }}>
            <label className="block text-sm font-medium text-surface-600 mb-1.5">Confirm Password</label>
            <PasswordInput
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={inputCls + ' pr-10'}
              placeholder="Confirm password"
              required
            />
          </motion.div>
        )}

        <motion.button
          type="submit"
          disabled={isSubmitting}
          whileTap={{ scale: 0.98 }}
          className="w-full h-12 md:h-10 rounded-xl md:rounded-lg bg-surface-900 hover:bg-surface-800 text-white text-[15px] md:text-sm font-medium transition-colors disabled:opacity-60"
        >
          {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : (isSignUp ? 'Create Account' : 'Continue')}
        </motion.button>
      </form>
    </>
  );

  return (
    <div className="min-h-screen min-h-[100dvh] flex flex-col relative">

      {/* ─── Desktop: Unsplash background ─── */}
      <div
        className="hidden md:block absolute inset-0"
        style={{
          backgroundColor: hasBg ? (bg.color || '#333') : '#fff',
          ...(hasBg ? {
            backgroundImage: `url(${bgLoaded ? bg.url : bg.thumb})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
          } : {}),
        }}
      >
        {hasBg && <div className="absolute inset-0 bg-black/50" />}
      </div>

      {/* ─── Mobile: Clean white background ─── */}
      <div className="md:hidden absolute inset-0 bg-white" />

      {/* ─── Content ─── */}
      <div className="relative z-10 flex-1 flex flex-col">

        {/* ─── Mobile layout ─── */}
        <div className="md:hidden flex-1 flex flex-col px-6 safe-area-inset">
          {/* Logo area — generous top spacing */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="pt-[max(env(safe-area-inset-top,0px),16px)] mt-12 mb-10 text-center"
          >
            {hasLogo ? (
              <img
                src={settings.login_logo_url || settings.header_logo_url}
                alt={settings.app_name}
                className="mx-auto"
                style={{ height: `${Math.min(parseInt(settings.login_logo_size, 10) || 64, 80)}px`, objectFit: 'contain' }}
              />
            ) : (
              <h1 className="text-[32px] font-bold text-surface-900 tracking-tight">
                {settings.app_name}
              </h1>
            )}
            {isSignUp && (
              <p className="text-surface-500 mt-2 text-[15px]">Create your account</p>
            )}
          </motion.div>

          {/* Form */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.15, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="flex-1"
          >
            {formContent}
          </motion.div>

          {/* Toggle — anchored to bottom */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="py-8 text-center"
          >
            <p className="text-[15px] text-surface-500">
              {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
              <button
                onClick={() => { setIsSignUp(!isSignUp); setError(''); setVerificationNeeded(false); try { sessionStorage.removeItem('verification_pending'); sessionStorage.removeItem('verification_pending_email'); sessionStorage.removeItem('verification_pending_pass'); } catch {} }}
                className="text-surface-900 font-semibold"
              >
                {isSignUp ? 'Log in' : 'Sign up'}
              </button>
            </p>
          </motion.div>
        </div>

        {/* ─── Desktop layout ─── */}
        <div className="hidden md:flex flex-1 items-start justify-center pt-[10vh]">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
            className={`w-full max-w-[400px] px-5 ${hasBg ? 'bg-white backdrop-blur-sm rounded-2xl shadow-xl p-8 mx-4' : ''}`}
          >
            {/* Logo */}
            <div className="mb-8 text-center">
              {hasLogo ? (
                <img
                  src={settings.login_logo_url || settings.header_logo_url}
                  alt={settings.app_name}
                  className="mx-auto"
                  style={{ height: `${parseInt(settings.login_logo_size, 10) || 64}px`, objectFit: 'contain' }}
                />
              ) : (
                <h1 className="text-[28px] font-bold text-surface-900 leading-tight">
                  {settings.app_name}
                </h1>
              )}
              {isSignUp && (
                <p className="text-sm text-surface-500 mt-3">Create your account</p>
              )}
            </div>

            {formContent}

            {/* Toggle */}
            <p className="mt-6 text-center text-sm text-surface-500">
              {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
              <button
                onClick={() => { setIsSignUp(!isSignUp); setError(''); setVerificationNeeded(false); try { sessionStorage.removeItem('verification_pending'); sessionStorage.removeItem('verification_pending_email'); sessionStorage.removeItem('verification_pending_pass'); } catch {} }}
                className="text-blue-500 hover:underline font-medium"
              >
                {isSignUp ? 'Log in' : 'Sign up'}
              </button>
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
