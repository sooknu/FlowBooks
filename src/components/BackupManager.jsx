import { useState, useEffect, useMemo } from 'react';
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
  HardDrive, Trash2, Download, CheckCircle, XCircle, Loader2, Clock, Wifi, Play,
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

/* ─── Provider definitions ───────────────────────────────────────────────── */

const PROVIDERS = [
  { id: 'none', label: 'None', description: 'Backups disabled' },
  { id: 's3', label: 'AWS S3', description: 'Amazon S3 or compatible' },
  { id: 'b2', label: 'Backblaze B2', description: 'Backblaze B2 Cloud Storage' },
  { id: 'gdrive', label: 'Google Drive', description: 'Google Drive via service account' },
];

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
  failed:    'bg-red-50 text-red-600 ring-1 ring-red-200',
};

const StatusBadge = ({ status }) => (
  <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLES[status] || STATUS_STYLES.pending}`}>
    {status === 'completed' && <CheckCircle className="w-3 h-3" />}
    {status === 'failed' && <XCircle className="w-3 h-3" />}
    {status === 'running' && <Loader2 className="w-3 h-3 animate-spin" />}
    {status === 'pending' && <Clock className="w-3 h-3" />}
    {status}
  </span>
);

/* ─── BackupManager ──────────────────────────────────────────────────────── */

const BackupManager = () => {
  const queryClient = useQueryClient();

  /* ── Config query ── */
  const { data: config, isLoading: configLoading } = useQuery({
    queryKey: ['backup', 'config'],
    queryFn: () => api.get('/backup').then(r => r.data || {}),
  });

  /* ── History query (polls every 10s) ── */
  const { data: history = [] } = useQuery({
    queryKey: ['backup', 'history'],
    queryFn: () => api.get('/backup/history').then(r => r.data || []),
    refetchInterval: 10000,
  });

  /* ── Form state ── */
  const [provider, setProvider] = useState('none');

  // S3
  const [s3AccessKey, setS3AccessKey] = useState('');
  const [s3SecretKey, setS3SecretKey] = useState('');
  const [s3Bucket, setS3Bucket] = useState('');
  const [s3Region, setS3Region] = useState('');
  const [s3Endpoint, setS3Endpoint] = useState('');

  // Backblaze B2
  const [b2KeyId, setB2KeyId] = useState('');
  const [b2AppKey, setB2AppKey] = useState('');
  const [b2Bucket, setB2Bucket] = useState('');
  const [b2Endpoint, setB2Endpoint] = useState('');

  // Google Drive
  const [gdriveCredentials, setGdriveCredentials] = useState('');
  const [gdriveFolderId, setGdriveFolderId] = useState('');

  // Schedule & retention
  const [schedule, setSchedule] = useState('manual');
  const [retentionDays, setRetentionDays] = useState('30');

  /* ── Populate from server ── */
  useEffect(() => {
    if (!config) return;
    const c = config;
    setProvider(c.backup_provider || 'none');
    setS3AccessKey(c.backup_s3_access_key || '');
    setS3SecretKey(c.backup_s3_secret_key || '');
    setS3Bucket(c.backup_s3_bucket || '');
    setS3Region(c.backup_s3_region || '');
    setS3Endpoint(c.backup_s3_endpoint || '');
    setB2KeyId(c.backup_b2_key_id || '');
    setB2AppKey(c.backup_b2_app_key || '');
    setB2Bucket(c.backup_b2_bucket || '');
    setB2Endpoint(c.backup_b2_endpoint || '');
    setGdriveCredentials(c.backup_gdrive_credentials || '');
    setGdriveFolderId(c.backup_gdrive_folder_id || '');
    setSchedule(c.backup_schedule || 'manual');
    setRetentionDays(c.backup_retention_days || '30');
  }, [config]);

  /* ── isDirty ── */
  const isDirty = useMemo(() => {
    if (!config) return false;
    const c = config;
    return provider !== (c.backup_provider || 'none') ||
      s3AccessKey !== (c.backup_s3_access_key || '') ||
      s3SecretKey !== (c.backup_s3_secret_key || '') ||
      s3Bucket !== (c.backup_s3_bucket || '') ||
      s3Region !== (c.backup_s3_region || '') ||
      s3Endpoint !== (c.backup_s3_endpoint || '') ||
      b2KeyId !== (c.backup_b2_key_id || '') ||
      b2AppKey !== (c.backup_b2_app_key || '') ||
      b2Bucket !== (c.backup_b2_bucket || '') ||
      b2Endpoint !== (c.backup_b2_endpoint || '') ||
      gdriveCredentials !== (c.backup_gdrive_credentials || '') ||
      gdriveFolderId !== (c.backup_gdrive_folder_id || '') ||
      schedule !== (c.backup_schedule || 'manual') ||
      retentionDays !== (c.backup_retention_days || '30');
  }, [provider, s3AccessKey, s3SecretKey, s3Bucket, s3Region, s3Endpoint, b2KeyId, b2AppKey, b2Bucket, b2Endpoint, gdriveCredentials, gdriveFolderId, schedule, retentionDays, config]);

  /* ── Save mutation ── */
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
    const settings = [
      { key: 'backup_provider', value: provider },
      { key: 'backup_s3_access_key', value: s3AccessKey },
      { key: 'backup_s3_secret_key', value: s3SecretKey },
      { key: 'backup_s3_bucket', value: s3Bucket },
      { key: 'backup_s3_region', value: s3Region },
      { key: 'backup_s3_endpoint', value: s3Endpoint },
      { key: 'backup_b2_key_id', value: b2KeyId },
      { key: 'backup_b2_app_key', value: b2AppKey },
      { key: 'backup_b2_bucket', value: b2Bucket },
      { key: 'backup_b2_endpoint', value: b2Endpoint },
      { key: 'backup_gdrive_credentials', value: gdriveCredentials },
      { key: 'backup_gdrive_folder_id', value: gdriveFolderId },
      { key: 'backup_schedule', value: schedule },
      { key: 'backup_retention_days', value: retentionDays },
    ];
    saveMutation.mutate(settings);
  };

  /* ── Test connection ── */
  const [testResult, setTestResult] = useState(null); // { ok, message }
  const testMutation = useMutation({
    mutationFn: () => {
      const payload = { provider };
      if (provider === 's3') Object.assign(payload, { accessKey: s3AccessKey, secretKey: s3SecretKey, bucket: s3Bucket, region: s3Region, endpoint: s3Endpoint });
      if (provider === 'b2') Object.assign(payload, { keyId: b2KeyId, appKey: b2AppKey, bucket: b2Bucket, endpoint: b2Endpoint });
      if (provider === 'gdrive') Object.assign(payload, { credentials: gdriveCredentials, folderId: gdriveFolderId });
      return api.post('/backup/test-connection', payload);
    },
    onSuccess: (res) => {
      const result = res.data || {};
      if (result.success) {
        setTestResult({ ok: true, message: result.message || 'Connection successful' });
      } else {
        setTestResult({ ok: false, message: result.message || 'Connection failed' });
      }
    },
    onError: (error) => {
      setTestResult({ ok: false, message: error.message || 'Connection failed' });
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

  /* ── Loading state ── */
  if (configLoading) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="w-8 h-8 animate-spin text-surface-400" /></div>;
  }

  const providerConfigured = provider !== 'none';

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div className="flex items-center gap-3 mb-1">
        <div className="bg-surface-100 rounded-xl p-2.5">
          <HardDrive className="w-5 h-5 text-surface-400" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-surface-800">Backup & Restore</h2>
          <p className="text-sm text-surface-500">Configure automatic database backups to cloud storage.</p>
        </div>
      </div>

      {/* ── Provider Selection ── */}
      <div className="glass-card p-6">
        <h3 className="text-sm font-medium text-surface-700 mb-3">Storage Provider</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {PROVIDERS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => { setProvider(p.id); setTestResult(null); }}
              className={`flex flex-col items-center gap-1 rounded-lg border px-3 py-3 text-center transition-all ${
                provider === p.id
                  ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-200'
                  : 'border-surface-200 bg-white hover:border-surface-300 hover:bg-surface-50'
              }`}
            >
              <span className={`text-sm font-medium ${provider === p.id ? 'text-blue-700' : 'text-surface-700'}`}>{p.label}</span>
              <span className={`text-xs ${provider === p.id ? 'text-blue-500' : 'text-surface-400'}`}>{p.description}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Credential Fields (conditional) ── */}
      {provider === 's3' && (
        <div className="glass-card p-6 space-y-4">
          <h3 className="text-sm font-medium text-surface-700">AWS S3 Credentials</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">Access Key ID</label>
              <input type="text" value={s3AccessKey} onChange={(e) => setS3AccessKey(e.target.value)} className="glass-input w-full" placeholder="AKIAIOSFODNN7EXAMPLE" />
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">Secret Access Key</label>
              <PasswordInput value={s3SecretKey} onChange={(e) => setS3SecretKey(e.target.value)} className="glass-input w-full pr-9" placeholder="wJalrXUtnFEMI/K7MDENG/..." />
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">Bucket</label>
              <input type="text" value={s3Bucket} onChange={(e) => setS3Bucket(e.target.value)} className="glass-input w-full" placeholder="my-backups" />
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">Region</label>
              <input type="text" value={s3Region} onChange={(e) => setS3Region(e.target.value)} className="glass-input w-full" placeholder="us-east-1" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">Endpoint <span className="text-surface-400 font-normal">(optional, for S3-compatible)</span></label>
            <input type="text" value={s3Endpoint} onChange={(e) => setS3Endpoint(e.target.value)} className="glass-input w-full" placeholder="https://s3.example.com" />
          </div>
        </div>
      )}

      {provider === 'b2' && (
        <div className="glass-card p-6 space-y-4">
          <h3 className="text-sm font-medium text-surface-700">Backblaze B2 Credentials</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">Key ID</label>
              <input type="text" value={b2KeyId} onChange={(e) => setB2KeyId(e.target.value)} className="glass-input w-full" placeholder="0012345678abcdef0000000001" />
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">Application Key</label>
              <PasswordInput value={b2AppKey} onChange={(e) => setB2AppKey(e.target.value)} className="glass-input w-full pr-9" placeholder="K001..." />
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">Bucket</label>
              <input type="text" value={b2Bucket} onChange={(e) => setB2Bucket(e.target.value)} className="glass-input w-full" placeholder="my-backups" />
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">Endpoint</label>
              <input type="text" value={b2Endpoint} onChange={(e) => setB2Endpoint(e.target.value)} className="glass-input w-full" placeholder="https://s3.us-west-004.backblazeb2.com" />
            </div>
          </div>
        </div>
      )}

      {provider === 'gdrive' && (
        <div className="glass-card p-6 space-y-4">
          <h3 className="text-sm font-medium text-surface-700">Google Drive Credentials</h3>
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">Service Account JSON</label>
            <textarea
              value={gdriveCredentials}
              onChange={(e) => setGdriveCredentials(e.target.value)}
              className="glass-input w-full font-mono text-xs"
              rows={6}
              placeholder='{"type": "service_account", "project_id": "...", ...}'
              style={{ WebkitTextSecurity: gdriveCredentials ? 'disc' : 'none' }}
            />
            <p className="text-xs text-surface-500 mt-1">
              Paste the full JSON key file contents from your Google Cloud service account.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">Folder ID</label>
            <input type="text" value={gdriveFolderId} onChange={(e) => setGdriveFolderId(e.target.value)} className="glass-input w-full" placeholder="1AbC-dEfGhIjKlMnOpQrStUvWxYz" />
            <p className="text-xs text-surface-500 mt-1">
              The ID from the Google Drive folder URL. Share this folder with the service account email.
            </p>
          </div>
        </div>
      )}

      {/* ── Test Connection ── */}
      {providerConfigured && (
        <div className="glass-card p-6">
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
                {testResult.ok
                  ? <CheckCircle className="w-4 h-4" />
                  : <XCircle className="w-4 h-4" />
                }
                {testResult.message}
              </span>
            )}
          </div>
          <p className="text-xs text-surface-500 mt-2">Tests connectivity using the credentials above (unsaved changes are used).</p>
        </div>
      )}

      {/* ── Schedule & Retention ── */}
      <div className="glass-card p-6 space-y-4">
        <h3 className="text-sm font-medium text-surface-700">Schedule & Retention</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">Backup Schedule</label>
            <select
              value={schedule}
              onChange={(e) => setSchedule(e.target.value)}
              className="glass-input w-full"
            >
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
          disabled={!providerConfigured || backupNowMutation.isPending || isDirty}
          className="glass-button"
        >
          {backupNowMutation.isPending
            ? <><Loader2 className="w-4 h-4 animate-spin mr-1.5" /> Creating backup...</>
            : <><Play className="w-4 h-4 mr-1.5" /> Backup Now</>
          }
        </button>
        {!providerConfigured && (
          <p className="text-xs text-surface-500 mt-2">Select a storage provider and save settings to enable backups.</p>
        )}
        {isDirty && providerConfigured && (
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
            <div className="hidden sm:grid grid-cols-[1fr_100px_80px_100px_40px] gap-3 px-3 py-1.5 text-xs font-medium text-surface-500 uppercase tracking-wide">
              <span>Date</span>
              <span>Status</span>
              <span>Size</span>
              <span>Triggered by</span>
              <span />
            </div>

            {history.map((backup) => (
              <div
                key={backup.id}
                className="sm:grid sm:grid-cols-[1fr_100px_80px_100px_40px] sm:items-center gap-3 px-3 py-2.5 rounded-lg border border-surface-100 hover:bg-surface-50 transition-colors"
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
                  {backup.status === 'completed' ? formatBytes(backup.fileSize) : '—'}
                </span>

                {/* Triggered by */}
                <span className="text-xs text-surface-500 mt-1 sm:mt-0 block truncate">
                  {backup.triggeredBy || 'system'}
                </span>

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
                        <AlertDialogAction onClick={() => deleteMutation.mutate(backup.id)}>
                          Delete
                        </AlertDialogAction>
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
    </div>
  );
};

export default BackupManager;
