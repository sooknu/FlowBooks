import { useState, useEffect, useMemo, Fragment } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/apiClient';
import { toast } from '@/components/ui/use-toast';
import StickySettingsBar from '@/components/ui/StickySettingsBar';
import PasswordInput from '@/components/ui/PasswordInput';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  HardDrive, Trash2, CheckCircle, XCircle, Loader2, Clock, Wifi, Play,
  Plus, Pencil, Pause, Cloud, AlertTriangle, X, Link2, Unlink,
} from 'lucide-react';

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

/* ─── Constants ──────────────────────────────────────────────────────────── */

const PROVIDERS = [
  { id: 's3', label: 'AWS S3', description: 'Amazon S3 or compatible' },
  { id: 'b2', label: 'Backblaze B2', description: 'B2 Cloud Storage' },
  { id: 'gdrive', label: 'Google Drive', description: 'Link your account' },
];

const PROVIDER_LABELS = { s3: 'S3', b2: 'B2', gdrive: 'GDrive' };

const SCHEDULES = [
  { value: 'manual', label: 'Manual only' },
  { value: 'daily', label: 'Daily (2:00 AM)' },
  { value: 'weekly', label: 'Weekly (Sunday 2:00 AM)' },
];

/* ─── Status badge ───────────────────────────────────────────────────────── */

const STATUS_STYLES = {
  pending:   'bg-amber-50 text-amber-600 ring-1 ring-amber-200',
  running:   'bg-blue-50 text-blue-600 ring-1 ring-blue-200 animate-pulse',
  completed: 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200',
  partial:   'bg-amber-50 text-amber-600 ring-1 ring-amber-200',
  failed:    'bg-red-50 text-red-600 ring-1 ring-red-200',
};

const STATUS_ICONS = {
  completed: CheckCircle,
  failed: XCircle,
  running: Loader2,
  pending: Clock,
  partial: AlertTriangle,
  uploading: Loader2,
};

const StatusBadge = ({ status }) => {
  const Icon = STATUS_ICONS[status] || Clock;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLES[status] || STATUS_STYLES.pending}`}>
      <Icon className={`w-3 h-3 ${status === 'running' || status === 'uploading' ? 'animate-spin' : ''}`} />
      {status}
    </span>
  );
};

/* ─── Provider badge (small pill) ───────────────────────────────────────── */

const PROVIDER_PILL_STYLES = {
  s3: 'bg-orange-50 text-orange-600 ring-1 ring-orange-200',
  b2: 'bg-red-50 text-red-600 ring-1 ring-red-200',
  gdrive: 'bg-blue-50 text-blue-600 ring-1 ring-blue-200',
};

const ProviderBadge = ({ provider }) => (
  <span className={`inline-flex text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${PROVIDER_PILL_STYLES[provider] || 'bg-surface-100 text-surface-500'}`}>
    {PROVIDER_LABELS[provider] || provider}
  </span>
);

/* ─── Upload status mini pills (for history) ───────────────────────────── */

const UPLOAD_PILL_STYLES = {
  completed: 'bg-emerald-50 text-emerald-600',
  failed: 'bg-red-50 text-red-600',
  uploading: 'bg-blue-50 text-blue-600',
  pending: 'bg-surface-100 text-surface-500',
};

const UploadPill = ({ upload }) => {
  const destName = upload.destination?.name || 'Unknown';
  const Icon = STATUS_ICONS[upload.status] || Clock;
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded ${UPLOAD_PILL_STYLES[upload.status] || UPLOAD_PILL_STYLES.pending}`}
      title={upload.status === 'failed' ? `${destName}: ${upload.errorMessage}` : destName}
    >
      <Icon className={`w-2.5 h-2.5 ${upload.status === 'uploading' ? 'animate-spin' : ''}`} />
      {destName}
    </span>
  );
};

/* ─── Destination Dialog ─────────────────────────────────────────────────── */

const EMPTY_CREDS = {
  s3: { accessKeyId: '', secretAccessKey: '', bucket: '', region: 'us-east-1', endpoint: '' },
  b2: { keyId: '', appKey: '', bucket: '', endpoint: '' },
  gdrive: { folderId: '' },
};

function DestinationDialog({ dest, onClose }) {
  const queryClient = useQueryClient();
  const isEdit = !!dest;

  const [name, setName] = useState(dest?.name || '');
  const [provider, setProvider] = useState(dest?.provider || 's3');
  const [credentials, setCredentials] = useState(dest?.credentials || { ...EMPTY_CREDS.s3 });
  const [isActive, setIsActive] = useState(dest?.isActive !== false);
  const [testResult, setTestResult] = useState(null);

  // Reset credentials when provider changes (only for new destinations)
  const handleProviderChange = (p) => {
    setProvider(p);
    if (!isEdit) {
      setCredentials({ ...EMPTY_CREDS[p] });
    }
    setTestResult(null);
  };

  const setCred = (key, value) => {
    setCredentials((prev) => ({ ...prev, [key]: value }));
  };

  // Listen for Google Drive OAuth popup result via localStorage
  useEffect(() => {
    const handler = (e) => {
      if (e.key !== 'gdrive-auth-result' || !e.newValue) return;
      try {
        const data = JSON.parse(e.newValue);
        if (data.type === 'gdrive-linked') {
          setCredentials((prev) => ({
            ...prev,
            refreshToken: data.refreshToken,
            email: data.email,
          }));
          toast({ title: `Linked as ${data.email}` });
        }
        if (data.type === 'gdrive-error') {
          toast({ title: 'Google Drive link failed', description: data.message, variant: 'destructive' });
        }
      } catch { /* ignore parse errors */ }
      localStorage.removeItem('gdrive-auth-result');
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  const handleLinkGoogle = () => {
    window.open(
      '/api/backup/gdrive/authorize',
      'gdrive-auth',
      'popup,width=500,height=650'
    );
  };

  const handleUnlinkGoogle = () => {
    setCredentials((prev) => {
      const next = { ...prev };
      delete next.refreshToken;
      delete next.email;
      return next;
    });
  };

  // Save
  const saveMutation = useMutation({
    mutationFn: (body) =>
      isEdit
        ? api.put(`/backup/destinations/${dest.id}`, body)
        : api.post('/backup/destinations', body),
    onSuccess: () => {
      toast({ title: isEdit ? 'Destination updated' : 'Destination created' });
      queryClient.invalidateQueries({ queryKey: ['backup', 'config'] });
      onClose();
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const handleSave = () => {
    if (!name.trim()) {
      toast({ title: 'Name is required', variant: 'destructive' });
      return;
    }
    saveMutation.mutate({ name: name.trim(), provider, credentials, isActive });
  };

  // Test connection
  const testMutation = useMutation({
    mutationFn: () => {
      if (isEdit) {
        // For saved destinations, test via the ID endpoint (has real creds in DB)
        return api.post(`/backup/destinations/${dest.id}/test`);
      }
      // For unsaved destinations, send raw credentials
      return api.post('/backup/destinations/test-unsaved', { provider, credentials });
    },
    onSuccess: (res) => {
      const result = res.data || {};
      setTestResult({ ok: result.success, message: result.message || (result.success ? 'Connected' : 'Failed') });
    },
    onError: (error) => {
      setTestResult({ ok: false, message: error.message });
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30" onClick={onClose} />

      {/* Dialog */}
      <div className="relative w-full sm:max-w-lg bg-[rgb(var(--glass-bg))] rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-3.5 border-b border-surface-100 bg-[rgb(var(--glass-bg))] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <h3 className="text-base font-semibold text-surface-800">
            {isEdit ? 'Edit Destination' : 'Add Destination'}
          </h3>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-surface-400 hover:text-surface-600 hover:bg-surface-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="glass-input w-full"
              placeholder="e.g. Primary S3, Offsite B2"
            />
          </div>

          {/* Provider */}
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-2">Provider</label>
            <div className="grid grid-cols-3 gap-2">
              {PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleProviderChange(p.id)}
                  className={`flex flex-col items-center gap-0.5 rounded-lg border px-3 py-2.5 text-center transition-all ${
                    provider === p.id
                      ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-200'
                      : 'border-surface-200 bg-[rgb(var(--glass-bg))] hover:border-surface-300 hover:bg-surface-50'
                  }`}
                >
                  <span className={`text-sm font-medium ${provider === p.id ? 'text-blue-700' : 'text-surface-700'}`}>{p.label}</span>
                  <span className={`text-[10px] ${provider === p.id ? 'text-blue-500' : 'text-surface-400'}`}>{p.description}</span>
                </button>
              ))}
            </div>
          </div>

          {/* S3 credentials */}
          {provider === 's3' && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-surface-700 mb-1">Access Key ID</label>
                  <input type="text" value={credentials.accessKeyId || ''} onChange={(e) => setCred('accessKeyId', e.target.value)} className="glass-input w-full" placeholder="AKIAIOSFODNN7EXAMPLE" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-surface-700 mb-1">Secret Access Key</label>
                  <PasswordInput value={credentials.secretAccessKey || ''} onChange={(e) => setCred('secretAccessKey', e.target.value)} className="glass-input w-full pr-9" placeholder="wJalrXUtnFEMI/K7MDENG/..." />
                </div>
                <div>
                  <label className="block text-sm font-medium text-surface-700 mb-1">Bucket</label>
                  <input type="text" value={credentials.bucket || ''} onChange={(e) => setCred('bucket', e.target.value)} className="glass-input w-full" placeholder="my-backups" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-surface-700 mb-1">Region</label>
                  <input type="text" value={credentials.region || ''} onChange={(e) => setCred('region', e.target.value)} className="glass-input w-full" placeholder="us-east-1" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1">Endpoint <span className="text-surface-400 font-normal">(optional)</span></label>
                <input type="text" value={credentials.endpoint || ''} onChange={(e) => setCred('endpoint', e.target.value)} className="glass-input w-full" placeholder="https://s3.example.com" />
              </div>
            </div>
          )}

          {/* B2 credentials */}
          {provider === 'b2' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1">Key ID</label>
                <input type="text" value={credentials.keyId || ''} onChange={(e) => setCred('keyId', e.target.value)} className="glass-input w-full" placeholder="0012345678abcdef..." />
              </div>
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1">Application Key</label>
                <PasswordInput value={credentials.appKey || ''} onChange={(e) => setCred('appKey', e.target.value)} className="glass-input w-full pr-9" placeholder="K001..." />
              </div>
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1">Bucket</label>
                <input type="text" value={credentials.bucket || ''} onChange={(e) => setCred('bucket', e.target.value)} className="glass-input w-full" placeholder="my-backups" />
              </div>
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1">Endpoint</label>
                <input type="text" value={credentials.endpoint || ''} onChange={(e) => setCred('endpoint', e.target.value)} className="glass-input w-full" placeholder="https://s3.us-west-004.backblazeb2.com" />
              </div>
            </div>
          )}

          {/* Google Drive credentials */}
          {provider === 'gdrive' && (
            <div className="space-y-3">
              {/* Setup instructions */}
              <div className="px-3 py-2.5 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-700 space-y-1">
                <p className="font-medium">Google Cloud Console setup required:</p>
                <ol className="list-decimal list-inside space-y-0.5 text-blue-600">
                  <li>Enable the <strong>Google Drive API</strong> in your GCP project</li>
                  <li>Add <strong>{window.location.origin}/api/backup/gdrive/callback</strong> as an Authorized redirect URI in your OAuth credentials</li>
                  <li>Create a folder in Google Drive for backups and copy its ID</li>
                </ol>
              </div>

              {/* OAuth link status */}
              {credentials.refreshToken ? (
                <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-emerald-50 border border-emerald-200">
                  <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-emerald-700">Linked</span>
                    {credentials.email && (
                      <span className="text-sm text-emerald-600 ml-1.5">as {credentials.email}</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleUnlinkGoogle}
                    className="flex items-center gap-1 text-xs font-medium text-surface-500 hover:text-red-500 transition-colors"
                  >
                    <Unlink className="w-3.5 h-3.5" /> Unlink
                  </button>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-surface-700 mb-2">Google Account</label>
                  <button
                    type="button"
                    onClick={handleLinkGoogle}
                    className="action-btn action-btn--secondary"
                  >
                    <Link2 className="w-4 h-4 mr-1.5" /> Link Google Account
                  </button>
                  <p className="text-xs text-surface-500 mt-1.5">
                    Sign in with any Google account to store backups in its Drive. Does not need to be the same account you log in with.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1">Folder ID</label>
                <input type="text" value={credentials.folderId || ''} onChange={(e) => setCred('folderId', e.target.value)} className="glass-input w-full" placeholder="1AbC-dEfGhIjKlMnOpQrStUvWxYz" />
                <p className="text-xs text-surface-500 mt-1">
                  Open your backup folder in Google Drive — the Folder ID is the last part of the URL after <strong>/folders/</strong>
                </p>
              </div>
            </div>
          )}

          {/* Active toggle */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="w-4 h-4 rounded border-surface-300 text-blue-500 focus:ring-blue-500"
            />
            <span className="text-sm text-surface-700">Active (include in backup runs)</span>
          </label>

          {/* Test connection */}
          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={() => { setTestResult(null); testMutation.mutate(); }}
              disabled={testMutation.isPending}
              className="action-btn action-btn--secondary whitespace-nowrap"
            >
              {testMutation.isPending
                ? <><Loader2 className="w-4 h-4 animate-spin mr-1.5" /> Testing...</>
                : <><Wifi className="w-4 h-4 mr-1.5" /> Test Connection</>
              }
            </button>
            {testResult && (
              <span className={`flex items-center gap-1.5 text-sm font-medium ${testResult.ok ? 'text-emerald-600' : 'text-red-600'}`}>
                {testResult.ok ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                {testResult.message}
              </span>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 z-10 flex items-center justify-end gap-2 px-5 py-3.5 border-t border-surface-100 bg-[rgb(var(--glass-bg))] shadow-[0_-1px_3px_rgba(0,0,0,0.04)]">
          <button type="button" onClick={onClose} className="glass-button-secondary px-4 py-2">Cancel</button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="glass-button px-4 py-2"
          >
            {saveMutation.isPending
              ? <><Loader2 className="w-4 h-4 animate-spin mr-1.5" /> Saving...</>
              : isEdit ? 'Save Changes' : 'Add Destination'
            }
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── BackupManager ──────────────────────────────────────────────────────── */

const BackupManager = () => {
  const queryClient = useQueryClient();

  /* ── Config + destinations query ── */
  const { data: configData, isLoading: configLoading } = useQuery({
    queryKey: ['backup', 'config'],
    queryFn: () => api.get('/backup').then(r => r.data || {}),
  });

  const destinations = configData?.destinations || [];
  const globalSettings = configData?.settings || {};

  /* ── History query (polls every 10s) ── */
  const { data: history = [] } = useQuery({
    queryKey: ['backup', 'history'],
    queryFn: () => api.get('/backup/history').then(r => r.data || []),
    refetchInterval: 10000,
  });

  /* ── Global settings form state ── */
  const [schedule, setSchedule] = useState('manual');
  const [retentionDays, setRetentionDays] = useState('30');

  useEffect(() => {
    if (!globalSettings) return;
    setSchedule(globalSettings.backup_schedule || 'manual');
    setRetentionDays(globalSettings.backup_retention_days || '30');
  }, [globalSettings]);

  const isDirty = useMemo(() => {
    if (!globalSettings) return false;
    return schedule !== (globalSettings.backup_schedule || 'manual') ||
      retentionDays !== (globalSettings.backup_retention_days || '30');
  }, [schedule, retentionDays, globalSettings]);

  /* ── Save global settings ── */
  const saveMutation = useMutation({
    mutationFn: (settings) => api.put('/backup', { settings }),
    onSuccess: () => {
      toast({ title: 'Backup settings saved!' });
      queryClient.invalidateQueries({ queryKey: ['backup', 'config'] });
    },
    onError: (error) => {
      toast({ title: 'Error saving settings', description: error.message, variant: 'destructive' });
    },
  });

  const handleSave = () => {
    saveMutation.mutate([
      { key: 'backup_schedule', value: schedule },
      { key: 'backup_retention_days', value: retentionDays },
    ]);
  };

  /* ── Destination dialog state ── */
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDest, setEditingDest] = useState(null);

  /* ── Toggle destination active/paused ── */
  const toggleMutation = useMutation({
    mutationFn: (id) => api.put(`/backup/destinations/${id}/toggle`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['backup', 'config'] }),
  });

  /* ── Delete destination ── */
  const deleteDestMutation = useMutation({
    mutationFn: (id) => api.delete(`/backup/destinations/${id}`),
    onSuccess: () => {
      toast({ title: 'Destination deleted' });
      queryClient.invalidateQueries({ queryKey: ['backup', 'config'] });
    },
  });

  /* ── Backup now ── */
  const backupNowMutation = useMutation({
    mutationFn: () => api.post('/backup/create'),
    onSuccess: () => {
      toast({ title: 'Backup started' });
      queryClient.invalidateQueries({ queryKey: ['backup', 'history'] });
    },
    onError: (error) => {
      toast({ title: 'Failed to start backup', description: error.message, variant: 'destructive' });
    },
  });

  /* ── Delete backup ── */
  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/backup/${id}`),
    onSuccess: () => {
      toast({ title: 'Backup deleted' });
      queryClient.invalidateQueries({ queryKey: ['backup', 'history'] });
    },
    onError: (error) => {
      toast({ title: 'Error deleting backup', description: error.message, variant: 'destructive' });
    },
  });

  /* ── Test saved destination ── */
  const [testingId, setTestingId] = useState(null);
  const [testResults, setTestResults] = useState({}); // { [destId]: { ok, message } }

  const testDestMutation = useMutation({
    mutationFn: (id) => {
      setTestingId(id);
      return api.post(`/backup/destinations/${id}/test`);
    },
    onSuccess: (res) => {
      const result = res.data || {};
      setTestResults((prev) => ({ ...prev, [testingId]: { ok: result.success, message: result.message } }));
      setTestingId(null);
    },
    onError: (error) => {
      setTestResults((prev) => ({ ...prev, [testingId]: { ok: false, message: error.message } }));
      setTestingId(null);
    },
  });

  const hasActiveDests = destinations.some((d) => d.isActive);

  /* ── Loading ── */
  if (configLoading) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="w-8 h-8 animate-spin text-surface-400" /></div>;
  }

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex items-center gap-3 mb-1">
        <div className="bg-surface-100 rounded-xl p-2.5">
          <HardDrive className="w-5 h-5 text-surface-400" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-surface-800">Backup & Restore</h2>
          <p className="text-sm text-surface-500">Configure backup destinations and schedule.</p>
        </div>
      </div>

      {/* ── Destinations ── */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-surface-700">Destinations</h3>
          <button
            type="button"
            onClick={() => { setEditingDest(null); setDialogOpen(true); }}
            className="action-btn action-btn--secondary text-xs"
          >
            <Plus className="w-3.5 h-3.5 mr-1" /> Add Destination
          </button>
        </div>

        {destinations.length === 0 ? (
          <div className="text-center py-8">
            <div className="bg-surface-100 rounded-xl p-3 inline-block mb-3">
              <Cloud className="w-6 h-6 text-surface-400" />
            </div>
            <p className="text-sm text-surface-500">No destinations configured</p>
            <p className="text-xs text-surface-400 mt-1">Add a cloud storage destination to start backing up.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {destinations.map((dest) => (
              <div
                key={dest.id}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-surface-100 hover:bg-surface-50 transition-colors"
              >
                {/* Name + badges */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-surface-800 truncate">{dest.name}</span>
                    <ProviderBadge provider={dest.provider} />
                    {!dest.isActive && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-surface-100 text-surface-500">Paused</span>
                    )}
                  </div>
                  {/* Test result inline */}
                  {testResults[dest.id] && (
                    <span className={`flex items-center gap-1 text-xs mt-1 ${testResults[dest.id].ok ? 'text-emerald-600' : 'text-red-500'}`}>
                      {testResults[dest.id].ok ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                      {testResults[dest.id].message}
                    </span>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  {/* Test */}
                  <button
                    type="button"
                    onClick={() => testDestMutation.mutate(dest.id)}
                    disabled={testingId === dest.id}
                    className="p-1.5 rounded-lg text-surface-400 hover:text-blue-500 hover:bg-blue-50 transition-colors"
                    title="Test connection"
                  >
                    {testingId === dest.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wifi className="w-3.5 h-3.5" />}
                  </button>
                  {/* Toggle */}
                  <button
                    type="button"
                    onClick={() => toggleMutation.mutate(dest.id)}
                    className="p-1.5 rounded-lg text-surface-400 hover:text-amber-500 hover:bg-amber-50 transition-colors"
                    title={dest.isActive ? 'Pause' : 'Activate'}
                  >
                    {dest.isActive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  </button>
                  {/* Edit */}
                  <button
                    type="button"
                    onClick={() => { setEditingDest(dest); setDialogOpen(true); }}
                    className="p-1.5 rounded-lg text-surface-400 hover:text-surface-600 hover:bg-surface-100 transition-colors"
                    title="Edit"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  {/* Delete */}
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button
                        type="button"
                        className="p-1.5 rounded-lg text-surface-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete "{dest.name}"?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will remove the destination. Existing backups stored there will not be deleted from cloud storage.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteDestMutation.mutate(dest.id)}>Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Schedule & Retention ── */}
      <div className="glass-card p-6 space-y-4">
        <h3 className="text-sm font-medium text-surface-700">Schedule & Retention</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">Backup Schedule</label>
            <select value={schedule} onChange={(e) => setSchedule(e.target.value)} className="glass-input w-full">
              {SCHEDULES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">Retention (days)</label>
            <input
              type="number"
              inputMode="numeric"
              value={retentionDays}
              onChange={(e) => setRetentionDays(e.target.value)}
              className="glass-input w-full"
              min="1"
              max="365"
              placeholder="30"
            />
            <p className="text-xs text-surface-500 mt-1">Backups older than this will be automatically deleted.</p>
          </div>
        </div>
      </div>

      {/* ── Actions ── */}
      <div className="glass-card p-6">
        <h3 className="text-sm font-medium text-surface-700 mb-3">Actions</h3>
        <button
          type="button"
          onClick={() => backupNowMutation.mutate()}
          disabled={!hasActiveDests || backupNowMutation.isPending || isDirty}
          className="glass-button"
        >
          {backupNowMutation.isPending
            ? <><Loader2 className="w-4 h-4 animate-spin mr-1.5" /> Creating backup...</>
            : <><Play className="w-4 h-4 mr-1.5" /> Backup Now</>
          }
        </button>
        {!hasActiveDests && (
          <p className="text-xs text-surface-500 mt-2">Add and activate at least one destination to enable backups.</p>
        )}
        {isDirty && hasActiveDests && (
          <p className="text-xs text-amber-600 mt-2">Save your settings before creating a backup.</p>
        )}
      </div>

      {/* ── Backup History ── */}
      <div className="glass-card p-6">
        <h3 className="text-sm font-medium text-surface-700 mb-4">Backup History</h3>

        {history.length === 0 ? (
          <div className="text-center py-10">
            <div className="bg-surface-100 rounded-xl p-3 inline-block mb-3">
              <HardDrive className="w-6 h-6 text-surface-400" />
            </div>
            <p className="text-sm text-surface-500">No backups yet</p>
            <p className="text-xs text-surface-400 mt-1">Create your first backup using the button above.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Desktop header */}
            <div className="hidden sm:grid grid-cols-[1fr_100px_80px_1fr_40px] gap-3 px-3 py-1.5 text-xs font-medium text-surface-500 uppercase tracking-wide">
              <span>Date</span>
              <span>Status</span>
              <span>Size</span>
              <span>Destinations</span>
              <span />
            </div>

            {history.map((backup) => (
              <div
                key={backup.id}
                className="sm:grid sm:grid-cols-[1fr_100px_80px_1fr_40px] sm:items-center gap-3 px-3 py-2.5 rounded-lg border border-surface-100 hover:bg-surface-50 transition-colors"
              >
                {/* Date */}
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-surface-400 shrink-0 hidden sm:block" />
                  <span className="text-sm text-surface-700">{formatDate(backup.createdAt)}</span>
                </div>

                {/* Status */}
                <div className="mt-1 sm:mt-0">
                  <StatusBadge status={backup.status} />
                </div>

                {/* Size */}
                <span className="text-sm text-surface-600 mt-1 sm:mt-0 block">
                  {['completed', 'partial'].includes(backup.status) ? formatBytes(backup.fileSize) : '—'}
                </span>

                {/* Destinations */}
                <div className="flex flex-wrap gap-1 mt-1 sm:mt-0">
                  {(backup.uploads && backup.uploads.length > 0)
                    ? backup.uploads.map((upload) => (
                        <UploadPill key={upload.id} upload={upload} />
                      ))
                    : <span className="text-xs text-surface-400">{backup.provider}</span>
                  }
                </div>

                {/* Delete */}
                <div className="mt-2 sm:mt-0 flex justify-end">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button
                        type="button"
                        className="p-1.5 rounded-lg text-surface-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                        title="Delete backup"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete backup?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete the backup from {formatDate(backup.createdAt)}. This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteMutation.mutate(backup.id)}>Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="pb-16" />
      <StickySettingsBar isDirty={isDirty} onSave={handleSave} isPending={saveMutation.isPending} />

      {/* ── Destination Dialog ── */}
      {dialogOpen && (
        <DestinationDialog
          dest={editingDest}
          onClose={() => { setDialogOpen(false); setEditingDest(null); }}
        />
      )}
    </div>
  );
};

export default BackupManager;
