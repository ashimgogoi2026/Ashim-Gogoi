import React, { useState, useMemo, useRef } from 'react';
import Papa from 'papaparse';
import { 
  CreditCard, CheckCircle2, AlertCircle, Search, Check, RefreshCw, FileText, Landmark, FileCheck, Coins, HelpCircle,
  Calendar, ArrowUpDown, Filter, MessageCircle, Send, Copy, FileDown, CloudUpload, CloudDownload, CheckSquare,
  BookOpen, Sparkles, Download, Link, ChevronDown, Globe, Pencil, RotateCcw, X, Phone, ShieldCheck, ExternalLink,
  Upload, FileSpreadsheet
} from 'lucide-react';
import { Task, Influencer, Campaign } from '../types';
import { generateInfluencerBillPDF } from '../lib/pdfBillGenerator';
import { generateInfluencerChecklistPDF, cleanChecklistVideoId, DEFAULT_CHECKLIST_SECTIONS, ChecklistSection } from '../lib/pdfChecklistGenerator';
import { 
  ProductChecklistConfig, 
  getProductChecklist, 
  saveProductChecklist, 
  normalizeProductKey, 
  loadAllProductChecklists 
} from '../lib/productChecklistStore';
import { CentralChecklistStoreModal } from './CentralChecklistStoreModal';
import { globalToast } from '../lib/toast';
import { triggerUpdateWhatsAppModal } from '../lib/whatsappPrompt';
import { parseBankPaymentMessage, ParsedBankPayment } from '../lib/bankMessageParser';
import { openWhatsAppChat, getKnownMobile, formatDisplayPhone, normalizeWhatsAppNumber, cleanSingleMobileForStorage, getDisplayTenDigitMobile, formatProductForWhatsApp } from '../lib/whatsappHelper';
import { PaymentDetailsView } from './PaymentDetailsView';
import { 
  upsertPaymentRecord, 
  loadStoredPayments, 
  saveStoredPayments,
  subscribeToPaymentUpdates, 
  markPaymentAsSent,
  getDeletedPaymentIds,
  markPaymentIdAsDeleted,
  PaymentRecord
} from '../lib/paymentDetailsStore';
import { uploadPaymentDetailsToDrive, downloadPaymentDetailsFromDrive } from '../lib/driveSync';
import { ensureGoogleAccessToken } from '../lib/firebaseAuth';
import { formatDateToDMY } from '../lib/dateUtils';

interface SecureBillPaymentProps {
  accessToken?: string | null;
  searchTerm?: string;
  setSearchTerm?: (s: string) => void;
  selectedMonth: string;
  setSelectedMonth: (m: string) => void;
  selectedYear: string;
  setSelectedYear: (y: string) => void;
  selectedWeek: string;
  setSelectedWeek: (w: string) => void;
  tasks: Task[];
  onUpdateTask: (taskId: string, updatedFields: Partial<Task>) => void;
  onUpdateInfluencer?: (id: string, updates: Partial<Influencer>) => void;
  influencers: Influencer[];
  campaigns: Campaign[];
}

const MONTHS_MAP: { [key: string]: string } = {
  'ALL': 'All Months',
  '01': 'January',
  '02': 'February',
  '03': 'March',
  '04': 'April',
  '05': 'May',
  '06': 'June',
  '07': 'July',
  '08': 'August',
  '09': 'September',
  '10': 'October',
  '11': 'November',
  '12': 'December',
};

const DebouncedInput = ({ value, onChange, ...props }: any) => {
  const [localVal, setLocalVal] = useState(value ?? '');
  const [isFocused, setIsFocused] = useState(false);
  const lastReportedVal = React.useRef(value ?? '');
  
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;

  React.useEffect(() => {
    if (!isFocused) {
      setLocalVal(value ?? '');
      lastReportedVal.current = value ?? '';
    }
  }, [value, isFocused]);

  React.useEffect(() => {
    const handler = setTimeout(() => {
      if (String(localVal) !== String(lastReportedVal.current)) {
        lastReportedVal.current = localVal;
        onChangeRef.current(localVal);
      }
    }, 800);
      return () => clearTimeout(handler);
  }, [localVal]);

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(false);
    if (String(localVal) !== String(lastReportedVal.current)) {
      lastReportedVal.current = localVal;
      onChangeRef.current(localVal);
    }
    if (props.onBlur) {
      props.onBlur(e);
    }
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
    if (props.onFocus) {
      props.onFocus(e);
    }
  };

  return (
    <input 
      {...props} 
      value={localVal} 
      onChange={(e) => setLocalVal(e.target.value)} 
      onBlur={handleBlur}
      onFocus={handleFocus}
    />
  );
};


const uploadImageToDrive = async (file: File, token: string): Promise<string> => {
  const metadataRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: `Signature_${Date.now()}_${file.name}`, mimeType: file.type })
  });
  if (!metadataRes.ok) throw new Error("Drive metadata creation failed");
  const metadata = await metadataRes.json();
  const fileId = metadata.id;

  const mediaRes = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': file.type },
    body: file
  });
  if (!mediaRes.ok) throw new Error("Drive media upload failed");
  return fileId;
};

const fetchImageFromDrive = async (fileId: string, token: string): Promise<string> => {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!res.ok) return '';
  const blob = await res.blob();
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
};

export type BillWhatsAppTemplate = 'payment_details' | 'bill_checklist' | 'request_bank' | 'payment_cleared' | 'payment_check' | 'custom';

export const getBillPaymentWhatsAppText = ({
  template,
  lang = 'en',
  creatorName,
  productName,
  campaignName,
  amount,
  paymentDetails,
  paymentMode,
  paymentDate,
  bankName,
  accountLast4,
  upiId,
  includeBankInfo = true,
  videoId,
}: {
  template: BillWhatsAppTemplate;
  lang: 'en' | 'as';
  creatorName: string;
  productName: string;
  campaignName?: string;
  amount: number;
  paymentDetails?: string;
  paymentMode?: string;
  paymentDate?: string;
  bankName?: string;
  accountLast4?: string;
  upiId?: string;
  includeBankInfo?: boolean;
  videoId?: string;
}) => {
  const formattedAmount = `₹${(amount || 0).toLocaleString()}`;
  const prodLabel = formatProductForWhatsApp(productName || 'promotional video');
  const campLabel = campaignName ? ` for "${campaignName}"` : '';
  const dateStr = paymentDate || new Date().toLocaleDateString('en-GB');

  if (lang === 'as') {
    switch (template) {
      case 'payment_details': {
        const detailsLines = [];
        detailsLines.push(`• পৰিমাণ (Amount): ${formattedAmount}`);
        if (paymentMode) detailsLines.push(`• মাধ্যম (Mode): ${paymentMode}`);
        if (paymentDetails && paymentDetails.trim()) detailsLines.push(`• ৰেফাৰেন্স/UTR: ${paymentDetails.trim()}`);
        if (includeBankInfo) {
          if (bankName) detailsLines.push(`• বেংক (Bank): ${bankName}`);
          if (accountLast4) detailsLines.push(`• একাউণ্ট (A/C): ****${accountLast4}`);
          else if (upiId) detailsLines.push(`• UPI ID: ${upiId}`);
        }
        if (videoId) detailsLines.push(`• ভিডিঅ' নম্বৰ / ID: ${videoId}`);
        detailsLines.push(`• তাৰিখ (Date): ${dateStr}`);

        return `নমস্কাৰ ${creatorName}!\n\nPRO-TO-GROW ৰ ফালৰ পৰা জনাইছোঁ। আপোনাৰ "${prodLabel}"${campLabel} ভিডিঅ'ৰ বাবে নিৰ্ধাৰিত ${formattedAmount} ৰ পেমেন্ট সফলভাৱে সম্পন্ন কৰা হৈছে।\n\nপেমেন্টৰ তথ্য (Payment Details):\n${detailsLines.join('\n')}\n\nঅনুগ্ৰহ কৰি আপোনাৰ একাউণ্টত পেমেন্টটো পৰীক্ষা কৰি নিশ্চিত কৰিবচোন। ধন্যবাদ! 💳✨`;
      }
      case 'bill_checklist': {
        const detailsLines = [];
        detailsLines.push(`• পৰিমাণ (Amount): ${formattedAmount}`);
        if (paymentMode) detailsLines.push(`• মাধ্যম (Mode): ${paymentMode}`);
        if (paymentDetails && paymentDetails.trim()) detailsLines.push(`• ৰেফাৰেন্স/UTR: ${paymentDetails.trim()}`);
        if (includeBankInfo) {
          if (bankName) detailsLines.push(`• বেংক (Bank): ${bankName}`);
          if (accountLast4) detailsLines.push(`• একাউণ্ট (A/C): ****${accountLast4}`);
          else if (upiId) detailsLines.push(`• UPI ID: ${upiId}`);
        }
        if (videoId) detailsLines.push(`• চেক-লিষ্ট / ভিডিঅ' ক্ৰমিক: ${videoId}`);
        detailsLines.push(`• তাৰিখ (Date): ${dateStr}`);

        return `নমস্কাৰ ${creatorName}!\n\nPRO-TO-GROW ৰ ফালৰ পৰা জনাইছোঁ। আপোনাৰ "${prodLabel}"${campLabel} ভিডিঅ'ৰ পৰীক্ষা-সূচী (Checklist) আৰু বিল সফলতাৰে অনুমোদন জনোৱা হৈছে, আৰু নিৰ্ধাৰিত ${formattedAmount} ৰ পেমেন্ট মুকলি কৰা হৈছে।\n\nপেমেন্টৰ সবিশেষ (Payment Details):\n${detailsLines.join('\n')}\n\nঅনুগ্ৰহ কৰি আপোনাৰ একাউণ্ট পৰীক্ষা কৰি পেমেন্ট পোৱাটো নিশ্চিত কৰিবচোন। ধন্যবাদ! 📋📄💳✨`;
      }
      case 'request_bank': {
        return `নমস্কাৰ ${creatorName}!\n\nPRO-TO-GROW ৰ ফালৰ পৰা যোগাযোগ কৰিছোঁ। আপোনাৰ "${prodLabel}"${campLabel} ভিডিঅ'ৰ বাবে নিৰ্ধাৰিত ${formattedAmount} পেমেন্ট প্ৰচেছ কৰিবলৈ অনুগ্ৰহ কৰি আপোনাৰ একাউণ্টৰ তথ্য (একাউণ্ট নাম, একাউণ্ট নম্বৰ, IFSC ক'ড, বা UPI ID) আমাক শ্বেয়াৰ কৰিবচোন। ধন্যবাদ! 🏦📋`;
      }
      case 'payment_cleared': {
        const refStr = paymentDetails ? ` (ৰেফাৰেন্স: ${paymentDetails})` : '';
        return `নমস্কাৰ ${creatorName}!\n\nPRO-TO-GROW ৰ ফালৰ পৰা জনাইছোঁ। আপোনাৰ "${prodLabel}" ভিডিঅ'ৰ বিলখন আমাৰ একাউণ্টছ বিভাগে ক্লিয়াৰ কৰি ${formattedAmount} ৰ পেমেন্ট মুকলি কৰি দিছে${refStr}। কিবা সহায়ৰ প্ৰয়োজন হ'লে জনাব। ধন্যবাদ! 📄✅`;
      }
      case 'payment_check': {
        return `নমস্কাৰ ${creatorName}!\n\nPRO-TO-GROW ৰ ফালৰ পৰা এটা ক্ষিপ্ৰ খবৰ। আমি আপোনাৰ একাউণ্টলৈ পঠোৱা "${prodLabel}" ভিডিঅ'ৰ ${formattedAmount} ৰ পেমেন্টটো সঠিকভাৱে পালে নে? অনুগ্ৰহ কৰি এবাৰ নিশ্চিত কৰিবচোন যাতে আমি লেজাৰত এন্ট্ৰিটো সমাপ্ত কৰিব পাৰোঁ। ধন্যবাদ! 💸🙏`;
      }
      case 'custom':
      default:
        return `নমস্কাৰ ${creatorName}!\n\nPRO-TO-GROW ৰ ফালৰ পৰা পেমেন্ট সন্দৰ্ভত যোগাযোগ কৰিছোঁ। "${prodLabel}" ভিডিঅ'ৰ ${formattedAmount} ৰ পেমেন্ট সম্পৰ্কে অনুগ্ৰহ কৰি আমাক এটা আপডেট দিবচোন। ধন্যবাদ!`;
    }
  }

  // English
  switch (template) {
    case 'payment_details': {
      const detailsLines = [];
      detailsLines.push(`• Amount Paid: ${formattedAmount}`);
      if (paymentMode) detailsLines.push(`• Payment Mode: ${paymentMode}`);
      if (paymentDetails && paymentDetails.trim()) detailsLines.push(`• UTR / Reference: ${paymentDetails.trim()}`);
      if (includeBankInfo) {
        if (bankName) detailsLines.push(`• Bank: ${bankName}`);
        if (accountLast4) detailsLines.push(`• Account: ****${accountLast4}`);
        else if (upiId) detailsLines.push(`• UPI ID: ${upiId}`);
      }
      if (videoId) detailsLines.push(`• Deliverable / Video ID: ${videoId}`);
      detailsLines.push(`• Payment Date: ${dateStr}`);

      return `Hi ${creatorName}!\n\nThis is from PRO-TO-GROW. We have processed the payment of ${formattedAmount} for your video placement "${prodLabel}"${campLabel}.\n\nPayment Details:\n${detailsLines.join('\n')}\n\nPlease check your bank account and confirm receipt. Thank you! 💳✨`;
    }
    case 'bill_checklist': {
      const detailsLines = [];
      detailsLines.push(`• Amount Paid: ${formattedAmount}`);
      if (paymentMode) detailsLines.push(`• Payment Mode: ${paymentMode}`);
      if (paymentDetails && paymentDetails.trim()) detailsLines.push(`• UTR / Reference: ${paymentDetails.trim()}`);
      if (includeBankInfo) {
        if (bankName) detailsLines.push(`• Bank: ${bankName}`);
        if (accountLast4) detailsLines.push(`• Account: ****${accountLast4}`);
        else if (upiId) detailsLines.push(`• UPI ID: ${upiId}`);
      }
      if (videoId) detailsLines.push(`• Verified Checklist / Video ID: ${videoId}`);
      detailsLines.push(`• Payment Date: ${dateStr}`);

      return `Hi ${creatorName}!\n\nThis is from PRO-TO-GROW. Your video bill & checklist criteria for "${prodLabel}"${campLabel} have been verified and approved, and the payment of ${formattedAmount} has been processed.\n\nPayment Details:\n${detailsLines.join('\n')}\n\nPlease check your bank account and confirm receipt. Thank you! 📋📄💳✨`;
    }
    case 'request_bank': {
      return `Hi ${creatorName}!\n\nReaching out from PRO-TO-GROW regarding your payment of ${formattedAmount} for "${prodLabel}"${campLabel}. Could you please share your updated account details (Beneficiary Name, Account Number, IFSC Code, or UPI ID) so our accounts team can disburse the payment? Thank you! 🏦📋`;
    }
    case 'payment_cleared': {
      const refStr = paymentDetails ? `\n\nReference Details: ${paymentDetails}` : '';
      return `Hi ${creatorName}!\n\nYour payment & bill of ${formattedAmount} for the "${prodLabel}" campaign has been cleared and disbursed by our accounts team.${refStr}\n\nPlease let us know if you need the official invoice / bill receipt. Thank you! 📄✅`;
    }
    case 'payment_check': {
      return `Hi ${creatorName}!\n\nQuick follow-up from PRO-TO-GROW regarding the payment of ${formattedAmount} sent for your "${prodLabel}" video. Could you please confirm if you have received the credit in your account? Let us know so we can mark it settled in our books. Thank you! 💸🙏`;
    }
    case 'custom':
    default:
      return `Hi ${creatorName}!\n\nReaching out from PRO-TO-GROW regarding your payment for "${prodLabel}" (${formattedAmount}). Please let us know if you need any assistance or details. Thank you!`;
  }
};

export default function SecureBillPayment({
  accessToken, searchTerm = '', setSearchTerm = () => {},  
  selectedMonth, setSelectedMonth, selectedYear, setSelectedYear, selectedWeek, setSelectedWeek,
  tasks = [],
  onUpdateTask,
  onUpdateInfluencer,
  influencers = [],
  campaigns = [],
}: SecureBillPaymentProps) {
  // Local filter states
  // searchTerm from props
  const monthFilter = selectedMonth;
  const setMonthFilter = setSelectedMonth;
  const yearFilter = selectedYear;
  const setYearFilter = setSelectedYear;
  const weekFilter = selectedWeek;
  const setWeekFilter = setSelectedWeek;
  // Short.io filter
  const [shortIoFilter, setShortIoFilter] = useState<'ALL' | 'HAS_LINK' | 'NO_LINK'>('ALL');
  const [copiedShortIoId, setCopiedShortIoId] = useState<string | null>(null);
  const [showCompletedOnly, setShowCompletedOnly] = useState<boolean>(true);
  // Sort by date toggle
  const [dateSortOrder, setDateSortOrder] = useState<'none' | 'asc' | 'desc'>('asc');
  const [copiedVideoId, setCopiedVideoId] = useState<string | null>(null);
  const [copiedVideoLink, setCopiedVideoLink] = useState<string | null>(null);

  // PDF Generator Modal States
  const [pdfTask, setPdfTask] = useState<any>(null);
  const [pdfInfluencer, setPdfInfluencer] = useState<any>(null);
    const [pdfBillFromName, setPdfBillFromName] = useState('');
  const [pdfBillFromAddress, setPdfBillFromAddress] = useState('');
  const [pdfBillToName, setPdfBillToName] = useState('PROTOGROW CORP LLP');
  const [pdfBillToAddress, setPdfBillToAddress] = useState('HOUSE NO 22, 1ST FLOOR, GS ROAD, AMRAWATI PATH CHRISTIAN BASTI, GUWAHATI, PIN-781005');
  const [pdfBillToPhone, setPdfBillToPhone] = useState('8724044420');
  const [pdfAccountName, setPdfAccountName] = useState('');
  const [pdfPan, setPdfPan] = useState('');
  const [pdfAccountNumber, setPdfAccountNumber] = useState('');
  const [pdfBankName, setPdfBankName] = useState('');
  const [pdfIfsc, setPdfIfsc] = useState('');
  
  const [pdfInfluencerSig, setPdfInfluencerSig] = useState(''); // Holds Drive ID or Base64 (for save)
  const [pdfAuthSig, setPdfAuthSig] = useState(''); 
  const [pdfInfluencerSigData, setPdfInfluencerSigData] = useState(''); // Holds Base64 (for UI/PDF)
  const [pdfAuthSigData, setPdfAuthSigData] = useState('');
  
  // Checklist Generator Modal States
  const [checklistTask, setChecklistTask] = useState<any>(null);
  const [checklistInfluencer, setChecklistInfluencer] = useState<any>(null);
  const [checklistVideoId, setChecklistVideoId] = useState('');
  const [checklistProductTitle, setChecklistProductTitle] = useState('Product - Chocolate Drink');
  const [checklistInfluencerName, setChecklistInfluencerName] = useState('');
  const [checklistDate, setChecklistDate] = useState('');
  const [checklistBdmName, setChecklistBdmName] = useState('ASHIM GOGOI');
  const [checklistBdmSigData, setChecklistBdmSigData] = useState('');
  const [checklistBdmSig, setChecklistBdmSig] = useState('');
  const [checklistSections, setChecklistSections] = useState<ChecklistSection[]>(DEFAULT_CHECKLIST_SECTIONS);

  // Central Product Checklist Store integration states
  const [isCentralStoreModalOpen, setIsCentralStoreModalOpen] = useState(false);
  const [activeProductConfig, setActiveProductConfig] = useState<ProductChecklistConfig | null>(null);
  const [selectedProductPreset, setSelectedProductPreset] = useState<string>('');

  const allStoreProductsList = useMemo(() => {
    const st = loadAllProductChecklists();
    const map = new Map<string, { key: string; name: string }>();
    Object.values(st).forEach(c => {
      const k = normalizeProductKey(c.productName || c.productKey);
      map.set(k, { key: k, name: c.productName || k });
    });
    tasks.forEach(t => {
      const p = (t.title || t.productName || t.product || '').trim();
      if (p) {
        const k = normalizeProductKey(p);
        if (!map.has(k)) {
          map.set(k, { key: k, name: p });
        }
      }
    });
    return Array.from(map.values());
  }, [tasks]);

  const allUniqueProducts = useMemo(() => {
    const set = new Set<string>();
    tasks.forEach(t => {
      const p = (t.title || t.productName || t.product || '').trim();
      if (p) set.add(p);
    });
    return Array.from(set);
  }, [tasks]);

  // WhatsApp Message States for Bill & CHECKLIST
  const [whatsAppModalItem, setWhatsAppModalItem] = useState<any | null>(null);
  const [activeWhatsAppMenuId, setActiveWhatsAppMenuId] = useState<string | null>(null);
  const [whatsAppLang, setWhatsAppLang] = useState<'en' | 'as'>(() => {
    try {
      return (localStorage.getItem('wa_msg_lang') as 'en' | 'as') || 'en';
    } catch {
      return 'en';
    }
  });
  const [whatsAppTemplate, setWhatsAppTemplate] = useState<BillWhatsAppTemplate>('payment_details');
  const [customAmount, setCustomAmount] = useState<number>(0);
  const [customPaymentDetails, setCustomPaymentDetails] = useState<string>('');
  const [customPaymentMode, setCustomPaymentMode] = useState<string>('Bank Transfer (NEFT/IMPS)');
  const [customPaymentDate, setCustomPaymentDate] = useState<string>('');
  const [customBankName, setCustomBankName] = useState<string>('');
  const [customAccountLast4, setCustomAccountLast4] = useState<string>('');
  const [customUpiId, setCustomUpiId] = useState<string>('');
  const [customMobileNumber, setCustomMobileNumber] = useState<string>('');
  const [includeBankDetails, setIncludeBankDetails] = useState<boolean>(true);
  const [whatsAppMessageDraft, setWhatsAppMessageDraft] = useState<string>('');
  const [saveToTaskOnSend, setSaveToTaskOnSend] = useState<boolean>(true);

  // Bank Message Auto-Parser states
  const [pastedBankMessage, setPastedBankMessage] = useState<string>('');
  const [parsedBankResult, setParsedBankResult] = useState<ParsedBankPayment | null>(null);

  // Sub-tab page state: Bill & Checklist Ledger vs Payment Details
  const [activeSubTab, setActiveSubTab] = useState<'ledger' | 'payment_details'>('ledger');
  const [storedRecords, setStoredRecords] = useState<PaymentRecord[]>(() => loadStoredPayments());
  const [storedPaymentsCount, setStoredPaymentsCount] = useState<number>(() => loadStoredPayments().length);

  React.useEffect(() => {
    const unsub = subscribeToPaymentUpdates((records) => {
      setStoredRecords(records);
      setStoredPaymentsCount(records.length);
    });
    return unsub;
  }, []);

  React.useEffect(() => {
    const handleCloseMenu = () => setActiveWhatsAppMenuId(null);
    window.addEventListener('click', handleCloseMenu);
    return () => window.removeEventListener('click', handleCloseMenu);
  }, []);

  const [isUploading, setIsUploading] = useState(false);
  const [isDriveSyncing, setIsDriveSyncing] = useState(false);
  const csvFileInputRef = useRef<HTMLInputElement | null>(null);

  // CSV Export Handler for Bill & Checklist
  const handleExportCSV = () => {
    try {
      if (activeSubTab === 'payment_details') {
        if (storedRecords.length === 0) {
          globalToast.info('No payment records found to export.');
          return;
        }
        const csvRows = storedRecords.map((r, idx) => ({
          'SL. No': idx + 1,
          'Creator Name': r.creatorName || '',
          'Mobile Number': r.mobile || '',
          'Amount (INR)': r.amount || 0,
          'UTR / Reference Number': r.utrReference || '',
          'Payment Mode': r.paymentMode || '',
          'Payment Date': r.paymentDate || '',
          'Bank Name': r.bankName || '',
          'Account Last 4': r.accountLast4 || '',
          'UPI ID': r.upiId || '',
          'Product': r.productName || '',
          'Campaign': r.campaignName || '',
          'Video ID': r.videoId || '',
          'Video Link': r.videoLink || '',
          'Status': r.status || 'Saved',
          'Task ID': r.taskId || '',
          'Notes': r.notes || ''
        }));
        const csv = Papa.unparse(csvRows);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Payment_Details_Vault_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        globalToast.success(`Successfully exported ${storedRecords.length} payment records to CSV.`);
        return;
      }

      // Export BILL & CHECKLIST LEDGER
      if (synchronizedPayments.length === 0) {
        globalToast.info('No bill & checklist entries match current filters to export.');
        return;
      }

      const deletedIds = getDeletedPaymentIds();
      const csvRows = synchronizedPayments.map((p, index) => {
        const amt = p.billedAmount !== undefined && p.billedAmount > 0 ? p.billedAmount : (p.remuneration || 0);
        const isDeleted = (p.id && (deletedIds.has(p.id) || deletedIds.has(`task_pay_${p.id}`))) ||
                          (p.paymentDetails && deletedIds.has(`utr_${p.paymentDetails.trim().toLowerCase()}`));
        const matchingStored = isDeleted ? undefined : storedRecords.find(r => 
          (p.id && (r.taskId === p.id || r.id === `task_pay_${p.id}`)) ||
          (p.paymentDetails && r.utrReference && r.utrReference.trim().toLowerCase() === p.paymentDetails.trim().toLowerCase()) ||
          (r.creatorName && p.influencerName && r.creatorName.trim().toLowerCase() === p.influencerName.trim().toLowerCase() && Math.abs((r.amount || 0) - amt) < 1)
        );
        const isPaid = !isDeleted && (
          p.paymentStatus === 'Completed' ||
          Boolean(p.paymentDetails && p.paymentDetails.trim() !== '') ||
          Boolean(matchingStored)
        );

        return {
          'SL. No': index + 1,
          'Video ID': p.videoId !== undefined ? p.videoId : p.displayVideoId,
          'Task ID': p.id,
          'Influencer / Creator Name': p.influencerName,
          'Mobile Number': p.influencerMobile,
          'Product / Campaign': p.title || p.campaignName,
          'Planned Release Date': p.deadline || '',
          'Actual Release Date': p.releaseDate || '',
          'Video Link 1': p.videoLink1 || '',
          'Video Link 2': p.videoLink2 || '',
          'Video Link 3': p.videoLink3 || '',
          'Short.io Link': p.shortIoLink || '',
          'Views': p.views || 0,
          'Clicks': p.clicks || 0,
          'Billed Amount (INR)': amt,
          'Payment Status': isPaid ? 'Settled' : 'Pending',
          'Payment Mode': matchingStored?.paymentMode || '',
          'Payment Date': matchingStored?.paymentDate || '',
          'Bank Name': matchingStored?.bankName || '',
          'Account Last 4': matchingStored?.accountLast4 || '',
          'UPI ID': matchingStored?.upiId || '',
          'UTR / Reference Number': matchingStored?.utrReference || p.paymentDetails || '',
          'Invoice Number': p.invoiceNumber || (p as any).billNumber || '',
          'Checklist Approved': p.checklistApproved ? 'Yes' : 'No'
        };
      });

      const csv = Papa.unparse(csvRows);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const monthLabel = monthFilter !== 'ALL' ? (MONTHS_MAP[monthFilter] || monthFilter) : 'All_Months';
      const yearLabel = yearFilter !== 'ALL' ? yearFilter : 'All_Years';
      link.download = `Bill_and_Checklist_Ledger_${monthLabel}_${yearLabel}_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      globalToast.success(`Successfully exported ${synchronizedPayments.length} Bill & Checklist records to CSV.`);
    } catch (err: any) {
      console.error('CSV Export Error:', err);
      globalToast.error(`Failed to export CSV: ${err.message || 'Unknown error'}`);
    }
  };

  // CSV Import Handler for Bill & Checklist
  const handleImportCSVFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    e.target.value = '';

    const getRowVal = (row: any, ...keys: string[]): string => {
      if (!row || typeof row !== 'object') return '';
      const rowKeys = Object.keys(row);
      for (const candidate of keys) {
        const candidateNorm = candidate.toLowerCase().replace(/[^a-z0-9]/g, '');
        for (const rk of rowKeys) {
          const rkNorm = rk.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (rkNorm === candidateNorm && row[rk] !== undefined && row[rk] !== null) {
            return String(row[rk]).trim();
          }
        }
      }
      return '';
    };

    Papa.parse(file, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (header: string) => header.trim().replace(/^\uFEFF/, ''),
      complete: (results) => {
        try {
          const rows = results.data as any[];
          if (!rows || rows.length === 0) {
            globalToast.error('The selected CSV file appears to be empty.');
            return;
          }

          let updatedTasksCount = 0;
          let paymentRecordsCount = 0;

          rows.forEach((row) => {
            if (!row || typeof row !== 'object') return;
            const hasContent = Object.values(row).some(v => v !== undefined && v !== null && String(v).trim() !== '');
            if (!hasContent) return;

            const rowTaskId = getRowVal(row, 'Task ID', 'taskId', 'task_id', 'id');
            const rowVideoId = getRowVal(row, 'Video ID', 'videoId', 'displayVideoId', 'vid', 'video_id');
            const rowCreatorName = getRowVal(row, 'Influencer / Creator Name', 'Influencer Name', 'Creator Name', 'Creator', 'Influencer', 'Name');
            const rowMobile = getRowVal(row, 'Mobile Number', 'Mobile', 'Phone', 'WhatsApp', 'WhatsApp Number');
            const rowProduct = getRowVal(row, 'Product / Deliverable', 'Product', 'Product Name', 'Title', 'Deliverable');
            const rowBilledAmountStr = getRowVal(row, 'Billed Amount (INR)', 'Billed Amount', 'Amount (INR)', 'Amount', 'Remuneration', 'Fee', 'Cost');
            const rowDeadline = getRowVal(row, 'Planned Release Date', 'Planned Date', 'Deadline', 'Date');
            const rowReleaseDate = getRowVal(row, 'Actual Release Date', 'Release Date', 'Posted Date');
            const rowLink1 = getRowVal(row, 'Video Link 1', 'Link 1', 'videoLink1');
            const rowLink2 = getRowVal(row, 'Video Link 2', 'Link 2', 'videoLink2');
            const rowLink3 = getRowVal(row, 'Video Link 3', 'Link 3', 'videoLink3');
            const rowShortIo = getRowVal(row, 'Short.io Link', 'Shortio Link', 'Short.io', 'shortIoLink');
            const rowStatus = getRowVal(row, 'Payment Status', 'Status');
            const rowUtr = getRowVal(row, 'UTR / Reference Number', 'UTR Reference', 'UTR', 'Reference', 'Reference Number', 'Transaction ID', 'Payment Details');
            const rowPaymentMode = getRowVal(row, 'Payment Mode', 'Mode');
            const rowPaymentDate = getRowVal(row, 'Payment Date', 'Paid Date');
            const rowBank = getRowVal(row, 'Bank Name', 'Bank');
            const rowAccountLast4 = getRowVal(row, 'Account Last 4', 'Account Number Last 4', 'Acc Last 4');
            const rowUpi = getRowVal(row, 'UPI ID', 'UPI');
            const rowInvoice = getRowVal(row, 'Invoice Number', 'Invoice / Bill Number', 'Bill Number', 'Invoice');
            const rowChecklistApproved = getRowVal(row, 'Checklist Approved');

            // Find matching task in active tasks list
            const matchedTask = tasks.find(t => {
              if (rowTaskId && t.id.toLowerCase() === rowTaskId.toLowerCase()) return true;
              if (rowVideoId && t.videoId && t.videoId.trim().toLowerCase() === rowVideoId.toLowerCase()) return true;
              if (rowVideoId && cleanChecklistVideoId(t.videoId || '').toLowerCase() === cleanChecklistVideoId(rowVideoId).toLowerCase()) return true;
              if (rowCreatorName) {
                const inf = resolveInfluencer(t.influencerId, (t as any).influencerName);
                const infName = inf?.name || (t as any).influencerName || '';
                const nameMatches = infName.trim().toLowerCase() === rowCreatorName.toLowerCase();
                if (nameMatches) {
                  if (rowDeadline && t.deadline && t.deadline.trim() === rowDeadline.trim()) return true;
                  if (rowProduct && t.title && t.title.trim().toLowerCase() === rowProduct.trim().toLowerCase()) return true;
                  return true;
                }
              }
              return false;
            });

            const parsedAmount = rowBilledAmountStr ? parseFloat(rowBilledAmountStr.replace(/[^0-9.]/g, '')) : undefined;

            if (matchedTask) {
              const updates: Partial<Task> = {};
              if (parsedAmount !== undefined && !isNaN(parsedAmount) && parsedAmount > 0) {
                updates.billedAmount = parsedAmount;
                updates.remuneration = parsedAmount;
              }
              if (rowVideoId && (!matchedTask.videoId || matchedTask.videoId !== rowVideoId)) {
                updates.videoId = rowVideoId;
              }
              if (rowDeadline && matchedTask.deadline !== rowDeadline) {
                updates.deadline = rowDeadline;
              }
              if (rowReleaseDate && matchedTask.releaseDate !== rowReleaseDate) {
                updates.releaseDate = rowReleaseDate;
              }
              if (rowLink1 && matchedTask.videoLink1 !== rowLink1) {
                updates.videoLink1 = rowLink1;
              }
              if (rowLink2 && matchedTask.videoLink2 !== rowLink2) {
                updates.videoLink2 = rowLink2;
              }
              if (rowLink3 && matchedTask.videoLink3 !== rowLink3) {
                updates.videoLink3 = rowLink3;
              }
              if (rowShortIo && matchedTask.shortIoLink !== rowShortIo) {
                updates.shortIoLink = rowShortIo;
              }
              if (rowProduct && matchedTask.title !== rowProduct) {
                updates.title = rowProduct;
              }
              if (rowInvoice) {
                (updates as any).invoiceNumber = rowInvoice;
              }
              if (rowChecklistApproved) {
                updates.checklistApproved = rowChecklistApproved.toLowerCase().startsWith('y');
              }
              if (rowUtr) {
                updates.paymentDetails = rowUtr;
                updates.paymentStatus = 'Completed';
              } else if (rowStatus && (rowStatus.toLowerCase().includes('settled') || rowStatus.toLowerCase().includes('paid') || rowStatus.toLowerCase().includes('completed'))) {
                updates.paymentStatus = 'Completed';
              }

              if (Object.keys(updates).length > 0) {
                onUpdateTask(matchedTask.id, updates);
                updatedTasksCount++;
              }

              // Also sync into PaymentDetailsStore if payment details / UTR provided
              if (rowUtr || rowBank || rowAccountLast4 || rowUpi || (parsedAmount && rowStatus?.toLowerCase().includes('paid'))) {
                const finalAmt = parsedAmount || matchedTask.billedAmount || matchedTask.remuneration || 0;
                upsertPaymentRecord({
                  taskId: matchedTask.id,
                  creatorName: rowCreatorName || resolveInfluencer(matchedTask.influencerId, (matchedTask as any).influencerName)?.name || 'Creator',
                  amount: finalAmt,
                  utrReference: rowUtr || matchedTask.paymentDetails || `CSV_PAY_${Date.now()}`,
                  paymentMode: rowPaymentMode || 'Bank Transfer (NEFT/IMPS)',
                  paymentDate: rowPaymentDate || new Date().toISOString().slice(0, 10),
                  bankName: rowBank || undefined,
                  accountLast4: rowAccountLast4 || undefined,
                  upiId: rowUpi || undefined,
                  productName: rowProduct || matchedTask.title,
                  videoId: rowVideoId || matchedTask.videoId,
                  status: 'Completed'
                });
                paymentRecordsCount++;
              }
            } else {
              // Row does not match an existing task, but has creator name and amount / UTR
              if (rowCreatorName && (rowUtr || parsedAmount)) {
                upsertPaymentRecord({
                  creatorName: rowCreatorName,
                  amount: parsedAmount || 0,
                  utrReference: rowUtr || `CSV_REF_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
                  paymentMode: rowPaymentMode || 'Bank Transfer (NEFT/IMPS)',
                  paymentDate: rowPaymentDate || new Date().toISOString().slice(0, 10),
                  bankName: rowBank || undefined,
                  accountLast4: rowAccountLast4 || undefined,
                  upiId: rowUpi || undefined,
                  productName: rowProduct || undefined,
                  videoId: rowVideoId || undefined,
                  mobile: rowMobile || undefined,
                  status: (rowStatus && (rowStatus.toLowerCase().includes('settled') || rowStatus.toLowerCase().includes('paid'))) ? 'Completed' : 'Saved'
                });
                paymentRecordsCount++;
              }
            }
          });

          if (updatedTasksCount > 0 || paymentRecordsCount > 0) {
            globalToast.success(`Import successful! Updated ${updatedTasksCount} deliverable record${updatedTasksCount !== 1 ? 's' : ''} and synced ${paymentRecordsCount} payment entry/entries.`);
          } else {
            globalToast.warning('CSV was processed, but no matching deliverables were found to update. Check that "Video ID", "Task ID", or "Influencer Name" matches your records.');
          }
        } catch (parseErr: any) {
          console.error('Error importing CSV:', parseErr);
          globalToast.error(`Failed to process CSV file: ${parseErr.message || 'Unknown error'}`);
        }
      },
      error: (err: any) => {
        globalToast.error(`CSV Parsing error: ${err.message || 'Failed to read file'}`);
      }
    });
  };

  const handleUploadBillingToDrive = async () => {
    setIsDriveSyncing(true);
    try {
      let activeToken = accessToken;
      if (!activeToken) {
        globalToast.info('Connecting to Google Drive...');
        activeToken = await ensureGoogleAccessToken(accessToken);
      }
      if (!activeToken) {
        throw new Error('Google Drive authentication is required.');
      }

      globalToast.info('Uploading PDF bill data to Google Drive...');
      const payload = influencers.map(inf => ({
        influencerName: inf.name,
        billingName: inf.billingName,
        billingAddress: inf.billingAddress,
        bankDetails: inf.bankDetails,
        influencerSignature: inf.influencerSignature,
        bdmSignature: inf.bdmSignature
      }));

      const fileData = {
        type: 'InfluencerBillingData',
        version: '1.0',
        timestamp: new Date().toISOString(),
        data: payload
      };

      const query = encodeURIComponent("name = 'influencer-billing-data.json' and trashed = false");
      const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)`;
      
      const searchRes = await fetch(url, {
        headers: { 'Authorization': `Bearer ${activeToken}` },
      });
      
      const searchData = await searchRes.json();
      let fileId = searchData.files && searchData.files.length > 0 ? searchData.files[0].id : null;

      const fileContent = JSON.stringify(fileData);
      const metadata = {
        name: 'influencer-billing-data.json',
        mimeType: 'application/json'
      };

      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      form.append('file', new Blob([fileContent], { type: 'application/json' }));

      let uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
      let method = 'POST';

      if (fileId) {
        uploadUrl = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`;
        method = 'PATCH';
      }

      const uploadRes = await fetch(uploadUrl, {
        method,
        headers: {
          'Authorization': `Bearer ${activeToken}`
        },
        body: form
      });

      if (!uploadRes.ok) {
        throw new Error('Upload failed.');
      }

      // Also backup payment details store to Google Drive
      try {
        const storedPays = loadStoredPayments();
        const delIds = Array.from(getDeletedPaymentIds());
        await uploadPaymentDetailsToDrive(activeToken, storedPays, delIds);
      } catch (payUpErr) {
        console.warn('[DriveSync] Payment details auto-upload notice:', payUpErr);
      }

      globalToast.success('Successfully uploaded PDF bill & payment details data to Google Drive.');
    } catch (err: any) {
      console.error(err);
      globalToast.error(`Upload failed: ${err.message}`);
    } finally {
      setIsDriveSyncing(false);
    }
  };

  const handleSyncBillingFromDrive = async () => {
    setIsDriveSyncing(true);
    try {
      let activeToken = accessToken;
      if (!activeToken) {
        globalToast.info('Connecting to Google Drive...');
        activeToken = await ensureGoogleAccessToken(accessToken);
      }
      if (!activeToken) {
        throw new Error('Google Drive authentication is required.');
      }

      globalToast.info('Syncing PDF bill & payment details data from Google Drive...');
      const query = encodeURIComponent("name = 'influencer-billing-data.json' and trashed = false");
      const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)`;
      
      const searchRes = await fetch(url, {
        headers: { 'Authorization': `Bearer ${activeToken}` },
      });
      
      const searchData = await searchRes.json();
      const fileId = searchData.files && searchData.files.length > 0 ? searchData.files[0].id : null;

      let updatedCount = 0;
      if (fileId) {
        const downloadRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
          headers: { 'Authorization': `Bearer ${activeToken}` }
        });

        if (downloadRes.ok) {
          const fileData = await downloadRes.json();
          if (fileData.type === 'InfluencerBillingData' && Array.isArray(fileData.data)) {
            for (const backupInf of fileData.data) {
              const localInf = influencers.find(inf => inf.name === backupInf.influencerName);
              if (localInf && onUpdateInfluencer) {
                onUpdateInfluencer(localInf.id, {
                  billingName: backupInf.billingName,
                  billingAddress: backupInf.billingAddress,
                  bankDetails: backupInf.bankDetails,
                  influencerSignature: backupInf.influencerSignature,
                  bdmSignature: backupInf.bdmSignature
                });
                updatedCount++;
              }
            }
          }
        }
      }

      // Also sync payment details store from Google Drive
      let syncedPaymentCount = 0;
      try {
        const payRes = await downloadPaymentDetailsFromDrive(activeToken);
        if (payRes && payRes.data && payRes.data.length > 0) {
          if (payRes.deletedIds && Array.isArray(payRes.deletedIds)) {
            payRes.deletedIds.forEach(delId => markPaymentIdAsDeleted(delId));
          }
          const cur = loadStoredPayments();
          const localDel = getDeletedPaymentIds();
          const existMap = new Map(cur.map(r => [r.id, r]));
          payRes.data.forEach((r: any) => {
            if (!localDel.has(r.id) && !existMap.has(r.id)) {
              cur.push(r);
              existMap.set(r.id, r);
              syncedPaymentCount++;
            }
          });
          saveStoredPayments(cur);
        }
      } catch (paySyncErr) {
        console.warn('[DriveSync] Payment details sync notice:', paySyncErr);
      }

      globalToast.success(`Successfully synchronized ${updatedCount} billing records and ${syncedPaymentCount} payment records from Google Drive.`);
    } catch (err: any) {
      console.error(err);
      globalToast.error(`Sync failed: ${err.message}`);
    } finally {
      setIsDriveSyncing(false);
    }
  };

  const [pdfSaveFuture, setPdfSaveFuture] = useState(true);
  const [pdfBillDate, setPdfBillDate] = useState('');
  const [pdfVideoNo, setPdfVideoNo] = useState('');
  const [pdfVideoReleaseDate, setPdfVideoReleaseDate] = useState('');
  const [pdfCampaignBrand, setPdfCampaignBrand] = useState('');
  const [pdfVideoLink, setPdfVideoLink] = useState('');
  const [pdfItemDesc, setPdfItemDesc] = useState('Product Promotion video');
  const [pdfRate, setPdfRate] = useState<number | string>('');
  
  // Optional Additional Items
  const [pdfAdditionalItemDesc, setPdfAdditionalItemDesc] = useState('');
  const [pdfAdditionalItemAmount, setPdfAdditionalItemAmount] = useState<number | string>('');
  const [pdfOrderNumber, setPdfOrderNumber] = useState('');
  const [pdfOrderDate, setPdfOrderDate] = useState('');

  const formatToDMY = (dateStr?: string) => {
    return formatDateToDMY(dateStr);
  };

  // Helper to extract Planned Release Date from task in DD/MM/YYYY format
  const getPlannedReleaseDate = (task?: Task | null): string => {
    if (!task) return '';
    const rawDate = task.deadline || task.plannedReleaseDate || task.plannedDate || task.planedVideoReleaseDate || task.releaseDate;
    if (!rawDate) return '';
    const trimmed = String(rawDate).trim();
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(trimmed)) {
      const parts = trimmed.split('-');
      return `${parts[2].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[0]}`;
    }
    if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(trimmed)) {
      const parts = trimmed.split('/');
      return `${parts[2].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[0]}`;
    }
    if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(trimmed)) {
      const parts = trimmed.split('-');
      return `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[2]}`;
    }
    return trimmed;
  };

  // Video ID display/generation helper
  const getVideoDisplayId = (task: Task, index?: number) => {
    if (task.videoId !== undefined) {
      return task.videoId;
    }
    
    // Extract any numbers from the ID to use as the base
    const numbersOnly = task.id.replace(/\D/g, '');
    
    if (numbersOnly.length > 0) {
      // If it's a timestamp (like Date.now() which is 13 digits), take the last 5
      if (numbersOnly.length > 8) {
        return `VID${numbersOnly.slice(-5)}`;
      }
      return `VID${numbersOnly.padStart(3, '0')}`;
    }
    
    // If absolutely no numbers in ID, use a hash
    let hash = 0;
    for (let i = 0; i < task.id.length; i++) {
      hash = (hash << 5) - hash + task.id.charCodeAt(i);
      hash = hash & hash;
    }
    return `VID${(Math.abs(hash) % 10000).toString().padStart(4, '0')}`;
  };

  // Helper to resolve the richest influencer profile by ID or Name
  const resolveInfluencer = (influencerId?: string, influencerName?: string) => {
    if (!influencerId && !influencerName) return undefined;
    let match = influencerId ? influencers.find(i => i.id === influencerId) : undefined;
    if (!match && influencerName) {
      const cleanName = influencerName.trim().toLowerCase();
      match = influencers.find(i => i.name && i.name.trim().toLowerCase() === cleanName);
    }
    const nameToSearch = (match?.name || influencerName || '').trim().toLowerCase();
    if (nameToSearch) {
      const candidates = influencers.filter(i => i.name && i.name.trim().toLowerCase() === nameToSearch);
      if (candidates.length > 1) {
        // Priority: mobile number > signature > bank details
        candidates.sort((a, b) => {
          const aScore = (a.mobile ? 4 : 0) + (a.influencerSignature ? 2 : 0) + (a.bankDetails?.accountNumber ? 1 : 0);
          const bScore = (b.mobile ? 4 : 0) + (b.influencerSignature ? 2 : 0) + (b.bankDetails?.accountNumber ? 1 : 0);
          return bScore - aScore;
        });
        return candidates[0];
      }
    }
    return match;
  };

  // 1. RECEIVE AVAILABLE DATA FROM MONTHLY PLANNER USING AUTO SYNCRONIZATION
  // Filter and process tasks from the Monthly Planner to form the live Bill Payment entries
  const synchronizedPayments = useMemo(() => {
    // We map each matched Task into a synchronized payment data line
    const list = tasks.map((t, idx) => {
      const influencer = resolveInfluencer(t.influencerId, (t as any).influencerName);
      const campaign = campaigns.find(c => c.id === t.campaignId);
      const hasLink = !!(t.videoLink1?.trim() || t.videoLink2?.trim() || t.videoLink3?.trim());
      const isCompletedVideo = hasLink && !!(t.releaseDate?.trim() || t.status === 'Completed');
      const resolvedName = influencer ? String(influencer.name) : ((t as any).influencerName || 'Unknown Creator');
      const resolvedMobile = influencer?.mobile || (t as any).influencerMobile || getKnownMobile(resolvedName) || '';

      return {
        ...t,
        index: idx,
        displayVideoId: getVideoDisplayId(t, idx),
        influencerName: resolvedName,
        influencerMobile: resolvedMobile,
        campaignName: campaign ? campaign.name : 'PRO-TO-GROW',
        isCompletedVideo,
      };
    });

    // Filtering logic based on user selection
    const filteredList = list.filter(item => {
      // Filter by text search: Influencer name, title or Video ID
      const matchesSearch = 
        item.influencerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.displayVideoId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.title && item.title.toLowerCase().includes(searchTerm.toLowerCase()));

      // Resolve Month & Year in planner
      let itemMonth = 'ALL';
      let itemYear = 'ALL';
      let itemWeek = 'ALL';
      
      const targetDate = item.isCompletedVideo && item.releaseDate ? item.releaseDate : item.deadline;

      if (targetDate && targetDate.includes('-')) {
        const parts = targetDate.split('-');
        if (parts.length >= 2) {
          itemYear = parts[0];
          itemMonth = parts[1];
        }
        if (parts.length >= 3) {
          const dayNum = parseInt(parts[2], 10);
          const weekNum = Math.ceil(dayNum / 7);
          itemWeek = weekNum.toString();
        }
      }

      const matchesMonth = monthFilter === 'ALL' || (itemMonth && monthFilter && parseInt(itemMonth, 10) === parseInt(monthFilter, 10));
      const matchesYear = yearFilter === 'ALL' || (itemYear && yearFilter && parseInt(itemYear, 10) === parseInt(yearFilter, 10));
      let matchesWeek = weekFilter === 'ALL' || itemWeek === weekFilter;
      if (weekFilter === '1-2' || weekFilter === '1st & 2nd week') {
        matchesWeek = itemWeek === '1' || itemWeek === '2';
      } else if (weekFilter === '1-3' || weekFilter === '1st, 2nd, 3rd week') {
        matchesWeek = itemWeek === '1' || itemWeek === '2' || itemWeek === '3';
      } else if (weekFilter === '1-4' || weekFilter === '1st, 2nd, 3rd, 4th week') {
        matchesWeek = itemWeek === '1' || itemWeek === '2' || itemWeek === '3' || itemWeek === '4';
      }

      // Filter by completed video status
      const matchesCompletionFilter = showCompletedOnly ? item.isCompletedVideo : true;

      // Filter by short.io link status
      let matchesShortIo = true;
      if (shortIoFilter === 'HAS_LINK') {
        matchesShortIo = Boolean(item.shortIoLink && String(item.shortIoLink).trim());
      } else if (shortIoFilter === 'NO_LINK') {
        matchesShortIo = !item.shortIoLink || !String(item.shortIoLink).trim();
      }

      // Must have at least one video link
      const hasVideoLink = !!(item.videoLink1?.trim() || item.videoLink2?.trim() || item.videoLink3?.trim() || item.shortIoLink?.trim());

      return matchesSearch && matchesMonth && matchesYear && matchesWeek && matchesCompletionFilter && matchesShortIo && hasVideoLink;
    });

    if (dateSortOrder !== 'none') {
      filteredList.sort((a, b) => {
        const valA = a.deadline || '';
        const valB = b.deadline || '';
        if (!valA && !valB) return 0;
        if (!valA) return 1; // Empty dates placed at bottom
        if (!valB) return -1;
        return dateSortOrder === 'asc'
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA);
      });
    }

    return filteredList;
  }, [tasks, influencers, campaigns, searchTerm, monthFilter, yearFilter, shortIoFilter, dateSortOrder, showCompletedOnly]);

  // Aggregate stats across synchronized items internally connected with Payment Details vault
  const stats = useMemo(() => {
    let totalRemuneration = 0;
    let completedPaidAmount = 0;
    let pendingUnpaidAmount = 0;
    let shortIoCount = 0;
    let settledCount = 0;
    let outstandingCount = 0;

    const deletedIds = getDeletedPaymentIds();

    synchronizedPayments.forEach(item => {
      const amt = item.billedAmount !== undefined && item.billedAmount > 0 ? item.billedAmount : (item.remuneration || 0);
      totalRemuneration += amt;
      
      const isDeleted = (item.id && (deletedIds.has(item.id) || deletedIds.has(`task_pay_${item.id}`))) ||
                        (item.paymentDetails && deletedIds.has(`utr_${item.paymentDetails.trim().toLowerCase()}`));

      const matchingStored = isDeleted ? undefined : storedRecords.find(r => 
        (item.id && (r.taskId === item.id || r.id === `task_pay_${item.id}`)) ||
        (item.paymentDetails && r.utrReference && r.utrReference.trim().toLowerCase() === item.paymentDetails.trim().toLowerCase()) ||
        (r.creatorName && item.influencerName && r.creatorName.trim().toLowerCase() === item.influencerName.trim().toLowerCase() && Math.abs((r.amount || 0) - amt) < 1)
      );

      const isSettled = !isDeleted && (
        item.paymentStatus === 'Completed' ||
        Boolean(item.paymentDetails && item.paymentDetails.trim() !== '') ||
        Boolean(matchingStored)
      );

      if (isSettled) {
        settledCount++;
        completedPaidAmount += matchingStored ? (matchingStored.amount || amt) : amt;
      } else {
        outstandingCount++;
        pendingUnpaidAmount += amt;
      }

      if (item.shortIoLink && String(item.shortIoLink).trim() !== '') {
        shortIoCount++;
      }
    });

    return {
      totalRemuneration,
      completedPaidAmount,
      pendingUnpaidAmount,
      shortIoCount,
      settledCount,
      outstandingCount,
      count: synchronizedPayments.length
    };
  }, [synchronizedPayments, storedRecords]);

  // Edit value updater with two-way sync to Payment Details vault
  const handleUpdateField = (taskId: string, fieldName: keyof Task, val: any) => {
    const updatedFields: Partial<Task> = { [fieldName]: val };

    // "IF PAYMENT DETAILS ENTERED TAKE IT AS COMPLETED"
    if (fieldName === 'paymentDetails') {
      const detailsStr = (val || '').toString().trim();
      if (detailsStr !== '') {
        updatedFields.paymentStatus = 'Completed';
        const task = tasks.find(t => t.id === taskId);
        if (task) {
          const inf = resolveInfluencer(task.influencerId, (task as any).influencerName);
          const creatorName = (task as any).influencerName || inf?.name || 'Creator';
          const mobile = cleanSingleMobileForStorage((task as any).influencerMobile || inf?.mobile || getKnownMobile(creatorName));
          upsertPaymentRecord({
            taskId,
            influencerId: task.influencerId || inf?.id,
            creatorName,
            productName: task.title || (task as any)?.product || '',
            amount: task.billedAmount || task.remuneration || 0,
            utrReference: detailsStr,
            paymentMode: task.paymentMethod || 'Bank Transfer (NEFT/IMPS)',
            paymentDate: task.paidDate || new Date().toLocaleDateString('en-GB'),
            mobile,
            status: 'Saved'
          });
        }
      }
    }

    if (fieldName === 'billSubmitted') {
      if (val === 'Yes') {
        const now = new Date();
        updatedFields.billSubmittedDate = `${now.toLocaleDateString('en-GB')} ${now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
      } else {
        updatedFields.billSubmittedDate = '';
      }
    }

    onUpdateTask(taskId, updatedFields);
  };

  // Quick action: Accept payment details and set as Completed, syncing with Payment Details store
  const handleQuickSettle = (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    const amt = task ? (task.billedAmount || task.remuneration || 0) : 0;
    const inf = task ? resolveInfluencer(task.influencerId, (task as any).influencerName) : null;
    const creatorName = task ? ((task as any).influencerName || inf?.name || 'Creator') : 'Creator';
    const mobile = task ? cleanSingleMobileForStorage((task as any).influencerMobile || inf?.mobile || getKnownMobile(creatorName)) : '';
    const nowStr = new Date().toLocaleDateString('en-GB');

    onUpdateTask(taskId, {
      paymentStatus: 'Completed',
      paymentDetails: 'Settled via Quick Clearance Ledger',
      paidDate: nowStr
    });

    upsertPaymentRecord({
      taskId,
      influencerId: task?.influencerId || inf?.id,
      creatorName,
      productName: task?.title || (task as any)?.product || '',
      amount: amt,
      utrReference: 'Settled via Quick Clearance Ledger',
      paymentMode: 'Bank Transfer (NEFT/IMPS)',
      paymentDate: nowStr,
      mobile,
      status: 'Saved'
    });
  };

  const openWhatsAppModal = (item: any, initialTmpl: BillWhatsAppTemplate = 'payment_details') => {
    const inf = resolveInfluencer(item.influencerId, item.influencerName);
    const amt = item.billedAmount !== undefined ? item.billedAmount : (item.remuneration || 0);
    const details = item.paymentDetails || '';
    const dateStr = item.paidDate || new Date().toLocaleDateString('en-GB');
    const mode = item.paymentMethod || 'Bank Transfer (NEFT/IMPS)';
    const bank = inf?.bankDetails?.bankName || '';
    const last4 = inf?.bankDetails?.accountNumber ? String(inf.bankDetails.accountNumber).slice(-4) : '';
    const upi = inf?.bankDetails?.upiId || '';
    const vId = item.videoId || item.displayVideoId || (item.id ? `VoId-${item.id.slice(-4)}` : '');
    const creatorName = item.influencerName || inf?.name || 'Creator';
    const effectiveMobile = cleanSingleMobileForStorage(item.influencerMobile || inf?.mobile || getKnownMobile(creatorName) || '');

    const modalItem = {
      ...item,
      influencerMobile: effectiveMobile,
      influencerName: creatorName,
      influencerId: item.influencerId || inf?.id || '',
    };

    setCustomMobileNumber(effectiveMobile);
    setWhatsAppModalItem(modalItem);
    setWhatsAppTemplate(initialTmpl);
    setCustomAmount(amt);
    setCustomPaymentDetails(details);
    setCustomPaymentMode(mode);
    setCustomPaymentDate(dateStr);
    setCustomBankName(bank);
    setCustomAccountLast4(last4);
    setCustomUpiId(upi);
    setIncludeBankDetails(Boolean(bank || upi));
    setSaveToTaskOnSend(true);
    setPastedBankMessage('');
    setParsedBankResult(null);

    const initialDraft = getBillPaymentWhatsAppText({
      template: initialTmpl,
      lang: whatsAppLang,
      creatorName: modalItem.influencerName,
      productName: item.title || item.product || 'promotional video',
      campaignName: item.campaignName,
      amount: amt,
      paymentDetails: details,
      paymentMode: mode,
      paymentDate: dateStr,
      bankName: bank,
      accountLast4: last4,
      upiId: upi,
      includeBankInfo: Boolean(bank || upi),
      videoId: vId,
    });
    setWhatsAppMessageDraft(initialDraft);
  };

  const regenerateDraft = (
    tmpl: BillWhatsAppTemplate,
    lang: 'en' | 'as',
    amt: number,
    details: string,
    mode: string,
    pDate: string,
    bName?: string,
    accLast4?: string,
    uId?: string,
    incBank?: boolean
  ) => {
    if (!whatsAppModalItem) return;
    const inf = resolveInfluencer(whatsAppModalItem.influencerId, whatsAppModalItem.influencerName);
    const effectiveBankName = bName !== undefined ? bName : (customBankName || inf?.bankDetails?.bankName);
    const effectiveLast4 = accLast4 !== undefined ? accLast4 : (customAccountLast4 || (inf?.bankDetails?.accountNumber ? String(inf.bankDetails.accountNumber).slice(-4) : ''));
    const effectiveUpi = uId !== undefined ? uId : (customUpiId || inf?.bankDetails?.upiId);
    const effectiveIncBank = incBank !== undefined ? incBank : includeBankDetails;
    const vId = whatsAppModalItem.videoId || whatsAppModalItem.displayVideoId || (whatsAppModalItem.id ? `VoId-${whatsAppModalItem.id.slice(-4)}` : '');

    const text = getBillPaymentWhatsAppText({
      template: tmpl,
      lang,
      creatorName: whatsAppModalItem.influencerName || inf?.name || 'Creator',
      productName: whatsAppModalItem.title || whatsAppModalItem.product || 'promotional video',
      campaignName: whatsAppModalItem.campaignName,
      amount: amt,
      paymentDetails: details,
      paymentMode: mode,
      paymentDate: pDate,
      bankName: effectiveBankName,
      accountLast4: effectiveLast4,
      upiId: effectiveUpi,
      includeBankInfo: effectiveIncBank,
      videoId: vId,
    });
    setWhatsAppMessageDraft(text);
  };

  const getSampleBankMessage = (creatorName = 'Creator', amt = 8000) => {
    const dateStr = new Date().toLocaleDateString('en-GB');
    return `${dateStr}\tINB/NEFT/AXODH${Math.floor(10000000000 + Math.random() * 90000000000)}/${creatorName}\tAXODH28193290602\t\nINR ${Number(amt).toLocaleString('en-IN')}.00`;
  };

  const handleProcessBankMessage = (rawMsg: string, showToast = false) => {
    setPastedBankMessage(rawMsg);
    if (!rawMsg.trim()) {
      setParsedBankResult(null);
      return;
    }
    const parsed = parseBankPaymentMessage(rawMsg);
    setParsedBankResult(parsed);
    const matchedInf = resolveInfluencer(whatsAppModalItem?.influencerId, whatsAppModalItem?.influencerName);

    let newAmt = customAmount;
    let newDetails = customPaymentDetails;
    let newMode = customPaymentMode;
    let newDate = customPaymentDate;
    let newBank = customBankName;
    let newLast4 = customAccountLast4;
    let newUpi = customUpiId;
    let newIncBank = includeBankDetails;
    let detectedCount = 0;

    if (parsed.amount !== null && parsed.amount > 0) {
      newAmt = parsed.amount;
      setCustomAmount(parsed.amount);
      detectedCount++;
    }

    if (parsed.reference) {
      newDetails = parsed.reference;
      setCustomPaymentDetails(parsed.reference);
      detectedCount++;
    }

    if (parsed.paymentMode) {
      newMode = parsed.paymentMode;
      setCustomPaymentMode(parsed.paymentMode);
      detectedCount++;
    }

    if (parsed.date) {
      newDate = parsed.date;
      setCustomPaymentDate(parsed.date);
      detectedCount++;
    }

    // Collect beneficiary bank name from influencer bill details
    const influencerBillBank = matchedInf?.bankDetails?.bankName || (matchedInf as any)?.bankName || '';
    if (influencerBillBank) {
      newBank = influencerBillBank;
      setCustomBankName(influencerBillBank);
      newIncBank = true;
      setIncludeBankDetails(true);
      detectedCount++;
    } else if (parsed.bankName && !parsed.bankName.toLowerCase().includes('axis')) {
      newBank = parsed.bankName;
      setCustomBankName(parsed.bankName);
      newIncBank = true;
      setIncludeBankDetails(true);
      detectedCount++;
    }

    // Collect account last 4 from influencer bill details
    const influencerLast4 = matchedInf?.bankDetails?.accountNumber
      ? String(matchedInf.bankDetails.accountNumber).slice(-4)
      : '';
    if (influencerLast4) {
      newLast4 = influencerLast4;
      setCustomAccountLast4(influencerLast4);
      newIncBank = true;
      setIncludeBankDetails(true);
    } else if (parsed.accountLast4) {
      newLast4 = parsed.accountLast4;
      setCustomAccountLast4(parsed.accountLast4);
      newIncBank = true;
      setIncludeBankDetails(true);
      detectedCount++;
    }

    // Collect UPI from influencer bill details
    const influencerUpi = matchedInf?.bankDetails?.upiId || '';
    if (influencerUpi) {
      newUpi = influencerUpi;
      setCustomUpiId(influencerUpi);
      newIncBank = true;
      setIncludeBankDetails(true);
    } else if (parsed.upiId) {
      newUpi = parsed.upiId;
      setCustomUpiId(parsed.upiId);
      newIncBank = true;
      setIncludeBankDetails(true);
      detectedCount++;
    }

    regenerateDraft(
      whatsAppTemplate,
      whatsAppLang,
      newAmt,
      newDetails,
      newMode,
      newDate,
      newBank,
      newLast4,
      newUpi,
      newIncBank
    );

    // Automatically sync and record payment details to Payment Details vault
    const inf = resolveInfluencer(whatsAppModalItem?.influencerId, whatsAppModalItem?.influencerName);
    const creatorName = whatsAppModalItem?.influencerName || inf?.name || parsed.beneficiary || 'Creator';
    const effectiveMobile = cleanSingleMobileForStorage(customMobileNumber || whatsAppModalItem?.influencerMobile || inf?.mobile || getKnownMobile(creatorName) || '');

    upsertPaymentRecord({
      taskId: whatsAppModalItem?.id,
      influencerId: whatsAppModalItem?.influencerId || inf?.id,
      creatorName,
      productName: whatsAppModalItem?.title || whatsAppModalItem?.product || '',
      campaignName: whatsAppModalItem?.campaignName || '',
      videoId: whatsAppModalItem?.videoId || whatsAppModalItem?.displayVideoId || '',
      videoLink: Array.isArray(whatsAppModalItem?.videoLinks) ? whatsAppModalItem.videoLinks[0] : (whatsAppModalItem?.videoLink || ''),
      mobile: effectiveMobile,
      amount: newAmt,
      utrReference: newDetails,
      paymentMode: newMode,
      paymentDate: newDate,
      bankName: newBank,
      accountLast4: newLast4,
      upiId: newUpi,
      rawPastedMessage: rawMsg,
      status: 'Saved',
    });

    if (showToast) {
      if (detectedCount > 0) {
        globalToast.success(
          whatsAppLang === 'as'
            ? `বেংক মেছেজৰ পৰা ${detectedCount} টা তথ্য সংগ্ৰহ কৰা হ’ল!`
            : `Auto-collected ${detectedCount} payment details from bank message!`
        );
      } else {
        globalToast.info(
          whatsAppLang === 'as'
            ? 'কোনো নিৰ্দিষ্ট পেমেন্ট তথ্য চিনাক্ত নহ’ল।'
            : 'No standard payment fields recognized in pasted message.'
        );
      }
    }
  };

  const handleLoadSampleBankMessage = () => {
    const creatorName = whatsAppModalItem?.influencerName || 'Creator';
    const amt = Number(customAmount) || whatsAppModalItem?.billedAmount || 8000;
    handleProcessBankMessage(getSampleBankMessage(creatorName, amt), true);
  };

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        handleProcessBankMessage(text, true);
      } else {
        globalToast.info('Clipboard is empty.');
      }
    } catch {
      globalToast.info('Please paste the bank message directly into the box.');
    }
  };

  const handleDirectQuickSend = (item: any, tmpl: BillWhatsAppTemplate) => {
    const inf = resolveInfluencer(item.influencerId, item.influencerName);
    const amt = item.billedAmount !== undefined ? item.billedAmount : (item.remuneration || 0);
    const details = item.paymentDetails || 'Settled via Bank Transfer';
    const dateStr = item.paidDate || new Date().toLocaleDateString('en-GB');
    const mode = item.paymentMethod || 'Bank Transfer (NEFT/IMPS)';
    const bank = inf?.bankDetails?.bankName;
    const last4 = inf?.bankDetails?.accountNumber ? String(inf.bankDetails.accountNumber).slice(-4) : '';
    const upi = inf?.bankDetails?.upiId;
    const vId = item.videoId || item.displayVideoId || (item.id ? `VoId-${item.id.slice(-4)}` : '');
    const creatorName = item.influencerName || inf?.name || 'Creator';

    const msgText = getBillPaymentWhatsAppText({
      template: tmpl,
      lang: whatsAppLang,
      creatorName,
      productName: item.title || item.product || 'promotional video',
      campaignName: item.campaignName,
      amount: amt,
      paymentDetails: details,
      paymentMode: mode,
      paymentDate: dateStr,
      bankName: bank,
      accountLast4: last4,
      upiId: upi,
      includeBankInfo: Boolean(bank || upi),
      videoId: vId,
    });

    const mobile = item.influencerMobile || inf?.mobile || getKnownMobile(creatorName);
    if (!mobile) {
      triggerUpdateWhatsAppModal({
        influencerId: item.influencerId || (inf?.id || ''),
        influencerName: creatorName,
        influencerHandle: inf?.handle,
        influencerAvatar: inf?.avatar,
        currentMobile: inf?.mobile || '',
        messageText: msgText,
        contextTitle: 'Payment Clearance Notification',
        onSuccess: (savedNumber: string) => {
          item.influencerMobile = savedNumber;
          onUpdateTask(item.id, { influencerMobile: savedNumber });
          onUpdateInfluencer?.(item.influencerId || inf?.id, { mobile: savedNumber, name: creatorName });
          openWhatsAppChat({
            phoneNumber: savedNumber,
            text: msgText,
            preferApp: true,
            contactName: creatorName
          });
        }
      });
      return;
    }

    openWhatsAppChat({
      phoneNumber: mobile,
      text: msgText,
      preferApp: true,
      contactName: creatorName
    });
  };

  const handleConfirmSendWhatsApp = (preferApp = true) => {
    if (!whatsAppModalItem) return;
    const inf = resolveInfluencer(whatsAppModalItem.influencerId, whatsAppModalItem.influencerName);
    const creatorName = whatsAppModalItem.influencerName || inf?.name || 'Creator';
    const mobile = cleanSingleMobileForStorage(customMobileNumber || whatsAppModalItem.influencerMobile || inf?.mobile || getKnownMobile(creatorName));

    // If user opted to save payment details back to the task
    const updates: Partial<Task> = {};
    if (saveToTaskOnSend && (whatsAppTemplate === 'payment_details' || whatsAppTemplate === 'bill_checklist' || whatsAppTemplate === 'payment_cleared')) {
      updates.paymentStatus = 'Completed';
      updates.paymentDetails = customPaymentDetails || 'Settled via Bank Transfer';
      if (customAmount) updates.billedAmount = Number(customAmount);
      if (customPaymentMode) updates.paymentMethod = customPaymentMode;
      if (customPaymentDate) updates.paidDate = customPaymentDate;
    }
    if (mobile) {
      updates.influencerMobile = mobile;
    }
    if (Object.keys(updates).length > 0) {
      onUpdateTask(whatsAppModalItem.id, updates);
    }
    if (mobile && onUpdateInfluencer) {
      onUpdateInfluencer(whatsAppModalItem.influencerId || inf?.id || '', { mobile, name: creatorName });
    }

    // Keep Payment Details vault updated and marked as Sent
    upsertPaymentRecord({
      taskId: whatsAppModalItem.id,
      influencerId: whatsAppModalItem.influencerId || inf?.id,
      creatorName,
      productName: whatsAppModalItem.title || whatsAppModalItem.product || '',
      campaignName: whatsAppModalItem.campaignName || '',
      videoId: whatsAppModalItem.videoId || whatsAppModalItem.displayVideoId || '',
      videoLink: Array.isArray(whatsAppModalItem.videoLinks) ? whatsAppModalItem.videoLinks[0] : (whatsAppModalItem.videoLink || ''),
      mobile: mobile || '',
      amount: Number(customAmount) || whatsAppModalItem.billedAmount || 0,
      utrReference: customPaymentDetails,
      paymentMode: customPaymentMode,
      paymentDate: customPaymentDate,
      bankName: customBankName,
      accountLast4: customAccountLast4,
      upiId: customUpiId,
      rawPastedMessage: pastedBankMessage,
      status: 'Sent_WhatsApp',
      lastSentAt: new Date().toISOString(),
    });

    if (!mobile) {
      triggerUpdateWhatsAppModal({
        influencerId: whatsAppModalItem.influencerId || (inf?.id || ''),
        influencerName: creatorName,
        influencerHandle: inf?.handle,
        influencerAvatar: inf?.avatar,
        currentMobile: inf?.mobile || '',
        messageText: whatsAppMessageDraft,
        contextTitle: 'Payment Clearance Notification',
        onSuccess: (savedNumber: string) => {
          setCustomMobileNumber(savedNumber);
          whatsAppModalItem.influencerMobile = savedNumber;
          onUpdateTask(whatsAppModalItem.id, { influencerMobile: savedNumber });
          onUpdateInfluencer?.(whatsAppModalItem.influencerId || inf?.id, { mobile: savedNumber, name: creatorName });
          openWhatsAppChat({
            phoneNumber: savedNumber,
            text: whatsAppMessageDraft,
            preferApp: true,
            contactName: creatorName
          });
        }
      });
      setWhatsAppModalItem(null);
      return;
    }

    openWhatsAppChat({
      phoneNumber: mobile,
      text: whatsAppMessageDraft,
      preferApp,
      contactName: creatorName
    });
    setWhatsAppModalItem(null);
  };

    const handleOpenPdfModal = (task: Task, initialInfluencer: Influencer | undefined) => {
    const resolvedInfluencer = resolveInfluencer(task.influencerId, (task as any).influencerName) || initialInfluencer;
    const infName = resolvedInfluencer?.name || (task as any).influencerName || '';
    const infMobile = resolvedInfluencer?.mobile || (task as any).influencerMobile || getKnownMobile(infName) || '';

    setPdfTask({
      ...task,
      influencerName: infName,
      influencerMobile: infMobile,
      influencerId: resolvedInfluencer?.id || task.influencerId || '',
    });
    setPdfInfluencer(resolvedInfluencer);
    
    setPdfBillFromName(resolvedInfluencer?.billingName || resolvedInfluencer?.name || '');
    setPdfBillFromAddress(resolvedInfluencer?.billingAddress || resolvedInfluencer?.location || '');
    setPdfBillToName(localStorage.getItem('COMPANY_BILL_TO_NAME') || 'PROTOGROW CORP LLP');
    setPdfBillToAddress(localStorage.getItem('COMPANY_BILL_TO_ADDRESS') || 'HOUSE NO 22, 1ST FLOOR, GS ROAD, AMRAWATI PATH CHRISTIAN BASTI, GUWAHATI, PIN-781005');
    setPdfBillToPhone(localStorage.getItem('COMPANY_BILL_TO_PHONE') || '8724044420');
    
    setPdfAccountName(resolvedInfluencer?.bankDetails?.accountName || resolvedInfluencer?.name || '');
    setPdfPan(resolvedInfluencer?.bankDetails?.pan || '');
    setPdfAccountNumber(resolvedInfluencer?.bankDetails?.accountNumber || '');
    setPdfBankName(resolvedInfluencer?.bankDetails?.bankName || '');
    setPdfIfsc(resolvedInfluencer?.bankDetails?.ifsc || '');
    

    const infSig = resolvedInfluencer?.influencerSignature || '';
    setPdfInfluencerSig(infSig);
    if (infSig.startsWith('gdrive:')) {
      setPdfInfluencerSigData('');
      if (accessToken) fetchImageFromDrive(infSig.replace('gdrive:', ''), accessToken).then(setPdfInfluencerSigData);
    } else {
      setPdfInfluencerSigData(infSig);
    }

    const authSig = localStorage.getItem('COMPANY_BDM_SIGNATURE') || resolvedInfluencer?.bdmSignature || '';
    setPdfAuthSig(authSig);
    if (authSig.startsWith('gdrive:')) {
      setPdfAuthSigData('');
      if (accessToken) fetchImageFromDrive(authSig.replace('gdrive:', ''), accessToken).then(setPdfAuthSigData);
    } else {
      setPdfAuthSigData(authSig);
    }

    setPdfSaveFuture(true);

    const d = new Date();
    const defaultBillDate = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
    setPdfBillDate(defaultBillDate);
    
    const videoId = task.videoId || (task.displayVideoId ? task.displayVideoId : (task.id ? `VoId-${task.id.slice(-4)}` : 'VoId-0000'));
    setPdfVideoNo(videoId);
    
    let releaseDate = '';
    if (task.deadline) {
      const rd = new Date(task.deadline);
      releaseDate = `${String(rd.getDate()).padStart(2, '0')}-${String(rd.getMonth() + 1).padStart(2, '0')}-${rd.getFullYear()}`;
    }
    setPdfVideoReleaseDate(releaseDate);
    
    const brandName = task.campaignName || '';
    const productName = task.title || '';
    setPdfCampaignBrand(brandName && productName ? `${brandName} / ${productName}` : (brandName || productName || ''));
    setPdfVideoLink(task.videoLink1 || '');
    setPdfItemDesc('Product Promotion video');
    const defaultRate = task.billedAmount !== undefined ? task.billedAmount : (task.remuneration || 0);
    setPdfRate(defaultRate);
    
    // Clear optional fields initially
    setPdfAdditionalItemDesc(task.pdfAdditionalItemDesc || '');
    setPdfAdditionalItemAmount(task.pdfAdditionalItemAmount || '');
    setPdfOrderNumber(task.pdfOrderNumber || '');
    setPdfOrderDate(task.pdfOrderDate || '');
  };


    const saveBillToLocal = () => {
    localStorage.setItem('COMPANY_BILL_TO_NAME', pdfBillToName);
    localStorage.setItem('COMPANY_BILL_TO_ADDRESS', pdfBillToAddress);
    localStorage.setItem('COMPANY_BILL_TO_PHONE', pdfBillToPhone);
    localStorage.setItem('COMPANY_BDM_SIGNATURE', pdfAuthSig);
  };

  const handleSavePdfDetails = () => {
    if (!pdfTask) return;
    saveBillToLocal();
    if (onUpdateInfluencer && pdfInfluencer) {
      onUpdateInfluencer(pdfInfluencer.id, {
        billingName: pdfBillFromName,
        billingAddress: pdfBillFromAddress,
        bankDetails: {
          accountName: pdfAccountName,
          pan: pdfPan,
          accountNumber: pdfAccountNumber,
          bankName: pdfBankName,
          ifsc: pdfIfsc,
        },
        influencerSignature: pdfInfluencerSig,
        bdmSignature: pdfAuthSig
      });
    }
    
    if (onUpdateTask) {
      onUpdateTask(pdfTask.id, {
        pdfBillDate,
        pdfVideoNo,
        pdfVideoReleaseDate,
        pdfCampaignBrand,
        pdfVideoLink,
        pdfItemDesc,
        pdfRate,
        pdfAdditionalItemDesc,
        pdfAdditionalItemAmount,
        pdfOrderNumber,
        pdfOrderDate
      });
    }
    setPdfTask(null);
  };

  
  const formatDateForPdf = (dateString: string) => {
    if (!dateString || !dateString.includes('-')) return dateString;
    const parts = dateString.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return dateString;
  };

  const handleGeneratePdfSubmit = () => {
    if (!pdfTask) return;
    
    saveBillToLocal();
    if (pdfSaveFuture && onUpdateInfluencer && pdfInfluencer) {
      onUpdateInfluencer(pdfInfluencer.id, {
        billingName: pdfBillFromName,
        billingAddress: pdfBillFromAddress,
        bankDetails: {
          accountName: pdfAccountName,
          pan: pdfPan,
          accountNumber: pdfAccountNumber,
          bankName: pdfBankName,
          ifsc: pdfIfsc,
        },
        influencerSignature: pdfInfluencerSig,
        bdmSignature: pdfAuthSig
      });
    }

        generateInfluencerBillPDF(pdfTask, pdfInfluencer, {}, {
      billFromName: pdfBillFromName,
      billFromAddress: pdfBillFromAddress,
      billToName: pdfBillToName,
      billToAddress: pdfBillToAddress,
      billToPhone: pdfBillToPhone,
      accountName: pdfAccountName,
      pan: pdfPan,
      accountNumber: pdfAccountNumber,
      bankName: pdfBankName,
      ifsc: pdfIfsc,
      influencerSignatureBase64: pdfInfluencerSigData,
      authorizedSignatureBase64: pdfAuthSigData,
      billDate: pdfBillDate,
      videoNo: pdfVideoNo,
      videoReleaseDate: pdfVideoReleaseDate,
      campaignBrand: pdfCampaignBrand,
      videoLink: pdfVideoLink,
      itemDescription: pdfItemDesc,
      rate: Number(pdfRate),
      additionalItemDesc: pdfAdditionalItemDesc,
      additionalItemAmount: Number(pdfAdditionalItemAmount),
      orderNumber: pdfOrderNumber,
      orderDate: pdfOrderDate
    });

    // Close modal

    if (onUpdateTask) {
      onUpdateTask(pdfTask.id, {
        pdfBillDate,
        pdfVideoNo,
        pdfVideoReleaseDate,
        pdfCampaignBrand,
        pdfVideoLink,
        pdfItemDesc,
        pdfRate,
        pdfAdditionalItemDesc,
        pdfAdditionalItemAmount,
        pdfOrderNumber,
        pdfOrderDate
      });
    }
    setPdfTask(null);
  };

  const handleOpenChecklistModal = (task: Task, initialInfluencer: Influencer | undefined) => {
    const resolvedInfluencer = resolveInfluencer(task.influencerId, (task as any).influencerName) || initialInfluencer;
    const infName = resolvedInfluencer?.name || (task as any).influencerName || '';
    const infMobile = resolvedInfluencer?.mobile || (task as any).influencerMobile || getKnownMobile(infName) || '';

    setChecklistTask({
      ...task,
      influencerName: infName,
      influencerMobile: infMobile,
      influencerId: resolvedInfluencer?.id || task.influencerId || '',
    });
    setChecklistInfluencer(resolvedInfluencer);
    setChecklistInfluencerName(infName);

    // Video ID must be shown on Document Header Details
    const rawVideoId = (task.videoId && String(task.videoId).trim()) 
      ? String(task.videoId).trim() 
      : (task.displayVideoId && String(task.displayVideoId).trim()) 
        ? String(task.displayVideoId).trim() 
        : getVideoDisplayId(task, task.index ?? 0);
    const resolvedVideoId = cleanChecklistVideoId(task.checklistVideoId || rawVideoId);
    setChecklistVideoId(resolvedVideoId);

    // Product Name/Title collected from Central Product Checklist Store
    const plannerProduct = (task.title || task.productName || task.product || '').trim();
    const fallbackBrand = task.campaignName && task.campaignName !== 'PRO-TO-GROW' ? task.campaignName : 'Chocolate Drink';
    const effectivePlannerProduct = plannerProduct || fallbackBrand;

    // Collect product-specific checklist from Central Store
    const productPreset = getProductChecklist(effectivePlannerProduct);
    setActiveProductConfig(productPreset);
    setSelectedProductPreset(productPreset.productName);

    // Document Title Header: collected strictly from Central Product Checklist Store
    const finalProductTitle = productPreset.title 
      ? productPreset.title 
      : (productPreset.productName 
          ? (productPreset.productName.toLowerCase().startsWith('product') ? productPreset.productName : `Product - ${productPreset.productName}`)
          : effectivePlannerProduct);

    setChecklistProductTitle(finalProductTitle);

    // Use PLANNED RELEASE DATE as default CHECKLIST DATE
    const plannedRelease = getPlannedReleaseDate(task);
    const d = new Date();
    const todayDefault = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    const initialChecklistDate = plannedRelease || task.checklistDate || todayDefault;
    setChecklistDate(initialChecklistDate);

    // BDM Name: prefer productPreset default, or task approacher, fallback to ASHIM GOGOI
    const bdm = productPreset.defaultBdmName || task.checklistBdmName || task.approacher || 'ASHIM GOGOI';
    setChecklistBdmName(bdm);

    // CRITICAL: Collect BDM SIGNATURE exclusively from Central Product Checklist Store!
    // Do NOT add previously stored signature from localStorage or other tasks/influencers.
    const centralStoreSig = productPreset.bdmSignatureData || productPreset.bdmSignature || '';
    setChecklistBdmSig(centralStoreSig);
    setChecklistBdmSigData(centralStoreSig);

    if (task.checklistSections) {
      try {
        const parsed = typeof task.checklistSections === 'string' ? JSON.parse(task.checklistSections) : task.checklistSections;
        if (Array.isArray(parsed) && parsed.length > 0) {
          setChecklistSections(parsed);
        } else {
          setChecklistSections(JSON.parse(JSON.stringify(productPreset.sections)));
        }
      } catch {
        setChecklistSections(JSON.parse(JSON.stringify(productPreset.sections)));
      }
    } else {
      // Auto-collect product checklist directly from Central Store!
      setChecklistSections(JSON.parse(JSON.stringify(productPreset.sections)));
    }
  };

  const handleLoadProductPreset = (prodName: string) => {
    if (!prodName) return;
    const config = getProductChecklist(prodName);
    setActiveProductConfig(config);
    setSelectedProductPreset(config.productName);
    setChecklistProductTitle(config.title || (config.productName.toLowerCase().startsWith('product') ? config.productName : `Product - ${config.productName}`));
    setChecklistSections(JSON.parse(JSON.stringify(config.sections)));
    if (config.defaultBdmName) {
      setChecklistBdmName(config.defaultBdmName);
    }
    if (config.bdmSignatureData || config.bdmSignature) {
      const presetSig = config.bdmSignatureData || config.bdmSignature || '';
      setChecklistBdmSig(presetSig);
      setChecklistBdmSigData(presetSig);
    }
    globalToast.info(`Loaded central checklist preset for "${config.productName}".`);
  };

  const handleSaveToCentralStore = () => {
    const rawProd = checklistProductTitle.replace(/^Product\s*[-–:]\s*/i, '').trim() || checklistTask?.title || 'Product';
    const config: ProductChecklistConfig = {
      productName: rawProd,
      productKey: normalizeProductKey(rawProd),
      title: checklistProductTitle.trim() || `Product - ${rawProd}`,
      lastUpdated: new Date().toLocaleDateString('en-GB') + ' ' + new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      defaultBdmName: checklistBdmName,
      bdmSignature: checklistBdmSig,
      bdmSignatureData: checklistBdmSigData,
      sections: checklistSections,
      attachments: activeProductConfig?.attachments || []
    };
    saveProductChecklist(config);
    setActiveProductConfig(config);
    if (checklistBdmSigData) {
      localStorage.setItem('COMPANY_BDM_SIGNATURE', checklistBdmSigData);
    }
    globalToast.success(`Updated Central Store preset & BDM signature for "${rawProd}"!`);
  };

  const handleSaveChecklistDetails = () => {
    if (!checklistTask) return;
    if (checklistBdmName) {
      localStorage.setItem('COMPANY_BDM_NAME', checklistBdmName);
    }

    if (onUpdateTask) {
      const cleanVideoId = cleanChecklistVideoId(checklistVideoId);
      onUpdateTask(checklistTask.id, {
        checklistProductTitle,
        checklistVideoId: cleanVideoId,
        videoId: cleanVideoId || checklistTask.videoId,
        checklistDate,
        checklistBdmName,
        checklistSections
      });
    }
    setChecklistTask(null);
    globalToast.success('Checklist details saved successfully.');
  };

  const handleGenerateChecklistSubmit = async () => {
    if (!checklistTask) return;

    // Collect Product Name and BDM signature strictly from Central Product Checklist Store for this product
    const candidateName = selectedProductPreset || checklistProductTitle.replace(/^Product\s*[-–:]\s*/i, '').trim() || checklistTask.title || checklistTask.productName || checklistTask.product || checklistTask.campaignName || '';
    const productPreset = getProductChecklist(candidateName);
    
    // DOCUMENT TITLE HEADER strictly collected from Central Product Checklist Store
    const finalDocTitleHeader = productPreset.title 
      ? productPreset.title 
      : (productPreset.productName 
          ? (productPreset.productName.toLowerCase().startsWith('product') ? productPreset.productName : `Product - ${productPreset.productName}`)
          : checklistProductTitle);

    // Strictly collect BDM signature from Central Product Checklist Store; do not add previous stored signature
    const storeSig = productPreset.bdmSignatureData || productPreset.bdmSignature || '';

    const rawVideoNo = checklistVideoId || checklistTask.videoId || (checklistTask.displayVideoId ? checklistTask.displayVideoId : (checklistTask.id ? `VoId-${checklistTask.id.slice(-4)}` : 'VoId-0000'));
    const videoNo = cleanChecklistVideoId(rawVideoNo);

    // Extract only numbers from the Void (e.g., VoId-1571 -> 1571 -> Checklist-1571.pdf)
    const voidNumbers = (rawVideoNo || videoNo || '').replace(/\D/g, '') || (checklistTask.id ? checklistTask.id.replace(/\D/g, '').slice(-4) : '') || '1571';
    const checklistPdfFileName = `Checklist-${voidNumbers}.pdf`;

    // Use PLANNED RELEASE DATE as default CHECKLIST DATE
    const plannedRelease = getPlannedReleaseDate(checklistTask);
    const d = new Date();
    const todayDefault = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    const effectiveChecklistDate = (checklistDate && checklistDate.trim()) ? checklistDate.trim() : (plannedRelease || todayDefault);

    try {
      await generateInfluencerChecklistPDF({
        productTitle: finalDocTitleHeader,
        influencerName: checklistInfluencerName,
        date: effectiveChecklistDate,
        bdmName: checklistBdmName,
        bdmSignatureBase64: storeSig,
        videoNo,
        fileName: checklistPdfFileName,
        sections: checklistSections
      });

      if (onUpdateTask) {
        onUpdateTask(checklistTask.id, {
          checklistProductTitle: finalDocTitleHeader,
          checklistVideoId: videoNo,
          videoId: videoNo,
          checklistDate: effectiveChecklistDate,
          checklistBdmName,
          checklistSections,
          checklistPdf: checklistPdfFileName,
          checklistActualDate: effectiveChecklistDate
        });
      }

      globalToast.success(`Generated and downloaded ${checklistPdfFileName} for ${checklistInfluencerName || videoNo}!`);
      setChecklistTask(null);
    } catch (err: any) {
      console.error('[Checklist Download Error]', err);
      globalToast.error(`Failed to generate checklist PDF: ${err?.message || 'Unknown error'}`);
    }
  };

  
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, setSigData: (s: string) => void, setSigId: (s: string) => void) => {
    const file = e.target.files?.[0];
    if (file) {
      // First, get the Base64 data for immediate UI preview
      const getBase64 = (f: File): Promise<string> => new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(f);
      });
      
      const base64Data = await getBase64(file);
      setSigData(base64Data);

      // Upload to Drive if possible
      if (accessToken) {
        try {
          setIsUploading(true);
          const fileId = await uploadImageToDrive(file, accessToken);
          setSigId('gdrive:' + fileId);
        } catch (error) {
          console.error("Drive upload failed:", error);
          // fallback
          setSigId(base64Data);
        } finally {
          setIsUploading(false);
        }
      } else {
        // Fallback
        setSigId(base64Data);
      }
    }
  };


  return (
    <div id="bill-payments-dashboard" className="space-y-6">
      
      {/* Title Header with descriptive tags */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 relative">
        <div className="absolute -top-10 -right-10 w-64 h-64 bg-rose-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob"></div>
        <div className="absolute top-10 -left-10 w-48 h-48 bg-amber-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-2000"></div>

        <div className="relative z-10">
          <h1 className="text-2xl font-black text-gray-900 tracking-tight font-sans flex items-center gap-2">
            <span className="p-1 px-2.5 bg-gradient-to-br from-rose-400 to-red-500 text-white shadow-sm rounded-lg text-lg">💳</span> BILL & CHECKLIST
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Real-time billing, checklist verification, invoice tracking, and settlement clearance synchronized directly from creator deliverables.
          </p>
          
          <div className="flex flex-wrap items-center gap-2 mt-4 md:mt-0">
            <input 
              type="file" 
              ref={csvFileInputRef} 
              accept=".csv,text/csv" 
              className="hidden" 
              onChange={handleImportCSVFile} 
            />
            <button
              onClick={() => setIsCentralStoreModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-lg text-[11px] font-bold font-mono shadow-sm transition cursor-pointer"
              title="Open Central Product Checklist Store to view, edit, or upload PDF/Word/Image guidelines"
            >
              <BookOpen className="w-3.5 h-3.5" /> Product Checklist Store
            </button>
            <button
              type="button"
              onClick={() => csvFileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white rounded-lg text-[11px] font-bold font-mono shadow-sm transition cursor-pointer"
              title="Import deliverables, checklist items, and billing data from CSV file"
            >
              <Upload className="w-3.5 h-3.5" /> Import CSV
            </button>
            <button
              type="button"
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-lg text-[11px] font-bold font-mono shadow-sm transition cursor-pointer"
              title="Export active Bill & Checklist ledger or payment records to CSV"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" /> Export CSV
            </button>
            <button
              disabled={isDriveSyncing}
              onClick={handleUploadBillingToDrive}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-[11px] font-bold font-mono shadow-sm transition"
              title="Upload PDF bill data directly to Google Drive"
            >
              <CloudUpload className="w-3.5 h-3.5" /> Upload to Google Drive
            </button>
            <button
              disabled={isDriveSyncing}
              onClick={handleSyncBillingFromDrive}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-[11px] font-bold font-mono shadow-sm transition"
              title="Sync data from Google Drive with PDF bill details"
            >
              <CloudDownload className="w-3.5 h-3.5" /> Synchronize
            </button>
          </div>
        </div>
        
        <div className="flex items-center gap-3 relative z-10">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-mono font-bold bg-gradient-to-r from-emerald-50 to-teal-50 text-teal-700 px-2.5 py-1.5 rounded-full border border-teal-200 shadow-sm">
            <span className="w-1.5 h-1.5 bg-teal-500 rounded-full animate-ping" /> Auto Sync Connected
          </span>
        </div>
      </div>

      {/* Sub Navigation: Bill & Checklist Ledger vs Payment Details Page */}
      <div className="flex items-center justify-between flex-wrap gap-3 pb-2 border-b border-slate-200/80 relative z-10">
        <div className="inline-flex p-1.5 bg-slate-100 rounded-2xl border border-slate-300 shadow-inner gap-2">
          {/* BILL & CHECKLIST LEDGER Button (White words in Rose/Red colored background) */}
          <button
            type="button"
            onClick={() => setActiveSubTab('ledger')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black font-mono transition-all cursor-pointer shadow-md text-white ${
              activeSubTab === 'ledger'
                ? 'bg-rose-600 hover:bg-rose-700 ring-2 ring-rose-400 ring-offset-2 shadow-rose-500/30 scale-[1.02]'
                : 'bg-rose-500 hover:bg-rose-600 opacity-90 hover:opacity-100 hover:scale-[1.01]'
            }`}
          >
            <FileText className="w-4 h-4 text-white shrink-0" />
            <span className="text-white tracking-wide font-black">BILL & CHECKLIST LEDGER</span>
            <span className="ml-1 text-[10px] px-2 py-0.5 rounded-full bg-white/30 text-white font-black border border-white/50 shadow-2xs">
              {synchronizedPayments.length}
            </span>
          </button>

          {/* PAYMENT DETAILS Button (White words in Emerald/Teal colored background) */}
          <button
            type="button"
            onClick={() => setActiveSubTab('payment_details')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black font-mono transition-all cursor-pointer shadow-md text-white ${
              activeSubTab === 'payment_details'
                ? 'bg-emerald-600 hover:bg-emerald-700 ring-2 ring-emerald-400 ring-offset-2 shadow-emerald-500/30 scale-[1.02]'
                : 'bg-emerald-500 hover:bg-emerald-600 opacity-90 hover:opacity-100 hover:scale-[1.01]'
            }`}
          >
            <CreditCard className="w-4 h-4 text-white shrink-0" />
            <span className="text-white tracking-wide font-black">PAYMENT DETAILS</span>
            <span className="ml-1 text-[10px] px-2 py-0.5 rounded-full bg-white/30 text-white font-black border border-white/50 shadow-2xs">
              {storedPaymentsCount}
            </span>
          </button>
        </div>

        {activeSubTab === 'payment_details' ? (
          <div className="text-xs text-slate-500 flex items-center gap-1.5 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Auto-synced from Payment Details Configuration</span>
          </div>
        ) : (
          <div className="text-xs text-slate-500 flex items-center gap-1.5 font-medium">
            <span className="w-2 h-2 rounded-full bg-rose-500" />
            <span>Video deliverable clearance ledger</span>
          </div>
        )}
      </div>

      {activeSubTab === 'payment_details' ? (
        <PaymentDetailsView
          tasks={tasks}
          influencers={influencers}
          campaigns={campaigns}
          onUpdateTask={onUpdateTask}
          onUpdateInfluencer={onUpdateInfluencer}
          selectedMonth={selectedMonth}
          setSelectedMonth={setSelectedMonth}
          selectedYear={selectedYear}
          setSelectedYear={setSelectedYear}
          onSwitchToLedger={() => setActiveSubTab('ledger')}
          accessToken={accessToken}
        />
      ) : (
        <>
      {/* Synchronized Help Info Banner */}
      <div className="bg-gradient-to-r from-rose-50 to-orange-50/70 rounded-xl border border-rose-100 p-4 flex gap-3 text-left shadow-sm relative z-10">
        <HelpCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
        <div className="text-xs space-y-1">
          <strong className="text-rose-900 font-sans block">Automatic Synchronization Active</strong>
          <p className="text-gray-700 leading-normal font-sans">
            This ledger displays video tasks retrieved dynamically from your <strong>Monthly Planner</strong>. 
            When a planned video is marked as <strong className="text-rose-700">Completed</strong> in the planner, <strong>a billing data line is generated here automatically</strong>!
          </p>
        </div>
      </div>

      {/* Professional Scoreboard Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 relative z-10">
        
        <div className="bg-gradient-to-br from-emerald-400 to-teal-600 p-5 rounded-2xl shadow-lg text-left hover:shadow-xl hover:-translate-y-1 transition-all text-white">
          <p className="text-[10px] font-bold text-emerald-100 uppercase font-mono tracking-wider flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <span className="p-1.5 bg-white/20 rounded-lg backdrop-blur-sm shadow-inner inline-flex"><Landmark className="w-3.5 h-3.5 text-white" /></span> Settled Payments
            </span>
            <span className="text-[9px] bg-white/20 backdrop-blur-sm px-2 py-0.5 rounded font-bold">Cleared</span>
          </p>
          <div className="flex justify-between items-end mt-4">
            <div>
              <h3 className="text-2xl font-extrabold font-mono text-white drop-shadow-md">₹{stats.completedPaidAmount.toLocaleString()}</h3>
              <p className="text-[10px] text-emerald-100 font-bold font-mono mt-0.5">{stats.settledCount} cleared deliverable{stats.settledCount !== 1 ? 's' : ''}</p>
            </div>
            <span className="text-[9px] font-bold bg-white/20 backdrop-blur-sm text-white px-2 py-1 rounded-md border border-white/20 shadow-sm">Payment Details Vault Synced</span>
          </div>
        </div>

        <div className="bg-gradient-to-br from-amber-400 to-orange-500 p-5 rounded-2xl shadow-lg text-left hover:shadow-xl hover:-translate-y-1 transition-all text-white">
          <p className="text-[10px] font-bold text-amber-100 uppercase font-mono tracking-wider flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <span className="p-1.5 bg-white/20 rounded-lg backdrop-blur-sm shadow-inner inline-flex"><Coins className="w-3.5 h-3.5 text-white" /></span> Outstanding Payouts
            </span>
            <span className="text-[9px] bg-white/20 backdrop-blur-sm px-2 py-0.5 rounded font-bold">Pending Clearance</span>
          </p>
          <div className="flex justify-between items-end mt-4">
            <div>
              <h3 className="text-2xl font-extrabold font-mono text-white drop-shadow-md">₹{stats.pendingUnpaidAmount.toLocaleString()}</h3>
              <p className="text-[10px] text-amber-100 font-bold font-mono mt-0.5">{stats.outstandingCount} pending deliverable{stats.outstandingCount !== 1 ? 's' : ''}</p>
            </div>
            <span className="text-[9px] font-bold bg-white/20 backdrop-blur-sm text-white px-2 py-1 rounded-md border border-white/20 shadow-sm">Awaiting Clearance</span>
          </div>
        </div>

        <div className="bg-gradient-to-br from-blue-400 to-indigo-600 p-5 rounded-2xl shadow-lg text-left hover:shadow-xl hover:-translate-y-1 transition-all text-white">
          <p className="text-[10px] font-bold text-blue-100 uppercase font-mono tracking-wider flex items-center gap-1.5">
            <span className="p-1.5 bg-white/20 rounded-lg backdrop-blur-sm shadow-inner inline-flex"><Link className="w-3.5 h-3.5 text-white" /></span> Short.io Tracking Links
          </p>
          <div className="flex justify-between items-end mt-4">
            <h3 className="text-2xl font-extrabold font-mono text-white drop-shadow-md">{stats.shortIoCount} <span className="text-xs text-blue-100 font-medium font-sans">of {stats.count}</span></h3>
            <span className="text-[9px] font-bold bg-white/20 backdrop-blur-sm text-white px-2 py-1 rounded-md border border-white/20 shadow-sm">
              {stats.count > 0 ? `${Math.round((stats.shortIoCount / stats.count) * 100)}%` : '0%'}
            </span>
          </div>
        </div>

        <div className="bg-gradient-to-br from-rose-400 to-pink-600 p-5 rounded-2xl shadow-lg text-left hover:shadow-xl hover:-translate-y-1 transition-all text-white">
          <p className="text-[10px] font-bold text-rose-100 uppercase font-mono tracking-wider flex items-center gap-1.5">
            <span className="p-1.5 bg-white/20 rounded-lg backdrop-blur-sm shadow-inner inline-flex"><CreditCard className="w-3.5 h-3.5 text-white" /></span> Overall Scope
          </p>
          <div className="flex justify-between items-end mt-4">
            <h3 className="text-2xl font-extrabold font-mono text-white drop-shadow-md">₹{stats.totalRemuneration.toLocaleString()}</h3>
            <span className="text-[9px] font-bold bg-white/20 backdrop-blur-sm text-white px-2 py-1 rounded-md border border-white/20 shadow-sm">
              {stats.count} Placements
            </span>
          </div>
        </div>

      </div>

      {/* Filtration & Ledger Pacing Controls */}
      <div className="bg-white/80 backdrop-blur-md border border-rose-100 rounded-xl p-4 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between text-left relative z-10">
        
        {/* Search Input and Show Options Toggle */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:flex-initial min-w-[240px]">
            <Search className="w-4 h-4 text-rose-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text"
              placeholder="Search Creator Name, Video ID..."
              className="pl-9 pr-4 py-2 border border-rose-200 bg-white rounded-lg text-xs w-full focus:outline-none focus:ring-1 focus:ring-rose-500 font-medium font-mono shadow-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Completed Videos Badge / Toggle */}
          <div className="inline-flex p-1 bg-rose-50/50 rounded-lg border border-rose-100 text-[11px] font-mono font-bold shadow-inner">
            <button
              onClick={() => setShowCompletedOnly(prev => !prev)}
              className={`px-3 py-1.5 rounded-md shadow-sm border flex items-center gap-1 cursor-pointer transition ${
                showCompletedOnly 
                  ? 'bg-white text-rose-600 border-rose-200' 
                  : 'bg-rose-100 text-rose-500 border-transparent hover:bg-rose-200'
              }`}
              title={showCompletedOnly ? "Click to show all videos" : "Click to show only completed videos"}
            >
              🚀 Completed Videos Only
            </button>
          </div>
        </div>

        {/* Month/Year Calendar filters */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
          <span className="text-[10px] text-indigo-600 uppercase font-black font-mono flex items-center gap-1">
            <Filter className="w-3 h-3" /> SHORT.IO:
          </span>
          <select
            className="text-xs bg-white border border-indigo-200 rounded-lg px-2 py-1.5 font-mono text-indigo-900 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-bold shadow-sm"
            value={shortIoFilter}
            onChange={(e) => setShortIoFilter(e.target.value as 'ALL' | 'HAS_LINK' | 'NO_LINK')}
          >
            <option value="ALL">All Links</option>
            <option value="HAS_LINK">Has Short.io</option>
            <option value="NO_LINK">Missing Short.io</option>
          </select>

          <span className="text-[10px] text-rose-600 uppercase font-black font-mono ml-2">Month/Year:</span>
          
          <select
            className="text-xs bg-white border border-rose-200 rounded-lg px-2 py-1.5 font-mono text-rose-900 focus:outline-none focus:ring-1 focus:ring-rose-500 font-bold shadow-sm"
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
          >
            <option value="ALL">All Months</option>
            {Object.keys(MONTHS_MAP).filter(m => m !== 'ALL').map(m => (
              <option key={m} value={m}>{MONTHS_MAP[m]}</option>
            ))}
          </select>

          <select
            className="text-xs bg-white border border-rose-200 rounded-lg px-2 py-1.5 font-mono text-rose-900 focus:outline-none focus:ring-1 focus:ring-rose-500 font-bold shadow-sm"
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
          >
            <option value="ALL">All Years</option>
            {Array.from({ length: 2100 - 2025 + 1 }, (_, i) => 2025 + i).map(year => (
              <option key={year} value={year.toString()}>{year}</option>
            ))}
          </select>
          
          <select
            className="text-xs bg-white border border-rose-200 rounded-lg px-2 py-1.5 font-mono text-rose-900 focus:outline-none focus:ring-1 focus:ring-rose-500 font-bold shadow-sm"
            value={weekFilter}
            onChange={(e) => setWeekFilter(e.target.value)}
          >
            <option value="ALL">All Weeks</option>
            <option value="1">Week 1</option>
            <option value="2">Week 2</option>
            <option value="3">Week 3</option>
            <option value="4">Week 4</option>
            <option value="5">Week 5</option>
            <option value="1-2">1st & 2nd week (Days 1–14)</option>
            <option value="1-3">1st, 2nd, 3rd week (Days 1–21)</option>
            <option value="1-4">1st, 2nd, 3rd, 4th week (Days 1–28)</option>
          </select>
        </div>

      </div>

      {/* Bill Payment Clearance Ledger spreadsheet table */}
      <div className="bg-white rounded-xl border border-rose-100 shadow-md overflow-hidden relative z-10">
        
        <div className="p-4 border-b border-rose-100 bg-gradient-to-r from-rose-50 to-orange-50 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h3 className="font-extrabold text-xs text-rose-900 uppercase tracking-wider font-mono flex items-center gap-1.5">
              <span className="bg-white shadow-sm p-1 rounded-md">📰</span> BILL WORKFLOW SPREADSHEET
            </h3>
            <span className="text-[10px] font-mono font-bold text-rose-700 bg-white/60 border border-rose-200 px-2 py-0.5 rounded shadow-sm">
              {synchronizedPayments.length} entries matching
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => csvFileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 text-[11px] font-bold font-mono transition shadow-3xs cursor-pointer"
              title="Import data into Bill & Checklist from CSV file"
            >
              <Upload className="w-3.5 h-3.5 text-amber-700" />
              <span>IMPORT CSV</span>
            </button>
            <button
              type="button"
              onClick={handleExportCSV}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-300 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 text-[11px] font-bold font-mono transition shadow-3xs cursor-pointer"
              title="Export Bill & Checklist ledger to CSV file"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-indigo-700" />
              <span>EXPORT CSV</span>
            </button>
            <button
              onClick={() => {
                setDateSortOrder(prev => {
                  if (prev === 'none') return 'asc';
                  if (prev === 'asc') return 'desc';
                  return 'none';
                });
              }}
              type="button"
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-bold font-mono transition shadow-3xs cursor-pointer ${
                dateSortOrder !== 'none'
                  ? 'bg-red-50 border-red-200 text-red-700 font-extrabold'
                  : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
              id="bill-workflow-sort-by-date-btn"
              title="Click to sort the list by date (Oldest First / Newest First / Default)"
            >
              <ArrowUpDown className="w-3.5 h-3.5 text-red-600" />
              <span>SORT BY DATE: {dateSortOrder === 'asc' ? 'OLDEST' : dateSortOrder === 'desc' ? 'NEWEST' : 'DEFAULT'}</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-max text-left text-xs border-collapse font-sans">
            <thead>
              <tr className="border-b border-gray-200 text-gray-700 font-mono font-black uppercase tracking-wider text-[9px] whitespace-nowrap">
                <th className="p-3 pl-4 w-12 text-center border-r border-gray-200 bg-slate-100 text-slate-700">SL.</th>
                <th className="p-3 w-40 border-r border-gray-200 bg-blue-100 text-blue-800">Video ID</th>
                <th className="p-3 w-48 border-r border-gray-200 bg-indigo-100 text-indigo-800">Influencer Name</th>
                <th 
                  className={`p-3 w-40 cursor-pointer select-none group border-r border-gray-200 transition duration-150 bg-purple-100 text-purple-800 ${
                    dateSortOrder !== 'none' ? 'bg-rose-100/50 text-rose-900 font-black' : 'hover:bg-rose-100/30 text-rose-800'
                  }`}
                  onClick={() => {
                    setDateSortOrder(prev => {
                      if (prev === 'none') return 'asc';
                      if (prev === 'asc') return 'desc';
                      return 'none';
                    });
                  }}
                  title="Click to sort by date (Asc / Desc / Default)"
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <span>Planned Release Date</span>
                    <ArrowUpDown className={`w-3.5 h-3.5 shrink-0 transition-opacity ${
                      dateSortOrder !== 'none' ? 'opacity-100 text-rose-600' : 'opacity-40 group-hover:opacity-100'
                    }`} />
                  </div>
                </th>
                <th className="p-3 w-56 border-r border-gray-200 bg-pink-100 text-pink-800">Video Links</th>
                <th className="p-3 w-32 border-r border-gray-200 bg-orange-100 text-orange-800">Billed Amount (₹)</th>
                <th className="p-3 w-36 text-center border-r border-gray-200 bg-yellow-100 text-yellow-900">
                  <div className="flex items-center justify-center gap-1">
                    <Link className="w-3 h-3 text-yellow-800" />
                    <span>COPY S.IO</span>
                  </div>
                </th>
                
                <th className="p-3 w-40 text-center bg-cyan-100 text-cyan-800">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rose-100/50 font-mono">
              {synchronizedPayments.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-10 text-center text-gray-400">
                    <div className="max-w-md mx-auto space-y-1">
                      <FileText className="w-8 h-8 mx-auto text-gray-300" />
                      <p className="font-bold text-xs uppercase tracking-wider font-mono mt-2">No synchronized billing entries found</p>
                      <p className="text-[10px] font-sans text-gray-400">
                        No entries match the active search or month/year/link filters.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                synchronizedPayments.map((p, index) => {
                  const slNo = index + 1;
                  const amt = p.billedAmount !== undefined && p.billedAmount > 0 ? p.billedAmount : (p.remuneration || 0);
                  const deletedIds = getDeletedPaymentIds();
                  const isDeleted = (p.id && (deletedIds.has(p.id) || deletedIds.has(`task_pay_${p.id}`))) ||
                                    (p.paymentDetails && deletedIds.has(`utr_${p.paymentDetails.trim().toLowerCase()}`));
                  const matchingStored = isDeleted ? undefined : storedRecords.find(r => 
                    (p.id && (r.taskId === p.id || r.id === `task_pay_${p.id}`)) ||
                    (p.paymentDetails && r.utrReference && r.utrReference.trim().toLowerCase() === p.paymentDetails.trim().toLowerCase()) ||
                    (r.creatorName && p.influencerName && r.creatorName.trim().toLowerCase() === p.influencerName.trim().toLowerCase() && Math.abs((r.amount || 0) - amt) < 1)
                  );
                  const isPaid = !isDeleted && (
                    p.paymentStatus === 'Completed' ||
                    Boolean(p.paymentDetails && p.paymentDetails.trim() !== '') ||
                    Boolean(matchingStored)
                  );

                  return (
                    <tr 
                      key={p.id} 
                      className={`hover:bg-red-50/10 transition duration-100 ${
                        isPaid ? 'bg-green-50/5' : ''
                      }`}
                    >
                      {/* 1. SL NO */}
                      <td className="p-3 pl-4 text-center text-gray-400 text-[10px] font-bold border-r border-gray-100 bg-slate-50/70">
                        {slNo}
                      </td>

                      {/* 2. VIDEO ID */}
                      <td className="p-3 font-bold text-gray-800 bg-blue-50/30">
                        <div className="flex items-center gap-1 group/copy relative">
                          <DebouncedInput 
                            type="text"
                            value={p.videoId !== undefined ? p.videoId : p.displayVideoId}
                            onChange={(val: any) => handleUpdateField(p.id, 'videoId', val)}
                            className="bg-transparent focus:bg-white hover:bg-gray-50 border border-transparent focus:border-red-500 rounded px-1.5 py-1 text-xs w-full focus:outline-none font-bold text-gray-700 tracking-tight"
                            title={p.videoId !== undefined ? p.videoId : p.displayVideoId}
                            placeholder="Provide ID"
                          />
                          <button
                            onClick={() => {
                              const valToCopy = p.videoId !== undefined ? p.videoId : p.displayVideoId;
                              navigator.clipboard.writeText(valToCopy);
                              setCopiedVideoId(p.id);
                              setTimeout(() => setCopiedVideoId(null), 2000);
                            }}
                            className={`p-1 rounded transition-opacity text-rose-500 hover:bg-white/50 shrink-0 opacity-70 hover:opacity-100`}
                            title="Copy Video ID"
                          >
                            {copiedVideoId === p.id ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </td>

                      {/* 3. INFLUENCER NAME */}
                      <td className="p-3 bg-indigo-50/30">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <div className="font-sans font-bold text-white bg-blue-600 px-2 py-0.5 rounded-md text-[11px] leading-tight inline-block shadow-sm border border-blue-700/50 tracking-tight">
                            {p.influencerName}
                          </div>

                          {/* WhatsApp Split Button with Quick Menu & Modal Trigger */}
                          <div className="relative inline-flex items-center rounded-full bg-[#E8F8F5] border border-[#A9DFBF] shadow-xs">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openWhatsAppModal(p, 'payment_details');
                              }}
                              className="p-1 pl-1.5 text-[#25D366] hover:bg-[#D4EFDF] rounded-l-full transition-colors cursor-pointer flex items-center justify-center"
                              title="Send WhatsApp payment details or message"
                            >
                              <MessageCircle className="w-3.5 h-3.5 fill-[#25D366]/20" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveWhatsAppMenuId(activeWhatsAppMenuId === p.id ? null : p.id);
                              }}
                              className="pr-1.5 pl-0.5 py-1 text-[#25D366] hover:bg-[#D4EFDF] rounded-r-full border-l border-[#A9DFBF]/60 transition-colors cursor-pointer flex items-center justify-center"
                              title="Quick WhatsApp payment options"
                            >
                              <ChevronDown className="w-2.5 h-2.5" />
                            </button>

                            {/* Quick Dropdown Menu */}
                            {activeWhatsAppMenuId === p.id && (
                              <div
                                onClick={(e) => e.stopPropagation()}
                                className="absolute left-0 bottom-full mb-1.5 w-72 bg-white rounded-xl shadow-xl border border-emerald-200 p-2 z-50 text-left animate-in fade-in zoom-in-95 duration-100"
                              >
                                <div className="px-1.5 py-1 border-b border-gray-100 mb-1.5 flex items-center justify-between gap-1">
                                  <div className="min-w-0 flex-1">
                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                                      WhatsApp Payment
                                    </span>
                                    <span className="text-[11px] font-extrabold text-gray-900 truncate block">
                                      {p.influencerName}
                                    </span>
                                  </div>
                                  <div className="flex items-center bg-gray-100 p-0.5 rounded-md border border-gray-200 text-[10px] font-extrabold shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setWhatsAppLang('en');
                                        try { localStorage.setItem('wa_msg_lang', 'en'); } catch {}
                                      }}
                                      className={`px-1.5 py-0.5 rounded cursor-pointer transition ${
                                        whatsAppLang === 'en' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500 hover:text-gray-800'
                                      }`}
                                      title="English"
                                    >
                                      EN
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setWhatsAppLang('as');
                                        try { localStorage.setItem('wa_msg_lang', 'as'); } catch {}
                                      }}
                                      className={`px-1.5 py-0.5 rounded cursor-pointer transition ${
                                        whatsAppLang === 'as' ? 'bg-emerald-600 text-white shadow-xs' : 'text-gray-500 hover:text-gray-800'
                                      }`}
                                      title="অসমীয়া (Assamese)"
                                    >
                                      অসমীয়া
                                    </button>
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveWhatsAppMenuId(null);
                                    handleDirectQuickSend(p, 'payment_details');
                                  }}
                                  className="w-full text-left px-2 py-1.5 hover:bg-emerald-50 rounded-lg text-xs font-bold text-emerald-900 flex items-start gap-2 transition cursor-pointer"
                                >
                                  <span className="text-sm mt-0.5">💳</span>
                                  <div className="min-w-0 flex-1">
                                    <span className="font-extrabold text-emerald-950 block">
                                      {whatsAppLang === 'as' ? "পেমেন্টৰ তথ্য প্ৰেৰণ (Quick)" : "Send Payment Details (Quick)"}
                                    </span>
                                    <p className="text-[10px] text-gray-500 font-normal leading-tight mt-0.5 truncate">
                                      {whatsAppLang === 'as' ? `₹${(p.billedAmount || p.remuneration || 0).toLocaleString()} পেমেন্টৰ ৰেফাৰেন্স` : `Send ₹${(p.billedAmount || p.remuneration || 0).toLocaleString()} clearance details`}
                                    </p>
                                  </div>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveWhatsAppMenuId(null);
                                    handleDirectQuickSend(p, 'bill_checklist');
                                  }}
                                  className="w-full text-left px-2 py-1.5 hover:bg-teal-50 rounded-lg text-xs font-bold text-teal-900 flex items-start gap-2 transition cursor-pointer"
                                >
                                  <span className="text-sm mt-0.5">📋</span>
                                  <div className="min-w-0 flex-1">
                                    <span className="font-extrabold text-teal-950 block">
                                      {whatsAppLang === 'as' ? "বিল আৰু চেক-লিষ্ট পেমেন্ট" : "Bill & Checklist Clearance"}
                                    </span>
                                    <p className="text-[10px] text-gray-500 font-normal leading-tight mt-0.5 truncate">
                                      {whatsAppLang === 'as' ? "অনুমোদিত চেক-লিষ্ট আৰু পেমেন্টৰ সবিশেষ" : "Checklist criteria approved + payment details"}
                                    </p>
                                  </div>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveWhatsAppMenuId(null);
                                    handleDirectQuickSend(p, 'request_bank');
                                  }}
                                  className="w-full text-left px-2 py-1.5 hover:bg-blue-50 rounded-lg text-xs font-bold text-blue-900 flex items-start gap-2 transition cursor-pointer"
                                >
                                  <span className="text-sm mt-0.5">🏦</span>
                                  <div className="min-w-0 flex-1">
                                    <span className="font-extrabold text-blue-950 block">
                                      {whatsAppLang === 'as' ? "বেংক তথ্য বিচাৰক (Request Bank)" : "Request Bank / UPI Details"}
                                    </span>
                                    <p className="text-[10px] text-gray-500 font-normal leading-tight mt-0.5 truncate">
                                      {whatsAppLang === 'as' ? "পেমেন্টৰ বাবে একাউণ্ট নম্বৰ বিচাৰক" : "Ask creator for bank/UPI info"}
                                    </p>
                                  </div>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveWhatsAppMenuId(null);
                                    handleDirectQuickSend(p, 'payment_check');
                                  }}
                                  className="w-full text-left px-2 py-1.5 hover:bg-purple-50 rounded-lg text-xs font-bold text-purple-900 flex items-start gap-2 transition cursor-pointer"
                                >
                                  <span className="text-sm mt-0.5">💸</span>
                                  <div className="min-w-0 flex-1">
                                    <span className="font-extrabold text-purple-950 block">
                                      {whatsAppLang === 'as' ? "পেমেন্ট পালে নে সুধক (Receipt Check)" : "Payment Receipt Check"}
                                    </span>
                                    <p className="text-[10px] text-gray-500 font-normal leading-tight mt-0.5 truncate">
                                      {whatsAppLang === 'as' ? "একাউণ্টত পইচা সোমাল নে নাই নিশ্চিত কৰক" : "Verify if funds received safely"}
                                    </p>
                                  </div>
                                </button>

                                <div className="pt-1 mt-1 border-t border-gray-100">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setActiveWhatsAppMenuId(null);
                                      openWhatsAppModal(p, 'payment_details');
                                    }}
                                    className="w-full text-center px-2 py-1.5 bg-gray-50 hover:bg-gray-100 rounded-lg text-[11px] font-bold text-gray-700 transition cursor-pointer flex items-center justify-center gap-1.5"
                                  >
                                    <Pencil className="w-3 h-3 text-gray-500" />
                                    <span>{whatsAppLang === 'as' ? "বাৰ্তা পৰিৱৰ্তন আৰু চাব..." : "Preview & Customize..."}</span>
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="text-[9px] font-mono text-white bg-green-500 px-1.5 py-0.5 rounded border border-green-600/50 font-bold uppercase mt-1 inline-block max-w-[150px] truncate">
                          {p.title || p.campaignName}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <span className="text-[9px] font-mono text-gray-500 bg-white/60 px-1.5 py-0.5 rounded border border-gray-200/60 shadow-xs flex items-center gap-1" title="Views">
                            👁 {p.views ? Number(p.views).toLocaleString() : '0'}
                          </span>
                          <span className="text-[9px] font-mono text-gray-500 bg-white/60 px-1.5 py-0.5 rounded border border-gray-200/60 shadow-xs flex items-center gap-1" title="Clicks">
                            👆 {p.clicks ? Number(p.clicks).toLocaleString() : '0'}
                          </span>
                        </div>
                      </td>

                      {/* 4. PLANED VIDEO RELEASE DATE */}
                      <td className={`p-3 font-bold text-center sm:text-left border-r border-gray-100 bg-purple-50/30 ${
                        dateSortOrder !== 'none' ? 'bg-red-50/10 text-red-900 font-extrabold font-mono' : 'text-gray-600'
                      }`}>
                        {formatToDMY(p.deadline) || 'No schedule set'}
                      </td>

                      {/* Video Links column */}
                      <td className="p-3 border-r border-gray-100/50 bg-pink-50/30">
                        <div className="flex flex-col gap-1 min-w-[180px]">
                          <div className="flex items-center gap-1">
                            <span className="text-[9px] text-gray-400 font-bold uppercase w-10 shrink-0">Link 1:</span>
                            <DebouncedInput 
                              type="text"
                              value={p.videoLink1 || ''}
                              onChange={(val: any) => handleUpdateField(p.id, 'videoLink1', val)}
                              placeholder="No Link 1 set"
                              className="bg-transparent focus:bg-white hover:bg-gray-50 border border-transparent focus:border-red-500 rounded px-1 py-0.5 text-[10px] w-full focus:outline-none text-gray-700 truncate"
                            />
                            {p.videoLink1 && p.videoLink1.trim() && (
                              <div className="flex items-center gap-0.5">
                                <a 
                                  href={p.videoLink1.trim().startsWith('http') ? p.videoLink1.trim() : `https://${p.videoLink1.trim()}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-red-650 hover:text-red-750 shrink-0 font-bold text-[11px] px-1"
                                  title="Open Video Link 1 in new tab"
                                >
                                  🔗
                                </a>
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(p.videoLink1!.trim());
                                    setCopiedVideoLink(`${p.id}-link1`);
                                    setTimeout(() => setCopiedVideoLink(null), 2000);
                                  }}
                                  className="p-1 rounded transition-opacity text-rose-500 hover:bg-white/50 shrink-0 opacity-70 hover:opacity-100"
                                  title="Copy Video Link 1"
                                >
                                  {copiedVideoLink === `${p.id}-link1` ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                                </button>
                              </div>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-1">
                            <span className="text-[9px] text-gray-400 font-bold uppercase w-10 shrink-0">Link 2:</span>
                            <DebouncedInput 
                              type="text"
                              value={p.videoLink2 || ''}
                              onChange={(val: any) => handleUpdateField(p.id, 'videoLink2', val)}
                              placeholder="No Link 2 set"
                              className="bg-transparent focus:bg-white hover:bg-gray-50 border border-transparent focus:border-red-500 rounded px-1 py-0.5 text-[10px] w-full focus:outline-none text-gray-700 truncate"
                            />
                            {p.videoLink2 && p.videoLink2.trim() && (
                              <div className="flex items-center gap-0.5">
                                <a 
                                  href={p.videoLink2.trim().startsWith('http') ? p.videoLink2.trim() : `https://${p.videoLink2.trim()}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-red-650 hover:text-red-750 shrink-0 font-bold text-[11px] px-1"
                                  title="Open Video Link 2 in new tab"
                                >
                                  🔗
                                </a>
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(p.videoLink2!.trim());
                                    setCopiedVideoLink(`${p.id}-link2`);
                                    setTimeout(() => setCopiedVideoLink(null), 2000);
                                  }}
                                  className="p-1 rounded transition-opacity text-rose-500 hover:bg-white/50 shrink-0 opacity-70 hover:opacity-100"
                                  title="Copy Video Link 2"
                                >
                                  {copiedVideoLink === `${p.id}-link2` ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                                </button>
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-1">
                            <span className="text-[9px] text-gray-400 font-bold uppercase w-10 shrink-0">Link 3:</span>
                            <DebouncedInput 
                              type="text"
                              value={p.videoLink3 || ''}
                              onChange={(val: any) => handleUpdateField(p.id, 'videoLink3', val)}
                              placeholder="No Link 3 set"
                              className="bg-transparent focus:bg-white hover:bg-gray-50 border border-transparent focus:border-red-500 rounded px-1 py-0.5 text-[10px] w-full focus:outline-none text-gray-700 truncate"
                            />
                            {p.videoLink3 && p.videoLink3.trim() && (
                              <div className="flex items-center gap-0.5">
                                <a 
                                  href={p.videoLink3.trim().startsWith('http') ? p.videoLink3.trim() : `https://${p.videoLink3.trim()}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-red-650 hover:text-red-750 shrink-0 font-bold text-[11px] px-1"
                                  title="Open Video Link 3 in new tab"
                                >
                                  🔗
                                </a>
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(p.videoLink3!.trim());
                                    setCopiedVideoLink(`${p.id}-link3`);
                                    setTimeout(() => setCopiedVideoLink(null), 2000);
                                  }}
                                  className="p-1 rounded transition-opacity text-rose-500 hover:bg-white/50 shrink-0 opacity-70 hover:opacity-100"
                                  title="Copy Video Link 3"
                                >
                                  {copiedVideoLink === `${p.id}-link3` ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Billed Amount column with manual input override */}
                      <td className="p-3 w-36 border-r border-gray-100/50 bg-orange-50/30">
                        <div className="relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 font-extrabold">₹</span>
                          <DebouncedInput 
                            type="number"
                            value={p.billedAmount !== undefined ? p.billedAmount : (p.remuneration || 0)}
                            onChange={(val: any) => {
                              const numVal = val === '' ? undefined : Number(val);
                              handleUpdateField(p.id, 'billedAmount', numVal);
                            }}
                            className="pl-4 pr-1.5 py-1.5 border border-gray-250 bg-white rounded-lg w-full font-black font-mono text-xs focus:outline-none focus:ring-1 focus:ring-red-500 text-gray-700 text-right"
                            placeholder="Amount"
                            min="0"
                          />
                        </div>
                        <div className="flex items-center justify-between gap-1 mt-1">
                          {p.billedAmount !== undefined && p.billedAmount !== p.remuneration ? (
                            <span className="text-[8px] text-red-650 font-black font-mono uppercase" title="Overridden from planned remuneration">
                              Custom
                            </span>
                          ) : (
                            <span className="text-[8px] text-gray-400 font-bold font-mono uppercase" title="Defaulting to planner reference amount">
                              Planner
                            </span>
                          )}

                          {isPaid ? (
                            <span className="inline-flex items-center gap-1 text-[8px] font-mono font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 px-1.5 py-0.2 rounded shadow-2xs" title={`Settled: ${matchingStored?.utrReference || p.paymentDetails || 'Cleared'}`}>
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              SETTLED
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[8px] font-mono font-bold bg-amber-100 text-amber-800 border border-amber-300 px-1.5 py-0.2 rounded shadow-2xs" title="Pending Payment Clearance">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                              OUTSTANDING
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 5. COPY S.IO OPTION */}
                      <td className="p-3 bg-yellow-50/20 text-center border-r border-gray-100">
                        {p.shortIoLink && String(p.shortIoLink).trim() ? (
                          <div className="flex items-center justify-center">
                            <button
                              type="button"
                              onClick={() => {
                                const linkToCopy = String(p.shortIoLink).trim();
                                navigator.clipboard.writeText(linkToCopy);
                                setCopiedShortIoId(p.id);
                                setTimeout(() => setCopiedShortIoId(null), 2000);
                                globalToast.success(`Copied S.IO link for ${p.influencerName}!`);
                              }}
                              className={`px-2 py-1 rounded text-[10px] font-sans font-bold flex items-center gap-1 transition cursor-pointer shadow-3xs whitespace-nowrap ${
                                copiedShortIoId === p.id
                                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                  : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                              }`}
                              title={`Copy S.IO link: ${p.shortIoLink}`}
                            >
                              {copiedShortIoId === p.id ? (
                                <>
                                  <CheckCircle2 className="w-3 h-3 text-white" />
                                  <span>COPIED</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3 text-indigo-100" />
                                  <span>S.IO COPY</span>
                                </>
                              )}
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-1">
                            <span className="text-[10px] text-gray-400 font-mono italic">No S.IO link</span>
                            <DebouncedInput
                              type="text"
                              value={p.shortIoLink || ''}
                              onChange={(val: any) => handleUpdateField(p.id, 'shortIoLink', val)}
                              className="text-[10px] font-mono bg-white border border-gray-200 rounded px-1.5 py-0.5 w-24 text-center text-gray-700 placeholder-gray-300 focus:outline-none focus:border-indigo-500"
                              placeholder="Paste link"
                            />
                          </div>
                        )}
                      </td>



                      {/* 7. ACTIONS */}
                      <td className="p-3 relative bg-cyan-50/30">
                        <div className="flex items-center gap-1.5 justify-center">
                          <button
                            onClick={() => {
                              const inf = resolveInfluencer(p.influencerId, p.influencerName);
                              handleOpenChecklistModal(p, inf);
                            }}
                            className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[10px] font-sans font-bold flex items-center gap-1 transition cursor-pointer shadow-3xs"
                            title="Generate and Download Checklist PDF"
                          >
                            <CheckSquare className="w-3 h-3" /> Checklist
                          </button>
                          <button
                            onClick={() => {
                              const inf = resolveInfluencer(p.influencerId, p.influencerName);
                              handleOpenPdfModal(p, inf);
                            }}
                            className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-[10px] font-sans font-bold flex items-center gap-0.5 transition cursor-pointer"
                            title="Auto-generate Bill for this video"
                          >
                            <FileDown className="w-3 h-3" /> Bill
                          </button>
                          <button
                            onClick={() => {
                              openWhatsAppModal(p, 'payment_details');
                            }}
                            className="px-2 py-1 bg-[#25D366] hover:bg-[#20ba59] text-white rounded text-[10px] font-sans font-bold flex items-center gap-1 transition cursor-pointer shadow-3xs"
                            title="Send WhatsApp Payment Details to Creator"
                          >
                            <MessageCircle className="w-3 h-3 fill-white/20" /> Payment
                          </button>
                        </div>
                      </td>

                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Quick Footer Summary Pacing Indicator */}
        <div className="p-3.5 bg-gray-50 border-t border-gray-150 text-[10px] justify-between text-gray-500 font-bold uppercase tracking-wider font-mono flex items-center gap-2">
          <span>Active ledger row count: {synchronizedPayments.length} item{synchronizedPayments.length !== 1 ? 's' : ''}</span>
          <span className="text-gray-400">Total Remuneration Allocated: ₹{stats.totalRemuneration.toLocaleString()}</span>
        </div>
      </div>
        </>
      )}
      {/* PDF Generation Modal */}
      {pdfTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 font-sans backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-gray-100 flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-gray-150 bg-gray-50/50 sticky top-0 z-10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shadow-sm">
                  <FileDown className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 tracking-tight">Generate Bill</h3>
                  <p className="text-xs text-gray-500 font-medium mt-0.5">Edit details before generating for {pdfInfluencer?.name || 'Creator'}</p>
                </div>
              </div>
              <button 
                onClick={() => setPdfTask(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-200 text-gray-400 hover:text-gray-700 transition"
              >
                ✕
              </button>
            </div>
            
            <div className="p-6 space-y-8 bg-white flex-1 overflow-y-auto">
              {/* Job Details Section */}
              <div className="space-y-4 bg-gray-50/50 p-4 rounded-xl border border-gray-100">
                <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-2">
                  <div className="w-1.5 h-4 bg-purple-500 rounded-full"></div>
                  Job Details
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-gray-500 uppercase">Bill Date</label>
                    <input type="text" placeholder="DD-MM-YYYY" className="w-full text-sm border-gray-200 rounded-lg focus:ring-blue-500 shadow-sm" value={pdfBillDate} onChange={e => setPdfBillDate(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-gray-500 uppercase">Video No</label>
                    <input readOnly className="w-full text-sm border-gray-200 rounded-lg shadow-sm bg-gray-100 cursor-not-allowed text-gray-600 focus:outline-none" value={pdfVideoNo} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-gray-500 uppercase">Release Date</label>
                    <input type="text" readOnly placeholder="DD-MM-YYYY" className="w-full text-sm border-gray-200 rounded-lg shadow-sm bg-gray-100 cursor-not-allowed text-gray-600 focus:outline-none" value={pdfVideoReleaseDate} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-gray-500 uppercase">Rate (Rs)</label>
                    <input type="number" readOnly className="w-full text-sm border-gray-200 rounded-lg shadow-sm bg-gray-100 cursor-not-allowed text-gray-600 focus:outline-none" value={pdfRate} />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-gray-500 uppercase">Brand / Product</label>
                    <input readOnly className="w-full text-sm border-gray-200 rounded-lg shadow-sm bg-gray-100 cursor-not-allowed text-gray-600 focus:outline-none" value={pdfCampaignBrand} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-gray-500 uppercase">Item Description</label>
                    <input readOnly className="w-full text-sm border-gray-200 rounded-lg shadow-sm bg-gray-100 cursor-not-allowed text-gray-600 focus:outline-none" value={pdfItemDesc} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-gray-500 uppercase">Video Link</label>
                    <input readOnly className="w-full text-sm border-gray-200 rounded-lg shadow-sm bg-gray-100 cursor-not-allowed text-gray-600 focus:outline-none" value={pdfVideoLink} />
                  </div>
                </div>
                
                {/* Advanced Additional Details Section */}
                <div className="bg-gray-50/50 p-4 rounded-xl border border-gray-100 mt-4 space-y-4">
                  <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-2">
                    <div className="w-1.5 h-4 bg-orange-500 rounded-full"></div>
                    Additional Item & Order Details (Optional)
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-gray-500 uppercase">Additional Line Item (e.g. Sample Purchase)</label>
                      <input placeholder="e.g. Product purchased from Amazon" className="w-full text-sm border-gray-200 rounded-lg focus:ring-orange-500 shadow-sm" value={pdfAdditionalItemDesc} onChange={e => setPdfAdditionalItemDesc(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-gray-500 uppercase">Amount (Rs)</label>
                      <input type="number" placeholder="0" className="w-full text-sm border-gray-200 rounded-lg focus:ring-orange-500 shadow-sm" value={pdfAdditionalItemAmount} onChange={e => setPdfAdditionalItemAmount(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-gray-500 uppercase">Order Number</label>
                      <input placeholder="e.g. 405-7178671-..." className="w-full text-sm border-gray-200 rounded-lg focus:ring-orange-500 shadow-sm" value={pdfOrderNumber} onChange={e => setPdfOrderNumber(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-gray-500 uppercase">Order Date</label>
                      <input placeholder="e.g. 13-04-2026" className="w-full text-sm border-gray-200 rounded-lg focus:ring-orange-500 shadow-sm" value={pdfOrderDate} onChange={e => setPdfOrderDate(e.target.value)} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Parties Section */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4 bg-gray-50/50 p-4 rounded-xl border border-gray-100">
                  <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-2">
                    <div className="w-1.5 h-4 bg-blue-500 rounded-full"></div>
                    Bill From
                  </h4>
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center gap-2">
                        <label className="text-[10px] font-bold text-gray-500 uppercase">Name</label>
                        <div className="w-56">
                          <select
                            className="w-full text-xs font-medium text-slate-800 bg-white border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                            value=""
                            onChange={(e) => {
                              const infId = e.target.value;
                              if (!infId) return;
                              const selectedInf = influencers.find(i => i.id === infId);
                              if (selectedInf) {
                                let resolvedInf = selectedInf;
                                if (selectedInf.name) {
                                  const nameMatch = selectedInf.name.toLowerCase().trim();
                                  const sameNameInfluencers = influencers.filter(i => i.name?.toLowerCase().trim() === nameMatch);
                                  if (sameNameInfluencers.length > 0) {
                                    sameNameInfluencers.sort((a, b) => {
                                      const aScore = (a.influencerSignature ? 2 : 0) + (a.bankDetails?.accountNumber ? 1 : 0);
                                      const bScore = (b.influencerSignature ? 2 : 0) + (b.bankDetails?.accountNumber ? 1 : 0);
                                      return bScore - aScore;
                                    });
                                    resolvedInf = sameNameInfluencers[0];
                                  }
                                }

                                setPdfInfluencer(resolvedInf);
                                setPdfBillFromName(resolvedInf.billingName || resolvedInf.name || '');
                                setPdfBillFromAddress(resolvedInf.billingAddress || resolvedInf.location || '');
                                setPdfAccountName(resolvedInf.bankDetails?.accountName || resolvedInf.name || '');
                                setPdfPan(resolvedInf.bankDetails?.pan || '');
                                setPdfAccountNumber(resolvedInf.bankDetails?.accountNumber || '');
                                setPdfBankName(resolvedInf.bankDetails?.bankName || '');
                                setPdfIfsc(resolvedInf.bankDetails?.ifsc || '');
                                const infSig = resolvedInf.influencerSignature || '';
                                setPdfInfluencerSig(infSig);
                                if (infSig.startsWith('gdrive:')) {
                                  setPdfInfluencerSigData(''); // Requires fetch
                                  if (accessToken) fetchImageFromDrive(infSig.replace('gdrive:', ''), accessToken).then(setPdfInfluencerSigData);
                                } else {
                                  setPdfInfluencerSigData(infSig);
                                }
                              }
                            }}
                          >
                            <option value="">-- Load Creator Details --</option>
                            {[...influencers]
                              .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }))
                              .map(i => (
                                <option key={i.id} value={i.id}>{i.name}</option>
                              ))
                            }
                          </select>
                        </div>
                      </div>
                      <input 
                        className="w-full text-sm border-gray-200 rounded-lg focus:ring-blue-500 focus:border-blue-500 shadow-sm"
                        value={pdfBillFromName} onChange={e => setPdfBillFromName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-gray-500 uppercase">Address</label>
                      <input 
                        className="w-full text-sm border-gray-200 rounded-lg focus:ring-blue-500 focus:border-blue-500 shadow-sm"
                        value={pdfBillFromAddress} onChange={e => setPdfBillFromAddress(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4 bg-gray-50/50 p-4 rounded-xl border border-gray-100">
                  <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-2">
                    <div className="w-1.5 h-4 bg-emerald-500 rounded-full"></div>
                    Bill To
                  </h4>
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-gray-500 uppercase">Company Name</label>
                      <input 
                        className="w-full text-sm border-gray-200 rounded-lg focus:ring-blue-500 focus:border-blue-500 shadow-sm"
                        value={pdfBillToName} onChange={e => setPdfBillToName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-gray-500 uppercase">Company Address</label>
                      <input 
                        className="w-full text-sm border-gray-200 rounded-lg focus:ring-blue-500 focus:border-blue-500 shadow-sm"
                        value={pdfBillToAddress} onChange={e => setPdfBillToAddress(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-gray-500 uppercase">Company Phone</label>
                      <input 
                        className="w-full text-sm border-gray-200 rounded-lg focus:ring-blue-500 focus:border-blue-500 shadow-sm"
                        value={pdfBillToPhone} onChange={e => setPdfBillToPhone(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Bank Details Section */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-2 border-b border-gray-150 pb-2">
                  <Landmark className="w-4 h-4 text-gray-400" />
                  Bank Details
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-gray-500 uppercase">Account Holder Name</label>
                    <input className="w-full text-sm border-gray-200 rounded-lg focus:ring-blue-500 shadow-sm" value={pdfAccountName} onChange={e => setPdfAccountName(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-gray-500 uppercase">PAN Number</label>
                    <input className="w-full text-sm border-gray-200 rounded-lg focus:ring-blue-500 shadow-sm uppercase" value={pdfPan} onChange={e => setPdfPan(e.target.value.toUpperCase())} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-gray-500 uppercase">Account Number</label>
                    <input className="w-full text-sm border-gray-200 rounded-lg focus:ring-blue-500 shadow-sm" value={pdfAccountNumber} onChange={e => setPdfAccountNumber(e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-gray-500 uppercase">Bank Name</label>
                      <input className="w-full text-sm border-gray-200 rounded-lg focus:ring-blue-500 shadow-sm" value={pdfBankName} onChange={e => setPdfBankName(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-gray-500 uppercase">IFSC</label>
                      <input className="w-full text-sm border-gray-200 rounded-lg focus:ring-blue-500 shadow-sm uppercase" value={pdfIfsc} onChange={e => setPdfIfsc(e.target.value.toUpperCase())} />
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <input 
                    type="checkbox" 
                    id="saveFuture" 
                    checked={pdfSaveFuture}
                    onChange={(e) => setPdfSaveFuture(e.target.checked)}
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor="saveFuture" className="text-xs font-medium text-gray-700 cursor-pointer">
                    Save these bank details to Influencer Profile for future use
                  </label>
                </div>
              </div>

              {/* Signatures Section */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-2 border-b border-gray-150 pb-2">
                  <FileText className="w-4 h-4 text-gray-400" />
                  Signatures (Optional)
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-gray-500 uppercase">Influencer Signature Image</label>
                    {isUploading && <div className="text-xs text-blue-600 font-medium">Uploading to Drive...</div>}
                    <input type="file" accept="image/*" onChange={(e) => handleFileChange(e, setPdfInfluencerSigData, setPdfInfluencerSig)} className="w-full text-xs text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200" />
                    {pdfInfluencerSigData && <img src={pdfInfluencerSigData} alt="Sig" className="h-12 object-contain border rounded bg-white p-1" />}
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-gray-500 uppercase">BDM Signature Image</label>
                    {isUploading && <div className="text-xs text-blue-600 font-medium">Uploading to Drive...</div>}
                    <input type="file" accept="image/*" onChange={(e) => handleFileChange(e, setPdfAuthSigData, setPdfAuthSig)} className="w-full text-xs text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200" />
                    {pdfAuthSigData && <img src={pdfAuthSigData} alt="Sig" className="h-12 object-contain border rounded bg-white p-1" />}
                  </div>
                </div>
              </div>
            </div>
            
            <div className="p-5 border-t border-gray-150 bg-gray-50 rounded-b-xl flex justify-end gap-3 sticky bottom-0 z-10">
              <button 
                onClick={() => setPdfTask(null)}
                className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 shadow-sm cursor-pointer"
              >
                Cancel
              </button>
              <button 
                onClick={handleSavePdfDetails}
                className="px-4 py-2 bg-white border border-blue-200 text-blue-700 rounded-lg text-sm font-semibold hover:bg-blue-50 shadow-sm cursor-pointer"
              >
                Save
              </button>
              <button 
                type="button"
                onClick={() => {
                  const taskToMsg = {
                    ...pdfTask,
                    influencerName: pdfBillFromName || pdfTask?.influencerName || pdfInfluencer?.name || '',
                    influencerMobile: pdfInfluencer?.mobile || pdfTask?.influencerMobile || getKnownMobile(pdfBillFromName) || '',
                    influencerId: pdfInfluencer?.id || pdfTask?.influencerId || '',
                  };
                  setPdfTask(null);
                  openWhatsAppModal(taskToMsg, 'payment_details');
                }}
                className="px-4 py-2 bg-[#25D366] hover:bg-[#20ba59] text-white rounded-lg text-sm font-bold shadow-md flex items-center gap-1.5 transition cursor-pointer"
                title="Send Bill & Payment Details to Influencer via WhatsApp"
              >
                <MessageCircle className="w-4 h-4 fill-white/20" />
                <span>WhatsApp Payment</span>
              </button>
              <button 
                disabled={isUploading} onClick={handleGeneratePdfSubmit}
                className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold shadow-md hover:bg-blue-700 flex items-center gap-2 transition cursor-pointer"
              >
                <FileDown className="w-4 h-4" />
                Generate & Download
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Influencer Checklist PDF Modal */}
      {checklistTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 font-sans backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[92vh] overflow-y-auto border border-gray-150 flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-gray-150 bg-gradient-to-r from-emerald-50 via-teal-50/50 to-white sticky top-0 z-10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shadow-xs">
                  <CheckSquare className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900 tracking-tight flex items-center gap-2">
                    <span>Generate Influencer Checklist PDF</span>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-mono font-bold">
                      {checklistVideoId || checklistTask.videoId || (checklistTask.displayVideoId || checklistTask.id?.slice(-4) || 'Task')}
                    </span>
                  </h3>
                  <p className="text-xs text-gray-500 font-medium mt-0.5">
                    Customize points to mention, benefits, CTAs, and restrictions before downloading
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setChecklistTask(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-200 text-gray-400 hover:text-gray-700 transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6 bg-white flex-1 overflow-y-auto text-xs">
              
              {/* Central Product Checklist Store Connection Banner */}
              <div className="p-3 bg-gradient-to-r from-emerald-50 via-teal-50 to-sky-50 border border-emerald-200/90 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 shadow-3xs">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                    <BookOpen className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-800 text-xs">
                        Central Checklist Store:
                      </span>
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold text-[10px]">
                        {activeProductConfig?.productName || checklistProductTitle.replace(/^Product\s*[-–:]\s*/i, '') || 'Active Preset'}
                      </span>
                      {activeProductConfig?.lastUpdated && (
                        <span className="text-[10px] text-slate-400 font-medium hidden sm:inline">
                          (Updated: {activeProductConfig.lastUpdated})
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 truncate mt-0.5">
                      {activeProductConfig?.attachments && activeProductConfig.attachments.length > 0 
                        ? `${activeProductConfig.attachments.length} reference documents (PDF/Word/Image) linked in store`
                        : 'Guidelines collected automatically from central product store'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {/* Switch / Load Product Preset Selector */}
                  <select
                    value={selectedProductPreset || activeProductConfig?.productName || ''}
                    onChange={(e) => handleLoadProductPreset(e.target.value)}
                    className="text-xs bg-white border border-emerald-300 text-emerald-950 rounded-lg px-2 py-1.5 font-bold focus:ring-2 focus:ring-emerald-500 outline-none cursor-pointer shadow-3xs"
                    title="Switch to another product's central checklist preset"
                  >
                    <option value="">-- Switch Product Preset --</option>
                    {allStoreProductsList.map((p: any) => (
                      <option key={p.key} value={p.name}>
                        {p.name}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={() => setIsCentralStoreModalOpen(true)}
                    className="px-2.5 py-1.5 bg-white hover:bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg text-xs font-bold transition flex items-center gap-1 shadow-3xs cursor-pointer"
                    title="Open full Central Product Checklist Store to view/upload PDF, Word, or Image files"
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>Manage Store</span>
                  </button>
                </div>
              </div>

              {/* Attached Reference Files Quick Bar (if any attached for this product) */}
              {activeProductConfig?.attachments && activeProductConfig.attachments.length > 0 && (
                <div className="p-2.5 bg-slate-50 border border-slate-200/80 rounded-xl flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 overflow-x-auto py-0.5 text-xs">
                    <span className="text-[10px] font-bold text-slate-500 uppercase shrink-0">Attached Reference Docs:</span>
                    {activeProductConfig.attachments.map(att => (
                      <span 
                        key={att.id} 
                        className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-white border border-slate-200 rounded-lg text-[10px] font-medium text-slate-700 shadow-3xs shrink-0"
                      >
                        <span className="font-bold text-teal-700 uppercase">[{att.fileType}]</span>
                        <span className="truncate max-w-[130px]" title={att.fileName}>{att.fileName}</span>
                        <a href={att.fileData} download={att.fileName} className="text-slate-400 hover:text-slate-800 ml-0.5" title="Download">
                          <Download className="w-3 h-3" />
                        </a>
                      </span>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsCentralStoreModalOpen(true)}
                    className="text-[10px] font-bold text-teal-700 hover:underline shrink-0 cursor-pointer"
                  >
                    Manage Docs →
                  </button>
                </div>
              )}

              {/* Basic Meta Cards */}
              <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                    <div className="w-1.5 h-3.5 bg-emerald-500 rounded-full"></div>
                    Document Header Details
                  </h4>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-500 font-medium hidden sm:inline">
                      Same as Monthly Planner Related Task
                    </span>
                    <button
                      type="button"
                      onClick={handleSaveToCentralStore}
                      className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800 rounded text-[10px] font-bold flex items-center gap-1 transition cursor-pointer"
                      title="Update the Central Checklist Store preset for this product"
                    >
                      <Sparkles className="w-3 h-3 text-emerald-600" />
                      <span>Save as Central Preset</span>
                    </button>
                  </div>
                </div>
                <div className="space-y-3">
                  {/* Line 1: Product Name / Title */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-600 uppercase flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                        <span>1st Line: Product Name / Title</span>
                      </span>
                      <span className="text-[9px] text-indigo-700 font-semibold bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200">
                        Monthly Planner Task
                      </span>
                    </label>
                    <input 
                      type="text" 
                      className="w-full text-xs font-semibold border-slate-200 rounded-lg shadow-xs focus:ring-emerald-500 focus:border-emerald-500 text-slate-900 bg-white" 
                      value={checklistProductTitle} 
                      onChange={e => setChecklistProductTitle(e.target.value)} 
                      placeholder="e.g. Chocolate Drink"
                    />
                  </div>

                  {/* Line 2: VIDEO ID below Product Name */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-600 uppercase flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                        <span>2nd Line: Video ID</span>
                      </span>
                      <span className="text-[9px] text-emerald-700 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                        Synced with Task
                      </span>
                    </label>
                    <input 
                      type="text" 
                      className="w-full text-xs font-mono font-bold border-slate-200 rounded-lg shadow-xs focus:ring-emerald-500 focus:border-emerald-500 text-slate-900 bg-white" 
                      value={checklistVideoId} 
                      onChange={e => setChecklistVideoId(e.target.value)} 
                      placeholder="e.g. VoId-946"
                    />
                  </div>

                  {/* Line 3: Others (Influencer Name & Checklist Date) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-600 uppercase flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                        <span>3rd Line: Influencer Name</span>
                      </label>
                      <input 
                        type="text" 
                        className="w-full text-xs font-semibold border-slate-200 rounded-lg shadow-xs focus:ring-emerald-500 focus:border-emerald-500 text-slate-900 bg-white" 
                        value={checklistInfluencerName} 
                        onChange={e => setChecklistInfluencerName(e.target.value)} 
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-600 uppercase flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                          <span>3rd Line: Checklist Date</span>
                        </span>
                        {getPlannedReleaseDate(checklistTask) && (
                          <span className="text-[9px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                            Planned: {getPlannedReleaseDate(checklistTask)}
                          </span>
                        )}
                      </label>
                      <input 
                        type="text" 
                        placeholder="DD/MM/YYYY" 
                        className="w-full text-xs font-mono border-slate-200 rounded-lg shadow-xs focus:ring-emerald-500 focus:border-emerald-500 text-slate-900 bg-white" 
                        value={checklistDate} 
                        onChange={e => setChecklistDate(e.target.value)} 
                      />
                    </div>
                  </div>

                  {/* BDM Name */}
                  <div className="space-y-1 pt-1">
                    <label className="text-[10px] font-bold text-slate-600 uppercase">BDM Name</label>
                    <input 
                      type="text" 
                      className="w-full text-xs font-bold uppercase border-slate-200 rounded-lg shadow-xs focus:ring-emerald-500 focus:border-emerald-500 text-slate-900 bg-white" 
                      value={checklistBdmName} 
                      onChange={e => setChecklistBdmName(e.target.value.toUpperCase())} 
                    />
                  </div>
                </div>
              </div>

              {/* Checklist Sections */}
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b pb-2">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                    <div className="w-1.5 h-3.5 bg-teal-500 rounded-full"></div>
                    Checklist Guidelines & Criteria
                  </h4>
                  <span className="text-[11px] text-slate-500">
                    Check or uncheck points to include in the generated PDF
                  </span>
                </div>

                {checklistSections.map((sec, sIdx) => (
                  <div key={sec.id} className="border border-slate-200 rounded-xl p-3.5 bg-white space-y-2.5 shadow-3xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 font-bold text-slate-800 text-xs">
                        {sec.iconType === 'check' && <span className="p-1 bg-emerald-100 text-emerald-700 rounded-md text-[10px]">✅</span>}
                        {sec.iconType === 'target' && <span className="p-1 bg-rose-100 text-rose-700 rounded-md text-[10px]">🎯</span>}
                        {sec.iconType === 'video' && <span className="p-1 bg-slate-100 text-slate-700 rounded-md text-[10px]">🎥</span>}
                        {sec.iconType === 'prohibited' && <span className="p-1 bg-red-100 text-red-700 rounded-md text-[10px]">🚫</span>}
                        {sec.iconType === 'posting' && <span className="p-1 bg-indigo-100 text-indigo-700 rounded-md text-[10px]">📱</span>}
                        <span>{sec.title}</span>
                      </div>
                      {sec.subtitle && (
                        <span className="text-[10px] text-slate-500 font-semibold italic">
                          {sec.subtitle}
                        </span>
                      )}
                    </div>

                    <div className="space-y-1.5 pt-1">
                      {sec.items.map((item, iIdx) => (
                        <label 
                          key={item.id} 
                          className="flex items-start gap-2.5 p-1.5 rounded-lg hover:bg-slate-50 transition cursor-pointer text-slate-700 text-xs select-none"
                        >
                          <input 
                            type="checkbox" 
                            checked={item.checked} 
                            onChange={(e) => {
                              const updated = [...checklistSections];
                              updated[sIdx].items[iIdx].checked = e.target.checked;
                              setChecklistSections(updated);
                            }}
                            className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5 cursor-pointer"
                          />
                          <span className={`leading-relaxed ${item.checked ? 'text-slate-900 font-medium' : 'text-slate-400 line-through'}`}>
                            {item.text}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* BDM Signature Section */}
              <div className="border border-slate-200 rounded-xl p-3.5 bg-slate-50/50 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                    <div className="w-1.5 h-3.5 bg-indigo-500 rounded-full"></div>
                    <span>BDM Signature</span>
                    {checklistBdmSigData ? (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold border border-emerald-300">
                        From Central Store
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-500 font-normal">
                        (No signature in Central Store)
                      </span>
                    )}
                  </h4>
                  <button
                    type="button"
                    onClick={() => setIsCentralStoreModalOpen(true)}
                    className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-1 cursor-pointer"
                    title="Manage BDM signatures in Central Product Checklist Store"
                  >
                    <BookOpen className="w-3 h-3" />
                    <span>Manage in Central Store</span>
                  </button>
                </div>
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <input 
                    type="file" 
                    accept="image/*" 
                    onChange={(e) => handleFileChange(e, setChecklistBdmSigData, setChecklistBdmSig)}
                    className="w-full text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-white file:text-slate-700 hover:file:bg-slate-100 border border-slate-200 rounded-lg p-1 bg-white cursor-pointer" 
                  />
                  {checklistBdmSigData ? (
                    <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg p-1 px-2 shrink-0">
                      <img src={checklistBdmSigData} alt="BDM Sig" className="h-8 object-contain" />
                      <button 
                        type="button" 
                        onClick={() => { setChecklistBdmSigData(''); setChecklistBdmSig(''); }} 
                        className="text-[10px] text-rose-500 font-bold hover:underline cursor-pointer"
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <span className="text-[11px] text-slate-400 italic shrink-0">
                      No signature configured in Central Store
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-gray-150 bg-gray-50 rounded-b-xl flex items-center justify-end gap-2.5 sticky bottom-0 z-10">
              <button 
                type="button"
                onClick={() => setChecklistTask(null)}
                className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50 shadow-xs cursor-pointer"
              >
                Cancel
              </button>
              <button 
                type="button"
                onClick={handleSaveChecklistDetails}
                className="px-4 py-2 bg-white border border-emerald-200 text-emerald-700 rounded-lg text-xs font-semibold hover:bg-emerald-50 shadow-xs cursor-pointer"
              >
                Save Details
              </button>
              <button 
                type="button"
                onClick={() => {
                  const taskToMsg = {
                    ...checklistTask,
                    influencerName: checklistInfluencerName || checklistTask?.influencerName || checklistInfluencer?.name || '',
                    influencerMobile: checklistInfluencer?.mobile || checklistTask?.influencerMobile || getKnownMobile(checklistInfluencerName) || '',
                    influencerId: checklistInfluencer?.id || checklistTask?.influencerId || '',
                  };
                  setChecklistTask(null);
                  openWhatsAppModal(taskToMsg, 'bill_checklist');
                }}
                className="px-4 py-2 bg-[#25D366] hover:bg-[#20ba59] text-white rounded-lg text-xs font-bold shadow-md flex items-center gap-1.5 transition cursor-pointer"
                title="Send Checklist & Payment Details to Influencer via WhatsApp"
              >
                <MessageCircle className="w-3.5 h-3.5 fill-white/20" />
                <span>WhatsApp Payment</span>
              </button>
              <button 
                type="button"
                onClick={handleGenerateChecklistSubmit}
                className="px-5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-lg text-xs font-bold shadow-md flex items-center gap-2 transition cursor-pointer"
              >
                <CheckSquare className="w-3.5 h-3.5" />
                <span>Generate & Download Checklist PDF</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Central Product Checklist Store Modal */}
      <CentralChecklistStoreModal
        isOpen={isCentralStoreModalOpen}
        onClose={() => setIsCentralStoreModalOpen(false)}
        initialSelectedProduct={checklistProductTitle || checklistTask?.title || ''}
        availableProducts={allUniqueProducts}
        accessToken={accessToken}
        onApplyToActiveTask={(sections, productTitle, bdmName, bdmSignature) => {
          setChecklistSections(sections);
          setChecklistProductTitle(productTitle);
          if (bdmName) {
            setChecklistBdmName(bdmName);
          }
          if (bdmSignature) {
            setChecklistBdmSig(bdmSignature);
            setChecklistBdmSigData(bdmSignature);
          }
        }}
      />

      {/* Bill & CHECKLIST WhatsApp Messaging Dialog with Payment Details */}
      {whatsAppModalItem && (() => {
        const matchedInf = resolveInfluencer(whatsAppModalItem.influencerId, whatsAppModalItem.influencerName);
        const creatorName = whatsAppModalItem.influencerName || matchedInf?.name || 'Creator';
        const effectiveMobile = cleanSingleMobileForStorage(customMobileNumber || whatsAppModalItem.influencerMobile || matchedInf?.mobile || getKnownMobile(creatorName) || '');
        const last4 = matchedInf?.bankDetails?.accountNumber ? String(matchedInf.bankDetails.accountNumber).slice(-4) : '';

        return (
          <div className="fixed inset-0 bg-black/60 z-[120] flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in duration-150">
            <div className="bg-white rounded-2xl shadow-2xl border border-emerald-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-150 font-sans">
              {/* Modal Header */}
              <div className="p-4 bg-gradient-to-r from-emerald-600 via-teal-600 to-green-600 text-white flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/20 rounded-xl shadow-xs">
                    <MessageCircle className="w-5 h-5 text-white fill-white/20" />
                  </div>
                  <div>
                    <h3 className="text-base font-black tracking-tight text-white flex items-center gap-2">
                      <span>Send WhatsApp Message — Bill &amp; Checklist</span>
                      <span className="text-[10px] uppercase font-bold bg-white/20 px-2 py-0.5 rounded-full">
                        {whatsAppModalItem.paymentStatus || 'Pending Clearance'}
                      </span>
                    </h3>
                    <p className="text-xs text-emerald-100 font-medium">
                      Send payment details, clearance notice, or request bank info from creator
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setWhatsAppModalItem(null)}
                  className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Creator & Deliverable Metadata Bar */}
              <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-slate-900">{creatorName}</span>
                  <span className="text-slate-400">•</span>
                  <span className={`font-mono text-[11px] font-bold ${effectiveMobile ? 'text-emerald-700' : 'text-amber-600'}`}>
                    {effectiveMobile ? `📱 ${formatDisplayPhone(effectiveMobile)}` : '⚠️ No WhatsApp Number'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="bg-indigo-100 text-indigo-850 font-extrabold px-2 py-0.5 rounded text-[11px]">
                    {whatsAppModalItem.title || whatsAppModalItem.campaignName || 'Video Task'}
                  </span>
                  <span className="bg-emerald-100 text-emerald-850 font-black px-2 py-0.5 rounded text-[11px] font-mono">
                    ₹{Number(customAmount || whatsAppModalItem.billedAmount || whatsAppModalItem.remuneration || 0).toLocaleString()}
                  </span>
                  {matchedInf?.bankDetails?.bankName && (
                    <span className="bg-amber-100 text-amber-900 font-bold px-2 py-0.5 rounded text-[11px] flex items-center gap-1" title="Saved Bank Profile">
                      <Landmark className="w-3 h-3 text-amber-700" />
                      <span>{matchedInf.bankDetails.bankName}{last4 ? ` (A/C: ****${last4})` : ''}</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Body: Language Toggle, Templates, Editable Parameters, Draft */}
              <div className="p-5 overflow-y-auto space-y-4 flex-1">
                {/* 0. Direct WhatsApp Recipient Number Card (Editable) */}
                <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-white border border-emerald-200/90 rounded-xl p-3 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-[#25D366] text-white flex items-center justify-center font-bold text-sm shadow-xs shrink-0">
                      <MessageCircle className="w-4 h-4 fill-white/20" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs font-black text-slate-900">
                          {whatsAppLang === 'as' ? "প্ৰাপ্তকৰ্তাৰ হোৱাটছএপ নম্বৰ (Recipient WhatsApp Mobile):" : "Recipient WhatsApp Mobile:"}
                        </label>
                        {effectiveMobile && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                            ✓ Ready for Chat
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-500">
                        {whatsAppLang === 'as' 
                          ? "বাৰ্তা পঠিয়াবলৈ নম্বৰটো নিশ্চিত কৰক (এপ যোগে পোনপটীয়াকৈ খোল খাব)" 
                          : "Chat will launch directly in WhatsApp App with this creator"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <div className="flex items-center bg-white border border-slate-300 focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20 rounded-xl px-2.5 py-1.5 shadow-xs transition">
                      <span className="text-xs font-bold text-slate-500 mr-1.5 select-none">🇮🇳 +91</span>
                      <input
                        id="whatsapp-recipient-phone-input"
                        type="tel"
                        value={getDisplayTenDigitMobile(effectiveMobile)}
                        onChange={(e) => {
                          const rawDigits = e.target.value.replace(/\D/g, '').slice(0, 10);
                          const formatted = rawDigits ? cleanSingleMobileForStorage(rawDigits) : '';
                          setCustomMobileNumber(formatted);
                          if (whatsAppModalItem) {
                            whatsAppModalItem.influencerMobile = formatted;
                          }
                        }}
                        placeholder="10-digit mobile"
                        className="w-32 text-xs font-mono font-bold text-slate-900 outline-none placeholder:text-slate-400 placeholder:font-normal"
                      />
                    </div>

                    {effectiveMobile && (
                      <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-1.5 rounded-lg border border-emerald-200 select-none">
                        ✓ Linked
                      </span>
                    )}
                  </div>
                </div>

                {/* Language Toggle */}
                <div className="flex items-center justify-between bg-slate-100/90 px-3.5 py-2.5 rounded-xl border border-slate-200 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs font-black text-slate-800">
                      {whatsAppLang === 'as' ? "বাৰ্তাৰ ভাষা (Message Language):" : "Message Language:"}
                    </span>
                    {whatsAppLang === 'as' && (
                      <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black px-2 py-0.5 rounded-full border border-emerald-300">
                        অসমীয়া সক্ৰিয়
                      </span>
                    )}
                  </div>
                  <div className="inline-flex rounded-lg bg-white p-0.5 shadow-xs border border-slate-200">
                    <button
                      type="button"
                      onClick={() => {
                        setWhatsAppLang('en');
                        try { localStorage.setItem('wa_msg_lang', 'en'); } catch {}
                        regenerateDraft(whatsAppTemplate, 'en', Number(customAmount), customPaymentDetails, customPaymentMode, customPaymentDate);
                      }}
                      className={`px-3 py-1 text-xs font-black rounded-md transition cursor-pointer flex items-center gap-1.5 ${
                        whatsAppLang === 'en'
                          ? 'bg-slate-900 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                      }`}
                    >
                      <span>🇬🇧 English</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setWhatsAppLang('as');
                        try { localStorage.setItem('wa_msg_lang', 'as'); } catch {}
                        regenerateDraft(whatsAppTemplate, 'as', Number(customAmount), customPaymentDetails, customPaymentMode, customPaymentDate);
                      }}
                      className={`px-3 py-1 text-xs font-black rounded-md transition cursor-pointer flex items-center gap-1.5 ${
                        whatsAppLang === 'as'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-emerald-700 hover:bg-slate-50'
                      }`}
                    >
                      <span>🇮🇳 অসমীয়া (Assamese)</span>
                    </button>
                  </div>
                </div>

                {/* Template Selection Cards */}
                <div>
                  <label className="text-[11px] font-black uppercase text-slate-500 tracking-wider block mb-2">
                    {whatsAppLang === 'as' ? "বাৰ্তাৰ টেমপ্লেট বাছনি কৰক (Select Template):" : "Select Message Template:"}
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                    {/* Template 1: Send Payment Details (Primary Highlighted) */}
                    <button
                      type="button"
                      onClick={() => {
                        setWhatsAppTemplate('payment_details');
                        regenerateDraft('payment_details', whatsAppLang, Number(customAmount), customPaymentDetails, customPaymentMode, customPaymentDate, customBankName, customAccountLast4, customUpiId, includeBankDetails);
                      }}
                      className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                        whatsAppTemplate === 'payment_details'
                          ? 'border-emerald-500 bg-emerald-50/80 shadow-xs ring-2 ring-emerald-500/20'
                          : 'border-slate-200 bg-white hover:border-emerald-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="font-extrabold text-xs text-emerald-950 flex items-center gap-1.5">
                          <span>💳</span>
                          <span>{whatsAppLang === 'as' ? "পেমেন্টৰ তথ্য প্ৰেৰণ" : "Send Payment Details"}</span>
                        </span>
                        <span className="bg-emerald-500 text-white text-[9px] font-black uppercase px-1.5 py-0.2 rounded-full">
                          {whatsAppLang === 'as' ? "পেমেন্ট" : "Payment"}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 leading-snug">
                        {whatsAppLang === 'as'
                          ? "পেমেন্টৰ পৰিমাণ, UTR/ৰেফাৰেন্স, মাধ্যম, বেংক আৰু তাৰিখৰ সবিশেষ প্ৰেৰণ কৰক"
                          : "Send complete payment breakdown with amount, UTR reference, mode, bank & date."}
                      </p>
                    </button>

                    {/* Template 2: Bill & Checklist Clearance with Payment Details */}
                    <button
                      type="button"
                      onClick={() => {
                        setWhatsAppTemplate('bill_checklist');
                        regenerateDraft('bill_checklist', whatsAppLang, Number(customAmount), customPaymentDetails, customPaymentMode, customPaymentDate, customBankName, customAccountLast4, customUpiId, includeBankDetails);
                      }}
                      className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                        whatsAppTemplate === 'bill_checklist'
                          ? 'border-teal-500 bg-teal-50/80 shadow-xs ring-2 ring-teal-500/20'
                          : 'border-slate-200 bg-white hover:border-teal-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="font-extrabold text-xs text-teal-950 flex items-center gap-1.5">
                          <span>📋</span>
                          <span>{whatsAppLang === 'as' ? "বিল আৰু চেক-লিষ্ট পেমেন্ট" : "Bill & Checklist Clearance"}</span>
                        </span>
                        <span className="bg-teal-500 text-white text-[9px] font-black uppercase px-1.5 py-0.2 rounded-full">
                          {whatsAppLang === 'as' ? "অনুমোদন" : "Approved"}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 leading-snug">
                        {whatsAppLang === 'as'
                          ? "পৰীক্ষা-সূচী (Checklist) অনুমোদন আৰু বিল পেমেন্টৰ সবিশেষ একেলগে প্ৰেৰণ কৰক"
                          : "Send verified checklist criteria approval and invoice payment details together."}
                      </p>
                    </button>

                    {/* Template 3: Request Bank / UPI Details */}
                    <button
                      type="button"
                      onClick={() => {
                        setWhatsAppTemplate('request_bank');
                        regenerateDraft('request_bank', whatsAppLang, Number(customAmount), customPaymentDetails, customPaymentMode, customPaymentDate, customBankName, customAccountLast4, customUpiId, includeBankDetails);
                      }}
                      className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                        whatsAppTemplate === 'request_bank'
                          ? 'border-blue-500 bg-blue-50/80 shadow-xs ring-2 ring-blue-500/20'
                          : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="font-extrabold text-xs text-blue-950 flex items-center gap-1.5">
                          <span>🏦</span>
                          <span>{whatsAppLang === 'as' ? "বেংক তথ্য বিচাৰক" : "Request Bank Details"}</span>
                        </span>
                        <span className="bg-blue-100 text-blue-800 text-[9px] font-black uppercase px-1.5 py-0.2 rounded-full">
                          {whatsAppLang === 'as' ? "অনুগ্ৰহ" : "Request"}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 leading-snug">
                        {whatsAppLang === 'as'
                          ? "পেমেন্ট দিবলৈ ক্ৰিয়েটৰৰ বেংক একাউণ্ট, IFSC বা UPI ID বিচাৰি বাৰ্তা পঠিয়াওক"
                          : "Ask creator to share their bank account, IFSC code or UPI ID for payment clearance."}
                      </p>
                    </button>

                    {/* Template 4: Payment Cleared & Bill Notice */}
                    <button
                      type="button"
                      onClick={() => {
                        setWhatsAppTemplate('payment_cleared');
                        regenerateDraft('payment_cleared', whatsAppLang, Number(customAmount), customPaymentDetails, customPaymentMode, customPaymentDate, customBankName, customAccountLast4, customUpiId, includeBankDetails);
                      }}
                      className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                        whatsAppTemplate === 'payment_cleared'
                          ? 'border-indigo-500 bg-indigo-50/80 shadow-xs ring-2 ring-indigo-500/20'
                          : 'border-slate-200 bg-white hover:border-indigo-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="font-extrabold text-xs text-indigo-950 flex items-center gap-1.5">
                          <span>📄</span>
                          <span>{whatsAppLang === 'as' ? "বিল আৰু পেমেন্ট ক্লিয়াৰ" : "Bill Cleared Notice"}</span>
                        </span>
                        <span className="bg-indigo-100 text-indigo-800 text-[9px] font-black uppercase px-1.5 py-0.2 rounded-full">
                          {whatsAppLang === 'as' ? "ক্লিয়াৰেন্স" : "Cleared"}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 leading-snug">
                        {whatsAppLang === 'as'
                          ? "একাউণ্টছ বিভাগে বিলখন ক্লিয়াৰ কৰি পেমেন্ট মুকলি কৰাৰ জাননী দিয়ক"
                          : "Inform creator that their invoice/bill has been approved and cleared by accounts."}
                      </p>
                    </button>

                    {/* Template 5: Payment Receipt Confirmation */}
                    <button
                      type="button"
                      onClick={() => {
                        setWhatsAppTemplate('payment_check');
                        regenerateDraft('payment_check', whatsAppLang, Number(customAmount), customPaymentDetails, customPaymentMode, customPaymentDate, customBankName, customAccountLast4, customUpiId, includeBankDetails);
                      }}
                      className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                        whatsAppTemplate === 'payment_check'
                          ? 'border-purple-500 bg-purple-50/80 shadow-xs ring-2 ring-purple-500/20'
                          : 'border-slate-200 bg-white hover:border-purple-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="font-extrabold text-xs text-purple-950 flex items-center gap-1.5">
                          <span>💸</span>
                          <span>{whatsAppLang === 'as' ? "পেমেন্ট পোৱাৰ বুজ লওক" : "Payment Receipt Check"}</span>
                        </span>
                        <span className="bg-purple-100 text-purple-800 text-[9px] font-black uppercase px-1.5 py-0.2 rounded-full">
                          {whatsAppLang === 'as' ? "নিশ্চিতকৰণ" : "Confirm"}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 leading-snug">
                        {whatsAppLang === 'as'
                          ? "পঠোৱা পেমেন্টটো একাউণ্টত সোমাল নে নাই নিশ্চিত কৰিবলৈ সুধক"
                          : "Ask creator if they have safely received the payment credit in their account."}
                      </p>
                    </button>
                  </div>
                </div>

                {/* Payment Parameters Configuration (Amount, Reference, Mode, Date, Bank, UPI) */}
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="text-[11px] font-black uppercase text-slate-700 tracking-wider flex items-center gap-1.5">
                      <CreditCard className="w-3.5 h-3.5 text-emerald-600" />
                      <span>{whatsAppLang === 'as' ? "পেমেন্টৰ তথ্য নিৰ্ধাৰণ (Payment Fields):" : "Payment Details Configuration:"}</span>
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100/70 border border-emerald-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        <span>Auto-Saves to Payment Details Page</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setWhatsAppModalItem(null);
                          setActiveSubTab('payment_details');
                        }}
                        className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-lg text-[10px] font-bold font-mono transition shadow-2xs flex items-center gap-1 cursor-pointer"
                        title="Jump to Payment Details page"
                      >
                        <CreditCard className="w-3 h-3 text-white" />
                        <span className="text-white">PAYMENT DETAILS PAGE →</span>
                      </button>
                    </div>
                  </div>

                  {/* Bank Message Paste & Auto-Extract Box */}
                  <div className="bg-white border border-emerald-300 rounded-xl p-3 shadow-xs space-y-2">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs shrink-0">
                          <Sparkles className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <h5 className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                            <span>{whatsAppLang === 'as' ? "বেংক মেছেজ পেষ্ট কৰক (Auto-Collect):" : "Paste Bank Transfer / SMS Message (Auto-Collect):"}</span>
                            <span className="text-[9px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded-full">
                              Auto-Detector
                            </span>
                          </h5>
                          <p className="text-[10px] text-slate-500">
                            {whatsAppLang === 'as'
                              ? "বেংক মেছেজ বা ষ্টেটমেণ্ট ইয়াত পেষ্ট কৰক, এপটোৱে টকা, UTR, মাধ্যম আৰু তাৰিখ নিজে সংগ্ৰহ কৰিব"
                              : "Paste bank message/statement; app will automatically collect Amount, UTR/Ref, Mode & Date"}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={handlePasteFromClipboard}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 rounded-lg text-[11px] font-bold transition flex items-center gap-1 cursor-pointer border border-slate-200"
                          title="Paste from clipboard"
                        >
                          <Copy className="w-3 h-3 text-slate-500" />
                          <span>{whatsAppLang === 'as' ? "পেষ্ট কৰক" : "Paste"}</span>
                        </button>

                        <button
                          type="button"
                          onClick={handleLoadSampleBankMessage}
                          className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 active:scale-95 text-emerald-800 rounded-lg text-[11px] font-bold transition flex items-center gap-1 cursor-pointer border border-emerald-200"
                          title="Try sample message from prompt"
                        >
                          <Sparkles className="w-3 h-3 text-emerald-600" />
                          <span>{whatsAppLang === 'as' ? "নমুনা মেছেজ" : "Try Sample"}</span>
                        </button>

                        {pastedBankMessage && (
                          <button
                            type="button"
                            onClick={() => {
                              setPastedBankMessage('');
                              setParsedBankResult(null);
                            }}
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                            title="Clear pasted text"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="relative">
                      <textarea
                        rows={2}
                        value={pastedBankMessage}
                        onChange={(e) => handleProcessBankMessage(e.target.value, false)}
                        placeholder={
                          whatsAppLang === 'as'
                            ? "যেনে: 08/10/2026\tINB/NEFT/AXODH28193290602/Debajani Bora\tAXODH28193290602\t\nINR 8,000.00"
                            : "Paste bank message here (e.g. 08/10/2026\tINB/NEFT/AXODH28193290602/Debajani Bora\tAXODH28193290602\t\nINR 8,000.00)..."
                        }
                        className="w-full text-[11px] font-mono leading-relaxed bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 focus:bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none text-slate-800 resize-none transition"
                      />
                    </div>

                    {/* Extracted Details Pill Display */}
                    {parsedBankResult && (
                      <div className="bg-emerald-50/70 border border-emerald-200 rounded-lg p-2 flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
                          <span className="font-black text-emerald-800 flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 inline" />
                            {whatsAppLang === 'as' ? "সংগ্ৰহ কৰা তথ্য:" : "Auto-Collected:"}
                          </span>
                          {parsedBankResult.amount !== null && (
                            <span className="bg-white border border-emerald-200 px-2 py-0.5 rounded-md font-mono font-black text-emerald-900 shadow-2xs">
                              💰 ₹{parsedBankResult.amount.toLocaleString('en-IN')}
                            </span>
                          )}
                          {parsedBankResult.reference && (
                            <span className="bg-white border border-emerald-200 px-2 py-0.5 rounded-md font-mono font-bold text-slate-800 shadow-2xs">
                              🔖 Ref: {parsedBankResult.reference}
                            </span>
                          )}
                          {parsedBankResult.rawMode && (
                            <span className="bg-white border border-emerald-200 px-2 py-0.5 rounded-md font-semibold text-slate-700 shadow-2xs">
                              ⚡ {parsedBankResult.rawMode}
                            </span>
                          )}
                          {parsedBankResult.date && (
                            <span className="bg-white border border-emerald-200 px-2 py-0.5 rounded-md font-mono text-slate-700 shadow-2xs">
                              📅 {parsedBankResult.date}
                            </span>
                          )}
                          {parsedBankResult.beneficiary && (
                            <span className="bg-white border border-emerald-200 px-2 py-0.5 rounded-md font-semibold text-emerald-800 shadow-2xs">
                              👤 {parsedBankResult.beneficiary}
                            </span>
                          )}
                          {parsedBankResult.bankName && (
                            <span className="bg-white border border-emerald-200 px-2 py-0.5 rounded-md font-semibold text-slate-700 shadow-2xs">
                              🏛️ {parsedBankResult.bankName}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleProcessBankMessage(pastedBankMessage, true)}
                            className="text-[10px] font-bold text-emerald-700 bg-emerald-100 hover:bg-emerald-200 px-2 py-0.5 rounded-full transition cursor-pointer"
                          >
                            ✓ Applied to WhatsApp Draft
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
                    {/* Amount */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-600 uppercase">
                        {whatsAppLang === 'as' ? "পৰিমাণ (₹ Amount)" : "Amount (₹)"}
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={customAmount}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setCustomAmount(val);
                          regenerateDraft(whatsAppTemplate, whatsAppLang, val, customPaymentDetails, customPaymentMode, customPaymentDate, customBankName, customAccountLast4, customUpiId, includeBankDetails);
                        }}
                        className="w-full text-xs font-mono font-bold bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none text-slate-800"
                        placeholder="Amount"
                      />
                    </div>

                    {/* Payment Mode */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-600 uppercase">
                        {whatsAppLang === 'as' ? "পেমেন্ট মাধ্যম (Mode)" : "Payment Mode"}
                      </label>
                      <select
                        value={customPaymentMode}
                        onChange={(e) => {
                          const val = e.target.value;
                          setCustomPaymentMode(val);
                          regenerateDraft(whatsAppTemplate, whatsAppLang, Number(customAmount), customPaymentDetails, val, customPaymentDate, customBankName, customAccountLast4, customUpiId, includeBankDetails);
                        }}
                        className="w-full text-xs font-medium bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none text-slate-800 cursor-pointer"
                      >
                        <option value="Bank Transfer (NEFT/IMPS)">Bank Transfer (NEFT/IMPS)</option>
                        <option value="UPI / GPay / PhonePe">UPI / GPay / PhonePe</option>
                        <option value="RTGS">RTGS</option>
                        <option value="Cheque">Cheque</option>
                        <option value="Direct Deposit">Direct Deposit</option>
                      </select>
                    </div>

                    {/* Payment Date */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-600 uppercase">
                        {whatsAppLang === 'as' ? "তাৰিখ (Payment Date)" : "Payment Date"}
                      </label>
                      <input
                        type="text"
                        value={customPaymentDate}
                        onChange={(e) => {
                          const val = e.target.value;
                          setCustomPaymentDate(val);
                          regenerateDraft(whatsAppTemplate, whatsAppLang, Number(customAmount), customPaymentDetails, customPaymentMode, val, customBankName, customAccountLast4, customUpiId, includeBankDetails);
                        }}
                        placeholder="e.g. 08/10/2026"
                        className="w-full text-xs font-mono bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none text-slate-800"
                      />
                    </div>

                    {/* UTR / Transaction Reference */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-600 uppercase">
                        {whatsAppLang === 'as' ? "UTR / ৰেফাৰেন্স" : "UTR / Reference ID"}
                      </label>
                      <input
                        type="text"
                        value={customPaymentDetails}
                        onChange={(e) => {
                          const val = e.target.value;
                          setCustomPaymentDetails(val);
                          regenerateDraft(whatsAppTemplate, whatsAppLang, Number(customAmount), val, customPaymentMode, customPaymentDate, customBankName, customAccountLast4, customUpiId, includeBankDetails);
                        }}
                        placeholder="e.g. AXODH28193290602"
                        className="w-full text-xs font-mono bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none text-slate-800"
                      />
                    </div>
                  </div>

                  {/* Bank & UPI Details Row */}
                  <div className="pt-2 border-t border-slate-200/80 space-y-2">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <label className="flex items-center gap-2 text-xs text-slate-700 font-bold cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={includeBankDetails}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setIncludeBankDetails(checked);
                            regenerateDraft(whatsAppTemplate, whatsAppLang, Number(customAmount), customPaymentDetails, customPaymentMode, customPaymentDate, customBankName, customAccountLast4, customUpiId, checked);
                          }}
                          className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5"
                        />
                        <span className="text-[11px]">
                          {whatsAppLang === 'as'
                            ? "বাৰ্তাত বেংক একাউণ্ট / UPI তথ্য অন্তৰ্ভুক্ত কৰক"
                            : "Include Bank Account / UPI Details in message"}
                        </span>
                      </label>
                      {matchedInf?.bankDetails && (
                        <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 font-bold">
                          Profile Bank Loaded
                        </span>
                      )}
                    </div>

                    {includeBankDetails && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-600 uppercase">
                            {whatsAppLang === 'as' ? "বেংকৰ নাম (Bank Name)" : "Bank Name"}
                          </label>
                          <input
                            type="text"
                            value={customBankName}
                            onChange={(e) => {
                              const val = e.target.value;
                              setCustomBankName(val);
                              regenerateDraft(whatsAppTemplate, whatsAppLang, Number(customAmount), customPaymentDetails, customPaymentMode, customPaymentDate, val, customAccountLast4, customUpiId, true);
                            }}
                            placeholder="e.g. HDFC Bank, SBI"
                            className="w-full text-xs font-mono bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none text-slate-800"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-600 uppercase">
                            {whatsAppLang === 'as' ? "একাউণ্ট নম্বৰ (Last 4/A/C)" : "A/C (Last 4 Digits)"}
                          </label>
                          <input
                            type="text"
                            value={customAccountLast4}
                            onChange={(e) => {
                              const val = e.target.value;
                              setCustomAccountLast4(val);
                              regenerateDraft(whatsAppTemplate, whatsAppLang, Number(customAmount), customPaymentDetails, customPaymentMode, customPaymentDate, customBankName, val, customUpiId, true);
                            }}
                            placeholder="e.g. 4821"
                            className="w-full text-xs font-mono bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none text-slate-800"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-600 uppercase">
                            {whatsAppLang === 'as' ? "UPI ID" : "UPI ID"}
                          </label>
                          <input
                            type="text"
                            value={customUpiId}
                            onChange={(e) => {
                              const val = e.target.value;
                              setCustomUpiId(val);
                              regenerateDraft(whatsAppTemplate, whatsAppLang, Number(customAmount), customPaymentDetails, customPaymentMode, customPaymentDate, customBankName, customAccountLast4, val, true);
                            }}
                            placeholder="e.g. name@okhdfcbank"
                            className="w-full text-xs font-mono bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none text-slate-800"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Task Ledger Sync Checkbox */}
                  <label className="flex items-center gap-2 pt-1 text-xs text-slate-700 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={saveToTaskOnSend}
                      onChange={(e) => setSaveToTaskOnSend(e.target.checked)}
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5"
                    />
                    <span className="font-semibold text-[11px]">
                      {whatsAppLang === 'as'
                        ? "এই পেমেন্টৰ তথ্যসমূহ লেজাৰত স্বয়ংক্ৰিয়ভাৱে 'Completed' হিচাপে সংৰক্ষণ কৰক"
                        : "Auto-record these payment details into task ledger as Completed on send"}
                    </span>
                  </label>
                </div>

                {/* Live Message Draft Editor */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs flex-wrap gap-2">
                    <label className="font-extrabold text-slate-800 flex items-center gap-1.5">
                      <span>{whatsAppLang === 'as' ? "বাৰ্তাৰ খচৰা (Message Preview & Edit):" : "Message Preview & Customization:"}</span>
                      <span className="text-[10px] font-normal text-slate-400 font-mono">
                        ({whatsAppMessageDraft.length} chars)
                      </span>
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          regenerateDraft(whatsAppTemplate, whatsAppLang, Number(customAmount), customPaymentDetails, customPaymentMode, customPaymentDate, customBankName, customAccountLast4, customUpiId, includeBankDetails);
                          globalToast.info(whatsAppLang === 'as' ? 'বাৰ্তা পুনৰাই মূল ৰূপলৈ অনা হ’ল' : 'Draft reset to default');
                        }}
                        className="text-[11px] font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1 cursor-pointer transition"
                        title="Reset message text"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>{whatsAppLang === 'as' ? "টেমপ্লেট পুনৰায় সেট" : "Reset Draft"}</span>
                      </button>
                      <span className="text-slate-300">|</span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(whatsAppMessageDraft);
                          globalToast.success('Message text copied to clipboard!');
                        }}
                        className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 cursor-pointer transition"
                      >
                        <Copy className="w-3 h-3" />
                        <span>{whatsAppLang === 'as' ? "বাৰ্তা কপি কৰক" : "Copy Message"}</span>
                      </button>
                    </div>
                  </div>

                  <textarea
                    rows={6}
                    value={whatsAppMessageDraft}
                    onChange={(e) => setWhatsAppMessageDraft(e.target.value)}
                    placeholder={whatsAppLang === 'as' ? "বাৰ্তাৰ পাঠ্য লিখক..." : "Draft your WhatsApp payment message..."}
                    className="w-full text-xs font-sans p-3 rounded-xl border border-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-hidden transition bg-slate-50/50 leading-relaxed text-slate-900"
                  />
                </div>
              </div>

              {/* Footer Actions */}
              <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setWhatsAppModalItem(null)}
                  className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold rounded-xl text-xs transition cursor-pointer"
                >
                  {whatsAppLang === 'as' ? "বাতিল (Cancel)" : "Cancel"}
                </button>

                <div className="flex items-center gap-2 flex-wrap">
                  {!effectiveMobile ? (
                    <button
                      type="button"
                      onClick={() => {
                        const input = document.getElementById('whatsapp-recipient-phone-input');
                        if (input) {
                          input.focus();
                          globalToast.info('Please enter the 10-digit WhatsApp number above to send.');
                        } else {
                          const item = whatsAppModalItem;
                          triggerUpdateWhatsAppModal({
                            influencerId: item.influencerId || (matchedInf?.id || ''),
                            influencerName: creatorName,
                            influencerHandle: matchedInf?.handle,
                            influencerAvatar: matchedInf?.avatar,
                            currentMobile: matchedInf?.mobile || '',
                            messageText: whatsAppMessageDraft,
                            contextTitle: 'Payment Clearance Notification',
                            onSuccess: (savedNumber: string) => {
                              setCustomMobileNumber(savedNumber);
                              item.influencerMobile = savedNumber;
                              onUpdateTask(item.id, { influencerMobile: savedNumber });
                              onUpdateInfluencer?.(item.influencerId || matchedInf?.id, { mobile: savedNumber, name: creatorName });
                              openWhatsAppChat({
                                phoneNumber: savedNumber,
                                text: whatsAppMessageDraft,
                                preferApp: true,
                                contactName: creatorName
                              });
                              setWhatsAppModalItem(null);
                            }
                          });
                        }
                      }}
                      className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 active:scale-98 text-white font-black rounded-xl text-xs transition shadow-xs cursor-pointer flex items-center gap-1.5"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span>{whatsAppLang === 'as' ? "ফোন নম্বৰ যোগ কৰক" : "Enter Mobile Number Above to Send"}</span>
                    </button>
                  ) : (
                    <>
                      {/* Secondary: Open WhatsApp Web in browser */}
                      <button
                        type="button"
                        onClick={() => handleConfirmSendWhatsApp(false)}
                        className="px-3.5 py-2.5 bg-white hover:bg-slate-100 active:scale-98 text-slate-700 font-bold rounded-xl text-xs border border-slate-300 transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                        title="Open WhatsApp Web in a browser tab"
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                        <span>WhatsApp Web</span>
                      </button>

                      {/* Primary: Open WhatsApp Application directly for chat */}
                      <button
                        type="button"
                        onClick={() => handleConfirmSendWhatsApp(true)}
                        className="px-5 py-2.5 bg-[#25D366] hover:bg-[#20ba59] active:scale-98 text-white font-black rounded-xl text-xs shadow-md shadow-emerald-500/20 transition flex items-center gap-2 cursor-pointer"
                        title="Open the WhatsApp application directly for chat"
                      >
                        <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                        </svg>
                        <span>{whatsAppLang === 'as' ? "হোৱাটছএপ এপত খোলক (Open WhatsApp App)" : "Open WhatsApp App for Chat"}</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
