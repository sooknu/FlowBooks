import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

export function formatPhoneNumber(phoneNumberString) {
  if (!phoneNumberString) return null;
  const cleaned = ('' + phoneNumberString).replace(/\D/g, '');
  const match = cleaned.match(/^(\d{3})(\d{3})(\d{4})$/);
  if (match) {
    return '(' + match[1] + ') ' + match[2] + '-' + match[3];
  }
  return phoneNumberString;
}

/** Progressive phone formatting — formats as the user types */
export function formatPhoneInput(value) {
  const digits = ('' + (value || '')).replace(/\D/g, '').slice(0, 10);
  if (digits.length === 0) return '';
  if (digits.length <= 3) return '(' + digits;
  if (digits.length <= 6) return '(' + digits.slice(0, 3) + ') ' + digits.slice(3);
  return '(' + digits.slice(0, 3) + ') ' + digits.slice(3, 6) + '-' + digits.slice(6);
}

export function groupByCategory(products) {
  const groups = {};
  products.forEach(p => {
    const cat = p.category || 'Uncategorized';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(p);
  });
  return Object.keys(groups)
    .sort((a, b) => {
      if (a === 'Uncategorized') return 1;
      if (b === 'Uncategorized') return -1;
      return a.localeCompare(b);
    })
    .map(key => ({ category: key, products: groups[key] }));
}

export function parseCsvLine(line) {
  const result = [];
  let inQuote = false;
  let currentField = '';

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuote && nextChar === '"') { // Handle escaped double quote
        currentField += '"';
        i++; // Skip next char
      } else {
        inQuote = !inQuote;
      }
    } else if (char === ',' && !inQuote) {
      result.push(currentField.trim());
      currentField = '';
    } else {
      currentField += char;
    }
  }
  result.push(currentField.trim()); // Add the last field
  return result;
}

// ── Timezone-aware date formatting ──────────────────────────────────────────
const TZ = 'America/Los_Angeles';

/** Format date: "Feb 13, 2026" style — options merged with timezone */
export function fmtDate(d, opts = {}) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { timeZone: TZ, ...opts });
}

/** Format time: "7:51 PM" style */
export function fmtTime(d, opts = {}) {
  if (!d) return '';
  return new Date(d).toLocaleTimeString('en-US', { timeZone: TZ, hour: '2-digit', minute: '2-digit', ...opts });
}

/** Format date + time: "Feb 13, 2026, 7:51 PM" */
export function fmtDateTime(d) {
  if (!d) return '';
  return `${fmtDate(d, { month: 'short', day: 'numeric', year: 'numeric' })} ${fmtTime(d)}`;
}

/** Get date parts in our timezone (for .getDate()/.getMonth() replacements) */
export function tzDate(d) {
  if (!d) return new Date();
  // Create a date string in our timezone, then parse it
  const str = new Date(d).toLocaleString('en-US', { timeZone: TZ });
  return new Date(str);
}

/** Convert a server timestamp to YYYY-MM-DD for date inputs, in our timezone */
export function toDateInput(d) {
  if (!d) return '';
  const dt = tzDate(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

export function timeAgo(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { timeZone: TZ, month: 'short', day: 'numeric', ...(diffDays > 365 ? { year: 'numeric' } : {}) });
}