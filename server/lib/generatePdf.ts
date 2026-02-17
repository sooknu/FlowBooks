import { db } from '../db';
import { quotes, invoices, appSettings } from '../db/schema';
import { eq, inArray } from 'drizzle-orm';
import { serializeItems } from './items';
import { composeCompanyInfo, COMPANY_INFO_KEYS } from './companyInfo';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, '..', 'uploads');

const formatCurrency = (amount: any) => {
  if (typeof amount !== 'number') amount = parseFloat(amount) || 0;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
};

const formatPhoneNumber = (phone: string | null) => {
  if (!phone) return null;
  const cleaned = phone.replace(/\D/g, '');
  const match = cleaned.match(/^(\d{3})(\d{3})(\d{4})$/);
  if (match) return `(${match[1]}) ${match[2]}-${match[3]}`;
  return phone;
};

function wrapText(text: string, font: any, fontSize: number, maxWidth: number) {
  if (!text) return [''];
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(test, fontSize) > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export async function generatePdfBase64({ type, documentId }: { type: string; documentId: string }) {
  // Fetch document
  const itemsOrdered = { orderBy: (items: any, { asc }: any) => [asc(items.sortOrder)] };
  let document: any;
  if (type === 'quote') {
    document = await db.query.quotes.findFirst({
      where: eq(quotes.id, documentId),
      with: { client: true, items: itemsOrdered, projectTypeRel: true },
    });
  } else if (type === 'invoice') {
    document = await db.query.invoices.findFirst({
      where: eq(invoices.id, documentId),
      with: { client: true, payments: true, items: itemsOrdered, projectTypeRel: true },
    });
  }
  if (!document) throw new Error('Document not found');
  document.items = serializeItems(document.items ?? []);

  // Fetch settings
  const settingsRows = await db
    .select()
    .from(appSettings)
    .where(inArray(appSettings.key, [
      'company_name', ...COMPANY_INFO_KEYS,
      'secondary_logo_url', 'secondary_logo_light_url', 'header_logo_url', 'header_logo_light_url',
      'terms_template',
    ]));
  const settings: Record<string, string> = {};
  for (const s of settingsRows) settings[s.key] = s.value;

  // Generate PDF
  const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');
  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage([612, 792]); // US Letter
  const { width, height } = page.getSize();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const black = rgb(0, 0, 0);
  const gray = rgb(0.3, 0.3, 0.3);
  const lightGray = rgb(0.85, 0.85, 0.85);
  const headerBg = rgb(0.12, 0.12, 0.18);
  const white = rgb(1, 1, 1);
  const margin = 35;
  let y = height - margin;

  // ── LOGO ──
  let logoWidth = 0;
  const logoUrls = [
    settings.secondary_logo_light_url,
    settings.secondary_logo_url,
    settings.header_logo_light_url,
    settings.header_logo_url,
  ].filter(Boolean);

  for (const rawLogoUrl of logoUrls) {
    const logoUrl = rawLogoUrl.split('?')[0];
    if (logoUrl.toLowerCase().endsWith('.svg')) continue;

    try {
      let logoBytes: Uint8Array | undefined;
      let ext = '';
      if (logoUrl.startsWith('/uploads/')) {
        const filePath = path.join(uploadsDir, logoUrl.replace('/uploads/', ''));
        if (fs.existsSync(filePath)) {
          ext = path.extname(filePath).toLowerCase();
          if (ext === '.svg') continue;
          logoBytes = new Uint8Array(fs.readFileSync(filePath));
        }
      } else {
        const resp = await fetch(logoUrl);
        const ct = resp.headers.get('content-type') || '';
        if (ct.includes('svg')) continue;
        logoBytes = new Uint8Array(await resp.arrayBuffer());
        ext = ct.includes('png') ? '.png' : '.jpg';
      }
      if (logoBytes) {
        let logoImage;
        if (ext === '.png') logoImage = await pdfDoc.embedPng(logoBytes);
        else logoImage = await pdfDoc.embedJpg(logoBytes);

        const logoHeight = 65;
        const logoDims = logoImage.scale(logoHeight / logoImage.height);
        logoWidth = logoDims.width;
        page.drawImage(logoImage, {
          x: margin,
          y: y - logoHeight,
          width: logoDims.width,
          height: logoDims.height,
        });
        break;
      }
    } catch {
      // This logo failed, try next
    }
  }

  // ── COMPANY INFO (right of logo) ──
  const companyNameX = margin + logoWidth + (logoWidth > 0 ? 15 : 0);
  let companyInfoY = y - 15;
  const companyInfoMaxWidth = width - margin - companyNameX - 150;

  if (settings.company_name) {
    page.drawText(settings.company_name, {
      x: companyNameX, y: companyInfoY,
      font: boldFont, size: 12, color: black,
      maxWidth: companyInfoMaxWidth,
    });
    companyInfoY -= 16;
  }
  const companyInfo = composeCompanyInfo(settings);
  for (const line of companyInfo.addressLines) {
    page.drawText(line, {
      x: companyNameX, y: companyInfoY,
      font, size: 10, color: gray,
      maxWidth: companyInfoMaxWidth,
    });
    companyInfoY -= 12;
  }
  if (companyInfo.phone) {
    page.drawText(companyInfo.phone, {
      x: companyNameX, y: companyInfoY,
      font, size: 9, color: gray,
    });
    companyInfoY -= 12;
  }
  if (companyInfo.email) {
    page.drawText(companyInfo.email, {
      x: companyNameX, y: companyInfoY,
      font, size: 9, color: gray,
    });
    companyInfoY -= 12;
  }
  if (companyInfo.website) {
    page.drawText(companyInfo.website, {
      x: companyNameX, y: companyInfoY,
      font, size: 9, color: gray,
    });
    companyInfoY -= 12;
  }

  // ── DOC TITLE (right-aligned) ──
  const docTitle = type === 'quote' ? 'QUOTE' : 'INVOICE';
  const docTitleWidth = boldFont.widthOfTextAtSize(docTitle, 28);
  page.drawText(docTitle, {
    x: width - margin - docTitleWidth,
    y: y - 28,
    font: boldFont, size: 28, color: black,
  });

  // ── DOC NUMBER & DATE (right-aligned) ──
  const docNum = type === 'quote'
    ? String(document.quoteNumber).padStart(5, '0')
    : String(document.invoiceNumber).padStart(5, '0');
  const infoY = y - 60;

  const drawInfoLine = (label: string, value: string, yPos: number) => {
    const fullText = `${label} ${value}`;
    const textWidth = boldFont.widthOfTextAtSize(fullText, 10);
    page.drawText(label, {
      x: width - margin - textWidth, y: yPos,
      font, size: 10, color: gray,
    });
    page.drawText(value, {
      x: width - margin - textWidth + font.widthOfTextAtSize(label, 10), y: yPos,
      font: boldFont, size: 10, color: black,
    });
  };

  drawInfoLine(`${type === 'quote' ? 'Quote #' : 'Invoice #'}:`, docNum, infoY);
  drawInfoLine('Date:', new Date(document.createdAt).toLocaleDateString(), infoY - 15);

  y = height - margin - 120;

  // ── BILL TO (left) + EVENT DETAILS (right) — same row ──
  const sectionStartY = y;
  const client = document.client;
  const rightColX = width / 2 + 60;
  const rightColMaxW = width - margin - rightColX;

  // Bill To (left column)
  let billToY = sectionStartY;
  page.drawText('Bill To:', { x: margin, y: billToY, font: boldFont, size: 11, color: black });
  billToY -= 15;
  if (document.clientName) {
    page.drawText(document.clientName, { x: margin, y: billToY, font: boldFont, size: 10, color: gray });
    billToY -= 12;
  }
  if (client?.company) {
    page.drawText(client.company, { x: margin, y: billToY, font, size: 10, color: gray });
    billToY -= 12;
  }
  if (client?.email) {
    page.drawText(client.email, { x: margin, y: billToY, font, size: 10, color: gray });
    billToY -= 12;
  }
  if (client?.phone) {
    page.drawText(formatPhoneNumber(client.phone)!, { x: margin, y: billToY, font, size: 10, color: gray });
    billToY -= 12;
  }
  const addrLines = [
    client?.billingStreet,
    [client?.billingCity, client?.billingState, client?.billingPostalCode].filter(Boolean).join(', '),
  ].filter(Boolean);
  for (const line of addrLines) {
    page.drawText(line, { x: margin, y: billToY, font, size: 10, color: gray });
    billToY -= 12;
  }

  // Event Details (right column)
  let eventY = sectionStartY;
  const typeLabel = document.projectTypeRel?.label || document.eventType;
  const hasEventInfo = document.eventDate || document.eventLocation || typeLabel;
  if (hasEventInfo) {
    page.drawText('Event Details:', { x: rightColX, y: eventY, font: boldFont, size: 11, color: black });
    eventY -= 15;
    if (typeLabel) {
      page.drawText(`Type: ${typeLabel}`, { x: rightColX, y: eventY, font, size: 10, color: gray });
      eventY -= 12;
    }
    if (document.eventDate) {
      page.drawText(`Date: ${new Date(document.eventDate).toLocaleDateString()}`, { x: rightColX, y: eventY, font, size: 10, color: gray });
      eventY -= 12;
    }
    if (document.eventLocation) {
      const locLines = wrapText(`Location: ${document.eventLocation}`, font, 10, rightColMaxW);
      for (const ll of locLines) {
        page.drawText(ll, { x: rightColX, y: eventY, font, size: 10, color: gray });
        eventY -= 12;
      }
    }
  }

  // Continue from whichever column went lower
  y = Math.min(billToY, eventY) - 25;

  // ── TABLE HEADER (dark bar) ──
  const col = {
    item: margin + 6,
    desc: margin + 170,
    qty: width - margin - 105,
    total: width - margin - 55,
  };
  const headerBarH = 22;

  page.drawRectangle({
    x: margin, y: y - 4,
    width: width - margin * 2, height: headerBarH,
    color: headerBg,
  });
  page.drawText('Item', { x: col.item, y: y + 1, font: boldFont, size: 9, color: white });
  page.drawText('Description', { x: col.desc, y: y + 1, font: boldFont, size: 9, color: white });
  page.drawText('Qty', { x: col.qty, y: y + 1, font: boldFont, size: 9, color: white });
  page.drawText('Total', { x: col.total, y: y + 1, font: boldFont, size: 9, color: white });

  y -= (headerBarH + 8);

  // ── TABLE ROWS ──
  const items = Array.isArray(document.items) ? document.items : [];
  const ITEM_MAX_W = col.desc - col.item - 10;
  const DESC_MAX_W = col.qty - col.desc - 10;
  const ROW_PAD = 10;

  for (const item of items) {
    const nameLines = wrapText(item.name || 'Item', font, 9, ITEM_MAX_W);
    const descLines = wrapText(item.description || '', font, 9, DESC_MAX_W);
    const itemLines = nameLines.length;
    const rowH = Math.max(itemLines, descLines.length, 1) * 12;

    if (y - rowH < 60) {
      page = pdfDoc.addPage([612, 792]);
      y = 792 - margin;
    }

    for (let i = 0; i < nameLines.length; i++) {
      page.drawText(nameLines[i], { x: col.item, y: y - i * 12, font, size: 9, color: black });
    }

    for (let i = 0; i < descLines.length; i++) {
      if (descLines[i]) {
        page.drawText(descLines[i], { x: col.desc, y: y - i * 12, font, size: 9, color: gray });
      }
    }

    const qtyText = String(item.quantity || item.qty || 1);
    page.drawText(qtyText, { x: col.qty, y, font, size: 9, color: gray });

    const totalText = formatCurrency(item.total || 0);
    const totalW = font.widthOfTextAtSize(totalText, 9);
    page.drawText(totalText, { x: width - margin - totalW - 6, y, font, size: 9, color: gray });

    y -= rowH + ROW_PAD;

    page.drawLine({
      start: { x: margin, y: y + 8 },
      end: { x: width - margin, y: y + 8 },
      thickness: 0.5, color: lightGray,
    });
    y -= 5;
  }

  y -= 10;

  // ── TOTALS ──
  const totalsX = width - margin - 200;
  const totalsValX = width - margin - 10;

  const drawTotalLine = (label: string, value: string, isBold = false, size = 10, color = gray) => {
    const fnt = isBold ? boldFont : font;
    const c = isBold ? black : color;
    page.drawText(label, { x: totalsX, y, font: fnt, size, color: c });
    const valW = fnt.widthOfTextAtSize(value, size);
    page.drawText(value, { x: totalsValX - valW, y, font: fnt, size, color: c });
    y -= size + 8;
  };

  drawTotalLine('Subtotal:', formatCurrency(document.subtotal || 0));
  if (document.discountAmount > 0) {
    drawTotalLine('Discount:', `- ${formatCurrency(document.discountAmount)}`);
  }
  drawTotalLine('Tax:', formatCurrency(document.tax || 0));
  drawTotalLine('Total:', formatCurrency(document.total), true, 12);

  if (type === 'invoice') {
    if (document.paidAmount > 0) {
      drawTotalLine('Paid:', `- ${formatCurrency(document.paidAmount)}`, false, 10, rgb(0.1, 0.55, 0.1));
    }
    const balanceDue = document.total - (document.paidAmount || 0);
    y -= 5;
    drawTotalLine('Balance Due:', formatCurrency(balanceDue), true, 14);
    if (document.depositAmount > 0 && document.paidAmount < document.depositAmount) {
      const depositDue = document.depositAmount - (document.paidAmount || 0);
      drawTotalLine('Deposit Due:', formatCurrency(depositDue), false, 10, rgb(0.7, 0.4, 0.0));
    }
  }

  // ── NOTES ──
  if (document.notes) {
    y -= 10;
    if (y < 80) {
      page = pdfDoc.addPage([612, 792]);
      y = 792 - margin;
    }
    page.drawText('Notes:', { x: margin, y, font: boldFont, size: 10, color: black });
    y -= 14;
    const noteLines = document.notes.split('\n');
    for (const line of noteLines) {
      const wrapped = wrapText(line, font, 9, width - margin * 2);
      for (const wl of wrapped) {
        page.drawText(wl, { x: margin, y, font, size: 9, color: gray });
        y -= 12;
      }
    }
  }

  // ── TERMS ──
  const termsText = document.terms || settings.terms_template;
  if (termsText) {
    y -= 10;
    if (y < 80) {
      page = pdfDoc.addPage([612, 792]);
      y = 792 - margin;
    }
    page.drawText('Terms & Conditions:', { x: margin, y, font: boldFont, size: 10, color: black });
    y -= 14;
    const termsLines = termsText.split('\n');
    for (const tl of termsLines) {
      const wrapped = wrapText(tl, font, 8, width - margin * 2);
      for (const wl of wrapped) {
        if (y < 50) {
          page = pdfDoc.addPage([612, 792]);
          y = 792 - margin;
        }
        page.drawText(wl, { x: margin, y, font, size: 8, color: gray });
        y -= 11;
      }
    }
  }

  // ── FOOTER ──
  const footerText = type === 'quote'
    ? 'This quote is valid for the next 30 days of issue.'
    : 'Thank you for your business!';
  const footerW = font.widthOfTextAtSize(footerText, 9);
  const pages = pdfDoc.getPages();
  const lastPage = pages[pages.length - 1];
  lastPage.drawText(footerText, {
    x: (width - footerW) / 2, y: 30,
    font, size: 9, color: gray,
  });

  // Save
  const pdfBytes = await pdfDoc.save();
  const pdfBase64 = Buffer.from(pdfBytes).toString('base64');

  const fileName = type === 'quote'
    ? `Quote-${docNum}.pdf`
    : `Invoice-${docNum}.pdf`;

  return { pdfBase64, fileName };
}
