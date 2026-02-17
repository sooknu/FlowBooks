/** Format a phone number to (XXX) XXX-XXXX for 10-digit US numbers */
export function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return value; // Return as-is for non-10-digit numbers
}

/**
 * Composes formatted company info from structured setting keys.
 * Used by PDF generation, email templates, and public payment page.
 */
export function composeCompanyInfo(settings: Record<string, string>) {
  const street = settings.company_street || '';
  const city = settings.company_city || '';
  const state = settings.company_state || '';
  const zip = settings.company_zip || '';
  const rawPhone = settings.company_phone || '';
  const email = settings.company_email || '';
  const website = settings.company_website || '';

  const phone = rawPhone ? formatPhone(rawPhone) : '';

  // Build address lines
  const addressLines: string[] = [];
  if (street) addressLines.push(street);
  const cityStateZip = [
    [city, state].filter(Boolean).join(', '),
    zip,
  ].filter(Boolean).join(' ');
  if (cityStateZip) addressLines.push(cityStateZip);

  // Full text block (for footers, etc.)
  const allLines = [...addressLines];
  if (phone) allLines.push(phone);
  if (email) allLines.push(email);
  if (website) allLines.push(website);
  const fullBlock = allLines.join('\n');

  return { addressLines, phone, email, website, fullBlock };
}

/** The setting keys needed for composeCompanyInfo */
export const COMPANY_INFO_KEYS = [
  'company_street', 'company_city', 'company_state', 'company_zip',
  'company_phone', 'company_email', 'company_website',
] as const;
