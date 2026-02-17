import nodemailer from 'nodemailer';
import { db } from '../db';
import { appSettings } from '../db/schema';
import { inArray } from 'drizzle-orm';

export async function getSmtpSettings() {
  const keys = [
    'smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass',
    'smtp_from', 'smtp_from_name', 'smtp_encryption', 'smtp_enabled',
  ];
  const rows = await db
    .select()
    .from(appSettings)
    .where(inArray(appSettings.key, keys));
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  return map;
}

export function createTransporter(settings: Record<string, string>) {
  const encryption = settings.smtp_encryption || 'TLS';
  const port = parseInt(settings.smtp_port || '587', 10);
  const config: any = {
    host: settings.smtp_host,
    port,
    secure: encryption === 'SSL',
    auth: {
      user: settings.smtp_user,
      pass: settings.smtp_pass,
    },
  };
  if (encryption === 'TLS') {
    config.tls = { rejectUnauthorized: false };
  }
  if (encryption === 'NONE') {
    config.secure = false;
    config.ignoreTLS = true;
  }
  return nodemailer.createTransport(config);
}

export function buildFromAddress(smtpSettings: Record<string, string>) {
  if (smtpSettings.smtp_from_name && smtpSettings.smtp_from) {
    return `"${smtpSettings.smtp_from_name}" <${smtpSettings.smtp_from}>`;
  }
  return smtpSettings.smtp_from || smtpSettings.smtp_user;
}

export async function getCompanySettings() {
  const keys = [
    'company_name', 'accent_color', 'email_header_bg_color', 'email_accent_color', 'email_header_text_color',
    'app_name', 'header_logo_url',
    'verification_email_subject', 'verification_email_body',
  ];
  const rows = await db
    .select()
    .from(appSettings)
    .where(inArray(appSettings.key, keys));
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  return map;
}

const formatCurrency = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

export function sendPaymentNotification(params: {
  invoiceNumber: number;
  clientName: string;
  amount: number;
  method: string;
  balanceDue: number;
}) {
  _sendPaymentNotification(params).catch(err =>
    console.error('[PaymentNotification] Failed:', err.message)
  );
}

async function _sendPaymentNotification({ invoiceNumber, clientName, amount, method, balanceDue }: {
  invoiceNumber: number;
  clientName: string;
  amount: number;
  method: string;
  balanceDue: number;
}) {
  const smtpSettings = await getSmtpSettings();
  if (smtpSettings.smtp_enabled !== 'true' || !smtpSettings.smtp_host) return;

  const to = smtpSettings.smtp_from || smtpSettings.smtp_user;
  if (!to) return;

  const docNum = String(invoiceNumber).padStart(5, '0');
  const bal = Math.max(0, balanceDue);
  const subject = `Payment Received — Invoice #${docNum}`;
  const date = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;">
<tr><td align="center" style="padding:40px 20px;">
<table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
  <tr><td style="background:#1a1a2e;padding:20px 28px;">
    <span style="font-size:16px;font-weight:700;color:#ffffff;">Payment Notification</span>
  </td></tr>
  <tr><td style="height:3px;background:#22c55e;"></td></tr>
  <tr><td style="padding:28px;">
    <p style="margin:0 0 20px;font-size:15px;color:#1f2937;font-weight:600;">A payment of ${formatCurrency(amount)} has been received.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;color:#4b5563;">
      <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Invoice</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;color:#1f2937;">#${docNum}</td></tr>
      <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Client</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;color:#1f2937;">${clientName}</td></tr>
      <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Amount</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;color:#22c55e;">${formatCurrency(amount)}</td></tr>
      <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Method</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;color:#1f2937;">${method}</td></tr>
      <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Balance Due</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;color:${bal <= 0 ? '#22c55e' : '#f59e0b'};">${bal <= 0 ? 'Paid in Full' : formatCurrency(bal)}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;">Date</td><td style="padding:8px 0;text-align:right;color:#1f2937;">${date}</td></tr>
    </table>
  </td></tr>
  <tr><td style="background:#f9fafb;padding:16px 28px;border-top:1px solid #e5e7eb;">
    <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">This is an automated notification.</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;

  const transport = createTransporter(smtpSettings);
  await transport.sendMail({
    from: buildFromAddress(smtpSettings),
    to,
    subject,
    html,
  });
}

export function buildVerificationEmailHtml({ appName, companyName, accentColor, emailHeaderBgColor, emailAccentColor, emailHeaderTextColor, verifyUrl, subjectTemplate, bodyTemplate }: {
  appName: string;
  companyName: string;
  accentColor: string;
  emailHeaderBgColor?: string;
  emailAccentColor?: string;
  emailHeaderTextColor?: string;
  verifyUrl: string;
  subjectTemplate?: string;
  bodyTemplate?: string;
}): { html: string; subject: string } {
  const accent = emailAccentColor || accentColor || '#8b5cf6';
  const r = parseInt(accent.slice(1, 3), 16);
  const g = parseInt(accent.slice(3, 5), 16);
  const b = parseInt(accent.slice(5, 7), 16);
  const darkerHex = '#' + [r, g, b].map((c: number) => Math.max(0, Math.round(c * 0.7)).toString(16).padStart(2, '0')).join('');
  const darkBg = emailHeaderBgColor || '#1a1a2e';
  const headerTextColor = emailHeaderTextColor || '#ffffff';

  const replacePlaceholders = (text: string) =>
    text.replace(/\[app_name\]/g, appName).replace(/\[company_name\]/g, companyName || appName);

  const subject = replacePlaceholders(subjectTemplate || `Verify your email \u2014 ${appName}`);

  const defaultBody = `Thanks for signing up${companyName ? ` with ${companyName}` : ''}! Please click the button below to verify your email address and activate your account.`;
  const bodyText = bodyTemplate ? replacePlaceholders(bodyTemplate) : defaultBody;
  const bodyHtml = bodyText.replace(/\n/g, '<br>');

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f7;">
<tr><td align="center" style="padding:40px 20px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

  <!-- Dark header -->
  <tr><td style="background:${darkBg};padding:28px 32px;border-radius:12px 12px 0 0;">
    <table role="presentation" width="100%"><tr>
      <td style="font-size:20px;font-weight:700;color:${headerTextColor};letter-spacing:-0.3px;">${appName}</td>
    </tr></table>
  </td></tr>

  <!-- Accent gradient bar -->
  <tr><td style="height:4px;background:linear-gradient(90deg,${accent},${darkerHex});"></td></tr>

  <!-- Body -->
  <tr><td style="background:#ffffff;padding:40px 32px;">
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1f2937;">Verify your email address</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#4b5563;line-height:1.6;">
      ${bodyHtml}
    </p>

    <!-- CTA Button -->
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
      <tr><td align="center" style="border-radius:8px;background:${accent};">
        <a href="${verifyUrl}" target="_blank" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
          Verify Email Address
        </a>
      </td></tr>
    </table>

    <p style="margin:0 0 16px;font-size:13px;color:#6b7280;line-height:1.5;">
      If the button above doesn't work, copy and paste this link into your browser:
    </p>
    <p style="margin:0 0 24px;font-size:12px;color:${accent};word-break:break-all;">
      ${verifyUrl}
    </p>

    <p style="margin:0;font-size:13px;color:#9ca3af;">
      If you didn't create an account, you can safely ignore this email.
    </p>
  </td></tr>

  <!-- Footer -->
  <tr><td style="background:#f9fafb;padding:20px 32px;border-radius:0 0 12px 12px;border-top:1px solid #e5e7eb;">
    <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
      ${companyName || appName}
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;

  return { html, subject };
}
