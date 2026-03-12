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

  // POST /api/ai/draft-congrats — draft a personalized follow-up message for a past event
  fastify.post('/draft-congrats', async (request: any, reply: any) => {
    const { clientName, projectTitle, shootDate, yearsAgo, projectType, projectTypeLabel } = request.body || {};

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

    const prompt = `Write a short, warm, and professional follow-up email to a past photography client. It has been ${yearsAgo} year${yearsAgo > 1 ? 's' : ''} since we covered their event.

Details:
- Client name: ${clientName}
- Project title: ${projectTitle || 'their special day'}
- Event type: ${projectTypeLabel || projectType || 'event'}
- Event date: ${shootDateStr}
- Years since event: ${yearsAgo}
- From: ${companyName}

Context for the event type — use this to craft the right tone and message:
- "Quinceañera" / "XV" = a Hispanic 15th birthday celebration for a girl. Say something like "It's been ${yearsAgo} year${yearsAgo > 1 ? 's' : ''} since [name]'s Quinceañera" — do NOT call it an "anniversary"
- "Sweet 16" = a 16th birthday party. Reference the birthday milestone, not an anniversary
- "Wedding" = a wedding. Here "anniversary" IS appropriate (e.g., "Happy ${ordinal} wedding anniversary!")
- "Anniversary" = an anniversary celebration (couple's milestone). "Anniversary" wording is appropriate
- "Birthday" = a birthday party. Reference the birthday, not an anniversary
- "Engagement" = engagement party/photos. Say something about the journey since their engagement
- "Baby Shower" = baby shower. Ask how the little one is doing
- "Graduation" = graduation event. Reference their achievement
- "Corporate" / "Event" / "Portrait" / other = general event. Just say it's been X year${yearsAgo > 1 ? 's' : ''} since the event
- For any type, the goal is to reconnect warmly and remind them we'd love to work together again

Guidelines:
- Keep it 3-5 sentences max
- Warm and genuine tone, not overly formal
- Reference the specific type of event naturally — DO NOT generically say "anniversary" unless it was actually a wedding or anniversary event
- Subtly express interest in working together again (new milestones, future events)
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
