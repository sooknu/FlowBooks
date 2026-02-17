/**
 * Parse a date-only string (e.g. "2025-02-09") as noon UTC.
 * This prevents timezone shifting — `new Date("2025-02-09")` is UTC midnight,
 * which becomes Feb 8 in America/Los_Angeles. Noon UTC stays on the same
 * calendar day in any timezone from UTC-12 to UTC+14.
 */
export function parseDateInput(d: string | null | undefined): Date | null {
  if (!d) return null;
  // If it's a date-only string (YYYY-MM-DD), pin to noon UTC
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    return new Date(d + 'T12:00:00');
  }
  // Otherwise it already has time info, parse as-is
  return new Date(d);
}
