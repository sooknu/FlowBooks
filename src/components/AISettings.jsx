import { useState, useEffect, useMemo } from 'react';
import { Loader2, CheckCircle2, XCircle, Eye, EyeOff, ExternalLink, Sparkles, ChevronDown } from 'lucide-react';
import { useSettings, useAppData } from '@/hooks/useAppData';
import { useUpdateSettings } from '@/hooks/useMutations';
import { useQuery } from '@tanstack/react-query';
import StickySettingsBar from '@/components/ui/StickySettingsBar';
import { toast } from '@/components/ui/use-toast';
import api from '@/lib/apiClient';

const PROVIDERS = [
  { value: 'openai', label: 'OpenAI', placeholder: 'sk-...' },
  { value: 'anthropic', label: 'Anthropic', placeholder: 'sk-ant-...' },
];

const AI_FEATURES = [
  { key: 'draft_congrats', label: 'Anniversary Message', description: 'Draft congratulations emails for client anniversaries' },
];

const AISettings = () => {
  const { data: fetchedSettings } = useSettings();
  const updateSettings = useUpdateSettings();

  // Fetch available models from backend
  const { data: availableModels } = useQuery({
    queryKey: ['ai', 'models'],
    queryFn: () => api.get('/ai/models'),
    staleTime: 60 * 60 * 1000,
  });

  const [enabled, setEnabled] = useState(false);
  const [openaiKey, setOpenaiKey] = useState('');
  const [anthropicKey, setAnthropicKey] = useState('');
  const [showOpenai, setShowOpenai] = useState(false);
  const [showAnthropic, setShowAnthropic] = useState(false);
  const [featureProviders, setFeatureProviders] = useState({});
  const [featureModels, setFeatureModels] = useState({});

  // Test state per provider
  const [testing, setTesting] = useState(null);
  const [testResults, setTestResults] = useState({});

  // Populate from fetched settings
  useEffect(() => {
    if (!fetchedSettings) return;
    setEnabled(fetchedSettings.ai_enabled === 'true');
    setOpenaiKey(fetchedSettings.ai_openai_key || '');
    setAnthropicKey(fetchedSettings.ai_anthropic_key || '');

    const fp = {}, fm = {};
    for (const f of AI_FEATURES) {
      fp[f.key] = fetchedSettings[`ai_feature_${f.key}`] || '';
      fm[f.key] = fetchedSettings[`ai_model_${f.key}`] || '';
    }
    setFeatureProviders(fp);
    setFeatureModels(fm);
  }, [fetchedSettings]);

  const isDirty = useMemo(() => {
    if (!fetchedSettings) return false;
    if (String(enabled) !== (fetchedSettings.ai_enabled || 'false')) return true;
    if (openaiKey !== (fetchedSettings.ai_openai_key || '')) return true;
    if (anthropicKey !== (fetchedSettings.ai_anthropic_key || '')) return true;
    for (const f of AI_FEATURES) {
      if ((featureProviders[f.key] || '') !== (fetchedSettings[`ai_feature_${f.key}`] || '')) return true;
      if ((featureModels[f.key] || '') !== (fetchedSettings[`ai_model_${f.key}`] || '')) return true;
    }
    return false;
  }, [enabled, openaiKey, anthropicKey, featureProviders, featureModels, fetchedSettings]);

  const handleSave = () => {
    const settings = [
      { key: 'ai_enabled', value: String(enabled) },
      { key: 'ai_openai_key', value: openaiKey },
      { key: 'ai_anthropic_key', value: anthropicKey },
      ...AI_FEATURES.flatMap(f => [
        { key: `ai_feature_${f.key}`, value: featureProviders[f.key] || '' },
        { key: `ai_model_${f.key}`, value: featureModels[f.key] || '' },
      ]),
    ];
    updateSettings.mutate(settings, {
      onSuccess: () => toast({ title: 'AI settings saved!' }),
    });
  };

  const handleTest = async (provider) => {
    const key = provider === 'openai' ? openaiKey : anthropicKey;
    if (!key || key.startsWith('••••')) {
      toast({ title: 'Enter your API key first', variant: 'destructive' });
      return;
    }
    setTesting(provider);
    setTestResults(prev => ({ ...prev, [provider]: null }));
    try {
      const result = await api.post('/ai/test', { provider, apiKey: key });
      setTestResults(prev => ({ ...prev, [provider]: result }));
    } catch (err) {
      setTestResults(prev => ({ ...prev, [provider]: { success: false, error: err.message } }));
    } finally {
      setTesting(null);
    }
  };

  const setFeatureProvider = (featureKey, provider) => {
    setFeatureProviders(prev => ({ ...prev, [featureKey]: provider }));
    // Clear model when switching provider so it falls back to default
    setFeatureModels(prev => ({ ...prev, [featureKey]: '' }));
  };

  const setFeatureModel = (featureKey, model) => {
    setFeatureModels(prev => ({ ...prev, [featureKey]: model }));
  };

  // Which providers have keys configured
  const hasOpenai = openaiKey && !openaiKey.startsWith('••••') ? true : (fetchedSettings?.ai_openai_key ? true : false);
  const hasAnthropic = anthropicKey && !anthropicKey.startsWith('••••') ? true : (fetchedSettings?.ai_anthropic_key ? true : false);
  const configuredProviders = PROVIDERS.filter(p =>
    (p.value === 'openai' && hasOpenai) || (p.value === 'anthropic' && hasAnthropic)
  );

  // Get the effective provider for a feature (for showing the right model dropdown)
  const getEffectiveProvider = (featureKey) => {
    const explicit = featureProviders[featureKey];
    if (explicit === 'openai' && hasOpenai) return 'openai';
    if (explicit === 'anthropic' && hasAnthropic) return 'anthropic';
    if (hasAnthropic) return 'anthropic';
    if (hasOpenai) return 'openai';
    return null;
  };

  return (
    <div className="space-y-6">
      <StickySettingsBar isDirty={isDirty} onSave={handleSave} isPending={updateSettings.isPending} />

      {/* Enable toggle */}
      <div className="flat-card p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-surface-800">AI Features</h3>
            <p className="text-xs text-surface-400 mt-0.5">Enable AI-powered features like client insights, smart reminders, and more.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={() => setEnabled(!enabled)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${enabled ? 'bg-primary' : 'bg-surface-200'}`}
          >
            <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${enabled ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
        </div>
      </div>

      {/* API Keys — both providers */}
      <div className="flat-card p-5 space-y-5">
        <div>
          <h3 className="text-sm font-semibold text-surface-800">API Keys</h3>
          <p className="text-xs text-surface-400 mt-0.5">Add one or both providers. Each AI feature can be assigned to either.</p>
        </div>

        {/* OpenAI */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-surface-600 block">OpenAI</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type={showOpenai ? 'text' : 'password'}
                value={openaiKey}
                onChange={e => { setOpenaiKey(e.target.value); setTestResults(prev => ({ ...prev, openai: null })); }}
                className="glass-input w-full pr-10"
                placeholder="sk-..."
              />
              <button
                type="button"
                onClick={() => setShowOpenai(!showOpenai)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600 transition-colors"
              >
                {showOpenai ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <button
              type="button"
              onClick={() => handleTest('openai')}
              disabled={testing === 'openai' || !openaiKey || openaiKey.startsWith('••••')}
              className="glass-button-secondary text-xs px-3 py-2 rounded-lg whitespace-nowrap flex items-center gap-1.5"
            >
              {testing === 'openai' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Test
            </button>
          </div>
          {testResults.openai && (
            <div className={`flex items-center gap-1.5 text-xs font-medium ${testResults.openai.success ? 'text-emerald-600' : 'text-red-600'}`}>
              {testResults.openai.success ? <><CheckCircle2 className="w-3.5 h-3.5" /> Connected — {testResults.openai.model}</> : <><XCircle className="w-3.5 h-3.5" /> {testResults.openai.error}</>}
            </div>
          )}
        </div>

        {/* Anthropic */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-surface-600 block">Anthropic</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type={showAnthropic ? 'text' : 'password'}
                value={anthropicKey}
                onChange={e => { setAnthropicKey(e.target.value); setTestResults(prev => ({ ...prev, anthropic: null })); }}
                className="glass-input w-full pr-10"
                placeholder="sk-ant-..."
              />
              <button
                type="button"
                onClick={() => setShowAnthropic(!showAnthropic)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600 transition-colors"
              >
                {showAnthropic ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <button
              type="button"
              onClick={() => handleTest('anthropic')}
              disabled={testing === 'anthropic' || !anthropicKey || anthropicKey.startsWith('••••')}
              className="glass-button-secondary text-xs px-3 py-2 rounded-lg whitespace-nowrap flex items-center gap-1.5"
            >
              {testing === 'anthropic' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Test
            </button>
          </div>
          {testResults.anthropic && (
            <div className={`flex items-center gap-1.5 text-xs font-medium ${testResults.anthropic.success ? 'text-emerald-600' : 'text-red-600'}`}>
              {testResults.anthropic.success ? <><CheckCircle2 className="w-3.5 h-3.5" /> Connected — {testResults.anthropic.model}</> : <><XCircle className="w-3.5 h-3.5" /> {testResults.anthropic.error}</>}
            </div>
          )}
        </div>
      </div>

      {/* Per-feature provider & model selection */}
      {configuredProviders.length > 0 && (
        <div className="flat-card p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-surface-800">Feature Routing</h3>
            <p className="text-xs text-surface-400 mt-0.5">Choose which provider and model handles each AI feature.</p>
          </div>

          {AI_FEATURES.map(f => {
            const effectiveProvider = getEffectiveProvider(f.key);
            const models = effectiveProvider && availableModels ? availableModels[effectiveProvider] || [] : [];
            return (
              <div key={f.key} className="py-3 border-b border-surface-100 last:border-0 space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-surface-700 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-primary" />
                      {f.label}
                    </p>
                    <p className="text-xs text-surface-400 mt-0.5">{f.description}</p>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    {PROVIDERS.map(p => {
                      const isConfigured = (p.value === 'openai' && hasOpenai) || (p.value === 'anthropic' && hasAnthropic);
                      const isSelected = featureProviders[f.key] === p.value;
                      return (
                        <button
                          key={p.value}
                          type="button"
                          onClick={() => setFeatureProvider(f.key, isSelected ? '' : p.value)}
                          disabled={!isConfigured}
                          className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-all ${
                            isSelected
                              ? 'border-primary bg-primary/5 text-primary'
                              : 'border-surface-200 text-surface-400 hover:border-surface-300 hover:text-surface-600'
                          } ${!isConfigured ? 'opacity-40 cursor-not-allowed' : ''}`}
                        >
                          {p.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {/* Model selector */}
                {models.length > 0 && (
                  <div className="relative ml-6">
                    <select
                      value={featureModels[f.key] || ''}
                      onChange={e => setFeatureModel(f.key, e.target.value)}
                      className="glass-input w-full sm:w-64 text-xs appearance-none pr-8"
                    >
                      <option value="">Default model</option>
                      {models.map(m => (
                        <option key={m.value} value={m.value}>
                          {m.label} — {m.cost} per 1M tokens
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none text-surface-400" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pricing links */}
      <div className="flat-card p-5">
        <h3 className="text-sm font-semibold text-surface-800 mb-2">Pricing</h3>
        <p className="text-xs text-surface-400 mb-3">Compare provider pricing to choose the best option for your usage.</p>
        <div className="flex gap-3">
          <a href="https://openai.com/api/pricing/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
            <ExternalLink className="w-3.5 h-3.5" /> OpenAI Pricing
          </a>
          <a href="https://www.anthropic.com/pricing#anthropic-api" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
            <ExternalLink className="w-3.5 h-3.5" /> Anthropic Pricing
          </a>
        </div>
      </div>

      {/* Future features preview */}
      <div className="flat-card p-5">
        <h3 className="text-sm font-semibold text-surface-800 mb-2">Coming Soon</h3>
        <ul className="space-y-2 text-xs text-surface-500">
          <li className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-primary/40" />
            CRM reminders — anniversaries, follow-ups with past clients
          </li>
          <li className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-primary/40" />
            Client analysis — insights from project history
          </li>
          <li className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-primary/40" />
            Smart descriptions — AI-generated project summaries
          </li>
        </ul>
      </div>
    </div>
  );
};

export default AISettings;
