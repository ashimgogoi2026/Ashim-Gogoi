/**
 * Utility to parse bank transfer SMS, netbanking statements,
 * NEFT/IMPS/UPI receipts, and bank transaction messages.
 *
 * Example input supported:
 * "08/10/2026	INB/NEFT/AXODH28193290602/Debajani Bora	AXODH28193290602	
 * INR 8,000.00"
 */

export interface ParsedBankPayment {
  amount: number | null;
  rawAmount: string | null;
  currency: string;
  reference: string | null;
  paymentMode: string;
  rawMode: string | null;
  date: string | null;
  beneficiary: string | null;
  accountLast4: string | null;
  bankName: string | null;
  upiId: string | null;
  rawText: string;
  summaryText: string;
  confidence: {
    hasAmount: boolean;
    hasReference: boolean;
    hasDate: boolean;
    hasMode: boolean;
    hasBeneficiary: boolean;
  };
}

export function parseBankPaymentMessage(input: string, knownBeneficiaryNames?: string[]): ParsedBankPayment {
  const text = (input || '').trim();

  let amount: number | null = null;
  let rawAmount: string | null = null;
  let currency = 'INR';
  let reference: string | null = null;
  let paymentMode = 'Bank Transfer (NEFT/IMPS)';
  let rawMode: string | null = null;
  let date: string | null = null;
  let beneficiary: string | null = null;
  let accountLast4: string | null = null;
  let bankName: string | null = null;
  let upiId: string | null = null;

  if (!text) {
    return {
      amount: null,
      rawAmount: null,
      currency: 'INR',
      reference: null,
      paymentMode: 'Bank Transfer (NEFT/IMPS)',
      rawMode: null,
      date: null,
      beneficiary: null,
      accountLast4: null,
      bankName: null,
      upiId: null,
      rawText: '',
      summaryText: '',
      confidence: {
        hasAmount: false,
        hasReference: false,
        hasDate: false,
        hasMode: false,
        hasBeneficiary: false,
      },
    };
  }

  // 1. EXTRACT DATE FIRST
  // Handles: "08/10/2026", "08-10-2026", "2026-10-08", "08 Oct 2026"
  const dateRegex = /\b([0-3]?[0-9][\/\-][0-1]?[0-9][\/\-][12][0-9]{3})\b/;
  const dateShortRegex = /\b([0-3]?[0-9][\/\-][0-1]?[0-9][\/\-][23][0-9])\b/;
  const dateTextRegex = /\b([0-3]?[0-9]\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+[12][0-9]{3})\b/i;
  const isoDateRegex = /\b([12][0-9]{3}[\/\-][0-1]?[0-9][\/\-][0-3]?[0-9])\b/;

  const dateMatch = text.match(dateRegex) || text.match(dateTextRegex) || text.match(dateShortRegex) || text.match(isoDateRegex);
  if (dateMatch && dateMatch[1]) {
    date = dateMatch[1].trim();
  }

  // 2. EXTRACT AMOUNT
  // Handles: "INR 8,000.00", "Rs. 8,000", "₹8,000.00", "INR 8000", "8,000.00 INR", "Rs 3000"
  // Note: match comma-formatted or full digits eagerly using \b
  const amountWithCurrencyRegex = /(?:INR|Rs\.?|₹)\s*([0-9]+(?:,[0-9]{2,3})*(?:\.[0-9]{1,2})?)/i;
  const trailingAmountRegex = /([0-9]+(?:,[0-9]{2,3})*(?:\.[0-9]{1,2})?)\s*(?:INR|Rs\.?|₹)/i;
  const debitedAmountRegex = /(?:debited\s*(?:by|for)?|transfer(?:red)?\s*(?:of)?|amt|amount|paid)\s*(?:INR|Rs\.?|₹)?\s*([0-9]+(?:,[0-9]{2,3})*(?:\.[0-9]{1,2})?)/i;

  const amtMatch = text.match(amountWithCurrencyRegex) || text.match(trailingAmountRegex) || text.match(debitedAmountRegex);

  if (amtMatch && amtMatch[1]) {
    rawAmount = amtMatch[1].trim();
    const cleanNum = rawAmount.replace(/,/g, '');
    const parsedNum = parseFloat(cleanNum);
    if (!isNaN(parsedNum) && parsedNum > 0) {
      amount = parsedNum;
    }
  }

  // Fallback for standalone currency/amount line: e.g. "INR 8,000.00"
  if (amount === null) {
    const lines = text.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      const lineAmtMatch = trimmed.match(/(?:INR|Rs\.?|₹)?\s*([0-9]+(?:,[0-9]{2,3})*(?:\.[0-9]{1,2})?)\s*(?:INR|Rs\.?|₹)?/i);
      if (lineAmtMatch && lineAmtMatch[1]) {
        const clean = lineAmtMatch[1].replace(/,/g, '');
        const p = parseFloat(clean);
        if (!isNaN(p) && p > 0) {
          amount = p;
          rawAmount = lineAmtMatch[1];
          break;
        }
      }
    }
  }

  // 3. PARSE TAB/SPACE COLUMNS OR TOKENS
  // If the string contains tabs (like tabular bank statement copy), split into cells
  const cells = text.split(/[\t\r\n]+/).map(c => c.trim()).filter(Boolean);

  // Look for standalone Indian bank UTR / Reference in individual cells
  // e.g. Cell with "AXODH28193290602"
  for (const cell of cells) {
    if (/^[A-Z]{3,6}[A-Z0-9]{7,18}$/.test(cell) && !cell.startsWith('INR') && !cell.startsWith('INB/')) {
      reference = cell;
      break;
    }
  }

  // 4. EXTRACT FROM SLASH-DELIMITED NARRATION (without crossing tabs or newlines)
  // Example: "INB/NEFT/AXODH28193290602/Debajani Bora"
  // Example: "NEFT/AXODH28193290602/Debajani Bora"
  // Example: "IMPS/428193290602/Debajani Bora"
  const slashPattern = /(?:[A-Za-z0-9_-]+\/){2,}[^\t\r\n]+/;
  const slashMatches = text.match(new RegExp(slashPattern, 'g')) || [];

  for (const m of slashMatches) {
    const trimmedMatch = m.trim();
    // Avoid pure dates or matches starting with date like "08/10/2026"
    if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/.test(trimmedMatch)) continue;

    // Split this specific narration segment
    const parts = trimmedMatch.split('/').map(p => p.trim()).filter(Boolean);
    for (const part of parts) {
      const upper = part.toUpperCase();

      // Check payment mode
      if (upper === 'NEFT' || upper === 'INB' || upper === 'IMPS' || upper === 'RTGS' || upper === 'UPI') {
        if (!rawMode || rawMode === 'INB') {
          rawMode = upper;
        }
      }

      // Check reference/UTR (alphanumeric, 8-26 chars, strictly NO spaces or tabs)
      if (!reference) {
        if (part.length >= 8 && part.length <= 26 && /^[A-Za-z0-9_-]+$/.test(part) && /[0-9]/.test(part) && /[A-Za-z]/.test(part)) {
          reference = part;
        } else if (part.length >= 10 && part.length <= 22 && /^[0-9]+$/.test(part)) {
          // IMPS / UPI 12-digit RRN
          reference = part;
        }
      }

      // Check beneficiary name (letters and spaces, at least 3 chars, not pure keywords)
      // Clean off trailing currency, amounts, or references from beneficiary part
      const cleanedPart = part
        .replace(/(?:INR|Rs\.?|₹|\bCR\b|\bDR\b)[\s\d,.]*$/i, '')
        .replace(/\b[A-Z]{3,5}[0-9]{7,18}\b/g, '')
        .replace(/[\s\d,.]+(?:INR|Rs\.?|₹)$/i, '')
        .replace(/\s+[0-9]+(?:,[0-9]{2,3})*(?:\.[0-9]{1,2})?$/g, '')
        .trim();

      if (!beneficiary && /^[A-Za-z\s.'-]{3,40}$/.test(cleanedPart)) {
        if (!/^(INB|NEFT|IMPS|RTGS|UPI|CR|DR|P2A|P2P|TRANSFER|PAYMENT|DEPOSIT|NETBANKING)$/i.test(cleanedPart)) {
          beneficiary = cleanedPart.trim();
        }
      }
    }
  }

  // 5. EXTRACT LABELED UTR / REFERENCE IF NOT FOUND YET
  if (!reference) {
    const labeledRefRegex = /\b(?:UTR|Ref(?:\.?|erence)?(?:\s*No|\s*ID)?|Txn(?:\.?|\s*ID)?|Tran(?:saction)?(?:\s*ID)?|RR\s*No|RRN|UPI\s*Ref)[:\s#-]+([A-Z0-9]{8,24})/i;
    const labeledMatch = text.match(labeledRefRegex);
    if (labeledMatch && labeledMatch[1]) {
      reference = labeledMatch[1].trim();
    }
  }

  // Standalone fallback for UTR pattern across whole text
  if (!reference) {
    const standaloneRefRegex = /\b([A-Z]{3,5}[A-Z0-9]{8,18})\b/g;
    let match;
    while ((match = standaloneRefRegex.exec(text)) !== null) {
      const cand = match[1].trim();
      if (cand !== 'INR' && !cand.startsWith('202') && cand !== 'NEFT' && cand !== 'IMPS' && cand !== 'RTGS') {
        reference = cand;
        break;
      }
    }
  }

  // UPI 12-digit reference fallback
  if (!reference) {
    const rrnMatch = /\b([0-9]{12})\b/.exec(text);
    if (rrnMatch && rrnMatch[1]) {
      reference = rrnMatch[1];
    }
  }

  // 6. EXTRACT BENEFICIARY NAME IF NOT FOUND YET
  if (!beneficiary) {
    const toNameRegex = /(?:to|beneficiary|transferred to|paid to)\s+([A-Za-z\s.'-]{3,35})(?:\s+(?:via|with|on|ref|utr|a\/c|account|\n|\t|$))/i;
    const toMatch = text.match(toNameRegex);
    if (toMatch && toMatch[1]) {
      beneficiary = toMatch[1].trim();
    }
  }

  // Fallback to match against known influencer / creator names in text
  if (!beneficiary && knownBeneficiaryNames && knownBeneficiaryNames.length > 0) {
    for (const name of knownBeneficiaryNames) {
      const cleanName = (name || '').trim();
      if (cleanName.length >= 3) {
        const escaped = cleanName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(?:\\b|/)${escaped}(?:\\b|/|\\t|\\n|$)`, 'i');
        if (regex.test(text)) {
          beneficiary = cleanName;
          break;
        }
      }
    }
  }

  // 7. DETECT PAYMENT MODE
  const upperText = text.toUpperCase();
  if (upperText.includes('NEFT') || rawMode === 'NEFT') {
    paymentMode = 'Bank Transfer (NEFT/IMPS)';
    rawMode = rawMode || 'NEFT';
  } else if (upperText.includes('IMPS') || rawMode === 'IMPS') {
    paymentMode = 'Bank Transfer (NEFT/IMPS)';
    rawMode = rawMode || 'IMPS';
  } else if (upperText.includes('RTGS') || rawMode === 'RTGS') {
    paymentMode = 'RTGS';
    rawMode = rawMode || 'RTGS';
  } else if (upperText.includes('UPI') || upperText.includes('GPAY') || upperText.includes('PHONEPE') || upperText.includes('PAYTM') || rawMode === 'UPI') {
    paymentMode = 'UPI / GPay / PhonePe';
    rawMode = rawMode || 'UPI';
  } else if (upperText.includes('CHEQUE') || upperText.includes('CHQ')) {
    paymentMode = 'Cheque';
    rawMode = rawMode || 'Cheque';
  } else if (reference) {
    paymentMode = 'Bank Transfer (NEFT/IMPS)';
  }

  // 8. DETECT ACCOUNT NUMBER (LAST 4 DIGITS)
  const acctRegex = /(?:A\/C|Acc(?:ount)?|A\/c)\s*(?:ending|no\.?)?\s*[*Xx#]*\s*([0-9]{3,4})\b/i;
  const acctMatch = text.match(acctRegex);
  if (acctMatch && acctMatch[1]) {
    accountLast4 = acctMatch[1];
  }

  // 9. DETECT BANK NAME
  if (upperText.includes('AXIS')) {
    bankName = 'Axis Bank';
  } else if (upperText.includes('SBI') || upperText.includes('STATE BANK')) {
    bankName = 'State Bank of India';
  } else if (upperText.includes('HDFC')) {
    bankName = 'HDFC Bank';
  } else if (upperText.includes('ICICI')) {
    bankName = 'ICICI Bank';
  } else if (upperText.includes('PUNJAB') || upperText.includes('PNB')) {
    bankName = 'Punjab National Bank';
  } else if (upperText.includes('KOTAK')) {
    bankName = 'Kotak Mahindra Bank';
  }

  // 10. DETECT UPI ID (e.g. "debajani@okhdfcbank")
  const upiRegex = /\b([a-zA-Z0-9.\-_]{2,40}@[a-zA-Z]{2,20})\b/;
  const upiMatch = text.match(upiRegex);
  if (upiMatch && upiMatch[1]) {
    upiId = upiMatch[1];
    paymentMode = 'UPI / GPay / PhonePe';
  }

  // Build a concise summary text for notification/display
  const summaryParts: string[] = [];
  if (amount !== null) summaryParts.push(`₹${amount.toLocaleString('en-IN')}`);
  if (rawMode || paymentMode) summaryParts.push(rawMode || paymentMode);
  if (reference) summaryParts.push(`Ref: ${reference}`);
  if (date) summaryParts.push(`Date: ${date}`);
  if (beneficiary) summaryParts.push(`To: ${beneficiary}`);

  const summaryText = summaryParts.join(' | ');

  return {
    amount,
    rawAmount,
    currency,
    reference,
    paymentMode,
    rawMode,
    date,
    beneficiary,
    accountLast4,
    bankName,
    upiId,
    rawText: text,
    summaryText,
    confidence: {
      hasAmount: amount !== null,
      hasReference: reference !== null,
      hasDate: date !== null,
      hasMode: rawMode !== null || Boolean(paymentMode),
      hasBeneficiary: beneficiary !== null,
    },
  };
}
