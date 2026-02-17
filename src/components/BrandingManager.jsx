import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { toast } from '@/components/ui/use-toast';
import { Loader2, Key, ChevronDown, ChevronUp, Camera } from 'lucide-react';
import PasswordInput from '@/components/ui/PasswordInput';
import StickySettingsBar from '@/components/ui/StickySettingsBar';
import { useUpdateSettings } from '@/hooks/useMutations';
import { useSettings } from '@/hooks/useAppData';
import { formatPhoneInput } from '@/lib/utils';
import { US_STATES } from '@/lib/usStates';

const PhotographySettings = ({ settings, handleInputChange }) => (
  <div className="glass-card p-6 space-y-6">
    <div className="flex items-center gap-3 mb-2">
      <Camera className="w-5 h-5 text-primary" />
      <h3 className="text-xl font-bold">Photography Settings</h3>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <label className="block text-sm font-medium text-surface-600 mb-2">Travel Rate ($/mile)</label>
        <input type="number" inputMode="decimal" step="0.01" value={settings.travel_rate_per_mile} onChange={e => handleInputChange('travel_rate_per_mile', e.target.value)} className="glass-input w-full" placeholder="0.67" />
        <p className="text-xs text-surface-500 mt-1">Used by the travel fee calculator in quotes</p>
      </div>
      <div>
        <label className="block text-sm font-medium text-surface-600 mb-2">Default Deposit (%)</label>
        <input type="number" inputMode="numeric" step="1" min="0" max="100" value={settings.deposit_percent} onChange={e => handleInputChange('deposit_percent', e.target.value)} className="glass-input w-full" placeholder="25" />
        <p className="text-xs text-surface-500 mt-1">Auto-calculated when a quote is approved</p>
      </div>
    </div>

    <div>
      <label className="block text-sm font-medium text-surface-600 mb-2">Default Terms & Conditions</label>
      <textarea value={settings.terms_template} onChange={e => handleInputChange('terms_template', e.target.value)} className="glass-input w-full" rows={6} placeholder="Enter your default contract terms, cancellation policy, usage rights, delivery timeline..." />
      <p className="text-xs text-surface-500 mt-1">Appears on PDFs. Can be overridden per quote/invoice.</p>
    </div>
  </div>
);

const DEFAULTS = {
  app_name: 'QuoteFlow', company_name: '', company_street: '', company_city: '',
  company_state: '', company_zip: '', company_phone: '', company_email: '', company_website: '',
  tax_rate: '', tax_home_state: '', tax_api_key: '',
  travel_rate_per_mile: '0.67', deposit_percent: '25', terms_template: '',
};

const BrandingManager = () => {
  const { data: fetchedSettings, isLoading: loading } = useSettings();
  const updateSettings = useUpdateSettings();
  const [settings, setSettings] = useState({ ...DEFAULTS });
  const [showApiKeys, setShowApiKeys] = useState(false);

  useEffect(() => {
    if (fetchedSettings) {
      const s = {};
      for (const key of Object.keys(DEFAULTS)) s[key] = fetchedSettings[key] || DEFAULTS[key];
      setSettings(s);
    }
  }, [fetchedSettings]);

  const isDirty = useMemo(() => {
    if (!fetchedSettings) return false;
    return Object.keys(DEFAULTS).some(k => settings[k] !== (fetchedSettings[k] || DEFAULTS[k]));
  }, [settings, fetchedSettings]);

  const handleInputChange = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

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

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
      <div className="glass-card p-6">
        <h3 className="text-xl font-bold mb-4">Company & App Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-surface-600 mb-2">App Name</label>
            <input type="text" value={settings.app_name} onChange={e => handleInputChange('app_name', e.target.value)} className="glass-input w-full" placeholder="e.g., QuoteFlow" />
          </div>
          <div>
            <label className="block text-sm font-medium text-surface-600 mb-2">Company Name</label>
            <input type="text" value={settings.company_name} onChange={e => handleInputChange('company_name', e.target.value)} className="glass-input w-full" placeholder="e.g., Your Company LLC" />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-surface-600 mb-2">Street Address</label>
            <input type="text" value={settings.company_street} onChange={e => handleInputChange('company_street', e.target.value)} className="glass-input w-full" placeholder="123 Main St" />
          </div>
          <div>
            <label className="block text-sm font-medium text-surface-600 mb-2">City</label>
            <input type="text" value={settings.company_city} onChange={e => handleInputChange('company_city', e.target.value)} className="glass-input w-full" placeholder="Anytown" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-surface-600 mb-2">State</label>
              <select value={settings.company_state} onChange={e => handleInputChange('company_state', e.target.value)} className="glass-select w-full">
                <option value="">Select...</option>
                {US_STATES.map(s => <option key={s.value} value={s.value}>{s.value} — {s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-600 mb-2">ZIP Code</label>
              <input type="text" value={settings.company_zip} onChange={e => handleInputChange('company_zip', e.target.value)} className="glass-input w-full" placeholder="90001" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-surface-600 mb-2">Phone</label>
            <input type="tel" inputMode="tel" value={settings.company_phone} onChange={e => handleInputChange('company_phone', formatPhoneInput(e.target.value))} className="glass-input w-full" placeholder="(555) 123-4567" />
          </div>
          <div>
            <label className="block text-sm font-medium text-surface-600 mb-2">Email</label>
            <input type="email" value={settings.company_email} onChange={e => handleInputChange('company_email', e.target.value)} className="glass-input w-full" placeholder="info@company.com" />
          </div>
          <div>
            <label className="block text-sm font-medium text-surface-600 mb-2">Website</label>
            <input type="url" value={settings.company_website} onChange={e => handleInputChange('company_website', e.target.value)} className="glass-input w-full" placeholder="www.yourcompany.com" />
          </div>
        </div>
      </div>

      <div className="glass-card p-6">
        <h3 className="text-xl font-bold mb-4">Tax Configuration</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-surface-600 mb-1">Default Tax Rate</label>
            <p className="text-xs text-surface-400 mb-2">Applied to home-state and unspecified clients.</p>
            <div className="flex items-center gap-2">
              <input type="number" inputMode="decimal" step="0.01" value={settings.tax_rate} onChange={e => handleInputChange('tax_rate', e.target.value)} className="glass-input w-32" placeholder="e.g., 10.25" />
              <span className="text-surface-400 font-medium">%</span>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-surface-600 mb-1">Home State</label>
            <p className="text-xs text-surface-400 mb-2">Clients outside this state will not be charged tax.</p>
            <input type="text" value={settings.tax_home_state} onChange={e => handleInputChange('tax_home_state', e.target.value.toUpperCase())} className="glass-input w-20 font-mono text-center" placeholder="CA" maxLength={2} />
          </div>
        </div>
      </div>

      <PhotographySettings settings={settings} handleInputChange={handleInputChange} />

      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-xl font-bold">API Keys</h3>
          <button
            onClick={() => setShowApiKeys(!showApiKeys)}
            className="text-xs text-surface-400 hover:text-surface-700 transition-colors flex items-center gap-1"
          >
            <Key className="w-3.5 h-3.5" />
            {showApiKeys ? 'Hide' : 'Show'}
            {showApiKeys ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>
        <p className="text-sm text-surface-400 mb-4">Third-party API keys used by the application.</p>
        {showApiKeys && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-surface-600 mb-1">API Ninjas</label>
              <p className="text-xs text-surface-400 mb-2">
                Get a free key at{' '}
                <a href="https://api-ninjas.com" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">api-ninjas.com</a>
              </p>
              <PasswordInput
                value={settings.tax_api_key}
                onChange={e => handleInputChange('tax_api_key', e.target.value)}
                className="glass-input w-full max-w-md font-mono pr-9"
                placeholder="Your API Ninjas key"
              />
            </div>
          </div>
        )}
      </div>

      <StickySettingsBar isDirty={isDirty} onSave={handleSave} isPending={updateSettings.isPending} />
    </motion.div>
  );
};

export default BrandingManager;
