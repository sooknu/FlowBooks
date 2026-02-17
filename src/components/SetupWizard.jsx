import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles, HardDrive, Cloud, Database, Loader2, CheckCircle,
  ArrowLeft, AlertTriangle, RefreshCw, Link2, Unlink,
} from 'lucide-react';

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

/* ─── Provider definitions ───────────────────────────────────────────────── */

const PROVIDERS = [
  { id: 's3', label: 'AWS S3', description: 'Amazon S3 or compatible', icon: Cloud },
  { id: 'b2', label: 'Backblaze B2', description: 'Backblaze B2 Cloud Storage', icon: Database },
  { id: 'gdrive', label: 'Google Drive', description: 'Link your Google account', icon: HardDrive },
];

/* ─── Credential field definitions per provider ──────────────────────────── */

const CREDENTIAL_FIELDS = {
  s3: [
    { key: 'accessKeyId', label: 'Access Key ID', type: 'text', placeholder: 'AKIAIOSFODNN7EXAMPLE' },
    { key: 'secretAccessKey', label: 'Secret Access Key', type: 'password', placeholder: 'wJalrXUtnFEMI/K7MDENG/...' },
    { key: 'bucket', label: 'Bucket', type: 'text', placeholder: 'my-backups' },
    { key: 'region', label: 'Region', type: 'text', placeholder: 'us-east-1', defaultValue: 'us-east-1' },
    { key: 'endpoint', label: 'Endpoint', type: 'text', placeholder: 'Leave empty for AWS', optional: true },
  ],
  b2: [
    { key: 'applicationKeyId', label: 'Application Key ID', type: 'text', placeholder: '0012345678abcdef0000000001' },
    { key: 'applicationKey', label: 'Application Key', type: 'password', placeholder: 'K001...' },
    { key: 'bucket', label: 'Bucket', type: 'text', placeholder: 'my-backups' },
  ],
  gdrive: [
    { key: 'clientId', label: 'Google Client ID', type: 'text', placeholder: '123456789.apps.googleusercontent.com' },
    { key: 'clientSecret', label: 'Google Client Secret', type: 'password', placeholder: 'GOCSPX-...' },
    { key: 'folderId', label: 'Folder ID', type: 'text', placeholder: '1AbC-dEfGhIjKlMnOpQrStUvWxYz' },
  ],
};

/* ─── SetupWizard ────────────────────────────────────────────────────────── */

const SetupWizard = () => {
  const navigate = useNavigate();

  // Step state
  const [step, setStep] = useState('loading');

  // Fresh install form
  const [freshForm, setFreshForm] = useState({ companyName: '', name: '', email: '', password: '' });
  const [freshError, setFreshError] = useState('');
  const [freshSubmitting, setFreshSubmitting] = useState(false);

  // Restore state
  const [provider, setProvider] = useState('');
  const [credentials, setCredentials] = useState({});
  const [testResult, setTestResult] = useState(null); // { ok, message }
  const [testPending, setTestPending] = useState(false);
  const [backups, setBackups] = useState([]);
  const [backupsLoading, setBackupsLoading] = useState(false);
  const [backupsError, setBackupsError] = useState('');
  const [selectedBackup, setSelectedBackup] = useState(null);
  const [restoreError, setRestoreError] = useState('');
  const [restorePending, setRestorePending] = useState(false);

  /* ── Initial setup check ── */
  useEffect(() => {
    let cancelled = false;
    fetch('/api/setup')
      .then(r => r.json())
      .then(json => {
        if (cancelled) return;
        if (json.data?.complete === true) {
          navigate('/', { replace: true });
        } else {
          setStep('welcome');
        }
      })
      .catch(() => {
        if (!cancelled) setStep('welcome');
      });
    return () => { cancelled = true; };
  }, [navigate]);

  /* ── Fresh install submit ── */
  const handleFreshSubmit = async (e) => {
    e.preventDefault();
    setFreshError('');
    setFreshSubmitting(true);
    try {
      const res = await fetch('/api/setup/fresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(freshForm),
      });
      const data = await res.json();
      if (!res.ok) {
        setFreshError(data.message || data.error || 'Setup failed. Please try again.');
      } else {
        setStep('complete');
      }
    } catch (err) {
      setFreshError(err.message || 'Network error. Please try again.');
    } finally {
      setFreshSubmitting(false);
    }
  };

  /* ── Test connection ── */
  const handleTestConnection = async () => {
    setTestResult(null);
    setTestPending(true);
    try {
      const res = await fetch('/api/setup/restore/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, ...credentials }),
      });
      const json = await res.json();
      const result = json.data || json;
      if (res.ok && result.success !== false) {
        setTestResult({ ok: true, message: result.message || 'Connection successful' });
      } else {
        setTestResult({ ok: false, message: result.message || json.error || 'Connection failed' });
      }
    } catch (err) {
      setTestResult({ ok: false, message: err.message || 'Connection failed' });
    } finally {
      setTestPending(false);
    }
  };

  /* ── List backups ── */
  const fetchBackups = async () => {
    setBackupsLoading(true);
    setBackupsError('');
    try {
      const res = await fetch('/api/setup/restore/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, ...credentials }),
      });
      const json = await res.json();
      if (!res.ok) {
        setBackupsError(json.message || json.error || 'Failed to list backups');
      } else {
        const items = json.data || json;
        setBackups(Array.isArray(items) ? items : []);
      }
    } catch (err) {
      setBackupsError(err.message || 'Failed to list backups');
    } finally {
      setBackupsLoading(false);
    }
  };

  /* ── Execute restore ── */
  const handleRestore = async () => {
    setRestoreError('');
    setRestorePending(true);
    setStep('progress');
    try {
      const res = await fetch('/api/setup/restore/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          backupKey: selectedBackup.key,
          ...credentials,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRestoreError(data.message || data.error || 'Restore failed');
        // Stay on progress step — user can retry
      } else {
        setStep('complete');
      }
    } catch (err) {
      setRestoreError(err.message || 'Restore failed. Please try again.');
    } finally {
      setRestorePending(false);
    }
  };

  /* ── Update a credential field ── */
  const updateCredential = (key, value) => {
    setCredentials(prev => ({ ...prev, [key]: value }));
    setTestResult(null);
  };

  /* ── Google Drive OAuth link (setup mode) ── */
  const handleLinkGoogleSetup = async () => {
    try {
      const res = await fetch('/api/backup/gdrive/authorize-setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: credentials.clientId,
          clientSecret: credentials.clientSecret,
        }),
      });
      const json = await res.json();
      const url = json.data?.url;
      if (!url) {
        setTestResult({ ok: false, message: json.error || 'Failed to start OAuth' });
        return;
      }
      window.open(url, 'gdrive-auth', 'popup,width=500,height=650');
    } catch (err) {
      setTestResult({ ok: false, message: err.message || 'Failed to start OAuth' });
    }
  };

  const handleUnlinkGoogleSetup = () => {
    setCredentials(prev => {
      const next = { ...prev };
      delete next.refreshToken;
      delete next.email;
      return next;
    });
    setTestResult(null);
  };

  // Listen for OAuth popup result via localStorage
  useEffect(() => {
    const handler = (e) => {
      if (e.key !== 'gdrive-auth-result' || !e.newValue) return;
      try {
        const data = JSON.parse(e.newValue);
        if (data.type === 'gdrive-linked') {
          setCredentials(prev => ({
            ...prev,
            refreshToken: data.refreshToken,
            email: data.email,
          }));
          setTestResult(null);
        }
        if (data.type === 'gdrive-error') {
          setTestResult({ ok: false, message: data.message });
        }
      } catch { /* ignore */ }
      localStorage.removeItem('gdrive-auth-result');
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  /* ── Render helpers ── */

  const renderBackButton = (targetStep) => (
    <button
      type="button"
      onClick={() => setStep(targetStep)}
      className="glass-button-secondary inline-flex items-center gap-1.5 text-sm"
    >
      <ArrowLeft className="w-4 h-4" />
      Back
    </button>
  );

  const renderError = (message) => (
    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mt-4">
      {message}
    </div>
  );

  /* ─── Loading ──────────────────────────────────────────────────────────── */

  if (step === 'loading') {
    return (
      <div className="min-h-screen bg-surface-50 flex items-center justify-center">
        <div className="glass-card p-8 max-w-md w-full mx-4 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-surface-400 mx-auto" />
          <p className="text-sm text-surface-500 mt-3">Checking setup status...</p>
        </div>
      </div>
    );
  }

  /* ─── Welcome ──────────────────────────────────────────────────────────── */

  if (step === 'welcome') {
    return (
      <div className="min-h-screen bg-surface-50 flex items-center justify-center">
        <div className="glass-card p-8 max-w-md w-full mx-4">
          <h1 className="text-xl font-semibold text-surface-800 text-center mb-2">Welcome</h1>
          <p className="text-sm text-surface-500 text-center mb-6">
            Choose how you would like to set up your application.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Fresh Install */}
            <button
              type="button"
              onClick={() => setStep('fresh-form')}
              className="flex flex-col items-center gap-2 rounded-lg border border-surface-200 bg-white px-4 py-6 text-center transition-colors hover:bg-surface-100 cursor-pointer"
            >
              <div className="bg-surface-100 rounded-xl p-2.5">
                <Sparkles className="w-5 h-5 text-surface-400" />
              </div>
              <span className="text-sm font-medium text-surface-700">Fresh Install</span>
              <span className="text-xs text-surface-500">Start with a clean slate</span>
            </button>

            {/* Restore from Backup */}
            <button
              type="button"
              onClick={() => setStep('provider')}
              className="flex flex-col items-center gap-2 rounded-lg border border-surface-200 bg-white px-4 py-6 text-center transition-colors hover:bg-surface-100 cursor-pointer"
            >
              <div className="bg-surface-100 rounded-xl p-2.5">
                <HardDrive className="w-5 h-5 text-surface-400" />
              </div>
              <span className="text-sm font-medium text-surface-700">Restore from Backup</span>
              <span className="text-xs text-surface-500">Restore from a cloud backup</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ─── Fresh Install Form ───────────────────────────────────────────────── */

  if (step === 'fresh-form') {
    return (
      <div className="min-h-screen bg-surface-50 flex items-center justify-center">
        <div className="glass-card p-8 max-w-md w-full mx-4">
          <h1 className="text-xl font-semibold text-surface-800 mb-1">Fresh Install</h1>
          <p className="text-sm text-surface-500 mb-6">
            Set up your company and create your admin account.
          </p>

          <form onSubmit={handleFreshSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">Company Name</label>
              <input
                type="text"
                required
                value={freshForm.companyName}
                onChange={(e) => setFreshForm(f => ({ ...f, companyName: e.target.value }))}
                className="glass-input w-full"
                placeholder="Acme Corp"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">Your Name</label>
              <input
                type="text"
                required
                value={freshForm.name}
                onChange={(e) => setFreshForm(f => ({ ...f, name: e.target.value }))}
                className="glass-input w-full"
                placeholder="John Doe"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">Email</label>
              <input
                type="email"
                required
                value={freshForm.email}
                onChange={(e) => setFreshForm(f => ({ ...f, email: e.target.value }))}
                className="glass-input w-full"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">Password</label>
              <input
                type="password"
                required
                value={freshForm.password}
                onChange={(e) => setFreshForm(f => ({ ...f, password: e.target.value }))}
                className="glass-input w-full"
                placeholder="Choose a strong password"
              />
            </div>

            {freshError && renderError(freshError)}

            <div className="flex items-center gap-3 pt-2">
              {renderBackButton('welcome')}
              <button
                type="submit"
                disabled={freshSubmitting}
                className="glass-button flex-1 inline-flex items-center justify-center gap-2"
              >
                {freshSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {freshSubmitting ? 'Setting up...' : 'Complete Setup'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  /* ─── Provider Selection ───────────────────────────────────────────────── */

  if (step === 'provider') {
    return (
      <div className="min-h-screen bg-surface-50 flex items-center justify-center">
        <div className="glass-card p-8 max-w-md w-full mx-4">
          <h1 className="text-xl font-semibold text-surface-800 mb-1">Choose Storage Provider</h1>
          <p className="text-sm text-surface-500 mb-6">
            Select where your backup is stored.
          </p>

          <div className="space-y-2">
            {PROVIDERS.map((p) => {
              const Icon = p.icon;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setProvider(p.id);
                    // Initialize default values for credential fields
                    const defaults = {};
                    (CREDENTIAL_FIELDS[p.id] || []).forEach((field) => {
                      if (field.defaultValue) defaults[field.key] = field.defaultValue;
                    });
                    setCredentials(defaults);
                    setTestResult(null);
                    setStep('credentials');
                  }}
                  className="w-full flex items-center gap-3 rounded-lg border border-surface-200 bg-white px-4 py-4 text-left transition-colors hover:bg-surface-100 cursor-pointer"
                >
                  <div className="bg-surface-100 rounded-xl p-2.5">
                    <Icon className="w-5 h-5 text-surface-400" />
                  </div>
                  <div>
                    <span className="text-sm font-medium text-surface-700 block">{p.label}</span>
                    <span className="text-xs text-surface-500">{p.description}</span>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-6">
            {renderBackButton('welcome')}
          </div>
        </div>
      </div>
    );
  }

  /* ─── Credentials ──────────────────────────────────────────────────────── */

  if (step === 'credentials') {
    const fields = CREDENTIAL_FIELDS[provider] || [];
    const connectionTested = testResult?.ok === true;

    return (
      <div className="min-h-screen bg-surface-50 flex items-center justify-center">
        <div className="glass-card p-8 max-w-md w-full mx-4">
          <h1 className="text-xl font-semibold text-surface-800 mb-1">
            {PROVIDERS.find(p => p.id === provider)?.label} Credentials
          </h1>
          <p className="text-sm text-surface-500 mb-6">
            Enter your storage credentials to access your backups.
          </p>

          <div className="space-y-4">
            {provider === 'gdrive' ? (
              <>
                {/* Client ID */}
                <div>
                  <label className="block text-sm font-medium text-surface-700 mb-1">Google Client ID</label>
                  <input
                    type="text"
                    value={credentials.clientId || ''}
                    onChange={(e) => updateCredential('clientId', e.target.value)}
                    className="glass-input w-full"
                    placeholder="123456789.apps.googleusercontent.com"
                  />
                </div>
                {/* Client Secret */}
                <div>
                  <label className="block text-sm font-medium text-surface-700 mb-1">Google Client Secret</label>
                  <input
                    type="password"
                    value={credentials.clientSecret || ''}
                    onChange={(e) => updateCredential('clientSecret', e.target.value)}
                    className="glass-input w-full"
                    placeholder="GOCSPX-..."
                  />
                </div>

                {/* OAuth Link Section */}
                {credentials.refreshToken ? (
                  <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
                    <div className="flex items-center gap-2 text-sm text-emerald-700">
                      <CheckCircle className="w-4 h-4" />
                      <span>Linked{credentials.email ? ` as ${credentials.email}` : ''}</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleUnlinkGoogleSetup}
                      className="text-xs text-surface-500 hover:text-red-600 inline-flex items-center gap-1 transition-colors"
                    >
                      <Unlink className="w-3.5 h-3.5" />
                      Unlink
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleLinkGoogleSetup}
                    disabled={!credentials.clientId || !credentials.clientSecret}
                    className="glass-button-secondary w-full inline-flex items-center justify-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Link2 className="w-4 h-4" />
                    Link Google Account
                  </button>
                )}

                {/* Folder ID */}
                <div>
                  <label className="block text-sm font-medium text-surface-700 mb-1">Folder ID</label>
                  <input
                    type="text"
                    value={credentials.folderId || ''}
                    onChange={(e) => updateCredential('folderId', e.target.value)}
                    className="glass-input w-full"
                    placeholder="1AbC-dEfGhIjKlMnOpQrStUvWxYz"
                  />
                  <p className="text-xs text-surface-400 mt-1">
                    From the Google Drive folder URL: drive.google.com/drive/folders/<strong>THIS_PART</strong>
                  </p>
                </div>
              </>
            ) : (
              fields.map((field) => (
                <div key={field.key}>
                  <label className="block text-sm font-medium text-surface-700 mb-1">
                    {field.label}
                    {field.optional && <span className="text-surface-400 font-normal"> (optional)</span>}
                  </label>
                  {field.type === 'textarea' ? (
                    <textarea
                      value={credentials[field.key] || ''}
                      onChange={(e) => updateCredential(field.key, e.target.value)}
                      className="glass-input w-full font-mono text-xs"
                      rows={6}
                      placeholder={field.placeholder}
                    />
                  ) : (
                    <input
                      type={field.type}
                      value={credentials[field.key] || ''}
                      onChange={(e) => updateCredential(field.key, e.target.value)}
                      className="glass-input w-full"
                      placeholder={field.placeholder}
                    />
                  )}
                </div>
              ))
            )}
          </div>

          {/* Test Connection */}
          <div className="mt-5">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={testPending || (provider === 'gdrive' && (!credentials.refreshToken || !credentials.folderId))}
              className="glass-button-secondary inline-flex items-center gap-1.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {testPending
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Testing...</>
                : 'Test Connection'
              }
            </button>

            {testResult && (
              <div className={`flex items-center gap-1.5 text-sm font-medium mt-3 ${testResult.ok ? 'text-emerald-600' : 'text-red-600'}`}>
                {testResult.ok
                  ? <CheckCircle className="w-4 h-4" />
                  : <AlertTriangle className="w-4 h-4" />
                }
                {testResult.message}
              </div>
            )}
          </div>

          {/* Navigation */}
          <div className="flex items-center gap-3 mt-6">
            {renderBackButton('provider')}
            <button
              type="button"
              disabled={!connectionTested}
              onClick={() => {
                setSelectedBackup(null);
                setStep('list');
                fetchBackups();
              }}
              className="glass-button flex-1 inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ─── Backup List ──────────────────────────────────────────────────────── */

  if (step === 'list') {
    return (
      <div className="min-h-screen bg-surface-50 flex items-center justify-center">
        <div className="glass-card p-8 max-w-md w-full mx-4">
          <h1 className="text-xl font-semibold text-surface-800 mb-1">Select a Backup</h1>
          <p className="text-sm text-surface-500 mb-6">
            Choose which backup to restore.
          </p>

          {backupsLoading && (
            <div className="flex flex-col items-center py-10">
              <Loader2 className="w-8 h-8 animate-spin text-surface-400" />
              <p className="text-sm text-surface-500 mt-3">Loading backups...</p>
            </div>
          )}

          {backupsError && (
            <>
              {renderError(backupsError)}
              <div className="mt-4">
                <button
                  type="button"
                  onClick={fetchBackups}
                  className="glass-button-secondary inline-flex items-center gap-1.5 text-sm"
                >
                  <RefreshCw className="w-4 h-4" />
                  Retry
                </button>
              </div>
            </>
          )}

          {!backupsLoading && !backupsError && backups.length === 0 && (
            <div className="text-center py-10">
              <div className="bg-surface-100 rounded-xl p-3 inline-block mb-3">
                <HardDrive className="w-6 h-6 text-surface-400" />
              </div>
              <p className="text-sm text-surface-500">No backups found</p>
              <p className="text-xs text-surface-400 mt-1">
                No backup files were found in the selected storage location.
              </p>
            </div>
          )}

          {!backupsLoading && !backupsError && backups.length > 0 && (
            <div className="space-y-2 max-h-[320px] overflow-y-auto">
              {backups.map((backup, idx) => {
                const isSelected = selectedBackup?.key === backup.key;
                return (
                  <button
                    key={backup.key || idx}
                    type="button"
                    onClick={() => setSelectedBackup(backup)}
                    className={`w-full text-left rounded-lg border px-4 py-3 transition-colors cursor-pointer ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-200'
                        : 'border-surface-200 bg-white hover:bg-surface-100'
                    }`}
                  >
                    <div className="text-sm font-medium text-surface-700 truncate">
                      {backup.key || backup.name || `Backup ${idx + 1}`}
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      {backup.lastModified && (
                        <span className="text-xs text-surface-500">{formatDate(backup.lastModified)}</span>
                      )}
                      {backup.size != null && (
                        <span className="text-xs text-surface-400">{formatSize(backup.size)}</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center gap-3 mt-6">
            {renderBackButton('credentials')}
            <button
              type="button"
              disabled={!selectedBackup}
              onClick={() => setStep('confirm')}
              className="glass-button flex-1 inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Restore
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ─── Confirm ──────────────────────────────────────────────────────────── */

  if (step === 'confirm') {
    return (
      <div className="min-h-screen bg-surface-50 flex items-center justify-center">
        <div className="glass-card p-8 max-w-md w-full mx-4">
          <h1 className="text-xl font-semibold text-surface-800 mb-4">Confirm Restore</h1>

          {/* Warning */}
          <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg text-sm mb-5">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">This action cannot be undone</p>
                <p className="mt-1 text-amber-700">
                  This will restore the database and uploaded files from the selected backup. The current database will be overwritten.
                </p>
              </div>
            </div>
          </div>

          {/* Selected backup info */}
          {selectedBackup && (
            <div className="rounded-lg border border-surface-200 bg-surface-50 px-4 py-3 mb-5">
              <div className="text-sm font-medium text-surface-700 truncate">
                {selectedBackup.key || selectedBackup.name}
              </div>
              <div className="flex items-center gap-3 mt-1">
                {selectedBackup.lastModified && (
                  <span className="text-xs text-surface-500">{formatDate(selectedBackup.lastModified)}</span>
                )}
                {selectedBackup.size != null && (
                  <span className="text-xs text-surface-400">{formatSize(selectedBackup.size)}</span>
                )}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setStep('list')}
              className="glass-button-secondary inline-flex items-center gap-1.5 text-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleRestore}
              className="glass-button flex-1 inline-flex items-center justify-center gap-2"
            >
              Confirm Restore
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ─── Progress ─────────────────────────────────────────────────────────── */

  if (step === 'progress') {
    return (
      <div className="min-h-screen bg-surface-50 flex items-center justify-center">
        <div className="glass-card p-8 max-w-md w-full mx-4 text-center">
          {restoreError ? (
            <>
              <div className="bg-red-50 rounded-full w-12 h-12 flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-6 h-6 text-red-500" />
              </div>
              <h1 className="text-xl font-semibold text-surface-800 mb-2">Restore Failed</h1>
              <p className="text-sm text-red-600 mb-6">{restoreError}</p>
              <button
                type="button"
                onClick={() => {
                  setRestoreError('');
                  handleRestore();
                }}
                disabled={restorePending}
                className="glass-button inline-flex items-center gap-2"
              >
                {restorePending
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Retrying...</>
                  : <><RefreshCw className="w-4 h-4" /> Retry</>
                }
              </button>
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => setStep('confirm')}
                  className="text-sm text-surface-500 hover:text-surface-700 transition-colors"
                >
                  Go back
                </button>
              </div>
            </>
          ) : (
            <>
              <Loader2 className="w-10 h-10 animate-spin text-surface-400 mx-auto mb-4" />
              <h1 className="text-xl font-semibold text-surface-800 mb-2">Restoring...</h1>
              <p className="text-sm text-surface-500">
                This may take a few minutes. Please do not close this page.
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  /* ─── Complete ─────────────────────────────────────────────────────────── */

  if (step === 'complete') {
    return (
      <div className="min-h-screen bg-surface-50 flex items-center justify-center">
        <div className="glass-card p-8 max-w-md w-full mx-4 text-center">
          <div className="bg-emerald-50 rounded-full w-12 h-12 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-6 h-6 text-emerald-500" />
          </div>
          <h1 className="text-xl font-semibold text-surface-800 mb-2">Setup Complete!</h1>
          <p className="text-sm text-surface-500 mb-6">Your app is ready to use.</p>
          <button
            type="button"
            onClick={() => navigate('/', { replace: true })}
            className="glass-button inline-flex items-center justify-center gap-2"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  /* ─── Fallback ─────────────────────────────────────────────────────────── */
  return null;
};

export default SetupWizard;
