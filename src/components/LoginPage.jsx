import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
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

  // Unsplash background
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
        // Preload the full image
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

  return (
    <div
      className="min-h-screen flex flex-col items-center relative"
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
      {/* Dark overlay for readability */}
      {hasBg && <div className="absolute inset-0 bg-black/50" />}

      {/* Spacer for top padding */}
      <div className="w-full py-4 relative z-10" />

      {/* Content */}
      <div className="flex-1 flex items-start justify-center w-full pt-[10vh] relative z-10">
        <div className={`w-full max-w-[400px] px-5 ${hasBg ? 'bg-white backdrop-blur-sm rounded-2xl shadow-xl p-8 mx-4' : ''}`}>
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

          {/* Verification banner */}
          {verificationNeeded && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg mb-6 text-sm">
              <p className="font-medium">Please verify your email address</p>
              <p className="mt-1 text-amber-700">Check your inbox for a verification link.</p>
            </div>
          )}

          {/* Error banner */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 text-sm">
              {error}
            </div>
          )}

          {/* Social login buttons */}
          {hasSocialLogin && (
            <>
              <div className="space-y-2">
                {googleEnabled && (
                  <button
                    type="button"
                    onClick={() => { window.location.href = '/api/google/authorize'; }}
                    className="w-full flex items-center h-10 px-4 rounded-lg border border-surface-200 hover:bg-surface-50 transition-colors text-sm font-medium text-surface-700"
                  >
                    <svg className="w-5 h-5 mr-auto" viewBox="0 0 24 24" fill="none">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                    <span className="flex-1 text-center">{isSignUp ? 'Sign up with Google' : 'Continue with Google'}</span>
                    <span className="w-5" />
                  </button>
                )}

                {oidcEnabled && oidcProviderName && (
                  <button
                    type="button"
                    onClick={() => { window.location.href = '/api/oidc/authorize'; }}
                    className="w-full flex items-center h-10 px-4 rounded-lg border border-surface-200 hover:bg-surface-50 transition-colors text-sm font-medium text-surface-700"
                  >
                    <KeyRound className="w-4 h-4 mr-auto text-surface-500" />
                    <span className="flex-1 text-center">{isSignUp ? 'Sign up' : 'Continue'} with {oidcProviderName}</span>
                    <span className="w-5" />
                  </button>
                )}

                {!isSignUp && (
                  <button
                    type="button"
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
                    className="w-full flex items-center h-10 px-4 rounded-lg border border-surface-200 hover:bg-surface-50 transition-colors text-sm font-medium text-surface-700"
                  >
                    <Fingerprint className="w-4 h-4 mr-auto text-surface-500" />
                    <span className="flex-1 text-center">Log in with passkey</span>
                    <span className="w-5" />
                  </button>
                )}
              </div>

              {/* Divider */}
              <div className="flex items-center gap-3 my-5">
                <div className="flex-1 h-px bg-surface-200" />
                <span className="text-surface-400 text-xs uppercase tracking-wider">or</span>
                <div className="flex-1 h-px bg-surface-200" />
              </div>
            </>
          )}

          {/* Email / password form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1.5">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-surface-200 text-sm text-surface-800 placeholder:text-surface-400 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                  placeholder="Your name"
                  required
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-surface-200 text-sm text-surface-800 placeholder:text-surface-400 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                placeholder="Enter your email address..."
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1.5">Password</label>
              <PasswordInput
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-10 px-3 pr-9 rounded-lg border border-surface-200 text-sm text-surface-800 placeholder:text-surface-400 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                placeholder="Enter your password..."
                required
              />
            </div>

            {isSignUp && (
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1.5">Confirm Password</label>
                <PasswordInput
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full h-10 px-3 pr-9 rounded-lg border border-surface-200 text-sm text-surface-800 placeholder:text-surface-400 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                  placeholder="Confirm your password"
                  required
                />
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-10 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium transition-colors disabled:opacity-60"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : (isSignUp ? 'Sign Up' : 'Continue')}
            </button>
          </form>

          {/* Toggle sign up / sign in */}
          <p className="mt-6 text-center text-sm text-surface-500">
            {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button
              onClick={() => { setIsSignUp(!isSignUp); setError(''); setVerificationNeeded(false); try { sessionStorage.removeItem('verification_pending'); sessionStorage.removeItem('verification_pending_email'); sessionStorage.removeItem('verification_pending_pass'); } catch {} }}
              className="text-blue-500 hover:underline font-medium"
            >
              {isSignUp ? 'Log in' : 'Sign up'}
            </button>
          </p>
        </div>
      </div>

    </div>
  );
};

export default LoginPage;
