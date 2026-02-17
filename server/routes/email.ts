import { db } from '../db';
import { appSettings } from '../db/schema';
import { inArray } from 'drizzle-orm';
import { requireAdmin } from '../lib/permissions';
import { getSmtpSettings, createTransporter, buildFromAddress } from '../lib/mailer';
import { emailQueue } from '../lib/queue';

export default async function emailRoutes(fastify: any) {
  // POST /api/email/send — enqueues email for background processing
  fastify.post('/send', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request: any, reply: any) => {
    const { to, type, documentId, subject, body } = request.body;

    if (!to || !type || !documentId) {
      return { error: 'Missing required fields: to, type, documentId' };
    }

    // Quick SMTP check so we can fail fast before queuing
    const smtpSettings = await getSmtpSettings();
    if (smtpSettings.smtp_enabled !== 'true') {
      return { error: 'SMTP is not enabled. Configure it in Settings > Email.' };
    }
    if (!smtpSettings.smtp_host) {
      return { error: 'SMTP host is not configured.' };
    }

    // Enqueue the email job
    await emailQueue.add('send', {
      to,
      type,
      documentId,
      subject: subject || undefined,
      body: body || undefined,
      userId: request.user.id,
      userDisplayName: request.userDisplayName || request.user.email,
    }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 60_000 }, // 1m, 2m, 4m
    });

    return { success: true, queued: true };
  });

  // POST /api/email/verify — test SMTP connection only (admin only)
  fastify.post('/verify', { preHandler: [requireAdmin], config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request: any, reply: any) => {
    const smtpSettings = await getSmtpSettings();
    if (!smtpSettings.smtp_host) {
      return reply.code(400).send({ error: 'SMTP host is not configured. Save your SMTP settings first.' });
    }

    try {
      const transport = createTransporter(smtpSettings);
      await transport.verify();
      return { success: true, message: 'SMTP connection verified successfully.' };
    } catch (error: any) {
      return reply.code(400).send({ error: error.message || 'SMTP connection failed.' });
    }
  });

  // POST /api/email/test (admin only)
  fastify.post('/test', { preHandler: [requireAdmin], config: { rateLimit: { max: 3, timeWindow: '1 minute' } } }, async (request: any, reply: any) => {
    const { testEmail } = request.body;
    if (!testEmail) {
      return reply.code(400).send({ error: 'testEmail is required' });
    }

    const smtpSettings = await getSmtpSettings();
    if (!smtpSettings.smtp_host) {
      return reply.code(400).send({ error: 'SMTP host is not configured. Save your SMTP settings first.' });
    }

    try {
      const transport = createTransporter(smtpSettings);
      await transport.verify();

      const testSettings = await db
        .select()
        .from(appSettings)
        .where(inArray(appSettings.key, ['app_name', 'accent_color', 'email_header_bg_color', 'email_accent_color', 'email_header_text_color']));
      const testMap: Record<string, string> = {};
      for (const s of testSettings) testMap[s.key] = s.value;
      const appName = testMap.app_name || 'KreAction Quotes';
      const emailAccent = testMap.email_accent_color || testMap.accent_color || '#8b5cf6';
      const darkBg = testMap.email_header_bg_color || '#1a1a2e';
      const headerTextColor = testMap.email_header_text_color || '#ffffff';
      const tr = parseInt(emailAccent.slice(1, 3), 16);
      const tg = parseInt(emailAccent.slice(3, 5), 16);
      const tb = parseInt(emailAccent.slice(5, 7), 16);
      const testDarker = '#' + [tr, tg, tb].map((c: number) => Math.max(0, Math.round(c * 0.7)).toString(16).padStart(2, '0')).join('');

      const result = await transport.sendMail({
        from: buildFromAddress(smtpSettings),
        to: testEmail,
        subject: `${appName} - Test Email`,
        html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f0f0f0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f0f0;">
  <tr><td style="padding:24px 16px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" align="center" style="max-width:600px;width:100%;margin:0 auto;">
      <tr><td style="background:${darkBg};padding:24px 32px;border-radius:12px 12px 0 0;">
        <span style="font-size:20px;font-weight:700;color:${headerTextColor};letter-spacing:-0.5px;">${appName}</span>
      </td></tr>
      <tr><td style="height:4px;background:linear-gradient(90deg,${emailAccent},${testDarker});font-size:0;line-height:0;">&nbsp;</td></tr>
      <tr><td style="background:#ffffff;padding:32px;">
        <h2 style="margin:0 0 16px;font-size:20px;color:#1f2937;">Connection Test Successful</h2>
        <p style="font-size:15px;line-height:1.7;color:#374151;margin:0 0 20px;">Your SMTP configuration is working correctly. Emails from <strong>${appName}</strong> will be delivered to your clients.</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="padding:14px 18px;background:rgba(${tr},${tg},${tb},0.06);border-left:4px solid ${emailAccent};border-radius:0 6px 6px 0;">
            <span style="font-size:13px;color:${testDarker};">&#10003; SMTP host, authentication, and delivery verified.</span>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="background:#fafafa;padding:20px 32px;border-top:1px solid #e5e7eb;border-radius:0 0 12px 12px;text-align:center;font-size:12px;color:#9ca3af;">
        Sent from ${appName} admin panel
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`,
      });

      return {
        success: true,
        message: `Test email sent to ${testEmail}`,
        messageId: result.messageId,
      };
    } catch (error: any) {
      return reply.code(400).send({ error: error.message || 'Failed to send test email.' });
    }
  });
}
