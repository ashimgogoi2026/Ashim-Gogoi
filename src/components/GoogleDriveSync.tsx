import React, { useState, useEffect, useRef } from 'react';
import { 
  Cloud, CloudLightning, CloudOff, CheckCircle, AlertTriangle, RefreshCw, Loader2, Download, History, Database, UserCheck, ShieldAlert, ArrowUpRight, Check, Mail, Send, Inbox, ArrowRight
} from 'lucide-react';
import { Influencer, Campaign, Task, Message, Contract, BillingEntry, AovEntry } from '../types';
import { googleSignIn, logout, getAccessToken, getGoogleAccessToken } from '../lib/firebaseAuth';
import { 
  searchSyncFilesOnDrive, createSyncFileOnDrive, updateSyncFileOnDrive, downloadSyncFileFromDrive, GoogleDriveFile 
} from '../lib/driveSync';
import {
  sendDataBackupToGmail,
  fetchBackupMessagesFromGmail,
  decodeBackupMessageContent,
  GmailBackupHeader
} from '../lib/gmailBackup';
import { User } from 'firebase/auth';
import { safeLocalStorage } from '../lib/safeLocalStorage';

interface GoogleDriveSyncProps {
  influencers: Influencer[];
  campaigns: Campaign[];
  tasks: Task[];
  messages: Message[];
  contracts: Contract[];
  billingEntries: BillingEntry[];
  aovEntries?: AovEntry[];
  monthlyTargets?: any[];
  dashboardProducts?: any[];
  savedProducts?: string[];
  user: User | null;
  accessToken: string | null;
  onRestoreData: (restoredData: any) => void;
  onLoginSuccess: (currentUser: User, token: string) => void;
  onLogoutSuccess: () => void;
}

export default function GoogleDriveSync({
  influencers,
  campaigns,
  tasks,
  messages,
  contracts,
  billingEntries,
  aovEntries = [],
  monthlyTargets = [],
  dashboardProducts = [],
  savedProducts = [],
  user,
  accessToken,
  onRestoreData,
  onLoginSuccess,
  onLogoutSuccess
}: GoogleDriveSyncProps) {
  const [activeTab, setActiveTab] = useState<'drive' | 'gmail'>('drive');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastSyncedTime, setLastSyncedTime] = useState<string | null>(null);
  
  const [isAutoSyncEnabled, setIsAutoSyncEnabled] = useState<boolean>(() => {
    const val = safeLocalStorage.getItem('INFLUENCER_MANAGER_DRIVE_AUTOSYNC');
    return val !== 'false'; // Defaults to true
  });

  const [isGmailAutoBackupEnabled, setIsGmailAutoBackupEnabled] = useState<boolean>(() => {
    const val = safeLocalStorage.getItem('INFLUENCER_MANAGER_GMAIL_AUTOBACKUP');
    return val !== 'false'; // Defaults to true
  });

  const [lastAutoGmailTime, setLastAutoGmailTime] = useState<string | null>(null);
  const [gmailCountdown, setGmailCountdown] = useState<number>(300); // 300 seconds = 5 minutes

  const [driveFiles, setDriveFiles] = useState<GoogleDriveFile[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);

  // Gmail states
  const [gmailBackups, setGmailBackups] = useState<GmailBackupHeader[]>([]);
  const [isSendingBackupEmail, setIsSendingBackupEmail] = useState(false);
  const [isLoadingGmailBackups, setIsLoadingGmailBackups] = useState(false);
  const [gmailBackupStatus, setGmailBackupStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [gmailBackupError, setGmailBackupError] = useState<string | null>(null);

  const lastUploadedDataHash = useRef<string>('');

  // Ref to track the last known state we synced to support instantaneous rollback matching prior state hash
  const lastSyncedPayloadRef = useRef<{
    influencers: Influencer[];
    campaigns: Campaign[];
    tasks: Task[];
    messages: Message[];
    contracts: Contract[];
    billingEntries: BillingEntry[];
    aovEntries?: any[];
    monthlyTargets?: any[];
    dashboardProducts?: any[];
    savedProducts?: string[];
  }>({
    influencers,
    campaigns,
    tasks,
    messages,
    contracts,
    billingEntries,
    aovEntries,
    monthlyTargets,
    dashboardProducts,
    savedProducts
  });

  // Rollback state before the last backup was done
  const [rollbackState, setRollbackState] = useState<any | null>(() => {
    const val = safeLocalStorage.getItem('INFLUENCER_MANAGER_ROLLBACK_STATE');
    if (val) {
      try {
        return JSON.parse(val);
      } catch (e) {
        return null;
      }
    }
    return null;
  });

  const [rollbackTime, setRollbackTime] = useState<string | null>(() => {
    return safeLocalStorage.getItem('INFLUENCER_MANAGER_ROLLBACK_TIME') || null;
  });

  const handleRollback = () => {
    if (!rollbackState) return;
    const confirmed = window.confirm(
      `Recover Status? This will restore the database to the state it was in right before the automatic backup at ${rollbackTime || ''}.`
    );
    if (!confirmed) return;

    onRestoreData(rollbackState);
    
    // Clear snapshot after rollback for a clean single-step "Back" action
    setRollbackState(null);
    setRollbackTime(null);
    safeLocalStorage.removeItem('INFLUENCER_MANAGER_ROLLBACK_STATE');
    safeLocalStorage.removeItem('INFLUENCER_MANAGER_ROLLBACK_TIME');
  };

  // Settle active payload helper
  const getPayload = () => ({
    influencers,
    campaigns,
    tasks,
    messages,
    contracts,
    billingEntries,
    aovEntries,
    monthlyTargets,
    dashboardProducts,
    savedProducts
  });

  // Calculate current payload signature hash to detect true local data changes
  const getDataHash = () => {
    const p = getPayload();
    return JSON.stringify({
      infs: (p.influencers || []).length,
      camps: (p.campaigns || []).length,
      tsks: (p.tasks || []).length,
      msgs: (p.messages || []).length,
      conts: (p.contracts || []).length,
      bills: (p.billingEntries || []).length,
      aovs: (p.aovEntries || []).length,
      tgst: (p.monthlyTargets || []).length,
      dpds: (p.dashboardProducts || []).length,
      deepSize: JSON.stringify(p).length
    });
  };

  // Fetch file list from Google Drive
  const loadDriveBackupFiles = async (tokenToUse = getGoogleAccessToken() || accessToken) => {
    if (!tokenToUse) return;
    setIsLoadingFiles(true);
    try {
      const files = await searchSyncFilesOnDrive(tokenToUse);
      setDriveFiles(files);
      // Track existing sync file
      const instantSyncFile = files.find(f => f.name === 'influencer-manager-instant-sync.json');
      if (instantSyncFile) {
        setActiveFileId(instantSyncFile.id);
      }
    } catch (e: any) {
      console.error('Error fetching file list:', e);
    } finally {
      setIsLoadingFiles(false);
    }
  };

  // Fetch backup emails from Gmail Account
  const loadGmailBackupEmails = async (tokenToUse = getGoogleAccessToken() || accessToken) => {
    if (!tokenToUse) return;
    setIsLoadingGmailBackups(true);
    try {
      const messagesList = await fetchBackupMessagesFromGmail(tokenToUse);
      setGmailBackups(messagesList);
    } catch (e: any) {
      console.error('Error loading Gmail backups:', e);
    } finally {
      setIsLoadingGmailBackups(false);
    }
  };

  useEffect(() => {
    if (accessToken) {
      loadDriveBackupFiles(accessToken);
      loadGmailBackupEmails(accessToken);
    } else {
      setDriveFiles([]);
      setGmailBackups([]);
      setActiveFileId(null);
    }
  }, [accessToken]);

  // Always-active instant auto-backup to Google Drive triggered immediately upon database state modifications
  useEffect(() => {
    // If not online/connected, we still update the reference so that if they connect afterward, it begins correctly
    if (!isAutoSyncEnabled || !accessToken) {
      lastSyncedPayloadRef.current = getPayload();
      return;
    }

    const currentHash = getDataHash();
    
    // Seed hash if empty
    if (!lastUploadedDataHash.current) {
      lastUploadedDataHash.current = currentHash;
      lastSyncedPayloadRef.current = getPayload();
      return;
    }

    if (currentHash !== lastUploadedDataHash.current) {
      console.log('[Instant-Backup] DB modifications detected. Syncing backup snapshot instantly to Google Drive...');
      
      // Cache the exact state right BEFORE the backup to Google Drive is done
      const previousState = lastSyncedPayloadRef.current;
      setRollbackState(previousState);
      const timeStr = new Date().toLocaleTimeString();
      setRollbackTime(timeStr);
      safeLocalStorage.setItem('INFLUENCER_MANAGER_ROLLBACK_STATE', JSON.stringify(previousState));
      safeLocalStorage.setItem('INFLUENCER_MANAGER_ROLLBACK_TIME', timeStr);

      // Perform instant background sync
      handleSyncNow(true);

      // Update tracking state hashes
      lastUploadedDataHash.current = currentHash;
      lastSyncedPayloadRef.current = getPayload();
    }
  }, [influencers, campaigns, tasks, messages, contracts, billingEntries, aovEntries, monthlyTargets, dashboardProducts, savedProducts, isAutoSyncEnabled, accessToken]);

  // Strict 5-minute background auto backup to Gmail (without annoying alerts or browser pops)
  useEffect(() => {
    if (!isGmailAutoBackupEnabled || !accessToken || !user?.email) return;

    // Dispatch immediately once or reset countdown
    setGmailCountdown(300);

    const gmailIntervalId = setInterval(() => {
      console.log('[Auto-Backup] Ticking five-minute milestone. Dispatching Gmail snapshot backup...');
      handleSendGmailBackup(true); // Call silently in the background
      setLastAutoGmailTime(new Date().toLocaleTimeString());
      setGmailCountdown(300);
    }, 300000); // 300,000 ms = 5 minutes

    const countdownId = setInterval(() => {
      setGmailCountdown((prev) => {
        if (prev <= 1) {
          return 300;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearInterval(gmailIntervalId);
      clearInterval(countdownId);
    };
  }, [influencers, campaigns, tasks, messages, contracts, billingEntries, isGmailAutoBackupEnabled, accessToken, user]);

  const handleLogin = async () => {
    try {
      const result = await googleSignIn();
      if (result) {
        onLoginSuccess(result.user, result.accessToken);
        // Pre-load backup files immediately upon successful authentication
        await loadDriveBackupFiles(result.accessToken);
        await loadGmailBackupEmails(result.accessToken);
      }
    } catch (err: any) {
      console.error('Authentication failed:', err);
      alert('Authentication Failed: ' + err.message);
    }
  };

  const handleLogout = async () => {
    if (window.confirm('Are you sure you want to disconnect your Google account?')) {
      await logout();
      onLogoutSuccess();
      setSyncStatus('idle');
      setLastSyncedTime(null);
      setGmailBackupStatus('idle');
    }
  };

  const handleSyncNow = async (isBackground = false) => {
    const token = getGoogleAccessToken() || accessToken || (await getAccessToken());
    if (!token) {
      setSyncStatus('error');
      setSyncError('Google authentication is required.');
      return;
    }

    if (!isBackground) {
      setIsSyncing(true);
    }
    setSyncStatus('syncing');

    try {
      const payload = getPayload();
      
      // Look up files to see if the "instant-sync" file exists
      const existingFiles = await searchSyncFilesOnDrive(token);
      const targetFile = existingFiles.find(f => f.name === 'influencer-manager-instant-sync.json');

      if (targetFile) {
        // Update existing file content
        await updateSyncFileOnDrive(token, targetFile.id, payload);
        setActiveFileId(targetFile.id);
      } else {
        // Create new instant-sync file
        const newFile = await createSyncFileOnDrive(token, 'influencer-manager-instant-sync.json', payload);
        setActiveFileId(newFile.id);
      }

      setSyncStatus('success');
      setLastSyncedTime(new Date().toLocaleTimeString());
      setSyncError(null);
      // Refresh historical drive file list in background
      loadDriveBackupFiles(token);
    } catch (err: any) {
      console.error('Data sync failed:', err);
      setSyncStatus('error');
      setSyncError(err.message || 'Error occurred during drive push.');
    } finally {
      if (!isBackground) {
        setIsSyncing(false);
      }
    }
  };

  const handleSendGmailBackup = async (isSilent = false) => {
    const token = getGoogleAccessToken() || accessToken || (await getAccessToken());
    if (!token || !user?.email) {
      if (!isSilent) {
        alert('Authentication with Gmail or Google Account is required.');
      }
      return;
    }

    setIsSendingBackupEmail(true);
    setGmailBackupStatus('idle');
    setGmailBackupError(null);

    try {
      const payload = getPayload();
      await sendDataBackupToGmail(token, user.email, payload);
      setGmailBackupStatus('success');
      // Reload Gmail's list of backup threads
      await loadGmailBackupEmails(token);
    } catch (err: any) {
      console.error('Gmail transmission failed:', err);
      setGmailBackupStatus('error');
      setGmailBackupError(err.message || 'Failed to dispatch email snapshot to Gmail mailbox.');
    } finally {
      setIsSendingBackupEmail(false);
    }
  };

  const handleRestoreFromDrive = async (fileId: string, fileName: string) => {
    const confirmed = window.confirm(
      `Restore Workspace? This will overwrite your active database with the contents of "${fileName}" downloaded from Google Drive.`
    );
    if (!confirmed) return;

    const token = getGoogleAccessToken() || accessToken || (await getAccessToken());
    if (!token) {
      alert('Authentication is required to download workspace files.');
      return;
    }

    setIsSyncing(true);
    try {
      const parsed = await downloadSyncFileFromDrive(token, fileId) as any;
      const restored = parsed.payload || parsed;
      if (!restored.influencers && !restored.campaigns) {
        throw new Error('Downloaded backup document does not conform to Influencer Manager data formats.');
      }
      await onRestoreData(restored);
      alert('Workspace successfully restored from Google Drive backup!');
    } catch (err: any) {
      alert('Restoration Failed: ' + err.message);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleRestoreFromGmail = async (messageId: string, subjectLine: string) => {
    const confirmed = window.confirm(
      `Restore from Gmail backup? This will parse the JSON snapshot attached to the email "${subjectLine}" and overwrite your active database.`
    );
    if (!confirmed) return;

    const token = getGoogleAccessToken() || accessToken || (await getAccessToken());
    if (!token) {
      alert('Authentication is required to access Gmail.');
      return;
    }

    setIsSyncing(true);
    try {
      const parsed = await decodeBackupMessageContent(token, messageId) as any;
      const restored = parsed.payload || parsed;
      if (!restored.influencers && !restored.campaigns) {
        throw new Error('Mailing snapshot does not contain valid Influencer Manager databases block.');
      }
      await onRestoreData(restored);
      alert('Workspace successfully restored from Gmail backup email!');
    } catch (err: any) {
      console.error('Gmail restore error:', err);
      alert('Gmail Restoration Failed: ' + err.message);
    } finally {
      setIsSyncing(false);
    }
  };

  const toggleAutoSync = () => {
    const nextState = !isAutoSyncEnabled;
    setIsAutoSyncEnabled(nextState);
    safeLocalStorage.setItem('INFLUENCER_MANAGER_DRIVE_AUTOSYNC', String(nextState));
    if (nextState && accessToken) {
      handleSyncNow();
    }
  };

  return (
    <div className="bg-white border border-gray-150 rounded-xl shadow-xs overflow-hidden">
      
      {/* Container Header Banner */}
      <div className="bg-gradient-to-r from-red-650 to-red-600 p-5 text-white flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-white/10 rounded-lg backdrop-blur-xs">
            <Cloud className="w-6 h-6 stroke-[2]" />
          </div>
          <div>
            <h2 className="text-base font-bold font-sans tracking-tight">Active Workspace Synchronization Core</h2>
            <p className="text-[10px] text-red-105 tracking-wider font-mono">Instant saves to Google Drive & safe dispatch to Gmail</p>
          </div>
        </div>

        {user && (
          <div className="flex items-center gap-1.5 bg-green-550/30 px-3 py-1.5 rounded-full border border-green-500/20">
            <UserCheck className="w-3.5 h-3.5 text-emerald-300" />
            <span className="text-[10px] font-mono font-bold uppercase text-emerald-200">Cloud Connected</span>
          </div>
        )}
      </div>

      <div className="p-5 md:p-6 space-y-6">
        {!user ? (
          /* Connect Block */
          <div className="max-w-xl mx-auto py-8 text-center space-y-5">
            <div className="flex justify-center">
              <div className="p-4 bg-gray-50 rounded-full border border-gray-150 text-gray-400">
                <CloudOff className="w-12 h-12" />
              </div>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-900">Google Workspace Sync Disconnected</h3>
              <p className="text-xs text-gray-500 max-w-sm mx-auto leading-relaxed">
                Connect your active workspace account to enable instant, automatic live sync to Google Drive storage, plus secured email snapshot backups to Gmail.
              </p>
            </div>

            <div className="flex justify-center">
              {/* Official Google Brand button design */}
              <button 
                type="button"
                onClick={handleLogin}
                className="gsi-material-button shadow-xs border border-gray-200 hover:border-gray-300 transition-colors cursor-pointer"
              >
                <div className="gsi-material-button-state"></div>
                <div className="gsi-material-button-content-wrapper">
                  <div className="gsi-material-button-icon">
                    <svg version="1.1" xmlns="http://www.w3.org/205c" viewBox="0 0 48 48" style={{ display: 'block' }}>
                      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                    </svg>
                  </div>
                  <span className="gsi-material-button-contents font-bold text-gray-700 text-xs">Enable Workspace Synchronization</span>
                </div>
              </button>
            </div>
          </div>
        ) : (
          /* Active Sync Operations Board */
          <div className="space-y-6">

            {/* ALWAYS-ON CLOUD AUTOMATION HUD */}
            <div className="bg-gradient-to-br from-red-50 to-white border border-red-200 p-5 rounded-2xl shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <span className="text-[11px] font-black font-sans uppercase tracking-widest text-red-700">Always-On Backup Automation Hub</span>
                </div>
                <div className="bg-red-100/50 border border-red-200/50 text-red-700 font-bold text-[9px] font-mono rounded-md px-2 py-0.5">
                  Autonomous · Enabled Automatically
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Google Drive Status block */}
                <div className="bg-white rounded-xl border border-red-100 p-4 space-y-3 shadow-xs hover:border-red-200 transition-all select-none">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-red-50 rounded-lg text-red-700">
                        <Cloud className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-[11px] font-bold text-gray-800">Google Drive Real-Time Sync</p>
                        <p className="text-[9px] text-gray-400">Auto-saves local database edits</p>
                      </div>
                    </div>
                    
                    <button
                      type="button"
                      onClick={() => {
                        const nextState = !isAutoSyncEnabled;
                        setIsAutoSyncEnabled(nextState);
                        safeLocalStorage.setItem('INFLUENCER_MANAGER_DRIVE_AUTOSYNC', String(nextState));
                      }}
                      className="text-[9px] font-bold font-mono tracking-wide bg-emerald-50 text-emerald-800 border border-emerald-100 rounded-md px-2 py-0.5 cursor-pointer hover:bg-emerald-100"
                    >
                      {isAutoSyncEnabled ? '● Armed & Online' : 'Paused'}
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[10px] pt-2 border-t border-gray-55 text-gray-600">
                    <div className="bg-gray-50 p-2 rounded-lg text-left">
                      <span className="block text-[8px] uppercase tracking-wider text-gray-400 font-bold">Sync Frequency</span>
                      <strong className="block text-emerald-600 font-bold mt-0.5 uppercase">Instant Sync</strong>
                    </div>
                    <div className="bg-gray-50 p-2 rounded-lg text-left">
                      <span className="block text-[8px] uppercase tracking-wider text-gray-400 font-bold">Last Save Action</span>
                      <strong className="block text-emerald-600 font-bold mt-0.5 truncate font-mono">
                        {lastSyncedTime ? `✓ ${lastSyncedTime}` : 'Awaiting changes...'}
                      </strong>
                    </div>
                  </div>

                  {rollbackState && (
                    <div className="bg-red-50/50 border border-red-100 p-2.5 rounded-lg flex items-center justify-between text-[11px] animate-fade-in select-none mt-2">
                      <div className="text-left space-y-0.5">
                        <span className="text-[9px] uppercase tracking-wider text-red-700 font-bold block">Restore Last Backup State</span>
                        <span className="text-gray-500 font-mono text-[9px] block">Captured at {rollbackTime}</span>
                      </div>
                      <button
                        type="button"
                        onClick={handleRollback}
                        id="drive-rollback-instant-badge"
                        className="bg-neutral-900 duration-150 text-white hover:bg-black px-2.5 py-1 rounded font-bold text-[10px] transition flex items-center gap-1.5 cursor-pointer shadow-2xs shrink-0 active:scale-95"
                      >
                        <History className="w-3 h-3 text-red-200 animate-pulse" />
                        Back / Rollback
                      </button>
                    </div>
                  )}
                </div>

                {/* Gmail Status block */}
                <div className="bg-white rounded-xl border border-red-100 p-4 space-y-3 shadow-xs hover:border-red-200 transition-all select-none">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-red-50 rounded-lg text-red-700">
                        <Mail className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-[11px] font-bold text-gray-800">Gmail Secured Snapshot Chrono</p>
                        <p className="text-[9px] text-gray-400">Scheduled sandbox snapshots mailer</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        const nextState = !isGmailAutoBackupEnabled;
                        setIsGmailAutoBackupEnabled(nextState);
                        safeLocalStorage.setItem('INFLUENCER_MANAGER_GMAIL_AUTOBACKUP', String(nextState));
                      }}
                      className="text-[9px] font-bold font-mono tracking-wide bg-emerald-50 text-emerald-800 border border-emerald-100 rounded-md px-2 py-0.5 cursor-pointer hover:bg-emerald-100"
                    >
                      {isGmailAutoBackupEnabled ? '● Armed & Online' : 'Paused'}
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[10px] pt-2 border-t border-gray-55 text-gray-600">
                    <div className="bg-gray-50 p-2 rounded-lg text-left">
                      <span className="block text-[8px] uppercase tracking-wider text-gray-400 font-bold">Next Dispatch Email</span>
                      <strong className="block text-red-700 font-black mt-0.5 font-mono">
                        {isGmailAutoBackupEnabled ? `${Math.floor(gmailCountdown / 60)}m ${gmailCountdown % 60}s` : 'Paused'}
                      </strong>
                    </div>
                    <div className="bg-gray-50 p-2 rounded-lg text-left">
                      <span className="block text-[8px] uppercase tracking-wider text-gray-400 font-bold">Last Dispatch Mail</span>
                      <strong className="block text-emerald-600 font-bold mt-0.5 truncate font-mono">
                        {lastAutoGmailTime ? `✓ ${lastAutoGmailTime}` : 'Awaiting first tick...'}
                      </strong>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Sync Channel Selector Tabs */}
            <div className="flex border-b border-gray-150">
              <button
                type="button"
                onClick={() => setActiveTab('drive')}
                className={`py-3 px-5 font-bold text-xs flex items-center gap-2 border-b-2 transition ${
                  activeTab === 'drive'
                    ? 'border-red-650 text-red-650 bg-red-50/20'
                    : 'border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <Cloud className="w-4 h-4" />
                Google Drive Storage Sync
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('gmail')}
                className={`py-3 px-5 font-bold text-xs flex items-center gap-2 border-b-2 transition ${
                  activeTab === 'gmail'
                    ? 'border-red-650 text-red-650 bg-red-50/20'
                    : 'border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <Mail className="w-4 h-4" />
                Gmail Safe Backups Dispatch
              </button>
            </div>

            {activeTab === 'drive' ? (
              /* DRIVE SYNCHRONIZATION INTERFACE */
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
                
                {/* Column 1: Connection & Instant AutoSync Controls */}
                <div className="bg-gray-50 border border-gray-150 rounded-xl p-5 space-y-5 flex flex-col justify-between">
                  <div className="space-y-4">
                    <div>
                      <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest font-mono">Sync Mode Config</span>
                      <h3 className="text-sm font-bold text-gray-900 mt-1 flex items-center gap-1.5">
                        <CloudLightning className="w-4 h-4 text-amber-500" />
                        Drive Live Sync Engine
                      </h3>
                    </div>

                    <div className="bg-white border border-gray-150 p-4 rounded-lg space-y-3.5">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-bold text-gray-800">Auto-Backup to Drive</p>
                          <p className="text-[10px] text-gray-500 mt-0.5">Saves active database on change</p>
                        </div>
                        <button
                          type="button"
                          onClick={toggleAutoSync}
                          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            isAutoSyncEnabled ? 'bg-red-600' : 'bg-gray-200'
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                              isAutoSyncEnabled ? 'translate-x-5' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>

                      <div className="border-t border-gray-100 pt-3 flex items-center justify-between text-[11px]">
                        <span className="text-gray-500">Status Badge:</span>
                        <div className="flex items-center gap-1 font-bold">
                          {syncStatus === 'syncing' ? (
                            <span className="text-amber-600 flex items-center gap-1">
                              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Syncing...
                            </span>
                          ) : syncStatus === 'success' ? (
                            <span className="text-emerald-600 flex items-center gap-1">
                              <CheckCircle className="w-3.5 h-3.5" /> Fully Synced
                            </span>
                          ) : syncStatus === 'error' ? (
                            <span className="text-red-600 flex items-center gap-1">
                              <AlertTriangle className="w-3.5 h-3.5" /> Sync Error
                            </span>
                          ) : (
                            <span className="text-gray-500">Connected</span>
                          )}
                        </div>
                      </div>

                      {lastSyncedTime && (
                        <div className="text-[10px] text-gray-400 font-mono text-right">
                          Last saved: {lastSyncedTime}
                        </div>
                      )}
                    </div>

                    <div className="text-[10px] text-gray-500 leading-normal bg-blue-50/50 p-3 rounded-lg border border-blue-100/50">
                      ℹ️ <strong>Storage Target:</strong> Database is synchronized to <code className="bg-white px-1 text-red-600 font-mono text-[10px] border">influencer-manager-instant-sync.json</code> inside your private Google Drive space.
                    </div>
                  </div>

                  <div className="pt-2 border-t border-gray-200/50 space-y-2">
                    <button
                      type="button"
                      onClick={() => handleSyncNow()}
                      disabled={isSyncing}
                      className="w-full flex items-center justify-center gap-1.5 bg-red-600 hover:bg-red-700 text-white py-2 px-3 rounded-lg text-xs font-bold transition cursor-pointer shadow-xs disabled:opacity-50"
                    >
                      {isSyncing ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Syncing...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-3.5 h-3.5" /> Push Snapshot to Drive
                        </>
                      )}
                    </button>

                    {rollbackState ? (
                      <button
                        type="button"
                        onClick={handleRollback}
                        id="drive-rollback-large-btn"
                        className="w-full flex items-center justify-center gap-1.5 bg-neutral-900 hover:bg-black text-white py-2 px-3 rounded-lg text-xs font-bold transition cursor-pointer shadow-xs active:scale-98"
                      >
                        <History className="w-4 h-4 text-red-400 stroke-[2.5]" />
                        <span>Recover Last Status (Back)</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="w-full flex items-center justify-center gap-1.5 bg-gray-100 text-gray-400 py-2 px-3 rounded-lg text-xs font-bold cursor-not-allowed border border-gray-200 select-none"
                      >
                        <History className="w-4 h-4 text-gray-300" />
                        <span>No Back Status Yet</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={handleLogout}
                      className="w-full text-center text-[10px] font-bold text-gray-400 hover:text-red-650 transition cursor-pointer mt-1"
                    >
                      Disconnect Google Accounts
                    </button>
                  </div>
                </div>

                {/* Column 2: Dataset Stats summary being synced */}
                <div className="bg-white border border-gray-155 rounded-xl p-5 space-y-4 flex flex-col justify-between">
                  <div className="space-y-4">
                    <div>
                      <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest font-mono">Dataset Audit</span>
                      <h3 className="text-sm font-bold text-gray-900 mt-1 flex items-center gap-1.5">
                        <Database className="w-4 h-4 text-red-650" />
                        Backup Payload Manifest
                      </h3>
                    </div>

                    <div className="bg-gray-55/70 rounded-lg p-4 space-y-2.5 font-mono text-xs text-left">
                      <div className="flex justify-between border-b border-gray-150 pb-1.5">
                        <span className="text-gray-500">Influencers:</span>
                        <span className="font-bold text-gray-800">{influencers?.length ?? 0} profiles</span>
                      </div>
                      <div className="flex justify-between border-b border-gray-150 pb-1.5">
                        <span className="text-gray-500">Campaigns Desk:</span>
                        <span className="font-bold text-gray-800">{campaigns?.length ?? 0} active</span>
                      </div>
                      <div className="flex justify-between border-b border-gray-150 pb-1.5">
                        <span className="text-gray-500">Video Tasks:</span>
                        <span className="font-bold text-gray-800">{tasks?.length ?? 0} entries</span>
                      </div>
                      <div className="flex justify-between border-b border-gray-150 pb-1.5">
                        <span className="text-gray-500">Contracts:</span>
                        <span className="font-bold text-gray-800">{contracts?.length ?? 0} signed</span>
                      </div>
                      <div className="flex justify-between border-b border-gray-150 pb-1.5">
                        <span className="text-gray-500">Finance Ledger:</span>
                        <span className="font-bold text-gray-800">{billingEntries?.length ?? 0} bills</span>
                      </div>
                      <div className="flex justify-between pb-0.5">
                        <span className="text-gray-500">Communications:</span>
                        <span className="font-bold text-gray-800">{messages?.length ?? 0} lines</span>
                      </div>
                    </div>
                  </div>

                  {syncError && (
                    <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-lg text-[11px] flex gap-2 items-start font-medium leading-relaxed">
                      <ShieldAlert className="w-3.5 h-3.5 text-red-600 shrink-0 mt-0.5" />
                      <span>{syncError}</span>
                    </div>
                  )}
                </div>

                {/* Column 3: Safe Historical Restorer List from Google Drive */}
                <div className="bg-gray-50 border border-gray-150 rounded-xl p-5 flex flex-col justify-between">
                  <div className="space-y-4">
                    <div>
                      <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest font-mono">Drive Backups Cloud list</span>
                      <h3 className="text-sm font-bold text-gray-900 mt-1 flex items-center gap-1.5">
                        <History className="w-4 h-4 text-red-650" />
                        Restore From Google Drive
                      </h3>
                    </div>

                    {isLoadingFiles ? (
                      <div className="py-8 flex flex-col items-center justify-center gap-2 text-gray-400">
                        <Loader2 className="w-5 h-5 animate-spin text-red-600" />
                        <span className="text-[10px] font-bold">Reading Drive directory...</span>
                      </div>
                    ) : driveFiles.length === 0 ? (
                      <div className="bg-white border border-gray-200/60 rounded-xl py-6 text-center text-gray-400 text-xs">
                        No backups found in Google Drive folder space.
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-[170px] overflow-y-auto pr-1">
                        {driveFiles.map((file) => (
                          <div 
                            key={file.id} 
                            className="bg-white border border-gray-155 hover:border-gray-250 p-2.5 rounded-lg text-[11px] flex items-center justify-between transition-all shadow-2xs hover:shadow-xs group"
                          >
                            <div className="space-y-0.5 truncate pr-2 text-left">
                              <p className="font-bold text-gray-805 truncate text-[11px]" title={file.name}>
                                {file.name}
                              </p>
                              <p className="text-[9px] font-mono text-gray-405">
                                {file.modifiedTime ? new Date(file.modifiedTime).toLocaleString('en-GB') : 'Unknown date'}
                              </p>
                            </div>
                            
                            <button
                              type="button"
                              onClick={() => handleRestoreFromDrive(file.id, file.name)}
                              className="bg-gray-50 hover:bg-neutral-850 hover:text-white border border-gray-150 p-1.5 rounded-md text-gray-650 transition shrink-0 flex items-center gap-0.5 active:scale-95 text-[10px] font-bold"
                            >
                              <Download className="w-3 h-3" /> Restore
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="pt-3 border-t border-gray-200/50 flex justify-between items-center text-[10px] text-gray-400">
                    <span>Count: {driveFiles.length} snapshot(s)</span>
                    <button
                      type="button"
                      onClick={() => loadDriveBackupFiles()}
                      className="text-red-600 hover:underline font-bold"
                    >
                      Refresh List
                    </button>
                  </div>
                </div>

              </div>
            ) : (
              /* GMAIL BACKUP TRANSMISSION INTERFACE */
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in col-span">
                
                {/* Column 1: Send Safe Gmail Backups */}
                <div className="bg-gray-50 border border-gray-150 rounded-xl p-5 space-y-5 flex flex-col justify-between">
                  <div className="space-y-4">
                    <div>
                      <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest font-mono">Mail Transmission</span>
                      <h3 className="text-sm font-bold text-gray-900 mt-1 flex items-center gap-1.5">
                        <Send className="w-4 h-4 text-red-600" />
                        Dispatch Email Snapshots
                      </h3>
                    </div>

                    <div className="bg-white border border-gray-150 p-4 rounded-lg space-y-3">
                      <div>
                        <p className="text-xs font-bold text-gray-800">Receipt Mailbox Account</p>
                        <p className="text-[11px] font-mono text-red-650 font-bold break-all bg-gray-50 px-2 py-1.5 rounded border border-gray-150 mt-1">
                          {user.email}
                        </p>
                      </div>

                      <div className="text-[10px] text-gray-500 leading-relaxed border-t border-gray-100 pt-2.5">
                        Clicking the backup button compiles all active creator lists, campaigns, contract parameters, and messages logs into a certified JSON backup packet and sends it securely to your own inbox.
                      </div>

                      {gmailBackupStatus === 'success' && (
                        <div className="p-2.5 bg-emerald-50 border border-emerald-150 text-emerald-800 rounded text-[10px] font-bold flex gap-1.5 items-center">
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Backup email sent successfully!</span>
                        </div>
                      )}

                      {gmailBackupStatus === 'error' && gmailBackupError && (
                        <div className="p-2.5 bg-red-50 border border-red-150 text-red-800 rounded text-[10px] flex gap-1 items-start leading-tight">
                          <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0 mt-0.5" />
                          <span>{gmailBackupError}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-gray-200/50">
                    <button
                      type="button"
                      onClick={() => handleSendGmailBackup()}
                      disabled={isSendingBackupEmail}
                      className="w-full flex items-center justify-center gap-1.5 bg-neutral-900 hover:bg-black text-white py-2 px-3 rounded-lg text-xs font-bold transition cursor-pointer shadow-xs disabled:opacity-50"
                    >
                      {isSendingBackupEmail ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Mailing Payload...
                        </>
                      ) : (
                        <>
                          <Send className="w-3.5 h-3.5" /> Email Sandbox Snapshot
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Column 2: Backup Snapshot statistics overview */}
                <div className="bg-white border border-gray-155 rounded-xl p-5 space-y-4 flex flex-col justify-between">
                  <div className="space-y-4">
                    <div>
                      <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest font-mono font-bold">Mailbox Summary</span>
                      <h3 className="text-sm font-bold text-gray-900 mt-1 flex items-center gap-1.5">
                        <Inbox className="w-4 h-4 text-red-650" />
                        Information Envelope stats
                      </h3>
                    </div>

                    <div className="p-3 bg-red-50/40 rounded-lg text-xs text-gray-600 space-y-2 text-left leading-normal">
                      <p>📪 <strong>Strict Access Rules:</strong> These backup operations query the logged-in email address's raw list looking ONLY for messages featuring headers containing: </p>
                      <code className="block bg-white p-1 rounded font-mono text-[9px] text-red-600 border font-bold">
                        Subject: "[Influencer Manager] Safe Database Backup"
                      </code>
                      <p className="text-[10px] text-gray-400 pt-1.5">
                        This guarantees total sandboxing, ensuring no normal client communications are ever accessed or parsed. Restorations run instantly client-side.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Column 3: Restore list reading from user's Gmail Inbox */}
                <div className="bg-gray-50 border border-gray-150 rounded-xl p-5 flex flex-col justify-between">
                  <div className="space-y-4">
                    <div>
                      <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest font-mono">Gmail Backups inbox List</span>
                      <h3 className="text-sm font-bold text-gray-900 mt-1 flex items-center gap-1.5">
                        <History className="w-4 h-4 text-red-650" />
                        Restore From Gmail Thread
                      </h3>
                    </div>

                    {isLoadingGmailBackups ? (
                      <div className="py-8 flex flex-col items-center justify-center gap-2 text-gray-400">
                        <Loader2 className="w-5 h-5 animate-spin text-red-600" />
                        <span className="text-[10px] font-bold">Scanning Gmail mailbox...</span>
                      </div>
                    ) : gmailBackups.length === 0 ? (
                      <div className="bg-white border border-gray-200/60 rounded-xl py-6 text-center text-gray-400 text-[11px] leading-normal px-3">
                        No previous Influencer Manager backup emails discovered in your inbox.
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-[170px] overflow-y-auto pr-1">
                        {gmailBackups.map((mail) => (
                          <div 
                            key={mail.id} 
                            className="bg-white border border-gray-155 hover:border-gray-255 p-2 rounded-lg text-[11px] flex items-center justify-between transition-all shadow-2xs hover:shadow-xs group"
                          >
                            <div className="space-y-0.5 truncate pr-2 text-left">
                              <p className="font-bold text-neutral-800 truncate text-[10px]" title={mail.subject}>
                                {mail.date}
                              </p>
                              <p className="text-[9px] text-gray-400 truncate">
                                {mail.snippet}
                              </p>
                            </div>
                            
                            <button
                              type="button"
                              onClick={() => handleRestoreFromGmail(mail.id, mail.subject)}
                              className="bg-gray-50 hover:bg-neutral-850 hover:text-white border border-gray-150 p-1.5 rounded-md text-gray-650 transition shrink-0 flex items-center gap-0.5 active:scale-95 text-[10px] font-bold"
                            >
                              <Download className="w-3 h-3" /> Restore
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="pt-3 border-t border-gray-200/50 flex justify-between items-center text-[10px] text-gray-400">
                    <span>Inbox items: {gmailBackups.length}</span>
                    <button
                      type="button"
                      onClick={() => loadGmailBackupEmails()}
                      className="text-red-600 hover:underline font-bold"
                    >
                      Scan Inbox
                    </button>
                  </div>
                </div>

              </div>
            )}

          </div>
        )}
      </div>

    </div>
  );
}
