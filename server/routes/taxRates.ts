import { requireAdmin } from '../lib/permissions';

// Representative ZIP code per state for API Ninjas lookups
const STATE_ZIPS: Record<string, string> = {
  AL: '35203', AK: '99501', AZ: '85001', AR: '72201', CA: '90001',
  CO: '80202', CT: '06103', DE: '19901', FL: '33101', GA: '30301',
  HI: '96801', ID: '83702', IL: '60601', IN: '46201', IA: '50301',
  KS: '66101', KY: '40202', LA: '70112', ME: '04101', MD: '21201',
  MA: '02101', MI: '48201', MN: '55401', MS: '39201', MO: '63101',
  MT: '59601', NE: '68102', NV: '89101', NH: '03301', NJ: '07101',
  NM: '87101', NY: '10001', NC: '27601', ND: '58501', OH: '43201',
  OK: '73101', OR: '97201', PA: '17101', RI: '02901', SC: '29201',
  SD: '57101', TN: '37201', TX: '73301', UT: '84101', VT: '05601',
  VA: '23218', WA: '98101', WV: '25301', WI: '53201', WY: '82001',
  DC: '20001',
};

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default async function taxRatesRoutes(fastify: any) {
  // POST /api/tax-rates/fetch-api — bulk-fetch rates from API Ninjas (admin only)
  fastify.post('/fetch-api', { preHandler: [requireAdmin] }, async (request: any, reply: any) => {
    const { apiKey } = request.body || {};
    if (!apiKey || typeof apiKey !== 'string') {
      return reply.code(400).send({ error: 'API key is required' });
    }

    const rates: Record<string, number> = {};
    const errors: string[] = [];

    for (const [state, zip] of Object.entries(STATE_ZIPS)) {
      try {
        const res = await fetch(`https://api.api-ninjas.com/v1/salestax?zip_code=${zip}`, {
          headers: { 'X-Api-Key': apiKey },
        });

        if (!res.ok) {
          if (res.status === 429) {
            // Rate limited — wait longer and retry once
            await sleep(1000);
            const retry = await fetch(`https://api.api-ninjas.com/v1/salestax?zip_code=${zip}`, {
              headers: { 'X-Api-Key': apiKey },
            });
            if (retry.ok) {
              const data = await retry.json() as any[];
              if (data?.[0]?.state_rate != null) {
                rates[state] = Math.round(parseFloat(data[0].state_rate) * 100 * 1000) / 1000;
              }
            } else {
              errors.push(`${state}: rate limited`);
            }
          } else {
            errors.push(`${state}: HTTP ${res.status}`);
          }
        } else {
          const data = await res.json() as any[];
          if (data?.[0]?.state_rate != null) {
            rates[state] = Math.round(parseFloat(data[0].state_rate) * 100 * 1000) / 1000;
          }
        }
      } catch (err: any) {
        errors.push(`${state}: ${err.message}`);
      }

      // Small delay to avoid rate limiting
      await sleep(50);
    }

    return { rates, errors: errors.length > 0 ? errors : undefined };
  });
}
