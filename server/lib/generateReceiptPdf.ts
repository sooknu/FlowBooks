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

interface ReceiptData {
  invoiceNumber: number;
  clientName: string;
  amount: number;
  invoiceTotal: number;
  previouslyPaid: number;
  paymentDate: Date;
  transactionId: string;
  paymentMethod?: string;
  settings: Record<string, string>;
}

export async function generateReceiptPdf(data: ReceiptData): Promise<Uint8Array> {
  const { invoiceNumber, clientName, amount, invoiceTotal, previouslyPaid, paymentDate, transactionId, paymentMethod, settings } = data;
  const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]); // US Letter
  const { width, height } = page.getSize();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const black = rgb(0, 0, 0);
  const gray = rgb(0.4, 0.4, 0.4);
  const lightGray = rgb(0.92, 0.92, 0.92);
  const accentColor = rgb(0.22, 0.65, 0.36); // green for receipts
  const margin = 50;
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
        const logoHeight = 45;
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
      // logo failed, try next
    }
  }

  // ── COMPANY INFO (right of logo) ──
  const companyNameX = margin + logoWidth + (logoWidth > 0 ? 12 : 0);
  let companyInfoY = y - 12;

  if (settings.company_name) {
    page.drawText(settings.company_name, {
      x: companyNameX, y: companyInfoY,
      font: boldFont, size: 12, color: black,
    });
    companyInfoY -= 15;
  }
  const companyInfo = composeCompanyInfo(settings);
  for (const line of companyInfo.addressLines) {
    page.drawText(line, {
      x: companyNameX, y: companyInfoY,
      font, size: 9, color: gray,
    });
    companyInfoY -= 11;
  }
  const contactParts = [companyInfo.phone, companyInfo.email].filter(Boolean);
  if (contactParts.length > 0) {
    page.drawText(contactParts.join('  ·  '), {
      x: companyNameX, y: companyInfoY,
      font, size: 8, color: gray,
    });
  }

  // ── TITLE (right-aligned) ──
  const title = 'PAYMENT RECEIPT';
  const titleWidth = boldFont.widthOfTextAtSize(title, 22);
  page.drawText(title, {
    x: width - margin - titleWidth,
    y: y - 20,
    font: boldFont, size: 22, color: accentColor,
  });

  // ── Separator ──
  y -= 70;
  page.drawLine({
    start: { x: margin, y },
    end: { x: width - margin, y },
    thickness: 1,
    color: lightGray,
  });

  // ── Receipt Details ──
  y -= 30;
  const labelX = margin;
  const valueX = margin + 130;
  const docNum = String(invoiceNumber).padStart(5, '0');
  const dateStr = new Intl.DateTimeFormat('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  }).format(paymentDate instanceof Date ? paymentDate : new Date(paymentDate));

  const details = [
    { label: 'Receipt Date:', value: dateStr },
    { label: 'Invoice Number:', value: `#${docNum}` },
    { label: 'Client:', value: clientName || 'N/A' },
    { label: 'Payment Method:', value: paymentMethod || 'Stripe (Credit Card)' },
    { label: 'Transaction ID:', value: transactionId },
  ];

  for (const { label, value } of details) {
    page.drawText(label, {
      x: labelX, y,
      font: boldFont, size: 10, color: black,
    });
    // Truncate very long values (e.g., transaction ID)
    let displayValue = value;
    const maxValueWidth = width - margin - valueX;
    while (font.widthOfTextAtSize(displayValue, 10) > maxValueWidth && displayValue.length > 3) {
      displayValue = displayValue.slice(0, -4) + '...';
    }
    page.drawText(displayValue, {
      x: valueX, y,
      font, size: 10, color: gray,
    });
    y -= 20;
  }

  // ── Invoice Summary ──
  y -= 10;
  const summaryValueX = width - margin;

  const drawSummaryRow = (label: string, value: string, opts: { bold?: boolean; muted?: boolean } = {}) => {
    page.drawText(label, {
      x: labelX, y,
      font: opts.bold ? boldFont : font, size: 10, color: opts.muted ? gray : black,
    });
    const valFont = opts.bold ? boldFont : font;
    const valWidth = valFont.widthOfTextAtSize(value, 10);
    page.drawText(value, {
      x: summaryValueX - valWidth, y,
      font: valFont, size: 10, color: opts.muted ? gray : black,
    });
    y -= 18;
  };

  drawSummaryRow('Invoice Total', formatCurrency(invoiceTotal));
  if (previouslyPaid > 0) {
    drawSummaryRow('Previously Paid', `- ${formatCurrency(previouslyPaid)}`, { muted: true });
  }
  const balanceDue = invoiceTotal - previouslyPaid;
  drawSummaryRow('Balance Due', formatCurrency(balanceDue), { bold: true });

  // ── Amount Box ──
  y -= 8;
  const boxHeight = 60;
  const boxY = y - boxHeight;

  // Light green background
  page.drawRectangle({
    x: margin,
    y: boxY,
    width: width - margin * 2,
    height: boxHeight,
    color: rgb(0.94, 0.99, 0.95),
    borderColor: rgb(0.85, 0.95, 0.87),
    borderWidth: 1,
  });

  // "Amount Paid" label
  const amountLabel = 'Amount Paid';
  page.drawText(amountLabel, {
    x: margin + 20,
    y: boxY + boxHeight / 2 + 2,
    font, size: 11, color: gray,
  });

  // Amount value (right-aligned, bold, large)
  const amountStr = formatCurrency(amount);
  const amountWidth = boldFont.widthOfTextAtSize(amountStr, 24);
  page.drawText(amountStr, {
    x: width - margin - 20 - amountWidth,
    y: boxY + boxHeight / 2 - 4,
    font: boldFont, size: 24, color: accentColor,
  });

  // ── New Balance ──
  const newBalance = Math.max(0, balanceDue - amount);
  y = boxY - 22;
  const newBalLabel = 'New Balance';
  page.drawText(newBalLabel, {
    x: labelX, y,
    font: boldFont, size: 10, color: black,
  });
  const newBalStr = newBalance <= 0 ? 'PAID IN FULL' : formatCurrency(newBalance);
  const newBalFont = boldFont;
  const newBalColor = newBalance <= 0 ? accentColor : black;
  const newBalWidth = newBalFont.widthOfTextAtSize(newBalStr, 10);
  page.drawText(newBalStr, {
    x: summaryValueX - newBalWidth, y,
    font: newBalFont, size: 10, color: newBalColor,
  });

  // ── Separator ──
  y -= 20;
  page.drawLine({
    start: { x: margin, y },
    end: { x: width - margin, y },
    thickness: 1,
    color: lightGray,
  });

  // ── Thank You ──
  y -= 25;
  const thankYou = 'Thank you for your payment!';
  const thankWidth = boldFont.widthOfTextAtSize(thankYou, 13);
  page.drawText(thankYou, {
    x: (width - thankWidth) / 2,
    y,
    font: boldFont, size: 13, color: black,
  });

  y -= 18;
  const subMsg = settings.company_name
    ? `This receipt confirms your payment to ${settings.company_name}.`
    : 'This receipt confirms your payment has been processed.';
  const subWidth = font.widthOfTextAtSize(subMsg, 9);
  page.drawText(subMsg, {
    x: (width - subWidth) / 2,
    y,
    font, size: 9, color: gray,
  });

  // ── Footer ──
  const footerY = margin + 10;
  const gateway = paymentMethod === 'PayPal' ? 'PayPal' : 'Stripe';
  const footerText = `Payment processed securely by ${gateway}`;
  const footerWidth = font.widthOfTextAtSize(footerText, 8);
  page.drawText(footerText, {
    x: (width - footerWidth) / 2,
    y: footerY,
    font, size: 8, color: rgb(0.6, 0.6, 0.6),
  });

  return pdfDoc.save();
}
