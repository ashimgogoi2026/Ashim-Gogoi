import { safeLocalStorage } from './safeLocalStorage';

export interface PaymentRecord {
  id: string;
  taskId?: string;
  influencerId?: string;
  creatorName: string;
  productName?: string;
  campaignName?: string;
  videoId?: string;
  videoLink?: string;
  mobile?: string;
  amount: number;
  utrReference: string;
  paymentMode: string;
  paymentDate: string;
  bankName?: string;
  accountLast4?: string;
  upiId?: string;
  includeBankDetails?: boolean;
  rawPastedMessage?: string;
  notes?: string;
  status: 'Saved' | 'Sent_WhatsApp' | 'Completed';
  lastSentAt?: string;
  createdAt: string;
  updatedAt: string;
}

const STORAGE_KEY = 'BILLING_PAYMENT_DETAILS_STORE';
const DELETED_KEY = 'BILLING_DELETED_PAYMENT_IDS';
const EVENT_NAME = 'payment-details-updated';

/**
 * Gets set of explicitly deleted payment record or task IDs.
 */
export function getDeletedPaymentIds(): Set<string> {
  try {
    const raw = safeLocalStorage.getItem(DELETED_KEY) || (typeof window !== 'undefined' ? localStorage.getItem(DELETED_KEY) : null);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

/**
 * Marks an ID or task ID as explicitly deleted so it won't re-emerge from task lists.
 */
export function markPaymentIdAsDeleted(idOrTaskId?: string): void {
  if (!idOrTaskId) return;
  const current = getDeletedPaymentIds();
  current.add(idOrTaskId);
  const arr = Array.from(current);
  const json = JSON.stringify(arr);
  safeLocalStorage.setItem(DELETED_KEY, json);
  if (typeof window !== 'undefined') {
    try { localStorage.setItem(DELETED_KEY, json); } catch {}
  }
}

/**
 * Clears an ID from the deleted set if it's being re-saved.
 */
export function unmarkPaymentIdAsDeleted(idOrTaskId?: string): void {
  if (!idOrTaskId) return;
  const current = getDeletedPaymentIds();
  if (current.has(idOrTaskId)) {
    current.delete(idOrTaskId);
    const arr = Array.from(current);
    const json = JSON.stringify(arr);
    safeLocalStorage.setItem(DELETED_KEY, json);
    if (typeof window !== 'undefined') {
      try { localStorage.setItem(DELETED_KEY, json); } catch {}
    }
  }
}

/**
 * Loads stored payment records from persistent local storage.
 */
export function loadStoredPayments(): PaymentRecord[] {
  try {
    const raw = safeLocalStorage.getItem(STORAGE_KEY) || (typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const deletedIds = getDeletedPaymentIds();
      return parsed
        .filter(r => {
          if (deletedIds.has(r.id)) return false;
          if (r.taskId && (deletedIds.has(r.taskId) || deletedIds.has(`task_pay_${r.taskId}`))) return false;
          if (r.utrReference && deletedIds.has(`utr_${r.utrReference.trim().toLowerCase()}`)) return false;
          return true;
        })
        .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());
    }
  } catch (err) {
    console.warn('[PaymentDetailsStore] Failed to load payment records:', err);
  }
  return [];
}

/**
 * Saves payment records to persistent storage and dispatches update event.
 */
export function saveStoredPayments(records: PaymentRecord[]): void {
  try {
    const json = JSON.stringify(records);
    safeLocalStorage.setItem(STORAGE_KEY, json);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, json);
      } catch {}
      window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: records }));
    }
  } catch (err) {
    console.warn('[PaymentDetailsStore] Failed to save payment records:', err);
  }
}

/**
 * Subscribes to updates from the payment details store.
 */
export function subscribeToPaymentUpdates(callback: (records: PaymentRecord[]) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (event: Event) => {
    const custom = event as CustomEvent<PaymentRecord[]>;
    if (custom.detail) {
      callback(custom.detail);
    } else {
      callback(loadStoredPayments());
    }
  };
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}

/**
 * Upserts a payment record into the store.
 * If record matching taskId or (creatorName + utrReference) exists, it updates it.
 * Otherwise creates a new record.
 */
export function upsertPaymentRecord(data: Partial<PaymentRecord> & { creatorName: string; amount?: number }): PaymentRecord {
  const current = loadStoredPayments();
  const now = new Date().toISOString();

  // Try to find matching record
  const index = current.findIndex(r => {
    if (data.id && r.id === data.id) return true;
    if (data.taskId && r.taskId && r.taskId === data.taskId) return true;
    if (data.utrReference && r.utrReference && r.utrReference.trim().toLowerCase() === data.utrReference.trim().toLowerCase()) {
      if (data.creatorName && r.creatorName && r.creatorName.trim().toLowerCase() === data.creatorName.trim().toLowerCase()) {
        return true;
      }
    }
    return false;
  });

  let record: PaymentRecord;

  if (index >= 0) {
    record = {
      ...current[index],
      ...data,
      amount: data.amount !== undefined ? data.amount : current[index].amount,
      utrReference: data.utrReference || current[index].utrReference || '',
      paymentMode: data.paymentMode || current[index].paymentMode || 'Bank Transfer (NEFT/IMPS)',
      paymentDate: data.paymentDate || current[index].paymentDate || new Date().toLocaleDateString('en-GB'),
      status: data.status || current[index].status || 'Saved',
      updatedAt: now,
    };
    current[index] = record;
  } else {
    record = {
      id: data.id || `pay_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      taskId: data.taskId,
      influencerId: data.influencerId,
      creatorName: data.creatorName || 'Creator',
      productName: data.productName || '',
      campaignName: data.campaignName || '',
      videoId: data.videoId || '',
      videoLink: data.videoLink || '',
      mobile: data.mobile || '',
      amount: Number(data.amount) || 0,
      utrReference: data.utrReference || '',
      paymentMode: data.paymentMode || 'Bank Transfer (NEFT/IMPS)',
      paymentDate: data.paymentDate || new Date().toLocaleDateString('en-GB'),
      bankName: data.bankName || '',
      accountLast4: data.accountLast4 || '',
      upiId: data.upiId || '',
      includeBankDetails: data.includeBankDetails !== undefined ? data.includeBankDetails : true,
      rawPastedMessage: data.rawPastedMessage || '',
      notes: data.notes || '',
      status: data.status || 'Saved',
      lastSentAt: data.lastSentAt,
      createdAt: now,
      updatedAt: now,
    };
    current.unshift(record);
  }

  if (data.id) unmarkPaymentIdAsDeleted(data.id);
  if (data.taskId) {
    unmarkPaymentIdAsDeleted(data.taskId);
    unmarkPaymentIdAsDeleted(`task_pay_${data.taskId}`);
  }
  if (data.utrReference && data.utrReference.trim()) {
    unmarkPaymentIdAsDeleted(`utr_${data.utrReference.trim().toLowerCase()}`);
  }

  saveStoredPayments(current);
  return record;
}

/**
 * Removes a payment record by ID, and marks taskId or related ID as deleted.
 */
export function deleteStoredPayment(
  id: string, 
  taskId?: string, 
  utrReference?: string, 
  creatorName?: string
): void {
  // 1. Mark primary IDs in deleted set
  markPaymentIdAsDeleted(id);
  if (id.startsWith('task_pay_')) {
    markPaymentIdAsDeleted(id.replace('task_pay_', ''));
  }
  if (taskId) {
    markPaymentIdAsDeleted(taskId);
    markPaymentIdAsDeleted(`task_pay_${taskId}`);
  }
  if (utrReference && utrReference.trim()) {
    markPaymentIdAsDeleted(`utr_${utrReference.trim().toLowerCase()}`);
  }

  const cleanUtr = utrReference?.trim().toLowerCase();
  const cleanCreator = creatorName?.trim().toLowerCase();

  // 2. Load all raw items directly from storage (bypassing filter to ensure complete cleanup)
  let all: PaymentRecord[] = [];
  try {
    const raw = safeLocalStorage.getItem(STORAGE_KEY) || (typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) all = parsed;
    }
  } catch {}

  // 3. Remove any record that matches the ID, taskId, or (UTR + creator)
  const remaining = all.filter(r => {
    if (r.id === id) return false;
    if (taskId && r.taskId === taskId) return false;
    if (id.startsWith('task_pay_') && r.taskId === id.replace('task_pay_', '')) return false;
    if (cleanUtr && r.utrReference && r.utrReference.trim().toLowerCase() === cleanUtr) {
      if (!cleanCreator || !r.creatorName || r.creatorName.trim().toLowerCase() === cleanCreator) {
        return false;
      }
    }
    return true;
  });

  saveStoredPayments(remaining);
}

/**
 * Marks a payment record as sent via WhatsApp.
 */
export function markPaymentAsSent(id: string): void {
  const current = loadStoredPayments();
  const item = current.find(r => r.id === id);
  if (item) {
    item.status = 'Sent_WhatsApp';
    item.lastSentAt = new Date().toISOString();
    item.updatedAt = new Date().toISOString();
    saveStoredPayments(current);
  }
}
