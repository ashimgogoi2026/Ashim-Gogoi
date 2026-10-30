import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, Undo2, Save, Clock, Trash2, HelpCircle, CheckCircle2, AlertCircle, HardDrive, Server, FileJson, ArrowDownToLine, RefreshCw, FileSpreadsheet
} from 'lucide-react';
import { Influencer, Campaign, Task, Message, Contract, BillingEntry, ProductConfig } from '../types';
import { safeLocalStorage } from '../lib/safeLocalStorage';
import { 
  getSystemMemorySnapshots, 
  saveToSystemMemory, 
  getLatestSystemMemorySnapshot, 
  getAutoSaveInterval, 
  setAutoSaveInterval, 
  getAutoSaveEnabled, 
  setAutoSaveEnabled,
  SystemMemoryBackupPayload
} from '../lib/systemMemoryBackup';

import GoogleSheetsExtractor from './GoogleSheetsExtractor';
import MemoryQuotaTracker from './MemoryQuotaTracker';

interface SystemMemorySafeguardProps {
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
  user?: any;
  accessToken?: string | null;
  onLoginSuccess?: (user: any, token: string) => void;
  onLogoutSuccess?: () => void;
  onRestoreData: (restoredData: any) => void;
}

interface ServerBackupItem {
  filename: string;
  timestamp: string;
  isoTimestamp: string;
  type: 'manual' | 'auto';
  itemCounts: {
    influencers: number;
    campaigns: number;
    tasks: number;
    contracts: number;
    billingEntries: number;
    dashboardProducts: number;
  };
  selectedMonth: string;
  selectedYear: string;
}

export default function SystemMemorySafeguard({
  influencers,
  campaigns,
  tasks,
  messages,
  contracts,
  billingEntries,
  dashboardProducts,
  savedProducts,
  selectedMonth,
  selectedYear,
  monthlyTargets = [],
  aovEntries = [],
  notebookNotes = [],
  user,
  accessToken,
  onLoginSuccess = () => {},
  onLogoutSuccess = () => {},
  onRestoreData
}: SystemMemorySafeguardProps) {
  // Tabs active selectors
  const [activeTab, setActiveTab] = useState<'ram_memory' | 'server_disk' | 'google_sheets'>('server_disk');

  // Memory Safeguard Config state
  const [isAutoEnabled, setIsAutoEnabled] = useState(getAutoSaveEnabled());
  const [isServerBackupEnabled, setIsServerBackupEnabled] = useState(() => {
    return safeLocalStorage.getItem('SYS_SERVER_AUTOSAVE_ENABLED') !== 'false';
  });
  const [intervalSecs, setIntervalSecs] = useState(getAutoSaveInterval());
  const [snapshots, setSnapshots] = useState<SystemMemoryBackupPayload[]>([]);
  const [countdown, setCountdown] = useState<number>(intervalSecs);

  // Server-disk backups state
  const [serverBackups, setServerBackups] = useState<ServerBackupItem[]>([]);
  const [isFetchingServer, setIsFetchingServer] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // Action status indicators
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [isPerformingAction, setIsPerformingAction] = useState(false);

  // Custom visual Dialog and Warning indicators
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
    type: 'danger' | 'warning' | 'info';
  }>({
    isOpen: false,
    title: '',
    description: '',
    onConfirm: () => {},
    type: 'info'
  });

  const askConfirmation = (
    title: string,
    description: string,
    onConfirm: () => void,
    type: 'danger' | 'warning' | 'info' = 'info'
  ) => {
    setConfirmModal({
      isOpen: true,
      title,
      description,
      onConfirm,
      type
    });
  };

  // Load available RAM snapshots & Server filesystem list
  const refreshMemorySnapshots = () => {
    setSnapshots(getSystemMemorySnapshots());
  };

  const fetchServerBackupsList = async () => {
    setIsFetchingServer(true);
    setServerError(null);
    try {
      const res = await fetch('/api/server-backups', {
        headers: {
          'Accept': 'application/json'
        }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setServerBackups(data.backups || []);
      } else {
        setServerError(data.error || 'Could not fetch backups stored on system.');
      }
    } catch (err: any) {
      setServerError(err?.message || 'Failed to communicate with Express server endpoints.');
    } finally {
      setIsFetchingServer(false);
    }
  };

  // On mount: load everything
  useEffect(() => {
    refreshMemorySnapshots();
    fetchServerBackupsList();
  }, []);

  // Ticker for in-memory & optionally server-disk auto-saves
  useEffect(() => {
    if (!isAutoEnabled) return;

    setCountdown(intervalSecs);
    
    const intervalId = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          triggerBackup('auto');
          return intervalSecs;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(intervalId);
  }, [
    isAutoEnabled, intervalSecs, influencers, campaigns, tasks, messages, 
    contracts, billingEntries, dashboardProducts, savedProducts, selectedMonth, selectedYear, isServerBackupEnabled, monthlyTargets, aovEntries, notebookNotes
  ]);

  // Unified backup trigger logic
  const triggerBackup = async (type: 'manual' | 'auto') => {
    setIsPerformingAction(true);
    const payload = {
      influencers,
      campaigns,
      tasks,
      messages,
      contracts,
      billingEntries,
      dashboardProducts,
      savedProducts,
      selectedMonth,
      selectedYear,
      monthlyTargets,
      aovEntries,
      notebookNotes
    };
    
    // 1. RAM snapshot capture
    saveToSystemMemory(payload, type);
    refreshMemorySnapshots();

    // 2. Server Disk snapshot capture (if triggered manually OR if server replication is enabled in auto mode)
    let serverBackupSuccess = false;
    if (type === 'manual' || isServerBackupEnabled) {
      try {
        const response = await fetch('/api/server-backup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ payload, type })
        });
        const data = await response.json();
        if (response.ok && data.success) {
          serverBackupSuccess = true;
          fetchServerBackupsList();
        }
      } catch (err) {
        console.warn('[System Safeguard] Background server file-write warning:', err);
      }
    }

    setIsPerformingAction(false);

    if (type === 'manual') {
      if (serverBackupSuccess) {
        showFeedback('Full database and Monthly Planner backed up securely to Server Disk & RAM!');
      } else {
        showFeedback('Manual backup saved safely in local RAM space.');
      }
    } else {
      if (isServerBackupEnabled && serverBackupSuccess) {
        showFeedback('Background auto-save synchronized to Server Host & RAM!');
      } else {
        showFeedback('Background system memory state auto-saved.');
      }
    }
  };

  const showFeedback = (msg: string) => {
    setFeedbackMsg(msg);
    setTimeout(() => setFeedbackMsg(null), 4000);
  };

  // Restore snapshots from RAM Memory
  const handleRestoreRAMSnapshot = (snapshot: SystemMemoryBackupPayload) => {
    askConfirmation(
      'Restore RAM Snapshot',
      `Are you sure you want to restore active campaign databases to RAM snapshot captured at ${snapshot.timestamp}? This will overwrite your current progress.`,
      async () => {
        setIsPerformingAction(true);
        try {
          await onRestoreData(snapshot);
          showFeedback('System progress restored successfully from browser RAM memory cache!');
        } catch (err: any) {
          showFeedback(`Err: Recovery failed: ${err?.message || err}`);
        } finally {
          setIsPerformingAction(false);
        }
      },
      'warning'
    );
  };

  // Restore snapshots from physical Server Storage File
  const handleRestoreServerFile = (item: ServerBackupItem) => {
    askConfirmation(
      'Restore Host Backup File',
      `ATTENTION: You are about to download and restore progress from the host system file:\n"${item.filename}"\nCaptured at: ${item.timestamp}.\n\nThis will restore all creators, invoicing, contracts, and the Monthly Planner targets. Proceed?`,
      async () => {
        setIsPerformingAction(true);
        try {
          const res = await fetch('/api/server-restore', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: item.filename })
          });
          const data = await res.json();
          if (res.ok && data.success) {
            await onRestoreData(data.payload);
            showFeedback(`System state recovered successfully from server file: ${item.filename}`);
          } else {
            showFeedback(`Err: ${data.error || 'Server failed to deserialize target file.'}`);
          }
        } catch (err: any) {
          showFeedback(`Err: Recovery failed: ${err?.message || 'Host network error'}`);
        } finally {
          setIsPerformingAction(false);
        }
      },
      'warning'
    );
  };

  // Delete unwanted server backup files
  const handleDeleteServerFile = (item: ServerBackupItem) => {
    askConfirmation(
      'Permanently Delete Backup',
      `Permanently wipe this backup file from server disk?\nFilename: "${item.filename}"`,
      async () => {
        setIsPerformingAction(true);
        try {
          const res = await fetch('/api/server-delete-backup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: item.filename })
          });
          const data = await res.json();
          if (res.ok && data.success) {
            showFeedback(`Deleted backup file: ${item.filename}`);
            fetchServerBackupsList();
          } else {
            showFeedback(`Err: ${data.error || 'Could not erase file.'}`);
          }
        } catch (err: any) {
          showFeedback(`Err: Deletion failed: ${err?.message}`);
        } finally {
          setIsPerformingAction(false);
        }
      },
      'danger'
    );
  };

  // Hardware Local File Storage
  const handleDownloadLocalBackup = () => {
    const payload = {
      influencers,
      campaigns,
      tasks,
      messages,
      contracts,
      billingEntries,
      dashboardProducts,
      savedProducts,
      selectedMonth,
      selectedYear,
      monthlyTargets,
      aovEntries
    };
    
    const jsonString = JSON.stringify(payload, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const filename = `Influencer Manager_Safehouse_${new Date().toISOString().split('T')[0]}.json`;
    
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showFeedback('Data securely downloaded to your local device!');
  };

  const handleUploadLocalBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = JSON.parse(content);
        const payload = parsed.payload || parsed; // Support both structures
        
        if (!payload.influencers && !payload.campaigns) {
          throw new Error("Invalid backup document format.");
        }
        
        setIsPerformingAction(true);
        await onRestoreData(payload);
        showFeedback('Progress beautifully restored from your local file!');
      } catch (err: any) {
        showFeedback(`Failed to restore file: ${err.message || 'Corrupted file'}`);
      } finally {
        setIsPerformingAction(false);
        if (e.target) {
          e.target.value = ''; // Reset input to allow re-uploading same file
        }
      }
    };
    reader.readAsText(file);
  };

  // Manage in-memory settings toggles
  const handleToggleAutoSave = (checked: boolean) => {
    setIsAutoEnabled(checked);
    setAutoSaveEnabled(checked);
    showFeedback(checked ? 'Background save schedule activated!' : 'System background save halted!');
  };

  const handleToggleServerBackup = (checked: boolean) => {
    setIsServerBackupEnabled(checked);
    safeLocalStorage.setItem('SYS_SERVER_AUTOSAVE_ENABLED', checked ? 'true' : 'false');
    showFeedback(checked ? 'Auto-saves will write directly to both RAM and Server Disk!' : 'Auto-saves limited to local client memory.');
  };

  const handleIntervalChange = (val: number) => {
    setIntervalSecs(val);
    setAutoSaveInterval(val);
    setCountdown(val);
    showFeedback(`Background saving interval adjusted to ${val} seconds!`);
  };

  return (
    <div id="system-safeguard-container" className="bg-white rounded-2xl border border-gray-150 p-6 space-y-6 shadow-sm">
      
      {/* Safeguard Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-150 pb-5">
        <div className="flex items-center gap-2.5">
          <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100">
            <ShieldCheck className="w-6 h-6 stroke-[2]" />
          </div>
          <div>
            <h4 className="text-base font-black text-gray-900 tracking-tight uppercase font-sans flex items-center gap-1.5">
              <span>System Safeguard Safehouse</span>
              <span className="text-[10px] bg-red-100 text-red-700 font-bold px-1.5 py-0.5 rounded uppercase tracking-wider font-mono">
                Host-disk Backup
              </span>
            </h4>
            <p className="text-xs text-gray-400">
              Manual and automated state preservation engine storing data directly onto the server container disk & memory.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input 
            type="file" 
            id="local-file-upload" 
            accept=".json" 
            style={{ display: 'none' }} 
            onChange={handleUploadLocalBackup} 
          />
          <button
            type="button"
            onClick={() => document.getElementById('local-file-upload')?.click()}
            disabled={isPerformingAction}
            className="px-4 py-2 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Undo2 className={`w-3.5 h-3.5`} />
            <span>Restore Local JSON</span>
          </button>
          
          <button
            type="button"
            onClick={handleDownloadLocalBackup}
            disabled={isPerformingAction}
            className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-800 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowDownToLine className={`w-3.5 h-3.5`} />
            <span>Download Backup File</span>
          </button>

          <button
            type="button"
            onClick={fetchServerBackupsList}
            disabled={isPerformingAction || isFetchingServer}
            className="p-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-all tooltip"
            title="Refresh Server File List"
          >
            <RefreshCw className={`w-4 h-4 ${isFetchingServer ? 'animate-spin text-emerald-600' : ''}`} />
          </button>
          
          <button
            type="button"
            onClick={() => triggerBackup('manual')}
            disabled={isPerformingAction}
            className="px-4 py-2 bg-emerald-650 hover:bg-emerald-700 hover:shadow-md text-white text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Save className={`w-3.5 h-3.5 ${isPerformingAction ? 'animate-spin' : 'animate-pulse'}`} />
            <span>Capture Safehouse Backup</span>
          </button>
        </div>
      </div>

      {feedbackMsg && (
        <div className={`border text-[11px] font-semibold px-3.5 py-2.5 rounded-xl flex items-center gap-2 animate-bounce ${
          feedbackMsg.startsWith('Err:')
            ? 'bg-red-50 border-red-200 text-red-800'
            : 'bg-emerald-50 border-emerald-200 text-emerald-800'
        }`}>
          {feedbackMsg.startsWith('Err:') ? (
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          )}
          <span>{feedbackMsg.replace(/^Err:\s*/, '')}</span>
        </div>
      )}

      {/* Auto-save Adjustment Settings block */}
      <div className="p-4 bg-gray-55 rounded-xl border border-gray-150 grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Toggle Option */}
        <div className="space-y-2">
          <span className="text-[10px] font-bold text-gray-500 uppercase font-mono tracking-wider block">
            Automatic State Scheduler
          </span>
          <div className="flex items-center gap-3">
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                checked={isAutoEnabled}
                onChange={(e) => handleToggleAutoSave(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
            </label>
            <span className="text-xs font-bold text-gray-750">
              {isAutoEnabled ? 'Active and Running' : 'Halted'}
            </span>
            {isAutoEnabled && (
              <span className="text-[9px] font-mono font-bold text-gray-400 bg-white/70 px-1.5 py-0.5 rounded border border-gray-200 flex items-center gap-1">
                <Clock className="w-2.5 h-2.5 text-emerald-500 animate-spin" /> {countdown}s
              </span>
            )}
          </div>
        </div>

        {/* Server disk write replica permission */}
        <div className="space-y-2">
          <span className="text-[10px] font-bold text-gray-500 uppercase font-mono tracking-wider block">
            Automatic Server Replications
          </span>
          <div className="flex items-center gap-3">
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                checked={isServerBackupEnabled}
                onChange={(e) => handleToggleServerBackup(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
            </label>
            <span className="text-xs font-bold text-gray-750 flex items-center gap-1">
              {isServerBackupEnabled ? 'Enabled (Sever file is updated!)' : 'Disabled (RAM snapshots only)'}
            </span>
          </div>
        </div>

        {/* Dynamic Interval trigger targets */}
        <div className="space-y-2">
          <span className="text-[10px] font-bold text-gray-500 uppercase font-mono tracking-wider block">
            Adjustable Save Ticker Interval
          </span>
          <div className="flex flex-wrap gap-1.5">
            {[10, 30, 60, 180, 300].map((s) => {
              const label = s < 60 ? `${s}s` : `${s / 60}m`;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleIntervalChange(s)}
                  className={`px-2 py-1 text-[10px] font-extrabold rounded-md transition cursor-pointer border ${
                    intervalSecs === s
                      ? 'bg-emerald-650 text-white border-emerald-600 shadow-xs'
                      : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-150 hover:text-black'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Segmented View Selector Tabs (RAM Memory versus Persistent Server Disk System Storage) */}
      <div className="flex border-b border-gray-200">
        <button
          type="button"
          onClick={() => setActiveTab('server_disk')}
          className={`px-4 py-2 border-b-2 text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
            activeTab === 'server_disk'
              ? 'border-emerald-600 text-emerald-800'
              : 'border-transparent text-gray-500 hover:text-black'
          }`}
        >
          <Server className="w-4 h-4 text-emerald-600" />
          <span>Server Filesystem Storage</span>
          <span className="px-1.5 py-0.2 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-mono">
            {serverBackups.length} Files
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('ram_memory')}
          className={`px-4 py-2 border-b-2 text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
            activeTab === 'ram_memory'
              ? 'border-emerald-600 text-emerald-800'
              : 'border-transparent text-gray-500 hover:text-black'
          }`}
        >
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>In-Memory RAM Snapshots</span>
          <span className="px-1.5 py-0.2 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-mono">
            {snapshots.length} Buffered
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('google_sheets')}
          className={`px-4 py-2 border-b-2 text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
            activeTab === 'google_sheets'
              ? 'border-emerald-600 text-emerald-800'
              : 'border-transparent text-gray-500 hover:text-black'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
          <span>Google Sheets Backup</span>
        </button>
      </div>

      {/* Active Tab Screen Area */}
      <div>
        {activeTab === 'server_disk' ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-[10px] font-bold text-gray-400 uppercase font-mono tracking-wider">
              <span>Server Host Persistent Files system backups</span>
              <span className="text-emerald-600">Preserved on Host Server Database Container</span>
            </div>

            {isFetchingServer && serverBackups.length === 0 ? (
              <div className="p-8 text-center text-xs text-gray-400 flex flex-col items-center justify-center gap-2">
                <Clock className="w-6 h-6 text-emerald-500 animate-spin" />
                <span>Scanning server storage disk files...</span>
              </div>
            ) : serverError ? (
              <div className="p-4 bg-red-50 text-red-700 rounded-xl text-xs space-y-1">
                <p className="font-bold">Error reading server disk:</p>
                <p>{serverError}</p>
                <button
                  type="button"
                  onClick={fetchServerBackupsList}
                  className="mt-2 text-[10px] underline hover:text-red-900 font-bold block"
                >
                  Retry server handshake
                </button>
              </div>
            ) : serverBackups.length === 0 ? (
              <div className="border border-dashed border-gray-200 rounded-xl p-8 text-center space-y-2 bg-gray-50/50">
                <HardDrive className="w-9 h-9 text-gray-300 mx-auto" />
                <p className="text-xs text-gray-500 font-bold">No persistent server backup files detected.</p>
                <p className="text-[10px] text-gray-400">Press the "Capture Safehouse Backup" button at the top-right to commit your progress to system storage!</p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                {serverBackups.map((item, idx) => {
                  const isLatest = idx === 0;
                  return (
                    <div 
                      key={item.filename}
                      className={`p-3.5 bg-white border rounded-xl hover:border-gray-350 hover:shadow-xs transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        isLatest ? 'ring-1 ring-emerald-500/20 border-emerald-500/40 bg-emerald-50/5' : 'border-gray-200'
                      }`}
                    >
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs font-black text-gray-950 font-sans">{item.timestamp}</span>
                          <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded uppercase font-mono tracking-wider ${
                            item.type === 'auto'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                              : 'bg-blue-50 text-blue-700 border border-blue-100'
                          }`}>
                            {item.type}
                          </span>
                          <span className="text-[8px] px-1.5 py-0.1 bg-gray-100 text-gray-600 rounded font-mono uppercase">
                            File System (Host Disk)
                          </span>
                        </div>

                        {/* Counts breakdown */}
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-gray-400 font-mono">
                          <span>👤 {item.itemCounts?.influencers || 0} Creators</span>
                          <span>•</span>
                          <span>💼 {item.itemCounts?.campaigns || 0} Campaigns</span>
                          <span>•</span>
                          <span>⚙️ {item.itemCounts?.tasks || 0} Tasks</span>
                          <span>•</span>
                          <span>📄 {item.itemCounts?.contracts || 0} Contracts</span>
                          <span>•</span>
                          <span>💳 {item.itemCounts?.billingEntries || 0} Invoices</span>
                        </div>

                        {/* Planner Target Month/Year indicator */}
                        {item.selectedMonth && item.selectedYear && (
                          <div className="inline-flex items-center gap-1.5 text-[10px] font-bold text-gray-700 bg-amber-50/80 px-2 py-0.5 rounded border border-amber-200">
                            <span>📅 Monthly Campaign Planner target: <strong>{item.selectedMonth}/{item.selectedYear}</strong></span>
                            {(item.itemCounts?.dashboardProducts || 0) > 0 && (
                              <>
                                <span className="text-gray-300">•</span>
                                <span>📦 {item.itemCounts?.dashboardProducts} active products synced</span>
                              </>
                            )}
                          </div>
                        )}
                        
                        <div className="text-[9px] font-mono text-gray-400">
                          ID: <span className="text-gray-600 break-all select-all">{item.filename}</span>
                        </div>
                      </div>

                      {/* Action trigger group */}
                      <div className="flex items-center gap-1.5 shrink-0 self-start sm:self-auto">
                        <button
                          type="button"
                          onClick={() => handleRestoreServerFile(item)}
                          disabled={isPerformingAction}
                          className="px-3 py-1.5 bg-emerald-55 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 text-[10px] font-bold rounded-lg transition-all flex items-center gap-1 uppercase tracking-wide cursor-pointer"
                        >
                          <ArrowDownToLine className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Restore To Workplace</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteServerFile(item)}
                          disabled={isPerformingAction}
                          className="p-1.5 border border-red-150 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                          title="Wipe backup file from Server disk"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-[10px] font-bold text-gray-400 uppercase font-mono tracking-wider">
              <span>RAM Session memory snapshots cache</span>
              <span className="text-blue-600">Buffered inside browser runtime cache memory</span>
            </div>

            {snapshots.length === 0 ? (
              <div className="border border-dashed border-gray-250 rounded-xl p-8 text-center space-y-2 bg-gray-50/50">
                <HardDrive className="w-9 h-9 text-gray-300 mx-auto" />
                <p className="text-xs text-gray-500 font-bold">No snapshots cached in system memory yet.</p>
                <p className="text-[10px] text-gray-400">Select "Capture Safehouse Backup" above to seed a high-availability backup.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {snapshots.map((snap, idx) => {
                  const isLatest = idx === 0;
                  return (
                    <div 
                      key={idx}
                      className={`p-3.5 bg-white border rounded-xl hover:border-gray-350 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        isLatest ? 'ring-1 ring-emerald-500/20 border-emerald-500/40 bg-emerald-50/5' : 'border-gray-200'
                      }`}
                    >
                      <div className="space-y-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-black text-gray-900 font-sans">{snap.timestamp}</span>
                          <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded uppercase font-mono tracking-wider ${
                            snap.type === 'manual' 
                              ? 'bg-blue-50 text-blue-700 border border-blue-200' 
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}>
                            {snap.type}
                          </span>
                          <span className="text-[8px] px-1.5 py-0.1 bg-gray-100 text-gray-600 rounded font-mono uppercase">
                            Session RAM memory
                          </span>
                        </div>

                        {/* Items counts */}
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-gray-400 font-mono">
                          <span>👤 {snap.influencers.length} Creators</span>
                          <span>•</span>
                          <span>💼 {snap.campaigns.length} Campaigns</span>
                          <span>•</span>
                          <span>⚙️ {snap.tasks.length} Tasks</span>
                          <span>•</span>
                          <span>📄 {snap.contracts.length} Contracts</span>
                          <span>•</span>
                          <span>💳 {snap.billingEntries.length} Invoices</span>
                        </div>

                        {/* Monthly Campaign Planner target month/year */}
                        {snap.selectedMonth && snap.selectedYear && (
                          <div className="inline-flex items-center gap-1.5 text-[10px] font-bold text-gray-700 bg-amber-50/80 px-2 py-0.5 rounded border border-amber-200">
                            <span>📅 Monthly Campaign Planner target: <strong>{snap.selectedMonth}/{snap.selectedYear}</strong></span>
                            {snap.savedProducts && snap.savedProducts.length > 0 && (
                              <>
                                <span className="text-gray-300">•</span>
                                <span>📦 {snap.savedProducts.length} Product Presets</span>
                              </>
                            )}
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRestoreRAMSnapshot(snap)}
                        className="px-3 py-1.5 bg-emerald-55 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 text-[10px] font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer self-start sm:self-auto uppercase tracking-wide shrink-0 font-sans"
                      >
                        <Undo2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Restore Snapshot</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'google_sheets' && (
          <div className="pt-2 pb-4">
            <GoogleSheetsExtractor 
              influencers={influencers}
              campaigns={campaigns}
              tasks={tasks}
              messages={messages}
              contracts={contracts}
              billingEntries={billingEntries}
              dashboardProducts={dashboardProducts}
              monthlyTargets={monthlyTargets}
              aovEntries={aovEntries}
              user={user}
              accessToken={accessToken || null}
              onLoginSuccess={onLoginSuccess}
              onLogoutSuccess={onLogoutSuccess}
              onRestoreData={onRestoreData}
            />
          </div>
        )}
      </div>

      {/* Safety info block */}
      <div className="p-3 bg-amber-50/40 border border-amber-200 text-amber-805 rounded-xl flex items-start gap-2.5 text-[11px] leading-relaxed">
        <HelpCircle className="w-4.5 h-4.5 text-amber-505 shrink-0 mt-0.5" />
        <p className="font-sans">
          <strong>Persistent State Guard:</strong> Committing data to the **Server Filesystem Storage** ensures file persistence on the backend running system machine. Even if your browser local storage is cleared, you can immediately regain all monthly scheduler progress, products, contracts, and profiles from the server disk!
        </p>
      </div>

      {/* Custom Confirmation Modal */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 min-h-screen z-50 flex items-center justify-center p-4 bg-gray-950/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl w-full max-w-md border border-gray-150 p-6 shadow-xl space-y-4 animate-scale-up text-left">
            <div className="flex items-start gap-3 text-left">
              <div className={`p-2.5 rounded-xl shrink-0 border ${
                confirmModal.type === 'danger' 
                  ? 'bg-red-50 text-red-600 border-red-200' 
                  : confirmModal.type === 'warning'
                    ? 'bg-amber-50 text-amber-600 border-amber-200'
                    : 'bg-emerald-50 text-emerald-600 border-emerald-200'
              }`}>
                {confirmModal.type === 'danger' ? (
                  <Trash2 className="w-5 h-5 stroke-[2]" />
                ) : confirmModal.type === 'warning' ? (
                  <AlertCircle className="w-5 h-5 stroke-[2]" />
                ) : (
                  <ShieldCheck className="w-5 h-5 stroke-[2]" />
                )}
              </div>
              <div className="space-y-1 text-left">
                <h5 className="text-sm font-black text-gray-900 uppercase font-sans tracking-tight">
                  {confirmModal.title}
                </h5>
                <p className="text-xs text-gray-500 whitespace-pre-wrap leading-relaxed">
                  {confirmModal.description}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-4">
              <button
                type="button"
                onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                className="px-3.5 py-2 bg-gray-100 hover:bg-gray-150 text-gray-700 text-xs font-bold rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmModal(prev => ({ ...prev, isOpen: false }));
                  confirmModal.onConfirm();
                }}
                className={`px-3.5 py-2 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                  confirmModal.type === 'danger' 
                    ? 'bg-red-650 hover:bg-red-700 border border-red-700' 
                    : confirmModal.type === 'warning'
                      ? 'bg-amber-500 hover:bg-amber-600 border border-amber-600'
                      : 'bg-emerald-650 hover:bg-emerald-700 border border-emerald-700'
                }`}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
