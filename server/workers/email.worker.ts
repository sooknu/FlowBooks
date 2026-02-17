import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Job } from 'bullmq';
import { db } from '../db';
import { appSettings, quotes, invoices, pdfDocuments } from '../db/schema';
import { eq, inArray } from 'drizzle-orm';
import { generatePdfBase64 } from '../lib/generatePdf';
import { getSmtpSettings, createTransporter, buildFromAddress } from '../lib/mailer';
import { logActivity } from '../lib/activityLog';
import { composeCompanyInfo, COMPANY_INFO_KEYS } from '../lib/companyInfo';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const documentsDir = path.join(__dirname, '..', 'uploads', 'documents');

const formatCurrency = (amount: any) => {
  if (typeof amount !== 'number') amount = parseFloat(amount) || 0;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function replacePlaceholders(text: string, data: Record<string, string>) {
  if (!text) return text;
  let result = text;
  for (const [placeholder, value] of Object.entries(data)) {
    const escaped = placeholder.replace(/[[\]]/g, '\\$&');
    result = result.replace(new RegExp(escaped, 'g'), value);
  }
  return result;
}

function buildEmailHtml({ type, body, companyName, companyAddress, companyContact, logoUrl, accentColor: accent, emailHeaderBgColor, emailAccentColor, emailHeaderTextColor, pdfDownloadUrl, payOnlineUrl, approveQuoteUrl, document }: any) {
  const docLabel = type === 'quote' ? 'Quote' : 'Invoice';
  const docNumber = type === 'quote'
    ? String(document.quoteNumber).padStart(5, '0')
    : String(document.invoiceNumber).padStart(5, '0');
  const docDate = new Date(document.createdAt).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  const accentColor = emailAccentColor || accent || '#8b5cf6';
  const headerTextColor = emailHeaderTextColor || '#ffffff';
  const r = parseInt(accentColor.slice(1, 3), 16);
  const g = parseInt(accentColor.slice(3, 5), 16);
  const b = parseInt(accentColor.slice(5, 7), 16);
  const darkerHex = '#' + [r, g, b].map((c: number) => Math.max(0, Math.round(c * 0.7)).toString(16).padStart(2, '0')).join('');
  const lighterBg = `rgba(${r}, ${g}, ${b}, 0.06)`;
  const darkBg = emailHeaderBgColor || accentColor;
  const bodyHtml = escapeHtml(body).replace(/\n/g, '<br>');

  let logoHtml = '';
  if (logoUrl) {
    const cleanUrl = logoUrl.split('?')[0];
    if (!cleanUrl.toLowerCase().endsWith('.svg')) {
      logoHtml = `<img src="${logoUrl}" alt="${escapeHtml(companyName)}" width="200" height="48" style="max-height:48px;max-width:200px;width:auto;height:auto;display:block;" />`;
    }
  }

  const summaryRows: any[] = [];
  summaryRows.push({ label: `${docLabel} #`, value: docNumber });
  summaryRows.push({ label: 'Date', value: docDate });
  if (document.clientName) {
    summaryRows.push({ label: 'Client', value: escapeHtml(document.clientName) });
  }
  summaryRows.push({ label: 'Subtotal', value: formatCurrency(document.subtotal || 0) });
  if (document.discountAmount > 0) {
    summaryRows.push({ label: 'Discount', value: `- ${formatCurrency(document.discountAmount)}` });
  }
  if (document.tax > 0) {
    summaryRows.push({ label: 'Tax', value: formatCurrency(document.tax) });
  }
  summaryRows.push({ label: 'Total', value: formatCurrency(document.total), bold: true });

  if (type === 'invoice') {
    if (document.paidAmount > 0) {
      summaryRows.push({ label: 'Paid', value: `- ${formatCurrency(document.paidAmount)}` });
    }
    const balance = document.total - (document.paidAmount || 0);
    summaryRows.push({ label: 'Balance Due', value: formatCurrency(balance), bold: true, accent: true });
  }

  const summaryHtml = summaryRows.map((r: any) => `
    <tr>
      <td style="padding:6px 12px;font-size:13px;color:#6b7280;border-bottom:1px solid #f3f4f6;">${r.label}</td>
      <td style="padding:6px 12px;font-size:13px;text-align:right;border-bottom:1px solid #f3f4f6;${r.bold ? 'font-weight:700;' : ''}${r.accent ? `color:${accentColor};font-size:15px;` : 'color:#1f2937;'}">${r.value}</td>
    </tr>`).join('');

  const footerLines = [escapeHtml(companyName)];
  if (companyAddress) footerLines.push(...companyAddress.split('\n').map(escapeHtml));
  if (companyContact) footerLines.push(escapeHtml(companyContact));
  const footerHtml = footerLines.map((l: string) => `<span>${l}</span>`).join('<br>');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${docLabel} from ${escapeHtml(companyName)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f0f0f0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f0f0;">
  <tr><td style="padding:24px 16px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" align="center" style="max-width:600px;width:100%;margin:0 auto;">

      <!-- HEADER -->
      <tr><td style="background:${darkBg};padding:24px 32px;border-radius:12px 12px 0 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="vertical-align:middle;">
              ${logoHtml || `<span style="font-size:20px;font-weight:700;color:${headerTextColor};letter-spacing:-0.5px;">${escapeHtml(companyName)}</span>`}
            </td>
            <td style="text-align:right;vertical-align:middle;">
              <span style="font-size:22px;font-weight:700;color:${headerTextColor};letter-spacing:2px;text-transform:uppercase;">${docLabel}</span>
            </td>
          </tr>
        </table>
      </td></tr>

      <!-- ACCENT BAR -->
      <tr><td style="height:4px;background:linear-gradient(90deg,${accentColor},${darkerHex});font-size:0;line-height:0;">&nbsp;</td></tr>

      <!-- BODY -->
      <tr><td style="background:#ffffff;padding:32px;">

        <!-- Document summary card -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:28px;">
          <tr><td style="padding:16px 12px 4px 12px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              ${summaryHtml}
            </table>
          </td></tr>
        </table>

        <!-- User body text -->
        <div style="font-size:15px;line-height:1.7;color:#374151;">
          ${bodyHtml}
        </div>

        ${payOnlineUrl ? `<!-- Pay Online CTA -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:28px;">
          <tr><td align="center" style="padding:24px 0 8px;">
            <a href="${payOnlineUrl}" target="_blank" style="display:inline-block;background:${accentColor};color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;padding:14px 40px;border-radius:8px;letter-spacing:0.3px;">
              Pay Online
            </a>
          </td></tr>
          <tr><td align="center" style="padding:4px 0 0;">
            <span style="font-size:12px;color:#9ca3af;">&#128274; Secure online payment</span>
          </td></tr>
        </table>` : ''}

        <!-- Attachment note -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:28px;">
          <tr><td style="padding:14px 18px;background:${lighterBg};border-left:4px solid ${accentColor};border-radius:0 6px 6px 0;">
            <span style="font-size:13px;color:${darkerHex};">&#128206; Your detailed ${docLabel.toLowerCase()} with full line items is attached as a PDF.</span>
            ${pdfDownloadUrl ? `<br><a href="${pdfDownloadUrl}" style="display:inline-block;margin-top:8px;font-size:13px;font-weight:600;color:${accentColor};text-decoration:none;" target="_blank">View &amp; Download PDF &#8594;</a>
            <br><span style="font-size:11px;color:#9ca3af;margin-top:4px;display:inline-block;">&#128274; Opens securely in your browser &middot; Hosted by ${escapeHtml(companyName)} (${(() => { try { return new URL(pdfDownloadUrl).hostname; } catch { return ''; } })()})</span>` : ''}
          </td></tr>
        </table>

        ${approveQuoteUrl ? `<!-- Approve Quote CTA -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:28px;">
          <tr><td align="center" style="padding:24px 0 8px;">
            <a href="${approveQuoteUrl}" target="_blank" style="display:inline-block;background:${accentColor};color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;padding:14px 40px;border-radius:8px;letter-spacing:0.3px;">
              &#10003; Approve Quote
            </a>
          </td></tr>
          <tr><td align="center" style="padding:4px 0 0;">
            <span style="font-size:12px;color:#9ca3af;">Click to approve and receive your invoice</span>
          </td></tr>
        </table>` : ''}

      </td></tr>

      <!-- FOOTER -->
      <tr><td style="background:#fafafa;padding:24px 32px;border-top:1px solid #e5e7eb;border-radius:0 0 12px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="text-align:center;font-size:12px;line-height:1.6;color:#9ca3af;">
            ${footerHtml}
          </td></tr>
        </table>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}

export interface EmailJobData {
  to: string;
  type: 'quote' | 'invoice';
  documentId: string;
  subject?: string;
  body?: string;
  userId: string;
  userDisplayName: string;
}

export async function processEmailJob(job: Job<EmailJobData>) {
  const { to, type, documentId, subject: customSubject, body: customBody, userId, userDisplayName } = job.data;

  await job.updateProgress(10);

  // Validate SMTP
  const smtpSettings = await getSmtpSettings();
  if (smtpSettings.smtp_enabled !== 'true' || !smtpSettings.smtp_host) {
    throw new Error('SMTP is not configured or enabled');
  }

  // Fetch document
  let document: any;
  if (type === 'quote') {
    document = await db.query.quotes.findFirst({
      where: eq(quotes.id, documentId),
      with: { client: true },
    });
  } else {
    document = await db.query.invoices.findFirst({
      where: eq(invoices.id, documentId),
      with: { client: true, payments: true },
    });
  }
  if (!document) throw new Error('Document not found');

  await job.updateProgress(20);

  // Fetch settings
  const settingsRows = await db
    .select()
    .from(appSettings)
    .where(inArray(appSettings.key, [
      `email_template_${type}`, `email_subject_${type}`,
      'company_name', ...COMPANY_INFO_KEYS,
      'secondary_logo_url', 'accent_color', 'email_header_bg_color', 'email_accent_color', 'email_header_text_color', 'app_name',
      'stripe_enabled', 'paypal_enabled',
    ]));
  const settingsMap: Record<string, string> = {};
  for (const s of settingsRows) settingsMap[s.key] = s.value;

  const companyName = settingsMap.company_name || settingsMap.app_name || 'Our Company';
  const defaultSubjects: Record<string, string> = {
    quote: `Your Quote from ${companyName}`,
    invoice: `Invoice from ${companyName}`,
  };
  const defaultBodies: Record<string, string> = {
    quote: `Hi ${document.clientName || 'there'},\n\nThank you for your interest in working with us. Please find your quote attached for your review.\n\nIf you have any questions or would like to move forward, don't hesitate to reach out — we're happy to help.\n\nBest regards,\n${companyName}`,
    invoice: `Hi ${document.clientName || 'there'},\n\nPlease find your invoice attached. A summary of the charges is included above for your convenience.\n\nIf you have any questions regarding this invoice, feel free to contact us.\n\nThank you for your business,\n${companyName}`,
  };
  const subjectTemplate = settingsMap[`email_subject_${type}`] || defaultSubjects[type];
  const bodyTemplate = settingsMap[`email_template_${type}`] || defaultBodies[type];

  const placeholders: Record<string, string> = {
    '[app_name]': settingsMap.app_name || companyName,
    '[company_name]': companyName,
    '[client_name]': document.clientName || '',
    '[quote_number]': type === 'quote' ? String(document.quoteNumber) : '',
    '[invoice_number]': type === 'invoice' ? String(document.invoiceNumber) : '',
    '[total]': formatCurrency(document.total),
    '[subtotal]': formatCurrency(document.subtotal || 0),
    '[tax]': formatCurrency(document.tax || 0),
    '[discount_amount]': formatCurrency(document.discountAmount || 0),
    '[status]': type === 'invoice' ? (document.status || '') : '',
  };

  const subject = customSubject || replacePlaceholders(subjectTemplate, placeholders);
  const body = customBody || replacePlaceholders(bodyTemplate, placeholders);

  await job.updateProgress(30);

  // Generate PDF
  const pdfResult = await generatePdfBase64({ type, documentId });
  const { pdfBase64, fileName } = pdfResult;

  await job.updateProgress(60);

  // Store PDF on disk
  const baseUrl = process.env.BETTER_AUTH_URL || 'http://localhost:3001';
  let pdfDownloadUrl = '';
  try {
    if (!fs.existsSync(documentsDir)) {
      fs.mkdirSync(documentsDir, { recursive: true });
    }
    const token = crypto.randomBytes(16).toString('hex');
    const ext = path.extname(fileName);
    const base = path.basename(fileName, ext);
    const secureFileName = `${base}-${token}${ext}`;
    const pdfFilePath = path.join(documentsDir, secureFileName);
    fs.writeFileSync(pdfFilePath, Buffer.from(pdfBase64, 'base64'));

    const docNumber = type === 'quote' ? document.quoteNumber : document.invoiceNumber;
    await db.insert(pdfDocuments).values({
      token,
      fileName: secureFileName,
      documentType: type,
      documentId,
      documentNumber: docNumber,
    });

    pdfDownloadUrl = `${baseUrl}/api/pdf/download/${token}`;
  } catch {
    // Non-fatal — email still sends with attachment
  }

  await job.updateProgress(70);

  // Generate pay-online URL for invoices when online payments are enabled and balance > 0
  let payOnlineUrl = '';
  if (type === 'invoice' && (settingsMap.stripe_enabled === 'true' || settingsMap.paypal_enabled === 'true')) {
    const balance = (document.total || 0) - (document.paidAmount || 0);
    if (balance > 0) {
      let token = document.paymentToken;
      if (!token) {
        token = crypto.randomBytes(16).toString('hex');
        await db.update(invoices).set({ paymentToken: token, updatedAt: new Date() }).where(eq(invoices.id, documentId));
      }
      payOnlineUrl = `${baseUrl}/pay/${token}`;
    }
  }

  // Generate approve-quote URL for quotes
  let approveQuoteUrl = '';
  if (type === 'quote') {
    let approvalToken = document.approvalToken;
    if (!approvalToken) {
      approvalToken = crypto.randomBytes(16).toString('hex');
      await db.update(quotes).set({ approvalToken, updatedAt: new Date() }).where(eq(quotes.id, documentId));
    }
    approveQuoteUrl = `${baseUrl}/approve/${approvalToken}`;
  }

  // Build logo for email — try CID embed from disk, fall back to URL
  let logoUrl = '';
  let logoCid: { filename: string; path: string; cid: string; contentType: string } | null = null;
  const logoSetting = settingsMap.secondary_logo_url || settingsMap.header_logo_url || null;
  if (logoSetting) {
    const cleanLogo = logoSetting.split('?')[0];
    if (!cleanLogo.toLowerCase().endsWith('.svg') && cleanLogo.startsWith('/uploads/')) {
      const logoFilePath = path.join(__dirname, '..', cleanLogo);
      if (fs.existsSync(logoFilePath)) {
        const ext = path.extname(logoFilePath).toLowerCase();
        logoCid = {
          filename: path.basename(logoFilePath),
          path: logoFilePath,
          cid: 'company-logo',
          contentType: ext === '.png' ? 'image/png' : 'image/jpeg',
        };
        logoUrl = 'cid:company-logo';
      }
    }
    // Fall back to remote URL if CID embed failed
    if (!logoUrl && !cleanLogo.toLowerCase().endsWith('.svg')) {
      logoUrl = logoSetting.startsWith('/uploads/') ? `${baseUrl}${logoSetting}` : logoSetting;
    }
  }

  const companyInfo = composeCompanyInfo(settingsMap);

  const html = buildEmailHtml({
    type,
    body,
    companyName,
    companyAddress: companyInfo.addressLines.join('\n'),
    companyContact: [companyInfo.phone, companyInfo.email, companyInfo.website].filter(Boolean).join('  ·  '),
    logoUrl,
    accentColor: settingsMap.accent_color || '#8b5cf6',
    emailHeaderBgColor: settingsMap.email_header_bg_color || null,
    emailAccentColor: settingsMap.email_accent_color || null,
    emailHeaderTextColor: settingsMap.email_header_text_color || null,
    pdfDownloadUrl,
    payOnlineUrl,
    approveQuoteUrl,
    document,
  });

  await job.updateProgress(80);

  // Send email via SMTP
  const transport = createTransporter(smtpSettings);
  const attachments: any[] = [{
    filename: fileName,
    content: Buffer.from(pdfBase64, 'base64'),
    contentType: 'application/pdf',
  }];
  if (logoCid) attachments.push(logoCid);

  await transport.sendMail({
    from: buildFromAddress(smtpSettings),
    to,
    subject,
    html,
    attachments,
  });

  await job.updateProgress(100);

  // Log activity
  const docNum = type === 'quote' ? document.quoteNumber : document.invoiceNumber;
  const docLabel = `${type === 'quote' ? 'Quote' : 'Invoice'} #${String(docNum).padStart(5, '0')}`;
  logActivity({
    userId,
    userDisplayName,
    action: 'emailed',
    entityType: type,
    entityId: documentId,
    entityLabel: `${docLabel} to ${to}`,
  });

  return { success: true, to, documentId };
}
