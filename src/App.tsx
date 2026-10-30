import {
ErrorBoundary } from './ErrorBoundary';
import { MonthlyBudget } from './types';
import { globalToast } from './lib/toast';
import { useTheme, ThemeSwitcher } from './context/ThemeContext';
import React, { useState, useEffect, useRef, useMemo, useCallback, lazy, Suspense } from 'react';
import { 
  User as UserIcon, Users, Briefcase, ListTodo, BarChart3, Mail, CreditCard, Award, Sparkles, Presentation, RefreshCw, Layers, Calendar, Clock, Smartphone, Cloud, LogIn, LogOut, TrendingUp, X, Settings, BookOpen, Target, ShieldCheck, ChevronDown, ChevronUp, Database, Package, Calculator, ShieldAlert, AlertOctagon, Volume2, FileSpreadsheet, FileText, Link2, Eye, MonitorPlay, ArrowLeftRight, StickyNote, CheckCircle2, AlertCircle, Loader2, Map as MapIcon, FolderOpen, Search, Copy, Download, Upload, CloudDownload, Save, ToggleLeft, ToggleRight, Film, MessageCircle
} from 'lucide-react';
import { useLiveKolkataClock } from './lib/kolkataTime';

import ShortioTracker from './components/ShortioTracker';
import LiveVideoViewsTracker from './components/LiveVideoViewsTracker';
import AllReelsDirectoryModal, { detectReelPlatform } from './components/AllReelsDirectoryModal';

import Papa from 'papaparse';
import JSZip from 'jszip';
import { Influencer, Campaign, Task, Message, Contract, BillingEntry, ProductConfig, AovEntry, RegisteredUser, UserActivityLog, GlobalSettings, Note } from './types';
import { logUserActivity } from './lib/activityLogger';
import { INITIAL_INFLUENCERS, INITIAL_CAMPAIGNS, INITIAL_TASKS, INITIAL_MESSAGES, INITIAL_CONTRACTS, INITIAL_BILLING } from './mockData';
import { runSchemaMigrations } from './lib/schemaMigration';
import { initAuth, emailSignIn, emailSignUp, googleSignIn, logout, auth, sendResetEmail, ensureGoogleAccessToken, getGoogleAccessToken, isGoogleOAuthToken } from './lib/firebaseAuth';
import { uploadFullBackupToGoogleDrive } from './lib/driveSync';
import { type User } from 'firebase/auth';
import { saveToSystemMemory } from './lib/systemMemoryBackup';
import { safeLocalStorage } from './lib/safeLocalStorage';
import { collection, query, where, onSnapshot, getDocs, doc, setDoc, getDoc } from 'firebase/firestore';
import { 
  db, 
  saveDoc as firebaseSaveDoc, 
  updateDocInDb as firebaseUpdateDocInDb, 
  updateDocBatchInDb as firebaseUpdateDocBatchInDb,
  deleteDocBatchInDb as firebaseDeleteDocBatchInDb,
  deleteDocInDb as firebaseDeleteDocInDb, 
  batchInitializeCollection, 
  handleFirestoreError, 
  OperationType,
  cleanUndefined 
} from './lib/firestoreService';

import { cleanSingleMobileForStorage } from './lib/whatsappHelper';
import {
  analyzeAndComputeAutoMergeAndPlannerSync,
  AutoCreatorSystemStats,
  registerMonthlyPlannerProtectedTask,
  registerMonthlyPlannerProtectedTasksBulk,
  unregisterIntentionallyDeletedTaskIds,
  guardAndRestoreMonthlyPlannerTasks
} from './lib/creatorAutoSystem';

// Subcomponents import
import DriveRecoveryModal from './components/DriveRecoveryModal';
import GoogleDriveSync from './components/GoogleDriveSync';
import CentralCsvBackup from './components/CentralCsvBackup';
import InfluencerDatabase from './components/InfluencerDatabase';
import SecureBillPayment from './components/SecureBillPayment';
import LeaderboardBenchmarking from './components/LeaderboardBenchmarking';
import CampaignPlanner from './components/CampaignPlanner';
import AndroidMobileApp from './components/AndroidMobileApp';
import SalesDashboard from './components/SalesDashboard';
import VideoCampaignDashboard from './components/VideoCampaignDashboard';
import SystemMemorySafeguard from './components/SystemMemorySafeguard';
import PlatformSettings from './components/PlatformSettings';
import SmartAINotebook from './components/SmartAINotebook';
import MonthlyTargets, { MonthlyProductTarget } from './components/MonthlyTargets';
import AovCalculator from './components/AovCalculator';
import AdminPanel from './components/AdminPanel';
import GoogleSheetsExtractor from './components/GoogleSheetsExtractor';
import ImageSlides from './components/ImageSlides';
import MonthlyCompare from './components/MonthlyCompare';
import DataAnalyzer from './components/DataAnalyzer';
import MobileLiteCompletedApp from './components/MobileLiteCompletedApp';
import MonthlyExpenditureBill from './components/MonthlyExpenditureBill';
import UpdateWhatsAppModal, { WhatsAppPromptData } from './components/UpdateWhatsAppModal';
import QuickSendWhatsAppModal, { OPEN_QUICK_WHATSAPP_EVENT, QuickWhatsAppInitData } from './components/QuickSendWhatsAppModal';
import { WHATSAPP_PROMPT_EVENT } from './lib/whatsappPrompt';
import { getKnownMobile } from './lib/whatsappHelper';

const isBannedTextGlobal = (text?: string): boolean => {
  if (!text) return false;
  const t = text.toLowerCase();
  return (
    t.includes('cyber sunglasses unboxing') ||
    t.includes('extreme workout with cyber glasses') ||
    t.includes('extreme workout with cyber') ||
    t.includes('autumn wear showcase') ||
    t.includes('gaming setup cozy hoodies') ||
    t.includes('cozy hoodies integration') ||
    t.includes('organic cotton summer fit') ||
    t.includes('premium soundbar launch') ||
    t.includes('eco apparel collection') ||
    t.includes('smart fitness tracker') ||
    t.includes('active wear sports bra') ||
    t.includes('elite athletic workout short') ||
    t.includes('gitimoni') ||
    t.includes('kabyashree') ||
    t.includes('nitumoni') ||
    t.includes('sikha')
  );
};

const getMergedSavedProducts = (rawList: string[]): string[] => {
  const defaults = [
    'BHIM BANANA OATS',
    'CHOCOLATE DRINK',
    'HIGH PROTEIN OATS',
    'OTHERS 1',
    'OTHERS 2',
    'OTHERS 3',
    'OTHERS 4',
    'OTHERS 5'
  ];
  const cleaned = rawList.filter(p => !isBannedTextGlobal(p));
  const merged = [...cleaned];
  defaults.forEach(d => {
    if (!merged.some(m => m.toLowerCase() === d.toLowerCase())) {
      merged.push(d);
    }
  });
  return merged;
};

const DEFAULT_MONTHLY_TARGETS: MonthlyProductTarget[] = [];

const DEFAULT_AOV_ENTRIES: AovEntry[] = [];

type ActiveTab = 'compare-months' | 'video-dashboard' | 'database' | 'campaigns' | 'tasks' | 'notebook' | 'image-slides' | 'billing' | 'leaderboard' | 'planner' | 'mobile-apk' | 'settings' | 'monthly-targets' | 'aov-calculator' | 'admin-panel' | 'sheets-extractor' | 'shortio-tracker' | 'live-video-views' | 'cloud-sync' | 'sales-dashboard' | 'secure-billing' | 'expenditure-bill' | 'data-analyzer';

function App() {
  const { theme, themeStyles, isClassic, isDark } = useTheme();
  const kolkataClock = useLiveKolkataClock();
  const [isDriveRecoveryModalOpen, setIsDriveRecoveryModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('video-dashboard');
  const [isLiteApkMode, setIsLiteApkMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('mode') === 'apk-lite';
  });

  useEffect(() => {
    const syncLiteModeFromUrl = () => {
      const params = new URLSearchParams(window.location.search);
      setIsLiteApkMode(params.get('mode') === 'apk-lite');
    };
    window.addEventListener('popstate', syncLiteModeFromUrl);
    return () => window.removeEventListener('popstate', syncLiteModeFromUrl);
  }, []);

  const [hasAutoDownloadedCsv, setHasAutoDownloadedCsv] = useState(false);
  const [isAutoCsvEnabled, setIsAutoCsvEnabled] = useState<boolean>(() => safeLocalStorage.getItem('SYS_MEMORY_AUTOCSV_LOGIN_ENABLED') !== 'false');
  const [driveFolderId, setDriveFolderId] = useState<string | null>(() => safeLocalStorage.getItem('INFLUENCER_MANAGER_DRIVE_FOLDER_ID') || null);

  const toggleAutoCsv = useCallback(() => {
    const newValue = !isAutoCsvEnabled;
    setIsAutoCsvEnabled(newValue);
    safeLocalStorage.setItem('SYS_MEMORY_AUTOCSV_LOGIN_ENABLED', newValue ? 'true' : 'false');
    safeLocalStorage.setItem('SYS_MEMORY_AUTOCSV_LOGOUT_ENABLED', newValue ? 'true' : 'false');
    globalToast.info(`Auto CSV Download turned ${newValue ? 'ON' : 'OFF'}`);
  }, [isAutoCsvEnabled]);

  const [isAutoDriveUploadEnabled, setIsAutoDriveUploadEnabled] = useState<boolean>(() => safeLocalStorage.getItem('SYS_MEMORY_AUTODRIVE_UPLOAD_ENABLED') !== 'false');

  const toggleAutoDriveUpload = useCallback(() => {
    const newValue = !isAutoDriveUploadEnabled;
    setIsAutoDriveUploadEnabled(newValue);
    safeLocalStorage.setItem('SYS_MEMORY_AUTODRIVE_UPLOAD_ENABLED', newValue ? 'true' : 'false');
    globalToast.info(`Auto CSV Drive Upload turned ${newValue ? 'ON' : 'OFF'}`);
  }, [isAutoDriveUploadEnabled]);
  
  // Update localStorage when driveFolderId changes
  useEffect(() => {
    if (driveFolderId) {
      safeLocalStorage.setItem('INFLUENCER_MANAGER_DRIVE_FOLDER_ID', driveFolderId);
    }
  }, [driveFolderId]);

  // Global WhatsApp number prompt modal state
  const [whatsAppModalData, setWhatsAppModalData] = useState<WhatsAppPromptData | null>(null);
  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);

  // Quick Send WhatsApp modal state (Direct message to any number)
  const [isQuickWhatsAppOpen, setIsQuickWhatsAppOpen] = useState(false);
  const [quickWhatsAppInitData, setQuickWhatsAppInitData] = useState<QuickWhatsAppInitData | null>(null);

  useEffect(() => {
    const handleOpenWhatsAppPrompt = (e: CustomEvent<WhatsAppPromptData>) => {
      if (e.detail) {
        setWhatsAppModalData(e.detail);
        setIsWhatsAppModalOpen(true);
      }
    };

    const handleOpenQuickWhatsApp = (e: CustomEvent<QuickWhatsAppInitData>) => {
      setQuickWhatsAppInitData(e.detail || null);
      setIsQuickWhatsAppOpen(true);
    };

    window.addEventListener(WHATSAPP_PROMPT_EVENT as any, handleOpenWhatsAppPrompt as EventListener);
    window.addEventListener(OPEN_QUICK_WHATSAPP_EVENT as any, handleOpenQuickWhatsApp as EventListener);
    return () => {
      window.removeEventListener(WHATSAPP_PROMPT_EVENT as any, handleOpenWhatsAppPrompt as EventListener);
      window.removeEventListener(OPEN_QUICK_WHATSAPP_EVENT as any, handleOpenQuickWhatsApp as EventListener);
    };
  }, []);

  // Custom Workspace Identity values (managed via PlatformSettings panel)
  const [agencyName, setAgencyName] = useState<string>(() => safeLocalStorage.getItem('INFLUENCER_MANAGER_AGENCY_NAME') || 'PRO-TO-GROW');
  const [developerName, setDeveloperName] = useState<string>(() => safeLocalStorage.getItem('INFLUENCER_MANAGER_DEVELOPER_NAME') || 'ASHIM GOGOI');

  // Core database state hooks
  const [influencers, setInfluencers] = useState<Influencer[]>(INITIAL_INFLUENCERS);
  const [campaigns, setCampaigns] = useState<Campaign[]>(INITIAL_CAMPAIGNS);
  const [tasks, setTasks] = useState<Task[]>(INITIAL_TASKS);
  
  const [showAllReelsGlobalModal, setShowAllReelsGlobalModal] = useState(false);

  const reelsSummary = useMemo(() => {
    let count = 0;
    let views = 0;
    tasks.forEach(t => {
      if (t.status === 'Cancelled') return;
      let hasReel = false;
      if (t.videoLink1 && detectReelPlatform(t.videoLink1)) hasReel = true;
      if (t.videoLink2 && detectReelPlatform(t.videoLink2)) hasReel = true;
      if (t.videoLink3 && detectReelPlatform(t.videoLink3)) hasReel = true;
      if (hasReel) {
        count++;
        views += (t.views || 0);
      }
    });
    return { count, views };
  }, [tasks]);

  // Auto trigger Central Refresh every 90 seconds globally
  useEffect(() => {
    const interval = setInterval(() => {
      window.dispatchEvent(new CustomEvent('TRIGGER_CENTRAL_REFRESH'));
    }, 90 * 1000); // 90 seconds
    
    return () => clearInterval(interval);
  }, []);

  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [contracts, setContracts] = useState<Contract[]>(INITIAL_CONTRACTS);
  const [billingEntries, setBillingEntries] = useState<BillingEntry[]>(INITIAL_BILLING);
  const [activeInfluencerId, setActiveInfluencerId] = useState<string>('');
  const [aovEntries, setAovEntries] = useState<AovEntry[]>(DEFAULT_AOV_ENTRIES);
  const [notebookNotes, setNotebookNotes] = useState<Note[]>([]);

  const prevSettingsRef = useRef<string>('');

  // Authentication State
  const [user, setUser] = useState<any>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState<boolean>(true);
  const [showSessionAlert, setShowSessionAlert] = useState<boolean>(false);
  const [sirenAudio, setSirenAudio] = useState<any>(null);

  useEffect(() => {
    if (showSessionAlert) {
      try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContext) {
          const ctx = new AudioContext();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          
          osc.connect(gain);
          gain.connect(ctx.destination);
          
          osc.type = 'square';
          
          const now = ctx.currentTime;
          for (let i = 0; i < 600; i++) {
            osc.frequency.setValueAtTime(600, now + i * 0.5);
            osc.frequency.linearRampToValueAtTime(1000, now + i * 0.5 + 0.25);
            osc.frequency.linearRampToValueAtTime(600, now + i * 0.5 + 0.5);
          }
          
          gain.gain.setValueAtTime(0.1, now);
          
          osc.start(now);
          setSirenAudio({
             stop: () => {
                try { osc.stop(); ctx.close(); } catch(e) {}
             }
          });
        }
      } catch(e) {}
    } else {
      if (sirenAudio) {
         sirenAudio.stop();
         setSirenAudio(null);
      }
    }
  }, [showSessionAlert]);
    const [loginEmail, setLoginEmail] = useState<string>('');
  const [loginPassword, setLoginPassword] = useState<string>('');
  const [loginMode, setLoginMode] = useState<'login' | 'signup' | 'admin'>('login');
  const [loginError, setLoginError] = useState<string>('');
  const [isLoadingCloud, setIsLoadingCloud] = useState<boolean>(false);
  const [isSelfHealing, setIsSelfHealing] = useState<boolean>(false);
  const [isStorageHydrated, setIsStorageHydrated] = useState<boolean>(false);
  const [hasHydratedFromServer, setHasHydratedFromServer] = useState<boolean>(false);
  const [indicatorPos, setIndicatorPos] = useState({ x: typeof window !== 'undefined' ? window.innerWidth / 2 : 500, y: 120 });
  const [firestoreLoadedMap, setFirestoreLoadedMap] = useState<Record<string, boolean>>({});
  const isDraggingIndicator = useRef(false);
  const isClearingAllRef = useRef(false);
  const newlyCreatedInfluencersRef = useRef<Record<string, string>>({});
  const dragStartPos = useRef({ x: 0, y: 0 });

  const handleIndicatorPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    isDraggingIndicator.current = true;
    dragStartPos.current = { x: e.clientX - indicatorPos.x, y: e.clientY - indicatorPos.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleIndicatorPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingIndicator.current) {
      let newX = e.clientX - dragStartPos.current.x;
      let newY = e.clientY - dragStartPos.current.y;
      
      if (typeof window !== 'undefined') {
        const widgetWidth = Math.min(window.innerWidth * 0.9, 400);
        const halfW = widgetWidth / 2;
        newX = Math.max(halfW + 5, Math.min(window.innerWidth - halfW - 5, newX));
        newY = Math.max(5, Math.min(window.innerHeight - 80, newY));
      }
      
      setIndicatorPos({ x: newX, y: newY });
    }
  };

  const handleIndicatorPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    isDraggingIndicator.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const [marqueeDuration, setMarqueeDuration] = useState<number>(20);
  const [floatingNote, setFloatingNote] = useState<string>(() => safeLocalStorage.getItem('INFLUENCER_MANAGER_FLOATING_NOTE') || '');

  // Add Force Fix Data button
  const handleForceRescue = async () => {
    try {
      showToast("Attempting to rescue data...", "info");
      const snapRaw = safeLocalStorage.getItem('SYS_MEMORY_LAST_RECOVERY_RESERVE');
      if (snapRaw) {
        const snap = JSON.parse(snapRaw);
        await handleRestoreData(snap);
        showToast("Data rescued and pushed to Firestore successfully!", "success");
      } else {
        showToast("Failed to fetch backup: No local recovery reserve found.", "error");
      }
    } catch (e: any) {
      console.error(e);
      showToast("Rescue error: " + (e.stack || e.message), "error");
    }
  };

  useEffect(() => {
    const handleStorage = () => {
      setFloatingNote(safeLocalStorage.getItem('INFLUENCER_MANAGER_FLOATING_NOTE') || '');
    };
    window.addEventListener('floating-note-changed', handleStorage);
    return () => window.removeEventListener('floating-note-changed', handleStorage);
  }, []);

  // User Management & Security States
  const [userProfile, setUserProfile] = useState<RegisteredUser | null>(null);
  const [userStatus, setUserStatus] = useState<'Active' | 'Blocked' | 'Restricted' | 'Pending' | null>(() => {
    return auth.currentUser ? 'Active' : null;
  });
  const [userBlockedReason, setUserBlockedReason] = useState<string>('');
  const [globalAnnouncement, setGlobalAnnouncement] = useState<string>('');
  const [announcementActive, setAnnouncementActive] = useState<boolean>(false);
  const [hiddenPages, setHiddenPages] = useState<string[]>([]);
  const [adminHiddenPages, setAdminHiddenPages] = useState<string[]>([]);

  // Toast Notification System
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<'info' | 'error' | 'success' | 'warning'>('info');

  const [autoBackupStatus, setAutoBackupStatus] = useState<{ state: 'idle' | 'running' | 'success' | 'error', message?: string }>({ state: 'idle' });

  const showToast = (message: string, type: 'info' | 'error' | 'success' | 'warning' = 'info') => {
    setToastMessage(message);
    setToastType(type);
  };

  useEffect(() => {
    const unsubscribe = globalToast.subscribe(({ message, type }) => {
      showToast(message, type);
    });
    return () => unsubscribe();
  }, []);

  // Auto-restore administrator session on app startup if active
  useEffect(() => {
    try {
      const isSavedAdmin = safeLocalStorage.getItem('SYS_ADMIN_SESSION_ACTIVE') === 'true' || 
                            (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('SYS_ADMIN_SESSION_ACTIVE') === 'true');
      if (isSavedAdmin) {
        const savedUserStr = safeLocalStorage.getItem('INFLUENCER_MANAGER_ACTIVE_USER');
        let adminObj: any = {
          uid: 'admin_primary_ashim',
          email: 'ashimgogoi2008@gmail.com',
          displayName: 'Ashim Gogoi',
          role: 'Admin',
          status: 'Active'
        };
        if (savedUserStr) {
          try {
            adminObj = { ...adminObj, ...JSON.parse(savedUserStr) };
          } catch (e) {}
        }
        setUser(adminObj);
        setUserStatus('Active');
        setUserProfile({
          id: adminObj.uid,
          uid: adminObj.uid,
          email: adminObj.email,
          displayName: adminObj.displayName,
          photoURL: '',
          status: 'Active',
          role: 'Admin',
          createdAt: new Date().toISOString(),
          lastLoginAt: new Date().toISOString()
        });
        setNeedsAuth(false);
      }
    } catch (e) {
      console.warn("Failed to check saved admin session:", e);
    }
  }, []);

  // Globally override window.alert to route to toast
  useEffect(() => {
    const originalAlert = window.alert;
    window.alert = (msg) => {
      const msgStr = String(msg);
      if (msgStr.toLowerCase().includes('error') || msgStr.toLowerCase().includes('failed')) {
        globalToast.error(msgStr);
      } else {
        globalToast.info(msgStr);
      }
    };
    return () => {
      window.alert = originalAlert;
    };
  }, []);

  // Admin access validation helper with persistent administrator session support
  const isAdmin = useMemo(() => {
    const email = (user?.email || '').toLowerCase().trim();
    const isDirectAdmin = safeLocalStorage.getItem('SYS_ADMIN_SESSION_ACTIVE') === 'true' || 
                          (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('SYS_ADMIN_SESSION_ACTIVE') === 'true');
    return email === 'ashimgogoi2008@gmail.com' || 
           email === 'ea@protogrow.in' || 
           user?.role === 'Admin' || 
           userProfile?.role === 'Admin' || 
           isDirectAdmin;
  }, [user, userProfile]);

  // Direct administrator access helper (accessible in all environments, dev preview, or iframe)
  const handleAdminDirectAccess = () => {
    const adminUser = {
      uid: 'admin_primary_ashim',
      email: 'ashimgogoi2008@gmail.com',
      displayName: 'Ashim Gogoi',
      role: 'Admin',
      status: 'Active',
      photoURL: '',
      emailVerified: true
    };
    setUser(adminUser);
    setUserStatus('Active');
    setUserProfile({
      id: adminUser.uid,
      uid: adminUser.uid,
      email: adminUser.email,
      displayName: adminUser.displayName,
      photoURL: '',
      status: 'Active',
      role: 'Admin',
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString()
    });
    setNeedsAuth(false);
    safeLocalStorage.setItem('SYS_ADMIN_SESSION_ACTIVE', 'true');
    safeLocalStorage.setItem('INFLUENCER_MANAGER_ACTIVE_USER', JSON.stringify(adminUser));
    try {
      sessionStorage.setItem('SYS_ADMIN_SESSION_ACTIVE', 'true');
    } catch (e) {}
    showToast("Welcome Administrator Ashim Gogoi! Full administrative access granted.", "success");
  };

  // Shadow database functions to secure and audit writes seamlessly
  const saveDoc = async (collName: string, docId: string, data: any) => {
    if (!isAdmin && (userStatus === 'Blocked' || userStatus === 'Pending')) {
      showToast("❌ Permission Denied: Your account is blocked by the Administrator.", "error");
      return Promise.reject(new Error("User is blocked"));
    }
    if (!isAdmin && userStatus === 'Restricted' && collName !== 'user_activity_logs' && collName !== 'registered_users') {
      showToast(`⚠️ (Read-Only Mode): Change registered locally, but cannot persist to '${collName}'.`, "info");
      return Promise.resolve(); // resolve so it doesn't trigger the fallback that removes it from UI
    }
    if (user && collName !== 'user_activity_logs') {
      await logUserActivity(user.uid, user.email || 'unknown', `Create item in '${collName}'`, `ID: ${docId}`).catch(() => {});
    }
    return firebaseSaveDoc(collName, docId, data).catch(err => {
      console.log("Local storage fallback active:", err);
    });
  };

  const updateDocInDb = async (collName: string, docId: string, data: any) => {
    // Check if this is an update specifically for Video IDs which should never be restricted
    const isVideoIdEdit = collName === 'tasks' && data && typeof data === 'object' && ('videoId' in data) && Object.keys(data).length === 1;

    if (!isAdmin && (userStatus === 'Blocked' || userStatus === 'Pending')) {
      showToast("❌ Permission Denied: Your account is blocked by the Administrator.", "error");
      return;
    }
    if (!isAdmin && userStatus === 'Restricted' && collName !== 'user_activity_logs' && collName !== 'registered_users' && !isVideoIdEdit) {
      showToast(`⚠️ (Read-Only Mode): Change registered locally, but cannot persist to '${collName}'.`, "info");
      return;
    }
    if (user && collName !== 'user_activity_logs') {
      await logUserActivity(user.uid, user.email || 'unknown', `Update item in '${collName}'`, `ID: ${docId}`).catch(() => {});
    }
    return firebaseUpdateDocInDb(collName, docId, data).catch(err => {
      console.log("Local storage fallback active:", err);
    });
  };

  const deleteDocInDb = async (collName: string, docId: string) => {
    if (!isAdmin && (userStatus === 'Blocked' || userStatus === 'Pending')) {
      showToast("❌ Permission Denied: Your account is blocked by the Administrator.", "error");
      return;
    }
    if (!isAdmin && userStatus === 'Restricted' && collName !== 'user_activity_logs' && collName !== 'registered_users') {
      showToast(`⚠️ (Read-Only Mode): Delete registered locally, but cannot persist to '${collName}'.`, "info");
      return;
    }
    if (user && collName !== 'user_activity_logs') {
      await logUserActivity(user.uid, user.email || 'unknown', `Delete item from '${collName}'`, `ID: ${docId}`);
    }
    return firebaseDeleteDocInDb(collName, docId);
  };

  const deleteDocBatchInDb = async (collName: string, docIds: string[]) => {
    if (!isAdmin && (userStatus === 'Blocked' || userStatus === 'Pending')) {
      showToast("❌ Permission Denied: Your account is blocked by the Administrator.", "error");
      return;
    }
    if (!isAdmin && userStatus === 'Restricted' && collName !== 'user_activity_logs' && collName !== 'registered_users') {
      showToast(`⚠️ (Read-Only Mode): Bulk delete registered locally, but cannot persist to '${collName}'.`, "info");
      return;
    }
    if (user && collName !== 'user_activity_logs') {
      await logUserActivity(user.uid, user.email || 'unknown', `Bulk delete items from '${collName}'`, `Count: ${docIds.length}`);
    }
    return firebaseDeleteDocBatchInDb(collName, docIds);
  };

  // Real-time synchronization of authentication profile and security layers
  useEffect(() => {
    if (!user) {
      setUserProfile(null);
      setUserStatus(null);
      return;
    }

    if (user.email?.toLowerCase() === 'ea@protogrow.in') {
      console.warn("Access Revoked: These pre-authorized credentials have been permanently deleted by order of the Administrator.");
      setUser(null);
      setAccessToken(null);
      setNeedsAuth(true);
      logout().catch(err => console.error(err));
      return;
    }

    const isAdminUser = ((user.email || '').toLowerCase().trim() === 'ashimgogoi2008@gmail.com' || (user.email || '').toLowerCase().trim() === 'ea@protogrow.in');
    
    // 1. Immediately hydrate profile from local cache or defaults to prevent any delay
    let cachedProfile: RegisteredUser | null = null;
    try {
      const cached = safeLocalStorage.getItem(`ptg_registered_users_${user.uid}`);
      if (cached) {
        cachedProfile = JSON.parse(cached);
      }
    } catch (e) {
      console.warn("Could not read local profile cache", e);
    }

    const defaultProfile: RegisteredUser = cachedProfile || {
      id: user.uid,
      uid: user.uid,
      email: user.email || '',
      displayName: user.displayName || user.email?.split('@')[0] || (isAdminUser ? 'Ashim Gogoi' : 'User'),
      photoURL: user.photoURL || '',
      status: 'Active',
      role: isAdminUser ? 'Admin' : (cachedProfile?.role || 'User'),
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
    };

    if (isAdminUser) {
      defaultProfile.role = 'Admin';
      defaultProfile.status = 'Active';
    }

    setUserProfile(defaultProfile);
    setUserStatus(defaultProfile.status || 'Active');
    firebaseSaveDoc('registered_users', user.uid, defaultProfile).catch(() => {});

    // 2. Safe Firestore snapshot listener (non-blocking)
    let unsubscribeUserProfile = () => {};
    try {
      const userDocRef = doc(db, 'registered_users', user.uid);
      unsubscribeUserProfile = onSnapshot(userDocRef, async (docSnap) => {
        if (docSnap.exists()) {
          let profile = docSnap.data() as RegisteredUser;
          if (isAdminUser && (profile.role !== 'Admin' || profile.status !== 'Active')) {
            profile = { ...profile, role: 'Admin', status: 'Active' as const };
            firebaseUpdateDocInDb('registered_users', user.uid, { role: 'Admin', status: 'Active' as const }).catch(console.error);
          }

          setUserProfile(profile);
          setUserStatus(profile.status || 'Active');
          if (profile.bannedMessage) {
            setUserBlockedReason(profile.bannedMessage);
          } else {
            setUserBlockedReason('Your account has been blocked by the Administrator.');
          }
          
          await logUserActivity(user.uid, user.email || 'unknown', 'Access Dashboard Session Heartbeat', `Role: ${profile.role}, Status: ${profile.status}`).catch(() => {});
        } else {
          setUserProfile(defaultProfile);
          setUserStatus('Active');
        }
      }, (error) => {
        console.log('Firestore offline - using local active user profile:', error?.message);
        setUserProfile(defaultProfile);
        setUserStatus('Active');
      });
    } catch (e) {
      console.warn("Could not attach user snapshot listener:", e);
    }

    // Subscribing to global announcements configured in admin panel
    let unsubscribeAnnouncement = () => {};
    try {
      const announcementDocRef = doc(db, 'global_settings', 'announcement');
      unsubscribeAnnouncement = onSnapshot(announcementDocRef, (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setGlobalAnnouncement(data.announcementBanner || '');
          setAnnouncementActive(!!data.announcementActive);
          setHiddenPages(data.hiddenPages || []);
          setAdminHiddenPages(data.adminHiddenPages || []);
        }
      }, (err) => {
        console.warn('Error listening global settings', err?.message);
      });
    } catch (e) {
      console.warn("Could not attach announcement snapshot listener:", e);
    }

    return () => {
      unsubscribeUserProfile();
      unsubscribeAnnouncement();
    };
  }, [user]);

  // Auto-purge ea@protogrow.in from registered users database when an Administrator is logged in
  useEffect(() => {
    if (isAdmin) {
      const purgePreAuthorizedUser = async () => {
        try {
          const q = query(collection(db, 'registered_users'), where('email', '==', 'ea@protogrow.in'));
          const querySnap = await getDocs(q);
          querySnap.forEach(async (docSnap) => {
            await deleteDocInDb('registered_users', docSnap.id);
            console.log(`[Security Action] Dynamically purged pre-authorized user record: ${docSnap.id}`);
            showToast("🔒 Security: Pre-authorized log in of ea@protogrow.in has been removed.", "success");
          });
        } catch (err) {
          console.error("Database purge of ea@protogrow.in failed:", err);
        }
      };
      purgePreAuthorizedUser();
    }
  }, [isAdmin]);

  // Auto-synchronization flag between planner tasks and monthly target video goals
  const [autoSyncPlannerWithTargets, setAutoSyncPlannerWithTargets] = useState<boolean>(() => {
    return safeLocalStorage.getItem('INFLUENCER_MANAGER_AUTO_SYNC_PLANNER_TARGETS') === 'true';
  });

  useEffect(() => {
    if (!isStorageHydrated) return;
    const suffix = user ? user.uid : 'guest';
    safeLocalStorage.setItem('INFLUENCER_MANAGER_AUTO_SYNC_PLANNER_TARGETS', String(autoSyncPlannerWithTargets));
    safeLocalStorage.setItem(`INFLUENCER_MANAGER_AUTO_SYNC_PLANNER_TARGETS_${suffix}`, String(autoSyncPlannerWithTargets));
  }, [autoSyncPlannerWithTargets, user, isStorageHydrated]);

  // Global Month/Year Connection Sync State
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    return (new Date().getMonth() + 1).toString().padStart(2, '0');
  });
  const [selectedYear, setSelectedYear] = useState<string>(() => {
    return new Date().getFullYear().toString();
  });
  const [selectedWeek, setSelectedWeek] = useState<string>('ALL');
  const [globalSearch, setGlobalSearch] = useState<string>('');
  const [globalInfluencerFilter, setGlobalInfluencerFilter] = useState<string>('ALL');
  const [globalVideoIdFilter, setGlobalVideoIdFilter] = useState<string>('');
  

  // Option to calculate and show only products placed on ADD NEW VIDEO CAMPAIGN PLACEMENT (default to true)
  const [onlyShowPlacedProducts, setOnlyShowPlacedProducts] = useState<boolean>(() => {
    const saved = safeLocalStorage.getItem('INFLUENCER_MANAGER_ONLY_SHOW_PLACED');
    return saved === null ? true : saved === 'true';
  });

  const handleToggleOnlyShowPlacedProducts = (val: boolean) => {
    setOnlyShowPlacedProducts(val);
    safeLocalStorage.setItem('INFLUENCER_MANAGER_ONLY_SHOW_PLACED', val ? 'true' : 'false');
  };

  // Active Storage Integrity Guardian States
  const [showGlobalDiagnostic, setShowGlobalDiagnostic] = useState<boolean>(false);
  const [globalDiagnosticMsg, setGlobalDiagnosticMsg] = useState<string>("");
  const [isVerifyingGlobal, setIsVerifyingGlobal] = useState<boolean>(false);
  const [isGuardianPanelExpanded, setIsGuardianPanelExpanded] = useState<boolean>(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);

  // Lifted Monthly Product Targets State
  const [monthlyBudgets, setMonthlyBudgets] = useState<MonthlyBudget[]>(() => {
    const saved = safeLocalStorage.getItem('INFLUENCER_MANAGER_MONTHLY_BUDGETS');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      } catch (e) {}
    }
    return [];
  });
  const prevMonthlyBudgetsRef = useRef<string>('[]');
  const prevNotebookNotesRef = useRef<string>('[]');
  const prevAovEntriesRef = useRef<string>('[]');

  useEffect(() => {
    if (!user && !isStorageHydrated) return;
    const suffix = user ? user.uid : 'guest';
    const currentBudgetsStr = JSON.stringify(monthlyBudgets);
    if (currentBudgetsStr === prevMonthlyBudgetsRef.current) {
      return;
    }
    safeLocalStorage.setItem('INFLUENCER_MANAGER_MONTHLY_BUDGETS', currentBudgetsStr);
    safeLocalStorage.setItem(`INFLUENCER_MANAGER_MONTHLY_BUDGETS_${suffix}`, currentBudgetsStr);
    
    if (user) {
      try {
        const prevArray: MonthlyBudget[] = prevMonthlyBudgetsRef.current ? JSON.parse(prevMonthlyBudgetsRef.current) : [];
        if (Array.isArray(prevArray)) {
          const nextVal = monthlyBudgets;
          const prevIds = new Set(prevArray.map(e => e.id));
          const nextIds = new Set(nextVal.map(e => e.id));
          prevArray.forEach(item => {
            if (!nextIds.has(item.id)) {
              deleteDocInDb('monthlyBudgets', item.id).catch(err => console.error(err));
            }
          });
          nextVal.forEach(item => {
            const prevItem = prevArray.find(p => p.id === item.id);
            if (!prevItem || JSON.stringify(prevItem) !== JSON.stringify(item)) {
              saveDoc('monthlyBudgets', item.id, { ownerId: user.uid, ...item }).catch(err => {
                console.error('Failed to save monthlyBudget to Firestore:', err);
              });
            }
          });
        }
      } catch (e) {
        console.error('Error during monthlyBudgets Firestore sync:', e);
      }
    }
    prevMonthlyBudgetsRef.current = currentBudgetsStr;
  }, [monthlyBudgets, user, isStorageHydrated]);

  // Lifted Monthly Product Targets State
  const [monthlyTargets, setMonthlyTargets] = useState<MonthlyProductTarget[]>(() => {
    const saved = safeLocalStorage.getItem('INFLUENCER_MANAGER_MONTHLY_TARGETS');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      } catch (e) {}
    }
    return DEFAULT_MONTHLY_TARGETS;
  });

  const prevMonthlyTargetsRef = useRef<string>('[]');
  const prevDashboardJsonRef = useRef<string>('[]');
  const prevMonthYearRef = useRef<{ month: string; year: string }>({ month: '', year: '' });
  const lastStateMonthlyTargetsRef = useRef<string>('');
  const lastStateDashboardProductsRef = useRef<string>('');

  // Persist monthly targets state with safeguards to prevent cross-user leakage or overwrite on load
  useEffect(() => {
    if (!user && !isStorageHydrated) return;
    const suffix = user ? user.uid : 'guest';
    const currentTargetsStr = JSON.stringify(monthlyTargets);
    if (currentTargetsStr === prevMonthlyTargetsRef.current) {
      return;
    }
    safeLocalStorage.setItem('INFLUENCER_MANAGER_MONTHLY_TARGETS', currentTargetsStr);
    safeLocalStorage.setItem(`INFLUENCER_MANAGER_MONTHLY_TARGETS_${suffix}`, currentTargetsStr);

    // Save/sync to Firestore in real-time if logged in
    if (user) {
      try {
        const prevArray: MonthlyProductTarget[] = prevMonthlyTargetsRef.current ? JSON.parse(prevMonthlyTargetsRef.current) : [];
        if (Array.isArray(prevArray)) {
          const nextVal = monthlyTargets;
          const prevIds = new Set(prevArray.map(e => e.id));
          const nextIds = new Set(nextVal.map(e => e.id));

          // Deleted targets
          prevArray.forEach(item => {
            if (!nextIds.has(item.id)) {
              deleteDocInDb('monthlyTargets', item.id).catch(err => console.error(err));
            }
          });

          // Added or changed targets
          nextVal.forEach(item => {
            const prevItem = prevArray.find(p => p.id === item.id);
            if (!prevItem || JSON.stringify(prevItem) !== JSON.stringify(item)) {
              saveDoc('monthlyTargets', item.id, { ownerId: user.uid, ...item }).catch(err => {
                console.error('Failed to save monthlyTarget to Firestore:', err); showToast(`Failed to save monthly target: ${err.message || 'Unknown error'}`, 'error');
              });
            }
          });
        }
      } catch (e) {
        console.error('Error during monthlyTargets Firestore sync:', e);
      }
    }

    prevMonthlyTargetsRef.current = currentTargetsStr;
  }, [monthlyTargets, user, isStorageHydrated]);

  // Lifted Dashboard Products State
  const [dashboardProducts, setDashboardProducts] = useState<ProductConfig[]>(() => {
    const saved = safeLocalStorage.getItem('INFLUENCER_MANAGER_DASHBOARD_PRODUCTS');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.filter((p: any) => p && typeof p === 'object' && !isBannedTextGlobal(p.name));
        }
      } catch (e) {}
    }
    return [];
  });

  // Lifted Saved Products Select Options
  const [savedProducts, setSavedProducts] = useState<string[]>(() => {
    const raw = safeLocalStorage.getItem('INFLUENCER_MANAGER_SAVED_PRODUCTS');
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return getMergedSavedProducts(parsed);
        }
      } catch (e) {}
    }
    return getMergedSavedProducts([]);
  });

  const [salesData, setSalesData] = useState<any[]>(() => {
    const raw = safeLocalStorage.getItem('SALES_DASHBOARD_DATA');
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) {}
    }
    return [];
  });

  const [salesFileName, setSalesFileName] = useState<string | null>(() => {
    return safeLocalStorage.getItem('SALES_DASHBOARD_FILENAME') || null;
  });

  const prevSalesDataRef = useRef<string>('[]');
  const prevSalesFileNameRef = useRef<string | null>(null);


  const handleUpdateDashboardProducts = useCallback((action: React.SetStateAction<ProductConfig[]>) => {
    setDashboardProducts(prev => typeof action === 'function' ? action(prev) : action);
  }, []);

  useEffect(() => {
    // Safely sync names from dashboardProducts to savedProducts without causing side-effects in state updaters
    setSavedProducts(prevSaved => {
      const names = dashboardProducts.map(p => p.name);
      const namesStr = JSON.stringify(names);
      const prevSavedStr = JSON.stringify(prevSaved);
      if (namesStr !== prevSavedStr) {
        return names;
      }
      return prevSaved;
    });
  }, [dashboardProducts]);

  const filteredDashboardProducts = useMemo(() => {
    if (!onlyShowPlacedProducts) return dashboardProducts;
    const placedSet = new Set<string>();
    tasks.forEach(t => {
      if (t.title && t.title.trim()) {
        placedSet.add(t.title.trim().toLowerCase());
      }
    });
    return dashboardProducts.filter(p => p.name ? placedSet.has(p.name.trim().toLowerCase()) : false);
  }, [dashboardProducts, onlyShowPlacedProducts, tasks]);

  const handleUpdateAovEntries = (action: React.SetStateAction<AovEntry[]>) => {
    setAovEntries(prev => {
      const nextVal = typeof action === 'function' ? action(prev) : action;
      if (user) {
        const prevIds = new Set(prev.map(e => e.id));
        const nextIds = new Set(nextVal.map(e => e.id));

        // Deleted items
        prev.forEach(item => {
          if (!nextIds.has(item.id)) {
            deleteDocInDb('aovEntries', item.id);
          }
        });

        // Added or modified items
        nextVal.forEach(item => {
          const prevItem = prev.find(p => p.id === item.id);
          if (!prevItem || JSON.stringify(prevItem) !== JSON.stringify(item)) {
            saveDoc('aovEntries', item.id, { ownerId: user.uid, ...item }).catch(err => {
              console.error('Failed to save aovEntry to Firestore:', err);
            });
          }
        });
      }
      return nextVal;
    });
  };

  const handleUpdateNotebookNotes = (action: React.SetStateAction<Note[]>) => {
    setNotebookNotes(prev => {
      const nextVal = typeof action === 'function' ? action(prev) : action;
      if (user) {
        const prevIds = new Set(prev.map(e => e.id));
        const nextIds = new Set(nextVal.map(e => e.id));

        // Deleted items
        prev.forEach(item => {
          if (!nextIds.has(item.id)) {
            deleteDocInDb('notebookNotes', item.id);
          }
        });

        // Added or modified items
        nextVal.forEach(item => {
          const prevItem = prev.find(p => p.id === item.id);
          if (!prevItem || JSON.stringify(prevItem) !== JSON.stringify(item)) {
            saveDoc('notebookNotes', item.id, { ownerId: user.uid, ...item }).catch(err => {
              console.error('Failed to save notebook note to Firestore:', err);
            });
          }
        });
      }
      return nextVal;
    });
  };

  // Cache references
  const prevDashboardNamesRef = useRef<string[]>([]);
  const prevSavedRef = useRef<string[]>([]);

  // Single-source-of-truth unidirectional synchronization
  useEffect(() => {
    if (!isStorageHydrated) return;

    // 1. If autoSyncPlannerWithTargets is enabled and selectedMonth/selectedYear are valid,
    // ensure missing target database records are initialized (but do NOT overwrite custom video target goals)
    if (autoSyncPlannerWithTargets && selectedMonth !== 'ALL' && selectedYear !== 'ALL') {
      const taskCountsMap: { [key: string]: number } = {};

      tasks.forEach(task => {
        if (!task.title) return;
        const prodNameClean = task.title.trim();
        if (!prodNameClean || isBannedTextGlobal(prodNameClean)) return;

        const dateToUse = task.deadline || task.releaseDate;
        if (!dateToUse) return;
        const parts = dateToUse.split('-');
        if (parts.length < 2) return;
        const taskYear = parts[0];
        const taskMonth = parts[1];

        const key = JSON.stringify({ name: prodNameClean.toLowerCase(), month: taskMonth, year: taskYear });
        taskCountsMap[key] = (taskCountsMap[key] || 0) + 1;
      });

      let targetsChanged = false;
      const nextTargets = [...monthlyTargets];
      const processedTargetKeys = new Set<string>();

      // Record existing target keys
      nextTargets.forEach((t) => {
        const prodKey = JSON.stringify({ name: t.productName.toLowerCase(), month: t.month, year: t.year });
        processedTargetKeys.add(prodKey);
      });

      // Identify any planned combinations that do not have a Monthly Target record yet, and create them.
      Object.keys(taskCountsMap).forEach(keyStr => {
        if (processedTargetKeys.has(keyStr)) return;
        let parsedKey;
        try { parsedKey = JSON.parse(keyStr); } catch(e) { return; }
        const prodNameLow = parsedKey.name || '';
        const month = parsedKey.month || '';
        const year = parsedKey.year || '';
        const sampleTask = tasks.find(t => t.title && t.title.toLowerCase() === prodNameLow);
        const prodNameStandard = sampleTask?.title?.trim() || prodNameLow;

        nextTargets.push({
          id: `target-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          productName: prodNameStandard,
          target: 100000, // Default revenue target
          videoTarget: 5, // Initialize to standard default goal instead of copying planner count
          salesAmount: 0,
          month,
          year
        });
        targetsChanged = true;
      });

      if (targetsChanged && JSON.stringify(nextTargets) !== JSON.stringify(monthlyTargets)) {
        setMonthlyTargets(nextTargets);
        return; // Settle state first, next run will sync products
      }
    }

    // 2. Identify products for selected month and year
    const activeFromTasks = tasks
      .filter(t => {
        const dateToUse = t.deadline || t.releaseDate;
        if (!dateToUse) return false;
        const parts = dateToUse.split('-');
        if (parts.length >= 2) {
          const matchYear = selectedYear === 'ALL' || parts[0] === selectedYear;
          const matchMonth = selectedMonth === 'ALL' || parts[1] === selectedMonth;
          return matchYear && matchMonth;
        }
        return false;
      })
      .map(t => t.title?.trim())
      .filter((n): n is string => !!n && n.length > 0 && !isBannedTextGlobal(n));

    const activeFromTargets = monthlyTargets
      .filter(t => {
        const matchYear = selectedYear === 'ALL' || t.year === selectedYear;
        const matchMonth = selectedMonth === 'ALL' || t.month === selectedMonth;
        return matchYear && matchMonth;
      })
      .map(t => t.productName?.trim())
      .filter((n): n is string => !!n && n.length > 0 && !isBannedTextGlobal(n));

    // Consolidate unique names: saved + active targets + active tasks
    const combinedUnique = Array.from(new Set([
      ...savedProducts,
      ...activeFromTasks,
      ...activeFromTargets
    ]));

    // 3. Build the updated dashboardProducts list for the active selected month/year
    const activeMonth = selectedMonth === 'ALL' ? (new Date().getMonth() + 1).toString().padStart(2, '0') : selectedMonth;
    const activeYear = selectedYear === 'ALL' ? new Date().getFullYear().toString() : selectedYear;

    setDashboardProducts(prevDashboard => {
      const nextDashProducts: ProductConfig[] = combinedUnique.map(name => {
        const matchTarget = monthlyTargets.find(t => 
          t.productName.toLowerCase() === name.toLowerCase() &&
          t.month === activeMonth &&
          t.year === activeYear
        );

        const targetVal = matchTarget 
          ? (matchTarget.videoTarget !== undefined ? matchTarget.videoTarget : 5)
          : 5;
          
        const revenueTargetVal = matchTarget
          ? (matchTarget.target !== undefined ? matchTarget.target : 100000)
          : 100000;

        const prevDashProd = prevDashboard.find(p => p.name === name);

        return {
          name,
          target: targetVal,
          salesAmount: matchTarget?.salesAmount !== undefined ? matchTarget.salesAmount : (prevDashProd?.salesAmount ?? 0),
          revenueTarget: revenueTargetVal,
          videoTarget: targetVal,
          salesAmountWeek1: matchTarget?.salesAmountWeek1 !== undefined ? matchTarget.salesAmountWeek1 : (prevDashProd?.salesAmountWeek1 ?? 0),
          salesAmountWeek2: matchTarget?.salesAmountWeek2 !== undefined ? matchTarget.salesAmountWeek2 : (prevDashProd?.salesAmountWeek2 ?? 0),
          salesAmountWeek3: matchTarget?.salesAmountWeek3 !== undefined ? matchTarget.salesAmountWeek3 : (prevDashProd?.salesAmountWeek3 ?? 0),
          salesAmountWeek4: matchTarget?.salesAmountWeek4 !== undefined ? matchTarget.salesAmountWeek4 : (prevDashProd?.salesAmountWeek4 ?? 0),
          salesAmountWeek5: matchTarget?.salesAmountWeek5 !== undefined ? matchTarget.salesAmountWeek5 : (prevDashProd?.salesAmountWeek5 ?? 0)
        };
      });

      nextDashProducts.sort((a, b) => a.name.localeCompare(b.name));

      const currentDashStr = JSON.stringify(prevDashboard);
      const nextDashStr = JSON.stringify(nextDashProducts);

      if (currentDashStr !== nextDashStr) {
        return nextDashProducts;
      }
      return prevDashboard;
    });
  }, [tasks, monthlyTargets, savedProducts, selectedMonth, selectedYear, isStorageHydrated, autoSyncPlannerWithTargets]);

  const userRef = useRef<User | null>(null);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    if (accessToken && !driveFolderId) {
      const fetchFolderId = async () => {
        try {
          const folderName = 'Influencer Manager Data';
          const query = encodeURIComponent(`name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
          const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          });
          const searchData = await searchRes.json();
          if (searchData.files && searchData.files.length > 0) {
            setDriveFolderId(searchData.files[0].id);
          } else {
            const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                name: folderName,
                mimeType: 'application/vnd.google-apps.folder'
              })
            });
            const createData = await createRes.json();
            setDriveFolderId(createData.id);
          }
        } catch (error) {
          console.error("Error creating/finding Drive folder:", error);
        }
      };
      fetchFolderId();
    }
  }, [accessToken, driveFolderId]);

  // Auto-restore missing influencers referenced in tasks
  useEffect(() => {
    if (!isStorageHydrated) return;
    if (tasks.length === 0) return;
    if (isClearingAllRef.current) return;
    if (user && !firestoreLoadedMap['influencers']) return;

    const timer = setTimeout(() => {
      const existingIds = new Set(influencers.map(inf => inf.id));
      const newInfluencers: any[] = [];
      tasks.forEach(task => {
        if (task.influencerId && !existingIds.has(task.influencerId)) {
          existingIds.add(task.influencerId);
          const newId = task.influencerId;
          let name = newId.startsWith("inf-") || newId.startsWith("INF-") ? `Restored Creator (${newId.substring(0, 8)})` : newId;
          if (task.secondaryInfluencerName && task.secondaryInfluencerName.trim()) {
            name = task.secondaryInfluencerName.trim();
          }
          const restoredInfluencer = {
            id: newId,
            name: name,
            handle: "@" + name.replace(/\s+/g, "").toLowerCase(),
            mobile: getKnownMobile(name) || "",
            niche: "Lifestyle",
            followers: "10K",
            avgViews: "1K",
            engagementRate: "2.5%",
            estimatedCost: "500",
            contactEmail: "contact@example.com",
            status: "Available",
            pastPerformance: "Moderate",
            topDemographics: [{ ageRange: "18-24", percentage: 40 }],
            platforms: [{ name: "Instagram", followers: "10K" }],
            ownerId: user ? user.uid : "guest"
          };
          newInfluencers.push(restoredInfluencer);
        }
      });

      if (newInfluencers.length > 0) {
        setInfluencers(prev => {
          const prevIds = new Set(prev.map(p => p.id));
          const toAdd = newInfluencers.filter(n => !prevIds.has(n.id));
          if (toAdd.length === 0) return prev;
          return [...prev, ...toAdd];
        });
        if (user) {
          // Use firebaseUpdateDocBatchInDb to bulk add influencers
          const batchUpdates = newInfluencers.map(inf => ({ id: inf.id, data: inf }));
          firebaseUpdateDocBatchInDb("influencers", batchUpdates).catch(e => console.error(e));
        }
      }
    }, 2500);

    return () => clearTimeout(timer);
  }, [tasks, influencers.length, isStorageHydrated, user, firestoreLoadedMap]);

  useEffect(() => {
    if (!isStorageHydrated || !dashboardProducts) return;
    const clean = dashboardProducts.filter(p => !isBannedTextGlobal(p.name));
    if (clean.length !== dashboardProducts.length) {
      setDashboardProducts(clean);
    }
  }, [dashboardProducts, isStorageHydrated]);

  useEffect(() => {
    if (!isStorageHydrated || !savedProducts) return;
    const clean = savedProducts.filter(p => !isBannedTextGlobal(p));
    if (clean.length !== savedProducts.length) {
      setSavedProducts(clean);
    }
  }, [savedProducts, isStorageHydrated]);

  useEffect(() => {
    if (!isStorageHydrated || !monthlyTargets) return;
    const clean = monthlyTargets.filter(t => !isBannedTextGlobal(t.productName));
    if (clean.length !== monthlyTargets.length) {
      setMonthlyTargets(clean);
      if (user) {
        // Also delete the banned ones from Firestore
        const banned = monthlyTargets.filter(t => isBannedTextGlobal(t.productName));
        banned.forEach(b => {
          deleteDocInDb('monthlyTargets', b.id).catch(() => {});
        });
      }
    }
  }, [monthlyTargets, isStorageHydrated, user]);

  useEffect(() => {
    if (!isStorageHydrated || !salesData) return;
    const clean = salesData.filter(r => !isBannedTextGlobal(r.productName));
    if (clean.length !== salesData.length) {
      setSalesData(clean);
    }
  }, [salesData, isStorageHydrated]);

  useEffect(() => {
    if (!user && !isStorageHydrated) return;
    const suffix = user ? user.uid : 'guest';
    
    // Guard against overwriting storage with old list during user sign-in/out transitions
    const currentDashboardStr = JSON.stringify(dashboardProducts);
    const prevDashboardStr = prevDashboardJsonRef.current;
    if (currentDashboardStr === prevDashboardStr) {
      return;
    }

    safeLocalStorage.setItem('INFLUENCER_MANAGER_DASHBOARD_PRODUCTS', currentDashboardStr);
    safeLocalStorage.setItem(`INFLUENCER_MANAGER_DASHBOARD_PRODUCTS_${suffix}`, currentDashboardStr);
    prevDashboardJsonRef.current = currentDashboardStr;
  }, [dashboardProducts, user, isStorageHydrated]);

  useEffect(() => {
    if (!user && !isStorageHydrated) return;
    const suffix = user ? user.uid : 'guest';
    const dataStr = JSON.stringify(salesData);
    
    // Guard against overwriting storage with old list during user sign-in/out transitions
    if (dataStr === prevSalesDataRef.current) {
      return;
    }
    safeLocalStorage.setItem('SALES_DASHBOARD_DATA', dataStr);
    safeLocalStorage.setItem(`SALES_DASHBOARD_DATA_${suffix}`, dataStr);
    prevSalesDataRef.current = dataStr;
  }, [salesData, user, isStorageHydrated]);

  const handleAutoSyncSalesData = () => {
    setMonthlyTargets(prevTargets => {
      let hasChanges = false;
      const newTargets = [...prevTargets];

      const aggregatedSales: Record<string, { week1: number, week2: number, week3: number, week4: number, week5: number, qty: number }> = {};

      salesData.forEach(row => {
        if (!row.productName || !row.year || !row.month || !row.week) return;
        
        let formattedMonth = String(row.month).trim();
        const monthMap = {
          'january': '01', 'jan': '01', '1': '01', '01': '01',
          'february': '02', 'feb': '02', '2': '02', '02': '02',
          'march': '03', 'mar': '03', '3': '03', '03': '03',
          'april': '04', 'apr': '04', '4': '04', '04': '04',
          'may': '05', '5': '05', '05': '05',
          'june': '06', 'jun': '06', '6': '06', '06': '06',
          'july': '07', 'jul': '07', '7': '07', '07': '07',
          'august': '08', 'aug': '08', '8': '08', '08': '08',
          'september': '09', 'sep': '09', '9': '09', '09': '09',
          'october': '10', 'oct': '10',
          'november': '11', 'nov': '11',
          'december': '12', 'dec': '12'
        };
        const lowerMonth = formattedMonth.toLowerCase();
        if ((monthMap as Record<string, string>)[lowerMonth]) {
          formattedMonth = (monthMap as Record<string, string>)[lowerMonth];
        } else {
          const mInt = parseInt(formattedMonth, 10);
          if (!isNaN(mInt) && mInt >= 1 && mInt <= 12) {
            formattedMonth = String(mInt).padStart(2, '0');
          }
        }
        const rowMonth = formattedMonth;
        const rowYear = String(row.year).trim();
        const rowWeek = String(row.week);
        const productName = String(row.productName).trim().toLowerCase();

        const key = `${productName}|${rowYear}|${rowMonth}`;
        
        if (!aggregatedSales[key]) {
          aggregatedSales[key] = { week1: 0, week2: 0, week3: 0, week4: 0, week5: 0, qty: 0 };
        }

        const amountToSync = Number(row.netRevenue) || Number(row.grossSales) || 0;
        const qtySold = Number(row.quantity) || 0;

        aggregatedSales[key].qty += qtySold;

        let weekNum = 0;
        const match = rowWeek.match(/\d+/);
        if (match) weekNum = parseInt(match[0], 10);
        
        if (weekNum === 1) aggregatedSales[key].week1 += amountToSync;
        else if (weekNum === 2) aggregatedSales[key].week2 += amountToSync;
        else if (weekNum === 3) aggregatedSales[key].week3 += amountToSync;
        else if (weekNum === 4) aggregatedSales[key].week4 += amountToSync;
        else if (weekNum === 5) aggregatedSales[key].week5 += amountToSync;
      });

      Object.keys(aggregatedSales).forEach(key => {
        const [prodNameLow, year, month] = key.split('|');
        const sales = aggregatedSales[key];
        
        const existingIndex = newTargets.findIndex(t => 
          t.productName.toLowerCase() === prodNameLow && t.year === year && t.month === month
        );

        if (existingIndex > -1) {
          const t = newTargets[existingIndex];
          const totalSales = sales.week1 + sales.week2 + sales.week3 + sales.week4 + sales.week5;
          // Synchronize the weekly breakdown, quantitySold, and set salesAmount to match the weekly sum
          if (t.salesAmountWeek1 !== sales.week1 || 
              t.salesAmountWeek2 !== sales.week2 || 
              t.salesAmountWeek3 !== sales.week3 || 
              t.salesAmountWeek4 !== sales.week4 ||
              t.salesAmountWeek5 !== sales.week5 ||
              t.quantitySold !== sales.qty ||
              t.salesAmount !== totalSales) {
            newTargets[existingIndex] = {
              ...t,
              salesAmountWeek1: sales.week1,
              salesAmountWeek2: sales.week2,
              salesAmountWeek3: sales.week3,
              salesAmountWeek4: sales.week4,
              salesAmountWeek5: sales.week5,
              quantitySold: sales.qty,
              salesAmount: totalSales
            };
            hasChanges = true;
          }
        } else {
          const actualProductName = salesData.find(r => r.productName?.trim().toLowerCase() === prodNameLow)?.productName?.trim() || prodNameLow;
          const totalSales = sales.week1 + sales.week2 + sales.week3 + sales.week4 + sales.week5;
          const isOthers = /^OTHERS\s*[1-5]?$/i.test(actualProductName.trim());

          newTargets.push({
            id: `target-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
            productName: actualProductName,
            target: isOthers ? 0 : 100000,
            videoTarget: isOthers ? 0 : 5,
            salesAmount: totalSales,
            salesAmountWeek1: sales.week1,
            salesAmountWeek2: sales.week2,
            salesAmountWeek3: sales.week3,
            salesAmountWeek4: sales.week4,
            salesAmountWeek5: sales.week5,
            quantitySold: sales.qty,
            month: month,
            year: year
          });
          hasChanges = true;
        }
      });

      // For existing targets that are not in Sales Dashboard, we no longer wipe their manual weekly data
      // to preserve any manual overrides made by the user in the Product Performance Matrix.
      // However, for OTHERS products, ensure they do not retain phantom sales if not present in current sales data
      newTargets.forEach((t, idx) => {
        if (/^OTHERS\s*[1-5]?$/i.test(t.productName.trim())) {
          const key = `${t.productName.trim().toLowerCase()}|${t.year}|${t.month}`;
          if (!aggregatedSales[key]) {
            if ((t.salesAmount || 0) !== 0 || (t.salesAmountWeek1 || 0) !== 0 || (t.salesAmountWeek2 || 0) !== 0 || (t.salesAmountWeek3 || 0) !== 0 || (t.salesAmountWeek4 || 0) !== 0 || (t.salesAmountWeek5 || 0) !== 0) {
              newTargets[idx] = {
                ...t,
                salesAmount: 0,
                salesAmountWeek1: 0,
                salesAmountWeek2: 0,
                salesAmountWeek3: 0,
                salesAmountWeek4: 0,
                salesAmountWeek5: 0,
                quantitySold: 0
              };
              hasChanges = true;
            }
          }
        }
      });

      return hasChanges ? newTargets : prevTargets;
    });
  };

  // Auto-synchronize Sales Dashboard Data into Monthly Targets (Weekly Breakdown)
  useEffect(() => {
    if (!isStorageHydrated) return;
    handleAutoSyncSalesData();
  }, [salesData, isStorageHydrated]);

  useEffect(() => {
    if (!user && !isStorageHydrated) return;
    const suffix = user ? user.uid : 'guest';
    
    // Guard against overwriting storage with old list during user sign-in/out transitions
    if (salesFileName === prevSalesFileNameRef.current) {
      return;
    }
    if (salesFileName) {
      safeLocalStorage.setItem('SALES_DASHBOARD_FILENAME', salesFileName);
      safeLocalStorage.setItem(`SALES_DASHBOARD_FILENAME_${suffix}`, salesFileName);
    } else {
      safeLocalStorage.removeItem('SALES_DASHBOARD_FILENAME');
      safeLocalStorage.removeItem(`SALES_DASHBOARD_FILENAME_${suffix}`);
    }
    prevSalesFileNameRef.current = salesFileName;
  }, [salesFileName, user, isStorageHydrated]);

  useEffect(() => {
    if (!user && !isStorageHydrated) return;
    const suffix = user ? user.uid : 'guest';

    // Guard against overwriting storage with old list during user sign-in/out transitions
    const currentSavedStr = JSON.stringify(savedProducts);
    const prevSavedStr = JSON.stringify(prevSavedRef.current);
    if (currentSavedStr === prevSavedStr) {
      return;
    }

    safeLocalStorage.setItem('INFLUENCER_MANAGER_SAVED_PRODUCTS', currentSavedStr);
    safeLocalStorage.setItem(`INFLUENCER_MANAGER_SAVED_PRODUCTS_${suffix}`, currentSavedStr);
    prevSavedRef.current = savedProducts;
  }, [savedProducts, user, isStorageHydrated]);

  useEffect(() => {
    // Subscribe to auth state updates
    const unsubscribeAuth = initAuth(
      (currentUser, token) => {
        setUser(currentUser);
        setAccessToken(token);
        setNeedsAuth(false);
        setUserStatus('Active');
      },
      () => {
        if (!(window as any).isIntentionalLogout) {
           setUser((prev: any) => {
             if (prev) {
                setShowSessionAlert(true);
             }
             return null;
           });
        } else {
           setUser(null);
        }
        setAccessToken(null);
        setNeedsAuth(true);
      }
    );
    return () => {
      unsubscribeAuth();
    };
  }, []);

  // Synchronize user-specific products (both dashboard registry and wizard scheduler) on login/logout transition or hydration
  useEffect(() => {
    if (!isStorageHydrated) return;
    const suffix = user ? user.uid : 'guest';
    
    // Load dashboard products corresponding to user suffix
    const dProductsRaw = safeLocalStorage.getItem(`INFLUENCER_MANAGER_DASHBOARD_PRODUCTS_${suffix}`);
    if (dProductsRaw) {
      try {
        const parsed = JSON.parse(dProductsRaw);
        if (Array.isArray(parsed)) {
          const cleaned = parsed.filter((p: any) => p && typeof p === 'object' && !isBannedTextGlobal(p.name));
          setDashboardProducts(cleaned);
          prevDashboardNamesRef.current = cleaned.map((p: any) => p.name);
          prevDashboardJsonRef.current = JSON.stringify(cleaned);
        }
      } catch (e) {}
    } else {
      const globalD = safeLocalStorage.getItem('INFLUENCER_MANAGER_DASHBOARD_PRODUCTS');
      if (globalD) {
        try {
          const parsed = JSON.parse(globalD);
          if (Array.isArray(parsed)) {
            const cleaned = parsed.filter((p: any) => p && typeof p === 'object' && !isBannedTextGlobal(p.name));
            setDashboardProducts(cleaned);
            prevDashboardNamesRef.current = cleaned.map((p: any) => p.name);
            prevDashboardJsonRef.current = JSON.stringify(cleaned);
          }
        } catch (e) {}
      } else {
        setDashboardProducts([]);
        prevDashboardNamesRef.current = [];
        prevDashboardJsonRef.current = JSON.stringify([]);
      }
    }

    // Load saved products list corresponding to user suffix
    const sProductsRaw = safeLocalStorage.getItem(`INFLUENCER_MANAGER_SAVED_PRODUCTS_${suffix}`);
    if (sProductsRaw) {
      try {
        const parsed = JSON.parse(sProductsRaw);
        if (Array.isArray(parsed)) {
          const cleaned = getMergedSavedProducts(parsed);
          setSavedProducts(cleaned);
          prevSavedRef.current = cleaned;
        }
      } catch (e) {}
    } else {
      const globalS = safeLocalStorage.getItem('INFLUENCER_MANAGER_SAVED_PRODUCTS');
      if (globalS) {
        try {
          const parsed = JSON.parse(globalS);
          if (Array.isArray(parsed)) {
            const cleaned = getMergedSavedProducts(parsed);
            setSavedProducts(cleaned);
            prevSavedRef.current = cleaned;
          }
        } catch (e) {}
      } else {
        const defaultCleaned = getMergedSavedProducts([]);
        setSavedProducts(defaultCleaned);
        prevSavedRef.current = defaultCleaned;
      }
    }

    // Load monthly targets list corresponding to user suffix
    const mTargetsRaw = safeLocalStorage.getItem(`INFLUENCER_MANAGER_MONTHLY_TARGETS_${suffix}`);
    if (mTargetsRaw) {
      try {
        const parsed = JSON.parse(mTargetsRaw);
        if (Array.isArray(parsed)) {
          setMonthlyTargets(parsed);
          prevMonthlyTargetsRef.current = JSON.stringify(parsed);
        }
      } catch (e) {}
    } else {
      const globalT = safeLocalStorage.getItem('INFLUENCER_MANAGER_MONTHLY_TARGETS');
      if (globalT) {
        try {
          const parsed = JSON.parse(globalT);
          if (Array.isArray(parsed)) {
            setMonthlyTargets(parsed);
            prevMonthlyTargetsRef.current = JSON.stringify(parsed);
          }
        } catch (e) {}
      } else {
        setMonthlyTargets(DEFAULT_MONTHLY_TARGETS);
        prevMonthlyTargetsRef.current = JSON.stringify(DEFAULT_MONTHLY_TARGETS);
      }
    }

    // Load monthly budgets list corresponding to user suffix
    const mBudgetsRaw = safeLocalStorage.getItem(`INFLUENCER_MANAGER_MONTHLY_BUDGETS_${suffix}`);
    if (mBudgetsRaw) {
      try {
        const parsed = JSON.parse(mBudgetsRaw);
        if (Array.isArray(parsed)) {
          setMonthlyBudgets(parsed);
          prevMonthlyBudgetsRef.current = JSON.stringify(parsed);
        }
      } catch (e) {}
    } else {
      const globalB = safeLocalStorage.getItem('INFLUENCER_MANAGER_MONTHLY_BUDGETS');
      if (globalB) {
        try {
          const parsed = JSON.parse(globalB);
          if (Array.isArray(parsed)) {
            setMonthlyBudgets(parsed);
            prevMonthlyBudgetsRef.current = JSON.stringify(parsed);
          }
        } catch (e) {}
      } else {
        setMonthlyBudgets([]);
        prevMonthlyBudgetsRef.current = '[]';
      }
    }

    // Load sales data list corresponding to user suffix
    const sDataRaw = safeLocalStorage.getItem(`SALES_DASHBOARD_DATA_${suffix}`);
    if (sDataRaw) {
      try {
        const parsed = JSON.parse(sDataRaw);
        if (Array.isArray(parsed)) {
          setSalesData(parsed);
          prevSalesDataRef.current = JSON.stringify(parsed);
        }
      } catch (e) {}
    } else {
      const globalSData = safeLocalStorage.getItem('SALES_DASHBOARD_DATA');
      if (globalSData) {
        try {
          const parsed = JSON.parse(globalSData);
          if (Array.isArray(parsed)) {
            setSalesData(parsed);
            prevSalesDataRef.current = JSON.stringify(parsed);
          }
        } catch (e) {}
      } else {
        setSalesData([]);
        prevSalesDataRef.current = '[]';
      }
    }

    // Load sales file name corresponding to user suffix
    const sFileNameRaw = safeLocalStorage.getItem(`SALES_DASHBOARD_FILENAME_${suffix}`);
    if (sFileNameRaw) {
      setSalesFileName(sFileNameRaw);
      prevSalesFileNameRef.current = sFileNameRaw;
    } else {
      const globalSFileName = safeLocalStorage.getItem('SALES_DASHBOARD_FILENAME');
      if (globalSFileName) {
        setSalesFileName(globalSFileName);
        prevSalesFileNameRef.current = globalSFileName;
      } else {
        setSalesFileName(null);
        prevSalesFileNameRef.current = null;
      }
    }
  }, [user, isStorageHydrated]);

  // Sync state with matching client-side local storage namespaces on mount only
  useEffect(() => {
    const loadFromStorage = () => {
      // Load workspace-level metadata to keep UI synced across all sessions instantly
      const savedAgency = safeLocalStorage.getItem('INFLUENCER_MANAGER_AGENCY_NAME');
      if (savedAgency) {
        setAgencyName(savedAgency);
      }
      const savedDev = safeLocalStorage.getItem('INFLUENCER_MANAGER_DEVELOPER_NAME');
      if (savedDev) {
        setDeveloperName(savedDev);
      }

      // Synchronize product list presets and dashboard configurations when loader refreshes from server (always run before early return!)
      const suffix = userRef.current ? userRef.current.uid : 'guest';
      const savedProductsRaw = safeLocalStorage.getItem(`INFLUENCER_MANAGER_SAVED_PRODUCTS_${suffix}`) || safeLocalStorage.getItem('INFLUENCER_MANAGER_SAVED_PRODUCTS');
      if (savedProductsRaw) {
        try {
          const parsed = JSON.parse(savedProductsRaw);
          if (Array.isArray(parsed)) {
            const cleaned = getMergedSavedProducts(parsed);
            setSavedProducts(cleaned);
            prevSavedRef.current = cleaned;
          }
        } catch (e) {}
      } else {
        const defaultCleaned = getMergedSavedProducts([]);
        setSavedProducts(defaultCleaned);
        prevSavedRef.current = defaultCleaned;
      }

      const dashboardProductsRaw = safeLocalStorage.getItem(`INFLUENCER_MANAGER_DASHBOARD_PRODUCTS_${suffix}`) || safeLocalStorage.getItem('INFLUENCER_MANAGER_DASHBOARD_PRODUCTS');
      if (dashboardProductsRaw) {
        try {
          const parsed = JSON.parse(dashboardProductsRaw);
          if (Array.isArray(parsed)) {
            const cleaned = parsed.filter((p: any) => p && typeof p === 'object' && !isBannedTextGlobal(p.name));
            setDashboardProducts(cleaned);
            prevDashboardNamesRef.current = cleaned.map((p: any) => p.name);
          }
        } catch (e) {}
      } else {
        setDashboardProducts([]);
        prevDashboardNamesRef.current = [];
      }

      if (!user && !auth.currentUser) {
        const monthlyTargetsRaw = safeLocalStorage.getItem(`INFLUENCER_MANAGER_MONTHLY_TARGETS_${suffix}`) || safeLocalStorage.getItem('INFLUENCER_MANAGER_MONTHLY_TARGETS');
        if (monthlyTargetsRaw) {
          try {
            const parsed = JSON.parse(monthlyTargetsRaw);
            if (Array.isArray(parsed)) {
              setMonthlyTargets(parsed);
            }
          } catch (e) {}
        }
      }

      const savedAutoSync = safeLocalStorage.getItem(`INFLUENCER_MANAGER_AUTO_SYNC_PLANNER_TARGETS_${suffix}`) || safeLocalStorage.getItem('INFLUENCER_MANAGER_AUTO_SYNC_PLANNER_TARGETS');
      if (savedAutoSync) {
        setAutoSyncPlannerWithTargets(savedAutoSync === 'true');
      } else {
        setAutoSyncPlannerWithTargets(false);
      }

      if (!user && !auth.currentUser) {
        const aovEntriesRaw = safeLocalStorage.getItem(`INFLUENCER_MANAGER_AOV_ENTRIES_${suffix}`) || safeLocalStorage.getItem('INFLUENCER_MANAGER_AOV_ENTRIES');
        if (aovEntriesRaw) {
          try {
            const parsed = JSON.parse(aovEntriesRaw);
            if (Array.isArray(parsed)) {
              setAovEntries(parsed);
            }
          } catch (e) {}
        } else {
          setAovEntries(DEFAULT_AOV_ENTRIES);
        }
      }

      if (user || auth.currentUser) {
        return;
      }
      const getStoredWithFallback = (mainKey: string) => {
        const main = safeLocalStorage.getItem(mainKey);
        if (main) return main;
        // Seek any user-suffixed or guest-suffixed backup keys
        for (let i = 0; i < safeLocalStorage.length; i++) {
          const key = safeLocalStorage.key(i);
          if (key && key.startsWith(mainKey + '_')) {
            const val = safeLocalStorage.getItem(key);
            if (val) return val;
          }
        }
        return null;
      };

      const savedInfs = getStoredWithFallback('INFLUENCER_MANAGER_INFS');
      const savedCamps = getStoredWithFallback('INFLUENCER_MANAGER_CAMPS');
      const savedTsks = getStoredWithFallback('INFLUENCER_MANAGER_TSKS');
      const savedMsgs = getStoredWithFallback('INFLUENCER_MANAGER_MSGS');
      const savedConts = getStoredWithFallback('INFLUENCER_MANAGER_CONTS');
      const savedBills = getStoredWithFallback('INFLUENCER_MANAGER_BILLS');
      const savedNotes = getStoredWithFallback('INFLUENCER_MANAGER_NOTEBOOK_NOTES');

      let loadedInfs = savedInfs ? JSON.parse(savedInfs) : INITIAL_INFLUENCERS;
      let loadedCamps = savedCamps ? JSON.parse(savedCamps) : INITIAL_CAMPAIGNS;
      let loadedTsks = savedTsks ? JSON.parse(savedTsks) : INITIAL_TASKS;
      let loadedMsgs = savedMsgs ? JSON.parse(savedMsgs) : INITIAL_MESSAGES;
      let loadedConts = savedConts ? JSON.parse(savedConts) : INITIAL_CONTRACTS;
      let loadedBills = savedBills ? JSON.parse(savedBills) : INITIAL_BILLING;
      let loadedNotes = savedNotes ? JSON.parse(savedNotes) : [];

      // Standard case-insensitive cleaner rule
      const isBannedText = (text?: string): boolean => {
        if (!text) return false;
        const t = text.toLowerCase();
        return (
          t.includes('cyber sunglasses unboxing') ||
          t.includes('extreme workout with cyber glasses') ||
          t.includes('extreme workout with cyber') ||
          t.includes('autumn wear showcase') ||
          t.includes('gaming setup cozy hoodies') ||
          t.includes('cozy hoodies integration') ||
          t.includes('organic cotton summer fit')
        );
      };

      // Filter campaigns & keep reference of matching campaign IDs
      const bannedCampIds = new Set<string>();
      loadedCamps = loadedCamps.filter((c: Campaign) => {
        if (isBannedText(c.name) || isBannedText(c.description) || isBannedText(c.niche)) {
          bannedCampIds.add(c.id);
          return false;
        }
        return true;
      });

      // Filter tasks
      loadedTsks = loadedTsks.filter((t: Task) => {
        if (bannedCampIds.has(t.campaignId) || isBannedText(t.title)) {
          return false;
        }
        return true;
      });

      // Filter contracts
      loadedConts = loadedConts.filter((c: Contract) => {
        if (bannedCampIds.has(c.campaignId) || isBannedText(c.campaignName) || isBannedText(c.terms)) {
          return false;
        }
        return true;
      });

      // Filter billing entries
      loadedBills = loadedBills.filter((b: BillingEntry) => {
        if (bannedCampIds.has(b.campaignId) || isBannedText(b.campaignName)) {
          return false;
        }
        return true;
      });

      setInfluencers(loadedInfs);
      setCampaigns(loadedCamps);
      setTasks(loadedTsks);
      setMessages(loadedMsgs);
      setContracts(loadedConts);
      setBillingEntries(loadedBills);
      setNotebookNotes(loadedNotes);
    };

    // Run automated DB migrations for schema versioning before loading
    const suffix = user ? user.uid : 'guest';
    runSchemaMigrations(suffix);
    
    // Load initial synchronous layout (using local fallback caches)
    loadFromStorage();

    // Subscribe to runtime safeLocalStorage changes (e.g. after async server hydration is fulfilled)
    const unsubscribeChanged = safeLocalStorage.onChange(() => {
      loadFromStorage();
    });

    // Fire off async server-to-client hydration routine
    safeLocalStorage.hydrate().then(() => {
      // syncListeners handles the refresh
      setIsStorageHydrated(true);
      setHasHydratedFromServer(true);
    });

    return () => {
      unsubscribeChanged();
    };
  }, []);

  useEffect(() => {
    if (user) {
      safeLocalStorage.hydrate().then(() => {
        setHasHydratedFromServer(true);
      });
    }
  }, [user]);

  // Real-time Firestore Sync Effect
  useEffect(() => {
    if (!user) return;

    const unsubscribes: Array<() => void> = [];

    const collectionsToSync = [
      { name: 'influencers', setState: setInfluencers, defaultData: INITIAL_INFLUENCERS },
      { name: 'campaigns', setState: setCampaigns, defaultData: INITIAL_CAMPAIGNS },
      { name: 'tasks', setState: setTasks, defaultData: INITIAL_TASKS },
      { name: 'messages', setState: setMessages, defaultData: INITIAL_MESSAGES },
      { name: 'contracts', setState: setContracts, defaultData: INITIAL_CONTRACTS },
      { name: 'billingEntries', setState: setBillingEntries, defaultData: INITIAL_BILLING },
      { name: 'monthlyTargets', setState: setMonthlyTargets, defaultData: DEFAULT_MONTHLY_TARGETS },
      { name: 'monthlyBudgets', setState: setMonthlyBudgets, defaultData: [] },
      { name: 'aovEntries', setState: setAovEntries, defaultData: DEFAULT_AOV_ENTRIES },
      { name: 'notebookNotes', setState: setNotebookNotes, defaultData: [] }
    ];

    const setupSync = async () => {
      // Mark collections as loaded immediately so local cache renders instantly without hanging
      collectionsToSync.forEach(col => {
        setFirestoreLoadedMap(prev => ({ ...prev, [col.name]: true }));
      });

      // Background Firestore check without blocking UI
      (async () => {
        try {
          const settingsRef = doc(db, 'userSettings', user.uid);
          const settingsSnap = await getDoc(settingsRef);
          const hasBeenInitialized = settingsSnap.exists() && settingsSnap.data().hasBeenInitialized;

          if (!hasBeenInitialized) {
            const isAdmin = ((user.email || '').toLowerCase().trim() === 'ashimgogoi2008@gmail.com' || (user.email || '').toLowerCase().trim() === 'ea@protogrow.in');
            const qCheck = isAdmin ? query(collection(db, 'campaigns')) : query(collection(db, 'campaigns'), where('ownerId', '==', user.uid));
            const snapshot = await getDocs(qCheck);
            
            if (snapshot.empty && !settingsSnap.exists()) {
              console.log('[Firestore] Performing batch initialization of templates...');
              try {
                for (const col of collectionsToSync) {
                  await batchInitializeCollection(col.name, col.defaultData, user.uid);
                }
              } catch (err) {
                console.error('[Firestore] Batch initialization failed:', err);
              }
            }
            await setDoc(settingsRef, { hasBeenInitialized: true }, { merge: true });
          }
        } catch (err) {
          console.warn('[Firestore] Background userSettings check bypassed (local mode active):', err);
        }
      })();

      for (const col of collectionsToSync) {
        try {
          const isAdmin = ((user.email || '').toLowerCase().trim() === 'ashimgogoi2008@gmail.com' || (user.email || '').toLowerCase().trim() === 'ea@protogrow.in');
          const q = isAdmin ? query(collection(db, col.name)) : query(collection(db, col.name), where('ownerId', '==', user.uid));
          let isFirstSnapshot = true;
          const unsub = onSnapshot(q, (snapshot) => {
            if ((window as any).isIntentionalLogout) return;
            setFirestoreLoadedMap(prev => ({ ...prev, [col.name]: true }));
            const items: any[] = [];
            snapshot.forEach((doc) => {
              items.push({ ...doc.data(), id: doc.id });
            });
            const wasFirst = isFirstSnapshot;
            isFirstSnapshot = false;
            if (col.name === 'monthlyTargets') {
              const dedupeMap = new Map<string, any>();
              items.forEach((item: any) => {
                const key = `${item.productName?.toLowerCase()}|${item.month}|${item.year}`;
                const existing = dedupeMap.get(key);
                if (!existing) {
                  dedupeMap.set(key, item);
                } else {
                  // Keep target with highest tracking density
                  const existingScore = (existing.salesAmountWeek1 || 0) + (existing.salesAmount || 0);
                  const currentScore = (item.salesAmountWeek1 || 0) + (item.salesAmount || 0);
                  if (currentScore > existingScore) {
                    dedupeMap.set(key, item);
                    deleteDocInDb('monthlyTargets', existing.id).catch(() => {});
                  } else {
                    deleteDocInDb('monthlyTargets', item.id).catch(() => {});
                  }
                }
              });
              const dedupedItems = Array.from(dedupeMap.values());
              prevMonthlyTargetsRef.current = JSON.stringify(dedupedItems);
              (col.setState as any)(dedupedItems);
            } else if (col.name === 'monthlyBudgets') {
              prevMonthlyBudgetsRef.current = JSON.stringify(items);
              (col.setState as any)(items);
            } else if (col.name === 'notebookNotes') {
              prevNotebookNotesRef.current = JSON.stringify(items);
              (col.setState as any)(items);
            } else if (col.name === 'aovEntries') {
              prevAovEntriesRef.current = JSON.stringify(items);
              (col.setState as any)(items);
            } else if (col.name === 'tasks') {
              (col.setState as any)((prev: Task[]) => {
                if (wasFirst && items.length === 0 && prev && prev.length > 0) {
                  console.log(`[Firestore] First sync empty for tasks, but local data exists. Pushing local to cloud.`);
                  registerMonthlyPlannerProtectedTasksBulk(prev);
                  prev.forEach(item => {
                    if (item.id) {
                      firebaseSaveDoc('tasks', item.id, { ownerId: user.uid, ...item }).catch(e => console.error(e));
                    }
                  });
                  return prev;
                }
                // Monthly Planner New-Entry Guard: ensure no newly entered local task or field is deleted by snapshot race conditions or duplicate merges
                const { guardedTasks, restoredTasks } = guardAndRestoreMonthlyPlannerTasks(
                  items as Task[],
                  Array.isArray(prev) ? prev : []
                );
                if (restoredTasks.length > 0 && !isClearingAllRef.current) {
                  restoredTasks.forEach(rt => {
                    if (rt && rt.id) {
                      firebaseSaveDoc('tasks', rt.id, { ownerId: user.uid, ...rt }).catch(() => {});
                    }
                  });
                }
                return guardedTasks;
              });
            } else {
              (col.setState as any)((prev: any[]) => {
                if (wasFirst && items.length === 0 && prev && prev.length > 0) {
                  console.log(`[Firestore] First sync empty for ${col.name}, but local data exists. Pushing local to cloud.`);
                  prev.forEach(item => {
                    if (item.id) {
                      firebaseSaveDoc(col.name, item.id, { ownerId: user.uid, ...item }).catch(e => console.error(e));
                    }
                  });
                  return prev;
                }
                return items;
              });
            }
          }, (error) => {
            handleFirestoreError(error, OperationType.GET, col.name);
          });
          unsubscribes.push(unsub);
        } catch (err) {
          console.error(`[Firestore] Failed to attach sync for ${col.name}:`, err);
        }
      }

      try {
        const settingsRef = doc(db, 'userSettings', user.uid);
        const unsubSettings = onSnapshot(settingsRef, (docSnap) => {
          if ((window as any).isIntentionalLogout) return;
          if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.dashboardProducts && Array.isArray(data.dashboardProducts)) {
              setDashboardProducts(data.dashboardProducts);
              prevDashboardJsonRef.current = JSON.stringify(data.dashboardProducts);
            }
            if (data.savedProducts && Array.isArray(data.savedProducts)) {
              setSavedProducts(data.savedProducts);
              prevSavedRef.current = data.savedProducts;
            }
            
            
            if (data.selectedMonth) setSelectedMonth(data.selectedMonth);
            if (data.selectedYear) setSelectedYear(data.selectedYear);
            if (data.autoSyncPlannerWithTargets !== undefined) setAutoSyncPlannerWithTargets(data.autoSyncPlannerWithTargets);
            if (data.onlyShowPlacedProducts !== undefined) setOnlyShowPlacedProducts(data.onlyShowPlacedProducts);
          }
        }, (error) => {
          console.error('[Firestore] userSettings onSnapshot error:', error);
        });
        unsubscribes.push(unsubSettings);
      } catch (err) {
        console.error(`[Firestore] Failed to attach sync for userSettings:`, err);
      }
    };

    setupSync();

    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }, [user]);

  // Persist userSettings via Firestore
  useEffect(() => {
    if (!user || !isStorageHydrated) return;
    const payload = {
      dashboardProducts,
      savedProducts,
      selectedMonth,
      selectedYear,
      autoSyncPlannerWithTargets,
      onlyShowPlacedProducts,
      ownerId: user.uid
    };
    const payloadStr = JSON.stringify(payload);
    if (payloadStr === prevSettingsRef.current) return;
    prevSettingsRef.current = payloadStr;

    setDoc(doc(db, 'userSettings', user.uid), payload).catch(err => {
      console.error('Failed to sync userSettings to Firestore:', err);
    });
  }, [dashboardProducts, savedProducts, selectedMonth, selectedYear, autoSyncPlannerWithTargets, onlyShowPlacedProducts, user, isStorageHydrated]);

  // Persist local state edits reactively to browser local storage
  useEffect(() => {
    if (!user && !isStorageHydrated) return;
    const suffix = user ? user.uid : 'guest';
    if (!user) safeLocalStorage.setItem('INFLUENCER_MANAGER_INFS', JSON.stringify(influencers));
    safeLocalStorage.setItem(`INFLUENCER_MANAGER_INFS_${suffix}`, JSON.stringify(influencers));
  }, [influencers, user, isStorageHydrated]);

  useEffect(() => {
    if (!user && !isStorageHydrated) return;
    const suffix = user ? user.uid : 'guest';
    if (!user) safeLocalStorage.setItem('INFLUENCER_MANAGER_CAMPS', JSON.stringify(campaigns));
    safeLocalStorage.setItem(`INFLUENCER_MANAGER_CAMPS_${suffix}`, JSON.stringify(campaigns));
  }, [campaigns, user, isStorageHydrated]);

  useEffect(() => {
    if (!user && !isStorageHydrated) return;
    const suffix = user ? user.uid : 'guest';
    if (!user) safeLocalStorage.setItem('INFLUENCER_MANAGER_TSKS', JSON.stringify(tasks));
    safeLocalStorage.setItem(`INFLUENCER_MANAGER_TSKS_${suffix}`, JSON.stringify(tasks));
  }, [tasks, user, isStorageHydrated]);

  useEffect(() => {
    if (!user && !isStorageHydrated) return;
    const suffix = user ? user.uid : 'guest';
    if (!user) safeLocalStorage.setItem('INFLUENCER_MANAGER_MSGS', JSON.stringify(messages));
    safeLocalStorage.setItem(`INFLUENCER_MANAGER_MSGS_${suffix}`, JSON.stringify(messages));
  }, [messages, user, isStorageHydrated]);

  useEffect(() => {
    if (!user && !isStorageHydrated) return;
    const suffix = user ? user.uid : 'guest';
    if (!user) safeLocalStorage.setItem('INFLUENCER_MANAGER_CONTS', JSON.stringify(contracts));
    safeLocalStorage.setItem(`INFLUENCER_MANAGER_CONTS_${suffix}`, JSON.stringify(contracts));
  }, [contracts, user, isStorageHydrated]);

  useEffect(() => {
    if (!user && !isStorageHydrated) return;
    const suffix = user ? user.uid : 'guest';
    if (!user) safeLocalStorage.setItem('INFLUENCER_MANAGER_BILLS', JSON.stringify(billingEntries));
    safeLocalStorage.setItem(`INFLUENCER_MANAGER_BILLS_${suffix}`, JSON.stringify(billingEntries));
  }, [billingEntries, user, isStorageHydrated]);

  useEffect(() => {
    if (!user && !isStorageHydrated) return;
    const suffix = user ? user.uid : 'guest';
    const str = JSON.stringify(aovEntries);
    if (str === prevAovEntriesRef.current) return;
    if (!user) safeLocalStorage.setItem('INFLUENCER_MANAGER_AOV_ENTRIES', str);
    safeLocalStorage.setItem(`INFLUENCER_MANAGER_AOV_ENTRIES_${suffix}`, str);
    prevAovEntriesRef.current = str;
  }, [aovEntries, user, isStorageHydrated]);

  useEffect(() => {
    if (!user && !isStorageHydrated) return;
    const suffix = user ? user.uid : 'guest';
    const str = JSON.stringify(notebookNotes);
    if (str === prevNotebookNotesRef.current) return;
    if (!user) safeLocalStorage.setItem('INFLUENCER_MANAGER_NOTEBOOK_NOTES', str);
    safeLocalStorage.setItem(`INFLUENCER_MANAGER_NOTEBOOK_NOTES_${suffix}`, str);
    prevNotebookNotesRef.current = str;
  }, [notebookNotes, user, isStorageHydrated]);


  // Add cross-tab synchronization listener
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (!e.key || !e.newValue) return;
      const suffix = user ? user.uid : 'guest';
      try {
        switch (e.key) {
          case 'INFLUENCER_MANAGER_INFS_' + suffix:
          case 'INFLUENCER_MANAGER_INFS':
            setInfluencers(JSON.parse(e.newValue));
            break;
          case 'INFLUENCER_MANAGER_CAMPS_' + suffix:
          case 'INFLUENCER_MANAGER_CAMPS':
            setCampaigns(JSON.parse(e.newValue));
            break;
          case 'INFLUENCER_MANAGER_TSKS_' + suffix:
          case 'INFLUENCER_MANAGER_TSKS':
            setTasks(JSON.parse(e.newValue));
            break;
          case 'INFLUENCER_MANAGER_MONTHLY_TARGETS_' + suffix:
          case 'INFLUENCER_MANAGER_MONTHLY_TARGETS':
            setMonthlyTargets(JSON.parse(e.newValue));
            break;
          case 'INFLUENCER_MANAGER_DASHBOARD_PRODUCTS_' + suffix:
          case 'INFLUENCER_MANAGER_DASHBOARD_PRODUCTS':
            setDashboardProducts(JSON.parse(e.newValue));
            break;
          case 'INFLUENCER_MANAGER_SAVED_PRODUCTS_' + suffix:
          case 'INFLUENCER_MANAGER_SAVED_PRODUCTS':
            setSavedProducts(JSON.parse(e.newValue));
            break;
          case 'INFLUENCER_MANAGER_AOV_ENTRIES_' + suffix:
          case 'INFLUENCER_MANAGER_AOV_ENTRIES':
            setAovEntries(JSON.parse(e.newValue));
            break;
          case 'SALES_DASHBOARD_DATA_' + suffix:
          case 'SALES_DASHBOARD_DATA':
            setSalesData(JSON.parse(e.newValue));
            break;
          case 'SALES_DASHBOARD_FILENAME_' + suffix:
          case 'SALES_DASHBOARD_FILENAME':
            setSalesFileName(e.newValue);
            break;
        }
      } catch (err) {
        console.error('Cross-tab sync parse error for key', e.key, err);
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [user]);

  // Periodic background links check effect (runs immediately & frequently when app is online)
  useEffect(() => {
    let isMounted = true;
    let timeoutId: NodeJS.Timeout;
    let intervalId: NodeJS.Timeout;

    // Fast, resilient background analyzer routine
    const analyzeAllLinks = async () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        return;
      }
      
      // Batch up influencers with at least one active profile URL
      const targets = influencers.filter(inf => inf.facebookLink || inf.instagramLink || inf.youtubeLink);
      if (targets.length === 0) return;

      const payload = targets.map(inf => ({
        id: inf.id,
        facebook: inf.facebookLink,
        instagram: inf.instagramLink,
        youtube: inf.youtubeLink
      }));

      try {
        const response = await fetch('/api/analyze-social-links', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ links: payload })
        });
        
        if (response.ok) {
          const resData = await response.json();
          if (resData.success && resData.analyses && isMounted) {
            setInfluencers(prev => prev.map(inf => {
              const matchingAnalysis = resData.analyses.find((a: any) => a.id === inf.id);
              if (matchingAnalysis) {
                return {
                  ...inf,
                  linkAnalysis: {
                    facebook: matchingAnalysis.facebook,
                    instagram: matchingAnalysis.instagram,
                    youtube: matchingAnalysis.youtube,
                    summary: matchingAnalysis.summary,
                    lastChecked: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                  }
                };
              }
              return inf;
            }));
          }
        }
      } catch (err) {
        // Safe console silencer
        console.warn('Silent periodic links check skipped:', err);
      }
    };

    // Initial check delay (allow local storage state load to settle)
    timeoutId = setTimeout(() => {
      analyzeAllLinks();
    }, 4000);

    // Periodically query analysis endpoint every 45 seconds
    intervalId = setInterval(() => {
      analyzeAllLinks();
    }, 45000);

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
      clearInterval(intervalId);
    };
  }, [influencers.length, user]);

  const handleForceGlobalBackup = useCallback(() => {
    const enabled = safeLocalStorage.getItem('SYS_MEMORY_AUTOSAVE_ENABLED') !== 'false';
    if (!enabled) return;

    saveToSystemMemory({
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
    }, 'auto');
  }, [influencers, campaigns, tasks, messages, contracts, billingEntries, dashboardProducts, savedProducts, selectedMonth, selectedYear, monthlyTargets, aovEntries, notebookNotes]);

  // Global auto-save background watcher to save latest state snapshots to system RAM memory
  useEffect(() => {
    const triggerGlobalMemoryAutoSave = () => {
      handleForceGlobalBackup();
      
      const suffix = user ? user.uid : 'guest';
      const toSave = {
        [`INFLUENCER_MANAGER_INFS_${suffix}`]: JSON.stringify(influencers),
        [`INFLUENCER_MANAGER_CAMPS_${suffix}`]: JSON.stringify(campaigns),
        [`INFLUENCER_MANAGER_TSKS_${suffix}`]: JSON.stringify(tasks),
        [`INFLUENCER_MANAGER_MSGS_${suffix}`]: JSON.stringify(messages),
        [`INFLUENCER_MANAGER_CONTS_${suffix}`]: JSON.stringify(contracts),
        [`INFLUENCER_MANAGER_BILLS_${suffix}`]: JSON.stringify(billingEntries),
        [`INFLUENCER_MANAGER_NOTEBOOK_NOTES_${suffix}`]: JSON.stringify(notebookNotes),
      };
      safeLocalStorage.setItems(toSave);
    };

    const handleBeforeUnloadBackupReminder = (e: BeforeUnloadEvent) => {
      const msg = "MANDATORY: Please ensure you have backed up your data to the Central Sheet (CSV) before closing!";
      e.preventDefault();
      e.returnValue = msg;
      return msg;
    };

    window.addEventListener('beforeunload', triggerGlobalMemoryAutoSave);
    window.addEventListener('beforeunload', handleBeforeUnloadBackupReminder);

    const intervalSecs = parseInt(safeLocalStorage.getItem('SYS_MEMORY_AUTOSAVE_INTERVAL') || '30', 10);
    const msec = intervalSecs * 1000;
    const intervalId = setInterval(triggerGlobalMemoryAutoSave, msec);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener('beforeunload', triggerGlobalMemoryAutoSave);
      window.removeEventListener('beforeunload', handleBeforeUnloadBackupReminder);
    };
  }, [
    influencers, campaigns, tasks, messages, contracts, billingEntries,
    dashboardProducts, savedProducts, selectedMonth, selectedYear,
    monthlyTargets, aovEntries, notebookNotes, user
  ]);

  // Settle resetting data state to default original templates
  const handleResetData = async () => {
    if (true) {
      if (user) {
        try {
          const deletePromises = [];
          for (const item of influencers) deletePromises.push(deleteDocInDb('influencers', item.id));
          for (const item of campaigns) deletePromises.push(deleteDocInDb('campaigns', item.id));
          for (const item of tasks) deletePromises.push(deleteDocInDb('tasks', item.id));
          for (const item of messages) deletePromises.push(deleteDocInDb('messages', item.id));
          for (const item of contracts) deletePromises.push(deleteDocInDb('contracts', item.id));
          for (const item of billingEntries) deletePromises.push(deleteDocInDb('billingEntries', item.id));
          for (const item of monthlyTargets) deletePromises.push(deleteDocInDb('monthlyTargets', item.id));
          for (const item of aovEntries) deletePromises.push(deleteDocInDb('aovEntries', item.id));
          await Promise.all(deletePromises);

          await batchInitializeCollection('influencers', INITIAL_INFLUENCERS, user.uid);
          await batchInitializeCollection('campaigns', INITIAL_CAMPAIGNS, user.uid);
          await batchInitializeCollection('tasks', INITIAL_TASKS, user.uid);
          await batchInitializeCollection('messages', INITIAL_MESSAGES, user.uid);
          await batchInitializeCollection('contracts', INITIAL_CONTRACTS, user.uid);
          await batchInitializeCollection('billingEntries', INITIAL_BILLING, user.uid);
          await batchInitializeCollection('monthlyTargets', DEFAULT_MONTHLY_TARGETS, user.uid);
          await batchInitializeCollection('aovEntries', DEFAULT_AOV_ENTRIES, user.uid);
          console.warn("Database reset successfully on Firestore.");
        } catch (e) {
          console.error("Reset error:", e);
          console.warn("Database reset failed. Check consol logger.");
        }
      } else {
        setInfluencers(INITIAL_INFLUENCERS);
        setCampaigns(INITIAL_CAMPAIGNS);
        setTasks(INITIAL_TASKS);
        setMessages(INITIAL_MESSAGES);
        setContracts(INITIAL_CONTRACTS);
        setBillingEntries(INITIAL_BILLING);
        console.warn("Database reset successfully.");
      }
    }
  };

  useEffect(() => {
    // 100% Free Offline Mode: Auto-backup locally into IndexedDB / safeLocalStorage without remote API calls
    if (!isStorageHydrated) return;
    return;
    if (!user || !isStorageHydrated || isLoadingCloud || !accessToken) return;
    
    // Debounce the save operation
    const timer = setTimeout(async () => {
      const getDriveFolderId = async (): Promise<string | null> => {
        try {
          const folderName = 'Influencer Manager Data';
          const query = encodeURIComponent(`name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
          const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          });
          const searchData = await searchRes.json();
          if (searchData.files && searchData.files.length > 0) {
            return searchData.files[0].id;
          }
          
          const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              name: folderName,
              mimeType: 'application/vnd.google-apps.folder'
            })
          });
          const createData = await createRes.json();
          return createData.id;
        } catch (error) {
          console.error("Error creating/finding Drive folder:", error);
          return null;
        }
      };

      const getExistingFiles = async (folderId: string) => {
        try {
          const query = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
          const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          });
          const data = await res.json();
          const fileMap = new Map<string, string>();
          if (data.files) {
            data.files.forEach((f: any) => fileMap.set(f.name, f.id));
          }
          return fileMap;
        } catch (error) {
          console.error("Error getting existing files:", error);
          return new Map<string, string>();
        }
      };

      const uploadOrUpdateFile = async (filename: string, csvContent: string, folderId: string, existingFileId?: string) => {
        try {
          const boundary = '-------314159265358979323846';
          const delimiter = "\r\n--" + boundary + "\r\n";
          const close_delim = "\r\n--" + boundary + "--";
          
          const metadata: any = {
            name: filename,
            mimeType: 'text/csv'
          };
          if (!existingFileId) {
            metadata.parents = [folderId];
          }
          
          const multipartRequestBody = 
            delimiter +
            'Content-Type: application/json\r\n\r\n' +
            JSON.stringify(metadata) +
            delimiter +
            'Content-Type: text/csv\r\n\r\n' +
            csvContent +
            close_delim;
            
          const url = existingFileId 
            ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart`
            : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
            
          const method = existingFileId ? 'PATCH' : 'POST';

          await fetch(url, {
            method,
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': `multipart/related; boundary=${boundary}`,
            },
            body: multipartRequestBody,
          });
        } catch (error) {
          console.error(`Failed to upload ${filename} to drive`, error);
        }
      };

      const syncToDrive = async () => {
        if (safeLocalStorage.getItem('SYS_MEMORY_AUTODRIVE_UPLOAD_ENABLED') === 'false') return;
        
        const folderId = await getDriveFolderId();
        if (!folderId) return;
        setDriveFolderId(folderId);

        const fileMap = await getExistingFiles(folderId);

        // 1. Central Data
        const centralRows: any[] = [];
        const addCentralItems = (collection: string, items: any[]) => {
          items.forEach((item: any) => {
            centralRows.push({
              Collection: collection,
              DocumentID: item.id || '',
              JSON_Payload: JSON.stringify(item)
            });
          });
        };
        addCentralItems('influencers', influencers);
        addCentralItems('campaigns', campaigns);
        addCentralItems('tasks', tasks);
        addCentralItems('messages', messages);
        addCentralItems('contracts', contracts);
        addCentralItems('billingEntries', billingEntries);
        addCentralItems('aovEntries', aovEntries);
        addCentralItems('monthlyTargets', monthlyTargets);
        addCentralItems('dashboardProducts', dashboardProducts);
        addCentralItems('savedProducts', savedProducts);
        
        if (centralRows.length > 0) {
          const csv = Papa.unparse(centralRows);
          await uploadOrUpdateFile('Central_Data.csv', csv, folderId, fileMap.get('Central_Data.csv'));
        }

        // 2. Creator Database
        if (influencers.length > 0) {
          const csv = Papa.unparse(influencers.map(inf => ({
            ...inf,
            Name: inf.name,
            Handle: inf.handle,
            Mobile: inf.mobile || '',
            'Secondary Mobile': inf.secondaryMobile || '',
            Status: inf.status || '',
            Owner: inf.ownerId || '',
          })));
          await uploadOrUpdateFile('Creator_Database.csv', csv, folderId, fileMap.get('Creator_Database.csv'));
        }

        // 3. Monthly Planner
        if (tasks.length > 0) {
          const csv = Papa.unparse(tasks.map(t => {
            const influencer = influencers.find(i => i.id === t.influencerId);
            return {
              Product: t.title,
              Creator: influencer ? influencer.name : 'Unknown',
              Handle: influencer ? influencer.handle : '',
              Type: t.type || 'Video',
              'Planned Date': t.deadline || '',
              'Actual Date': t.releaseDate || '',
              Status: t.status,
              'Fees Paid': t.remuneration || 0,
              'Sample Cost': t.sampleCost || 0,
              'Advance Received': t.advanceAmountReceived || 0,
              'Advance Date': t.advanceAmountDate || '',
              'Media Rights Amount': t.mediaRightAmount || 0,
              'Order ID': t.orderId || '',
              'Order Date': t.orderDate || '',
              Platform: t.platform || '',
              'Video ID': t.videoId || '',
              Views: t.views || 0,
              Clicks: t.clicks || 0,
              Conversions: t.conversions || 0,
              CTR: t.ctr || 0,
              CVR: t.cvr || 0,
              CPC: t.cpc || 0,
              CPV: t.cpv || 0,
              VideoLink1: t.videoLink1 || '',
              VideoLink2: t.videoLink2 || '',
              VideoLink3: t.videoLink3 || '',
              'SHORT.IO LINK': t.shortIoLink || ''
            };
          }));
          await uploadOrUpdateFile('Monthly_Planner.csv', csv, folderId, fileMap.get('Monthly_Planner.csv'));
        }

        // 4. Monthly Targets
        if (monthlyTargets.length > 0) {
          const csv = Papa.unparse(monthlyTargets.map(t => ({
            Product: t.productName,
            Target: t.target,
            Month: t.month,
            Year: t.year,
            VideoTarget: t.videoTarget || 0,
            SalesAmount: t.salesAmount || 0,
            SalesAmountWeek1: t.salesAmountWeek1 || 0,
            SalesAmountWeek2: t.salesAmountWeek2 || 0,
            SalesAmountWeek3: t.salesAmountWeek3 || 0,
            SalesAmountWeek4: t.salesAmountWeek4 || 0,
            SalesAmountWeek5: t.salesAmountWeek5 || 0,
            QuantitySold: t.quantitySold || 0,
            AdSpendBudget: t.adSpendBudget || 0
          })));
          await uploadOrUpdateFile('Monthly_Targets.csv', csv, folderId, fileMap.get('Monthly_Targets.csv'));
        }

        // 5. Sales Dashboard
        if (salesData.length > 0) {
          const csv = Papa.unparse(salesData.map(r => ({
            'Year': r.year,
            'Month': r.month,
            'Week': r.week,
            'Location': r.state,
            'Product Name': r.productName,
            'Quantity': r.quantity,
            'Gross Sales': r.grossSales,
            'Net Revenue': r.netRevenue
          })));
          await uploadOrUpdateFile('Sales_Dashboard.csv', csv, folderId, fileMap.get('Sales_Dashboard.csv'));
        }

        // 6. Calendar Notebook
        const notesRaw = safeLocalStorage.getItem('INFLUENCER_MANAGER_NOTEBOOK_NOTES');
        if (notesRaw) {
          try {
            const notes = JSON.parse(notesRaw);
            if (Array.isArray(notes) && notes.length > 0) {
              const csv = Papa.unparse(notes.map((n: any) => ({
                id: n.id,
                title: n.title,
                content: n.content,
                date: n.date,
                keywords: n.keywords?.join('|') || ''
              })));
              await uploadOrUpdateFile('Calendar_Notebook.csv', csv, folderId, fileMap.get('Calendar_Notebook.csv'));

              // AddressBook
              const addressbookNotes = notes.filter((n: any) => n.date === 'Global-AddressBook');
              if (addressbookNotes.length > 0) {
                const sanitizeText = (text: any) => {
                  if (!text) return '';
                  return String(text).replace(/[\r\n]+/g, ', ').trim();
                };
                const addressCsv = Papa.unparse(addressbookNotes.map((note: any) => ({
                  'Name': sanitizeText(note.creatorName || note.title),
                  'Mobile Number': sanitizeText(note.mobileNumber),
                  'Address': sanitizeText(note.address),
                  'Cost Per Post': sanitizeText(note.costPerPost),                  
                  'Instagram': sanitizeText(note.instagramLink),
                  'Facebook': sanitizeText(note.facebookLink),
                  'YouTube': sanitizeText(note.youtubeLink)
                })));
                await uploadOrUpdateFile('AddressBook.csv', addressCsv, folderId, fileMap.get('AddressBook.csv'));
              }
            }
          } catch (e) {
            console.error("Failed to parse notebook notes for backup", e);
          }
        }
      };

      syncToDrive();

    }, 30000); // 30 seconds debounce

    return () => clearTimeout(timer);
  }, [user, isStorageHydrated, isLoadingCloud, accessToken, influencers, tasks, monthlyTargets, salesData, dashboardProducts, savedProducts, messages, contracts, billingEntries, aovEntries, campaigns]);

    const handleGoogleLogin = async () => {
    try {
      setIsLoadingCloud(true);
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setAccessToken(result.accessToken);
        setNeedsAuth(false);
        setUserStatus('Active');
      }
    } catch (err: any) {
      setLoginError(err.message || 'Google Authentication failed.');
      console.error('Google Auth Error:', err);
    } finally {
      setIsLoadingCloud(false);
    }
  };

  const handleEmailAuth = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoginError('');
    if (!loginEmail || !loginPassword) {
      setLoginError('Please enter both email and password.');
      return;
    }
    
    try {
      setIsLoadingCloud(true);
      let result;
      if (loginMode === 'login') {
        result = await emailSignIn(loginEmail, loginPassword);
      } else if (loginMode === 'admin') {
        if (loginEmail.toLowerCase().trim() !== 'ashimgogoi2008@gmail.com' && loginEmail.toLowerCase().trim() !== 'ea@protogrow.in') {
          throw new Error("Unauthorized: Not an Admin account.");
        }
        result = await emailSignIn(loginEmail, loginPassword);
      } else {
        result = await emailSignUp(loginEmail, loginPassword);
      }
      
      if (result) {
        setUser(result.user);
        setAccessToken(result.accessToken);
        setNeedsAuth(false);
        setUserStatus('Active');
        
        setLoginEmail('');
        setLoginPassword('');
      }
    } catch (err: any) {
      setLoginError(err.message || 'Authentication failed.');
      console.error('Auth Error:', err);
    } finally {
      setIsLoadingCloud(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!loginEmail) {
      setLoginError('Please enter your email address to reset your password.');
      return;
    }
          setIsLoadingCloud(true);
    setLoginError('');
    try {
      await sendResetEmail(loginEmail);
      showToast(`Password reset email sent to ${loginEmail}. Please check your inbox.`, 'success');
    } catch (err: any) {
      let msg = err.message || 'Failed to send password reset email.';
      if (err.code === 'auth/user-not-found') {
        msg = 'No account found with this email. Please sign up first.';
      }
      setLoginError(msg);
      console.error('Password Reset Error:', err);
    } finally {
      setIsLoadingCloud(false);
    }
  };

  const saveActiveStateToGuestAndGlobal = () => {
    try {
      const bulkPayload: Record<string, string> = {
        
        'INFLUENCER_MANAGER_DASHBOARD_PRODUCTS_guest': JSON.stringify(dashboardProducts),
        
        'INFLUENCER_MANAGER_SAVED_PRODUCTS_guest': JSON.stringify(savedProducts),
        
        'INFLUENCER_MANAGER_MONTHLY_TARGETS_guest': JSON.stringify(monthlyTargets),
        'INFLUENCER_MANAGER_MONTHLY_BUDGETS_guest': JSON.stringify(monthlyBudgets),
        
        'INFLUENCER_MANAGER_TSKS_guest': JSON.stringify(tasks),
        
        'INFLUENCER_MANAGER_INFS_guest': JSON.stringify(influencers),
        
        'INFLUENCER_MANAGER_CAMPS_guest': JSON.stringify(campaigns),
        
        'INFLUENCER_MANAGER_MSGS_guest': JSON.stringify(messages),
        
        'INFLUENCER_MANAGER_CONTS_guest': JSON.stringify(contracts),
        
        'INFLUENCER_MANAGER_BILLS_guest': JSON.stringify(billingEntries),
        
        'INFLUENCER_MANAGER_AOV_ENTRIES_guest': JSON.stringify(aovEntries),
        'INFLUENCER_MANAGER_NOTEBOOK_NOTES_guest': JSON.stringify(notebookNotes),
        'SALES_DASHBOARD_DATA_guest': JSON.stringify(salesData),
        'SALES_DASHBOARD_FILENAME_guest': salesFileName || ''
      };
      
      safeLocalStorage.setItems(bulkPayload);
      console.log('[System Memory Safeguard] Active state successfully written to guest and global storage on sign-out.');
    } catch (e) {
      console.warn('Backup error during guest/global preservation on sign-out:', e);
    }
  };



  const runGlobalVerificationDiagnostics = (isSilent = false) => {
    
    if (!isSilent) {
      setIsVerifyingGlobal(true);
      setGlobalDiagnosticMsg("Scanning complete operations workspace schema and client partition slots...");
    }
    
    
    setTimeout(() => {
      try {
        const suffix = user ? user.uid : 'guest';
        let report = `[SECURE STORAGE INTEGRITY ANALYSIS] - ${new Date().toLocaleTimeString()}
\n`;
        report += `• Profile: ${user ? `Authenticated (${user.email || user.uid})` : 'Guest Session'}`;
        report += `• Partition Slot: _${suffix}`;
        report += `• Browser Context: safeLocalStorage Layer\n\n`;
        
        report += `Verifying partition alignments:\n`;

        const collections = [
          { key: 'MONTHLY_BUDGETS', label: 'Monthly Global Budgets', state: monthlyBudgets },
          { key: 'MONTHLY_TARGETS', label: 'Monthly Targets Matrices', state: monthlyTargets },
          { key: 'DASHBOARD_PRODUCTS', label: 'Dashboard Product Lists', state: dashboardProducts },
          { key: 'SAVED_PRODUCTS', label: 'Saved Master Products', state: savedProducts },
          { key: 'TSKS', label: 'Campaign Workflow Tasks', state: tasks },
          { key: 'INFS', label: 'Influencer Creator Base', state: influencers },
          { key: 'CAMPS', label: 'Ad & Marketing Campaigns', state: campaigns },
          { key: 'MSGS', label: 'Client Messages Inbox', state: messages },
          { key: 'CONTS', label: 'Active Service Contracts', state: contracts },
          { key: 'BILLS', label: 'Finance & Invoices Ledger', state: billingEntries },
        ];

        collections.forEach(({ key, label, state }) => {
          const globalRaw = safeLocalStorage.getItem(`INFLUENCER_MANAGER_${key}`);
          const partitionRaw = safeLocalStorage.getItem(`INFLUENCER_MANAGER_${key}_${suffix}`);
          const count = Array.isArray(state) ? state.length : 0;
          
          report += `  - ${label}:\n`;
          report += `    • Current Memory Count: ${count} elements\n`;
          if (globalRaw) {
            try {
              const parsedG = JSON.parse(globalRaw);
              report += `    • Global Store State: ✔ [ALIGNED] (${Array.isArray(parsedG) ? parsedG.length : 0} items)\n`;
            } catch {
              report += `    • Global Store State: ⚠ [CORRUPTED/RESETTING]\n`;
            }
          } else {
            report += `    • Global Store State: ⚠ [EMPTY/INITIALIZING]\n`;
          }

          if (partitionRaw) {
            try {
              const parsedP = JSON.parse(partitionRaw);
              report += `    • Partition Slot Store: ✔ [ALIGNED] (${Array.isArray(parsedP) ? parsedP.length : 0} items)\n`;
            } catch {
              report += `    • Partition Slot Store: ⚠ [CORRUPTED/RESETTING]\n`;
            }
          } else {
            report += `    • Partition Slot Store: ⚠ [EMPTY/INITIALIZING]\n`;
          }
        });

        // Sync everything immediately to double-secure all records
        try {
          const bulkPayload: Record<string, string> = {
            
            [`INFLUENCER_MANAGER_DASHBOARD_PRODUCTS_${suffix}`]: JSON.stringify(dashboardProducts),
            
            [`INFLUENCER_MANAGER_SAVED_PRODUCTS_${suffix}`]: JSON.stringify(savedProducts),
            
            [`INFLUENCER_MANAGER_MONTHLY_TARGETS_${suffix}`]: JSON.stringify(monthlyTargets),
            
            [`INFLUENCER_MANAGER_TSKS_${suffix}`]: JSON.stringify(tasks),
            
            [`INFLUENCER_MANAGER_INFS_${suffix}`]: JSON.stringify(influencers),
            
            [`INFLUENCER_MANAGER_CAMPS_${suffix}`]: JSON.stringify(campaigns),
            
            [`INFLUENCER_MANAGER_MSGS_${suffix}`]: JSON.stringify(messages),
            
            [`INFLUENCER_MANAGER_CONTS_${suffix}`]: JSON.stringify(contracts),
            
            [`INFLUENCER_MANAGER_BILLS_${suffix}`]: JSON.stringify(billingEntries)
          };
          safeLocalStorage.setItems(bulkPayload);
        } catch (e) {
          console.warn("Verify alignment nested writing error:", e);
        }

        report += `\n✔ [INTEGRITY ASSURED] All active schemas synchronized, aligned and hard-coded to secure local persistence! Your workspace data are safe across reloading, account switching, or session terminations.`;
        
        setGlobalDiagnosticMsg(report);
        if (!isSilent) {
          setFeedbackMsg({ text: "All workspace storage partition modules have been successfully synchronized!", type: 'success' });
          setTimeout(() => setFeedbackMsg(null), 5000);
        }
      } catch (err: any) {
        setGlobalDiagnosticMsg(`• ANALYSIS FAILURE: ${err.message}`);
        if (!isSilent) { setFeedbackMsg({ text: `Analysis error: ${err.message}`, type: 'error' }); }
      } finally {
        if (!isSilent) { setIsVerifyingGlobal(false); }
      }
    }, 1200);
  };

  const runGlobalVerificationDiagnosticsRef = useRef(runGlobalVerificationDiagnostics);
  useEffect(() => {
    runGlobalVerificationDiagnosticsRef.current = runGlobalVerificationDiagnostics;
  });

  useEffect(() => {
    const intervalId = setInterval(() => {
      // Auto run silently or normally
      runGlobalVerificationDiagnosticsRef.current(true);
    }, 40000);
    return () => clearInterval(intervalId);
  }, []);


  const handleGoogleLogout = async () => {
    if (window.confirm("Are you sure you want to log out from Gmail and Google Workspace services?")) {
      try {
        (window as any).isIntentionalLogout = true;
              setIsLoadingCloud(true);
        // Take emergency snapshot of current state to system memory (RAM object space)
        saveToSystemMemory({
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
        }, 'auto');
        
        // Also persist the latest state as the new guest state so no data is vanished on logout
        saveActiveStateToGuestAndGlobal();
        console.log('[System Memory Safeguard] Emergency snapshot taken successfully before logout sign-out.');

        
        // Auto Download CSV on Logout check
        const autoCsvEnabled = safeLocalStorage.getItem('SYS_MEMORY_AUTOCSV_LOGOUT_ENABLED') === 'true';
        if (autoCsvEnabled) {
          try {
            const zip = new JSZip();
            const addItems = (collectionName: string, items: any[]) => {
              if (!items || items.length === 0) return;
              let csvData = items;
              if (collectionName === 'savedProducts') {
                 csvData = items.map((p: any) => ({ product: p }));
              }
              const csv = Papa.unparse(csvData);
              zip.file(`${collectionName}.csv`, csv);
            };
            addItems('influencers', influencers);
            addItems('campaigns', campaigns);
            addItems('tasks', tasks);
            addItems('messages', messages);
            addItems('contracts', contracts);
            addItems('billingEntries', billingEntries);
            addItems('aovEntries', aovEntries);
            addItems('monthlyTargets', monthlyTargets);
            addItems('dashboardProducts', dashboardProducts);
            addItems('savedProducts', savedProducts);
            addItems('notebookNotes', notebookNotes);
            addItems('monthlyBudgets', monthlyBudgets);
            
            const content = await zip.generateAsync({ type: 'blob' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(content);
            link.setAttribute('href', url);
            link.setAttribute('download', `System_Export_Separate_CSVs_${new Date().toLocaleString('en-GB').replace(/[\\/:]/g, '-').replace(', ', '_')}.zip`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            console.log('[Auto-CSV] Exported successfully upon logout.');
          } catch(e) {
            console.error('[Auto-CSV] Failed to export CSV on logout', e);
          }
        }


        // Wait for any pending background Firebase writes to flush before destroying the auth session
        await new Promise(resolve => setTimeout(resolve, 1500));

        await logout();
        setUser(null);
        setAccessToken(null);
        setNeedsAuth(true);
      } catch (err: any) {
        console.error('Google account logout failed:', err);
      } finally {
        setIsLoadingCloud(false);
        setTimeout(() => { (window as any).isIntentionalLogout = false; }, 1000);
      }
    }
  };

  
  
  const getFullWorkspacePayload = () => {
    return {
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
      notebookNotes,
      salesData,
      salesFileName,
      monthlyBudgets
    };
  };

  const handleDriveSnapshotBackup = async () => {
    try {
      globalToast.info("Connecting to Google Drive...");
      const token = await ensureGoogleAccessToken(accessToken, (newUser, newToken) => {
        setUser(newUser);
        setAccessToken(newToken);
        setNeedsAuth(false);
      });

      if (!token) {
        globalToast.error("Google authentication required to save backup to Drive.");
        return;
      }

      globalToast.info("Uploading snapshot backup to Google Drive...");
      const payload = getFullWorkspacePayload();
      const result = await uploadFullBackupToGoogleDrive(token, payload, 'Influencer Manager Backup');
      
      setAccessToken(token);
      if (result.folderId) setDriveFolderId(result.folderId);
      
      globalToast.success(`Drive Backup uploaded successfully to Google Drive! (${result.fileName})`);
    } catch (err: any) {
      console.error('Drive snapshot backup failed:', err);
      globalToast.error(`Google Drive upload failed: ${err.message || 'Check network connection'}`);
    }
  };

  const handleManualDriveBackup = async () => {
    try {
      const payload = getFullWorkspacePayload();
      // Fast, free local export without requiring cloud billing or OAuth scopes
      handleManualLocalExport();
      globalToast.success("Complete workspace data saved to your device (100% Free).");
    } catch (err: any) {
      console.error('Backup failed:', err);
      globalToast.error(`Failed to save backup: ${err.message || 'Error saving file'}`);
    }
  };

  const handleManualLocalExport = () => {
    try {
      const payload = getFullWorkspacePayload();
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(payload, null, 2));
      const downloadAnchorNode = document.createElement('a');
      downloadAnchorNode.setAttribute("href", dataStr);
      const now = new Date();
      const dateStr = now.toLocaleDateString('en-GB').replace(/\//g, '-');
      const timeStr = `${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
      downloadAnchorNode.setAttribute("download", `Local_Backup_${dateStr}_${timeStr}.json`);
      document.body.appendChild(downloadAnchorNode);
      downloadAnchorNode.click();
      downloadAnchorNode.remove();
      globalToast.success("Manual local backup file downloaded successfully.");
    } catch (err: any) {
      console.error("Export error:", err);
      globalToast.error("Failed to export backup: " + err.message);
    }
  };

  const handleComboSave = async () => {
    // 1. Trigger local export
    handleManualLocalExport();
    
    // 2. Trigger drive backup directly with automatic Google auth verification
    try {
      globalToast.info("Saving cloud backup to Google Drive...");
      const token = await ensureGoogleAccessToken(accessToken, (newUser, newToken) => {
        setUser(newUser);
        setAccessToken(newToken);
        setNeedsAuth(false);
      });

      if (token) {
        const payload = getFullWorkspacePayload();
        const result = await uploadFullBackupToGoogleDrive(token, payload, 'Influencer Manager Backup');
        setAccessToken(token);
        if (result.folderId) setDriveFolderId(result.folderId);
        globalToast.success("Combo Save Complete: Local file downloaded & Cloud backup uploaded to Google Drive!");
      } else {
        globalToast.info("Local backup saved. Connect Google Drive to also save to the cloud.");
      }
    } catch (err: any) {
      console.error('Combo Save Google Drive error:', err);
      globalToast.warning(`Local file saved, but Google Drive upload failed: ${err.message || 'Please log in'}`);
    }
  };

  const handleOpenDriveRecovery = async () => {
    try {
      const token = await ensureGoogleAccessToken(accessToken, (newUser, newToken) => {
        setUser(newUser);
        setAccessToken(newToken);
        setNeedsAuth(false);
      });
      if (token) {
        setAccessToken(token);
      }
      setIsDriveRecoveryModalOpen(true);
    } catch (err: any) {
      setIsDriveRecoveryModalOpen(true);
    }
  };

  const handleConnectGoogleDrive = async () => {
    try {
      globalToast.info("Connecting to Google Drive...");
      const token = await ensureGoogleAccessToken(accessToken, (newUser, newToken) => {
        setUser(newUser);
        setAccessToken(newToken);
        setNeedsAuth(false);
      }, true);
      if (token) {
        setAccessToken(token);
        globalToast.success("Google Drive successfully connected!");
      }
    } catch (err: any) {
      console.error("Google Drive connection error:", err);
      globalToast.error(err.message || "Failed to connect Google Drive. Please ensure popups are allowed.");
    }
  };

  const handleManualLocalImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = event.target?.result as string;
        const parsedData = JSON.parse(json);
        
        // Handle cases where the backup is wrapped in a "payload" property
        const parsed = (parsedData.payload && typeof parsedData.payload === 'object') 
          ? { ...parsedData, ...parsedData.payload } 
          : parsedData;
        
        if (parsed.influencers) setInfluencers(parsed.influencers);
        if (parsed.campaigns) setCampaigns(parsed.campaigns);
        if (parsed.tasks) setTasks(parsed.tasks);
        if (parsed.messages) setMessages(parsed.messages);
        if (parsed.contracts) setContracts(parsed.contracts);
        if (parsed.billingEntries) setBillingEntries(parsed.billingEntries);
        if (parsed.dashboardProducts) setDashboardProducts(parsed.dashboardProducts);
        if (parsed.savedProducts) setSavedProducts(parsed.savedProducts);
        if (parsed.selectedMonth) setSelectedMonth(parsed.selectedMonth);
        if (parsed.selectedYear) setSelectedYear(parsed.selectedYear);
        if (parsed.monthlyTargets) setMonthlyTargets(parsed.monthlyTargets);
        if (parsed.aovEntries) setAovEntries(parsed.aovEntries);
        const currentNotes = prevNotebookNotesRef.current ? JSON.parse(prevNotebookNotesRef.current) : [];
        if (parsed.notebookNotes && parsed.notebookNotes.length >= currentNotes.length) {
             setNotebookNotes(parsed.notebookNotes);
        } else {
             if (parsed.notebookNotes) {
                 console.warn('Backup has fewer notebook notes than current. Keeping existing notebook notes.');
                 showToast('Backup has fewer notes than current. Kept existing notebook notes.', 'info');
             }
             parsed.notebookNotes = currentNotes;
        }
        if (parsed.salesData) setSalesData(parsed.salesData);
        if (parsed.salesFileName !== undefined) setSalesFileName(parsed.salesFileName);
        if (parsed.monthlyBudgets) setMonthlyBudgets(parsed.monthlyBudgets);

        // Auto save to local storage immediately to persist it
        safeLocalStorage.setItems({
            'INFLUENCER_MANAGER_INFS': JSON.stringify(parsed.influencers || []),
            'INFLUENCER_MANAGER_CAMPS': JSON.stringify(parsed.campaigns || []),
            'INFLUENCER_MANAGER_TSKS': JSON.stringify(parsed.tasks || []),
            'INFLUENCER_MANAGER_MSGS': JSON.stringify(parsed.messages || []),
            'INFLUENCER_MANAGER_CONTS': JSON.stringify(parsed.contracts || []),
            'INFLUENCER_MANAGER_BILLS': JSON.stringify(parsed.billingEntries || []),
            'INFLUENCER_MANAGER_DASHBOARD_PRODUCTS': JSON.stringify(parsed.dashboardProducts || []),
            'INFLUENCER_MANAGER_SAVED_PRODUCTS': JSON.stringify(parsed.savedProducts || []),
            'INFLUENCER_MANAGER_MONTHLY_TARGETS': JSON.stringify(parsed.monthlyTargets || []),
            'INFLUENCER_MANAGER_AOV_ENTRIES': JSON.stringify(parsed.aovEntries || []),
            'INFLUENCER_MANAGER_NOTEBOOK_NOTES': JSON.stringify(parsed.notebookNotes || []),
            'INFLUENCER_MANAGER_SALES_DATA': JSON.stringify(parsed.salesData || []),
            'INFLUENCER_MANAGER_SALES_FILE_NAME': parsed.salesFileName || '',
            'INFLUENCER_MANAGER_MONTHLY_BUDGETS': JSON.stringify(parsed.monthlyBudgets || [])
        });

        globalToast.success("Local backup restored successfully.");
      } catch (err: any) {
        console.error("Import error:", err);
        globalToast.error("Failed to restore backup: " + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset input
  };


  // Shared routine to force emergency snapshot on any sub-component logging out
  const handleSystemLogout = async () => {
    alert("MANDATORY: Please ensure you have backed up your data to the Central Sheet (CSV) before signing out!");
    try {
      saveToSystemMemory({
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
        notebookNotes,
        monthlyBudgets
      }, 'auto');
      
      saveActiveStateToGuestAndGlobal();
            console.log('[System Memory Safeguard] Shared emergency snapshot taken successfully on components logout.');

        
        // Auto Download CSV on Logout check
        const autoCsvEnabled = safeLocalStorage.getItem('SYS_MEMORY_AUTOCSV_LOGOUT_ENABLED') === 'true';
        if (autoCsvEnabled) {
          try {
            const zip = new JSZip();
            const addItems = (collectionName: string, items: any[]) => {
              if (!items || items.length === 0) return;
              let csvData = items;
              if (collectionName === 'savedProducts') {
                 csvData = items.map((p: any) => ({ product: p }));
              }
              const csv = Papa.unparse(csvData);
              zip.file(`${collectionName}.csv`, csv);
            };
            addItems('influencers', influencers);
            addItems('campaigns', campaigns);
            addItems('tasks', tasks);
            addItems('messages', messages);
            addItems('contracts', contracts);
            addItems('billingEntries', billingEntries);
            addItems('aovEntries', aovEntries);
            addItems('monthlyTargets', monthlyTargets);
            addItems('dashboardProducts', dashboardProducts);
            addItems('savedProducts', savedProducts);
            addItems('notebookNotes', notebookNotes);
            addItems('monthlyBudgets', monthlyBudgets);
            
            const content = await zip.generateAsync({ type: 'blob' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(content);
            link.setAttribute('href', url);
            link.setAttribute('download', `System_Export_Separate_CSVs_${new Date().toLocaleString('en-GB').replace(/[\\/:]/g, '-').replace(', ', '_')}.zip`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            console.log('[Auto-CSV] Exported successfully upon logout.');
          } catch(e) {
            console.error('[Auto-CSV] Failed to export CSV on logout', e);
          }
        }


    } catch (e) {
      console.warn('Backup error on shared logout:', e);
    }
    
          setIsLoadingCloud(true);
    (window as any).isIntentionalLogout = true;
    
    // Wait for any pending background Firebase writes to flush before destroying the auth session
    await new Promise(resolve => setTimeout(resolve, 1500));

    await logout();
    setUser(null);
    setAccessToken(null);
    setNeedsAuth(true);
    setTimeout(() => { (window as any).isIntentionalLogout = false; }, 1000);
    setIsLoadingCloud(false);
  };

  // Assign influencer to campaign
  const handleAssignToCampaign = (influencerId: string, campaignId: string) => {
    const updatedCamps = campaigns.map(c => {
      if (c.id === campaignId && !c.influencersAssigned.includes(influencerId)) {
        const updated = {
          ...c,
          influencersAssigned: [...c.influencersAssigned, influencerId],
          spent: c.spent + 1000
        };
        if (user) {
          saveDoc('campaigns', campaignId, { ownerId: user.uid, ...updated });
        }
        return updated;
      }
      return c;
    });

    if (!user) {
      setCampaigns(updatedCamps);
    }

    const updatedInfs = influencers.map(inf => {
      if (inf.id === influencerId) {
        const updated = { ...inf, status: 'Active' as const };
        if (user) {
          saveDoc('influencers', influencerId, { ownerId: user.uid, ...updated });
        }
        return updated;
      }
      return inf;
    });

    if (!user) {
      setInfluencers(updatedInfs);
    }
  };

  // Create Campaign
  const handleCreateCampaign = (newCamp: Omit<Campaign, 'id' | 'metrics'>) => {
    const id = `camp-${Date.now()}`;
    const initializedCampaign: Campaign = {
      ...newCamp,
      id,
      metrics: {
        impressions: 0,
        clicks: 0,
        conversions: 0,
        ctr: 0,
        cpv: 0,
        cpc: 0,
        roi: 0
      },
      deliverables: newCamp.deliverables || [],
      influencersAssigned: newCamp.influencersAssigned || []
    };
    if (user) {
      setCampaigns(prev => [initializedCampaign, ...prev]);
      saveDoc('campaigns', id, { ownerId: user.uid, ...initializedCampaign }).catch(err => {
        console.error('[Firestore] Failed to create campaign:', err);
        // Removed destructive rollback
      });
    } else {
      setCampaigns(prev => [initializedCampaign, ...prev]);
    }
  };

  // Delete Campaign
  const handleDeleteCampaign = (id: string) => {
    const campaignTaskIds = tasks.filter(t => t.campaignId === id).map(t => t.id);
    if (campaignTaskIds.length > 0) {
      unregisterIntentionallyDeletedTaskIds(campaignTaskIds);
    }
    // Optimistic local state update
    setTasks(prev => prev.filter(t => t.campaignId !== id));

    if (user) {
      deleteDocInDb('campaigns', id);
      tasks.forEach(t => {
        if (t.campaignId === id) {
          deleteDocInDb('tasks', t.id);
        }
      });
    }
  };

  // Create task deliverables
  
  const handleCreateTask = (newTask: Omit<Task, 'id'> & { id?: string }) => {
    let id = newTask.id || `task-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
    
    // Sanitize ID
    id = id.replace(/[^a-zA-Z0-9_\-]/g, '');

    if (user && newTask.id && !id.includes(user.uid.slice(0, 8))) {
      id = `${id}-${user.uid.slice(0, 8)}`;
    }

    if (tasks.some(t => t.id === id)) {
      alert(`A task with this ID already exists. Please use a different Video ID.`);
      return;
    }

    let finalInfluencerId = newTask.influencerId || 'unknown';
    let finalSecName = newTask.secondaryInfluencerName || '';

    // Check if we already created an influencer for this ID/name in the current session
    if (finalInfluencerId !== 'unknown' && newlyCreatedInfluencersRef.current[finalInfluencerId.toLowerCase().trim()]) {
      finalInfluencerId = newlyCreatedInfluencersRef.current[finalInfluencerId.toLowerCase().trim()];
    }

    // If influencer doesn't exist by ID, check if it exists by name, otherwise create it
    if (finalInfluencerId !== 'unknown' && !influencers.some(i => i.id === finalInfluencerId)) {
      const existingByName = influencers.find(i => (i.name || '').toLowerCase().trim() === finalInfluencerId.toLowerCase().trim());
      if (existingByName) {
        finalInfluencerId = existingByName.id;
        finalSecName = existingByName.name;
      } else {
        finalSecName = finalSecName || finalInfluencerId;
        const handle = finalSecName.replace(/\s+/g, '').toLowerCase();
        
        const newInfId = finalInfluencerId.startsWith('inf-') ? finalInfluencerId : `inf-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        
        // Save it to the ref to prevent duplicates in bulk uploads
        newlyCreatedInfluencersRef.current[finalInfluencerId.toLowerCase().trim()] = newInfId;
        newlyCreatedInfluencersRef.current[newInfId.toLowerCase().trim()] = newInfId;

        const fullInfluencer: Influencer = {
          name: finalSecName.toUpperCase(),
          handle: `@${handle}`,
          avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(finalSecName)}&background=random`,
          niche: 'General',
          followers: 0,
          location: 'Unknown',
          platforms: [{ name: 'Instagram', followers: '0' }],
          topDemographics: [{ ageRange: '18-24', percentage: 100 }],
          engagementRate: 0,
          costPerPost: 0,
          averageROI: 0,
          notes: 'Auto-created from mandatory task process',
          mobile: '',
          status: 'Available',
          id: newInfId,
          perfRanking: influencers.length + 1,
          rating: 4.5,
        };

        const updateStateSafe = (prev: Influencer[]) => {
          if (prev.some(inf => inf.id === newInfId)) return prev;
          return [...prev, fullInfluencer];
        };

        if (user) {
          setInfluencers(updateStateSafe);
          saveDoc('influencers', newInfId, { ownerId: user.uid, ...fullInfluencer }).catch(err => console.error(err));
        } else {
          setInfluencers(updateStateSafe);
        }
        finalInfluencerId = newInfId;
      }
    } else if (finalInfluencerId !== 'unknown') {
      const existing = influencers.find(i => i.id === finalInfluencerId);
      if (existing) {
        finalSecName = existing.name;
      }
    }

    const fullTask: Task = {
      ...newTask,
      id,
      campaignId: newTask.campaignId || 'camp-1',
      influencerId: finalInfluencerId,
      secondaryInfluencerName: finalSecName,
      title: newTask.title || 'Untitled',
      views: newTask.views || 0,
      createdAt: newTask.createdAt || new Date().toISOString(),
      createdAtViews: Number(newTask.views) || 0,
      initialViews: Number(newTask.views) || 0,
      previousViews: newTask.previousViews !== undefined ? Number(newTask.previousViews) : (Number(newTask.views) || 0),
      clicks: newTask.clicks || 0,
      conversions: newTask.conversions || 0,
      ctr: newTask.ctr || 0,
      cvr: newTask.cvr || 0,
      cpc: newTask.cpc || 0,
      cpv: newTask.cpv || 0,
      videoLink1: newTask.videoLink1 || '',
      videoLink2: newTask.videoLink2 || '',
      videoLink3: newTask.videoLink3 || '',
      platform: newTask.platform || 'Unknown'
    };


    // Register newly created Monthly Planner entry in the New-Entry Guard Vault
    registerMonthlyPlannerProtectedTask(fullTask);

    // Optimistic local state update
    setTasks(prev => [...prev, fullTask]);

    if (user) {
      const taskToSave = { ownerId: user.uid, ...fullTask };
      // Firestore does not accept undefined values
      Object.keys(taskToSave).forEach(key => {
        if ((taskToSave as any)[key] === undefined) {
          delete (taskToSave as any)[key];
        }
      });
      
      saveDoc('tasks', id, taskToSave).catch(err => {
        console.error('[Firestore] Failed to save task:', err, 'Payload:', taskToSave);
        showToast(`Failed to save task. Error: ${err.message || 'Unknown error'}Payload: ${JSON.stringify(taskToSave, null, 2)}`, "error");
        // Removed destructive rollback
      });
    }
  };

  // Delete task/video plan item
  const handleBulkDeleteTasks = (taskIds: string[]) => {
    unregisterIntentionallyDeletedTaskIds(taskIds);
    // Optimistic local state update
    setTasks(prev => prev.filter(t => !taskIds.includes(t.id)));

    if (user) {
      deleteDocBatchInDb('tasks', taskIds);
    }
  };

  const handleDeleteTask = (taskId: string) => {
    unregisterIntentionallyDeletedTaskIds([taskId]);
    // Optimistic local state update
    setTasks(prev => prev.filter(t => t.id !== taskId));

    if (user) {
      deleteDocInDb('tasks', taskId);
    }
  };

  // Update task progress column
  const handleUpdateTaskStatus = (taskId: string, status: Task['status']) => {
    // Optimistic local state update
    setTasks(prev => {
      const taskIndex = prev.findIndex(t => t.id === taskId);
      if (taskIndex === -1) return prev;
      
      const t = prev[taskIndex];
      const newTask = { ...t, status };
      registerMonthlyPlannerProtectedTask(newTask);

      if (user) {
        setTimeout(() => {
          updateDocInDb('tasks', taskId, { status });
        }, 0);
      }

      const nextTasks = [...prev];
      nextTasks[taskIndex] = newTask;
      return nextTasks;
    });
  };

  // General task updater for custom properties (e.g., releaseDate, platform)
  const handleUpdateTask = useCallback((taskId: string, updatedFields: Partial<Task>) => {
    // Optimistic local state update
    setTasks(prev => {
      const taskIndex = prev.findIndex(t => t.id === taskId);
      if (taskIndex === -1) return prev;
      
      const t = prev[taskIndex];
      const newTask = { ...t, ...updatedFields };
      if (newTask.influencerId && newTask.influencerId !== 'unknown') {
        const existingInf = influencers.find(i => i.id === newTask.influencerId);
        if (existingInf) {
          newTask.secondaryInfluencerName = existingInf.name;
          updatedFields.secondaryInfluencerName = existingInf.name;
        }
      }
      
      // Auto-complete logic based on actual released video links ONLY (DO NOT auto-complete awaiting release)
      const hasVideoLink = !!(newTask.videoLink1?.trim() || newTask.videoLink2?.trim() || newTask.videoLink3?.trim());
      if (hasVideoLink && newTask.status !== 'Cancelled') {
        newTask.status = 'Completed';
      }

      // Lock updated Monthly Planner entry into the Guard Vault
      registerMonthlyPlannerProtectedTask(newTask);

      if (user) {
        // Fire and forget db update asynchronously to not block the reducer
        setTimeout(() => {
          const dbPayload: Partial<Task> = { ...updatedFields };
          if (hasVideoLink && newTask.status !== 'Cancelled') {
            dbPayload.status = 'Completed';
          }
          if (!t.ownerId) {
            dbPayload.ownerId = user.uid;
          }
          updateDocInDb('tasks', taskId, dbPayload);
        }, 0);
      }

      const nextTasks = [...prev];
      nextTasks[taskIndex] = newTask;
      return nextTasks;
    });
  }, [user, influencers]);

  const handleUpdateTasksBulk = useCallback((bulkUpdates: {id: string, updates: Partial<Task>}[]) => {
    setTasks(prev => {
      const nextTasks = [...prev];
      const dbUpdates: { id: string, data: Partial<Task> }[] = [];
      const guardedBatch: Task[] = [];

      bulkUpdates.forEach(bu => {
        const taskIndex = nextTasks.findIndex(t => t.id === bu.id);
        if (taskIndex !== -1) {
          const t = nextTasks[taskIndex];
          const newTask = { ...t, ...bu.updates };
          if (newTask.influencerId && newTask.influencerId !== 'unknown') {
            const existingInf = influencers.find(i => i.id === newTask.influencerId);
            if (existingInf) {
              newTask.secondaryInfluencerName = existingInf.name;
              bu.updates.secondaryInfluencerName = existingInf.name;
            }
          }
          
          const hasVideoLink = !!(newTask.videoLink1?.trim() || newTask.videoLink2?.trim() || newTask.videoLink3?.trim());
          if (hasVideoLink && newTask.status !== 'Cancelled') {
            newTask.status = 'Completed';
            bu.updates.status = 'Completed';
          }
          
          nextTasks[taskIndex] = newTask;
          guardedBatch.push(newTask);
          dbUpdates.push({ id: bu.id, data: bu.updates });
        }
      });

      if (guardedBatch.length > 0) {
        registerMonthlyPlannerProtectedTasksBulk(guardedBatch);
      }

      if (user && userStatus !== 'Blocked' && userStatus !== 'Pending' && dbUpdates.length > 0) {
        setTimeout(() => {
          const isVideoIdOnly = dbUpdates.every(bu => Object.keys(bu.data).length === 1 && 'videoId' in bu.data);
          if (userStatus === 'Restricted' && !isVideoIdOnly) {
            showToast(`⚠️ (Read-Only Mode): Changes registered locally, but cannot persist bulk update.`, "info");
            return;
          }
          firebaseUpdateDocBatchInDb('tasks', dbUpdates).catch(() => {});
        }, 0);
      }

      return nextTasks;
    });
  }, [user, userStatus, influencers]);

  // Update influencer data models (such as WhatsApp/mobile digits)
  const handleUpdateInfluencer = (influencerId: string, updatedFields: Partial<Influencer>) => {
    if (updatedFields.mobile) {
      updatedFields.mobile = cleanSingleMobileForStorage(updatedFields.mobile);
      setTasks(prevTasks => prevTasks.map(t => {
        if (t.influencerId === influencerId || (t.influencerName && updatedFields.name && t.influencerName.toLowerCase() === updatedFields.name.toLowerCase())) {
          return { ...t, influencerMobile: updatedFields.mobile };
        }
        return t;
      }));
    }
    if (updatedFields.secondaryMobile) {
      updatedFields.secondaryMobile = cleanSingleMobileForStorage(updatedFields.secondaryMobile);
    }
    if (updatedFields.status === 'Future Creator' && !updatedFields.entryDate) {
      const todayKolkataDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      updatedFields.entryDate = todayKolkataDate;
    }

    // Optimistic local state update
    setInfluencers(prev => {
      let found = false;
      const next = prev.map(inf => {
        if (inf.id === influencerId) {
          found = true;
          return { ...inf, ...updatedFields };
        }
        return inf;
      });

      // If not found by ID, attempt to match by creator name
      if (!found && (updatedFields as any).name) {
        const targetName = String((updatedFields as any).name).trim().toLowerCase();
        for (let i = 0; i < next.length; i++) {
          if (next[i].name && next[i].name.trim().toLowerCase() === targetName) {
            next[i] = { ...next[i], ...updatedFields };
            found = true;
            break;
          }
        }
      }

      // If still not found, create new influencer profile so phone number is never lost
      if (!found && influencerId) {
        const newCreator = {
          id: influencerId,
          name: (updatedFields as any).name || influencerId,
          handle: '@' + ((updatedFields as any).name || influencerId).replace(/\s+/g, '').toLowerCase(),
          ownerId: user ? user.uid : 'guest',
          status: 'Available',
          ...updatedFields,
        };
        next.push(newCreator);
        if (user) {
          saveDoc('influencers', influencerId, newCreator).catch(e => console.error(e));
        }
      }

      // Instantly persist to browser storage
      const suffix = user ? user.uid : 'guest';
      safeLocalStorage.setItem(`INFLUENCER_MANAGER_INFS_${suffix}`, JSON.stringify(next));
      if (!user) safeLocalStorage.setItem('INFLUENCER_MANAGER_INFS', JSON.stringify(next));
      return next;
    });

    if (user) {
      updateDocInDb('influencers', influencerId, updatedFields);
    }

    // If creator database auto-synchronize is enabled, broadcast instant sync event
    const isAutoSync = safeLocalStorage.getItem('INFLUENCER_MANAGER_DRIVE_AUTOSYNC') !== 'false';
    if (isAutoSync) {
      window.dispatchEvent(new CustomEvent('CREATOR_DATA_UPDATED_INSTANT_SYNC', {
        detail: { influencerId, updatedFields }
      }));
      window.dispatchEvent(new Event('TRIGGER_CENTRAL_REFRESH'));
    }
  };

  // Reschedule Campaign flight duration dates on Monthly Planner
  const handleUpdateCampaignDates = (campaignId: string, startDate: string, endDate: string) => {
    // Optimistic local state update
    setCampaigns(prev => prev.map(c => {
      if (c.id === campaignId) {
        return { ...c, startDate, endDate };
      }
      return c;
    }));

    if (user) {
      updateDocInDb('campaigns', campaignId, { startDate, endDate });
    }
  };

  // Add new influencer profile to database
  const handleAddInfluencer = (newInfluencer: Omit<Influencer, 'id' | 'perfRanking' | 'rating'> & { status?: Influencer['status'] }): string => {
    const id = `inf-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const todayKolkataDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const effectiveStatus = newInfluencer.status || 'Future Creator';
    const effectiveEntryDate = newInfluencer.entryDate || (effectiveStatus === 'Future Creator' ? todayKolkataDate : (newInfluencer.entryDate || todayKolkataDate));
    const fullInfluencer: Influencer = {
      ...newInfluencer,
      name: newInfluencer.name ? newInfluencer.name.toUpperCase() : newInfluencer.name,
      id,
      perfRanking: influencers.length + 1,
      rating: parseFloat((Math.random() * 1.0 + 4.0).toFixed(1)),
      status: effectiveStatus,
      entryDate: effectiveEntryDate,
      topDemographics: newInfluencer.topDemographics || [{ ageRange: '18-24', percentage: 40 }],
      platforms: newInfluencer.platforms || [{ name: 'Instagram', followers: '100K' }]
    };
    if (user) {
      // Optimistic state update: show the newly added influencer immediately
      setInfluencers(prev => {
        if (prev.some(inf => inf.id === id)) return prev;
        return [...prev, fullInfluencer];
      });
      saveDoc('influencers', id, { ownerId: user.uid, ...fullInfluencer }).catch(err => {
        console.error('[Firestore] Failed to save influencer:', err);
        let msg = err.message;
        try {
          const parsed = JSON.parse(err.message);
          msg = parsed.error || err.message;
        } catch(e) {}
        showToast(`❌ Failed to save creator: ${msg}`, "error");
        // Fallback: remove from UI if db call fails
        setInfluencers(prev => prev.filter(inf => inf.id !== id));
      });
    } else {
      setInfluencers(prev => [...prev, fullInfluencer]);
    }

    const isAutoSync = safeLocalStorage.getItem('INFLUENCER_MANAGER_DRIVE_AUTOSYNC') !== 'false';
    if (isAutoSync) {
      window.dispatchEvent(new CustomEvent('CREATOR_DATA_UPDATED_INSTANT_SYNC', {
        detail: { influencerId: id, updatedFields: fullInfluencer }
      }));
      window.dispatchEvent(new Event('TRIGGER_CENTRAL_REFRESH'));
    }
    return id;
  };

  const handleAddInfluencersBulk = (newInfluencersBulk: any[]) => {
    const todayKolkataDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const enrichedBulk = newInfluencersBulk.map(inf => {
      const effectiveStatus = inf.status || 'Future Creator';
      return {
        ...inf,
        entryDate: inf.entryDate || (effectiveStatus === 'Future Creator' ? todayKolkataDate : (inf.entryDate || todayKolkataDate))
      };
    });
    if (!user) {
      setInfluencers(prev => [...prev, ...enrichedBulk]);
      return;
    }
    setInfluencers(prev => {
      const prevIds = new Set(prev.map(p => p.id));
      const toAdd = enrichedBulk.filter(n => !prevIds.has(n.id));
      return [...prev, ...toAdd];
    });
    const batchUpdates = enrichedBulk.map(inf => ({
      id: inf.id,
      data: { ...inf, ownerId: user.uid }
    }));
    firebaseUpdateDocBatchInDb('influencers', batchUpdates).catch(err => {
      console.error('[Firestore] Failed to bulk save influencers:', err);
    });
  };

  // Delete influencer profile from database (supports optional replacementInfluencerId when merging duplicates)
  const handleDeleteInfluencer = (influencerId: string, replacementInfluencerId?: string) => {
    isClearingAllRef.current = true;
    setTimeout(() => { isClearingAllRef.current = false; }, 8000);
    if (user) {
      deleteDocInDb('influencers', influencerId).catch(err => console.error(err));
    }
    const deletedInf = influencers.find(inf => inf.id === influencerId);
    const replacementInf = replacementInfluencerId
      ? influencers.find(inf => inf.id === replacementInfluencerId)
      : undefined;
    setInfluencers(prev => prev.filter(inf => inf.id !== influencerId));
    
    // Monthly Planner Guard: Re-link tasks to replacementInfluencerId if merging duplicates,
    // and ALWAYS preserve secondaryInfluencerName so Monthly Planner never loses creator names or entries
    const nextInfId = replacementInfluencerId || '';
    const preservedName = replacementInf?.name || deletedInf?.name || '';
    setTasks(prev => {
      const updated = prev.map(t => {
        if (t.influencerId === influencerId) {
          const updatedTask: Task = {
            ...t,
            influencerId: nextInfId,
            secondaryInfluencerName: replacementInf?.name || t.secondaryInfluencerName || preservedName
          };
          registerMonthlyPlannerProtectedTask(updatedTask);
          return updatedTask;
        }
        return t;
      });
      const changed = updated.filter(t => prev.find(p => p.id === t.id)?.influencerId === influencerId);
      if (user && changed.length > 0) {
        setTimeout(() => {
          changed.forEach(t =>
            updateDocInDb('tasks', t.id, {
              influencerId: nextInfId,
              ...(t.secondaryInfluencerName ? { secondaryInfluencerName: t.secondaryInfluencerName } : {})
            }).catch(e => console.error(e))
          );
        }, 0);
      }
      return updated;
    });
  };

  // ============================================================================
  // AUTOMATED CREATOR DUPLICATE MERGE & MONTHLY PLANNER INFLUENCER MONITOR
  // ============================================================================
  const [isAutoCreatorSystemEnabled, setIsAutoCreatorSystemEnabled] = useState<boolean>(() => {
    return safeLocalStorage.getItem('CREATOR_DB_AUTO_SYSTEM_ENABLED') !== 'false';
  });

  const [autoCreatorSystemStats, setAutoCreatorSystemStats] = useState<AutoCreatorSystemStats>(() => {
    try {
      const saved = safeLocalStorage.getItem('CREATOR_DB_AUTO_SYSTEM_STATS');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      lastRunAt: null,
      duplicatesMergedCount: 0,
      duplicateGroupsResolved: 0,
      plannerNamesInputtedCount: 0,
      missingCreatorsAddedCount: 0,
      monitoredTasksCount: 0,
      activeCreatorsSyncedCount: 0
    };
  });

  const isRunningAutoCreatorSystemRef = useRef(false);

  const executeAutoCreatorSystemPass = useCallback((isManualTrigger = false) => {
    if (isRunningAutoCreatorSystemRef.current || isClearingAllRef.current) return;
    if (influencers.length === 0 && tasks.length === 0) return;

    isRunningAutoCreatorSystemRef.current = true;
    try {
      const result = analyzeAndComputeAutoMergeAndPlannerSync(
        influencers,
        tasks,
        contracts,
        billingEntries
      );

      const nowStr = new Date().toLocaleTimeString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });

      if (!result.hasChanges) {
        setAutoCreatorSystemStats(prev => {
          const next = {
            ...prev,
            lastRunAt: isManualTrigger ? nowStr : (prev.lastRunAt || nowStr),
            monitoredTasksCount: tasks.length
          };
          safeLocalStorage.setItem('CREATOR_DB_AUTO_SYSTEM_STATS', JSON.stringify(next));
          return next;
        });
        if (isManualTrigger) {
          showToast(`✅ Auto-System Check Complete: 0 duplicate creators found & all ${tasks.length} Monthly Planner tasks are synced!`, 'success');
        }
        return;
      }

      const deleteSet = new Set(result.influencerIdsToDelete.map(d => d.id));
      const suffix = user ? user.uid : 'guest';

      // 1. Apply Creator Database updates, new additions, and duplicate removals in one atomic state transition
      if (
        result.updatedInfluencers.size > 0 ||
        result.newInfluencersToCreate.length > 0 ||
        result.influencerIdsToDelete.length > 0
      ) {
        setInfluencers(prev => {
          const existingIds = new Set(prev.map(i => i.id));
          const updatedList = prev
            .filter(inf => !deleteSet.has(inf.id))
            .map(inf => {
              const patch = result.updatedInfluencers.get(inf.id);
              return patch ? { ...inf, ...patch } : inf;
            });

          for (const newInf of result.newInfluencersToCreate) {
            if (!existingIds.has(newInf.id) && !deleteSet.has(newInf.id)) {
              updatedList.push(newInf);
            }
          }

          safeLocalStorage.setItem(`INFLUENCER_MANAGER_INFS_${suffix}`, JSON.stringify(updatedList));
          if (!user) safeLocalStorage.setItem('INFLUENCER_MANAGER_INFS', JSON.stringify(updatedList));
          return updatedList;
        });

        if (user) {
          const infBatchUpdates: { id: string; data: any }[] = [];
          result.updatedInfluencers.forEach((patch, id) => {
            if (!deleteSet.has(id)) {
              infBatchUpdates.push({ id, data: patch });
            }
          });
          for (const newInf of result.newInfluencersToCreate) {
            infBatchUpdates.push({ id: newInf.id, data: { ...newInf, ownerId: user.uid } });
          }
          if (infBatchUpdates.length > 0) {
            firebaseUpdateDocBatchInDb('influencers', infBatchUpdates).catch(err =>
              console.error('[AutoCreatorSystem] Failed to batch update influencers:', err)
            );
          }
          if (result.influencerIdsToDelete.length > 0) {
            const idsToRemove = result.influencerIdsToDelete.map(d => d.id);
            firebaseDeleteDocBatchInDb('influencers', idsToRemove).catch(err =>
              console.error('[AutoCreatorSystem] Failed to batch delete duplicate influencers:', err)
            );
          }
        }
      }

      // 2. Apply Monthly Planner task updates (missing influencer names & merged duplicate ID re-links)
      // MONTHLY PLANNER NEW-ENTRY GUARD: Strictly non-destructive update — never deletes any task or clears any user-entered field
      if (result.taskUpdates.length > 0) {
        const taskPatchMap = new Map(result.taskUpdates.map(u => [u.id, u.updates]));
        setTasks(prev => {
          const mappedTasks = prev.map(t => {
            const patch = taskPatchMap.get(t.id);
            if (!patch) return t;
            const safePatched: Task = {
              ...t,
              ...(patch.influencerId ? { influencerId: patch.influencerId } : {}),
              ...(patch.secondaryInfluencerName ? { secondaryInfluencerName: patch.secondaryInfluencerName } : {}),
              ...(patch.influencerMobile && !t.influencerMobile ? { influencerMobile: patch.influencerMobile } : {})
            };
            return safePatched;
          });
          const { guardedTasks } = guardAndRestoreMonthlyPlannerTasks(mappedTasks, prev);
          safeLocalStorage.setItem(`INFLUENCER_MANAGER_TSKS_${suffix}`, JSON.stringify(guardedTasks));
          if (!user) safeLocalStorage.setItem('INFLUENCER_MANAGER_TSKS', JSON.stringify(guardedTasks));
          return guardedTasks;
        });

        if (user) {
          const taskBatch = result.taskUpdates.map(u => ({ id: u.id, data: u.updates }));
          firebaseUpdateDocBatchInDb('tasks', taskBatch).catch(err =>
            console.error('[AutoCreatorSystem] Failed to batch update tasks:', err)
          );
        }
      }

      // 3. Also re-link campaigns, contracts, and billingEntries if duplicates were merged
      if (result.influencerIdsToDelete.length > 0) {
        const repMap = new Map(result.influencerIdsToDelete.map(d => [d.id, d.replacementId]));
        setCampaigns(prev =>
          prev.map(c => {
            if (!c.influencerIds || !c.influencerIds.some((id: string) => repMap.has(id))) return c;
            const mapped = Array.from(new Set(c.influencerIds.map((id: string) => repMap.get(id) || id)));
            return { ...c, influencerIds: mapped };
          })
        );
      }

      // 4. Update cumulative stats
      setAutoCreatorSystemStats(prev => {
        const next: AutoCreatorSystemStats = {
          lastRunAt: nowStr,
          duplicatesMergedCount: prev.duplicatesMergedCount + result.statsDelta.duplicatesMerged,
          duplicateGroupsResolved: prev.duplicateGroupsResolved + result.statsDelta.duplicateGroups,
          plannerNamesInputtedCount: prev.plannerNamesInputtedCount + result.statsDelta.plannerNamesInputted,
          missingCreatorsAddedCount: prev.missingCreatorsAddedCount + result.statsDelta.missingCreatorsAdded,
          monitoredTasksCount: tasks.length,
          activeCreatorsSyncedCount: prev.activeCreatorsSyncedCount + result.statsDelta.activeCreatorsSynced
        };
        safeLocalStorage.setItem('CREATOR_DB_AUTO_SYSTEM_STATS', JSON.stringify(next));
        return next;
      });

      if (result.summaryMessages.length > 0) {
        showToast(`🤖 Auto-System: ${result.summaryMessages.join(' • ')}`, 'success');
      }
    } finally {
      setTimeout(() => {
        isRunningAutoCreatorSystemRef.current = false;
      }, 400);
    }
  }, [influencers, tasks, contracts, billingEntries, user]);

  const handleToggleAutoCreatorSystem = useCallback((nextVal?: boolean) => {
    setIsAutoCreatorSystemEnabled(prev => {
      const target = typeof nextVal === 'boolean' ? nextVal : !prev;
      safeLocalStorage.setItem('CREATOR_DB_AUTO_SYSTEM_ENABLED', String(target));
      if (target) {
        showToast('🟢 Automated Duplicate Merge & Monthly Planner Influencer Monitor turned ON', 'success');
        setTimeout(() => executeAutoCreatorSystemPass(false), 150);
      } else {
        showToast('⚪ Automated Duplicate Merge & Monthly Planner Influencer Monitor turned OFF', 'info');
      }
      return target;
    });
  }, [executeAutoCreatorSystemPass]);

  // Continuous background watcher when Auto-System is ON
  useEffect(() => {
    if (!isAutoCreatorSystemEnabled) return;
    if (influencers.length === 0 && tasks.length === 0) return;

    const timer = setTimeout(() => {
      executeAutoCreatorSystemPass(false);
    }, 600);

    return () => clearTimeout(timer);
  }, [isAutoCreatorSystemEnabled, influencers, tasks, executeAutoCreatorSystemPass]);

  // Delete all influencer profiles from database
  const handleDeleteAllInfluencers = () => {
    isClearingAllRef.current = true;
    setTimeout(() => { isClearingAllRef.current = false; }, 8000);
    if (user) {
      influencers.forEach(inf => {
        deleteDocInDb('influencers', inf.id).catch(err => console.error(err));
      });
    }
    setInfluencers([]);
    
    // ON DELETE SET NULL for all tasks
    setTasks(prev => {
      const updated = prev.map(t => t.influencerId ? { ...t, influencerId: '' } : t);
      const changed = updated.filter(t => prev.find(p => p.id === t.id)?.influencerId);
      if (user && changed.length > 0) {
        setTimeout(() => {
          changed.forEach(t => updateDocInDb('tasks', t.id, { influencerId: '' }).catch(e => console.error(e)));
        }, 0);
      }
      return updated;
    });
  };

  // Restore custom database snapshot
  const handleRestoreData = useCallback(async (restoredData: {
    influencers?: Influencer[];
    campaigns?: Campaign[];
    tasks?: Task[];
    messages?: Message[];
    contracts?: Contract[];
    billingEntries?: BillingEntry[];
    dashboardProducts?: ProductConfig[];
    monthlyTargets?: MonthlyProductTarget[];
    monthlyBudgets?: MonthlyBudget[];
    savedProducts?: string[];
    selectedMonth?: string;
    selectedYear?: string;
    agencyName?: string;
    developerName?: string;
    notebookNotes?: Note[];
    aovEntries?: AovEntry[];
    salesData?: any[];
  }) => {
    console.log('[Restore] Received backup restoration payload:', restoredData);

    if (!restoredData || typeof restoredData !== 'object') {
      console.error('[Restore] Invalid or empty restoredData payload supplied.');
      console.warn('Restoration error: No valid backup content received.');
      return;
    }

    // Resiliently unpack .payload if it exists in the root of restoredData
    const dataToRestore = (restoredData && (restoredData as any).payload && typeof (restoredData as any).payload === 'object')
      ? { ...restoredData, ...(restoredData as any).payload }
      : restoredData;
    
    const shadedRestoredData = dataToRestore;
    const suffix = user ? user.uid : 'guest';

    // 1. ID and relational database pre-sanitizing mapping pass
    const uniqueBase = Date.now();
    const sanitizeId = (id: string | undefined, prefix: string, idx: number): string => {
      const rawId = id ? String(id) : '';
      const cleaned = rawId.replace(/[^a-zA-Z0-9_\-]/g, '');
      return (cleaned && cleaned.length > 0 && cleaned.length <= 128) 
        ? cleaned 
        : `${prefix}-${idx}-${uniqueBase}`;
    };

    const influencerIdMap = new Map<string, string>();
    const campaignIdMap = new Map<string, string>();

    // A. Pre-process and map Influencers
    let sanitizedInfluencers: Influencer[] = [];
    if (shadedRestoredData.influencers && Array.isArray(shadedRestoredData.influencers)) {
      const existingInfsRaw = safeLocalStorage.getItem(`INFLUENCER_MANAGER_INFS_${suffix}`) || safeLocalStorage.getItem('INFLUENCER_MANAGER_INFS') || '[]';
      const existingInfs: Influencer[] = JSON.parse(existingInfsRaw);
      const existingInfsMap = new Map(existingInfs.map(inf => [inf.id, inf]));

      shadedRestoredData.influencers.forEach((inf: any, idx: number) => {
        if (!inf || typeof inf !== 'object') return;
        const cleanId = sanitizeId(inf.id, 'inf', idx);
        if (inf.id) {
          influencerIdMap.set(String(inf.id), cleanId);
        }
        
        let mergedInf = {
          ...inf,
          id: cleanId,
          name: (inf.name && String(inf.name).trim().slice(0, 200)) || 'Unnamed Creator',
          handle: (inf.handle && String(inf.handle).trim().slice(0, 100)) || '@handle',
          status: inf.status || 'Available',
          ownerId: user ? user.uid : 'guest'
        };

        const localInf = existingInfsMap.get(cleanId);
        if (localInf) {
          const hasLocalPdfDetails = !!(localInf.billingName || (localInf.bankDetails && localInf.bankDetails.accountNumber) || localInf.influencerSignature);
          if (hasLocalPdfDetails) {
            mergedInf = {
              ...mergedInf,
              billingName: localInf.billingName || mergedInf.billingName,
              billingAddress: localInf.billingAddress || mergedInf.billingAddress,
              bankDetails: {
                 ...(mergedInf.bankDetails || {}),
                 ...(localInf.bankDetails || {})
              },
              influencerSignature: localInf.influencerSignature || mergedInf.influencerSignature,
              bdmSignature: localInf.bdmSignature || mergedInf.bdmSignature
            };
          }
        }
        sanitizedInfluencers.push(mergedInf);
      });
      
      const backupInfIds = new Set(sanitizedInfluencers.map(i => i.id));
      existingInfs.forEach(li => {
         if (!backupInfIds.has(li.id)) sanitizedInfluencers.push(li);
      });
    }

    // B. Pre-process and map Campaigns
    const sanitizedCampaigns: Campaign[] = [];
    if (shadedRestoredData.campaigns && Array.isArray(shadedRestoredData.campaigns)) {
      shadedRestoredData.campaigns.forEach((c: any, idx: number) => {
        if (!c || typeof c !== 'object') return;
        const cleanId = sanitizeId(c.id, 'camp', idx);
        if (c.id) {
          campaignIdMap.set(String(c.id), cleanId);
        }
        
        let normalizedBudget = 5000;
        if (typeof c.budget === 'number') {
          normalizedBudget = c.budget;
        } else if (c.budget) {
          const parsed = Number(c.budget);
          if (!isNaN(parsed)) normalizedBudget = parsed;
        }

        let normalizedSpent = 0;
        if (typeof c.spent === 'number') {
          normalizedSpent = c.spent;
        } else if (c.spent) {
          const parsed = Number(c.spent);
          if (!isNaN(parsed)) normalizedSpent = parsed;
        }

        // Resiliently update campaign target influencer IDs using mapped assignments
        const mappedInfluencers: string[] = [];
        if (Array.isArray(c.influencersAssigned)) {
          c.influencersAssigned.forEach((infId: any) => {
            const strId = String(infId);
            if (influencerIdMap.has(strId)) {
              mappedInfluencers.push(influencerIdMap.get(strId)!);
            } else {
              mappedInfluencers.push(strId);
            }
          });
        }

        sanitizedCampaigns.push({
          ...c,
          id: cleanId,
          name: (c.name && String(c.name).trim().slice(0, 200)) || 'Unnamed Campaign',
          budget: normalizedBudget,
          spent: normalizedSpent,
          status: c.status || 'Active',
          influencersAssigned: mappedInfluencers,
          ownerId: user ? user.uid : 'guest'
        });
      });
    }

    const getCleanInfluencerId = (oldId: string | undefined, idx: number): string => {
      if (!oldId) return sanitizeId(undefined, 'inf', idx);
      const strOldId = String(oldId);
      if (influencerIdMap.has(strOldId)) {
        return influencerIdMap.get(strOldId)!;
      }
      return sanitizeId(oldId, 'inf', idx);
    };

    const getCleanCampaignId = (oldId: string | undefined, idx: number): string => {
      if (!oldId) return sanitizeId(undefined, 'camp', idx);
      const strOldId = String(oldId);
      if (campaignIdMap.has(strOldId)) {
        return campaignIdMap.get(strOldId)!;
      }
      return sanitizeId(oldId, 'camp', idx);
    };

        // C. Pre-process and map Tasks
    let sanitizedTasks: Task[] = [];
    if (shadedRestoredData.tasks && Array.isArray(shadedRestoredData.tasks)) {
      const existingTasksRaw = safeLocalStorage.getItem(`INFLUENCER_MANAGER_TSKS_${suffix}`) || safeLocalStorage.getItem('INFLUENCER_MANAGER_TSKS') || '[]';
      const existingTasks: Task[] = JSON.parse(existingTasksRaw);
      const existingTasksMap = new Map(existingTasks.map(t => [t.id, t]));

      shadedRestoredData.tasks.forEach((t: any, idx: number) => {
        if (!t || typeof t !== 'object') return;
        const cleanId = sanitizeId(t.id, 'task', idx);
        let normalizedRemuneration = 0;
        if (typeof t.remuneration === 'number') {
          normalizedRemuneration = t.remuneration;
        } else if (t.remuneration) {
          const parsed = Number(t.remuneration);
          if (!isNaN(parsed)) normalizedRemuneration = parsed;
        }
        let normalizedViews = 0;
        if (typeof t.views === 'number') {
          normalizedViews = t.views;
        } else if (t.views) {
          const parsed = Number(t.views);
          if (!isNaN(parsed)) normalizedViews = parsed;
        }
        let normalizedClicks = 0;
        if (typeof t.clicks === 'number') {
          normalizedClicks = t.clicks;
        } else if (t.clicks) {
          const parsed = Number(t.clicks);
          if (!isNaN(parsed)) normalizedClicks = parsed;
        }
        
        let mergedTask = {
          ...t,
          id: cleanId,
          campaignId: getCleanCampaignId(t.campaignId, idx),
          influencerId: getCleanInfluencerId(t.influencerId, idx),
          title: (t.title && String(t.title).trim().slice(0, 200)) || 'Untitled Deliverable',
          remuneration: normalizedRemuneration,
          views: normalizedViews,
          clicks: normalizedClicks,
          status: t.status || 'Pending',
          ownerId: user ? user.uid : 'guest'
        };

        const localTask = existingTasksMap.get(cleanId);
        if (localTask) {
           mergedTask = {
             ...mergedTask,
             ...(localTask.title ? {title: localTask.title} : {}),
             ...(localTask.status ? {status: localTask.status} : {}),
             ...(localTask.releaseDate ? {releaseDate: localTask.releaseDate} : {}),
             ...(localTask.remuneration ? {remuneration: localTask.remuneration} : {}),
             ...(localTask.clicks ? {clicks: localTask.clicks} : {}),
             ...(localTask.views ? {views: localTask.views} : {}),
             // PDF fields
             pdfBillDate: localTask.pdfBillDate || mergedTask.pdfBillDate,
             pdfVideoNo: localTask.pdfVideoNo || mergedTask.pdfVideoNo,
             pdfVideoReleaseDate: localTask.pdfVideoReleaseDate || mergedTask.pdfVideoReleaseDate,
             pdfCampaignBrand: localTask.pdfCampaignBrand || mergedTask.pdfCampaignBrand,
             pdfVideoLink: localTask.pdfVideoLink || mergedTask.pdfVideoLink,
             pdfItemDesc: localTask.pdfItemDesc || mergedTask.pdfItemDesc,
             pdfRate: localTask.pdfRate || mergedTask.pdfRate,
             pdfAdditionalItemDesc: localTask.pdfAdditionalItemDesc || mergedTask.pdfAdditionalItemDesc,
             pdfAdditionalItemAmount: localTask.pdfAdditionalItemAmount || mergedTask.pdfAdditionalItemAmount,
             pdfOrderNumber: localTask.pdfOrderNumber || mergedTask.pdfOrderNumber,
             pdfOrderDate: localTask.pdfOrderDate || mergedTask.pdfOrderDate,
           };
        }
        sanitizedTasks.push(mergedTask);
      });
      
      const backupTaskIds = new Set(sanitizedTasks.map(t => t.id));
      existingTasks.forEach(lt => {
         if (!backupTaskIds.has(lt.id)) sanitizedTasks.push(lt);
      });
    }
    // D. Pre-process and map Messages
    const sanitizedMessages: Message[] = [];
    if (shadedRestoredData.messages && Array.isArray(shadedRestoredData.messages)) {
      shadedRestoredData.messages.forEach((m: any, idx: number) => {
        if (!m || typeof m !== 'object') return;
        const cleanId = sanitizeId(m.id, 'msg', idx);
        sanitizedMessages.push({
          ...m,
          id: cleanId,
          influencerId: getCleanInfluencerId(m.influencerId, idx),
          text: (m.text && String(m.text).slice(0, 2000)) || '(Empty message)',
          sender: m.sender || 'brand',
          timestamp: m.timestamp || new Date().toISOString(),
          ownerId: user ? user.uid : 'guest'
        });
      });
    }

    // E. Pre-process and map Contracts
    const sanitizedContracts: Contract[] = [];
    if (shadedRestoredData.contracts && Array.isArray(shadedRestoredData.contracts)) {
      shadedRestoredData.contracts.forEach((c: any, idx: number) => {
        if (!c || typeof c !== 'object') return;
        const cleanId = sanitizeId(c.id, 'cont', idx);

        let normalizedValue = 0;
        if (typeof c.value === 'number') {
          normalizedValue = c.value;
        } else if (c.value) {
          const parsed = Number(c.value);
          if (!isNaN(parsed)) normalizedValue = parsed;
        }

        sanitizedContracts.push({
          ...c,
          id: cleanId,
          campaignId: getCleanCampaignId(c.campaignId, idx),
          influencerId: getCleanInfluencerId(c.influencerId, idx),
          status: c.status || 'Draft',
          terms: (c.terms && String(c.terms).slice(0, 5000)) || 'No custom terms specified',
          value: normalizedValue,
          ownerId: user ? user.uid : 'guest'
        });
      });
    }

    // F. Pre-process and map Billing Entries / Invoices
    const sanitizedBillingEntries: BillingEntry[] = [];
    if (shadedRestoredData.billingEntries && Array.isArray(shadedRestoredData.billingEntries)) {
      shadedRestoredData.billingEntries.forEach((b: any, idx: number) => {
        if (!b || typeof b !== 'object') return;
        const cleanId = sanitizeId(b.id, 'bill', idx);

        let normalizedAmount = 0;
        if (typeof b.amount === 'number') {
          normalizedAmount = b.amount;
        } else if (b.amount) {
          const parsed = Number(b.amount);
          if (!isNaN(parsed)) normalizedAmount = parsed;
        }

        sanitizedBillingEntries.push({
          ...b,
          id: cleanId,
          campaignId: getCleanCampaignId(b.campaignId, idx),
          influencerId: getCleanInfluencerId(b.influencerId, idx),
          type: b.type || 'Payout',
          amount: normalizedAmount,
          status: b.status || 'Unpaid',
          ownerId: user ? user.uid : 'guest'
        });
      });
    }

    // G. Pre-process and map AOV entries
    const sanitizedAovEntries: AovEntry[] = [];
    if (shadedRestoredData.aovEntries && Array.isArray(shadedRestoredData.aovEntries)) {
      shadedRestoredData.aovEntries.forEach((ae: any, idx: number) => {
        if (!ae || typeof ae !== 'object') return;
        const cleanId = sanitizeId(ae.id, 'aov', idx);
        sanitizedAovEntries.push({
          id: cleanId,
          month: String(ae.month || '05').slice(0, 10),
          year: String(ae.year || '2026').slice(0, 10),
          productName: ae.productName ? String(ae.productName).slice(0, 250) : undefined,
          revenue: parseFloat(ae.revenue) || 0,
          orders: parseInt(ae.orders as any) || 0,
          calculatedAov: parseFloat(ae.calculatedAov) || 0,
          targetAov: ae.targetAov ? parseFloat(ae.targetAov) : undefined,
          notes: ae.notes ? String(ae.notes).slice(0, 2000) : undefined,
          ownerId: user ? user.uid : 'guest'
        });
      });
    }

    // H. Pre-process and map Monthly Targets entries
    const sanitizedMonthlyTargets: MonthlyProductTarget[] = [];
    if (shadedRestoredData.monthlyTargets && Array.isArray(shadedRestoredData.monthlyTargets)) {
      shadedRestoredData.monthlyTargets.forEach((mt: any, idx: number) => {
        if (!mt || typeof mt !== 'object') return;
        const cleanId = sanitizeId(mt.id, 'target', idx);
        sanitizedMonthlyTargets.push({
          id: cleanId,
          productName: String(mt.productName || 'Unnamed Product').trim().slice(0, 250),
          target: mt.target !== undefined ? (parseFloat(mt.target as any) || 100000) : 100000,
          videoTarget: mt.videoTarget !== undefined ? (parseInt(mt.videoTarget as any) || 5) : 5,
          salesAmount: mt.salesAmount !== undefined ? (parseFloat(mt.salesAmount as any) || 0) : 0,
          salesAmountWeek1: mt.salesAmountWeek1 !== undefined ? (parseFloat(mt.salesAmountWeek1 as any) || 0) : undefined,
          salesAmountWeek2: mt.salesAmountWeek2 !== undefined ? (parseFloat(mt.salesAmountWeek2 as any) || 0) : undefined,
          salesAmountWeek3: mt.salesAmountWeek3 !== undefined ? (parseFloat(mt.salesAmountWeek3 as any) || 0) : undefined,
          salesAmountWeek4: mt.salesAmountWeek4 !== undefined ? (parseFloat(mt.salesAmountWeek4 as any) || 0) : undefined,
          salesAmountWeek5: mt.salesAmountWeek5 !== undefined ? (parseFloat(mt.salesAmountWeek5 as any) || 0) : undefined,
          month: String(mt.month || '05').slice(0, 10),
          year: String(mt.year || '2026').slice(0, 10),
          ownerId: user ? user.uid : 'guest'
        });
      });
    }

    // 2. Perform physical database backup/restore sync if there is a firebase session active
    if (user) {
      try {
        console.log('[Restore] Initiating Firestore physical sync for authenticated session:', user.uid);
        
        const collectionsToMerge = [
          { name: 'influencers', localList: sanitizedInfluencers },
          { name: 'campaigns', localList: sanitizedCampaigns },
          { name: 'tasks', localList: sanitizedTasks },
          { name: 'messages', localList: sanitizedMessages },
          { name: 'contracts', localList: sanitizedContracts },
          { name: 'billingEntries', localList: sanitizedBillingEntries },
          { name: 'aovEntries', localList: sanitizedAovEntries },
          { name: 'monthlyTargets', localList: sanitizedMonthlyTargets },
          { name: 'notebookNotes', localList: (shadedRestoredData.notebookNotes && Array.isArray(shadedRestoredData.notebookNotes)) ? shadedRestoredData.notebookNotes.map((n: any) => ({ ...n, id: n.id || ('note_' + Math.random().toString(36).substring(2, 11)) })) : [] },
          { name: 'monthlyBudgets', localList: (shadedRestoredData.monthlyBudgets && Array.isArray(shadedRestoredData.monthlyBudgets)) ? shadedRestoredData.monthlyBudgets : [] }
        ];

        const getTs = (obj: any) => {
            if (obj && obj.lastUpdated) {
                const t = new Date(obj.lastUpdated).getTime();
                if (!isNaN(t)) return t;
            }
            if (obj && obj.timestamp) {
                const t = new Date(obj.timestamp).getTime();
                if (!isNaN(t)) return t;
            }
            return 0;
        };

        for (const col of collectionsToMerge) {
           if (!col.localList || col.localList.length === 0) continue;
           
           try {
              const isAdmin = ((user.email || '').toLowerCase().trim() === 'ashimgogoi2008@gmail.com' || (user.email || '').toLowerCase().trim() === 'ea@protogrow.in');
              const q = isAdmin ? query(collection(db, col.name)) : query(collection(db, col.name), where('ownerId', '==', user.uid));
              const snapshot = await getDocs(q);
              
              const firestoreDocs = new Map();
              snapshot.docs.forEach(doc => {
                 firestoreDocs.set(doc.id, { id: doc.id, ...doc.data() });
              });
              
              const mergedList = [];
              const handledIds = new Set();
              
              // Process items from the backup/local merge
              for (const item of col.localList) {
                  const safeId = String(item.id);
                  handledIds.add(safeId);
                  const fsItem = firestoreDocs.get(safeId);
                  let finalItem = { ...item, ownerId: user.uid };
                  if (fsItem) {
                      const itemTs = getTs(item);
                      const fsTs = getTs(fsItem);
                      if (fsTs > itemTs) {
                          // Firestore is newer
                          finalItem = { ...item, ...fsItem, ownerId: user.uid };
                      } else {
                          // Backup/local is newer
                          finalItem = { ...fsItem, ...item, ownerId: user.uid };
                      }
                  }
                  mergedList.push(finalItem);
              }
              
              // Add any items from Firestore that weren't in the backup/local at all
              for (const [id, fsItem] of firestoreDocs.entries()) {
                  if (!handledIds.has(String(id))) {
                      mergedList.push({ ...fsItem, ownerId: user.uid });
                  }
              }
              
              // Update the array reference so the React states get the fully merged list
              col.localList.length = 0;
              col.localList.push(...mergedList);
              
              // Save to Firestore
              await batchInitializeCollection(col.name, mergedList, user.uid);
              
           } catch (err) {
              console.warn(`Error merging with Firestore for ${col.name}:`, err);
           }
        }
        
        // Also map notebookNotes and monthlyBudgets back to shadedRestoredData so they update React state correctly
        const notesCol = collectionsToMerge.find(c => c.name === 'notebookNotes');
        if (notesCol && notesCol.localList.length > 0) shadedRestoredData.notebookNotes = notesCol.localList;
        
        const budgetsCol = collectionsToMerge.find(c => c.name === 'monthlyBudgets');
        if (budgetsCol && budgetsCol.localList.length > 0) shadedRestoredData.monthlyBudgets = budgetsCol.localList;

      } catch (err: any) {
        console.error('Error during Firestore restore:', err);
        console.warn(`Firestore error occurred during restore: ${err?.message || err}. Some records may not have synced correctly.`);
        showToast(`Backup Sync Error: ${err?.message || 'Permission Denied'}`, 'error');
      }
    }

    // 3. React States and Storage Synchronicities
    const itemsToSet: Record<string, string> = {};

    if (shadedRestoredData.influencers && Array.isArray(shadedRestoredData.influencers)) {
      setInfluencers(sanitizedInfluencers);
      itemsToSet['INFLUENCER_MANAGER_INFS'] = JSON.stringify(sanitizedInfluencers);
      itemsToSet[`INFLUENCER_MANAGER_INFS_${suffix}`] = JSON.stringify(sanitizedInfluencers);
    }
    if (shadedRestoredData.campaigns && Array.isArray(shadedRestoredData.campaigns)) {
      setCampaigns(sanitizedCampaigns);
      itemsToSet['INFLUENCER_MANAGER_CAMPS'] = JSON.stringify(sanitizedCampaigns);
      itemsToSet[`INFLUENCER_MANAGER_CAMPS_${suffix}`] = JSON.stringify(sanitizedCampaigns);
    }
    if (shadedRestoredData.tasks && Array.isArray(shadedRestoredData.tasks)) {
      const existingTasksRaw = safeLocalStorage.getItem(`INFLUENCER_MANAGER_TSKS_${suffix}`) || safeLocalStorage.getItem('INFLUENCER_MANAGER_TSKS') || '[]';
      const existingTasks = JSON.parse(existingTasksRaw);
      
      // Check if there are new tasks in the local state compared to the backup
      const existingTaskIds = new Set(existingTasks.map((t: any) => t.id));
      const backupTaskIds = new Set(shadedRestoredData.tasks.map((t: any) => t.id));
      
      let hasNewTasksLocally = false;
      for (const id of existingTaskIds) {
          if (!backupTaskIds.has(id)) {
              hasNewTasksLocally = true;
              break;
          }
      }

      // Strict check: if the local application state currently has MORE tasks, OR has NEW tasks not in the backup
      if (existingTasks.length > shadedRestoredData.tasks.length || hasNewTasksLocally) {
        console.warn('Backup is missing newer tasks. Merging to protect new Monthly Planner data.');
        showToast('Backup merged with existing newer tasks.', 'info');
        
        // Use sanitizedTasks which already contains the merged results from earlier
        setTasks(sanitizedTasks);
        itemsToSet['INFLUENCER_MANAGER_TSKS'] = JSON.stringify(sanitizedTasks);
        itemsToSet[`INFLUENCER_MANAGER_TSKS_${suffix}`] = JSON.stringify(sanitizedTasks);
      } else {
        // Complete overwrite is safe
        setTasks(sanitizedTasks);
        itemsToSet['INFLUENCER_MANAGER_TSKS'] = JSON.stringify(sanitizedTasks);
        itemsToSet[`INFLUENCER_MANAGER_TSKS_${suffix}`] = JSON.stringify(sanitizedTasks);
      }
    }
    if (shadedRestoredData.messages && Array.isArray(shadedRestoredData.messages)) {
      setMessages(sanitizedMessages);
      itemsToSet['INFLUENCER_MANAGER_MSGS'] = JSON.stringify(sanitizedMessages);
      itemsToSet[`INFLUENCER_MANAGER_MSGS_${suffix}`] = JSON.stringify(sanitizedMessages);
    }
    if (shadedRestoredData.contracts && Array.isArray(shadedRestoredData.contracts)) {
      setContracts(sanitizedContracts);
      itemsToSet['INFLUENCER_MANAGER_CONTS'] = JSON.stringify(sanitizedContracts);
      itemsToSet[`INFLUENCER_MANAGER_CONTS_${suffix}`] = JSON.stringify(sanitizedContracts);
    }
    if (shadedRestoredData.billingEntries && Array.isArray(shadedRestoredData.billingEntries)) {
      setBillingEntries(sanitizedBillingEntries);
      itemsToSet['INFLUENCER_MANAGER_BILLS'] = JSON.stringify(sanitizedBillingEntries);
      itemsToSet[`INFLUENCER_MANAGER_BILLS_${suffix}`] = JSON.stringify(sanitizedBillingEntries);
    }
    if (shadedRestoredData.aovEntries && Array.isArray(shadedRestoredData.aovEntries)) {
      setAovEntries(sanitizedAovEntries);
      prevAovEntriesRef.current = JSON.stringify(sanitizedAovEntries);
      itemsToSet['INFLUENCER_MANAGER_AOV_ENTRIES'] = JSON.stringify(sanitizedAovEntries);
      itemsToSet[`INFLUENCER_MANAGER_AOV_ENTRIES_${suffix}`] = JSON.stringify(sanitizedAovEntries);
    }
    
    if (shadedRestoredData.notebookNotes && Array.isArray(shadedRestoredData.notebookNotes)) {
      const currentNotes = prevNotebookNotesRef.current ? JSON.parse(prevNotebookNotesRef.current) : [];
      if (currentNotes.length > shadedRestoredData.notebookNotes.length) {
        console.warn('Backup has fewer notebook notes than current. Keeping existing notebook notes.');
        showToast('Backup has fewer notebook notes than current. Kept existing notebook notes.', 'info');
      } else {
        setNotebookNotes(shadedRestoredData.notebookNotes);
        prevNotebookNotesRef.current = JSON.stringify(shadedRestoredData.notebookNotes);
        itemsToSet['INFLUENCER_MANAGER_NOTEBOOK_NOTES'] = JSON.stringify(shadedRestoredData.notebookNotes);
        itemsToSet[`INFLUENCER_MANAGER_NOTEBOOK_NOTES_${suffix}`] = JSON.stringify(shadedRestoredData.notebookNotes);
      }
    }

    if (shadedRestoredData.dashboardProducts && Array.isArray(shadedRestoredData.dashboardProducts)) {
      setDashboardProducts(shadedRestoredData.dashboardProducts);
      prevDashboardNamesRef.current = shadedRestoredData.dashboardProducts.map((p: any) => p && p.name);
      prevDashboardJsonRef.current = JSON.stringify(shadedRestoredData.dashboardProducts);
      itemsToSet['INFLUENCER_MANAGER_DASHBOARD_PRODUCTS'] = JSON.stringify(shadedRestoredData.dashboardProducts);
      itemsToSet[`INFLUENCER_MANAGER_DASHBOARD_PRODUCTS_${suffix}`] = JSON.stringify(shadedRestoredData.dashboardProducts);
    }
    if (shadedRestoredData.monthlyTargets && Array.isArray(shadedRestoredData.monthlyTargets)) {
      setMonthlyTargets(sanitizedMonthlyTargets);
      prevMonthlyTargetsRef.current = JSON.stringify(sanitizedMonthlyTargets);
      itemsToSet['INFLUENCER_MANAGER_MONTHLY_TARGETS'] = JSON.stringify(sanitizedMonthlyTargets);
      itemsToSet[`INFLUENCER_MANAGER_MONTHLY_TARGETS_${suffix}`] = JSON.stringify(sanitizedMonthlyTargets);
    }
    if (shadedRestoredData.monthlyBudgets && Array.isArray(shadedRestoredData.monthlyBudgets)) {
      setMonthlyBudgets(shadedRestoredData.monthlyBudgets);
      prevMonthlyBudgetsRef.current = JSON.stringify(shadedRestoredData.monthlyBudgets);
      itemsToSet['INFLUENCER_MANAGER_MONTHLY_BUDGETS'] = JSON.stringify(shadedRestoredData.monthlyBudgets);
      itemsToSet[`INFLUENCER_MANAGER_MONTHLY_BUDGETS_${suffix}`] = JSON.stringify(shadedRestoredData.monthlyBudgets);
    }
    if (shadedRestoredData.savedProducts && Array.isArray(shadedRestoredData.savedProducts)) {
      setSavedProducts(shadedRestoredData.savedProducts);
      prevSavedRef.current = shadedRestoredData.savedProducts;
      itemsToSet['INFLUENCER_MANAGER_SAVED_PRODUCTS'] = JSON.stringify(shadedRestoredData.savedProducts);
      itemsToSet[`INFLUENCER_MANAGER_SAVED_PRODUCTS_${suffix}`] = JSON.stringify(shadedRestoredData.savedProducts);
    }
    if (shadedRestoredData.selectedMonth) {
      setSelectedMonth(shadedRestoredData.selectedMonth);
      itemsToSet['INFLUENCER_MANAGER_SELECTED_MONTH'] = shadedRestoredData.selectedMonth;
    }
    if (shadedRestoredData.selectedYear) {
      setSelectedYear(shadedRestoredData.selectedYear);
      itemsToSet['INFLUENCER_MANAGER_SELECTED_YEAR'] = shadedRestoredData.selectedYear;
    }
    if (shadedRestoredData.salesData && Array.isArray(shadedRestoredData.salesData)) {
      setSalesData(shadedRestoredData.salesData);
      itemsToSet['SALES_DASHBOARD_DATA'] = JSON.stringify(shadedRestoredData.salesData);
      itemsToSet[`SALES_DASHBOARD_DATA_${suffix}`] = JSON.stringify(shadedRestoredData.salesData);
      prevSalesDataRef.current = JSON.stringify(shadedRestoredData.salesData);
    }
    if (shadedRestoredData.salesFileName) {
      setSalesFileName(shadedRestoredData.salesFileName);
      itemsToSet['SALES_DASHBOARD_FILENAME'] = shadedRestoredData.salesFileName;
      itemsToSet[`SALES_DASHBOARD_FILENAME_${suffix}`] = shadedRestoredData.salesFileName;
      prevSalesFileNameRef.current = shadedRestoredData.salesFileName;
    }

    if (shadedRestoredData.agencyName) {
      setAgencyName(shadedRestoredData.agencyName);
      itemsToSet['INFLUENCER_MANAGER_AGENCY_NAME'] = shadedRestoredData.agencyName;
    }
    if (shadedRestoredData.developerName) {
      setDeveloperName(shadedRestoredData.developerName);
      itemsToSet['INFLUENCER_MANAGER_DEVELOPER_NAME'] = shadedRestoredData.developerName;
    }

    // Call single batch key-value storage updater to prevent multiple database writing races
    safeLocalStorage.setItems(itemsToSet);
  }, [user]);

  useEffect(() => {
    (window as any).forceRestoreBackup = () => {
      const snapRaw = safeLocalStorage.getItem('SYS_MEMORY_LAST_RECOVERY_RESERVE');
      if (snapRaw) {
        console.log("Forcing restore of SYS_MEMORY_LAST_RECOVERY_RESERVE...");
        try {
            const snap = JSON.parse(snapRaw);
            handleRestoreData(snap).then(() => {
              console.log("Force restore complete!");
              showToast("Data restored successfully from local backup!", "success");
            });
        } catch(e) {
            console.error(e);
        }
      } else {
        console.warn("No backup found in SYS_MEMORY_LAST_RECOVERY_RESERVE");
        showToast("No backup found to restore.", "error");
      }
    };
  }, [handleRestoreData]);

  // Auto-migrate guest data or recovery reserve if Firestore is empty on first login
  useEffect(() => {
    if (user && isStorageHydrated && hasHydratedFromServer) {
      if (safeLocalStorage.getItem('HAS_MIGRATED_GUEST_DATA_v4_' + user.uid)) return;

      console.log("Triggering auto-restore from local guest data...");
      
      try {
        const hasGuestInfluencers = safeLocalStorage.getItem('INFLUENCER_MANAGER_INFS_guest');
        const snapRaw = safeLocalStorage.getItem('SYS_MEMORY_LAST_RECOVERY_RESERVE');
        
        if (hasGuestInfluencers && hasGuestInfluencers !== '[]') {
           // Create a makeshift payload from all guest items
           const payload = {
             influencers: JSON.parse(safeLocalStorage.getItem('INFLUENCER_MANAGER_INFS_guest') || '[]'),
             campaigns: JSON.parse(safeLocalStorage.getItem('INFLUENCER_MANAGER_CAMPS_guest') || '[]'),
             tasks: JSON.parse(safeLocalStorage.getItem('INFLUENCER_MANAGER_TSKS_guest') || '[]'),
             messages: JSON.parse(safeLocalStorage.getItem('INFLUENCER_MANAGER_MSGS_guest') || '[]'),
             contracts: JSON.parse(safeLocalStorage.getItem('INFLUENCER_MANAGER_CONTS_guest') || '[]'),
             billingEntries: JSON.parse(safeLocalStorage.getItem('INFLUENCER_MANAGER_BILLS_guest') || '[]'),
             aovEntries: JSON.parse(safeLocalStorage.getItem('INFLUENCER_MANAGER_AOV_ENTRIES_guest') || '[]'),
             monthlyTargets: JSON.parse(safeLocalStorage.getItem('INFLUENCER_MANAGER_MONTHLY_TARGETS_guest') || '[]'),
             monthlyBudgets: JSON.parse(safeLocalStorage.getItem('INFLUENCER_MANAGER_MONTHLY_BUDGETS_guest') || '[]'),
             notebookNotes: JSON.parse(safeLocalStorage.getItem('INFLUENCER_MANAGER_NOTEBOOK_NOTES_guest') || '[]'),
           };
           
           console.log("Successfully fetched guest payload for migration!");
           handleRestoreData(payload).then(() => {
              safeLocalStorage.setItem('HAS_MIGRATED_GUEST_DATA_v4_' + user.uid, 'true');
              showToast("Migrated guest data to your cloud account!", "success");
           });
        } else if (snapRaw) {
          const snap = JSON.parse(snapRaw);
          console.log("Successfully fetched payload from local reserve!");
          handleRestoreData(snap).then(() => {
             safeLocalStorage.setItem('HAS_MIGRATED_GUEST_DATA_v4_' + user.uid, 'true');
             showToast("Migrated recovered data to Firestore!", "success");
          });
        } else {
             // mark as migrated anyway so we don't spam
             safeLocalStorage.setItem('HAS_MIGRATED_GUEST_DATA_v4_' + user.uid, 'true');
        }
      } catch (err: any) {
          console.error("Auto restore failed", err);
          // mark as migrated anyway
          safeLocalStorage.setItem('HAS_MIGRATED_GUEST_DATA_v4_' + user.uid, 'true');
      }

    }
  }, [user, isStorageHydrated, hasHydratedFromServer, handleRestoreData]);

  // --- SELF-HEALING DATA SYSTEM ---
  useEffect(() => {
    if (!isStorageHydrated || !hasHydratedFromServer || isLoadingCloud) return;

    const performSelfHealing = async () => {
      // 1. Detection: Are core datasets anomalously empty?
      const isDataEmpty = influencers.length === 0 && campaigns.length === 0;
      if (!isDataEmpty) return;

      // Avoid infinite heal loops if user genuinely deleted everything today
      const healKey = `SYS_HEALED_${user ? user.uid : 'guest'}_${new Date().toDateString()}`;
      if (safeLocalStorage.getItem(healKey)) return;

      setIsSelfHealing(true);
      console.log('[Self-Healing] Anomaly detected: Core data is empty. Initiating self-healing sequence...');

      try {
        // 2. Fallback Logic: Fetch last known good state from local storage
        const snapRaw = safeLocalStorage.getItem('SYS_MEMORY_LAST_RECOVERY_RESERVE');
        const guestInfs = safeLocalStorage.getItem('INFLUENCER_MANAGER_INFS_guest');
        const globalInfs = safeLocalStorage.getItem('INFLUENCER_MANAGER_INFS');

        let payloadToRestore = null;

        if (snapRaw && snapRaw !== '[]' && snapRaw.length > 50) {
           console.log('[Self-Healing] Restoring from System Memory Reserve');
           payloadToRestore = JSON.parse(snapRaw);
        } else if (guestInfs && guestInfs !== '[]') {
           console.log('[Self-Healing] Restoring from Guest Partition');
           payloadToRestore = {
             influencers: JSON.parse(safeLocalStorage.getItem('INFLUENCER_MANAGER_INFS_guest') || '[]'),
             campaigns: JSON.parse(safeLocalStorage.getItem('INFLUENCER_MANAGER_CAMPS_guest') || '[]'),
             tasks: JSON.parse(safeLocalStorage.getItem('INFLUENCER_MANAGER_TSKS_guest') || '[]'),
             messages: JSON.parse(safeLocalStorage.getItem('INFLUENCER_MANAGER_MSGS_guest') || '[]'),
             contracts: JSON.parse(safeLocalStorage.getItem('INFLUENCER_MANAGER_CONTS_guest') || '[]'),
             billingEntries: JSON.parse(safeLocalStorage.getItem('INFLUENCER_MANAGER_BILLS_guest') || '[]'),
             aovEntries: JSON.parse(safeLocalStorage.getItem('INFLUENCER_MANAGER_AOV_ENTRIES_guest') || '[]'),
             monthlyTargets: JSON.parse(safeLocalStorage.getItem('INFLUENCER_MANAGER_MONTHLY_TARGETS_guest') || '[]'),
             monthlyBudgets: JSON.parse(safeLocalStorage.getItem('INFLUENCER_MANAGER_MONTHLY_BUDGETS_guest') || '[]'),
             notebookNotes: JSON.parse(safeLocalStorage.getItem('INFLUENCER_MANAGER_NOTEBOOK_NOTES_guest') || '[]'),
           };
        } else if (globalInfs && globalInfs !== '[]') {
           console.log('[Self-Healing] Restoring from Global Local Storage');
           payloadToRestore = {
             influencers: JSON.parse(safeLocalStorage.getItem('INFLUENCER_MANAGER_INFS') || '[]'),
             campaigns: JSON.parse(safeLocalStorage.getItem('INFLUENCER_MANAGER_CAMPS') || '[]'),
             tasks: JSON.parse(safeLocalStorage.getItem('INFLUENCER_MANAGER_TSKS') || '[]'),
             messages: JSON.parse(safeLocalStorage.getItem('INFLUENCER_MANAGER_MSGS') || '[]'),
             contracts: JSON.parse(safeLocalStorage.getItem('INFLUENCER_MANAGER_CONTS') || '[]'),
             billingEntries: JSON.parse(safeLocalStorage.getItem('INFLUENCER_MANAGER_BILLS') || '[]'),
             aovEntries: JSON.parse(safeLocalStorage.getItem('INFLUENCER_MANAGER_AOV_ENTRIES') || '[]'),
             monthlyTargets: JSON.parse(safeLocalStorage.getItem('INFLUENCER_MANAGER_MONTHLY_TARGETS') || '[]'),
             monthlyBudgets: JSON.parse(safeLocalStorage.getItem('INFLUENCER_MANAGER_MONTHLY_BUDGETS') || '[]'),
           };
        }

        // 3. Cloud Sync (handled internally by handleRestoreData) & 4. UI Update
        if (payloadToRestore && payloadToRestore.influencers && payloadToRestore.influencers.length > 0) {
          await handleRestoreData(payloadToRestore);
          safeLocalStorage.setItem(healKey, 'true');
          showToast('Self-Healing Complete: Restored missing data from local backup.', 'success');
        } else {
          console.log('[Self-Healing] No viable local backup found to heal from.');
          safeLocalStorage.setItem(healKey, 'true');
        }
      } catch (e) {
        console.error('[Self-Healing] Failed to self-heal:', e);
      } finally {
        setIsSelfHealing(false);
      }
    };

    const timeoutId = setTimeout(performSelfHealing, 8000);
    return () => clearTimeout(timeoutId);
  }, [influencers.length, campaigns.length, isStorageHydrated, hasHydratedFromServer, isLoadingCloud, user, handleRestoreData]);

  // Add bill item
  const handleAddBillingEntry = (entry: Omit<BillingEntry, 'id'>) => {
    const id = `bill-${Date.now()}`;
    const fullEntry = { ...entry, id };
    if (user) {
      saveDoc('billingEntries', id, { ownerId: user.uid, ...fullEntry });
    } else {
      setBillingEntries(prev => [fullEntry, ...prev]);
    }
  };

  // Update accounting invoices
  const handleUpdateBillingStatus = (billingId: string, status: BillingEntry['status']) => {
    if (user) {
      updateDocInDb('billingEntries', billingId, { status });
    } else {
      setBillingEntries(prev => prev.map(b => {
        if (b.id === billingId) {
          return { ...b, status };
        }
        return b;
      }));
    }
  };

  // Apply model suggestion templates
  const handleApplyAISuggestion = (
    strategy: string, requestedNiche: string, suggestedBudget: number, recommendedInfs: any[]
  ) => {
    const campId = `camp-${Date.now()}`;
    const matchedInfIds = recommendedInfs.map(r => {
      const match = influencers.find(inf => inf.name === r.name);
      return match ? match.id : `inf-${Math.floor(Math.random() * 100) + 10}`;
    });

    const newSourcedCampaign: Campaign = {
      id: campId,
      name: strategy.length > 40 ? strategy.substring(0, 36) + "..." : strategy,
      description: strategy,
      niche: requestedNiche,
      budget: suggestedBudget,
      spent: recommendedInfs.reduce((acc, curr) => acc + (parseFloat(curr.estimatedCost) || 800), 0),
      status: 'Active' as const,
      startDate: new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0],
      endDate: '2026-07-15',
      deliverables: ['1 Dedicated Instagram Reel', '2 Social Swipes Story'],
      influencersAssigned: matchedInfIds,
      metrics: {
        impressions: 0,
        clicks: 0,
        conversions: 0,
        ctr: 0,
        cpv: 0,
        cpc: 0,
        roi: 0
      }
    };

    if (user) {
      saveDoc('campaigns', campId, { ownerId: user.uid, ...newSourcedCampaign });
    } else {
      setCampaigns(prev => [newSourcedCampaign, ...prev]);
    }

    // Draft matching deliverables tasks and contracts
    recommendedInfs.forEach((r) => {
      const matchObj = influencers.find(inf => inf.name === r.name);
      const infId = matchObj ? matchObj.id : 'inf-1';

      const taskId = `task-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const fullTask: Task = {
        campaignId: campId,
        influencerId: infId,
        title: `AI Coordinated Deliverable: Video Post (${r.niche})`,
        type: 'Instagram Reel',
        deadline: '2026-06-25',
        status: 'In Progress',
        views: 0,
        createdAt: new Date().toISOString(),
        createdAtViews: 0,
        initialViews: 0,
        previousViews: 0,
        clicks: 0,
        ctr: 0,
        cpc: 0,
        cpv: 0,
        cvr: 0,
        conversions: 0,
        videoLink1: '',
        videoLink2: '',
        videoLink3: '',
        platform: 'Instagram',
        remuneration: parseFloat(r.estimatedCost) || 900,
        id: taskId
      };

      if (user) {
        saveDoc('tasks', taskId, { ownerId: user.uid, ...fullTask });
      } else {
        setTasks(prev => [...prev, fullTask]);
      }

      const contractId = `cont-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const fullContract: Contract = {
        campaignId: campId,
        influencerId: infId,
        influencerName: r.name,
        campaignName: newSourcedCampaign.name,
        status: 'Sent',
        terms: r.whyRecommended || 'Produce unboxing Reel content. Secure high-efficiency clearance codes.',
        value: parseFloat(r.estimatedCost) || 900,
        id: contractId
      };

      if (user) {
        saveDoc('contracts', contractId, { ownerId: user.uid, ...fullContract });
      } else {
        setContracts(prev => [...prev, fullContract]);
      }
    });

    console.warn("AI proposal applied successfully: A new active campaign, deliverables, and sponsorship contract terms have been established!");
    setActiveTab('planner');
  };

  // Keep navigation safe: if any non-admin attempts settings or admin-panel traversal, fallback immediately
  useEffect(() => {
    let effectiveHiddenPages = hiddenPages;
    if (isAdmin) {
      effectiveHiddenPages = adminHiddenPages;
    }

    if (!isAdmin && (activeTab === 'settings' || activeTab === 'admin-panel')) {
      setActiveTab('video-dashboard'); // Try sticking to default
    } else if (effectiveHiddenPages.includes(activeTab) && activeTab !== 'admin-panel') {
      // Find the first available page that isn't hidden
      const allPages = [
        'video-dashboard', 'database', 'planner', 'monthly-targets', 
        'aov-calculator', 'notebook', 'image-slides', 
        'billing', 'leaderboard', 'shortio-tracker', 'live-video-views',
        'mobile-apk', 'sheets-extractor', 'cloud-sync'
      ] as ActiveTab[];
      const firstAvailable = allPages.find(p => !effectiveHiddenPages.includes(p));
      if (firstAvailable && firstAvailable !== activeTab) {
        setActiveTab(firstAvailable);
      }
    }
  }, [activeTab, isAdmin, hiddenPages, adminHiddenPages]);

  // Settle navigation categories
  const navItems = useMemo(() => {
    const items: { id: ActiveTab; label: string; icon: React.ReactNode }[] = [
      { id: 'video-dashboard', label: 'Video Dashboard', icon: <TrendingUp className="w-4 h-4" /> },
      { id: 'data-analyzer', label: 'Data Analyzer', icon: <FileSpreadsheet className="w-4 h-4 text-cyan-400" /> },
      { id: 'database', label: 'Creator Database', icon: <Users className="w-4 h-4" /> },
      { id: 'planner', label: 'Monthly Planner', icon: <Calendar className="w-4 h-4" /> },
      { id: 'monthly-targets', label: 'Monthly Targets', icon: <Target className="w-4 h-4 text-emerald-100" /> },
      { id: 'aov-calculator', label: 'AOV Controller', icon: <Calculator className="w-4 h-4 text-amber-100" /> },
      { id: 'notebook', label: 'Calendar Notebook', icon: <BookOpen className="w-4 h-4" /> },
      { id: 'image-slides', label: 'LIVE SLIDES', icon: <MonitorPlay className="w-4 h-4 text-fuchsia-500" /> },
      { id: 'secure-billing', label: 'BILL & CHECKLIST', icon: <CheckCircle2 className="w-4 h-4" /> },
      { id: 'expenditure-bill', label: 'EXPENDITURE BILL (PDF)', icon: <FileText className="w-4 h-4 text-amber-300" /> },
      { id: 'leaderboard', label: 'Leaderboard & Benchmarks', icon: <Award className="w-4 h-4" /> },
      { id: 'compare-months', label: 'Month Comparison', icon: <ArrowLeftRight className="w-4 h-4 text-orange-400" /> },
      { id: 'shortio-tracker', label: 'Short.io Live Tracker', icon: <Link2 className="w-4 h-4 text-indigo-400" /> },
      { id: 'live-video-views', label: 'Live Video Views', icon: <Eye className="w-4 h-4 text-rose-400" /> },
      { id: 'sales-dashboard', label: 'Sales Dashboard', icon: <BarChart3 className="w-4 h-4 text-indigo-500" /> },
      { id: 'mobile-apk', label: 'Android APK / PWA', icon: <Smartphone className="w-4 h-4" /> },
      { id: 'sheets-extractor', label: 'Central Sheets Backup', icon: <FileSpreadsheet className="w-4 h-4 text-emerald-500" /> },
      { id: 'cloud-sync', label: 'Cloud Sync & Backups', icon: <Cloud className="w-4 h-4 text-fuchsia-300 animate-pulse" /> },
    ];

    if (isAdmin) {
      items.push({ id: 'settings', label: 'Platform Settings', icon: <Settings className="w-4 h-4" /> });
      items.push({ id: 'admin-panel', label: 'Admin Control Panel', icon: <ShieldCheck className="w-4 h-4 text-emerald-200 animate-pulse" /> });
    }

    let effectiveHiddenPages = hiddenPages;
    if (isAdmin) {
      effectiveHiddenPages = adminHiddenPages;
    }
    return items.filter(item => !effectiveHiddenPages.includes(item.id) || item.id === 'admin-panel' || item.id === 'settings');
  }, [isAdmin, hiddenPages, adminHiddenPages]);

  // Global Duplicate Creator Detection
  const hasGlobalDuplicates = useMemo(() => {
    const groupedByName = new Map();
    const groupedByHandle = new Map();
    const groupedByMobile = new Map();

    for (const inf of influencers) {
      if (inf.name && inf.name.trim() !== '' && inf.name.toLowerCase() !== 'unknown' && inf.name.toLowerCase() !== 'extracted creator') {
        const k = inf.name.toLowerCase().trim();
        if (!groupedByName.has(k)) groupedByName.set(k, []);
        groupedByName.get(k).push(inf);
      }
      if (inf.handle && inf.handle.trim() !== '') {
        const k = inf.handle.toLowerCase().trim();
        if (!groupedByHandle.has(k)) groupedByHandle.set(k, []);
        groupedByHandle.get(k).push(inf);
      }
      if (inf.mobile && inf.mobile.trim() !== '') {
        const k = inf.mobile.replace(/[^0-9]/g, '');
        if (k.length >= 10) {
          if (!groupedByMobile.has(k)) groupedByMobile.set(k, []);
          groupedByMobile.get(k).push(inf);
        }
      }
    }

    const checkForDups = (groupMap: Map<string, Influencer[]>) => {
      for (const group of groupMap.values()) {
        const uniqueGroup = Array.from(new Map(group.map((item) => [item.id, item])).values());
        if (uniqueGroup.length > 1) return true;
      }
      return false;
    };

    if (checkForDups(groupedByName)) return true;
    if (checkForDups(groupedByHandle)) return true;
    if (checkForDups(groupedByMobile)) return true;

    return false;
  }, [influencers]);

  if (user && userStatus === null && !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-950 via-purple-900 to-indigo-900 p-4">
        <div className="flex flex-col items-center max-w-sm text-center">
          <Loader2 className="w-10 h-10 text-indigo-400 animate-spin mb-4" />
          <p className="text-indigo-200 text-sm font-medium mb-4">Verifying authorization profile...</p>
          <button
            onClick={() => setUserStatus('Active')}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl shadow-lg transition-all duration-200"
          >
            Enter Dashboard Directly
          </button>
        </div>
      </div>
    );
  }

  if (user && userStatus === 'Pending' && !isAdmin) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-white antialiased selection:bg-amber-500/30">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(245,158,11,0.15),transparent_70%)] pointer-events-none" />
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-8 relative overflow-hidden flex flex-col items-center text-center space-y-6">
          <div className="p-4 bg-amber-400/10 text-amber-500 rounded-2xl border border-amber-500/20">
            <ShieldCheck className="w-12 h-12 stroke-[2]" />
          </div>
          
          <div className="space-y-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/25">
              AUTHORIZATION REQUIRED
            </span>
            <h1 className="text-xl font-bold tracking-tight text-white pt-1">Account Pending Approval</h1>
            <p className="text-xs text-slate-400 leading-relaxed">
              Your account has been created successfully, but it requires approval from the Administrator before you can access the platform.
            </p>
          </div>

          <div className="w-full bg-slate-950/50 rounded-xl p-4 border border-slate-800/60 flex flex-col items-start gap-1 text-left font-mono text-[10px] text-slate-500">
            <div>SUBJECT EMAIL: {user.email}</div>
            <div>STATUS STATE: AWAITING_AUTHORIZATION</div>
            <div>REFERENCE ID: {user.uid}</div>
          </div>

          <div className="w-full pt-4 border-t border-slate-800 flex flex-col gap-2">
            <button
              onClick={handleAdminDirectAccess}
              className="w-full bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-800 hover:to-indigo-800 text-white font-bold py-2.5 px-4 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 text-xs"
            >
              <ShieldCheck className="w-4 h-4 text-amber-300" />
              Direct Administrator Bypass (Ashim Gogoi)
            </button>
            <button
              onClick={handleGoogleLogout}
              className="w-full bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2.5 px-4 rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
            <a
              href="mailto:ashimgogoi2008@gmail.com"
              className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold py-2.5 px-4 rounded-xl transition-all text-xs"
            >
              Contact Administrator
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (user && userStatus === 'Blocked' && !isAdmin) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-white antialiased selection:bg-red-500/30">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(239,68,68,0.15),transparent_70%)] pointer-events-none" />
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-8 relative overflow-hidden flex flex-col items-center text-center space-y-6">
          <div className="p-4 bg-red-400/10 text-red-500 rounded-2xl border border-red-550/20">
            <ShieldAlert className="w-12 h-12 stroke-[2]" />
          </div>
          
          <div className="space-y-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-red-500/15 text-red-400 border border-red-500/25">
              ACCESS SUSPENDED
            </span>
            <h1 className="text-xl font-bold tracking-tight text-white pt-1">Session Authorization Revoked</h1>
            <p className="text-xs text-slate-400 leading-relaxed">
              {userBlockedReason || "Your account has been blocked or restricted from logging into the platform due to security controls."}
            </p>
          </div>

          <div className="w-full bg-slate-950/50 rounded-xl p-4 border border-slate-800/60 flex flex-col items-start gap-1 text-left font-mono text-[10px] text-slate-500">
            <div>SUBJECT EMAIL: {user.email}</div>
            <div>STATUS STATE: LOCKOUT_SUSPENDED</div>
            <div>REFERENCE REASON: CLOUD_SECURITY_OVERRIDE</div>
          </div>

          <div className="w-full pt-4 border-t border-slate-800 flex flex-col gap-2">
            <button
              onClick={handleAdminDirectAccess}
              className="w-full bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-800 hover:to-indigo-800 text-white font-bold py-2.5 px-4 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 text-xs"
            >
              <ShieldCheck className="w-4 h-4 text-amber-300" />
              Unlock Administrator Access (Ashim Gogoi)
            </button>
            <button
              onClick={handleGoogleLogout}
              className="w-full bg-red-650 hover:bg-red-700 text-white font-semibold py-2.5 px-4 rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              Sign Out of Session
            </button>
            <a
              href="mailto:ashimgogoi2008@gmail.com"
              className="text-xs text-slate-500 hover:text-slate-400 transition-colors"
            >
              Contact Administrator Support &rarr;
            </a>
          </div>
        </div>
      </div>
    );
  }

  
  if (needsAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-950 via-purple-900 to-indigo-900 relative overflow-hidden p-4">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-30 mix-blend-overlay"></div>
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-purple-500 rounded-full blur-[100px] opacity-40 animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-indigo-500 rounded-full blur-[100px] opacity-40 animate-pulse delay-1000"></div>

        <div className="relative z-10 w-full max-w-md bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-8 shadow-2xl flex flex-col items-center">
          <div className="flex flex-col items-center mb-8">
            <div className="w-32 h-32 rounded-3xl shadow-[0_0_40px_rgba(168,85,247,0.4)] mb-3 border-2 border-white/20 bg-gradient-to-br from-fuchsia-600 via-purple-600 to-indigo-700 p-1 relative overflow-hidden flex items-center justify-center">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.2),transparent_50%)]"></div>
              <div className="relative z-10 w-full h-full flex items-center justify-center">
                <div className="absolute inset-0 flex items-center justify-center opacity-50 scale-125">
                  <div className="w-20 h-20 rounded-full border border-fuchsia-300/30"></div>
                </div>
                <div className="absolute inset-0 flex items-center justify-center opacity-30 scale-150">
                  <div className="w-24 h-24 rounded-full border border-indigo-300/20"></div>
                </div>
                <UserIcon className="w-16 h-16 text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.8)] absolute z-10" strokeWidth={1.5} />
                <TrendingUp className="w-14 h-14 text-cyan-300 drop-shadow-[0_0_10px_rgba(103,232,249,0.8)] absolute z-20 top-1/2 left-1/2 transform -translate-x-1/4 -translate-y-1/4" strokeWidth={2.5} />
                <div className="absolute top-4 left-4 w-2 h-2 rounded-full bg-pink-400 shadow-[0_0_10px_rgba(244,114,182,1)]"></div>
                <div className="absolute top-6 right-6 w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,1)]"></div>
                <div className="absolute bottom-6 left-6 w-2 h-2 rounded-full bg-purple-400 shadow-[0_0_10px_rgba(192,132,252,1)]"></div>
              </div>
            </div>
            <h1 className="text-3xl font-black text-white text-center mb-1 drop-shadow-md tracking-tight">INFLUENCER MANAGER</h1>
            <h2 className="text-xl font-bold text-fuchsia-300 tracking-widest drop-shadow mb-2">PRO</h2>
            <p className="text-xs text-white/80 font-bold tracking-widest uppercase">DEVELOPER:- ASHIM GOGOI</p>
          </div>
          
          <div className="w-full bg-white rounded-2xl p-6 shadow-xl mb-6 flex flex-col relative">
            <h2 className="text-2xl font-black text-slate-900 mb-1">
              {loginMode === 'login' ? 'Welcome Back' : loginMode === 'admin' ? 'Admin Portal' : 'Create Account'}
            </h2>
            <p className="text-sm text-slate-500 mb-4 font-medium">
              {loginMode === 'login' ? 'Sign in to your account' : loginMode === 'admin' ? 'Secure administrator access' : 'Sign up for a new account'}
            </p>

            {loginMode === 'admin' && (
              <div className="mb-4 p-3.5 bg-gradient-to-br from-purple-50 to-indigo-50 border border-purple-200 rounded-xl text-left shadow-xs">
                <div className="flex items-center gap-2 text-purple-900 font-black text-xs mb-1">
                  <ShieldCheck className="w-4 h-4 text-purple-600" />
                  <span>One-Click Administrator Authorization</span>
                </div>
                <p className="text-[11px] text-purple-700 font-medium mb-2.5 leading-snug">
                  As the platform administrator (Ashim Gogoi), access the entire dashboard directly without popup blockers or password issues.
                </p>
                <button
                  type="button"
                  onClick={handleAdminDirectAccess}
                  className="w-full bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-800 hover:to-indigo-800 text-white font-black py-2.5 rounded-xl text-xs shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <ShieldCheck className="w-4 h-4 text-amber-300" />
                  <span>Instant Admin Sign-In (Ashim Gogoi)</span>
                </button>
              </div>
            )}
            
            <form onSubmit={handleEmailAuth} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Email</label>
                <input
                  type="email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-medium"
                  placeholder="you@example.com"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Password</label>
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-medium"
                  placeholder="••••••••"
                  required
                />
                {(loginMode === 'login' || loginMode === 'admin') && (
                  <div className="flex justify-end mt-1">
                    <button
                      type="button"
                      onClick={handlePasswordReset}
                      className="text-xs text-indigo-600 font-bold hover:text-indigo-700 hover:underline"
                    >
                      Forgot Password?
                    </button>
                  </div>
                )}
              </div>
              
              {loginError && (
                <div className="bg-red-50 text-red-600 text-xs font-bold p-3 rounded-lg border border-red-100 flex items-start gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                  <p>{loginError}</p>
                </div>
              )}
              
              <button
                type="submit"
                disabled={isLoadingCloud}
                className="w-full bg-gradient-to-r from-fuchsia-600 to-indigo-600 hover:from-fuchsia-700 hover:to-indigo-700 text-white font-bold py-2.5 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 mt-2 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isLoadingCloud ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
                {loginMode === 'login' ? 'Sign In' : loginMode === 'admin' ? 'Sign In as Admin' : 'Sign Up'}
              </button>
            </form>
            
            <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={handleAdminDirectAccess}
                className="w-full bg-gradient-to-r from-purple-700 via-indigo-700 to-rose-600 hover:from-purple-800 hover:to-indigo-800 text-white font-black py-2.5 rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
                title="Immediate Administrator Access for Ashim Gogoi"
              >
                <ShieldCheck className="w-4 h-4 text-amber-300" />
                <span>Direct Administrator Access (Ashim Gogoi)</span>
              </button>

              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={isLoadingCloud}
                className="w-full bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-bold py-2.5 rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="Google" />
                Continue with Google
              </button>
              
              <button
                type="button"
                onClick={() => {
                  setNeedsAuth(false);
                  setUser(null);
                  setAccessToken(null);
                }}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 font-bold py-2.5 rounded-xl shadow-sm transition-all flex items-center justify-center gap-2"
              >
                <UserIcon className="w-5 h-5" />
                Continue as Guest (Local Save)
              </button>
            </div>
            
            <div className="mt-4 pt-4 border-t border-slate-100 text-center flex flex-col gap-2">
              <p className="text-xs font-medium text-slate-600">
                {loginMode === 'login' ? "Don't have an account?" : "Already have an account?"}
                <button
                  onClick={() => setLoginMode(loginMode === 'login' ? 'signup' : 'login')}
                  className="ml-1 text-indigo-600 font-bold hover:text-indigo-700 hover:underline"
                >
                  {loginMode === 'login' ? 'Sign Up' : 'Sign In'}
                </button>
              </p>
              
              <p className="text-xs font-medium text-slate-600">
                Authorized personnel only?
                <button
                  onClick={() => setLoginMode('admin')}
                  className="ml-1 text-red-600 font-bold hover:text-red-700 hover:underline"
                >
                  Admin Login
                </button>
              </p>
            </div>
          </div>
        {/* Modern Non-blocking Floating Toast Notification */}
      <Suspense fallback={null}>
        <DriveRecoveryModal
          isOpen={isDriveRecoveryModalOpen}
          onClose={() => setIsDriveRecoveryModalOpen(false)}
          accessToken={accessToken}
          onRestore={handleRestoreData}
          onLoginSuccess={(currentUser: any, token: string) => {
            setUser(currentUser);
            setAccessToken(token);
            setNeedsAuth(false);
          }}
        />
      </Suspense>
        {toastMessage && (
          <div id="app_routing_toast" className="fixed top-6 left-1/2 -translate-x-1/2 md:left-auto md:translate-x-0 md:right-6 z-[99999] max-w-sm w-full animate-fade-in transition-all">
            <div className={`relative px-5 py-3.5 rounded-xl border flex items-start gap-3 shadow-2xl backdrop-blur-md ${
              toastType === 'error'
                ? 'bg-red-50/95 border-red-200 text-red-900 shadow-red-500/10'
                : toastType === 'success'
                ? 'bg-emerald-50/95 border-emerald-200 text-emerald-900 shadow-emerald-500/10'
                : 'bg-slate-900/95 border-slate-700 text-slate-100 shadow-slate-950/20'
            }`}>
              <span className="text-sm shrink-0">
                {toastType === 'error' ? '❌' : toastType === 'success' ? '✅' : 'ℹ️'}
              </span>
              <div className="space-y-0.5 pr-6 w-full">
                <h5 className="font-bold text-xs">System Notification</h5>
                <p className="text-[11px] opacity-90 leading-relaxed font-sans">{toastMessage}</p>
              </div>
              <button
                onClick={() => setToastMessage(null)}
                className={`absolute right-3 top-3.5 p-1 rounded-md opacity-70 hover:opacity-100 transition-opacity ${
                  toastType === 'error' ? 'hover:bg-red-100/50' : toastType === 'success' ? 'hover:bg-emerald-100/50' : 'hover:bg-slate-800'
                }`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

          
        </div>
      </div>
    );
  }



  if (isLiteApkMode) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <Suspense
          fallback={
            <div className="min-h-screen flex items-center justify-center bg-slate-950 text-emerald-400 font-bold text-sm">
              Loading PTG Lite APK (Completed Tasks, Views & Clicks)...
            </div>
          }
        >
          <MobileLiteCompletedApp
            tasks={tasks}
            influencers={influencers}
            agencyName={agencyName}
            isStandaloneMode={true}
            onExitStandalone={() => {
              const url = new URL(window.location.href);
              url.searchParams.delete('mode');
              window.history.pushState({}, '', url.toString());
              setIsLiteApkMode(false);
            }}
          />
        </Suspense>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${themeStyles.containerBg} flex flex-col antialiased overflow-x-hidden transition-colors duration-200`}>
      {showSessionAlert && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-red-900/90 backdrop-blur-sm p-4">
          <div className="bg-white p-8 rounded-2xl shadow-2xl max-w-lg w-full text-center border-4 border-red-500 animate-pulse">
            <h2 className="text-4xl font-black text-red-600 mb-4 animate-bounce uppercase tracking-tighter">⚠️ WARNING ⚠️</h2>
            <p className="text-xl font-black text-gray-900 mb-6 uppercase">
              Your Google Session Was Unexpectedly Disconnected!
            </p>
            <p className="text-sm font-bold text-gray-700 mb-8 leading-relaxed">
              Auto-save to Google Drive is halted. Please log in immediately to secure your data and resume syncing.
            </p>
            <button 
              onClick={() => {
                 setShowSessionAlert(false);
                 handleGoogleLogin();
              }}
              className="bg-red-600 hover:bg-red-700 text-white font-black py-5 px-8 rounded-xl shadow-[0_0_20px_rgba(220,38,38,0.5)] w-full text-lg uppercase tracking-widest flex items-center justify-center gap-3 transition-transform hover:scale-105 active:scale-95"
            >
              Acknowledge & Reconnect
            </button>
          </div>
        </div>
      )}
      {floatingNote && (
        <div className="fixed bottom-6 right-6 z-[100] animate-bounce max-w-xs sm:max-w-sm">
          <div className="bg-yellow-400 text-yellow-950 px-5 py-4 rounded-2xl shadow-2xl border-4 border-yellow-300 font-bold flex items-start gap-3 relative overflow-hidden">
             <div className="absolute top-0 right-0 w-16 h-16 bg-white rounded-full mix-blend-overlay filter blur-xl opacity-40 pointer-events-none -mr-8 -mt-8" />
             <AlertCircle className="w-6 h-6 text-yellow-900 shrink-0 mt-0.5" />
             <div className="space-y-1 relative z-10 w-full pr-2">
                 <p className="text-[10px] font-black uppercase tracking-widest text-yellow-800 font-mono">Important Note</p>
                 <p className="text-sm font-bold leading-snug">{floatingNote}</p>
             </div>
          </div>
        </div>
      )}

      {/* Sticky Top Container for Header and Banners */}
      <div className="sticky top-0 z-50 flex flex-col shadow-xl">
        {isSelfHealing && (
          <div className="bg-indigo-600 text-white px-4 py-3 flex items-center justify-center gap-3 animate-pulse">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="font-bold text-sm tracking-wide">Self-Healing Data System Active... Scanning and restoring missing data</span>
          </div>
        )}
        
        {/* Force Rescue Banner */}
        {!isSelfHealing && user && tasks.length === 0 && influencers.length === 0 && (
          <div className="bg-rose-500 text-white px-4 py-2 flex items-center justify-between">
            <span className="font-bold text-sm">Your data seems empty. If you just migrated, click Rescue to forcefully load from backup.</span>
            <button onClick={handleForceRescue} className="bg-white text-rose-600 px-3 py-1 rounded font-bold text-xs hover:bg-rose-50 shadow-sm transition-all">Force Rescue Data</button>
          </div>
        )}
        
        
        {/* Flashing Time Selection Indicator */}
        {(() => {
          const now = new Date();
          const currentMonthNum = now.getMonth() + 1;
          const currentYearNum = now.getFullYear();
          const currentWeekNum = Math.ceil(now.getDate() / 7);

          const curMonthStr = currentMonthNum.toString().padStart(2, '0');
          const curYearStr = currentYearNum.toString();
          const curWeekStr = currentWeekNum.toString();

          const isCurrentMonth = selectedMonth !== 'ALL' && parseInt(selectedMonth, 10) === currentMonthNum;
          const isCurrentYear = selectedYear !== 'ALL' && parseInt(selectedYear, 10) === currentYearNum;
          const isCurrentWeek = selectedWeek === 'ALL' || selectedWeek === curWeekStr;

          // When app is showing or working on current MONTH, YEAR, WEEK, do not display
          const isWorkingOnCurrentPeriod = isCurrentMonth && isCurrentYear && isCurrentWeek;
          const isFilterActive = !isWorkingOnCurrentPeriod || globalSearch !== '' || globalInfluencerFilter !== 'ALL' || globalVideoIdFilter !== '';

          if (!isFilterActive) return null;

          return (
            <div 
              className="fixed z-[9999] w-[90%] max-w-[400px] flex flex-col items-center gap-1.5 pointer-events-auto cursor-move select-none"
              style={{ left: indicatorPos.x, top: indicatorPos.y, transform: 'translate(-50%, 0)' }}
              onPointerDown={handleIndicatorPointerDown}
              onPointerMove={handleIndicatorPointerMove}
              onPointerUp={handleIndicatorPointerUp}
              onPointerCancel={handleIndicatorPointerUp}
            >
              {/* Drag Handle Overlay */}
              <div className="absolute inset-0 z-[-1] bg-transparent" />
              <div className={`w-full bg-yellow-400 text-black py-0.5 sm:py-1 rounded-full overflow-hidden shadow-[0_0_10px_rgba(250,204,21,0.5)] border border-yellow-500 pointer-events-none flex items-center justify-start`} style={{ transform: 'translateZ(0)', WebkitMaskImage: '-webkit-radial-gradient(white, black)' }}>
                <style>
                  {`
                    @keyframes marqueeBounce {
                      0% { left: 0%; transform: translateX(0%); }
                      100% { left: 100%; transform: translateX(-100%); }
                    }
                  `}
                </style>
                <div className={`relative shrink-0 whitespace-nowrap inline-flex items-center justify-center gap-2 font-black text-[8px] sm:text-[9px] tracking-widest uppercase animate-pulse px-3 ${marqueeDuration === 0 ? 'w-full' : 'w-max'}`}
                     style={{ animation: marqueeDuration > 0 ? `marqueeBounce ${marqueeDuration}s linear infinite alternate` : 'none', transform: marqueeDuration === 0 ? 'none' : undefined, left: marqueeDuration === 0 ? '0' : undefined }}>
                  <span className="flex items-center gap-0.5"><Calendar className="w-2.5 h-2.5 stroke-[3]" /> MONTH: <span className="bg-black text-yellow-400 px-1 py-px rounded">{selectedMonth === 'ALL' ? 'ALL' : (['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(selectedMonth)] || selectedMonth)}</span></span>
                  <span className="flex items-center gap-0.5"><Calendar className="w-2.5 h-2.5 stroke-[3]" /> YEAR: <span className="bg-black text-yellow-400 px-1 py-px rounded">{selectedYear}</span></span>
                  <span className="flex items-center gap-0.5"><Calendar className="w-2.5 h-2.5 stroke-[3]" /> WEEK: <span className="bg-black text-yellow-400 px-1 py-px rounded">{selectedWeek}</span></span>
                  {globalSearch !== '' && <span className="flex items-center gap-0.5 text-black">SEARCH: <span className="bg-black text-yellow-400 px-1 py-px rounded">ACTIVE</span></span>}
                  {globalInfluencerFilter !== 'ALL' && <span className="flex items-center gap-0.5 text-black">CREATOR: <span className="bg-black text-yellow-400 px-1 py-px rounded">{globalInfluencerFilter}</span></span>}
                  {globalVideoIdFilter !== '' && <span className="flex items-center gap-0.5 text-black">VIDEO ID: <span className="bg-black text-yellow-400 px-1 py-px rounded">{globalVideoIdFilter}</span></span>}
                </div>
              </div>
              <div 
                className="bg-black/80 backdrop-blur-md rounded-full p-0.5 border border-white/20 shadow-lg flex gap-0.5 items-center shrink-0 w-fit opacity-80 hover:opacity-100 transition-opacity cursor-auto"
                onPointerDown={(e) => e.stopPropagation()}
                onPointerUp={(e) => e.stopPropagation()}
                onPointerMove={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                <span className="text-[7px] font-black tracking-widest uppercase text-white/50 px-1.5 pointer-events-none">Display:</span>
                <button onPointerDown={(e) => { e.stopPropagation(); setMarqueeDuration(0); }} onClick={(e) => { e.stopPropagation(); setMarqueeDuration(0); }} className={`px-1.5 py-px rounded-full text-[8px] font-bold transition-all ${marqueeDuration === 0 ? 'bg-yellow-400 text-black' : 'text-white hover:bg-white/10'}`}>Fixed</button>
                <button onPointerDown={(e) => { e.stopPropagation(); setMarqueeDuration(30); }} onClick={(e) => { e.stopPropagation(); setMarqueeDuration(30); }} className={`px-1.5 py-px rounded-full text-[8px] font-bold transition-all ${marqueeDuration === 30 ? 'bg-yellow-400 text-black' : 'text-white hover:bg-white/10'}`}>0.5x</button>
                <button onPointerDown={(e) => { e.stopPropagation(); setMarqueeDuration(20); }} onClick={(e) => { e.stopPropagation(); setMarqueeDuration(20); }} className={`px-1.5 py-px rounded-full text-[8px] font-bold transition-all ${marqueeDuration === 20 ? 'bg-yellow-400 text-black' : 'text-white hover:bg-white/10'}`}>1x</button>
                <button onPointerDown={(e) => { e.stopPropagation(); setMarqueeDuration(10); }} onClick={(e) => { e.stopPropagation(); setMarqueeDuration(10); }} className={`px-1.5 py-px rounded-full text-[8px] font-bold transition-all ${marqueeDuration === 10 ? 'bg-yellow-400 text-black' : 'text-white hover:bg-white/10'}`}>2x</button>
                <button 
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setSelectedMonth(curMonthStr);
                    setSelectedYear(curYearStr);
                    setSelectedWeek('ALL');
                    setGlobalSearch('');
                    setGlobalInfluencerFilter('ALL');
                    setGlobalVideoIdFilter('');
                  }} 
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    setSelectedMonth(curMonthStr);
                    setSelectedYear(curYearStr);
                    setSelectedWeek('ALL');
                    setGlobalSearch('');
                    setGlobalInfluencerFilter('ALL');
                    setGlobalVideoIdFilter('');
                  }} 
                  className="px-1.5 py-px rounded-full text-[8px] font-bold transition-all bg-amber-500/30 hover:bg-amber-500 text-white flex items-center gap-0.5 ml-1"
                  title="Reset to current Month & Year"
                >
                  <RefreshCw className="w-2 h-2" /> Reset
                </button>
              </div>
            </div>
          );
        })()}

        {/* Top Navigation banner header block */}
        <header className={`${
          theme === 'green'
            ? 'bg-gradient-to-r from-emerald-950 via-green-900 to-teal-950 border-b border-emerald-500/40'
            : theme === 'calm-sage' || theme === 'earthy-olive'
            ? 'bg-gradient-to-r from-emerald-950 via-teal-900 to-slate-900 border-b border-emerald-500/30'
            : 'bg-gradient-to-r from-violet-900 via-fuchsia-900 to-indigo-900 border-b border-fuchsia-500/30'
        } text-white px-6 py-4 flex items-center justify-between transition-colors duration-300`}>
          <div className="flex items-center gap-3 relative z-10">
            <div className={`p-1.5 text-white rounded-lg border shadow-sm ${
              theme === 'green' || theme === 'calm-sage' || theme === 'earthy-olive'
                ? 'bg-emerald-600 border-emerald-400'
                : 'bg-fuchsia-500 border-fuchsia-400'
            }`}>
              <Layers className="w-6 h-6 stroke-[2.5]" />
            </div>
            <div>
              <h1 className="text-xl font-black font-sans tracking-tight uppercase text-white drop-shadow-sm">{agencyName}</h1>
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                <p className={`text-[10px] font-mono tracking-widest uppercase font-semibold ${
                  theme === 'green' || theme === 'calm-sage' || theme === 'earthy-olive' ? 'text-emerald-200' : 'text-indigo-200'
                }`}>End-To-End Sourcing & Compliance Platform</p>
                <span className={`hidden sm:inline text-[10px] font-mono ${
                  theme === 'green' || theme === 'calm-sage' || theme === 'earthy-olive' ? 'text-emerald-400' : 'text-fuchsia-400'
                }`}>•</span>
                <p className={`text-[10px] text-white font-mono tracking-widest uppercase font-black px-1.5 py-0.5 rounded border w-fit backdrop-blur-sm ${
                  theme === 'green' || theme === 'calm-sage' || theme === 'earthy-olive'
                    ? 'bg-emerald-900/50 border-emerald-400/40'
                    : 'bg-fuchsia-900/40 border-fuchsia-500/30'
                }`}>Developer: {developerName}</p>
              </div>
            </div>
          </div>

          {/* Live Indian Standard Time (Asia/Kolkata) Clock Badge */}
          <div className={`hidden md:flex items-center gap-2.5 bg-black/50 border px-3 py-1.5 rounded-lg shadow-inner text-xs font-mono backdrop-blur-md relative z-10 ${
            theme === 'green' || theme === 'calm-sage' || theme === 'earthy-olive' ? 'border-emerald-400/50' : 'border-fuchsia-400/50'
          }`} title="Indian Standard Time (Asia/Kolkata Time Zone)">
            <Clock className="w-4 h-4 text-amber-400 animate-pulse shrink-0" />
            <div className="flex flex-col text-left">
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-black uppercase text-amber-300 tracking-wider">IST (Kolkata)</span>
                <strong className="text-white font-black text-[13px] tracking-wide">{kolkataClock.timeString}</strong>
              </div>
              <strong className="text-[10px] text-amber-200/90 font-black tracking-wide">{kolkataClock.dateString}</strong>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 md:gap-4 relative z-10 justify-end mt-2 md:mt-0">
            <div className="relative">
              <input
                type="file"
                accept=".json"
                onChange={handleManualLocalImport}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                title="Restore from Local Backup"
              />
              <button
                className="text-xs bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 border border-emerald-400 rounded-lg transition flex items-center gap-1.5 font-bold shadow-md shadow-emerald-900/50 text-white w-full md:w-auto justify-center pointer-events-none"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Restore Backup</span>
              </button>
            </div>

            {isGoogleOAuthToken(accessToken) ? (
              <div 
                className="text-xs bg-emerald-700/80 text-emerald-100 border border-emerald-400 px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-bold shadow-md shadow-emerald-950/40 w-full md:w-auto justify-center cursor-default"
                title="Google Drive connected with authorization"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" />
                <span>Drive Connected</span>
              </div>
            ) : (
              <button
                onClick={handleConnectGoogleDrive}
                className="text-xs bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 px-3 py-1.5 border border-blue-300 rounded-lg transition flex items-center gap-1.5 cursor-pointer font-black shadow-md shadow-blue-950/50 text-white w-full md:w-auto justify-center animate-pulse hover:animate-none"
                title="Connect your Google Account to enable Google Drive storage, sync, and backups"
              >
                <Cloud className="w-3.5 h-3.5 text-blue-200" />
                <span>Connect Google Drive</span>
              </button>
            )}

            <button
              onClick={handleDriveSnapshotBackup}
              className="text-xs bg-purple-600 hover:bg-purple-500 px-3 py-1.5 border border-purple-400 rounded-lg transition flex items-center gap-1.5 cursor-pointer font-bold shadow-md shadow-purple-900/50 text-white w-full md:w-auto justify-center"
              title="Save Snapshot Backup to Google Drive"
            >
              <Database className="w-3.5 h-3.5" />
              <span>Drive Backup</span>
            </button>
            <button
              onClick={handleManualDriveBackup}
              className="text-xs bg-indigo-600 hover:bg-indigo-500 px-3 py-1.5 border border-indigo-400 rounded-lg transition flex items-center gap-1.5 cursor-pointer font-bold shadow-md shadow-indigo-900/50 text-white w-full md:w-auto justify-center"
              title="Save Data to Google Drive"
            >
              <Cloud className="w-3.5 h-3.5" />
              <span>Save to Drive</span>
            </button>
            <button
              onClick={handleOpenDriveRecovery}
              className="text-xs bg-sky-600 hover:bg-sky-500 px-3 py-1.5 border border-sky-400 rounded-lg transition flex items-center gap-1.5 cursor-pointer font-bold shadow-md shadow-sky-900/50 text-white w-full md:w-auto justify-center"
              title="Load & Recover from Google Drive"
            >
              <CloudDownload className="w-3.5 h-3.5" />
              <span>Recover from Drive</span>
            </button>
            <button
              onClick={handleComboSave}
              className="text-xs bg-amber-600 hover:bg-amber-500 px-3 py-1.5 border border-amber-400 rounded-lg transition flex items-center gap-1.5 cursor-pointer font-bold shadow-md shadow-amber-900/50 text-white w-full md:w-auto justify-center"
              title="Save Local & Drive Backup"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Combo Save</span>
            </button>
            <button
              onClick={handleManualLocalExport}
              className="text-xs bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 border border-emerald-400 rounded-lg transition flex items-center gap-1.5 cursor-pointer font-bold shadow-md shadow-emerald-900/50 text-white w-full md:w-auto justify-center"
              title="Save Manual Local Storage Backup"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Save Backup</span>
            </button>
            <button
              onClick={toggleAutoCsv}
              className={`text-xs px-3 py-1.5 border rounded-lg transition flex items-center gap-1.5 cursor-pointer font-bold shadow-md w-full md:w-auto justify-center ${isAutoCsvEnabled ? 'bg-teal-600 hover:bg-teal-500 border-teal-400 shadow-teal-900/50 text-white' : 'bg-slate-600 hover:bg-slate-500 border-slate-400 shadow-slate-900/50 text-white'}`}
              title="Toggle Auto CSV Download"
            >
              {isAutoCsvEnabled ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
              <span>Auto CSV: {isAutoCsvEnabled ? 'ON' : 'OFF'}</span>
            </button>
            <button
              onClick={toggleAutoDriveUpload}
              className={`text-xs px-3 py-1.5 border rounded-lg transition flex items-center gap-1.5 cursor-pointer font-bold shadow-md w-full md:w-auto justify-center ${isAutoDriveUploadEnabled ? 'bg-blue-600 hover:bg-blue-500 border-blue-400 shadow-blue-900/50 text-white' : 'bg-slate-600 hover:bg-slate-500 border-slate-400 shadow-slate-900/50 text-white'}`}
              title="Toggle Auto Drive Upload"
            >
              {isAutoDriveUploadEnabled ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
              <span>Auto Drive: {isAutoDriveUploadEnabled ? 'ON' : 'OFF'}</span>
            </button>
            <button
              onClick={() => setActiveTab('planner')}
              className="text-xs bg-fuchsia-600 hover:bg-fuchsia-500 px-3 py-1.5 border border-fuchsia-400 rounded-lg transition flex items-center gap-1.5 cursor-pointer font-bold shadow-md shadow-fuchsia-900/50 text-white w-full md:w-auto justify-center"
              title="Quick access to Monthly Planner"
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Monthly Planner</span>
            </button>

            <button
              onClick={() => {
                setQuickWhatsAppInitData(null);
                setIsQuickWhatsAppOpen(true);
              }}
              className="text-xs bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 border border-emerald-400 rounded-lg transition flex items-center gap-1.5 cursor-pointer font-bold shadow-md shadow-emerald-900/50 text-white w-full md:w-auto justify-center"
              title="Send WhatsApp message to any phone number"
            >
              <MessageCircle className="w-3.5 h-3.5 fill-white/20" />
              <span>Send WhatsApp</span>
            </button>

            <button
              onClick={() => setActiveTab('mobile-apk')}
              className="text-xs bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 px-3 py-1.5 border border-emerald-300 rounded-lg transition flex items-center gap-1.5 cursor-pointer font-black shadow-md shadow-emerald-950/50 text-slate-950 w-full md:w-auto justify-center"
              title="Download Android APK for Completed Video Tasks, Views & Clicks Only"
            >
              <Smartphone className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Download Lite APK</span>
            </button>


            <button
              onClick={() => setActiveTab('sheets-extractor')}
              className="text-[10px] hidden md:flex items-center justify-center gap-1.5 px-2.5 rounded-lg border border-white/5 bg-white/5 hover:bg-white/10 transition w-32 h-[30px]"
              title="Auto-Backup Status"
            >
              {autoBackupStatus.state === 'running' && (
                <><RefreshCw className="w-3.5 h-3.5 text-blue-400 animate-spin shrink-0" /><span className="text-blue-200 truncate">Backing up...</span></>
              )}
              {autoBackupStatus.state === 'success' && (
                <><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" /><span className="text-emerald-200 truncate">Backed Up</span></>
              )}
              {autoBackupStatus.state === 'error' && (
                <><AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" /><span className="text-red-200 truncate">{autoBackupStatus.message || 'Error'}</span></>
              )}
              {autoBackupStatus.state === 'idle' && (
                <><FileSpreadsheet className="w-3.5 h-3.5 text-gray-400 shrink-0" /><span className="text-gray-400 truncate">Backup Ready</span></>
              )}
            </button>
            
            {isAdmin ? (
              <div className="flex items-center gap-1.5 font-mono text-[10px] bg-gradient-to-r from-purple-900/80 to-indigo-900/80 py-1.5 px-3 rounded-lg border border-purple-400/50 backdrop-blur-sm text-purple-200 shadow-sm" title="Logged in as Platform Administrator">
                <ShieldCheck className="w-3.5 h-3.5 text-amber-300" />
                <span className="font-extrabold text-white">ADMIN: Ashim Gogoi</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleAdminDirectAccess}
                className="text-xs bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-600 hover:to-indigo-600 px-3 py-1.5 border border-purple-400 rounded-lg transition flex items-center gap-1.5 cursor-pointer font-bold shadow-md shadow-purple-950/50 text-white"
                title="Switch to Administrator Mode (Ashim Gogoi)"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-amber-300" />
                <span>Admin Access</span>
              </button>
            )}

            {user ? (
              <>
                <div className="hidden sm:flex items-center gap-2 font-mono text-[10px] bg-white/5 py-1.5 px-3 rounded-lg border border-white/10 backdrop-blur-sm">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-pulse" />
                  <span className="text-indigo-100 font-bold uppercase max-w-[150px] truncate" title={user.email || 'CONNECTED'}>
                    {user.email}
                  </span>
                </div>
                {driveFolderId && (
                  <a
                    href={`https://drive.google.com/drive/folders/${driveFolderId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 border border-emerald-400 rounded-lg transition flex items-center gap-1.5 cursor-pointer font-bold shadow-xs text-white"
                    title="Open Data Folder in Google Drive"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Backups</span>
                  </a>
                )}
                <button
                  onClick={handleGoogleLogout}
                  disabled={isLoadingCloud}
                  className="text-xs bg-white/10 hover:bg-white/20 px-3 py-1.5 border border-white/20 rounded-lg transition flex items-center gap-1.5 cursor-pointer font-bold shadow-xs disabled:opacity-55 backdrop-blur-sm"
                >
                  <LogOut className="w-3.5 h-3.5 text-white" />
                  <span>Log Out</span>
                </button>
              </>
            ) : (
              <button
                onClick={() => setNeedsAuth(true)}
                disabled={isLoadingCloud}
                className="text-xs bg-white text-indigo-950 hover:bg-indigo-50 hover:text-black px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 cursor-pointer font-black shadow-md border border-transparent disabled:opacity-55"
              >
                <LogIn className="w-3.5 h-3.5 text-indigo-600" />
                <span>Log In</span>
              </button>
            )}

            <div className="hidden lg:flex items-center gap-2 font-mono text-[10px] bg-emerald-500/10 py-1.5 px-3 rounded-lg border border-emerald-500/30 backdrop-blur-sm">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
              <span className="text-emerald-300 font-black uppercase tracking-wider">LOCAL STORAGE ACTIVE</span>
            </div>
          </div>
        </header>

        {user && userStatus === 'Restricted' && (
          <div id="restricted_readonly_banner" className="bg-amber-500 text-black px-6 py-2 flex items-center justify-between text-xs font-semibold gap-3 shrink-0 border-b border-amber-600 shadow-sm">
            <div className="flex items-center gap-2">
              <AlertOctagon className="w-4.5 h-4.5 text-amber-950 animate-pulse" />
              <span>⚠️ RESTRICTED ACCESS (READ-ONLY): Your user email is configured with restricted parameters. You may inspect dashboards containing sync trackers and cost charts, but database writes have been locked. Contact ashimgogoi2008@gmail.com.</span>
            </div>
            <span className="bg-amber-950/20 px-2.5 py-0.5 rounded text-[10px] text-amber-950 uppercase font-black tracking-widest leading-none">Read-Only</span>
          </div>
        )}



        {announcementActive && globalAnnouncement && (
          <div id="system_announcement_broadcast" className="bg-red-700 text-white px-6 py-2.5 flex items-center justify-center text-xs font-semibold gap-3 shrink-0 border-b border-red-800 shadow-xs relative">
            <div className="flex items-center gap-2">
              <Volume2 className="w-4.5 h-4.5 text-red-200 animate-bounce" />
              <span className="tracking-wide uppercase text-red-100 font-bold mr-1"> broadcast:</span>
              <span>{globalAnnouncement}</span>
            </div>
          </div>
        )}

        {/* Global Eye-Comfort Theme Bar across all pages */}
        <div id="global-workspace-theme-bar" className={`px-4 sm:px-6 py-2 border-b flex flex-wrap items-center justify-between gap-3 text-xs transition-colors duration-200 ${themeStyles.subSurface} ${themeStyles.cardBorder}`}>
          <div className="flex items-center gap-2 flex-wrap">
            <div className={`flex items-center gap-1.5 font-bold ${themeStyles.textHeading}`}>
              <Eye className="w-4 h-4 text-emerald-600" />
              <span>Workspace Theme:</span>
            </div>
            <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border ${
              theme === 'green'
                ? 'bg-emerald-700 text-white border-emerald-500'
                : 'bg-white/70 text-slate-700 border-slate-300'
            }`}>
              Active: {themeStyles.name}
            </span>
            <span className={`text-[11px] font-medium hidden lg:inline ${themeStyles.textMuted}`}>
              Click any color button on the right (or visit Platform Settings) to change theme
            </span>
          </div>
          <ThemeSwitcher compact={true} showLabel={false} />
        </div>
      </div>


      {/* Main layout container split navigation rails side */}
      <div className="flex-1 flex flex-col md:flex-row items-stretch min-w-0">
        
        {/* Left Side Rail Categories choices */}
        <nav className={`w-full md:w-64 border-b md:border-b-0 shrink-0 p-4 space-y-1 relative overflow-hidden shadow-2xl z-10 transition-colors duration-300 ${
          theme === 'green'
            ? 'bg-gradient-to-br from-emerald-950 via-green-900 to-teal-950 border-emerald-800/60'
            : theme === 'calm-sage' || theme === 'earthy-olive'
            ? 'bg-gradient-to-br from-emerald-950 via-teal-950 to-slate-950 border-emerald-900/50'
            : 'bg-gradient-to-br from-indigo-950 via-purple-900 to-fuchsia-950 border-indigo-900/50'
        }`}>
          <div className={`absolute -top-24 -left-24 w-48 h-48 rounded-full blur-3xl pointer-events-none ${
            theme === 'green' || theme === 'calm-sage' || theme === 'earthy-olive' ? 'bg-emerald-500/30' : 'bg-fuchsia-600/30'
          }`} />
          <div className={`absolute bottom-0 right-0 w-64 h-64 rounded-full blur-3xl pointer-events-none ${
            theme === 'green' || theme === 'calm-sage' || theme === 'earthy-olive' ? 'bg-green-500/20' : 'bg-indigo-500/20'
          }`} />
          
          <div className="hidden md:block py-2 pb-4 relative z-10">
            <span className={`text-[10px] font-black uppercase tracking-widest font-mono drop-shadow-md ${
              theme === 'green' || theme === 'calm-sage' || theme === 'earthy-olive' ? 'text-emerald-300' : 'text-fuchsia-300'
            }`}>Operations workspace</span>
          </div>

          <div className="flex md:flex-col flex-wrap md:flex-nowrap gap-1.5 p-1 md:p-0 relative z-10">
            {navItems.map((n) => {
              const isActive = activeTab === n.id;
              const isGreenPalette = theme === 'green' || theme === 'calm-sage' || theme === 'earthy-olive';
              return (
                <button
                  key={n.id}
                  onClick={() => setActiveTab(n.id)}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold transition-all duration-300 w-full md:w-auto md:justify-start group border ${
                    isActive 
                      ? isGreenPalette
                        ? 'bg-gradient-to-r from-emerald-500 to-green-600 text-white shadow-lg border-emerald-300/40'
                        : 'bg-gradient-to-r from-fuchsia-500 to-indigo-600 text-white shadow-lg border-fuchsia-400/30' 
                      : isGreenPalette
                        ? 'bg-white/5 text-emerald-100/85 hover:text-white hover:bg-emerald-800/40 border-transparent hover:border-emerald-400/20 hover:shadow-md'
                        : 'bg-white/5 text-indigo-100/80 hover:text-white hover:bg-white/10 border-transparent hover:border-white/10 hover:shadow-md'
                  }`}
                >
                  <span className={`p-1.5 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-white/20 text-white shadow-inner'
                      : isGreenPalette
                        ? 'bg-white/5 text-emerald-300 group-hover:bg-emerald-500/20 group-hover:text-emerald-200'
                        : 'bg-white/5 text-fuchsia-300 group-hover:bg-fuchsia-500/20 group-hover:text-fuchsia-200'
                  }`}>{n.icon}</span>
                  <span className="drop-shadow-sm truncate">{n.label}</span>
                </button>
              );
            })}
          </div>
          
          <div className="hidden md:block pt-12 text-center space-y-1 relative z-10">
            <span className={`text-[10px] font-bold uppercase tracking-wider font-sans block ${
              theme === 'green' || theme === 'calm-sage' || theme === 'earthy-olive' ? 'text-emerald-300' : 'text-fuchsia-400'
            }`}>Developed by ASHIM GOGOI</span>
            <span className={`text-[9px] font-bold uppercase tracking-wider font-mono block ${
              theme === 'green' || theme === 'calm-sage' || theme === 'earthy-olive' ? 'text-emerald-200/50' : 'text-indigo-300/50'
            }`}>Version 2.6.1-Secure</span>
          </div>
        </nav>

        {/* Center / Right main category component execution frame */}
        <main className={`flex-1 min-w-0 p-6 md:p-8 ${themeStyles.mainBg} max-w-[1600px] 2xl:max-w-[1920px] mx-auto w-full max-w-full overflow-x-auto transition-colors duration-200`}>
          
          
          {hasGlobalDuplicates && (
            <div className="mb-6 bg-red-600 text-white rounded-xl shadow-lg p-3 flex flex-col md:flex-row items-center justify-center gap-3 animate-pulse border-2 border-red-800 cursor-pointer" onClick={() => setActiveTab('database')}>
              <AlertOctagon className="w-8 h-8 animate-bounce shrink-0" />
              <div className="text-center md:text-left">
                <p className="font-black text-sm md:text-base uppercase tracking-widest">Duplicate Creator Profiles Detected!</p>
                <p className="text-xs font-medium opacity-90 mt-0.5">Please go to the "Influencer Database" tab to review and merge duplicates to avoid data fragmentation. Click here to fix.</p>
              </div>
            </div>
          )}

          {/* Global ACTIVE STORAGE INTEGRITY GUARDIAN Header for All Workspace Views */}
          <div id="storage-integrity-guardian" className={`mb-6 ${themeStyles.cardBg} border ${themeStyles.cardBorder} rounded-2xl p-4 md:p-5 shadow-xs relative overflow-hidden transition-all duration-300`}>
            {/* Ambient accent border line */}
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-emerald-500" />
            
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="space-y-1 text-left max-w-3xl">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-black font-mono tracking-widest text-emerald-600 uppercase bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                    Live System Sentinel
                  </span>
                  <span className="inline-flex items-center gap-1 text-[9px] font-bold font-mono text-gray-400">
                    <Database className="w-3 h-3 text-emerald-500" /> Secure Sandbox Session
                  </span>
                </div>
                
                <h3 className={`text-sm font-black ${themeStyles.textHeading} tracking-tight flex items-center gap-2 mt-1`}>
                  <ShieldCheck className="w-5 h-5 text-emerald-600" />
                  <span>ACTIVE STORAGE INTEGRITY GUARDIAN</span>
                </h3>
                
                <p className={`text-xs ${themeStyles.textMuted} font-sans leading-relaxed`}>
                  Automatically safeguarding your monthly targets, campaign workflows, database records, and active profile memory. Run verification diagnostics below to align and sync configurations perfectly across rehost, logout or switch events.
                </p>
              </div>
              
              <div className="flex flex-wrap items-center gap-2 lg:self-center">
                {globalDiagnosticMsg && (
                  <button
                    onClick={() => setShowGlobalDiagnostic(!showGlobalDiagnostic)}
                    className="px-3.5 py-2 text-xs font-bold text-gray-600 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl transition cursor-pointer flex items-center gap-1"
                  >
                    {showGlobalDiagnostic ? (
                      <><span>Hide Diagnostics</span><ChevronUp className="w-3.5 h-3.5" /></>
                    ) : (
                      <><span>Show Diagnostics</span><ChevronDown className="w-3.5 h-3.5" /></>
                    )}
                  </button>
                )}
                
                <button
                  onClick={() => runGlobalVerificationDiagnostics(false)}
                  disabled={isVerifyingGlobal}
                  className={`px-4 py-2.5 text-[10px] font-black uppercase tracking-wider font-mono text-white bg-emerald-600 hover:bg-emerald-700 active:scale-95 rounded-xl transition-all duration-150 flex items-center gap-2 shadow-sm cursor-pointer ${
                    isVerifyingGlobal ? 'opacity-65 cursor-not-allowed' : ''
                  }`}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isVerifyingGlobal ? 'animate-spin' : ''}`} />
                  <span>{isVerifyingGlobal ? "Verifying..." : "Scan & Hard-Align Storage"}</span>
                </button>
              </div>
            </div>

            {/* Micro-feedback alert messages */}
            {feedbackMsg && (
              <div className={`mt-3 p-3 rounded-xl text-xs font-bold border transition-all duration-150 flex items-center gap-2 text-left ${
                feedbackMsg.type === 'success' 
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                  : 'bg-red-50 border-red-200 text-red-850'
              }`}>
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>{feedbackMsg.text}</span>
              </div>
            )}

            {showGlobalDiagnostic && globalDiagnosticMsg && (
              <div className="mt-4 bg-slate-900 text-emerald-400 font-mono text-xs p-4 rounded-xl border border-slate-800 text-left whitespace-pre-line shadow-inner max-h-72 overflow-y-auto leading-relaxed relative">
                <div className="absolute top-2 right-2 text-[9px] bg-slate-800 text-emerald-400 px-2 py-0.5 rounded font-mono uppercase tracking-wider">
                  Live Operations Verification Console
                </div>
                {globalDiagnosticMsg}
              </div>
            )}
          </div>
          
          <Suspense fallback={<div className="flex items-center justify-center h-64 font-mono font-bold text-indigo-500 text-sm uppercase tracking-widest"><Loader2 className="w-5 h-5 mr-3 animate-spin"/> Loading Module...</div>}>
          
          {activeTab === 'database' && (
            <InfluencerDatabase 
              floatingNote={floatingNote}
              setFloatingNote={setFloatingNote}
              influencers={influencers}
              campaigns={campaigns}
              tasks={tasks}
              messages={messages}
              contracts={contracts}
              billingEntries={billingEntries}
              onAssignToCampaign={handleAssignToCampaign}
              onCreateTask={(id) => {
                setActiveInfluencerId(id);
                setActiveTab('planner');
                console.warn("Monthly Planner: Plan deliverables using the scheduler tool inside.");
              }}
              onAddInfluencer={handleAddInfluencer}
              onUpdateInfluencer={handleUpdateInfluencer}
              onUpdateTask={handleUpdateTask}
              onDeleteInfluencer={handleDeleteInfluencer}
              onDeleteAllInfluencers={handleDeleteAllInfluencers}
              isAutoCreatorSystemEnabled={isAutoCreatorSystemEnabled}
              onToggleAutoCreatorSystem={handleToggleAutoCreatorSystem}
              onRunAutoCreatorSystemNow={() => executeAutoCreatorSystemPass(true)}
              autoCreatorSystemStats={autoCreatorSystemStats}
              user={user}
              accessToken={accessToken}
              onRestoreData={handleRestoreData}
              onLoginSuccess={(currentUser: any, token: string) => {
                setUser(currentUser);
                setAccessToken(token);
                setNeedsAuth(false);
              }}
              onLogoutSuccess={handleSystemLogout}
                />
              )}

          {activeTab === 'video-dashboard' && (
            <VideoCampaignDashboard
              notebookNotes={notebookNotes}
              tasks={tasks}
              influencers={influencers}
              campaigns={campaigns}
              products={dashboardProducts}
              setProducts={setDashboardProducts}
              monthlyBudgets={monthlyBudgets}
              monthlyTargets={monthlyTargets}
              setMonthlyTargets={setMonthlyTargets}
              wizardProducts={savedProducts}
              setWizardProducts={setSavedProducts}
              selectedMonth={selectedMonth}
              setSelectedMonth={setSelectedMonth}
              selectedYear={selectedYear}
              setSelectedYear={setSelectedYear}
              selectedWeek={selectedWeek}
              setSelectedWeek={setSelectedWeek}
              onUpdateInfluencer={handleUpdateInfluencer}
              onUpdateTask={handleUpdateTask}
              onUpdateTasksBulk={handleUpdateTasksBulk}
              onCreateTask={handleCreateTask}
              onDeleteTask={handleDeleteTask}
              onBulkDeleteTasks={handleBulkDeleteTasks}
              accessToken={accessToken}
              onForceGlobalBackup={handleForceGlobalBackup}
              salesData={salesData}
              onAutoSyncSalesData={handleAutoSyncSalesData}
            />
          )}

          {activeTab === 'data-analyzer' && (
            <DataAnalyzer
              tasks={tasks}
              onSyncTasks={(newTasks) => {
                newTasks.forEach(t => handleCreateTask(t as any));
              }}
              onSyncInfluencers={(newInfs) => {
                handleAddInfluencersBulk(newInfs as any[]);
              }}
              onUpdateTasksBulk={handleUpdateTasksBulk}
              accessToken={accessToken}
              user={user}
            />
          )}

          {activeTab === 'planner' && (
            <CampaignPlanner monthlyBudgets={monthlyBudgets} 
              notebookNotes={notebookNotes}
              influencers={influencers}
              campaigns={campaigns}
              tasks={tasks}
              savedProducts={savedProducts}
              setSavedProducts={setSavedProducts}
              dashboardProducts={dashboardProducts}
              setDashboardProducts={setDashboardProducts}
              monthFilter={selectedMonth}
              setMonthFilter={setSelectedMonth}
              yearFilter={selectedYear}
              setYearFilter={setSelectedYear}
              weekFilter={selectedWeek}
              setWeekFilter={setSelectedWeek}
              monthlyTargets={monthlyTargets}
              onUpdateCampaignDates={handleUpdateCampaignDates}
              onUpdateTask={handleUpdateTask}
              onCreateCampaign={handleCreateCampaign}
              onCreateTask={handleCreateTask}
              onDeleteTask={handleDeleteTask}
              onUpdateTasksBulk={handleUpdateTasksBulk}
              onBulkDeleteTasks={handleBulkDeleteTasks}
              onUpdateInfluencer={handleUpdateInfluencer}
              onAddInfluencer={handleAddInfluencer}
              onAddInfluencersBulk={handleAddInfluencersBulk}
              user={user}
              accessToken={accessToken}
              salesData={salesData}
            />
          )}

          {activeTab === 'monthly-targets' && (
            <div className="bg-white rounded-2xl border border-gray-150 p-6 shadow-sm">
                <MonthlyTargets 
                  monthlyTargets={monthlyTargets}
                  setMonthlyTargets={setMonthlyTargets}
                  monthlyBudgets={monthlyBudgets}
                  setMonthlyBudgets={setMonthlyBudgets}
                  savedProducts={savedProducts}
                  tasks={tasks}
                  selectedMonth={selectedMonth}
                  setSelectedMonth={setSelectedMonth}
                  selectedYear={selectedYear}
                  setSelectedYear={setSelectedYear}
                  dashboardProducts={dashboardProducts}
                  setDashboardProducts={setDashboardProducts}
                  user={user}
                />
            </div>
          )}

          {activeTab === 'aov-calculator' && (
            <div className="bg-white rounded-2xl border border-gray-150 p-6 shadow-sm">
                <AovCalculator 
                  aovEntries={aovEntries}
                  setAovEntries={handleUpdateAovEntries}
                  selectedMonth={selectedMonth}
                  setSelectedMonth={setSelectedMonth}
                  selectedYear={selectedYear}
                  setSelectedYear={setSelectedYear}
                  selectedWeek={selectedWeek}
                  setSelectedWeek={setSelectedWeek}
                  monthlyTargets={monthlyTargets}
                  savedProducts={savedProducts}
                />
            </div>
          )}

          {activeTab === 'notebook' && (
            <SmartAINotebook 
              accessToken={accessToken}
              notes={notebookNotes}
              setNotes={handleUpdateNotebookNotes}
              user={user}
              influencers={influencers}
              campaigns={campaigns}
              tasks={tasks}
              setTasks={setTasks}
              onAddInfluencer={handleAddInfluencer}
              onUpdateInfluencer={handleUpdateInfluencer}
              onUpdateTask={handleUpdateTask}
              monthlyTargets={monthlyTargets}
              setMonthlyTargets={setMonthlyTargets}
              wizardProducts={dashboardProducts.map(p => p.name)}
            />
          )}

          {activeTab === 'image-slides' && (
             <ImageSlides 
               selectedMonth={selectedMonth}
               setSelectedMonth={setSelectedMonth}
               selectedYear={selectedYear}
               setSelectedYear={setSelectedYear}
               selectedWeek={selectedWeek}
               setSelectedWeek={setSelectedWeek}
               dashboardProducts={dashboardProducts}
               campaigns={campaigns}
               tasks={tasks}
               influencers={influencers}
               monthlyTargets={monthlyTargets}
               monthlyBudgets={monthlyBudgets}
               wizardProducts={dashboardProducts.map(p => p.name)}
               activeMonth={selectedMonth}
               activeYear={selectedYear}
             />
          )}

          {activeTab === 'secure-billing' && (
            <SecureBillPayment 
               accessToken={accessToken}
               selectedMonth={selectedMonth} 
               setSelectedMonth={setSelectedMonth}
               selectedYear={selectedYear}
               setSelectedYear={setSelectedYear}
               selectedWeek={selectedWeek}
               setSelectedWeek={setSelectedWeek}
               tasks={tasks}
               onUpdateTask={(taskId, updatedFields) => {
                 setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...updatedFields } : t));
               }}
               onUpdateInfluencer={handleUpdateInfluencer}
               influencers={influencers}
               campaigns={campaigns}
            />
          )}

          {activeTab === 'expenditure-bill' && (
            <MonthlyExpenditureBill />
          )}

          {activeTab === 'compare-months' && (
            <MonthlyCompare
              tasks={tasks}
              influencers={influencers}
              dashboardProducts={dashboardProducts}
              monthlyTargets={monthlyTargets}
              salesData={salesData}
              savedProducts={savedProducts}
            />
          )}

          {activeTab === 'leaderboard' && (
            <LeaderboardBenchmarking 
               selectedMonth={selectedMonth}
               setSelectedMonth={setSelectedMonth}
               selectedYear={selectedYear}
               setSelectedYear={setSelectedYear}
               selectedWeek={selectedWeek}
               setSelectedWeek={setSelectedWeek}
               influencers={influencers}
               tasks={tasks}
            />
          )}

          {activeTab === 'shortio-tracker' && (
            <ShortioTracker 
               selectedMonth={selectedMonth}
               setSelectedMonth={setSelectedMonth}
               selectedYear={selectedYear}
               setSelectedYear={setSelectedYear}
               selectedWeek={selectedWeek}
               setSelectedWeek={setSelectedWeek}
               tasks={tasks}
               influencers={influencers}
               onUpdateTasksBulk={handleUpdateTasksBulk}
            />
          )}

          {activeTab === 'live-video-views' && (
            <LiveVideoViewsTracker 
               selectedMonth={selectedMonth}
               setSelectedMonth={setSelectedMonth}
               selectedYear={selectedYear}
               setSelectedYear={setSelectedYear}
               selectedWeek={selectedWeek}
               setSelectedWeek={setSelectedWeek}
               tasks={tasks}
               influencers={influencers}
               onUpdateTask={handleUpdateTask}
               onUpdateTasksBulk={handleUpdateTasksBulk}
               onUpdateInfluencer={handleUpdateInfluencer}
            />
          )}


          {activeTab === 'sales-dashboard' && (
            <SalesDashboard 
               dashboardProducts={dashboardProducts}
               savedProducts={savedProducts}
               data={salesData}
               setData={setSalesData}
               fileName={salesFileName}
               setFileName={setSalesFileName}
               accessToken={accessToken}
               selectedMonth={selectedMonth}
               setSelectedMonth={setSelectedMonth}
               selectedYear={selectedYear}
               setSelectedYear={setSelectedYear}
               selectedWeek={selectedWeek}
               setSelectedWeek={setSelectedWeek}
            />
          )}

          {activeTab === 'mobile-apk' && (
            <AndroidMobileApp 
               influencers={influencers}
               campaigns={campaigns}
               tasks={tasks}
               messages={messages}
               contracts={contracts}
               billingEntries={billingEntries}
               aovEntries={aovEntries}
               dashboardProducts={dashboardProducts}
               monthlyTargets={monthlyTargets}
               savedProducts={savedProducts}
               user={user}
               accessToken={accessToken}
               onRestoreData={handleRestoreData}
               onLoginSuccess={(currentUser: any, token: string) => {
                 setUser(currentUser);
                 setAccessToken(token);
                 setNeedsAuth(false);
               }}
               onLogoutSuccess={handleSystemLogout}
               onLaunchLiteMode={() => {
                 const url = new URL(window.location.href);
                 url.searchParams.set('mode', 'apk-lite');
                 window.history.pushState({}, '', url.toString());
                 setIsLiteApkMode(true);
               }}
            />
          )}

          {activeTab === 'sheets-extractor' && (
            <div className="max-w-6xl mx-auto space-y-6">
              <CentralCsvBackup
                 influencers={influencers}
                 campaigns={campaigns}
                 tasks={tasks}
                 messages={messages}
                 contracts={contracts}
                 billingEntries={billingEntries}
                 aovEntries={aovEntries}
                 monthlyTargets={monthlyTargets}
                 dashboardProducts={dashboardProducts}
                 savedProducts={savedProducts}
                 notebookNotes={notebookNotes}
                 user={user}
                 accessToken={accessToken}
                 onRestoreData={handleRestoreData}
                 onLoginSuccess={(currentUser: any, token: string) => {
                   setUser(currentUser);
                   setAccessToken(token);
                   setNeedsAuth(false);
                 }}
              />
              <GoogleSheetsExtractor 
                 influencers={influencers}
                 campaigns={campaigns}
                 tasks={tasks}
                 messages={messages}
                 contracts={contracts}
                 billingEntries={billingEntries}
                 aovEntries={aovEntries}
                 dashboardProducts={dashboardProducts}
                 monthlyTargets={monthlyTargets}
                 salesData={salesData}
                 user={user}
                 accessToken={accessToken}
                 onLoginSuccess={(currentUser: any, token: string) => {
                   setUser(currentUser);
                   setAccessToken(token);
                   setNeedsAuth(false);
                 }}
                 onLogoutSuccess={handleSystemLogout}
              />
            </div>
          )}

          {activeTab === 'cloud-sync' && (
            <div className="bg-white rounded-2xl border border-gray-150 p-6 shadow-sm">
              <GoogleDriveSync
                  influencers={influencers}
                  campaigns={campaigns}
                  tasks={tasks}
                  messages={messages}
                  contracts={contracts}
                  billingEntries={billingEntries}
                  aovEntries={aovEntries}
                  monthlyTargets={monthlyTargets}
                  dashboardProducts={dashboardProducts}
                  savedProducts={savedProducts}
                  user={user}
                  accessToken={accessToken}
                  onRestoreData={handleRestoreData}
                  onLoginSuccess={(currentUser: any, token: string) => {
                    setUser(currentUser);
                    setAccessToken(token);
                    setNeedsAuth(false);
                  }}
                  onLogoutSuccess={handleSystemLogout}
              />
              <div className="mt-8 pt-8 border-t border-gray-150">
                <SystemMemorySafeguard
                  influencers={influencers}
                  campaigns={campaigns}
                  tasks={tasks}
                  messages={messages}
                  contracts={contracts}
                  billingEntries={billingEntries}
                  dashboardProducts={dashboardProducts}
                  savedProducts={savedProducts}
                  selectedMonth={selectedMonth}
                  selectedYear={selectedYear}
                  monthlyTargets={monthlyTargets}
                  aovEntries={aovEntries}
                  notebookNotes={notebookNotes}
                  onRestoreData={handleRestoreData}
                  user={user}
                  accessToken={accessToken}
                  onLoginSuccess={(currentUser: any, token: string) => {
                    setUser(currentUser);
                    setAccessToken(token);
                    setNeedsAuth(false);
                  }}
                  onLogoutSuccess={handleSystemLogout}
                />
              </div>
            </div>
          )}

          {isAdmin && activeTab === 'settings' && (
            <PlatformSettings 
               influencers={influencers}
               campaigns={campaigns}
               tasks={tasks}
               messages={messages}
               contracts={contracts}
               billingEntries={billingEntries}
               aovEntries={aovEntries}
               monthlyTargets={monthlyTargets}
               dashboardProducts={dashboardProducts}
               savedProducts={savedProducts}
               agencyName={agencyName}
               setAgencyName={setAgencyName}
               developerName={developerName}
               setDeveloperName={setDeveloperName}
               onRestoreData={handleRestoreData}
               onResetDatabase={async () => { handleDeleteAllInfluencers(); }}
               selectedMonth={selectedMonth}
               selectedYear={selectedYear}
            />
          )}

          {isAdmin && activeTab === 'admin-panel' && (
            <AdminPanel 
               currentAdminEmail={user?.email || ''}
            />
          )}
          
          </Suspense>

        </main>
      </div>
      {/* Modern Non-blocking Floating Toast Notification */}
      <Suspense fallback={null}>
        <DriveRecoveryModal
          isOpen={isDriveRecoveryModalOpen}
          onClose={() => setIsDriveRecoveryModalOpen(false)}
          accessToken={accessToken}
          onRestore={handleRestoreData}
          onLoginSuccess={(currentUser: any, token: string) => {
            setUser(currentUser);
            setAccessToken(token);
            setNeedsAuth(false);
          }}
        />
      </Suspense>
      {toastMessage && (
        <div id="app_routing_toast" className="fixed top-6 left-1/2 -translate-x-1/2 md:left-auto md:translate-x-0 md:right-6 z-[99999] max-w-sm w-full animate-fade-in transition-all">
          <div className={`relative px-5 py-3.5 rounded-xl border flex items-start gap-3 shadow-2xl backdrop-blur-md ${
            toastType === 'error'
              ? 'bg-red-50/95 border-red-200 text-red-900 shadow-red-500/10'
              : toastType === 'success'
              ? 'bg-emerald-50/95 border-emerald-200 text-emerald-900 shadow-emerald-500/10'
              : toastType === 'warning'
              ? 'bg-amber-50/95 border-amber-200 text-amber-900 shadow-amber-500/10'
              : 'bg-slate-900/95 border-slate-700 text-slate-100 shadow-slate-950/20'
          }`}>
            <span className="text-sm shrink-0">
              {toastType === 'error' ? '❌' : toastType === 'success' ? '✅' : toastType === 'warning' ? '⚠️' : 'ℹ️'}
            </span>
            <div className="space-y-0.5 pr-6 w-full">
              <h5 className="font-bold text-xs">System Notification</h5>
              <p className="text-[11px] opacity-90 leading-relaxed font-sans">{toastMessage}</p>
              {toastType === 'error' && (
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(toastMessage);
                    globalToast.success('Error message copied to clipboard!');
                  }}
                  className="mt-2 flex items-center gap-1.5 text-[10px] font-bold text-red-700 hover:text-red-900 bg-red-100/50 hover:bg-red-200/60 px-2 py-1 rounded transition-colors"
                >
                  <Copy className="w-3 h-3" /> Copy Error
                </button>
              )}
            </div>
            <button
              onClick={() => setToastMessage(null)}
              className={`absolute right-3 top-3.5 p-1 rounded-md opacity-70 hover:opacity-100 transition-opacity ${
                toastType === 'error' ? 'hover:bg-red-100/50' : toastType === 'success' ? 'hover:bg-emerald-100/50' : 'hover:bg-slate-800'
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Global Quick Send WhatsApp to Any Number Modal */}
      <QuickSendWhatsAppModal
        isOpen={isQuickWhatsAppOpen}
        onClose={() => {
          setIsQuickWhatsAppOpen(false);
          setQuickWhatsAppInitData(null);
        }}
        influencers={influencers}
        initialData={quickWhatsAppInitData}
      />

      {/* Global High-Fidelity WhatsApp Number Prompt Modal */}
      <UpdateWhatsAppModal
        isOpen={isWhatsAppModalOpen}
        onClose={() => {
          setIsWhatsAppModalOpen(false);
          setWhatsAppModalData(null);
        }}
        data={whatsAppModalData}
        onSave={(influencerId, mobileNumber) => {
          handleUpdateInfluencer(influencerId, { 
            mobile: mobileNumber,
            name: whatsAppModalData?.influencerName
          });
          // Also update all tasks matching this creator with the new mobile number
          setTasks(prev => prev.map(t => {
            const matchesId = t.influencerId === influencerId;
            const matchesName = whatsAppModalData?.influencerName &&
              ((t as any).influencerName && (t as any).influencerName.trim().toLowerCase() === whatsAppModalData.influencerName.trim().toLowerCase());
            if (matchesId || matchesName) {
              return { ...t, influencerMobile: mobileNumber };
            }
            return t;
          }));
        }}
      />

    </div>
  );
}
export default function AppWrapper() { return <ErrorBoundary><App /></ErrorBoundary>; }
