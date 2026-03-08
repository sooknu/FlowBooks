import { requirePermission } from '../lib/permissions';
import { testConnection, generateText, AVAILABLE_MODELS, type AIProvider } from '../lib/ai';
import { db } from '../db';
import { appSettings } from '../db/schema';
import { inArray } from 'drizzle-orm';

const manageGuard = requirePermission('manage_ai_settings');

export default async function aiRoutes(fastify: any) {
  // GET /api/ai/models — available models per provider
  fastify.get('/models', async () => {
    return AVAILABLE_MODELS;
  });

  // POST /api/ai/test — verify API key works
  fastify.post('/test', { preHandler: [manageGuard] }, async (request: any, reply: any) => {
    const { provider, apiKey } = request.body || {};

    if (!provider || !apiKey) {
      return reply.code(400).send({ error: 'Provider and API key are required' });
    }
    if (!['openai', 'anthropic'].includes(provider)) {
      return reply.code(400).send({ error: 'Provider must be "openai" or "anthropic"' });
    }

    const result = await testConnection(provider as AIProvider, apiKey);
    return result;
  });

  // POST /api/ai/draft-congrats — draft a personalized anniversary congratulations email
  fastify.post('/draft-congrats', async (request: any, reply: any) => {
    const { clientName, projectTitle, shootDate, yearsAgo } = request.body || {};

    if (!yearsAgo || (!clientName && !projectTitle)) {
      return reply.code(400).send({ error: 'Not enough project info to write a message. Add a client name or project title first.' });
    }

    // Get company name from settings
    const settingsRows = await db.select().from(appSettings)
      .where(inArray(appSettings.key, ['company_name']));
    const companyName = settingsRows.find(r => r.key === 'company_name')?.value || 'Our Studio';

    const shootDateStr = shootDate
      ? new Date(shootDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      : '';

    const ordinal = yearsAgo === 1 ? '1st' : yearsAgo === 2 ? '2nd' : yearsAgo === 3 ? '3rd' : `${yearsAgo}th`;

    const prompt = `Write a short, warm, and professional congratulations email for a photography client's ${ordinal} anniversary.

Details:
- Client name: ${clientName}
- Original event: ${projectTitle || 'their special day'}
- Event date: ${shootDateStr}
- Years ago: ${yearsAgo}
- From: ${companyName}

Guidelines:
- Keep it 3-5 sentences max
- Warm and genuine tone, not overly formal
- Reference their event naturally
- End with a brief, friendly sign-off from the studio
- Do NOT include a subject line — just the email body
- Do NOT use placeholder brackets like [Name]`;

    try {
      const message = await generateText(prompt, 'draft_congrats');
      return { message };
    } catch (err: any) {
      return reply.code(500).send({ error: err.message || 'Failed to generate message' });
    }
  });
}
