import React, { useState, useEffect, useMemo, useRef } from 'react';
import Papa from 'papaparse';
import { 
  CreditCard, Search, Send, Copy, Sparkles, X, CheckCircle2, 
  Trash2, ExternalLink, Calendar, Check,
  MessageCircle, Phone, ArrowUpDown, Filter, Plus, RefreshCw, AlertCircle, FileText,
  Landmark, Coins, CloudUpload, CloudDownload, CloudCheck, Upload, FileSpreadsheet
} from 'lucide-react';
import { Task, Influencer, Campaign } from '../types';
import { 
  PaymentRecord, 
  loadStoredPayments, 
  saveStoredPayments, 
  upsertPaymentRecord, 
  deleteStoredPayment, 
  markPaymentAsSent, 
  subscribeToPaymentUpdates,
  getDeletedPaymentIds,
  markPaymentIdAsDeleted,
  unmarkPaymentIdAsDeleted
} from '../lib/paymentDetailsStore';
import { parseBankPaymentMessage, ParsedBankPayment } from '../lib/bankMessageParser';
import { 
  openWhatsAppChat, 
  getKnownMobile, 
  formatDisplayPhone, 
  cleanSingleMobileForStorage, 
  getDisplayTenDigitMobile 
} from '../lib/whatsappHelper';
import { getBillPaymentWhatsAppText, BillWhatsAppTemplate } from './SecureBillPayment';
import { triggerUpdateWhatsAppModal } from '../lib/whatsappPrompt';
import { globalToast } from '../lib/toast';
import { uploadPaymentDetailsToDrive, downloadPaymentDetailsFromDrive } from '../lib/driveSync';
import { formatDateToDMY } from '../lib/dateUtils';
import { ensureGoogleAccessToken } from '../lib/firebaseAuth';

interface PaymentDetailsViewProps {
  tasks: Task[];
  influencers: Influencer[];
  campaigns?: Campaign[];
  onUpdateTask: (taskId: string, updates: Partial<Task>) => void;
  onUpdateInfluencer?: (infId: string, updates: Partial<Influencer>) => void;
  selectedMonth?: string;
  setSelectedMonth?: (m: string) => void;
  selectedYear?: string;
  setSelectedYear?: (y: string) => void;
  onSwitchToLedger?: () => void;
  accessToken?: string | null;
}

export const PaymentDetailsView: React.FC<PaymentDetailsViewProps> = ({
  tasks = [],
  influencers = [],
  campaigns = [],
  onUpdateTask,
  onUpdateInfluencer,
  selectedMonth = 'ALL',
  setSelectedMonth,
  selectedYear = 'ALL',
  setSelectedYear,
  onSwitchToLedger,
  accessToken = null,
}) => {
  const [storedRecords, setStoredRecords] = useState<PaymentRecord[]>(() => loadStoredPayments());
  const [searchQuery, setSearchQuery] = useState('');
  const [modeFilter, setModeFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'Sent_WhatsApp' | 'Saved'>('ALL');
  const [activeTabFilter, setActiveTabFilter] = useState<'vault' | 'outstanding'>('vault');
  const [sortBy, setSortBy] = useState<'date_desc' | 'date_asc' | 'amount_desc'>('date_desc');
  const [isDriveUploading, setIsDriveUploading] = useState(false);
  const [isDriveSyncing, setIsDriveSyncing] = useState(false);
  const [lastDriveSyncTime, setLastDriveSyncTime] = useState<string | null>(null);
  const [copiedUtr, setCopiedUtr] = useState<string | null>(null);
  const [copiedDraftId, setCopiedDraftId] = useState<string | null>(null);

  // Quick WhatsApp Send Modal states
  const [activeSendRecord, setActiveSendRecord] = useState<PaymentRecord | null>(null);
  const [sendModalLang, setSendModalLang] = useState<'en' | 'as'>('en');
  const [sendModalTemplate, setSendModalTemplate] = useState<BillWhatsAppTemplate>('payment_details');
  const [editableMobile, setEditableMobile] = useState('');
  const [customMessageDraft, setCustomMessageDraft] = useState('');

  // Quick Paste / Add Payment Box states
  const [isAddBoxOpen, setIsAddBoxOpen] = useState(false);
  const [pastedRawText, setPastedRawText] = useState('');
  const [parsedBankResult, setParsedBankResult] = useState<ParsedBankPayment | null>(null);
  const [selectedCreatorName, setSelectedCreatorName] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [formAmount, setFormAmount] = useState<number | ''>('');
  const [formUtr, setFormUtr] = useState('');
  const [formMode, setFormMode] = useState('Bank Transfer (NEFT/IMPS)');
  const [formDate, setFormDate] = useState(() => new Date().toLocaleDateString('en-GB'));
  const [formBankName, setFormBankName] = useState('');
  const [formAccountLast4, setFormAccountLast4] = useState('');
  const [formUpiId, setFormUpiId] = useState('');
  const [formMobile, setFormMobile] = useState('');

  // Edit record modal state
  const [editingRecord, setEditingRecord] = useState<PaymentRecord | null>(null);

  // In-app delete confirmation modal state
  const [recordToDelete, setRecordToDelete] = useState<PaymentRecord | null>(null);
  const [deletedVersion, setDeletedVersion] = useState<number>(0);
  const [lastAddedRecordId, setLastAddedRecordId] = useState<string | null>(null);
  const csvFileInputRef = useRef<HTMLInputElement | null>(null);

  const handleExportCSV = () => {
    try {
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
    } catch (err: any) {
      console.error('CSV Export Error:', err);
      globalToast.error(`Failed to export CSV: ${err.message || 'Unknown error'}`);
    }
  };

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

          let importedCount = 0;
          rows.forEach((row) => {
            if (!row || typeof row !== 'object') return;
            const hasContent = Object.values(row).some(v => v !== undefined && v !== null && String(v).trim() !== '');
            if (!hasContent) return;

            const creatorName = getRowVal(row, 'Creator Name', 'Creator', 'Influencer / Creator Name', 'Influencer Name', 'Name');
            const amountStr = getRowVal(row, 'Amount (INR)', 'Amount', 'Billed Amount (INR)', 'Billed Amount', 'Remuneration', 'Fee', 'Cost');
            const utr = getRowVal(row, 'UTR / Reference Number', 'UTR Reference', 'UTR', 'Reference', 'Reference Number', 'Transaction ID', 'Payment Details');
            const mode = getRowVal(row, 'Payment Mode', 'Mode');
            const date = getRowVal(row, 'Payment Date', 'Date', 'Paid Date');
            const bank = getRowVal(row, 'Bank Name', 'Bank');
            const accLast4 = getRowVal(row, 'Account Last 4', 'Account Number Last 4', 'Acc Last 4');
            const upi = getRowVal(row, 'UPI ID', 'UPI');
            const mobile = getRowVal(row, 'Mobile Number', 'Mobile', 'Phone', 'WhatsApp');
            const product = getRowVal(row, 'Product', 'Product / Deliverable', 'Product Name', 'Title');
            const videoId = getRowVal(row, 'Video ID', 'videoId');
            const taskId = getRowVal(row, 'Task ID', 'taskId', 'id');
            const notes = getRowVal(row, 'Notes');

            const parsedAmt = amountStr ? parseFloat(amountStr.replace(/[^0-9.]/g, '')) : 0;
            if (creatorName || utr || parsedAmt > 0) {
              upsertPaymentRecord({
                creatorName: creatorName || 'Creator',
                amount: !isNaN(parsedAmt) ? parsedAmt : 0,
                utrReference: utr || `CSV_PAY_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
                paymentMode: mode || 'Bank Transfer (NEFT/IMPS)',
                paymentDate: date || new Date().toISOString().slice(0, 10),
                bankName: bank || undefined,
                accountLast4: accLast4 || undefined,
                upiId: upi || undefined,
                mobile: mobile || undefined,
                productName: product || undefined,
                videoId: videoId || undefined,
                taskId: taskId || undefined,
                notes: notes || undefined,
                status: 'Saved'
              });
              importedCount++;

              if (taskId) {
                const matchedTask = tasks.find(t => t.id === taskId);
                if (matchedTask) {
                  onUpdateTask(taskId, {
                    paymentDetails: utr || matchedTask.paymentDetails,
                    paymentStatus: 'Completed'
                  });
                }
              }
            }
          });

          if (importedCount > 0) {
            globalToast.success(`Successfully imported ${importedCount} payment records from CSV!`);
          } else {
            globalToast.warning('No valid payment records found in the CSV file.');
          }
        } catch (err: any) {
          console.error('Error importing payment details CSV:', err);
          globalToast.error(`Failed to import CSV: ${err.message || 'Unknown error'}`);
        }
      },
      error: (err: any) => {
        globalToast.error(`CSV Parsing error: ${err.message || 'Failed to read file'}`);
      }
    });
  };

  // Global paste handler on the page for direct pasting
  useEffect(() => {
    const handleGlobalPaste = (e: ClipboardEvent) => {
      const activeEl = document.activeElement;
      const isInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');
      if (isInput && activeEl.id !== 'pasteBankTextarea' && (activeEl as HTMLInputElement).name !== 'pasteArea') {
        return;
      }
      const pasted = e.clipboardData?.getData('text');
      if (pasted && pasted.trim()) {
        setIsAddBoxOpen(true);
        handleProcessPastedBankMessage(pasted, true);
      }
    };

    window.addEventListener('paste', handleGlobalPaste);
    return () => window.removeEventListener('paste', handleGlobalPaste);
  }, [influencers, tasks]);

  // Subscribe to external store updates (e.g. from PAYMENT DETAILS CONFIGURATION in SecureBillPayment)
  useEffect(() => {
    const unsubscribe = subscribeToPaymentUpdates((updated) => {
      setStoredRecords(updated);
    });
    return unsubscribe;
  }, []);

  // Merge stored records with any existing completed tasks from planner, excluding explicitly deleted records
  const mergedRecords = useMemo(() => {
    const deletedIds = getDeletedPaymentIds();
    const list: PaymentRecord[] = storedRecords.filter(r => {
      if (deletedIds.has(r.id)) return false;
      if (r.taskId && (deletedIds.has(r.taskId) || deletedIds.has(`task_pay_${r.taskId}`))) return false;
      if (r.utrReference && deletedIds.has(`utr_${r.utrReference.trim().toLowerCase()}`)) return false;
      return true;
    });

    const existingUtrsOrTasks = new Set<string>();

    list.forEach(r => {
      if (r.taskId) existingUtrsOrTasks.add(r.taskId);
      if (r.utrReference) existingUtrsOrTasks.add(r.utrReference.trim().toLowerCase());
    });

    // Populate from tasks that have explicit recorded payment details if not already present or deleted
    tasks.forEach(t => {
      const utrKey = t.paymentDetails ? `utr_${t.paymentDetails.trim().toLowerCase()}` : '';
      if (
        deletedIds.has(t.id) || 
        deletedIds.has(`task_pay_${t.id}`) ||
        (utrKey && deletedIds.has(utrKey))
      ) {
        return;
      }

      // STRICT: Only include tasks that actually have explicit payment details recorded!
      // Do NOT resurrect tasks without payment details simply because they were marked Completed
      const hasPayment = Boolean(t.paymentDetails && t.paymentDetails.trim());
      if (hasPayment && !existingUtrsOrTasks.has(t.id)) {
        const inf = influencers.find(i => i.id === t.influencerId || i.name === t.influencerName);
        const creatorName = t.influencerName || inf?.name || 'Creator';
        const mobile = t.influencerMobile || inf?.mobile || getKnownMobile(creatorName) || '';
        const amt = Number(t.billedAmount || t.remuneration || 0);
        const ref = t.paymentDetails || '';
        const mode = t.paymentMethod || 'Bank Transfer (NEFT/IMPS)';
        const dateStr = t.paidDate || t.dueDate || new Date().toLocaleDateString('en-GB');

        list.push({
          id: `task_pay_${t.id}`,
          taskId: t.id,
          influencerId: t.influencerId || inf?.id,
          creatorName,
          productName: t.title || t.product || '',
          campaignName: t.campaignName || '',
          videoId: t.videoId || t.displayVideoId || '',
          videoLink: Array.isArray(t.videoLinks) ? t.videoLinks[0] : (t.videoLink || ''),
          mobile,
          amount: amt,
          utrReference: ref,
          paymentMode: mode,
          paymentDate: dateStr,
          bankName: inf?.bankDetails?.bankName || '',
          accountLast4: inf?.bankDetails?.accountNumber ? String(inf.bankDetails.accountNumber).slice(-4) : '',
          upiId: inf?.bankDetails?.upiId || '',
          includeBankDetails: true,
          status: t.paymentStatus === 'Completed' ? 'Completed' : 'Saved',
          createdAt: t.createdAt || new Date().toISOString(),
          updatedAt: t.updatedAt || new Date().toISOString(),
        });
      }
    });

    return list;
  }, [storedRecords, tasks, influencers, deletedVersion]);

  // Filter and sort records
  const filteredRecords = useMemo(() => {
    let result = mergedRecords.filter(r => {
      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchCreator = (r.creatorName || '').toLowerCase().includes(q);
        const matchUtr = (r.utrReference || '').toLowerCase().includes(q);
        const matchMobile = (r.mobile || '').toLowerCase().includes(q);
        const matchProduct = (r.productName || '').toLowerCase().includes(q);
        const matchBank = (r.bankName || '').toLowerCase().includes(q);
        const matchUpi = (r.upiId || '').toLowerCase().includes(q);
        const matchVideoId = (r.videoId || '').toLowerCase().includes(q);
        if (!matchCreator && !matchUtr && !matchMobile && !matchProduct && !matchBank && !matchUpi && !matchVideoId) {
          return false;
        }
      }

      // Mode filter
      if (modeFilter !== 'ALL') {
        if (!r.paymentMode.toLowerCase().includes(modeFilter.toLowerCase())) {
          return false;
        }
      }

      // Status filter
      if (statusFilter !== 'ALL') {
        if (statusFilter === 'Sent_WhatsApp' && r.status !== 'Sent_WhatsApp') return false;
        if (statusFilter === 'Saved' && r.status === 'Sent_WhatsApp') return false;
      }

      return true;
    });

    // Sorting
    result.sort((a, b) => {
      if (sortBy === 'amount_desc') {
        return (b.amount || 0) - (a.amount || 0);
      }
      const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
      if (sortBy === 'date_asc') return timeA - timeB;
      return timeB - timeA;
    });

    return result;
  }, [mergedRecords, searchQuery, modeFilter, statusFilter, sortBy]);

  // Aggregate stats
  const stats = useMemo(() => {
    const totalAmount = mergedRecords.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
    const sentCount = mergedRecords.filter(r => r.status === 'Sent_WhatsApp').length;
    const autoCollectedCount = mergedRecords.filter(r => Boolean(r.rawPastedMessage)).length;
    return {
      totalAmount,
      totalCount: mergedRecords.length,
      sentCount,
      autoCollectedCount,
    };
  }, [mergedRecords]);

  // Synchronized Ledger calculations for SETTLED PAYMENTS and OUTSTANDING PAYOUTS
  const ledgerStats = useMemo(() => {
    let completedPaidAmount = 0;
    let pendingUnpaidAmount = 0;
    let settledCount = 0;
    let outstandingCount = 0;
    const deletedIds = getDeletedPaymentIds();

    tasks.forEach(t => {
      if (t.status === 'Cancelled') return;
      const amt = Number(t.billedAmount !== undefined && t.billedAmount > 0 ? t.billedAmount : (t.remuneration || 0));

      const isDeleted = (t.id && (deletedIds.has(t.id) || deletedIds.has(`task_pay_${t.id}`))) ||
                        (t.paymentDetails && deletedIds.has(`utr_${t.paymentDetails.trim().toLowerCase()}`));

      const matchingStored = isDeleted ? undefined : storedRecords.find(r => 
        (t.id && (r.taskId === t.id || r.id === `task_pay_${t.id}`)) ||
        (t.paymentDetails && r.utrReference && r.utrReference.trim().toLowerCase() === t.paymentDetails.trim().toLowerCase()) ||
        (r.creatorName && t.influencerName && r.creatorName.trim().toLowerCase() === t.influencerName.trim().toLowerCase() && Math.abs((r.amount || 0) - amt) < 1)
      );

      const isSettled = !isDeleted && (
        t.paymentStatus === 'Completed' ||
        Boolean(t.paymentDetails && t.paymentDetails.trim() !== '') ||
        Boolean(matchingStored)
      );

      if (isSettled) {
        settledCount++;
        completedPaidAmount += matchingStored ? (matchingStored.amount || amt) : amt;
      } else {
        outstandingCount++;
        pendingUnpaidAmount += amt;
      }
    });

    return {
      completedPaidAmount,
      pendingUnpaidAmount,
      settledCount,
      outstandingCount,
    };
  }, [tasks, storedRecords, deletedVersion]);

  // Outstanding deliverables list for direct settlement from Payment Details page
  const outstandingTasks = useMemo(() => {
    const deletedIds = getDeletedPaymentIds();
    return tasks.filter(t => {
      if (t.status === 'Cancelled') return false;
      const amt = Number(t.billedAmount !== undefined && t.billedAmount > 0 ? t.billedAmount : (t.remuneration || 0));
      const isDeleted = (t.id && (deletedIds.has(t.id) || deletedIds.has(`task_pay_${t.id}`))) ||
                        (t.paymentDetails && deletedIds.has(`utr_${t.paymentDetails.trim().toLowerCase()}`));

      const matchingStored = isDeleted ? undefined : storedRecords.find(r => 
        (t.id && (r.taskId === t.id || r.id === `task_pay_${t.id}`)) ||
        (t.paymentDetails && r.utrReference && r.utrReference.trim().toLowerCase() === t.paymentDetails.trim().toLowerCase()) ||
        (r.creatorName && t.influencerName && r.creatorName.trim().toLowerCase() === t.influencerName.trim().toLowerCase() && Math.abs((r.amount || 0) - amt) < 1)
      );

      const isSettled = !isDeleted && (
        t.paymentStatus === 'Completed' ||
        Boolean(t.paymentDetails && t.paymentDetails.trim() !== '') ||
        Boolean(matchingStored)
      );

      return !isSettled;
    });
  }, [tasks, storedRecords, deletedVersion]);

  // Helper to resolve influencer details
  const resolveInfluencer = (infId?: string, name?: string) => {
    return influencers.find(i => (infId && i.id === infId) || (name && i.name.toLowerCase() === name.toLowerCase()));
  };

  // Process pasted bank SMS / transfer receipt
  const handleProcessPastedBankMessage = (rawText: string, autoSave = false) => {
    setPastedRawText(rawText);
    if (!rawText.trim()) {
      setParsedBankResult(null);
      return;
    }

    // Collect all candidate creator names from influencers and planner tasks
    const allCandidateNames = Array.from(new Set([
      ...influencers.map(i => i.name).filter(Boolean),
      ...influencers.map(i => i.billingName).filter(Boolean) as string[],
      ...tasks.map(t => t.influencerName).filter(Boolean) as string[],
    ]));

    const parsed = parseBankPaymentMessage(rawText, allCandidateNames);
    setParsedBankResult(parsed);

    const extractedAmount = parsed.amount !== null && parsed.amount > 0 ? parsed.amount : (formAmount !== '' ? Number(formAmount) : 0);
    const extractedUtr = parsed.reference ? parsed.reference.trim() : formUtr.trim();
    const extractedMode = parsed.paymentMode || formMode || 'Bank Transfer (NEFT/IMPS)';
    const extractedDate = parsed.date || formDate || new Date().toLocaleDateString('en-GB');

    if (parsed.amount !== null && parsed.amount > 0) {
      setFormAmount(parsed.amount);
    }
    if (parsed.reference) {
      setFormUtr(parsed.reference);
    }
    if (parsed.paymentMode) {
      setFormMode(parsed.paymentMode);
    }
    if (parsed.date) {
      setFormDate(parsed.date);
    }

    // Try auto-match creator from beneficiary name or text
    let matchedCreator = selectedCreatorName;
    let matchedInf = resolveInfluencer(undefined, selectedCreatorName);
    let matchedTask = tasks.find(t => t.id === selectedTaskId);

    if (parsed.beneficiary) {
      const bLower = parsed.beneficiary.toLowerCase();
      const match = influencers.find(inf => 
        (inf.name && inf.name.toLowerCase().includes(bLower)) || 
        (bLower.includes((inf.name || '').toLowerCase())) ||
        (inf.billingName && inf.billingName.toLowerCase().includes(bLower))
      );
      if (match) {
        matchedCreator = match.name;
        matchedInf = match;
        setSelectedCreatorName(match.name);
        setFormMobile(match.mobile || '');
        const tMatch = tasks.find(t => t.influencerId === match.id || t.influencerName === match.name);
        if (tMatch) {
          matchedTask = tMatch;
          setSelectedTaskId(tMatch.id);
        }
      } else {
        matchedCreator = parsed.beneficiary;
        setSelectedCreatorName(parsed.beneficiary);
      }
    } else {
      // Search rawText for any known influencer
      for (const inf of influencers) {
        if (inf.name && rawText.toLowerCase().includes(inf.name.toLowerCase())) {
          matchedCreator = inf.name;
          matchedInf = inf;
          setSelectedCreatorName(inf.name);
          setFormMobile(inf.mobile || '');
          const tMatch = tasks.find(t => t.influencerId === inf.id || t.influencerName === inf.name);
          if (tMatch) {
            matchedTask = tMatch;
            setSelectedTaskId(tMatch.id);
          }
          break;
        }
      }
    }

    // Collect beneficiary bank name from influencer bill details
    const influencerBillBank = matchedInf?.bankDetails?.bankName || (matchedInf as any)?.bankName || '';
    const finalBankName = influencerBillBank || formBankName || '';
    setFormBankName(finalBankName);

    const influencerLast4 = matchedInf?.bankDetails?.accountNumber 
      ? String(matchedInf.bankDetails.accountNumber).slice(-4) 
      : (parsed.accountLast4 || formAccountLast4 || '');
    if (influencerLast4) setFormAccountLast4(influencerLast4);

    const influencerUpi = matchedInf?.bankDetails?.upiId || parsed.upiId || formUpiId || '';
    if (influencerUpi) setFormUpiId(influencerUpi);

    // If autoSave is requested or amount/UTR was extracted from direct paste, auto-save & show in vault
    if (autoSave && (extractedAmount > 0 || extractedUtr)) {
      const targetName = matchedCreator.trim() || parsed.beneficiary || 'Creator';
      const record = upsertPaymentRecord({
        taskId: matchedTask?.id || selectedTaskId || undefined,
        influencerId: matchedInf?.id,
        creatorName: targetName,
        productName: matchedTask?.title || matchedTask?.product || '',
        campaignName: matchedTask?.campaignName || '',
        videoId: matchedTask?.videoId || matchedTask?.displayVideoId || '',
        videoLink: Array.isArray(matchedTask?.videoLinks) ? matchedTask.videoLinks[0] : (matchedTask?.videoLink || ''),
        mobile: cleanSingleMobileForStorage(formMobile || matchedInf?.mobile || getKnownMobile(targetName) || ''),
        amount: Number(extractedAmount) || 0,
        utrReference: extractedUtr,
        paymentMode: extractedMode,
        paymentDate: extractedDate,
        bankName: finalBankName,
        accountLast4: influencerLast4,
        upiId: influencerUpi,
        rawPastedMessage: rawText,
        status: 'Saved',
      });

      if (record.id) unmarkPaymentIdAsDeleted(record.id);
      if (extractedUtr) unmarkPaymentIdAsDeleted(`utr_${extractedUtr.toLowerCase()}`);
      if (matchedTask?.id) unmarkPaymentIdAsDeleted(matchedTask.id);

      setStoredRecords(loadStoredPayments());
      setDeletedVersion(v => v + 1);
      setActiveTabFilter('vault');
      setSearchQuery('');
      setLastAddedRecordId(record.id);

      if (matchedTask) {
        onUpdateTask(matchedTask.id, {
          paymentStatus: 'Completed',
          paymentDetails: extractedUtr || 'Settled via Bank Transfer',
          billedAmount: Number(extractedAmount) || matchedTask.billedAmount || 0,
          paymentMethod: extractedMode,
          paidDate: extractedDate,
        });
      }

      globalToast.success(`Auto-collected & saved payment for ${targetName} (₹${Number(extractedAmount).toLocaleString('en-IN')})! Shown in Vault.`);
    } else {
      globalToast.info(`Extracted: ₹${Number(extractedAmount || 0).toLocaleString('en-IN')} | Ref: ${extractedUtr || 'Detected'} | Creator: ${matchedCreator || 'Detected'}`);
    }
  };

  // Handle Save New Payment from direct box
  const handleSaveNewPayment = () => {
    if (!selectedCreatorName.trim() && !parsedBankResult?.beneficiary) {
      globalToast.error('Please enter or select a Creator / Influencer name.');
      return;
    }

    const creatorName = selectedCreatorName.trim() || parsedBankResult?.beneficiary || 'Creator';
    const inf = resolveInfluencer(undefined, creatorName);
    const matchedTask = tasks.find(t => t.id === selectedTaskId || t.influencerName === creatorName);

    // Collect beneficiary bank name from influencer bill details
    const influencerBillBank = inf?.bankDetails?.bankName || (inf as any)?.bankName || '';
    const finalBank = formBankName || influencerBillBank || '';
    const finalLast4 = formAccountLast4 || (inf?.bankDetails?.accountNumber ? String(inf.bankDetails.accountNumber).slice(-4) : '');
    const finalUpi = formUpiId || inf?.bankDetails?.upiId || '';
    const cleanUtr = formUtr.trim();

    const record = upsertPaymentRecord({
      taskId: matchedTask?.id || selectedTaskId || undefined,
      influencerId: inf?.id,
      creatorName,
      productName: matchedTask?.title || matchedTask?.product || '',
      campaignName: matchedTask?.campaignName || '',
      videoId: matchedTask?.videoId || matchedTask?.displayVideoId || '',
      videoLink: Array.isArray(matchedTask?.videoLinks) ? matchedTask.videoLinks[0] : (matchedTask?.videoLink || ''),
      mobile: cleanSingleMobileForStorage(formMobile || inf?.mobile || getKnownMobile(creatorName) || ''),
      amount: Number(formAmount) || 0,
      utrReference: cleanUtr,
      paymentMode: formMode,
      paymentDate: formDate || new Date().toLocaleDateString('en-GB'),
      bankName: finalBank,
      accountLast4: finalLast4,
      upiId: finalUpi,
      rawPastedMessage: pastedRawText,
      status: 'Saved',
    });

    if (record.id) unmarkPaymentIdAsDeleted(record.id);
    if (cleanUtr) unmarkPaymentIdAsDeleted(`utr_${cleanUtr.toLowerCase()}`);
    if (matchedTask?.id) unmarkPaymentIdAsDeleted(matchedTask.id);

    // Also update task ledger if matched or matching unpaid task for this creator
    const taskToUpdate = matchedTask || tasks.find(t => {
      const nameMatch = (t.influencerName || '').trim().toLowerCase() === creatorName.trim().toLowerCase();
      const isUnpaid = t.paymentStatus !== 'Completed';
      return nameMatch && isUnpaid;
    });

    if (taskToUpdate) {
      onUpdateTask(taskToUpdate.id, {
        paymentStatus: 'Completed',
        paymentDetails: cleanUtr || 'Settled via Bank Transfer',
        billedAmount: Number(formAmount) || taskToUpdate.billedAmount || 0,
        paymentMethod: formMode,
        paidDate: formDate,
      });
    }

    setStoredRecords(loadStoredPayments());
    setDeletedVersion(v => v + 1);
    setActiveTabFilter('vault');
    setSearchQuery('');
    setLastAddedRecordId(record.id);

    globalToast.success(`Payment details for ${creatorName} saved successfully! Shown in Vault.`);

    // Reset add form
    setIsAddBoxOpen(false);
    setPastedRawText('');
    setParsedBankResult(null);
    setSelectedCreatorName('');
    setSelectedTaskId('');
    setFormAmount('');
    setFormUtr('');
    setFormBankName('');
    setFormAccountLast4('');
    setFormUpiId('');
    setFormMobile('');
  };

  // Generate WhatsApp message for a record
  const generateMessageText = (record: PaymentRecord, tmpl: BillWhatsAppTemplate, lang: 'en' | 'as') => {
    const inf = resolveInfluencer(record.influencerId, record.creatorName);
    const effectiveBankName = record.bankName || inf?.bankDetails?.bankName || (inf as any)?.bankName || '';
    const effectiveAccountLast4 = record.accountLast4 || (inf?.bankDetails?.accountNumber ? String(inf.bankDetails.accountNumber).slice(-4) : '');
    const effectiveUpiId = record.upiId || inf?.bankDetails?.upiId || '';

    return getBillPaymentWhatsAppText({
      template: tmpl,
      lang,
      creatorName: record.creatorName,
      productName: record.productName || 'promotional video',
      campaignName: record.campaignName,
      amount: record.amount,
      paymentDetails: record.utrReference,
      paymentMode: record.paymentMode,
      paymentDate: record.paymentDate,
      bankName: effectiveBankName,
      accountLast4: effectiveAccountLast4,
      upiId: effectiveUpiId,
      includeBankInfo: Boolean(effectiveBankName || effectiveAccountLast4 || effectiveUpiId),
      videoId: record.videoId,
    });
  };

  // Quick WhatsApp Send - Open Preview Modal
  const handleOpenSendModal = (record: PaymentRecord) => {
    setActiveSendRecord(record);
    const inf = resolveInfluencer(record.influencerId, record.creatorName);
    const targetMobile = record.mobile || inf?.mobile || getKnownMobile(record.creatorName) || '';
    setEditableMobile(targetMobile);
    const draft = generateMessageText(record, sendModalTemplate, sendModalLang);
    setCustomMessageDraft(draft);
  };

  // Quick Direct WhatsApp Send (1-Click, no modal needed if phone exists)
  const handleDirectSendWhatsApp = (record: PaymentRecord) => {
    const inf = resolveInfluencer(record.influencerId, record.creatorName);
    const mobile = cleanSingleMobileForStorage(record.mobile || inf?.mobile || getKnownMobile(record.creatorName) || '');
    const msgText = generateMessageText(record, 'payment_details', 'en');

    if (!mobile) {
      // Trigger update phone modal or open send modal
      triggerUpdateWhatsAppModal({
        influencerId: record.influencerId || inf?.id || '',
        influencerName: record.creatorName,
        currentMobile: '',
        messageText: msgText,
        contextTitle: 'Send WhatsApp Payment Details',
        onSuccess: (savedNumber: string) => {
          const clean = cleanSingleMobileForStorage(savedNumber);
          upsertPaymentRecord({ id: record.id, mobile: clean, creatorName: record.creatorName });
          markPaymentAsSent(record.id);
          setStoredRecords(loadStoredPayments());
          if (record.taskId) onUpdateTask(record.taskId, { influencerMobile: clean });
          openWhatsAppChat({
            phoneNumber: clean,
            text: msgText,
            preferApp: true,
            contactName: record.creatorName,
          });
        }
      });
      return;
    }

    markPaymentAsSent(record.id);
    setStoredRecords(loadStoredPayments());
    if (record.taskId) {
      onUpdateTask(record.taskId, {
        paymentStatus: 'Completed',
        paymentDetails: record.utrReference || 'Settled via Bank Transfer',
      });
    }

    openWhatsAppChat({
      phoneNumber: mobile,
      text: msgText,
      preferApp: true,
      contactName: record.creatorName,
    });
    globalToast.success(`Opening WhatsApp with payment details for ${record.creatorName}!`);
  };

  // Confirm Send from modal
  const handleConfirmModalSend = () => {
    if (!activeSendRecord) return;
    const cleanNum = cleanSingleMobileForStorage(editableMobile);

    if (!cleanNum) {
      globalToast.error('Please enter a valid WhatsApp mobile number.');
      return;
    }

    // Save mobile to record and influencer
    upsertPaymentRecord({
      id: activeSendRecord.id,
      creatorName: activeSendRecord.creatorName,
      mobile: cleanNum,
      status: 'Sent_WhatsApp',
    });
    markPaymentAsSent(activeSendRecord.id);
    setStoredRecords(loadStoredPayments());

    if (activeSendRecord.influencerId && onUpdateInfluencer) {
      onUpdateInfluencer(activeSendRecord.influencerId, { mobile: cleanNum });
    }
    if (activeSendRecord.taskId) {
      onUpdateTask(activeSendRecord.taskId, {
        influencerMobile: cleanNum,
        paymentStatus: 'Completed',
        paymentDetails: activeSendRecord.utrReference || 'Settled via Bank Transfer',
      });
    }

    openWhatsAppChat({
      phoneNumber: cleanNum,
      text: customMessageDraft,
      preferApp: true,
      contactName: activeSendRecord.creatorName,
    });

    globalToast.success(`WhatsApp message sent to ${activeSendRecord.creatorName}!`);
    setActiveSendRecord(null);
  };

  // Copy UTR / Ref
  const handleCopyUtr = (utr: string) => {
    navigator.clipboard.writeText(utr);
    setCopiedUtr(utr);
    globalToast.info(`Copied UTR: ${utr}`);
    setTimeout(() => setCopiedUtr(null), 2000);
  };

  // Copy WhatsApp Draft
  const handleCopyDraft = (record: PaymentRecord) => {
    const text = generateMessageText(record, 'payment_details', 'en');
    navigator.clipboard.writeText(text);
    setCopiedDraftId(record.id);
    globalToast.success(`Copied WhatsApp payment message for ${record.creatorName}!`);
    setTimeout(() => setCopiedDraftId(null), 2000);
  };

  // Delete payment record - opens in-app confirmation modal (prevents issues with iframe-blocked window.confirm)
  const handleDeleteRecord = (record: PaymentRecord) => {
    setRecordToDelete(record);
  };

  const confirmDelete = (record: PaymentRecord) => {
    deleteStoredPayment(record.id, record.taskId, record.utrReference, record.creatorName);

    // Also clear payment details on any matched task in planner / ledger
    const targetTaskId = record.taskId || tasks.find(t => 
      t.id === record.id || 
      `task_pay_${t.id}` === record.id || 
      (record.utrReference && t.paymentDetails && t.paymentDetails.trim().toLowerCase() === record.utrReference.trim().toLowerCase())
    )?.id;

    if (targetTaskId) {
      onUpdateTask(targetTaskId, {
        paymentStatus: 'Pending',
        paymentDetails: '',
        paidDate: '',
      });
    }

    // Clear matching payment details and reset status on any task matching UTR, taskId, or record id
    const cleanUtr = record.utrReference?.trim().toLowerCase();
    tasks.forEach(t => {
      const isMatch = (record.taskId && t.id === record.taskId) ||
                      (record.id && (t.id === record.id || `task_pay_${t.id}` === record.id)) ||
                      (cleanUtr && t.paymentDetails && t.paymentDetails.trim().toLowerCase() === cleanUtr);
      if (isMatch) {
        onUpdateTask(t.id, {
          paymentStatus: 'Pending',
          paymentDetails: '',
          paidDate: '',
        });
      }
    });

    setDeletedVersion(v => v + 1);
    setStoredRecords(loadStoredPayments());
    setRecordToDelete(null);
    globalToast.success(`Payment details for ${record.creatorName} removed successfully.`);
  };

  // Save edited record
  const handleSaveEditedRecord = () => {
    if (!editingRecord) return;
    upsertPaymentRecord(editingRecord);
    setStoredRecords(loadStoredPayments());
    if (editingRecord.taskId) {
      onUpdateTask(editingRecord.taskId, {
        paymentDetails: editingRecord.utrReference,
        billedAmount: editingRecord.amount,
        paymentMethod: editingRecord.paymentMode,
        paidDate: editingRecord.paymentDate,
        influencerMobile: editingRecord.mobile,
      });
    }
    globalToast.success(`Updated payment details for ${editingRecord.creatorName}`);
    setEditingRecord(null);
  };

  // Upload all payment details to Google Drive
  const handleUploadPaymentDetailsToDrive = async () => {
    setIsDriveUploading(true);
    try {
      globalToast.info('Connecting to Google Drive...');
      const token = await ensureGoogleAccessToken(accessToken);
      if (!token) {
        throw new Error('Google authentication is required to access Google Drive.');
      }

      globalToast.info('Uploading payment details to Google Drive...');
      const currentPayments = loadStoredPayments();
      const deletedIds = Array.from(getDeletedPaymentIds());
      const res = await uploadPaymentDetailsToDrive(token, currentPayments, deletedIds);

      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setLastDriveSyncTime(timeStr);
      globalToast.success(`Successfully uploaded ${res.recordCount} payment details records to Google Drive!`);
    } catch (err: any) {
      console.error('[Drive Upload Error]', err);
      globalToast.error(`Upload to Google Drive failed: ${err.message || 'Unknown error'}`);
    } finally {
      setIsDriveUploading(false);
    }
  };

  // Synchronize payment details from Google Drive
  const handleSynchronizePaymentDetailsFromDrive = async () => {
    setIsDriveSyncing(true);
    try {
      globalToast.info('Connecting to Google Drive...');
      const token = await ensureGoogleAccessToken(accessToken);
      if (!token) {
        throw new Error('Google authentication is required to access Google Drive.');
      }

      globalToast.info('Fetching payment details from Google Drive...');
      const result = await downloadPaymentDetailsFromDrive(token);

      if (!result || !result.data || result.data.length === 0) {
        globalToast.error('No payment details backup found on Google Drive.');
        return;
      }

      // If drive backup contains deletedIds, apply them locally
      if (result.deletedIds && Array.isArray(result.deletedIds)) {
        result.deletedIds.forEach(delId => markPaymentIdAsDeleted(delId));
      }

      const localDeleted = getDeletedPaymentIds();
      const currentList = loadStoredPayments();

      const existingMapById = new Map<string, PaymentRecord>();
      const existingMapByUtr = new Map<string, PaymentRecord>();

      currentList.forEach(r => {
        existingMapById.set(r.id, r);
        if (r.utrReference) {
          existingMapByUtr.set(r.utrReference.trim().toLowerCase(), r);
        }
      });

      let addedCount = 0;
      let updatedCount = 0;
      const mergedList = [...currentList];

      result.data.forEach((remoteRecord: PaymentRecord) => {
        if (!remoteRecord || !remoteRecord.id) return;
        // Skip if deleted locally
        if (localDeleted.has(remoteRecord.id)) return;
        if (remoteRecord.taskId && (localDeleted.has(remoteRecord.taskId) || localDeleted.has(`task_pay_${remoteRecord.taskId}`))) return;
        if (remoteRecord.utrReference && localDeleted.has(`utr_${remoteRecord.utrReference.trim().toLowerCase()}`)) return;

        const cleanUtr = remoteRecord.utrReference ? remoteRecord.utrReference.trim().toLowerCase() : '';
        const existingById = existingMapById.get(remoteRecord.id);
        const existingByUtr = cleanUtr ? existingMapByUtr.get(cleanUtr) : undefined;
        const existing = existingById || existingByUtr;

        if (existing) {
          const remoteTime = new Date(remoteRecord.updatedAt || remoteRecord.createdAt || 0).getTime();
          const localTime = new Date(existing.updatedAt || existing.createdAt || 0).getTime();

          if (remoteTime > localTime) {
            const idx = mergedList.findIndex(r => r.id === existing.id);
            if (idx >= 0) {
              mergedList[idx] = { ...existing, ...remoteRecord };
              updatedCount++;
            }
          }
        } else {
          mergedList.push(remoteRecord);
          existingMapById.set(remoteRecord.id, remoteRecord);
          if (cleanUtr) existingMapByUtr.set(cleanUtr, remoteRecord);
          addedCount++;
        }

        // Also update matching tasks in planner / ledger if present
        if (remoteRecord.taskId) {
          const matchedTask = tasks.find(t => t.id === remoteRecord.taskId);
          if (matchedTask && onUpdateTask) {
            onUpdateTask(remoteRecord.taskId, {
              paymentDetails: remoteRecord.utrReference || matchedTask.paymentDetails,
              billedAmount: remoteRecord.amount || matchedTask.billedAmount,
              paymentMethod: remoteRecord.paymentMode || matchedTask.paymentMethod,
              paidDate: remoteRecord.paymentDate || matchedTask.paidDate,
              influencerMobile: remoteRecord.mobile || matchedTask.influencerMobile,
              paymentStatus: remoteRecord.status === 'Completed' || remoteRecord.status === 'Sent_WhatsApp' ? 'Completed' : matchedTask.paymentStatus
            });
          }
        }
      });

      saveStoredPayments(mergedList);
      setStoredRecords(loadStoredPayments());

      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setLastDriveSyncTime(timeStr);
      globalToast.success(`Successfully synchronized ${result.count} payment details records from Google Drive (${addedCount} added, ${updatedCount} updated)!`);
    } catch (err: any) {
      console.error('[Drive Sync Error]', err);
      globalToast.error(`Synchronization failed: ${err.message || 'Unknown error'}`);
    } finally {
      setIsDriveSyncing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Quick Explanation */}
      <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-cyan-50 rounded-2xl border border-emerald-200 p-5 shadow-sm relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-2 bg-emerald-600 text-white rounded-xl shadow-md font-bold text-base flex items-center justify-center">
                <CreditCard className="w-5 h-5" />
              </span>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                    <span>PAYMENT DETAILS VAULT</span>
                  </h2>
                  <span className="text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 px-2.5 py-0.5 rounded-full">
                    Auto-Synced from Configuration
                  </span>
                  {lastDriveSyncTime && (
                    <span className="text-[10px] font-mono font-bold bg-blue-100 text-blue-800 border border-blue-300 px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-2xs">
                      <CloudCheck className="w-3 h-3 text-blue-600" /> Drive Synced: {lastDriveSyncTime}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-600 mt-0.5">
                  Whenever you paste bank messages into <strong>PAYMENT DETAILS CONFIGURATION</strong>, the details are automatically saved here. Send or re-send to creators anytime via WhatsApp with one click — <em>no need to paste again!</em>
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              disabled={isDriveUploading || isDriveSyncing}
              onClick={handleUploadPaymentDetailsToDrive}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 active:scale-95 text-white rounded-xl text-xs font-bold font-mono shadow-sm transition cursor-pointer"
              title="Upload entire payment details vault to Google Drive"
            >
              <CloudUpload className="w-3.5 h-3.5 text-white" />
              <span>{isDriveUploading ? 'Uploading...' : 'Upload to Google Drive'}</span>
            </button>

            <button
              type="button"
              disabled={isDriveUploading || isDriveSyncing}
              onClick={handleSynchronizePaymentDetailsFromDrive}
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 active:scale-95 text-white rounded-xl text-xs font-bold font-mono shadow-sm transition cursor-pointer"
              title="Synchronize payment details vault from Google Drive"
            >
              <CloudDownload className="w-3.5 h-3.5 text-white" />
              <span>{isDriveSyncing ? 'Syncing...' : 'Synchronize'}</span>
            </button>

            <input 
              type="file" 
              ref={csvFileInputRef} 
              accept=".csv,text/csv" 
              className="hidden" 
              onChange={handleImportCSVFile} 
            />

            <button
              type="button"
              onClick={() => csvFileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 active:scale-95 text-white rounded-xl text-xs font-bold font-mono shadow-sm transition cursor-pointer"
              title="Import payment records from CSV file"
            >
              <Upload className="w-3.5 h-3.5 text-white" />
              <span>Import CSV</span>
            </button>

            <button
              type="button"
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 active:scale-95 text-white rounded-xl text-xs font-bold font-mono shadow-sm transition cursor-pointer"
              title="Export all stored payment records to CSV"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-white" />
              <span>Export CSV</span>
            </button>

            <button
              type="button"
              onClick={() => setIsAddBoxOpen(prev => !prev)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 active:scale-95 text-white rounded-xl text-xs font-black font-mono shadow-md transition cursor-pointer"
              title="Paste bank message or transfer receipt to auto-collect payment data"
            >
              <Sparkles className="w-3.5 h-3.5 text-yellow-300" />
              <span>{isAddBoxOpen ? 'Close Paste Box' : 'Paste Bank Message / Transfer Receipt (Auto-Collect)'}</span>
            </button>

            <button
              type="button"
              onClick={async () => {
                try {
                  const text = await navigator.clipboard.readText();
                  if (text && text.trim()) {
                    setIsAddBoxOpen(true);
                    handleProcessPastedBankMessage(text, true);
                  } else {
                    setIsAddBoxOpen(true);
                    globalToast.info('Clipboard is empty. Please paste bank transfer receipt text.');
                  }
                } catch {
                  setIsAddBoxOpen(true);
                  globalToast.info('Please paste bank message directly into the box.');
                }
              }}
              className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-emerald-50 text-emerald-800 border-2 border-emerald-400 active:scale-95 rounded-xl text-xs font-bold font-mono shadow-xs transition cursor-pointer"
              title="Auto-collect payment directly from clipboard"
            >
              <Copy className="w-3.5 h-3.5 text-emerald-700" />
              <span>Paste Clipboard</span>
            </button>

            {onSwitchToLedger && (
              <button
                type="button"
                onClick={onSwitchToLedger}
                className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 active:scale-95 text-white rounded-xl text-xs font-bold font-mono shadow-sm transition cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5 text-white" />
                <span className="text-white">BILL & CHECKLIST LEDGER</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* KPI Stats Scoreboard - Directly connected with BILL & CHECKLIST LEDGER */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: SETTLED PAYMENTS */}
        <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-4.5 rounded-2xl shadow-md text-white">
          <p className="text-[10px] font-bold text-emerald-100 uppercase font-mono tracking-wider flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <span className="p-1 bg-white/20 rounded-md backdrop-blur-sm shadow-inner inline-flex"><Landmark className="w-3.5 h-3.5 text-white" /></span>
              SETTLED PAYMENTS
            </span>
            <span className="text-[9px] bg-white/20 backdrop-blur-sm px-1.5 py-0.2 rounded font-bold border border-white/20">Ledger Synced</span>
          </p>
          <div className="flex justify-between items-end mt-3">
            <div>
              <h3 className="text-2xl font-black font-mono">₹{ledgerStats.completedPaidAmount.toLocaleString('en-IN')}</h3>
              <p className="text-[10px] text-emerald-100 font-bold font-mono mt-0.5">{ledgerStats.settledCount} cleared deliverable{ledgerStats.settledCount !== 1 ? 's' : ''}</p>
            </div>
            <span className="text-[9px] font-bold bg-white/20 backdrop-blur-sm px-2 py-0.5 rounded-md">
              Cleared
            </span>
          </div>
        </div>

        {/* Card 2: OUTSTANDING PAYOUTS */}
        <div className="bg-gradient-to-br from-amber-500 to-orange-600 p-4.5 rounded-2xl shadow-md text-white">
          <p className="text-[10px] font-bold text-amber-100 uppercase font-mono tracking-wider flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <span className="p-1 bg-white/20 rounded-md backdrop-blur-sm shadow-inner inline-flex"><Coins className="w-3.5 h-3.5 text-white" /></span>
              OUTSTANDING PAYOUTS
            </span>
            <span className="text-[9px] bg-white/20 backdrop-blur-sm px-1.5 py-0.2 rounded font-bold border border-white/20">Pending Clearance</span>
          </p>
          <div className="flex justify-between items-end mt-3">
            <div>
              <h3 className="text-2xl font-black font-mono">₹{ledgerStats.pendingUnpaidAmount.toLocaleString('en-IN')}</h3>
              <p className="text-[10px] text-amber-100 font-bold font-mono mt-0.5">{ledgerStats.outstandingCount} pending deliverable{ledgerStats.outstandingCount !== 1 ? 's' : ''}</p>
            </div>
            <span className="text-[9px] font-bold bg-white/20 backdrop-blur-sm px-2 py-0.5 rounded-md">
              Outstanding
            </span>
          </div>
        </div>

        {/* Card 3: PAYMENT VAULT RECORDS */}
        <div className="bg-gradient-to-br from-indigo-500 to-blue-600 p-4.5 rounded-2xl shadow-md text-white">
          <p className="text-[10px] font-bold text-indigo-100 uppercase font-mono tracking-wider flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <span className="p-1 bg-white/20 rounded-md backdrop-blur-sm shadow-inner inline-flex"><CheckCircle2 className="w-3.5 h-3.5 text-white" /></span>
              PAYMENT VAULT RECORDS
            </span>
            <span className="text-[9px] bg-white/20 backdrop-blur-sm px-1.5 py-0.2 rounded font-bold border border-white/20">Saved Vault</span>
          </p>
          <div className="flex justify-between items-end mt-3">
            <div>
              <h3 className="text-2xl font-black font-mono">{stats.totalCount}</h3>
              <p className="text-[10px] text-indigo-100 font-bold font-mono mt-0.5">₹{stats.totalAmount.toLocaleString('en-IN')} stored</p>
            </div>
            <span className="text-[9px] font-bold bg-white/20 backdrop-blur-sm px-2 py-0.5 rounded-md">
              Saved
            </span>
          </div>
        </div>

        {/* Card 4: WHATSAPP DELIVERED */}
        <div className="bg-gradient-to-br from-teal-500 to-emerald-700 p-4.5 rounded-2xl shadow-md text-white">
          <p className="text-[10px] font-bold text-teal-100 uppercase font-mono tracking-wider flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <span className="p-1 bg-white/20 rounded-md backdrop-blur-sm shadow-inner inline-flex"><Send className="w-3.5 h-3.5 text-white" /></span>
              WHATSAPP DELIVERED
            </span>
            <span className="text-[9px] bg-white/20 backdrop-blur-sm px-1.5 py-0.2 rounded font-bold border border-white/20">Dispatched</span>
          </p>
          <div className="flex justify-between items-end mt-3">
            <div>
              <h3 className="text-2xl font-black font-mono">{stats.sentCount}</h3>
              <p className="text-[10px] text-teal-100 font-bold font-mono mt-0.5">{stats.autoCollectedCount} auto-SMS parsed</p>
            </div>
            <span className="text-[9px] font-bold bg-white/20 backdrop-blur-sm px-2 py-0.5 rounded-md">
              Delivered
            </span>
          </div>
        </div>
      </div>

      {/* Expandable Quick Paste / Manual Add Box */}
      {isAddBoxOpen && (
        <div className="bg-white border-2 border-emerald-400 rounded-2xl p-5 shadow-lg space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between border-b border-emerald-100 pb-3">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                <Sparkles className="w-4 h-4" />
              </span>
              <div>
                <h3 className="text-sm font-black text-slate-800">
                  Paste Bank Message / Transfer Receipt (Auto-Collect)
                </h3>
                <p className="text-[11px] text-slate-500">
                  Paste bank transfer text or netbanking SMS. Amount, UTR/Ref, Mode, Date, and Beneficiary are auto-extracted!
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsAddBoxOpen(false)}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Paste Textarea */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold text-slate-700 uppercase">
                Paste Bank Transfer Text / SMS:
              </label>
              <button
                type="button"
                onClick={async () => {
                  try {
                    const text = await navigator.clipboard.readText();
                    if (text && text.trim()) handleProcessPastedBankMessage(text, true);
                    else globalToast.info('Clipboard is empty.');
                  } catch {
                    globalToast.info('Please paste the bank message directly into the box.');
                  }
                }}
                className="text-[11px] font-bold text-emerald-800 bg-emerald-100/70 hover:bg-emerald-200 border border-emerald-300 px-3 py-1 rounded-lg transition flex items-center gap-1.5 cursor-pointer shadow-3xs"
              >
                <Copy className="w-3.5 h-3.5 text-emerald-700" /> Paste Clipboard & Auto-Collect
              </button>
            </div>
            <textarea
              id="pasteBankTextarea"
              name="pasteArea"
              rows={3}
              value={pastedRawText}
              onChange={(e) => handleProcessPastedBankMessage(e.target.value, false)}
              onPaste={(e) => {
                const text = e.clipboardData.getData('text');
                if (text && text.trim()) {
                  setTimeout(() => handleProcessPastedBankMessage(text, true), 10);
                }
              }}
              placeholder="Directly paste bank transfer statement here (e.g. 08/10/2026 INB/NEFT/AXODH28193290602/Debajani Bora INR 8,000.00)..."
              className="w-full text-xs font-mono bg-slate-50 border border-slate-300 rounded-xl p-3 focus:bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition"
            />
          </div>

          {/* Auto-extracted summary pill */}
          {parsedBankResult && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="font-bold text-emerald-900 flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Auto-Extracted:
              </span>
              {parsedBankResult.amount && (
                <span className="bg-white border border-emerald-200 px-2 py-0.5 rounded-md font-mono font-bold text-emerald-800">
                  💰 ₹{parsedBankResult.amount.toLocaleString('en-IN')}
                </span>
              )}
              {parsedBankResult.reference && (
                <span className="bg-white border border-emerald-200 px-2 py-0.5 rounded-md font-mono text-slate-800 font-bold">
                  🔖 UTR: {parsedBankResult.reference}
                </span>
              )}
              {parsedBankResult.rawMode && (
                <span className="bg-white border border-emerald-200 px-2 py-0.5 rounded-md text-slate-700">
                  ⚡ {parsedBankResult.rawMode}
                </span>
              )}
              {parsedBankResult.date && (
                <span className="bg-white border border-emerald-200 px-2 py-0.5 rounded-md font-mono text-slate-700">
                  📅 {parsedBankResult.date}
                </span>
              )}
              {(selectedCreatorName || parsedBankResult.beneficiary) && (
                <span className="bg-white border border-emerald-200 px-2 py-0.5 rounded-md font-bold text-emerald-700">
                  👤 {selectedCreatorName || parsedBankResult.beneficiary}
                </span>
              )}
              {formBankName && (
                <span className="bg-white border border-emerald-200 px-2 py-0.5 rounded-md font-bold text-teal-800 flex items-center gap-1">
                  🏦 Bank: {formBankName}
                  <span className="text-[9px] font-normal text-emerald-600 bg-emerald-50 px-1 rounded">(Bill Details)</span>
                </span>
              )}
            </div>
          )}

          {/* Form fields for review & editing */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="text-[10px] font-bold text-slate-600 uppercase">Creator / Influencer *</label>
              <input
                type="text"
                value={selectedCreatorName}
                onChange={(e) => setSelectedCreatorName(e.target.value)}
                placeholder="Creator Name"
                className="w-full text-xs font-bold bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 focus:border-emerald-500 outline-none"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-600 uppercase">Amount (₹) *</label>
              <input
                type="number"
                value={formAmount}
                onChange={(e) => setFormAmount(e.target.value ? Number(e.target.value) : '')}
                placeholder="Amount in ₹"
                className="w-full text-xs font-mono font-bold bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 focus:border-emerald-500 outline-none"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-600 uppercase">UTR / Reference ID *</label>
              <input
                type="text"
                value={formUtr}
                onChange={(e) => setFormUtr(e.target.value)}
                placeholder="e.g. AXODH28193290602"
                className="w-full text-xs font-mono bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 focus:border-emerald-500 outline-none"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-600 uppercase">Payment Mode</label>
              <select
                value={formMode}
                onChange={(e) => setFormMode(e.target.value)}
                className="w-full text-xs bg-white border border-slate-300 rounded-lg px-2 py-1.5 focus:border-emerald-500 outline-none cursor-pointer"
              >
                <option value="Bank Transfer (NEFT/IMPS)">Bank Transfer (NEFT/IMPS)</option>
                <option value="UPI / GPay / PhonePe">UPI / GPay / PhonePe</option>
                <option value="RTGS">RTGS</option>
                <option value="Cheque">Cheque</option>
                <option value="Direct Deposit">Direct Deposit</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-600 uppercase">Payment Date</label>
              <input
                type="text"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                placeholder="DD/MM/YYYY"
                className="w-full text-xs font-mono bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 focus:border-emerald-500 outline-none"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-600 uppercase flex items-center justify-between">
                <span>Beneficiary Bank Name</span>
                <span className="text-[8px] text-emerald-700 bg-emerald-50 px-1 py-0.2 rounded font-semibold border border-emerald-200">
                  From Influencer Bill
                </span>
              </label>
              <input
                type="text"
                value={formBankName}
                onChange={(e) => setFormBankName(e.target.value)}
                placeholder="Beneficiary Bank Name"
                className="w-full text-xs font-bold bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 focus:border-emerald-500 outline-none"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-600 uppercase">Account Last 4</label>
              <input
                type="text"
                value={formAccountLast4}
                onChange={(e) => setFormAccountLast4(e.target.value)}
                placeholder="e.g. 4821"
                className="w-full text-xs font-mono bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 focus:border-emerald-500 outline-none"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-600 uppercase">WhatsApp Mobile</label>
              <input
                type="text"
                value={formMobile}
                onChange={(e) => setFormMobile(e.target.value)}
                placeholder="10-digit number"
                className="w-full text-xs font-mono bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 focus:border-emerald-500 outline-none"
              />
            </div>
          </div>

          <div className="flex justify-between items-center gap-2 pt-2 border-t border-slate-100 flex-wrap">
            <span className="text-[11px] text-slate-500 font-medium">
              {parsedBankResult ? '✅ Details extracted from bank receipt! Click "Save Payment & Show in Vault".' : '💡 You can paste receipt SMS or statement directly anytime on this page.'}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsAddBoxOpen(false)}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveNewPayment}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold font-mono rounded-lg transition shadow-md cursor-pointer flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" /> Save Payment & Show in Vault
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="flex items-center gap-2 w-full md:w-auto flex-1 max-w-md">
          <div className="relative w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search Creator Name, UTR, Mobile, Bank, Product..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
          {/* Mode Filter */}
          <div className="flex items-center gap-1 text-xs text-slate-600">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={modeFilter}
              onChange={(e) => setModeFilter(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 font-medium text-slate-800 outline-none cursor-pointer"
            >
              <option value="ALL">All Payment Modes</option>
              <option value="NEFT">NEFT / IMPS</option>
              <option value="UPI">UPI / GPay</option>
              <option value="RTGS">RTGS</option>
              <option value="Cheque">Cheque</option>
            </select>
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 font-medium text-slate-800 outline-none cursor-pointer"
          >
            <option value="ALL">All Statuses</option>
            <option value="Sent_WhatsApp">Sent via WhatsApp</option>
            <option value="Saved">Saved Only</option>
          </select>

          {/* Sort By */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 font-medium text-slate-800 outline-none cursor-pointer"
          >
            <option value="date_desc">Newest First</option>
            <option value="date_asc">Oldest First</option>
            <option value="amount_desc">Highest Amount</option>
          </select>

          <button
            type="button"
            onClick={() => {
              setStoredRecords(loadStoredPayments());
              globalToast.info('Payment records refreshed');
            }}
            className="p-1.5 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg border border-slate-200 transition cursor-pointer"
            title="Refresh list"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Payment Details Table / Cards */}
      {/* Table Sub-Navigation: Saved Payment Records vs Outstanding Deliverables */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTabFilter('vault')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-black font-mono transition cursor-pointer ${
                activeTabFilter === 'vault'
                  ? 'bg-emerald-600 text-white shadow-xs ring-1 ring-emerald-500'
                  : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span>Saved Payment Vault</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                activeTabFilter === 'vault' ? 'bg-white/30 text-white' : 'bg-slate-100 text-slate-700'
              }`}>
                {filteredRecords.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTabFilter('outstanding')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-black font-mono transition cursor-pointer ${
                activeTabFilter === 'outstanding'
                  ? 'bg-amber-600 text-white shadow-xs ring-1 ring-amber-500'
                  : 'bg-white text-amber-900 hover:bg-amber-50 border border-amber-200'
              }`}
            >
              <Coins className="w-3.5 h-3.5" />
              <span>Outstanding Deliverables Awaiting Payment</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                activeTabFilter === 'outstanding' ? 'bg-white/30 text-white' : 'bg-amber-100 text-amber-800'
              }`}>
                {outstandingTasks.length}
              </span>
            </button>
          </div>

          <span className="text-[11px] text-slate-500 hidden sm:inline">
            {activeTabFilter === 'vault'
              ? <span>Click <strong>"Send via WhatsApp"</strong> on any row to dispatch payment details</span>
              : <span>Click <strong>"+ Settle / Paste SMS"</strong> to clear outstanding payouts</span>}
          </span>
        </div>

        {activeTabFilter === 'outstanding' ? (
          <div>
            {outstandingTasks.length === 0 ? (
              <div className="p-12 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <h5 className="text-sm font-bold text-slate-800">All deliverables have been settled!</h5>
                  <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                    There are no outstanding payouts pending clearance. Great job!
                  </p>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse font-sans">
                  <thead>
                    <tr className="border-b border-slate-200 bg-amber-50/70 text-[10px] font-black uppercase font-mono tracking-wider text-amber-900">
                      <th className="p-3 pl-4">Creator Name</th>
                      <th className="p-3">Deliverable / Product</th>
                      <th className="p-3">Planned Date</th>
                      <th className="p-3 text-right">Outstanding Amount (₹)</th>
                      <th className="p-3 text-center">Status</th>
                      <th className="p-3 pr-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-amber-100/50">
                    {outstandingTasks.map((task) => {
                      const inf = resolveInfluencer(task.influencerId, (task as any).influencerName);
                      const creatorName = (task as any).influencerName || inf?.name || 'Creator';
                      const mobile = cleanSingleMobileForStorage((task as any).influencerMobile || inf?.mobile || getKnownMobile(creatorName));
                      const amt = Number(task.billedAmount !== undefined && task.billedAmount > 0 ? task.billedAmount : (task.remuneration || 0));

                      return (
                        <tr key={task.id} className="hover:bg-amber-50/40 transition">
                          <td className="p-3 pl-4">
                            <div className="font-bold text-slate-800">{creatorName}</div>
                            {mobile && (
                              <div className="text-[10px] font-mono text-slate-400">+{formatDisplayPhone(mobile)}</div>
                            )}
                          </td>
                          <td className="p-3">
                            <div className="font-bold text-slate-700">{task.title || task.product || 'Deliverable'}</div>
                            <div className="text-[10px] font-mono text-slate-400">ID: {task.videoId || (task.id ? task.id.slice(-6) : '-')}</div>
                          </td>
                          <td className="p-3 font-mono text-slate-600">
                            {formatDateToDMY(task.releaseDate || task.deadline) || 'No date set'}
                          </td>
                          <td className="p-3 text-right font-black font-mono text-amber-700 text-sm">
                            ₹{amt.toLocaleString('en-IN')}
                          </td>
                          <td className="p-3 text-center">
                            <span className="inline-flex items-center gap-1 text-[9px] font-mono font-bold bg-amber-100 text-amber-800 border border-amber-300 px-2 py-0.5 rounded-full">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                              OUTSTANDING
                            </span>
                          </td>
                          <td className="p-3 pr-4 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedCreatorName(creatorName);
                                setFormAmount(amt || '');
                                setSelectedTaskId(task.id);
                                if (mobile) setFormMobile(mobile);
                                setIsAddBoxOpen(true);
                                window.scrollTo({ top: 100, behavior: 'smooth' });
                                globalToast.info(`Enter or paste bank message to settle payment for ${creatorName}`);
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white rounded-lg text-xs font-black font-mono shadow-xs transition cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Settle / Paste SMS</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <div>

        {filteredRecords.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
              <CreditCard className="w-6 h-6" />
            </div>
            <div>
              <h5 className="text-sm font-bold text-slate-700">No payment records found</h5>
              <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
                Paste bank transfer receipt or SMS message directly on this page to automatically collect payment details, or click below.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setIsAddBoxOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white rounded-xl text-xs font-bold font-mono transition cursor-pointer shadow-sm"
              >
                <Sparkles className="w-4 h-4 text-yellow-300" /> Paste Bank Message / Transfer Receipt (Auto-Collect)
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    const text = await navigator.clipboard.readText();
                    if (text && text.trim()) {
                      setIsAddBoxOpen(true);
                      handleProcessPastedBankMessage(text, true);
                    } else {
                      setIsAddBoxOpen(true);
                      globalToast.info('Clipboard is empty.');
                    }
                  } catch {
                    setIsAddBoxOpen(true);
                    globalToast.info('Please paste bank message directly into the box.');
                  }
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-bold font-mono transition cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" /> Paste from Clipboard
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-100/70 text-[10px] font-black uppercase font-mono tracking-wider text-slate-600">
                  <th className="p-3 pl-4">Creator / Deliverable</th>
                  <th className="p-3">Amount (₹)</th>
                  <th className="p-3">UTR / Reference ID</th>
                  <th className="p-3">Payment Mode</th>
                  <th className="p-3">Date</th>
                  <th className="p-3">Bank / UPI</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3 pr-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRecords.map((record) => {
                  const inf = resolveInfluencer(record.influencerId, record.creatorName);
                  const effectiveMobile = cleanSingleMobileForStorage(record.mobile || inf?.mobile || getKnownMobile(record.creatorName) || '');
                  const isSent = record.status === 'Sent_WhatsApp';
                  const isNew = record.id === lastAddedRecordId;

                  return (
                    <tr key={record.id} className={`${isNew ? 'bg-emerald-50/90 ring-2 ring-emerald-400' : 'hover:bg-slate-50/80'} transition duration-150`}>
                      {/* Creator & Deliverable */}
                      <td className="p-3 pl-4 align-top">
                        <div className="flex items-start gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
                            {record.creatorName.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                              <span>{record.creatorName}</span>
                              {record.videoId && (
                                <span className="text-[10px] font-mono bg-blue-50 text-blue-700 px-1.5 py-0.2 rounded border border-blue-200">
                                  {record.videoId}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                              {effectiveMobile ? (
                                <span className="font-mono text-slate-600 flex items-center gap-0.5">
                                  <Phone className="w-2.5 h-2.5 text-slate-400" />
                                  {formatDisplayPhone(effectiveMobile)}
                                </span>
                              ) : (
                                <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.2 rounded font-medium">
                                  Missing Mobile
                                </span>
                              )}
                              {record.productName && (
                                <>
                                  <span className="text-slate-300">•</span>
                                  <span className="truncate max-w-[140px]" title={record.productName}>
                                    {record.productName}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Amount */}
                      <td className="p-3 align-top">
                        <div className="font-mono font-black text-xs text-emerald-700 bg-emerald-50/70 border border-emerald-200 px-2 py-1 rounded-lg w-fit shadow-2xs">
                          ₹{(record.amount || 0).toLocaleString('en-IN')}
                        </div>
                      </td>

                      {/* UTR / Reference */}
                      <td className="p-3 align-top">
                        {record.utrReference ? (
                          <div className="flex items-center gap-1">
                            <span className="font-mono text-xs font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                              {record.utrReference}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopyUtr(record.utrReference)}
                              className="p-1 text-slate-400 hover:text-slate-700 rounded transition cursor-pointer"
                              title="Copy UTR to clipboard"
                            >
                              {copiedUtr === record.utrReference ? (
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[11px] italic">No UTR</span>
                        )}
                        {record.rawPastedMessage && (
                          <div className="mt-1">
                            <span 
                              className="text-[9px] font-mono font-bold bg-amber-50 text-amber-800 border border-amber-200 px-1.5 py-0.5 rounded cursor-help"
                              title={record.rawPastedMessage}
                            >
                              Auto-Captured SMS
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Payment Mode */}
                      <td className="p-3 align-top">
                        <span className="text-[11px] font-medium text-slate-700 bg-slate-100/80 px-2 py-0.5 rounded-md border border-slate-200/80 whitespace-nowrap">
                          {record.paymentMode || 'Bank Transfer'}
                        </span>
                      </td>

                      {/* Date */}
                      <td className="p-3 align-top">
                        <div className="font-mono text-[11px] text-slate-600 flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          <span>{formatDateToDMY(record.paymentDate) || '—'}</span>
                        </div>
                      </td>

                      {/* Bank / UPI */}
                      <td className="p-3 align-top">
                        <div className="text-[11px] space-y-0.5">
                          {(record.bankName || inf?.bankDetails?.bankName) && (
                            <div className="font-semibold text-slate-700">
                              🏛️ {record.bankName || inf?.bankDetails?.bankName} {(record.accountLast4 || (inf?.bankDetails?.accountNumber ? String(inf.bankDetails.accountNumber).slice(-4) : '')) ? `(****${record.accountLast4 || String(inf?.bankDetails?.accountNumber).slice(-4)})` : ''}
                            </div>
                          )}
                          {(record.upiId || inf?.bankDetails?.upiId) && (
                            <div className="font-mono text-[10px] text-indigo-700">
                              ⚡ {record.upiId || inf?.bankDetails?.upiId}
                            </div>
                          )}
                          {!record.bankName && !inf?.bankDetails?.bankName && !record.upiId && !inf?.bankDetails?.upiId && (
                            <span className="text-slate-400 italic">Direct Deposit</span>
                          )}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="p-3 align-top text-center">
                        {isSent ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold font-mono bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Sent via WhatsApp
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium font-mono bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded-full">
                            Auto-Saved
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="p-3 pr-4 align-top text-right">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          {/* Primary WhatsApp Send / Re-Send Button */}
                          <button
                            type="button"
                            onClick={() => handleDirectSendWhatsApp(record)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-lg text-[11px] font-bold font-mono shadow-xs transition cursor-pointer"
                            title="Send payment details to creator via WhatsApp automatically"
                          >
                            <Send className="w-3 h-3" />
                            <span>{isSent ? 'Re-send' : 'Send WhatsApp'}</span>
                          </button>

                          {/* Preview / Customize Button */}
                          <button
                            type="button"
                            onClick={() => handleOpenSendModal(record)}
                            className="p-1 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg border border-slate-200 transition cursor-pointer"
                            title="Preview and edit message draft before sending"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                          </button>

                          {/* Copy WhatsApp Text */}
                          <button
                            type="button"
                            onClick={() => handleCopyDraft(record)}
                            className="p-1 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg border border-slate-200 transition cursor-pointer"
                            title="Copy full WhatsApp message"
                          >
                            {copiedDraftId === record.id ? (
                              <Check className="w-3.5 h-3.5 text-blue-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>

                          {/* Edit Details */}
                          <button
                            type="button"
                            onClick={() => setEditingRecord({ ...record })}
                            className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg border border-slate-200 transition cursor-pointer"
                            title="Edit payment details"
                          >
                            <FileText className="w-3.5 h-3.5" />
                          </button>

                          {/* Delete */}
                          <button
                            type="button"
                            onClick={() => handleDeleteRecord(record)}
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                            title="Delete this record"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
          </div>
        )}
      </div>

      {/* WhatsApp Send & Customization Modal */}
      {activeSendRecord && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="p-4 bg-gradient-to-r from-emerald-600 to-teal-700 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-white/20 rounded-lg">
                  <Send className="w-4 h-4 text-white" />
                </span>
                <div>
                  <h3 className="font-black text-sm">Send Payment Details via WhatsApp</h3>
                  <p className="text-[11px] text-emerald-100">
                    Recipient: <strong>{activeSendRecord.creatorName}</strong> • ₹{(activeSendRecord.amount || 0).toLocaleString('en-IN')}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveSendRecord(null)}
                className="p-1 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-4 space-y-3.5 overflow-y-auto">
              {/* Recipient Phone input */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1.5">
                <label className="text-[11px] font-bold text-slate-700 uppercase flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-emerald-600" />
                  <span>WhatsApp Mobile Number:</span>
                </label>
                <input
                  type="text"
                  value={editableMobile}
                  onChange={(e) => setEditableMobile(e.target.value)}
                  placeholder="e.g. 9876543210"
                  className="w-full text-xs font-mono font-bold bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 focus:border-emerald-500 outline-none"
                />
              </div>

              {/* Language and Template selector */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setSendModalLang('en');
                      setCustomMessageDraft(generateMessageText(activeSendRecord, sendModalTemplate, 'en'));
                    }}
                    className={`px-2.5 py-1 rounded-md font-bold transition ${sendModalLang === 'en' ? 'bg-white text-emerald-700 shadow-2xs' : 'text-slate-600'}`}
                  >
                    English
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSendModalLang('as');
                      setCustomMessageDraft(generateMessageText(activeSendRecord, sendModalTemplate, 'as'));
                    }}
                    className={`px-2.5 py-1 rounded-md font-bold transition ${sendModalLang === 'as' ? 'bg-white text-emerald-700 shadow-2xs' : 'text-slate-600'}`}
                  >
                    অসমীয়া (Assamese)
                  </button>
                </div>

                <select
                  value={sendModalTemplate}
                  onChange={(e) => {
                    const tmpl = e.target.value as BillWhatsAppTemplate;
                    setSendModalTemplate(tmpl);
                    setCustomMessageDraft(generateMessageText(activeSendRecord, tmpl, sendModalLang));
                  }}
                  className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 font-semibold text-slate-700 outline-none cursor-pointer"
                >
                  <option value="payment_details">Template: Standard Payment Details</option>
                  <option value="bill_checklist">Template: Checklist & Bill Approved + Payment</option>
                  <option value="payment_cleared">Template: Clearance Notice</option>
                  <option value="payment_check">Template: Payment Confirmation Check</option>
                </select>
              </div>

              {/* Message Draft Preview / Editable */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <label className="font-bold text-slate-700">Message Preview (Editable):</label>
                  <span className="text-[10px] text-slate-400 font-mono">{customMessageDraft.length} chars</span>
                </div>
                <textarea
                  rows={8}
                  value={customMessageDraft}
                  onChange={(e) => setCustomMessageDraft(e.target.value)}
                  className="w-full text-xs font-mono bg-slate-50 border border-slate-300 rounded-xl p-3 focus:bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none leading-relaxed"
                />
              </div>

              {/* Note about website in header */}
              <div className="bg-emerald-50/70 border border-emerald-200 rounded-lg p-2.5 text-[11px] text-emerald-800 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  Company branding with official website is automatically attached to the <strong>header</strong> at the top of the message when opened in WhatsApp.
                </span>
              </div>
            </div>

            {/* Footer */}
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setActiveSendRecord(null)}
                className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-bold transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmModalSend}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-lg text-xs font-bold font-mono transition shadow-sm cursor-pointer flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Open in WhatsApp</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Payment Record Modal */}
      {editingRecord && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 bg-slate-800 text-white flex items-center justify-between">
              <h3 className="font-black text-sm flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-emerald-400" /> Edit Payment Details
              </h3>
              <button
                type="button"
                onClick={() => setEditingRecord(null)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-600 uppercase">Creator Name</label>
                  <input
                    type="text"
                    value={editingRecord.creatorName}
                    onChange={(e) => setEditingRecord({ ...editingRecord, creatorName: e.target.value })}
                    className="w-full text-xs font-bold bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-600 uppercase">Amount (₹)</label>
                  <input
                    type="number"
                    value={editingRecord.amount}
                    onChange={(e) => setEditingRecord({ ...editingRecord, amount: Number(e.target.value) })}
                    className="w-full text-xs font-mono font-bold bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-600 uppercase">UTR / Reference ID</label>
                  <input
                    type="text"
                    value={editingRecord.utrReference}
                    onChange={(e) => setEditingRecord({ ...editingRecord, utrReference: e.target.value })}
                    className="w-full text-xs font-mono bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-600 uppercase">Payment Mode</label>
                  <input
                    type="text"
                    value={editingRecord.paymentMode}
                    onChange={(e) => setEditingRecord({ ...editingRecord, paymentMode: e.target.value })}
                    className="w-full text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-600 uppercase">Payment Date</label>
                  <input
                    type="text"
                    value={editingRecord.paymentDate}
                    onChange={(e) => setEditingRecord({ ...editingRecord, paymentDate: e.target.value })}
                    className="w-full text-xs font-mono bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-600 uppercase">WhatsApp Mobile</label>
                  <input
                    type="text"
                    value={editingRecord.mobile || ''}
                    onChange={(e) => setEditingRecord({ ...editingRecord, mobile: e.target.value })}
                    className="w-full text-xs font-mono bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-600 uppercase">Bank Name</label>
                  <input
                    type="text"
                    value={editingRecord.bankName || ''}
                    onChange={(e) => setEditingRecord({ ...editingRecord, bankName: e.target.value })}
                    className="w-full text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-600 uppercase">A/C Last 4</label>
                  <input
                    type="text"
                    value={editingRecord.accountLast4 || ''}
                    onChange={(e) => setEditingRecord({ ...editingRecord, accountLast4: e.target.value })}
                    className="w-full text-xs font-mono bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingRecord(null)}
                className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-bold transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEditedRecord}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold font-mono transition shadow-sm cursor-pointer"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal (In-App Dialog, robust in iframes) */}
      {recordToDelete && (
        <div 
          className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setRecordToDelete(null)}
        >
          <div 
            className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center font-bold shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-slate-900">Delete Payment Record?</h4>
                <p className="text-xs text-slate-500">
                  {recordToDelete.creatorName} • ₹{(recordToDelete.amount || 0).toLocaleString('en-IN')}
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to delete this payment record{recordToDelete.utrReference ? ` (UTR: ${recordToDelete.utrReference})` : ''}? It will be permanently removed from your saved records and vault.
            </p>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setRecordToDelete(null)}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg cursor-pointer transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => confirmDelete(recordToDelete)}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold font-mono rounded-lg cursor-pointer flex items-center gap-1.5 transition shadow-sm"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Record</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
