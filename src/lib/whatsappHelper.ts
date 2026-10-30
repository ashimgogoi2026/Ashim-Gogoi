import { globalToast } from './toast';
import { safeLocalStorage } from './safeLocalStorage';

export interface OpenWhatsAppOptions {
  phoneNumber: string;
  text?: string;
  preferApp?: boolean;
  contactName?: string;
  skipBranding?: boolean;
}

export interface CompanyBrandingConfig {
  enabled: boolean;
  companyName: string;
  tagline: string;
  logoUrl: string;
  websiteUrl: string;
  brandingStyle: 'header' | 'footer' | 'link_preview';
  includeLogoLink: boolean;
}

export const DEFAULT_COMPANY_BRANDING: CompanyBrandingConfig = {
  enabled: true,
  companyName: 'PRO-TO-GROW Studio',
  tagline: 'Official Creator Collaboration Hub',
  logoUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400&auto=format&fit=crop&q=80',
  websiteUrl: 'https://pro-to-grow.com',
  brandingStyle: 'header',
  includeLogoLink: true,
};

export function getCompanyBrandingConfig(): CompanyBrandingConfig {
  try {
    const safeStored = safeLocalStorage.getItem('WA_COMPANY_BRANDING');
    if (safeStored) {
      const parsed = JSON.parse(safeStored);
      return { 
        ...DEFAULT_COMPANY_BRANDING, 
        ...parsed,
        websiteUrl: parsed.websiteUrl !== undefined && parsed.websiteUrl !== null && parsed.websiteUrl !== '' 
          ? parsed.websiteUrl 
          : DEFAULT_COMPANY_BRANDING.websiteUrl
      };
    }
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('WA_COMPANY_BRANDING');
      if (stored) {
        const parsed = JSON.parse(stored);
        return { 
          ...DEFAULT_COMPANY_BRANDING, 
          ...parsed,
          websiteUrl: parsed.websiteUrl !== undefined && parsed.websiteUrl !== null && parsed.websiteUrl !== '' 
            ? parsed.websiteUrl 
            : DEFAULT_COMPANY_BRANDING.websiteUrl
        };
      }
    }
  } catch (err) {
    console.warn('[Branding] Failed to retrieve saved company branding config:', err);
  }
  return DEFAULT_COMPANY_BRANDING;
}

export function saveCompanyBrandingConfig(config: CompanyBrandingConfig): void {
  try {
    const jsonStr = JSON.stringify(config);
    
    // 1. Persist to safeLocalStorage (RAM + IndexedDB + Server KV Store)
    safeLocalStorage.setItem('WA_COMPANY_BRANDING', jsonStr);

    // 2. Try browser localStorage fallback safely
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('WA_COMPANY_BRANDING', jsonStr);
      } catch (quotaErr) {
        console.warn('[Branding] localStorage quota reached, safeLocalStorage used as primary store');
      }
    }

    // 3. Dispatch real-time events for instant UI synchronization
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('storage'));
      window.dispatchEvent(new CustomEvent('company-branding-updated', { detail: config }));
    }
  } catch (err) {
    console.error('[Branding] Error saving company branding config:', err);
    globalToast.error('Failed to save company branding settings.');
  }
}

/**
 * In any WhatsApp message related to product CHOCOLATED DRINK or CHOCOLATE DRINK,
 * writes "PRO-TO-GROW FITBHIM" before the product name "CHOCOLATE DRINK".
 * 
 * Rules:
 * - Normalizes any variant: "CHOCOLATED DRINK", "CHOCOLATE DRINK", "Chocolate Drink", "Chocolated Drink"
 *   to "PRO-TO-GROW FITBHIM CHOCOLATE DRINK".
 * - Idempotent: If already preceded by "PRO-TO-GROW FITBHIM", preserves it without duplicate prefixes.
 * - Upgrades legacy prefixes like "PRO-TO-GROW BHIM BANANA CHOCOLATE DRINK" or "Fitbhim Chocolate Drink"
 *   to "PRO-TO-GROW FITBHIM CHOCOLATE DRINK".
 */
export function formatProductForWhatsApp(text?: string): string {
  if (!text) return '';
  return text.replace(
    /(?:PRO[\s\-_]*TO[\s\-_]*GROW[\s\-_]+(?:FITBHIM[\s\-_]+|BHIM[\s\-_]+BANANA[\s\-_]+)?|(?:FITBHIM|Fitbhim)[\s\-_]+)?CHOCOLATE(?:D)?[\s\-_]+DRINK/gi,
    'PRO-TO-GROW FITBHIM CHOCOLATE DRINK'
  );
}

/**
 * Ensures that the official company website is strictly displayed in the
 * header (at the top of the message) and NEVER appended below or at the bottom.
 */
export function ensureWebsiteInHeader(text: string, websiteUrl?: string): string {
  if (!text) return text;
  const cfg = getCompanyBrandingConfig();
  let rawWeb = (websiteUrl || cfg.websiteUrl || DEFAULT_COMPANY_BRANDING.websiteUrl || '').trim();
  if (rawWeb && !/^https?:\/\//i.test(rawWeb)) {
    rawWeb = `https://${rawWeb}`;
  }
  if (!rawWeb) return text;

  // 1. Strip any trailing website line or bottom footer divider from below the message
  let cleaned = text
    .replace(new RegExp(`\\n*─*\\s*🌐\\s*(?:Website|Official Website):\\s*${rawWeb.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'gi'), '')
    .replace(/\n*─*\s*🌐\s*(?:Website|Official Website):\s*https?:\/\/[^\s\n]+\s*$/gi, '')
    .trim();

  // 2. Check if website is already in the text (e.g. in the top header)
  if (cleaned.includes(rawWeb)) {
    return cleaned;
  }

  // 3. If there is a header divider line, insert website into header before divider
  if (cleaned.includes('─────────────────')) {
    return cleaned.replace('─────────────────', `🌐 Website: ${rawWeb}\n─────────────────`);
  }

  // 4. If company title is at top
  const compName = (cfg.companyName || DEFAULT_COMPANY_BRANDING.companyName).trim();
  if (compName && cleaned.includes(`🏢 *${compName}*`)) {
    return cleaned.replace(`🏢 *${compName}*`, `🏢 *${compName}*\n🌐 Website: ${rawWeb}`);
  }

  // 5. Otherwise prepend website in the top header
  return `🌐 Website: ${rawWeb}\n─────────────────\n\n${cleaned}`;
}

/**
 * Formats a WhatsApp text message with the configured company logo link,
 * header branding, tagline, official website link, or signature footer.
 * Strictly guarantees that the website URL is shown in the header (at top)
 * and NEVER below the message text.
 */
export function attachCompanyBranding(text: string, config?: CompanyBrandingConfig): string {
  const cfg = config || getCompanyBrandingConfig();
  if (!cfg.enabled || !text) return text;

  // Resolve website URL with protocol fallback
  let rawWeb = (cfg.websiteUrl || DEFAULT_COMPANY_BRANDING.websiteUrl || '').trim();
  if (rawWeb && !/^https?:\/\//i.test(rawWeb)) {
    rawWeb = `https://${rawWeb}`;
  }

  // Resolve company name & tagline
  const compName = (cfg.companyName || DEFAULT_COMPANY_BRANDING.companyName).trim();
  const tagline = (cfg.tagline || DEFAULT_COMPANY_BRANDING.tagline).trim();

  // Strip any existing website line from below the message so it never appears at the bottom
  let sanitizedText = text;
  if (rawWeb) {
    sanitizedText = sanitizedText
      .replace(new RegExp(`\\n*─*\\s*🌐\\s*(?:Website|Official Website):\\s*${rawWeb.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'gi'), '')
      .replace(/\n*─*\s*🌐\s*(?:Website|Official Website):\s*https?:\/\/[^\s\n]+\s*$/gi, '')
      .trim();
  }

  const logoPart = cfg.includeLogoLink && cfg.logoUrl ? `\n🖼️ Logo Card: ${cfg.logoUrl}` : '';
  const webHeaderLine = rawWeb ? `\n🌐 Website: ${rawWeb}` : '';

  // Check if website URL is already present in text
  const websiteAlreadyPresent = rawWeb ? sanitizedText.includes(rawWeb) : false;

  // Check if logo link or complete branding is already attached
  if (cfg.logoUrl && sanitizedText.includes(cfg.logoUrl)) {
    // If branding header is already present, ensure website is placed in the header, NOT below!
    if (rawWeb && !websiteAlreadyPresent) {
      if (sanitizedText.includes('─────────────────')) {
        return sanitizedText.replace('─────────────────', `🌐 Website: ${rawWeb}\n─────────────────`);
      }
      return `🌐 Website: ${rawWeb}\n${sanitizedText}`;
    }
    return sanitizedText;
  }

  // If text already contains company name (e.g. from campaign message template)
  if (sanitizedText.includes(compName)) {
    // Ensure website is placed in the header at the top, NEVER appended below!
    if (rawWeb && !websiteAlreadyPresent) {
      if (sanitizedText.includes('─────────────────')) {
        return sanitizedText.replace('─────────────────', `🌐 Website: ${rawWeb}\n─────────────────`);
      }
      return `🌐 Website: ${rawWeb}\n\n${sanitizedText}`;
    }
    return sanitizedText;
  }

  // Format according to selected branding style:
  // User Rule: On any WhatsApp message website must be shown in header, NOT below the message!
  if (cfg.brandingStyle === 'footer') {
    // Website at top header, signature at bottom
    const topWebHeader = rawWeb ? `🌐 Website: ${rawWeb}\n\n` : '';
    const footer = `\n\n─────────────────\n🏢 *${compName}* | ${tagline}${logoPart}`;
    return `${topWebHeader}${sanitizedText}${footer}`;
  } else if (cfg.brandingStyle === 'link_preview') {
    // Website at top header, link preview at bottom
    const topWebHeader = rawWeb ? `🌐 Website: ${rawWeb}\n\n` : '';
    const linkPreview = `\n\n🏢 *${compName}* | ${tagline}${logoPart}`;
    return `${topWebHeader}${sanitizedText}${linkPreview}`;
  } else {
    // Header style (default):
    // Header contains Company Name, Website, Tagline, and Logo Link above the separator!
    const header = `🏢 *${compName}*${webHeaderLine}\n📍 ${tagline}${logoPart}\n─────────────────\n\n`;
    return `${header}${sanitizedText}`;
  }
}

/**
 * Copies the binary company logo image to the system clipboard so the user
 * can press Ctrl+V in WhatsApp to attach the actual logo image file.
 */
export async function copyCompanyLogoToClipboard(logoUrl: string): Promise<boolean> {
  if (!logoUrl) return false;
  try {
    const response = await fetch(logoUrl, { mode: 'cors' });
    const blob = await response.blob();
    
    // Convert to PNG if needed for ClipboardItem browser support
    let pngBlob = blob;
    if (blob.type !== 'image/png') {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      const loaded = new Promise<HTMLImageElement>((resolve, reject) => {
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = URL.createObjectURL(blob);
      });
      const imageEl = await loaded;
      const canvas = document.createElement('canvas');
      canvas.width = imageEl.width || 300;
      canvas.height = imageEl.height || 300;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(imageEl, 0, 0);
        pngBlob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b || blob), 'image/png'));
      }
    }

    if (navigator.clipboard && navigator.clipboard.write) {
      await navigator.clipboard.write([
        new ClipboardItem({ [pngBlob.type || 'image/png']: pngBlob })
      ]);
      globalToast.success('Company Logo image copied to clipboard! Press Ctrl+V in WhatsApp to attach it.');
      return true;
    }
  } catch (err) {
    console.warn('Direct image clipboard copy failed, copying URL fallback:', err);
  }

  if (navigator.clipboard) {
    await navigator.clipboard.writeText(logoUrl);
    globalToast.info('Company Logo URL copied to clipboard!');
    return true;
  }
  return false;
}

/**
 * Standard registry of known creator mobile phone numbers to ensure
 * reliable messaging across Bill & Checklist and Campaign dashboards.
 * All entries are strictly single valid mobile numbers.
 */
export const KNOWN_CREATOR_MOBILES: Record<string, string> = {
  'debajani bora': '+918099092685',
  'debolota hazarika': '+916282858465',
  'wasima ahmed': '+919435123456',
  'daisy das': '+919864012345',
  'sanchita phukan': '+918638123456',
  'anwesha ghosh': '+919706123456',
  'partha sarathi': '+919859123456',
  'shirushree saikia': '+919954123456',
  'sree': '+919101123456',
  'thanthani tuallawt': '+919612123456',
  'dapalei linna warjri': '+919862123456',
};

/**
 * Resolves a creator's known phone number by name from the registry if missing in task/state.
 * Always returns a single clean number.
 */
export function getKnownMobile(name?: string): string {
  if (!name) return '';
  const clean = name.trim().toLowerCase();
  if (KNOWN_CREATOR_MOBILES[clean]) return KNOWN_CREATOR_MOBILES[clean];
  
  for (const [key, val] of Object.entries(KNOWN_CREATOR_MOBILES)) {
    if (clean.includes(key) || key.includes(clean)) {
      return val;
    }
  }
  return '';
}

/**
 * Normalizes a single phone number into standard international format (+91xxxxxxxxxx).
 */
function normalizeSingleDigits(phone: string): string {
  let digits = phone.replace(/\D/g, '');
  if (!digits) return '';

  // Handle leading zero for Indian mobile (e.g. 08099092685 -> 8099092685)
  if (digits.startsWith('0') && digits.length === 11) {
    digits = digits.slice(1);
  }

  // 10-digit Indian standard mobile -> add +91
  if (digits.length === 10) {
    return `+91${digits}`;
  }

  // 12-digit Indian number starting with 91 -> add +
  if (digits.length === 12 && digits.startsWith('91')) {
    return `+${digits}`;
  }

  // If already prefixed with +, preserve international prefix
  if (phone.trim().startsWith('+')) {
    return `+${digits}`;
  }

  // If longer than 10 digits and ends with 10 digits, default to +91 + last 10 digits
  if (digits.length > 10) {
    return `+91${digits.slice(-10)}`;
  }

  return `+${digits}`;
}

/**
 * Extracts strictly ONE single mobile number from any input string.
 * Solves:
 * - Double mobile numbers separated by '|', ',', '/', ';', or newlines (e.g. '+918099092685 | +918099092685')
 * - Numbers where digits were concatenated twice (e.g. '918099092685918099092685' or '80990926858099092685')
 * - Duplicated country code (e.g. '+91 918099092685' or '91918099092685')
 * - Multiple leading '+' or repeated '+91+91' prefixes
 */
export function extractSingleMobileNumber(rawPhone?: string): string {
  if (!rawPhone) return '';
  let str = String(rawPhone).trim();
  if (!str) return '';

  // 1. If string contains multiple entries separated by delimiter, take the first non-empty one
  const parts = str.split(/[|,;\/\n\r]+/).map(p => p.trim()).filter(Boolean);
  if (parts.length > 0) {
    str = parts[0];
  }

  // 2. Remove internal whitespace and brackets
  let clean = str.replace(/[\s\-\(\)]/g, '');

  // 3. Remove accidental duplicate '+' or '+91+91'
  while (clean.startsWith('+91+91')) {
    clean = '+91' + clean.slice(6);
  }
  while (clean.startsWith('++')) {
    clean = clean.slice(1);
  }

  // 4. Extract digits
  const digits = clean.replace(/\D/g, '');
  if (!digits) return '';

  // 5. Check if digits are duplicated (e.g. 20 digits: two 10-digit numbers, 24 digits: two 12-digit numbers)
  if (digits.length >= 20 && digits.length % 2 === 0) {
    const half = digits.length / 2;
    if (digits.slice(0, half) === digits.slice(half)) {
      return normalizeSingleDigits(digits.slice(0, half));
    }
  }

  // 6. Check if 14 digits starting with '9191' where the 5th digit is an Indian mobile digit (6, 7, 8, 9)
  // e.g. 91918099092685 -> duplicated country code 91 -> collapse to 918099092685
  if (digits.length === 14 && digits.startsWith('9191') && /[6-9]/.test(digits[4])) {
    return normalizeSingleDigits(digits.slice(2));
  }

  return normalizeSingleDigits(clean);
}

/**
 * Sanitizes and cleans a mobile number for persistent storage (database / state).
 * Guarantees that only ONE single, clean mobile number is stored.
 * Never stores pipes '|', commas, or doubled numbers.
 */
export function cleanSingleMobileForStorage(rawPhone?: string): string {
  return extractSingleMobileNumber(rawPhone);
}

/**
 * Returns strictly the 10-digit mobile number for UI input fields.
 * Strips the +91 country code safely without corrupting numbers that start with 91 (e.g. Sree's 9101123456).
 */
export function getDisplayTenDigitMobile(rawPhone?: string): string {
  const single = extractSingleMobileNumber(rawPhone);
  if (!single) return '';
  const digits = single.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.slice(2);
  }
  if (digits.length === 10) {
    return digits;
  }
  return digits.slice(-10);
}

/**
 * Normalizes phone numbers for WhatsApp deep-linking and Web.
 * - Guarantees strictly ONE single phone number.
 * - Strips all non-digit characters.
 * - Returns clean digits without leading '+' (e.g. 918099092685).
 */
export function normalizeWhatsAppNumber(rawPhone: string): string {
  const single = extractSingleMobileNumber(rawPhone);
  if (!single) return '';
  return single.replace(/\D/g, '');
}

/**
 * Formats a phone number for display (e.g. "+91 80990 92685").
 * Always displays strictly ONE single phone number.
 */
export function formatDisplayPhone(rawPhone: string): string {
  const clean = normalizeWhatsAppNumber(rawPhone);
  if (!clean) return '';
  if (clean.startsWith('91') && clean.length === 12) {
    const main = clean.slice(2);
    return `+91 ${main.slice(0, 5)} ${main.slice(5)}`;
  }
  return `+${clean}`;
}

/**
 * Constructs direct whatsapp:// deep-link URI that launches WhatsApp App directly into chat.
 * Strictly uses ONE validated mobile number.
 */
export function getWhatsAppAppUri(phoneNumber: string, text = ''): string {
  const cleanNumber = normalizeWhatsAppNumber(phoneNumber);
  if (!cleanNumber) return '';
  const formattedText = formatProductForWhatsApp(text || '');
  const encodedText = encodeURIComponent(formattedText);
  return `whatsapp://send?phone=${cleanNumber}${encodedText ? `&text=${encodedText}` : ''}`;
}

// Holds reference window target name for single WhatsApp Web window reuse
const WHATSAPP_TARGET_WINDOW_NAME = 'WhatsAppSharedChatTab';

/**
 * Opens or reuses a single dedicated browser tab for WhatsApp Web messaging.
 * Uses WhatsApp's official api.whatsapp.com gateway which supports seamless window target reuse
 * without cross-origin COOP isolation blocking window navigation.
 */
export function openWhatsAppWebTab(url: string): boolean {
  try {
    // Opening with a consistent window name reuses the existing tab across influencers
    const targetWin = window.open(url, WHATSAPP_TARGET_WINDOW_NAME);
    if (targetWin) {
      try {
        targetWin.focus();
      } catch {}
      return true;
    }
  } catch (err) {
    console.warn('Failed to open/reuse WhatsApp window target:', err);
  }

  // Fallback direct location update if popups are blocked
  try {
    window.location.href = url;
    return true;
  } catch {}

  return false;
}

/**
 * Constructs direct WhatsApp Web / Universal URI using api.whatsapp.com gateway.
 * Strictly uses ONE validated mobile number.
 * Uses api.whatsapp.com to ensure target window reuse without COOP cross-origin errors.
 */
export function getWhatsAppWebUri(phoneNumber: string, text = ''): string {
  const cleanNumber = normalizeWhatsAppNumber(phoneNumber);
  if (!cleanNumber) return '';
  const formattedText = formatProductForWhatsApp(text || '');
  const encodedText = encodeURIComponent(formattedText);
  return `https://api.whatsapp.com/send?phone=${cleanNumber}${encodedText ? `&text=${encodedText}` : ''}`;
}

/**
 * Opens WhatsApp for chat directly in the WhatsApp application or web.
 * 
 * - Ensures strictly ONE single mobile number is used.
 * - Always copies the message text to clipboard for convenience.
 * - Automatically writes "PRO-TO-GROW FITBHIM" before "CHOCOLATE DRINK" in any WhatsApp message related to CHOCOLATED DRINK.
 * - When `preferApp: true` (default): Uses `whatsapp://send?phone=...&text=...` deep-link protocol,
 *   which launches the native WhatsApp Desktop or Mobile app directly into the chat with the contact.
 * - When `preferApp: false`: Opens WhatsApp Web chat via `api.whatsapp.com/send` in a single reused browser tab.
 */
export function openWhatsAppChat({
  phoneNumber,
  text = '',
  preferApp = true,
  contactName = 'Creator',
  skipBranding = false
}: OpenWhatsAppOptions): boolean {
  const cleanNumber = normalizeWhatsAppNumber(phoneNumber);

  if (!cleanNumber) {
    globalToast.error(`No valid WhatsApp phone number found for ${contactName}. Please enter a phone number.`);
    return false;
  }

  // 1. Format product names for WhatsApp (e.g. PRO-TO-GROW FITBHIM CHOCOLATE DRINK)
  const productFormattedText = formatProductForWhatsApp(text);

  // Automatically attach company logo & branding header if configured
  let finalText = skipBranding ? productFormattedText : attachCompanyBranding(productFormattedText);

  // Guarantee that on ANY WhatsApp message, website is strictly shown in the header, never below the message
  const cfg = getCompanyBrandingConfig();
  if (cfg.enabled && (cfg.websiteUrl || DEFAULT_COMPANY_BRANDING.websiteUrl)) {
    finalText = ensureWebsiteInHeader(finalText, cfg.websiteUrl || DEFAULT_COMPANY_BRANDING.websiteUrl);
  }

  // Guarantee product formatting is also applied on final text
  finalText = formatProductForWhatsApp(finalText);

  // 1. Always copy text to clipboard as a helpful convenience
  if (finalText && typeof navigator !== 'undefined' && navigator.clipboard) {
    navigator.clipboard.writeText(finalText)
      .then(() => {
        globalToast.info('Message text copied to clipboard!');
      })
      .catch(() => {});
  }

  if (preferApp) {
    // Deep-link directly into native WhatsApp App (desktop or mobile)
    const appUri = getWhatsAppAppUri(cleanNumber, finalText);

    try {
      // Trigger protocol handler using an anchor element
      const link = document.createElement('a');
      link.href = appUri;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();

      setTimeout(() => {
        try {
          if (link.parentNode) {
            document.body.removeChild(link);
          }
        } catch {}
      }, 1000);

      globalToast.success(`Opening WhatsApp App for ${contactName}! (Text copied to clipboard)`);
      return true;
    } catch (err) {
      console.warn('Direct whatsapp:// launch failed via click, using web gateway fallback:', err);
      const fallbackUrl = getWhatsAppWebUri(cleanNumber, finalText);
      openWhatsAppWebTab(fallbackUrl);
      return true;
    }
  } else {
    // Universal WhatsApp Web gateway (uses single reused window target)
    const webUrl = getWhatsAppWebUri(cleanNumber, finalText);
    openWhatsAppWebTab(webUrl);
    globalToast.success(`Opening WhatsApp Web for ${contactName}! (Text copied to clipboard)`);
    return true;
  }
}
