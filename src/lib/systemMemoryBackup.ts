import { Influencer, Campaign, Task, Message, Contract, BillingEntry, ProductConfig } from '../types';
import { safeLocalStorage } from './safeLocalStorage';

export interface SystemMemoryBackupPayload {
  influencers: Influencer[];
  campaigns: Campaign[];
  tasks: Task[];
  messages: Message[];
  contracts: Contract[];
  billingEntries: BillingEntry[];
  dashboardProducts: ProductConfig[];
  savedProducts: string[];
  selectedMonth: string;
  selectedYear: string;
  monthlyTargets?: any[];
  aovEntries?: any[];
  notebookNotes?: any[];
  monthlyBudgets?: any[];
  timestamp: string;
  type: 'manual' | 'auto';
}

// Secure in-memory snapshot cache (RAM resident)
let memorySnapshots: SystemMemoryBackupPayload[] = (() => {
  try {
    const fallback = safeLocalStorage.getItem('SYS_MEMORY_LAST_RECOVERY_RESERVE');
    if (fallback) {
      const snap = JSON.parse(fallback);
      if (snap && typeof snap === 'object') {
        return [snap];
      }
    }
  } catch (e) {
    console.warn('[SystemMemoryBackup] Failed to parse initial backup fallback:', e);
  }
  return [];
})();
const MAX_SNAPSHOTS = 20;

// Settings (default loaded safely)
let autoSaveIntervalSeconds = parseInt(safeLocalStorage.getItem('SYS_MEMORY_AUTOSAVE_INTERVAL') || '30', 10);
let isAutoSaveEnabled = safeLocalStorage.getItem('SYS_MEMORY_AUTOSAVE_ENABLED') !== 'false';

export const getSystemMemorySnapshots = (): SystemMemoryBackupPayload[] => {
  return [...memorySnapshots];
};

export const clearSystemMemorySnapshots = () => {
  memorySnapshots = [];
};

/**
 * Saves a new data state snapshot securely in system memory
 */
export const saveToSystemMemory = (
  payload: Omit<SystemMemoryBackupPayload, 'timestamp' | 'type'>,
  type: 'manual' | 'auto'
): SystemMemoryBackupPayload => {
  const timestamp = new Date().toLocaleTimeString([], { 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit' 
  }) + ` (${new Date().toLocaleDateString('en-GB')})`;

  const newSnapshot: SystemMemoryBackupPayload = {
    ...payload,
    timestamp,
    type
  };

  // Add to front of array
  memorySnapshots = [newSnapshot, ...memorySnapshots].slice(0, MAX_SNAPSHOTS);
  
  // Optionally, also save to a secure backup key in localStorage just in case of complete tab crash
  try {
    safeLocalStorage.setItem('SYS_MEMORY_LAST_RECOVERY_RESERVE', JSON.stringify(newSnapshot));
  } catch (err) {
    console.warn('LocalStorage backup sync warning:', err);
  }

  return newSnapshot;
};

/**
 * Retreives the latest system memory snapshot
 */
export const getLatestSystemMemorySnapshot = (): SystemMemoryBackupPayload | null => {
  if (memorySnapshots.length > 0) {
    return memorySnapshots[0];
  }
  // Try recovery reserve
  const fallback = safeLocalStorage.getItem('SYS_MEMORY_LAST_RECOVERY_RESERVE');
  if (fallback) {
    try {
      return JSON.parse(fallback);
    } catch (e) {
      return null;
    }
  }
  return null;
};

// Config get/set
export const getAutoSaveInterval = () => autoSaveIntervalSeconds;
export const setAutoSaveInterval = (seconds: number) => {
  autoSaveIntervalSeconds = seconds;
  safeLocalStorage.setItem('SYS_MEMORY_AUTOSAVE_INTERVAL', seconds.toString());
};

export const getAutoSaveEnabled = () => isAutoSaveEnabled;
export const setAutoSaveEnabled = (enabled: boolean) => {
  isAutoSaveEnabled = enabled;
  safeLocalStorage.setItem('SYS_MEMORY_AUTOSAVE_ENABLED', enabled ? 'true' : 'false');
};
