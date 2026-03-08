import { db } from '../db';
import { appSettings } from '../db/schema';
import { eq, like } from 'drizzle-orm';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

export type AIProvider = 'openai' | 'anthropic';

/** Known AI feature keys — each maps to a settings key like ai_feature_<name> */
export type AIFeature = 'draft_congrats';

interface AIConfig {
  enabled: boolean;
  openaiKey: string;
  anthropicKey: string;
  featureProviders: Record<string, AIProvider>;
  featureModels: Record<string, string>;
}

/** Cheapest model per provider for general tasks */
export const DEFAULT_MODELS: Record<AIProvider, string> = {
  openai: 'gpt-4.1-nano',
  anthropic: 'claude-haiku-4-5-20251001',
};

/** Available models per provider */
export const AVAILABLE_MODELS: Record<AIProvider, { value: string; label: string; cost: string }[]> = {
  openai: [
    { value: 'gpt-4.1-nano', label: 'GPT-4.1 Nano', cost: '$0.10 / $0.40' },
    { value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini', cost: '$0.40 / $1.60' },
    { value: 'gpt-4.1', label: 'GPT-4.1', cost: '$2.00 / $8.00' },
    { value: 'gpt-4o', label: 'GPT-4o', cost: '$2.50 / $10.00' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini', cost: '$0.15 / $0.60' },
  ],
  anthropic: [
    { value: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5', cost: '$1.00 / $5.00' },
    { value: 'claude-3-5-sonnet-20241022', label: 'Sonnet 3.5 v2', cost: '$3.00 / $15.00' },
    { value: 'claude-sonnet-4-6', label: 'Sonnet 4.6', cost: '$3.00 / $15.00' },
    { value: 'claude-opus-4-6', label: 'Opus 4.6', cost: '$15.00 / $75.00' },
  ],
};

/** Read all AI settings from the app_settings table */
export async function getAIConfig(): Promise<AIConfig> {
  const rows = await db.select().from(appSettings)
    .where(like(appSettings.key, 'ai_%'));

  const map: Record<string, string> = {};
  for (const row of rows) map[row.key] = row.value;

  const featureProviders: Record<string, AIProvider> = {};
  const featureModels: Record<string, string> = {};
  for (const [key, value] of Object.entries(map)) {
    if (key.startsWith('ai_feature_') && (value === 'openai' || value === 'anthropic')) {
      featureProviders[key.replace('ai_feature_', '')] = value;
    }
    if (key.startsWith('ai_model_') && value) {
      featureModels[key.replace('ai_model_', '')] = value;
    }
  }

  return {
    enabled: map.ai_enabled === 'true',
    openaiKey: map.ai_openai_key || '',
    anthropicKey: map.ai_anthropic_key || '',
    featureProviders,
    featureModels,
  };
}

/** Get the provider, model, and key for a specific feature */
export function getFeatureProvider(config: AIConfig, feature: AIFeature): { provider: AIProvider; apiKey: string; model: string } {
  const preferred = config.featureProviders[feature];
  const customModel = config.featureModels[feature];

  // If a preference is set and the key exists, use it
  if (preferred === 'openai' && config.openaiKey) {
    return { provider: 'openai', apiKey: config.openaiKey, model: customModel || DEFAULT_MODELS.openai };
  }
  if (preferred === 'anthropic' && config.anthropicKey) {
    return { provider: 'anthropic', apiKey: config.anthropicKey, model: customModel || DEFAULT_MODELS.anthropic };
  }

  // Fall back to whichever key is available
  if (config.anthropicKey) return { provider: 'anthropic', apiKey: config.anthropicKey, model: customModel || DEFAULT_MODELS.anthropic };
  if (config.openaiKey) return { provider: 'openai', apiKey: config.openaiKey, model: customModel || DEFAULT_MODELS.openai };

  throw new Error('No AI API key configured. Go to Settings → AI to add one.');
}

/** Get an OpenAI client instance */
export function getOpenAIClient(apiKey: string): OpenAI {
  return new OpenAI({ apiKey });
}

/** Get an Anthropic client instance */
export function getAnthropicClient(apiKey: string): Anthropic {
  return new Anthropic({ apiKey });
}

/** Generate text using the specified or configured AI provider */
export async function generateText(prompt: string, feature: AIFeature): Promise<string> {
  const config = await getAIConfig();
  if (!config.enabled) throw new Error('AI features are disabled. Enable them in Settings → AI.');

  const { provider, apiKey, model } = getFeatureProvider(config, feature);

  if (provider === 'openai') {
    const client = getOpenAIClient(apiKey);
    const response = await client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 500,
    });
    return response.choices[0]?.message?.content?.trim() || '';
  } else {
    const client = getAnthropicClient(apiKey);
    const response = await client.messages.create({
      model,
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    });
    const block = response.content[0];
    return block.type === 'text' ? block.text.trim() : '';
  }
}

/** Test that an API key works by making a minimal request */
export async function testConnection(provider: AIProvider, apiKey: string): Promise<{ success: boolean; model?: string; error?: string }> {
  try {
    if (provider === 'openai') {
      const client = getOpenAIClient(apiKey);
      const response = await client.chat.completions.create({
        model: DEFAULT_MODELS.openai,
        messages: [{ role: 'user', content: 'Say "ok"' }],
        max_tokens: 5,
      });
      return { success: true, model: response.model };
    } else {
      const client = getAnthropicClient(apiKey);
      const response = await client.messages.create({
        model: DEFAULT_MODELS.anthropic,
        max_tokens: 5,
        messages: [{ role: 'user', content: 'Say "ok"' }],
      });
      return { success: true, model: response.model };
    }
  } catch (err: any) {
    const message = err?.message || err?.error?.message || 'Unknown error';
    return { success: false, error: message };
  }
}
