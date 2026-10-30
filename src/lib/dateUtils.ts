/**
 * Universal Date Utility
 * Formats any date into Date/Month/Year (DD/MM/YYYY) format for display and WhatsApp messages.
 */

export function formatDateToDMY(input?: string | number | Date | null): string {
  if (input === undefined || input === null) return '';
  if (input instanceof Date) {
    if (isNaN(input.getTime())) return '';
    const d = String(input.getDate()).padStart(2, '0');
    const m = String(input.getMonth() + 1).padStart(2, '0');
    const y = input.getFullYear();
    return `${d}/${m}/${y}`;
  }
  const str = String(input).trim();
  if (!str) return '';

  // Already DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
  }

  // YYYY-MM-DD or YYYY/MM/DD (with optional time or ISO timestamp)
  const ymdMatch = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})(?:[T\s].*)?$/);
  if (ymdMatch) {
    const [, y, m, d] = ymdMatch;
    return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
  }

  // Check if parseable Date
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime()) && !/^\d+$/.test(str)) {
    const d = String(parsed.getDate()).padStart(2, '0');
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const y = parsed.getFullYear();
    return `${d}/${m}/${y}`;
  }

  return str;
}

export const toDisplayDate = formatDateToDMY;

export function getTodayKolkataISO(): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());
  } catch {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
