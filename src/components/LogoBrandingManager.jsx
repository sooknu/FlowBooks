import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { toast } from '@/components/ui/use-toast';
import { Loader2, Upload, Image as ImageIcon, X, Camera, ExternalLink, RefreshCw, Sun, Moon } from 'lucide-react';
import api from '@/lib/apiClient';
import StickySettingsBar from '@/components/ui/StickySettingsBar';
import PasswordInput from '@/components/ui/PasswordInput';
import { useUpdateSettings, useUploadBranding } from '@/hooks/useMutations';
import { useSettings, useAppData } from '@/hooks/useAppData';

const LogoBrandingManager = () => {
  const { isAdmin } = useAppData();
  const { data: fetchedSettings, isLoading: loading } = useSettings();
  const updateSettings = useUpdateSettings();
  const uploadBranding = useUploadBranding();
  const [preview, setPreview] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [settings, setSettings] = useState({
    login_logo_url: '',
    login_logo_dark_url: '',
    header_logo_url: '',
    header_logo_dark_url: '',
    favicon_url: '',
    secondary_logo_url: '',
    login_logo_size: 64,
    header_logo_size: 32,
    unsplash_enabled: '',
    unsplash_api_key: '',
    unsplash_query: '',
    unsplash_interval: '60',
  });

  // Load current background preview
  useEffect(() => {
    fetch('/api/unsplash/background').then(r => r.json()).then(data => {
      if (data.enabled && data.url) setPreview(data);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (fetchedSettings) {
      setSettings({
        login_logo_url: fetchedSettings.login_logo_url || '',
        login_logo_dark_url: fetchedSettings.login_logo_dark_url || '',
        header_logo_url: fetchedSettings.header_logo_url || '',
        header_logo_dark_url: fetchedSettings.header_logo_dark_url || '',
        favicon_url: fetchedSettings.favicon_url || '',
        secondary_logo_url: fetchedSettings.secondary_logo_url || '',
        login_logo_size: parseInt(fetchedSettings.login_logo_size, 10) || 64,
        header_logo_size: parseInt(fetchedSettings.header_logo_size, 10) || 32,
        unsplash_enabled: fetchedSettings.unsplash_enabled || '',
        unsplash_api_key: fetchedSettings.unsplash_api_key || '',
        unsplash_query: fetchedSettings.unsplash_query || '',
        unsplash_interval: fetchedSettings.unsplash_interval || '60',
      });
    }
  }, [fetchedSettings]);

  const handleInputChange = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleFileUpload = async (file, type) => {
    if (!file) return;
    try {
      const result = await uploadBranding.mutateAsync({ file, type });
      const publicUrl = `${result.data.publicUrl}?v=${Date.now()}`;
      const typeToKey = {
        login_logo: 'login_logo_url',
        login_logo_dark: 'login_logo_dark_url',
        header_logo: 'header_logo_url',
        header_logo_dark: 'header_logo_dark_url',
        favicon: 'favicon_url',
        secondary_logo: 'secondary_logo_url',
      };
      const urlKey = typeToKey[type];
      if (urlKey) handleInputChange(urlKey, publicUrl);
      toast({ title: `${type.replace(/_/g, ' ')} uploaded successfully!` });
    } catch { /* handled by mutation onError */ }
  };

  const isDirty = useMemo(() => {
    if (!fetchedSettings) return false;
    return settings.login_logo_url !== (fetchedSettings.login_logo_url || '') ||
      settings.login_logo_dark_url !== (fetchedSettings.login_logo_dark_url || '') ||
      settings.header_logo_url !== (fetchedSettings.header_logo_url || '') ||
      settings.header_logo_dark_url !== (fetchedSettings.header_logo_dark_url || '') ||
      settings.favicon_url !== (fetchedSettings.favicon_url || '') ||
      settings.secondary_logo_url !== (fetchedSettings.secondary_logo_url || '') ||
      settings.login_logo_size !== (parseInt(fetchedSettings.login_logo_size, 10) || 64) ||
      settings.header_logo_size !== (parseInt(fetchedSettings.header_logo_size, 10) || 32) ||
      settings.unsplash_enabled !== (fetchedSettings.unsplash_enabled || '') ||
      settings.unsplash_api_key !== (fetchedSettings.unsplash_api_key || '') ||
      settings.unsplash_query !== (fetchedSettings.unsplash_query || '') ||
      settings.unsplash_interval !== (fetchedSettings.unsplash_interval || '60');
  }, [settings, fetchedSettings]);

  const handleSave = () => {
    const settingsToSave = Object.entries(settings).map(([key, value]) => ({
      key,
      value: String(value),
    }));
    updateSettings.mutate(settingsToSave, {
      onSuccess: () => toast({ title: "Branding settings saved successfully!" }),
    });
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="w-8 h-8 animate-spin" /></div>;
  }

  const UploadSlot = ({ uploadType, urlKey, previewHeight, previewBg }) => {
    const url = settings[urlKey];
    const fileName = url ? decodeURIComponent(url.split('/').pop()?.split('?')[0] || '') : null;
    const bgClass = previewBg === 'dark'
      ? 'bg-[#1a1a1a] border border-surface-200/30'
      : 'bg-white border border-surface-200/60';
    return (
      <div className="flex flex-col items-center space-y-2 flex-1 min-w-0">
        <div className={`rounded-xl flex items-center justify-center p-2 w-full ${bgClass}`} style={{ height: previewHeight ? `${previewHeight + 16}px` : '80px', minWidth: '80px' }}>
          {url ? (
            <img src={url} alt={`${uploadType} preview`} className="max-w-full object-contain" style={previewHeight ? { height: `${previewHeight}px` } : { maxHeight: '64px' }} />
          ) : (
            <ImageIcon className={`w-8 h-8 ${previewBg === 'dark' ? 'text-[#C8C6C2]/30' : 'text-surface-300'}`} />
          )}
        </div>
        {fileName && (
          <p className="text-[10px] text-surface-400 truncate max-w-full px-1" title={fileName}>{fileName}</p>
        )}
        <div className="flex items-center gap-1.5">
          <label htmlFor={`${uploadType}-upload`} className="action-btn action-btn--secondary cursor-pointer text-xs">
            <input id={`${uploadType}-upload`} type="file" className="hidden" accept="image/png,image/jpeg,image/gif,image/svg+xml,image/x-icon" onChange={e => handleFileUpload(e.target.files[0], uploadType)} disabled={uploadBranding.isPending} />
            {uploadBranding.isPending && uploadBranding.variables?.type === uploadType ? <Loader2 className="w-3 h-3 animate-spin mr-1.5" /> : <Upload className="w-3 h-3 mr-1.5" />}
            <span>{uploadBranding.isPending && uploadBranding.variables?.type === uploadType ? 'Uploading...' : 'Upload'}</span>
          </label>
          {url && (
            <button
              type="button"
              onClick={() => handleInputChange(urlKey, '')}
              className="p-1.5 rounded-lg text-surface-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
              title="Remove image"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    );
  };

  // Logos with theme variants (login + header)
  const themedLogos = [
    { id: 'login_logo', label: 'Login Logo', hint: 'Shown on the login page.', urlKey: 'login_logo_url', darkUrlKey: 'login_logo_dark_url', sizeKey: 'login_logo_size' },
    { id: 'header_logo', label: 'Header Logo', hint: 'Shown in the app header.', urlKey: 'header_logo_url', darkUrlKey: 'header_logo_dark_url', sizeKey: 'header_logo_size' },
  ];

  // Logos without theme variants
  const simpleLogos = [
    { id: 'secondary_logo', label: 'Invoice / Email Logo', hint: 'Used on PDFs and emails.', urlKey: 'secondary_logo_url' },
    { id: 'favicon', label: 'Favicon', hint: 'ICO or PNG, 32x32px.', urlKey: 'favicon_url' },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
      <div className="glass-card p-6">
        <h3 className="text-xl font-bold mb-2">Logos</h3>
        <p className="text-sm text-surface-500 mb-6">Upload your logos for the app, login page, invoices, and browser tab.</p>

        {/* Themed logos (login + header) — light & dark slots */}
        <div className="space-y-5 mb-5">
          {themedLogos.map(type => (
            <div key={type.id} className="glass-card item-row p-4 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-surface-600">{type.label}</label>
                {type.sizeKey && (
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-surface-500">Height</label>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={settings[type.sizeKey]}
                      onChange={e => handleInputChange(type.sizeKey, parseInt(e.target.value, 10) || 0)}
                      className="glass-input w-16 text-center text-xs py-1"
                      min={1}
                    />
                    <span className="text-xs text-surface-400">px</span>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 justify-center">
                    <Sun className="w-3 h-3 text-surface-400" />
                    <span className="text-[11px] font-medium text-surface-500 uppercase tracking-wider">Light</span>
                  </div>
                  <UploadSlot uploadType={type.id} urlKey={type.urlKey} previewHeight={type.sizeKey ? settings[type.sizeKey] : undefined} previewBg="light" />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 justify-center">
                    <Moon className="w-3 h-3 text-surface-400" />
                    <span className="text-[11px] font-medium text-surface-500 uppercase tracking-wider">Dark</span>
                  </div>
                  <UploadSlot uploadType={`${type.id}_dark`} urlKey={type.darkUrlKey} previewHeight={type.sizeKey ? settings[type.sizeKey] : undefined} previewBg="dark" />
                </div>
              </div>
              <p className="text-xs text-surface-400 text-center">{type.hint}</p>
            </div>
          ))}
        </div>

        {/* Simple logos (invoice/email + favicon) */}
        <div className="grid grid-cols-2 gap-4">
          {simpleLogos.map(type => (
            <div key={type.id} className="flex flex-col items-center text-center space-y-3 glass-card item-row p-4">
              <label className="block text-sm font-medium text-surface-600">{type.label}</label>
              <UploadSlot uploadType={type.id} urlKey={type.urlKey} />
              <p className="text-xs text-surface-400">{type.hint}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Login Background — admin only */}
      {isAdmin && <div className="glass-card p-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 bg-surface-100 rounded-xl flex items-center justify-center">
            <Camera className="w-5 h-5 text-surface-400" />
          </div>
          <h3 className="text-xl font-bold">Login Background</h3>
        </div>
        <p className="text-sm text-surface-500 mb-6">Show random photography backgrounds on the login page using Unsplash.</p>

        <div className="space-y-5">
          {/* Enable toggle */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.unsplash_enabled === 'true'}
              onChange={e => handleInputChange('unsplash_enabled', e.target.checked ? 'true' : '')}
              className="w-4 h-4 rounded border-surface-300 text-blue-500 focus:ring-blue-500"
            />
            <span className="text-sm font-medium text-surface-700">Enable Unsplash backgrounds</span>
          </label>

          {/* API Key */}
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1.5">API Key</label>
            <PasswordInput
              value={settings.unsplash_api_key}
              onChange={e => handleInputChange('unsplash_api_key', e.target.value)}
              className="glass-input w-full max-w-md"
              placeholder="Unsplash Access Key"
            />
            <p className="text-xs text-surface-400 mt-1.5">
              Get a free API key at{' '}
              <a href="https://unsplash.com/developers" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline inline-flex items-center gap-0.5">
                unsplash.com/developers <ExternalLink className="w-3 h-3" />
              </a>
            </p>
          </div>

          {/* Search query */}
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1.5">Search Query <span className="text-surface-400 font-normal">(optional)</span></label>
            <input
              type="text"
              value={settings.unsplash_query}
              onChange={e => handleInputChange('unsplash_query', e.target.value)}
              className="glass-input w-full max-w-md"
              placeholder="e.g. photography, landscape, wedding"
            />
          </div>

          {/* Refresh interval */}
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1.5">Refresh Interval</label>
            <select
              value={settings.unsplash_interval}
              onChange={e => handleInputChange('unsplash_interval', e.target.value)}
              className="glass-input w-full max-w-md"
            >
              <option value="0">Every page load</option>
              <option value="15">Every 15 minutes</option>
              <option value="60">Every hour</option>
              <option value="360">Every 6 hours</option>
              <option value="1440">Every 24 hours</option>
            </select>
          </div>

          {/* Preview + refresh */}
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1.5">Current Background</label>
            {preview ? (
              <div className="relative max-w-md rounded-lg overflow-hidden border border-surface-200">
                <img src={preview.thumb || preview.url} alt="Current background" className="w-full h-36 object-cover" />
                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent px-3 py-2">
                  <span className="text-xs text-[#C8C6C2]/80">
                    Photo by {preview.creditName || 'Unknown'}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-surface-400">No background loaded yet. Save settings first, then refresh.</p>
            )}
            <button
              type="button"
              disabled={refreshing || settings.unsplash_enabled !== 'true'}
              onClick={async () => {
                setRefreshing(true);
                try {
                  const res = await api.post('/unsplash/refresh');
                  if (res.enabled && res.url) {
                    setPreview(res);
                    toast({ title: 'Background updated!' });
                  } else {
                    toast({ title: 'Could not fetch a new image', variant: 'destructive' });
                  }
                } catch {
                  toast({ title: 'Failed to refresh background', variant: 'destructive' });
                } finally {
                  setRefreshing(false);
                }
              }}
              className="action-btn action-btn--secondary mt-3 text-sm inline-flex items-center gap-1.5"
            >
              {refreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Change Background Now
            </button>
          </div>
        </div>
      </div>}

      <div className="pb-16" />
      <StickySettingsBar isDirty={isDirty} onSave={handleSave} isPending={updateSettings.isPending} />
    </motion.div>
  );
};

export default LogoBrandingManager;
