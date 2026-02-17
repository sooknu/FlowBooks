import React, { useState, useEffect, useMemo } from 'react';
import { toast } from '@/components/ui/use-toast';
import { useUpdateSettings } from '@/hooks/useMutations';
import { useSettings } from '@/hooks/useAppData';
import { FlaskConical, ChevronDown, Key, Copy } from 'lucide-react';
import PasswordInput from '@/components/ui/PasswordInput';
import StickySettingsBar from '@/components/ui/StickySettingsBar';

/* ─── Toggle Switch ─── */
const ToggleSwitch = ({ checked, onChange, label, description }) => (
  <div className="flex items-center justify-between gap-4">
    <div className="flex items-center gap-2.5">
      <FlaskConical className={`w-4 h-4 ${checked ? 'text-accent' : 'text-surface-500'}`} />
      <div>
        <span className="text-sm font-medium text-surface-600">{label}</span>
        <p className="text-xs text-surface-500">{description}</p>
      </div>
    </div>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
        checked ? 'bg-accent' : 'bg-surface-700'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  </div>
);

/* ─── Collapsible Key Section ─── */
const KeySection = ({ title, open, onToggle, hasKeys, children }) => (
  <div>
    <button
      type="button"
      onClick={onToggle}
      className="flex items-center gap-2 w-full text-left group"
    >
      <Key className="w-3.5 h-3.5 text-surface-500" />
      <span className="text-xs text-surface-500 font-medium uppercase tracking-wide flex-1">
        {title}
      </span>
      {hasKeys && !open && (
        <span className="text-[10px] text-accent font-medium">configured</span>
      )}
      <ChevronDown className={`w-3.5 h-3.5 text-surface-500 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
    </button>
    {open && <div className="mt-3 space-y-4 pl-5.5">{children}</div>}
  </div>
);

const PaymentGatewayManager = () => {
  const { data: fetchedSettings } = useSettings();
  const updateSettings = useUpdateSettings();

  // Stripe state
  const [stripeEnabled, setStripeEnabled] = useState(false);
  const [stripeTestMode, setStripeTestMode] = useState(false);
  const [stripePublishableKey, setStripePublishableKey] = useState('');
  const [stripeSecretKey, setStripeSecretKey] = useState('');
  const [stripeTestPublishableKey, setStripeTestPublishableKey] = useState('');
  const [stripeTestSecretKey, setStripeTestSecretKey] = useState('');
  const [showStripeLiveKeys, setShowStripeLiveKeys] = useState(false);
  const [showStripeTestKeys, setShowStripeTestKeys] = useState(false);

  // PayPal state
  const [paypalEnabled, setPaypalEnabled] = useState(false);
  const [paypalTestMode, setPaypalTestMode] = useState(false);
  const [paypalClientId, setPaypalClientId] = useState('');
  const [paypalClientSecret, setPaypalClientSecret] = useState('');
  const [paypalTestClientId, setPaypalTestClientId] = useState('');
  const [paypalTestClientSecret, setPaypalTestClientSecret] = useState('');
  const [showPaypalLiveKeys, setShowPaypalLiveKeys] = useState(false);
  const [showPaypalTestKeys, setShowPaypalTestKeys] = useState(false);

  // Auth state
  const [oidcEnabled, setOidcEnabled] = useState(false);
  const [oidcProviderName, setOidcProviderName] = useState('');
  const [oidcClientId, setOidcClientId] = useState('');
  const [oidcClientSecret, setOidcClientSecret] = useState('');
  const [oidcBaseUrl, setOidcBaseUrl] = useState('');
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [googleClientId, setGoogleClientId] = useState('');
  const [googleClientSecret, setGoogleClientSecret] = useState('');

  useEffect(() => {
    if (!fetchedSettings) return;
    const f = fetchedSettings;
    setStripeEnabled(f.stripe_enabled === 'true');
    setStripeTestMode(f.stripe_test_mode === 'true');
    setStripePublishableKey(f.stripe_publishable_key || '');
    setStripeSecretKey(f.stripe_secret_key || '');
    setStripeTestPublishableKey(f.stripe_test_publishable_key || '');
    setStripeTestSecretKey(f.stripe_test_secret_key || '');
    setPaypalEnabled(f.paypal_enabled === 'true');
    setPaypalTestMode(f.paypal_test_mode === 'true');
    setPaypalClientId(f.paypal_client_id || '');
    setPaypalClientSecret(f.paypal_client_secret || '');
    setPaypalTestClientId(f.paypal_test_client_id || '');
    setPaypalTestClientSecret(f.paypal_test_client_secret || '');
    setOidcEnabled(f.oidc_enabled === 'true');
    setOidcProviderName(f.oidc_provider_name || '');
    setOidcClientId(f.oidc_client_id || '');
    setOidcClientSecret(f.oidc_client_secret || '');
    setOidcBaseUrl(f.oidc_base_url || '');
    setGoogleEnabled(f.google_enabled === 'true');
    setGoogleClientId(f.google_client_id || '');
    setGoogleClientSecret(f.google_client_secret || '');
  }, [fetchedSettings]);

  const isDirty = useMemo(() => {
    if (!fetchedSettings) return false;
    const f = fetchedSettings;
    return stripeEnabled !== (f.stripe_enabled === 'true') ||
      stripeTestMode !== (f.stripe_test_mode === 'true') ||
      stripePublishableKey !== (f.stripe_publishable_key || '') ||
      stripeSecretKey !== (f.stripe_secret_key || '') ||
      stripeTestPublishableKey !== (f.stripe_test_publishable_key || '') ||
      stripeTestSecretKey !== (f.stripe_test_secret_key || '') ||
      paypalEnabled !== (f.paypal_enabled === 'true') ||
      paypalTestMode !== (f.paypal_test_mode === 'true') ||
      paypalClientId !== (f.paypal_client_id || '') ||
      paypalClientSecret !== (f.paypal_client_secret || '') ||
      paypalTestClientId !== (f.paypal_test_client_id || '') ||
      paypalTestClientSecret !== (f.paypal_test_client_secret || '') ||
      oidcEnabled !== (f.oidc_enabled === 'true') ||
      oidcProviderName !== (f.oidc_provider_name || '') ||
      oidcClientId !== (f.oidc_client_id || '') ||
      oidcClientSecret !== (f.oidc_client_secret || '') ||
      oidcBaseUrl !== (f.oidc_base_url || '') ||
      googleEnabled !== (f.google_enabled === 'true') ||
      googleClientId !== (f.google_client_id || '') ||
      googleClientSecret !== (f.google_client_secret || '');
  }, [stripeEnabled, stripeTestMode, stripePublishableKey, stripeSecretKey, stripeTestPublishableKey, stripeTestSecretKey, paypalEnabled, paypalTestMode, paypalClientId, paypalClientSecret, paypalTestClientId, paypalTestClientSecret, oidcEnabled, oidcProviderName, oidcClientId, oidcClientSecret, oidcBaseUrl, googleEnabled, googleClientId, googleClientSecret, fetchedSettings]);

  const handleSave = () => {
    updateSettings.mutate([
      { key: 'stripe_enabled', value: String(stripeEnabled) },
      { key: 'stripe_test_mode', value: String(stripeTestMode) },
      { key: 'stripe_publishable_key', value: stripePublishableKey },
      { key: 'stripe_secret_key', value: stripeSecretKey },
      { key: 'stripe_test_publishable_key', value: stripeTestPublishableKey },
      { key: 'stripe_test_secret_key', value: stripeTestSecretKey },
      { key: 'paypal_enabled', value: String(paypalEnabled) },
      { key: 'paypal_test_mode', value: String(paypalTestMode) },
      { key: 'paypal_client_id', value: paypalClientId },
      { key: 'paypal_client_secret', value: paypalClientSecret },
      { key: 'paypal_test_client_id', value: paypalTestClientId },
      { key: 'paypal_test_client_secret', value: paypalTestClientSecret },
      { key: 'oidc_enabled', value: String(oidcEnabled) },
      { key: 'oidc_provider_name', value: oidcProviderName },
      { key: 'oidc_client_id', value: oidcClientId },
      { key: 'oidc_client_secret', value: oidcClientSecret },
      { key: 'oidc_base_url', value: oidcBaseUrl },
      { key: 'oidc_callback_url', value: `${window.location.origin}/api/oidc/callback` },
      { key: 'google_enabled', value: String(googleEnabled) },
      { key: 'google_client_id', value: googleClientId },
      { key: 'google_client_secret', value: googleClientSecret },
    ], {
      onSuccess: () => toast({ title: 'Payments & auth settings saved!' }),
    });
  };

  const hasStripeLiveKeys = stripePublishableKey || stripeSecretKey;
  const hasStripeTestKeys = stripeTestPublishableKey || stripeTestSecretKey;
  const hasPaypalLiveKeys = paypalClientId || paypalClientSecret;
  const hasPaypalTestKeys = paypalTestClientId || paypalTestClientSecret;

  return (
    <div className="space-y-5">
      {/* ── Stripe ── */}
      <div className="glass-card p-6">
        <h3 className="text-lg font-semibold text-surface-800 mb-4">Stripe Payments</h3>
        <p className="text-sm text-surface-500 mb-6">Accept credit card payments on invoices via Stripe.</p>

        <div className="flex items-center gap-3 mb-6">
          <input
            type="checkbox"
            id="stripe-enabled"
            checked={stripeEnabled}
            onChange={(e) => setStripeEnabled(e.target.checked)}
            className="w-4 h-4 rounded border-surface-300 bg-white text-blue-500 focus:ring-blue-500/50"
          />
          <label htmlFor="stripe-enabled" className="text-sm font-medium text-surface-600">Enable Stripe Payments</label>
        </div>

        {stripeEnabled && (
          <div className="space-y-5">
            <ToggleSwitch
              checked={stripeTestMode}
              onChange={setStripeTestMode}
              label="Test Mode"
              description={stripeTestMode ? 'Using test keys — no real charges' : 'Using live keys — real charges'}
            />

            {stripeTestMode && (
              <div className="glass-card item-row p-3 border-l-2 !border-l-accent">
                <p className="text-xs text-surface-400">
                  Use <code className="glass-input !inline !w-auto !py-0 !px-1.5 !border-0 text-xs font-mono">4242 4242 4242 4242</code> with any future date and CVC to test.
                </p>
              </div>
            )}

            <KeySection title="Test API Keys" open={showStripeTestKeys} onToggle={() => setShowStripeTestKeys(!showStripeTestKeys)} hasKeys={hasStripeTestKeys}>
              <div>
                <label className="block text-sm font-medium text-surface-600 mb-1">Test Publishable Key</label>
                <input type="text" value={stripeTestPublishableKey} onChange={(e) => setStripeTestPublishableKey(e.target.value)} className="glass-input w-full" placeholder="pk_test_..." />
              </div>
              <div>
                <label className="block text-sm font-medium text-surface-600 mb-1">Test Secret Key</label>
                <PasswordInput value={stripeTestSecretKey} onChange={(e) => setStripeTestSecretKey(e.target.value)} className="glass-input w-full pr-9" placeholder="sk_test_..." />
              </div>
            </KeySection>

            <KeySection title="Live API Keys" open={showStripeLiveKeys} onToggle={() => setShowStripeLiveKeys(!showStripeLiveKeys)} hasKeys={hasStripeLiveKeys}>
              <div>
                <label className="block text-sm font-medium text-surface-600 mb-1">Publishable Key</label>
                <input type="text" value={stripePublishableKey} onChange={(e) => setStripePublishableKey(e.target.value)} className="glass-input w-full" placeholder="pk_live_..." />
                <p className="text-xs text-surface-500 mt-1">
                  From your <a href="https://dashboard.stripe.com/apikeys" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Stripe Dashboard</a> &rarr; API Keys.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-surface-600 mb-1">Secret Key</label>
                <PasswordInput value={stripeSecretKey} onChange={(e) => setStripeSecretKey(e.target.value)} className="glass-input w-full pr-9" placeholder="sk_live_..." />
                <p className="text-xs text-surface-500 mt-1">Stored securely on the server. Never exposed to the frontend.</p>
              </div>
            </KeySection>
          </div>
        )}
      </div>

      {/* ── PayPal ── */}
      <div className="glass-card p-6">
        <h3 className="text-lg font-semibold text-surface-800 mb-4">PayPal Payments</h3>
        <p className="text-sm text-surface-500 mb-6">Accept PayPal and credit card payments via PayPal Checkout.</p>

        <div className="flex items-center gap-3 mb-6">
          <input
            type="checkbox"
            id="paypal-enabled"
            checked={paypalEnabled}
            onChange={(e) => setPaypalEnabled(e.target.checked)}
            className="w-4 h-4 rounded border-surface-300 bg-white text-blue-500 focus:ring-blue-500/50"
          />
          <label htmlFor="paypal-enabled" className="text-sm font-medium text-surface-600">Enable PayPal Payments</label>
        </div>

        {paypalEnabled && (
          <div className="space-y-5">
            <ToggleSwitch
              checked={paypalTestMode}
              onChange={setPaypalTestMode}
              label="Sandbox Mode"
              description={paypalTestMode ? 'Using sandbox keys — no real charges' : 'Using live keys — real charges'}
            />

            {paypalTestMode && (
              <div className="glass-card item-row p-3 border-l-2 !border-l-accent">
                <p className="text-xs text-surface-400">
                  Use PayPal sandbox test accounts from your <a href="https://developer.paypal.com/dashboard/accounts" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">PayPal Developer Dashboard</a>.
                </p>
              </div>
            )}

            <KeySection title="Sandbox API Keys" open={showPaypalTestKeys} onToggle={() => setShowPaypalTestKeys(!showPaypalTestKeys)} hasKeys={hasPaypalTestKeys}>
              <div>
                <label className="block text-sm font-medium text-surface-600 mb-1">Sandbox Client ID</label>
                <input type="text" value={paypalTestClientId} onChange={(e) => setPaypalTestClientId(e.target.value)} className="glass-input w-full" placeholder="AY..." />
              </div>
              <div>
                <label className="block text-sm font-medium text-surface-600 mb-1">Sandbox Client Secret</label>
                <PasswordInput value={paypalTestClientSecret} onChange={(e) => setPaypalTestClientSecret(e.target.value)} className="glass-input w-full pr-9" placeholder="EL..." />
              </div>
            </KeySection>

            <KeySection title="Live API Keys" open={showPaypalLiveKeys} onToggle={() => setShowPaypalLiveKeys(!showPaypalLiveKeys)} hasKeys={hasPaypalLiveKeys}>
              <div>
                <label className="block text-sm font-medium text-surface-600 mb-1">Client ID</label>
                <input type="text" value={paypalClientId} onChange={(e) => setPaypalClientId(e.target.value)} className="glass-input w-full" placeholder="AY..." />
                <p className="text-xs text-surface-500 mt-1">
                  From your <a href="https://developer.paypal.com/dashboard/applications/live" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">PayPal Developer Dashboard</a> &rarr; Apps.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-surface-600 mb-1">Client Secret</label>
                <PasswordInput value={paypalClientSecret} onChange={(e) => setPaypalClientSecret(e.target.value)} className="glass-input w-full pr-9" placeholder="EL..." />
                <p className="text-xs text-surface-500 mt-1">Stored securely on the server. Never exposed to the frontend.</p>
              </div>
            </KeySection>
          </div>
        )}
      </div>

      {/* ── OIDC ── */}
      <div className="glass-card p-6">
        <h3 className="text-lg font-semibold text-surface-800 mb-4">OpenID Connect (OIDC)</h3>
        <p className="text-sm text-surface-500 mb-6">Configure single sign-on with an external identity provider.</p>

        <div className="flex items-center gap-3 mb-6">
          <input
            type="checkbox"
            id="oidc-enabled"
            checked={oidcEnabled}
            onChange={(e) => setOidcEnabled(e.target.checked)}
            className="w-4 h-4 rounded border-surface-300 bg-white text-blue-500 focus:ring-blue-500/50"
          />
          <label htmlFor="oidc-enabled" className="text-sm font-medium text-surface-600">Enable OIDC Login</label>
        </div>

        {oidcEnabled && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-surface-600 mb-1">Provider Name</label>
              <input type="text" value={oidcProviderName} onChange={(e) => setOidcProviderName(e.target.value)} className="glass-input w-full" placeholder="e.g., Authentik, Keycloak, Okta" />
              <p className="text-xs text-surface-500 mt-1">Display name shown on the login button.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-600 mb-1">Base URL</label>
              <input type="text" value={oidcBaseUrl} onChange={(e) => setOidcBaseUrl(e.target.value)} className="glass-input w-full" placeholder="https://auth.example.com/application/o/myapp" />
              <p className="text-xs text-surface-500 mt-1">The OIDC discovery base URL of your identity provider.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-600 mb-1">Client ID</label>
              <input type="text" value={oidcClientId} onChange={(e) => setOidcClientId(e.target.value)} className="glass-input w-full" placeholder="your-client-id" />
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-600 mb-1">Client Secret</label>
              <PasswordInput value={oidcClientSecret} onChange={(e) => setOidcClientSecret(e.target.value)} className="glass-input w-full pr-9" placeholder="your-client-secret" />
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-600 mb-1">Callback URL</label>
              <div className="flex gap-2">
                <input type="text" value={`${window.location.origin}/api/oidc/callback`} readOnly className="glass-input flex-1 text-surface-500" />
                <button type="button" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/api/oidc/callback`); toast({ title: 'Copied to clipboard' }); }} className="action-btn px-3">
                  <Copy className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-surface-500 mt-1">Use this as the redirect URI in your OIDC provider.</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Google OAuth ── */}
      <div className="glass-card p-6">
        <h3 className="text-lg font-semibold text-surface-800 mb-4">Google OAuth</h3>
        <p className="text-sm text-surface-500 mb-6">Allow users to sign in with their Google account.</p>

        <div className="flex items-center gap-3 mb-6">
          <input
            type="checkbox"
            id="google-enabled"
            checked={googleEnabled}
            onChange={(e) => setGoogleEnabled(e.target.checked)}
            className="w-4 h-4 rounded border-surface-300 bg-white text-blue-500 focus:ring-blue-500/50"
          />
          <label htmlFor="google-enabled" className="text-sm font-medium text-surface-600">Enable Google Login</label>
        </div>

        {googleEnabled && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-surface-600 mb-1">Client ID</label>
              <input type="text" value={googleClientId} onChange={(e) => setGoogleClientId(e.target.value)} className="glass-input w-full" placeholder="your-google-client-id.apps.googleusercontent.com" />
              <p className="text-xs text-surface-500 mt-1">
                From <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Google Cloud Console</a> &rarr; Credentials &rarr; OAuth 2.0 Client IDs.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-600 mb-1">Client Secret</label>
              <PasswordInput value={googleClientSecret} onChange={(e) => setGoogleClientSecret(e.target.value)} className="glass-input w-full pr-9" placeholder="your-client-secret" />
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-600 mb-1">Callback URL</label>
              <div className="flex gap-2">
                <input type="text" value={`${window.location.origin}/api/google/callback`} readOnly className="glass-input flex-1 text-surface-500" />
                <button type="button" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/api/google/callback`); toast({ title: 'Copied to clipboard' }); }} className="action-btn px-3">
                  <Copy className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-surface-500 mt-1">Add this as an authorized redirect URI in your Google Cloud Console.</p>
            </div>
          </div>
        )}
      </div>

      <div className="pb-16" />
      <StickySettingsBar isDirty={isDirty} onSave={handleSave} isPending={updateSettings.isPending} />
    </div>
  );
};

export default PaymentGatewayManager;
