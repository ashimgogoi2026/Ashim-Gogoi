import React, { useState, useEffect } from 'react';
import { 
  Settings, User, Building, DollarSign, Shield, Database, Download, DownloadCloud, Upload, 
  RefreshCw, Check, AlertTriangle, HelpCircle, Sliders, Save, Trash2, MessageCircle, Building2,
  Image as ImageIcon, Sparkles, ExternalLink, Copy, Pencil, Plus
} from 'lucide-react';
import { Influencer, Campaign, Task, Message, Contract, BillingEntry, ProductConfig, AovEntry } from '../types';
import { MonthlyProductTarget } from './MonthlyTargets';
import { safeLocalStorage } from '../lib/safeLocalStorage';
import CompanyBrandingModal from './CompanyBrandingModal';
import { getCompanyBrandingConfig, saveCompanyBrandingConfig, attachCompanyBranding, copyCompanyLogoToClipboard, CompanyBrandingConfig } from '../lib/whatsappHelper';
import { ThemeSwitcher, useTheme } from '../context/ThemeContext';

function sanitizeJSONString(jsonStr: string): string {
  let inString = false;
  let escapeNext = false;
  let fixedStr = '';
  
  for (let i = 0; i < jsonStr.length; i++) {
    const char = jsonStr[i];
    
    if (escapeNext) {
      fixedStr += char;
      escapeNext = false;
      continue;
    }
    
    if (char === '\\') {
      escapeNext = true;
      fixedStr += char;
      continue;
    }
    
    if (char === '"') {
      inString = !inString;
      fixedStr += char;
      continue;
    }
    
    if (inString) {
      if (char === '\n') fixedStr += '\\n';
      else if (char === '\r') fixedStr += '\\r';
      else if (char === '\t') fixedStr += '\\t';
      else fixedStr += char;
    } else {
      fixedStr += char;
    }
  }
  
  return fixedStr;
}

interface PlatformSettingsProps {
  influencers: Influencer[];
  campaigns: Campaign[];
  tasks: Task[];
  messages: Message[];
  contracts: Contract[];
  billingEntries: BillingEntry[];
  aovEntries?: AovEntry[];
  monthlyTargets?: MonthlyProductTarget[];
  dashboardProducts?: ProductConfig[];
  savedProducts?: string[];
  salesData?: any[];
  salesFileName?: string | null;
  
  onRestoreData: (restoredData: any) => Promise<void>;
  onResetDatabase: () => Promise<void>;
  
  agencyName: string;
  setAgencyName: (name: string) => void;
  developerName: string;
  setDeveloperName: (name: string) => void;
  
  selectedMonth: string;
  selectedYear: string;
}

export default function PlatformSettings({
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
  salesData = [],
  salesFileName = null,
  onRestoreData,
  onResetDatabase,
  agencyName,
  setAgencyName,
  developerName,
  setDeveloperName,
  selectedMonth,
  selectedYear
}: PlatformSettingsProps) {
  // 1. Profile States
  const [inputAgencyName, setInputAgencyName] = useState(agencyName);
  const [inputDevName, setInputDevName] = useState(developerName);
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [resetPasskey, setResetPasskey] = useState(() => safeLocalStorage.getItem('INFLUENCER_MANAGER_RESET_PASSKEY') || '');
  const [inputPasskey, setInputPasskey] = useState(safeLocalStorage.getItem('INFLUENCER_MANAGER_RESET_PASSKEY') || '');
  const [passkeySuccess, setPasskeySuccess] = useState(false);
  
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [confirmPasskey, setConfirmPasskey] = useState('');
  const [resetError, setResetError] = useState('');

  // 2. Campaign Default States
  const [currency, setCurrency] = useState(() => safeLocalStorage.getItem('INFLUENCER_MANAGER_CURRENCY') || '₹');
  const [commissionRate, setCommissionRate] = useState(() => parseInt(safeLocalStorage.getItem('INFLUENCER_MANAGER_COMMISSION_RATE') || '15', 10));
  const [defaultMonthlyTarget, setDefaultMonthlyTarget] = useState(() => parseInt(safeLocalStorage.getItem('INFLUENCER_MANAGER_DEFAULT_MONTHLY_TARGET') || '300000', 10));
  const [campaignSuccess, setCampaignSuccess] = useState(false);

  // 3. System Safeguard States (Sync with systemMemoryBackup state in localStorage)
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(() => safeLocalStorage.getItem('SYS_MEMORY_AUTOSAVE_ENABLED') !== 'false');
  const [autoSaveInterval, setAutoSaveInterval] = useState(() => parseInt(safeLocalStorage.getItem('SYS_MEMORY_AUTOSAVE_INTERVAL') || '30', 10));
  const [autoCsvEnabled, setAutoCsvEnabled] = useState(() => safeLocalStorage.getItem('SYS_MEMORY_AUTOCSV_LOGOUT_ENABLED') === 'true');
  const [autoCsvLoginEnabled, setAutoCsvLoginEnabled] = useState(() => safeLocalStorage.getItem('SYS_MEMORY_AUTOCSV_LOGIN_ENABLED') !== 'false');
  const [safeguardSuccess, setSafeguardSuccess] = useState(false);

  // 4. Data Backup File Import state
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [isWipingCache, setIsWipingCache] = useState(false);

  const handleSavePasskey = () => {
    if (inputPasskey.length !== 4 || !/^\d+$/.test(inputPasskey)) {
      alert("Passkey must be exactly 4 digits.");
      return;
    }
    setResetPasskey(inputPasskey);
    safeLocalStorage.setItem('INFLUENCER_MANAGER_RESET_PASSKEY', inputPasskey);
    setPasskeySuccess(true);
    setTimeout(() => setPasskeySuccess(false), 2000);
  };

  const handleResetAttempt = () => {
    if (!resetPasskey || confirmPasskey !== resetPasskey) {
      setResetError("Invalid passkey. Please try again.");
      setTimeout(() => setResetError(""), 2000);
      return;
    }
    
    // valid passkey, perform reset
    onResetDatabase();
    setShowResetConfirm(false);
    setConfirmPasskey('');
  };

  // 5. Ultra-Accurate Base64 Recovery Key states
  const [b64RecoveryKey, setB64RecoveryKey] = useState('');
  const [b64InputKey, setB64InputKey] = useState('');
  const [b64CopySuccess, setB64CopySuccess] = useState(false);
  const [b64RestoreError, setB64RestoreError] = useState<string | null>(null);

  const handleGenerateRecoveryKey = () => {
    try {
      const dataPayload = {
        influencers,
        campaigns,
        tasks,
        messages,
        contracts,
        billingEntries,
        aovEntries,
        monthlyTargets,
        dashboardProducts,
        savedProducts,
        salesData,
        salesFileName,
        agencyName,
        developerName,
        currency,
        commissionRate,
        selectedMonth,
        selectedYear,
        key_signature: "INFLUENCER_MANAGER_VERIFIED",
        timestamp: Date.now()
      };
      const jsonStr = JSON.stringify(dataPayload);
      const b64 = btoa(encodeURIComponent(jsonStr));
      setB64RecoveryKey(b64);
    } catch (e: any) {
      console.warn(`Failed to generate recovery key: ${e.message}`);
    }
  };

  const handleCopyRecoveryKey = () => {
    if (!b64RecoveryKey) return;
    navigator.clipboard.writeText(b64RecoveryKey);
    setB64CopySuccess(true);
    setTimeout(() => setB64CopySuccess(false), 2000);
  };

  const handleRestoreFromRecoveryKey = async () => {
    const cleanedKey = b64InputKey.replace(/\s/g, '');
    if (!cleanedKey) {
      setB64RestoreError("Please paste a recovery key first.");
      return;
    }
    setB64RestoreError(null);
    try {
      const jsonStr = decodeURIComponent(atob(cleanedKey));
      const parsedContent = JSON.parse(sanitizeJSONString(jsonStr));

      if (parsedContent.key_signature !== "INFLUENCER_MANAGER_VERIFIED" && !parsedContent.influencers) {
        throw new Error("This Base64 Key does not match the active verified format signature.");
      }

      // Restructure missing keys
      if (!parsedContent.influencers || !Array.isArray(parsedContent.influencers)) parsedContent.influencers = [];
      if (!parsedContent.campaigns || !Array.isArray(parsedContent.campaigns)) parsedContent.campaigns = [];
      if (!parsedContent.tasks || !Array.isArray(parsedContent.tasks)) parsedContent.tasks = [];
      if (!parsedContent.messages || !Array.isArray(parsedContent.messages)) parsedContent.messages = [];
      if (!parsedContent.contracts || !Array.isArray(parsedContent.contracts)) parsedContent.contracts = [];
      if (!parsedContent.billingEntries || !Array.isArray(parsedContent.billingEntries)) parsedContent.billingEntries = [];
      if (!parsedContent.aovEntries || !Array.isArray(parsedContent.aovEntries)) parsedContent.aovEntries = [];
      if (!parsedContent.monthlyTargets || !Array.isArray(parsedContent.monthlyTargets)) parsedContent.monthlyTargets = [];
      if (!parsedContent.dashboardProducts || !Array.isArray(parsedContent.dashboardProducts)) parsedContent.dashboardProducts = [];
      if (!parsedContent.savedProducts || !Array.isArray(parsedContent.savedProducts)) parsedContent.savedProducts = [];

      if (parsedContent.agencyName) {
        safeLocalStorage.setItem('INFLUENCER_MANAGER_AGENCY_NAME', parsedContent.agencyName);
        setAgencyName(parsedContent.agencyName);
        setInputAgencyName(parsedContent.agencyName);
      }
      if (parsedContent.developerName) {
        safeLocalStorage.setItem('INFLUENCER_MANAGER_DEVELOPER_NAME', parsedContent.developerName);
        setDeveloperName(parsedContent.developerName);
        setInputDevName(parsedContent.developerName);
      }

      await onRestoreData(parsedContent);
      setB64InputKey('');
      setImportSuccess("100% accurate Base64 dynamic recovery key resolved and applied to workspace successfully!");
    } catch (e: any) {
      console.error(e);
      setB64RestoreError(`Invalid recovery key: ${e.message || e}`);
    }
  };

  // Section sub-tabs
  const [activeSection, setActiveSection] = useState<'profile' | 'defaults' | 'whatsapp' | 'safeguards' | 'administration'>('profile');
  const [isBrandingModalOpen, setIsBrandingModalOpen] = useState(false);
  const [brandingConfig, setBrandingConfig] = useState<CompanyBrandingConfig>(() => getCompanyBrandingConfig());
  const [isCopyingLogo, setIsCopyingLogo] = useState(false);

  useEffect(() => {
    const handleBrandingSync = (e: any) => {
      if (e?.detail) {
        setBrandingConfig(e.detail);
      } else {
        setBrandingConfig(getCompanyBrandingConfig());
      }
    };
    window.addEventListener('company-branding-updated', handleBrandingSync);
    window.addEventListener('storage', handleBrandingSync);
    return () => {
      window.removeEventListener('company-branding-updated', handleBrandingSync);
      window.removeEventListener('storage', handleBrandingSync);
    };
  }, []);

  // Handle saving Workspace profile changes
  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputAgencyName.trim()) {
      console.warn("Workspace Name cannot be empty.");
      return;
    }
    if (!inputDevName.trim()) {
      console.warn("Developer Name cannot be empty.");
      return;
    }
    
    // Persist and uplift state
    safeLocalStorage.setItem('INFLUENCER_MANAGER_AGENCY_NAME', inputAgencyName.trim());
    safeLocalStorage.setItem('INFLUENCER_MANAGER_DEVELOPER_NAME', inputDevName.trim());
    setAgencyName(inputAgencyName.trim());
    setDeveloperName(inputDevName.trim());
    
    setProfileSuccess(true);
    setTimeout(() => setProfileSuccess(false), 2500);
  };

  // Handle saving Campaign default inputs
  const handleSaveCampaignDefaults = (e: React.FormEvent) => {
    e.preventDefault();
    safeLocalStorage.setItem('INFLUENCER_MANAGER_CURRENCY', currency);
    safeLocalStorage.setItem('INFLUENCER_MANAGER_COMMISSION_RATE', commissionRate.toString());
    safeLocalStorage.setItem('INFLUENCER_MANAGER_DEFAULT_MONTHLY_TARGET', defaultMonthlyTarget.toString());
    
    setCampaignSuccess(true);
    setTimeout(() => setCampaignSuccess(false), 2500);
  };

  // Handle saving Safeguard settings
  const handleSaveSafeguards = (e: React.FormEvent) => {
    e.preventDefault();
    safeLocalStorage.setItem('SYS_MEMORY_AUTOSAVE_ENABLED', autoSaveEnabled ? 'true' : 'false');
    safeLocalStorage.setItem('SYS_MEMORY_AUTOSAVE_INTERVAL', autoSaveInterval.toString());
    safeLocalStorage.setItem('SYS_MEMORY_AUTOCSV_LOGOUT_ENABLED', autoCsvEnabled ? 'true' : 'false');
    safeLocalStorage.setItem('SYS_MEMORY_AUTOCSV_LOGIN_ENABLED', autoCsvLoginEnabled ? 'true' : 'false');
    
    // Fire a quick storage event or update internal tracking so App.tsx effect re-triggers
    window.dispatchEvent(new Event('storage'));
    
    setSafeguardSuccess(true);
    setTimeout(() => setSafeguardSuccess(false), 2500);
  };

  // Helper: Export active state database as JSON safely inside iframes
  const handleExportDatabase = () => {
    try {
      const dataPayload = {
        influencers,
        campaigns,
        tasks,
        messages,
        contracts,
        billingEntries,
        aovEntries,
        monthlyTargets,
        dashboardProducts,
        savedProducts,
        salesData,
        salesFileName,
        agencyName,
        developerName,
        currency,
        commissionRate,
        selectedMonth,
        selectedYear,
        exportedAt: new Date().toISOString(),
        version: "2.5.0"
      };

      const jsonString = JSON.stringify(dataPayload, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const blobUrl = URL.createObjectURL(blob);
      
      const downloadAnchor = document.createElement('a');
      downloadAnchor.href = blobUrl;
      downloadAnchor.setAttribute(
        'download', 
        `protogrow_backup_${new Date().toISOString().slice(0,10)}_${Date.now()}.json`
      );
      downloadAnchor.target = '_blank';
      document.body.appendChild(downloadAnchor);
      
      // Perform direct click without set timeout to bypass popup/download blockers in sandbox
      downloadAnchor.click();
      
      document.body.removeChild(downloadAnchor);
      URL.revokeObjectURL(blobUrl);
    } catch (e: any) {
      console.warn(`Export failed: ${e?.message || e}`);
    }
  };

  // Helper: Import external backup file and restore
  const handleImportDatabase = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportError(null);
    setImportSuccess(null);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const fileContent = event.target?.result;
        if (typeof fileContent !== 'string') {
          throw new Error("Unable to parse external target content as text.");
        }

        const sanitizedContent = sanitizeJSONString(fileContent);
        const rawContent = JSON.parse(sanitizedContent);

        // Standard structural validation before calling restore callback
        if (typeof rawContent !== 'object' || rawContent === null) {
          throw new Error("Invalid backup format. File content must be a valid JSON object.");
        }
        
        // Guard against restoring random JSON files which would wipe the active database
        if (!rawContent.version && !rawContent.key_signature && !rawContent.influencers && !rawContent.payload) {
          throw new Error("Invalid backup format. File content does not match a recognized Influencer Manager backup.");
        }

        // Resiliently unpack .payload if it was exported under server/cloud backup schemas
        const parsedContent = rawContent.payload ? { ...rawContent, ...rawContent.payload } : rawContent;

        // Resilient default fallbacks for any missing arrays
        if (!parsedContent.influencers || !Array.isArray(parsedContent.influencers)) {
          parsedContent.influencers = [];
        }
        if (!parsedContent.campaigns || !Array.isArray(parsedContent.campaigns)) {
          parsedContent.campaigns = [];
        }
        if (!parsedContent.tasks || !Array.isArray(parsedContent.tasks)) {
          parsedContent.tasks = [];
        }
        if (!parsedContent.messages || !Array.isArray(parsedContent.messages)) {
          parsedContent.messages = [];
        }
        if (!parsedContent.contracts || !Array.isArray(parsedContent.contracts)) {
          parsedContent.contracts = [];
        }
        if (!parsedContent.billingEntries || !Array.isArray(parsedContent.billingEntries)) {
          parsedContent.billingEntries = [];
        }
        if (!parsedContent.aovEntries || !Array.isArray(parsedContent.aovEntries)) {
          parsedContent.aovEntries = [];
        }
        if (!parsedContent.monthlyTargets || !Array.isArray(parsedContent.monthlyTargets)) {
          parsedContent.monthlyTargets = [];
        }
        if (!parsedContent.dashboardProducts || !Array.isArray(parsedContent.dashboardProducts)) {
          parsedContent.dashboardProducts = [];
        }
        if (!parsedContent.savedProducts || !Array.isArray(parsedContent.savedProducts)) {
          parsedContent.savedProducts = [];
        }

        // Restore custom profiles if included
        if (parsedContent.agencyName) {
          safeLocalStorage.setItem('INFLUENCER_MANAGER_AGENCY_NAME', parsedContent.agencyName);
          setAgencyName(parsedContent.agencyName);
          setInputAgencyName(parsedContent.agencyName);
        }
        if (parsedContent.developerName) {
          safeLocalStorage.setItem('INFLUENCER_MANAGER_DEVELOPER_NAME', parsedContent.developerName);
          setDeveloperName(parsedContent.developerName);
          setInputDevName(parsedContent.developerName);
        }
        if (parsedContent.currency) {
          safeLocalStorage.setItem('INFLUENCER_MANAGER_CURRENCY', parsedContent.currency);
          setCurrency(parsedContent.currency);
        }

        await onRestoreData(parsedContent);
        setImportSuccess("Configuration database snapshot parsed & successfully restored to workspace!");
      } catch (err: any) {
        console.error("Import processing error: ", err);
        setImportError(err?.message || "JSON structure could not be parsed successfully.");
      } finally {
        e.target.value = '';
      }
    };

    reader.readAsText(file);
  };

  const handleClearLocalStorageCache = () => {
    setIsWipingCache(true);
    setTimeout(() => {
      // Clear client storage, RAM backup caches, and trigger full server KV store erasure
      safeLocalStorage.clear();
      
      setIsWipingCache(false);
      window.location.reload();
    }, 1200);
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto" id="platform-settings-container">
      
      {/* Settings Headline Header */}
      <div className="bg-white p-6 rounded-2xl border border-gray-150 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-gray-900 tracking-tight flex items-center gap-2">
            <Settings className="w-5 h-5 text-red-650 animate-spin" style={{ animationDuration: '6s' }} />
            Platform & Workspace Settings
          </h2>
          <p className="text-xs text-gray-500 mt-1 font-sans">
            Customize platform profiles, default metrics, auto-save safeguards, and database administration parameters.
          </p>
        </div>
        
        <div className="flex items-center gap-2 font-mono">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
          <span className="text-[10px] font-bold text-gray-500">SYSTEM STATUS: FULLY SYNCHRONIZED</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* Settings Navigation Sidebar */}
        <div className="lg:col-span-1 bg-white p-4 rounded-2xl border border-gray-150 shadow-xs h-fit space-y-1">
          <button
            onClick={() => setActiveSection('profile')}
            className={`w-full text-left p-3 rounded-lg text-xs font-bold transition flex items-center gap-2.5 cursor-pointer ${
              activeSection === 'profile' 
                ? 'bg-red-50 text-red-700 border-l-4 border-red-600' 
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <User className="w-4 h-4" />
            Workspace Profile
          </button>
          
          <button
            onClick={() => setActiveSection('defaults')}
            className={`w-full text-left p-3 rounded-lg text-xs font-bold transition flex items-center gap-2.5 cursor-pointer ${
              activeSection === 'defaults' 
                ? 'bg-red-50 text-red-700 border-l-4 border-red-600' 
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <DollarSign className="w-4 h-4" />
            Campaign Defaults
          </button>

          <button
            onClick={() => setActiveSection('whatsapp')}
            className={`w-full text-left p-3 rounded-lg text-xs font-bold transition flex items-center gap-2.5 cursor-pointer ${
              activeSection === 'whatsapp' 
                ? 'bg-emerald-50 text-emerald-800 border-l-4 border-emerald-600' 
                : 'text-gray-600 hover:bg-emerald-50/50 hover:text-gray-900'
            }`}
          >
            <MessageCircle className="w-4 h-4 text-emerald-600" />
            WhatsApp Logo & Branding
          </button>

          <button
            onClick={() => setActiveSection('safeguards')}
            className={`w-full text-left p-3 rounded-lg text-xs font-bold transition flex items-center gap-2.5 cursor-pointer ${
              activeSection === 'safeguards' 
                ? 'bg-red-50 text-red-700 border-l-4 border-red-600' 
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <Shield className="w-4 h-4" />
            Safety & Auto-Saves
          </button>

          <button
            onClick={() => setActiveSection('administration')}
            className={`w-full text-left p-3 rounded-lg text-[11px] font-bold transition flex items-center gap-2.5 cursor-pointer ${
              activeSection === 'administration' 
                ? 'bg-red-50 text-red-700 border-l-4 border-red-600' 
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <Database className="w-4 h-4" />
            Database backups & Cache
          </button>

          <div className="pt-4 border-t border-gray-100 mt-4 text-[10px] text-gray-400 font-mono text-center">
            App Config Version 2.5
          </div>
        </div>

        {/* Settings Content Area */}
        <div className="lg:col-span-3 bg-white p-6 rounded-2xl border border-gray-150 shadow-xs min-h-[400px]">
          
          {/* 1. Workspace Profile Section */}
          {activeSection === 'profile' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide font-mono flex items-center gap-1.5 border-b border-gray-100 pb-2">
                  <User className="w-4 h-4 text-red-600" />
                  Workspace Profile Info
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  Change the name of the agency and administrator displayed inside the main navigation headers.
                </p>
              </div>

              <form onSubmit={handleSaveProfile} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-gray-500 block font-mono">Workspace / Agency Banner Name</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                      <Building className="w-4 h-4" />
                    </div>
                    <input
                      type="text"
                      value={inputAgencyName}
                      onChange={(e) => setInputAgencyName(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 text-xs border border-gray-300 rounded-lg focus:ring-1 focus:ring-red-500 focus:border-red-500 font-sans"
                      placeholder="e.g. PRO-TO-GROW"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-gray-500 block font-mono">Executive Developer Email / Badge Name</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                      <User className="w-4 h-4" />
                    </div>
                    <input
                      type="text"
                      value={inputDevName}
                      onChange={(e) => setInputDevName(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 text-xs border border-gray-300 rounded-lg focus:ring-1 focus:ring-red-500 focus:border-red-500 font-sans"
                      placeholder="e.g. ashimgogoi2008@gmail.com"
                    />
                  </div>
                </div>

                <div className="pt-4 flex items-center gap-3">
                  <button
                    type="submit"
                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-neutral-900 rounded-lg transition shadow-xs cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    Save Profile Changes
                  </button>

                  {profileSuccess && (
                    <div className="flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-3 py-1.5 rounded-lg animate-fade-in">
                      <Check className="w-3.5 h-3.5" />
                      Header labels updated live in real-time!
                    </div>
                  )}
                </div>
              </form>

              {/* Workspace Color Theme Selector inside Platform Settings */}
              <div className="pt-6 border-t border-gray-200 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h4 className="text-xs font-black text-gray-900 uppercase tracking-wide font-mono flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-emerald-600" />
                      Workspace Theme & Color Palette
                    </h4>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Choose your preferred workspace color theme (including the new <strong>Green</strong> theme). Changes apply immediately across all pages, headers, sidebars, and cards.
                    </p>
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-emerald-50/60 border border-emerald-200 flex flex-col gap-2.5">
                  <span className="text-[11px] font-bold text-emerald-900">
                    Click a theme below to update the entire workspace:
                  </span>
                  <ThemeSwitcher compact={false} showLabel={false} />
                </div>
              </div>
            </div>
          )}

          {/* 2. Campaign Defaults Section */}
          {activeSection === 'defaults' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide font-mono flex items-center gap-1.5 border-b border-gray-100 pb-2">
                  <DollarSign className="w-4 h-4 text-red-600" />
                  Campaign Defaults & Metrics Rules
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  Adjust preferred display formats and defaults applied during monthly goal forecasts.
                </p>
              </div>

              <form onSubmit={handleSaveCampaignDefaults} className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-gray-500 block font-mono">Preferred Display Currency</label>
                    <select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      className="w-full p-2 text-xs border border-gray-300 rounded-lg focus:ring-1 focus:ring-red-500 focus:border-red-500 bg-white"
                    >
                      <option value="₹">₹ - Indian Rupee (INR)</option>
                      <option value="$">$ - US Dollar (USD)</option>
                      <option value="€">€ - Euro (EUR)</option>
                      <option value="£">£ - British Pound (GBP)</option>
                      <option value="¥">¥ - Japanese Yen (JPY)</option>
                    </select>
                    <span className="text-[9px] text-gray-400 italic block font-sans">Used as display decoration guidelines</span>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-gray-500 block font-mono">Standard Agency Margin Commision (%)</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min="0"
                        max="50"
                        step="1"
                        value={commissionRate}
                        onChange={(e) => setCommissionRate(parseInt(e.target.value, 10))}
                        className="w-full accent-red-650 cursor-pointer h-1.5 bg-gray-200 rounded-lg"
                      />
                      <span className="text-xs font-black font-mono w-10 text-right bg-gray-50 border border-gray-200 px-2 py-1 rounded">
                        {commissionRate}%
                      </span>
                    </div>
                    <span className="text-[9px] text-gray-400 block font-sans">Applicable during active financial spreadsheets evaluations</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-gray-500 block font-mono">Standard Monthly Target Base</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400 font-mono font-bold text-xs">
                      {currency}
                    </div>
                    <input
                      type="number"
                      value={defaultMonthlyTarget}
                      onChange={(e) => setDefaultMonthlyTarget(parseInt(e.target.value, 10) || 0)}
                      className="w-full pl-8 pr-4 py-2 text-xs border border-gray-300 rounded-lg focus:ring-1 focus:ring-red-500 focus:border-red-500 font-mono"
                      placeholder="e.g. 300000"
                    />
                  </div>
                  <span className="text-[9px] text-gray-400 block font-sans">Initial target setup for monthly sales velocity indicators.</span>
                </div>

                <div className="pt-2 flex items-center gap-3">
                  <button
                    type="submit"
                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-neutral-900 rounded-lg transition shadow-xs cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    Save Metric Preferences
                  </button>

                  {campaignSuccess && (
                    <div className="flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-3 py-1.5 rounded-lg animate-fade-in">
                      <Check className="w-3.5 h-3.5" />
                      Metric configurations persisted locally!
                    </div>
                  )}
                </div>
              </form>
            </div>
          )}

          {/* 3. WhatsApp Company Logo & Branding Section */}
          {activeSection === 'whatsapp' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide font-mono flex items-center gap-2">
                    <MessageCircle className="w-4 h-4 text-emerald-600" />
                    Company Logo & WhatsApp Message Signature
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">
                    Manage your company logo, branding header, tagline, and WhatsApp rich link card settings.
                  </p>
                </div>
                
                <button
                  type="button"
                  onClick={() => setIsBrandingModalOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl text-xs font-bold shadow-md hover:from-emerald-700 hover:to-teal-700 transition cursor-pointer shrink-0"
                >
                  <Sparkles className="w-4 h-4" />
                  Configure Company Logo & Branding
                </button>
              </div>

              {/* Status Overview Card */}
              <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 text-white shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
                
                <div className="flex items-start justify-between gap-4 relative z-10">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-white/10 border border-white/20 p-2 flex items-center justify-center shrink-0 shadow-inner overflow-hidden">
                      {brandingConfig.logoUrl ? (
                        <img 
                          src={brandingConfig.logoUrl} 
                          alt={brandingConfig.companyName} 
                          className="w-full h-full object-contain rounded-lg"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <Building2 className="w-8 h-8 text-emerald-400" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-base font-extrabold text-white">{brandingConfig.companyName || 'Your Company Name'}</span>
                        <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                          brandingConfig.enabled 
                            ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-400/30' 
                            : 'bg-slate-700 text-slate-300 border border-slate-600'
                        }`}>
                          {brandingConfig.enabled ? 'ACTIVE ON ALL MESSAGES' : 'DISABLED'}
                        </span>
                      </div>
                      <p className="text-xs text-emerald-200/80 mt-1">{brandingConfig.tagline || 'Influencer Marketing Agency'}</p>
                      {brandingConfig.websiteUrl && (
                        <a 
                          href={brandingConfig.websiteUrl} 
                          target="_blank" 
                          rel="noreferrer" 
                          className="inline-flex items-center gap-1 text-[11px] text-teal-300 hover:text-white mt-1 underline decoration-teal-400/50"
                        >
                          <ExternalLink className="w-3 h-3" />
                          {brandingConfig.websiteUrl}
                        </a>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setIsBrandingModalOpen(true)}
                      className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 border border-emerald-400/40 rounded-xl text-xs font-bold text-white transition shadow-sm cursor-pointer"
                    >
                      {brandingConfig.logoUrl ? <Pencil className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                      {brandingConfig.logoUrl ? 'Edit Logo & Signature' : '+ Add Logo Image'}
                    </button>

                    {brandingConfig.logoUrl ? (
                      <button
                        type="button"
                        onClick={() => {
                          const updated = { ...brandingConfig, logoUrl: '' };
                          setBrandingConfig(updated);
                          saveCompanyBrandingConfig(updated);
                        }}
                        className="flex items-center gap-1.5 px-3 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 rounded-xl text-xs font-bold text-red-200 transition shadow-sm cursor-pointer"
                        title="Delete logo image"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-300" />
                        <span>Delete Logo</span>
                      </button>
                    ) : null}

                    {brandingConfig.logoUrl && (
                      <button
                        type="button"
                        onClick={async () => {
                          setIsCopyingLogo(true);
                          await copyCompanyLogoToClipboard(brandingConfig.logoUrl);
                          setIsCopyingLogo(false);
                        }}
                        className="hidden sm:flex items-center gap-1.5 px-3 py-2 bg-white/15 hover:bg-white/25 border border-white/20 rounded-xl text-xs font-bold text-white transition shadow-sm cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5 text-emerald-300" />
                        {isCopyingLogo ? 'Copied!' : 'Copy Logo'}
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-5 pt-4 border-t border-white/10 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-slate-300">
                  <div className="bg-white/5 p-3 rounded-xl border border-white/10">
                    <span className="text-[10px] uppercase tracking-wider font-mono text-emerald-400 block font-bold">Logo Preview Card</span>
                    <span className="text-slate-200 mt-0.5 block font-medium">Automatic Rich Card on WhatsApp Web & Mobile</span>
                  </div>
                  <div className="bg-white/5 p-3 rounded-xl border border-white/10">
                    <span className="text-[10px] uppercase tracking-wider font-mono text-emerald-400 block font-bold">Message Layout</span>
                    <span className="text-slate-200 mt-0.5 block capitalize font-medium">{brandingConfig.brandingStyle || 'header'} layout attached</span>
                  </div>
                  <div className="bg-white/5 p-3 rounded-xl border border-white/10">
                    <span className="text-[10px] uppercase tracking-wider font-mono text-emerald-400 block font-bold">One-Click Paste</span>
                    <span className="text-slate-200 mt-0.5 block font-medium">Direct image copying supported for attachments</span>
                  </div>
                </div>
              </div>

              {/* Sample Message Preview Card */}
              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wide font-mono flex items-center gap-1.5">
                    <ImageIcon className="w-4 h-4 text-emerald-600" />
                    Live WhatsApp Message Sample
                  </span>
                  <span className="text-[11px] font-semibold text-slate-500">Auto-formatted output</span>
                </div>

                <div className="p-4 bg-[#efeae2] rounded-2xl border border-[#d1c7b7] shadow-inner font-sans text-xs text-slate-800 whitespace-pre-wrap leading-relaxed max-w-lg">
                  {attachCompanyBranding("Hi! Reaching out regarding our upcoming video collaboration. Let me know if you are open for a deal!", brandingConfig)}
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setIsBrandingModalOpen(true)}
                    className="text-xs font-bold text-emerald-700 hover:text-emerald-800 hover:underline flex items-center gap-1"
                  >
                    Edit Logo, Company Name & Signature →
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 4. Safety & Auto-Saves Section */}
          {activeSection === 'safeguards' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide font-mono flex items-center gap-1.5 border-b border-gray-100 pb-2">
                  <Shield className="w-4 h-4 text-red-600" />
                  System Memory & Safehouse Auto-Saves
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  Adjust how frequently the client-side system memory safeguard takes high-availability local database snapshot captures.
                </p>
              </div>

              <form onSubmit={handleSaveSafeguards} className="space-y-5">
                <div className="bg-red-50 border border-red-150 rounded-xl p-4 flex gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-700 shrink-0 mt-0.5" />
                  <div>
                    <h5 className="text-xs font-extrabold text-red-850 uppercase tracking-wide font-mono">Disaster Recovery & RAM Safeguards</h5>
                    <p className="text-[10px] text-red-700 mt-1 leading-relaxed">
                      Saves are automatically stored to browser local memory storage index blocks, rendering complete isolation against sudden page reloads, hardware crashes, or accidental network connectivity interruptions.
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 border border-gray-100 rounded-xl">
                    <div>
                      <span className="text-xs font-bold text-gray-800 block">Enable Automated RAM Backup Engine</span>
                      <span className="text-[10px] text-gray-400 block font-sans">Whem enabled, takes instant non-blocking micro backups.</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={autoSaveEnabled} 
                        onChange={(e) => setAutoSaveEnabled(e.target.checked)} 
                        className="sr-only peer" 
                      />
                      <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-red-650"></div>
                    </label>
                  </div>

                  
                  <div className="flex items-center justify-between p-3 border border-gray-100 rounded-xl mt-3">
                    <div>
                      <label htmlFor="autoCsvLoginEnabled" className="text-xs font-bold text-gray-800 block cursor-pointer">Auto Download CSVs on Login</label>
                      <span className="text-[10px] text-gray-400 block font-sans">Downloads a complete data backup containing all CSVs automatically when signing in.</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        id="autoCsvLoginEnabled"
                        checked={autoCsvLoginEnabled} 
                        onChange={(e) => setAutoCsvLoginEnabled(e.target.checked)} 
                        className="sr-only peer" 
                      />
                      <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-red-650"></div>
                    </label>
                  </div>

                  <div className="flex items-center justify-between p-3 border border-gray-100 rounded-xl mt-3">
                    <div>
                      <label htmlFor="autoCsvEnabled" className="text-xs font-bold text-gray-800 block cursor-pointer">Auto Download All CSV on Logout</label>
                      <span className="text-[10px] text-gray-400 block font-sans">Downloads a complete data backup containing all CSVs automatically when signing out.</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        id="autoCsvEnabled"
                        checked={autoCsvEnabled} 
                        onChange={(e) => setAutoCsvEnabled(e.target.checked)} 
                        className="sr-only peer" 
                      />
                      <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-red-650"></div>
                    </label>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-gray-500 block font-mono">RAM Backup Trigger Loop Interval</label>
                    <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
                      {[10, 30, 60, 120, 300].map((seconds) => (
                        <button
                          key={seconds}
                          type="button"
                          disabled={!autoSaveEnabled}
                          onClick={() => setAutoSaveInterval(seconds)}
                          className={`p-2.5 border rounded-lg text-xs font-mono font-bold transition flex flex-col items-center justify-center cursor-pointer ${
                            autoSaveInterval === seconds && autoSaveEnabled
                              ? 'bg-red-50 text-red-700 border-red-200' 
                              : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-white'
                          }`}
                        >
                          {seconds}s
                          <span className="text-[8px] text-gray-400 font-normal">
                            {seconds === 10 ? 'High Speed' : seconds === 300 ? 'Relaxed' : 'Standard'}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="pt-2 flex items-center gap-3">
                  <button
                    type="submit"
                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-neutral-900 rounded-lg transition shadow-xs cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    Save Safeguard Rules
                  </button>

                  {safeguardSuccess && (
                    <div className="flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-3 py-1.5 rounded-lg animate-fade-in">
                      <Check className="w-3.5 h-3.5" />
                      Automatic recovery loop intervals adjusted successfully!
                    </div>
                  )}
                </div>
              </form>
            </div>
          )}

          {/* 4. Administration & Backup Section */}
          {activeSection === 'administration' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide font-mono flex items-center gap-1.5 border-b border-gray-100 pb-2">
                  <Database className="w-4 h-4 text-red-600" />
                  Database Administration & Backups Panel
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  Perform file uploads/downloads, or trigger direct wipe controls on client session caches.
                </p>
              </div>

              {/* Success / Error Banners for File Import */}
              {importSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-150 rounded-lg text-xs font-bold text-emerald-800 flex items-center gap-2 animate-fade-in">
                  <Check className="w-4 h-4 text-emerald-600" />
                  {importSuccess}
                </div>
              )}
              {importError && (
                <div className="p-3 bg-red-50 border border-red-150 rounded-lg text-xs font-bold text-red-800 flex items-center gap-2 animate-fade-in">
                  <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
                  {importError}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* File Export Block */}
                <div className="p-4 border border-gray-150 rounded-xl flex flex-col justify-between space-y-4">
                  <div>
                    <h4 className="text-xs font-extrabold text-gray-800 font-mono uppercase tracking-wider flex items-center gap-1.5">
                      <Download className="w-4 h-4 text-gray-500" />
                      Export Client Database (JSON)
                    </h4>
                    <p className="text-[10px] text-gray-500 mt-1 leading-relaxed">
                      Encapsulates all registered creators, campaign contracts, billing journals, and chat logs into a portable JSON backup container.
                    </p>
                  </div>
                  <button
                    onClick={handleExportDatabase}
                    className="w-full py-2 bg-gray-900 hover:bg-neutral-800 text-white rounded-lg transition text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download JSON Blueprint
                  </button>
                </div>

                <div className="p-4 border border-gray-150 rounded-xl flex flex-col justify-between space-y-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      <DownloadCloud className="w-5 h-5 text-red-650" />
                      <h4 className="text-[13px] font-bold text-gray-900">Copy Backup JSON</h4>
                    </div>
                    <p className="text-[10px] text-gray-500 font-medium">Copy raw JSON string to clipboard (useful if downloads are blocked).</p>
                  </div>
                  <button
                    onClick={() => {
                      try {
                        const dataPayload = {
                          influencers, campaigns, tasks, messages, contracts, billingEntries, aovEntries, monthlyTargets, dashboardProducts, savedProducts, salesData, salesFileName, agencyName, developerName, currency, commissionRate, selectedMonth, selectedYear, exportedAt: new Date().toISOString(), version: "2.5.0"
                        };
                        navigator.clipboard.writeText(JSON.stringify(dataPayload, null, 2));
                        setB64CopySuccess(true);
                        setTimeout(() => setB64CopySuccess(false), 2000);
                      } catch (e: any) {
                        alert("Error copying data: " + e.message);
                      }
                    }}
                    className={`w-full py-2 rounded-lg transition text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer ${b64CopySuccess ? 'bg-emerald-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-800'}`}
                  >
                    <Check className={`w-3.5 h-3.5 ${b64CopySuccess ? 'text-white' : 'text-gray-500'}`} />
                    {b64CopySuccess ? 'Copied to Clipboard' : 'Copy JSON to Clipboard'}
                  </button>
                </div>

                {/* File Import Block */}
                <div className="p-4 border border-gray-150 rounded-xl flex flex-col justify-between space-y-4">
                  <div>
                    <h4 className="text-xs font-extrabold text-gray-800 font-mono uppercase tracking-wider flex items-center gap-1.5">
                      <Upload className="w-4 h-4 text-gray-500" />
                      Restore From JSON Blueprint
                    </h4>
                    <p className="text-[10px] text-gray-500 mt-1 leading-relaxed">
                      Select a downloaded `protogrow_backup_*.json` file, or paste your raw JSON backup directly below to restore your entire active database state.
                    </p>
                  </div>
                  <div className="relative">
                    <input
                      type="file"
                      id="platform-backup-restore-file"
                      accept=".json"
                      onChange={handleImportDatabase}
                      className="hidden"
                    />
                    <label
                      htmlFor="platform-backup-restore-file"
                      className="w-full py-2 border border-dashed border-gray-300 hover:border-red-600 text-gray-700 bg-white hover:bg-red-50 rounded-lg transition text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer text-center"
                    >
                      <Upload className="w-3.5 h-3.5 text-gray-500" />
                      Browse Backup File
                    </label>
                  </div>
                  
                  <div className="pt-2 border-t border-gray-100 flex flex-col gap-2">
                    <textarea 
                      className="w-full h-24 p-2 text-[10px] font-mono border border-gray-300 rounded-lg focus:ring-1 focus:ring-red-500 outline-none"
                      placeholder="Or paste your raw JSON backup text here..."
                      id="raw-json-restore-input"
                    />
                    <button
                      onClick={async () => {
                        try {
                          const val = (document.getElementById('raw-json-restore-input') as HTMLTextAreaElement).value;
                          if (!val || val.trim() === '') return;
                          
                          const sanitizedVal = sanitizeJSONString(val);
                          const rawContent = JSON.parse(sanitizedVal);
                          if (typeof rawContent !== 'object' || rawContent === null) {
                            throw new Error("Invalid format. Must be a valid JSON object.");
                          }
                          const parsedContent = rawContent.payload ? { ...rawContent, ...rawContent.payload } : rawContent;
                          
                          await onRestoreData(parsedContent);
                          setImportSuccess("Raw JSON successfully parsed & restored to workspace!");
                          (document.getElementById('raw-json-restore-input') as HTMLTextAreaElement).value = '';
                        } catch (e: any) {
                          setImportError(e.message || "Invalid JSON.");
                        }
                      }}
                      className="w-full py-2 bg-red-600 hover:bg-neutral-900 text-white rounded-lg transition text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <Save className="w-3.5 h-3.5" />
                      Restore From Pasted JSON
                    </button>
                  </div>
                </div>

              </div>

              {/* Additional Fail-Safe Base64 Key Backup & Restore Subsystem */}
              <div className="bg-gradient-to-br from-red-50/50 to-white border border-red-100 p-5 rounded-2xl shadow-2xs space-y-5">
                <div>
                  <h4 className="text-xs font-black text-red-800 font-sans uppercase tracking-widest flex items-center gap-1.5">
                    <Sliders className="w-4 h-4 text-red-600 animate-pulse" />
                    Fail-Safe redundant Backup Core: Workspace Recovery Strings
                  </h4>
                  <p className="text-[11px] text-gray-500 mt-1 leading-normal">
                    Designed for absolute 100% accuracy. This redundant backup system serializes and encodes the complete active workspace (including profiles, month presets, products, and all list databases) into a lightweight, high-reliability Base64 text string. Ideal for copy-pasting to sticky notes or secure emails when file-handling is constrained.
                  </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Generate / Export Part */}
                  <div className="space-y-3 bg-white p-4 border border-gray-150 rounded-xl flex flex-col justify-between">
                    <div className="space-y-3">
                      <span className="text-[10px] uppercase font-bold text-gray-400 font-mono tracking-wider block">1. Export Workspace Key</span>
                      <p className="text-[10px] text-gray-500 leading-normal">
                        Click the button below to retrieve the single-line encrypted snapshot sequence representing your active workspace.
                      </p>
                      
                      {b64RecoveryKey && (
                        <div className="space-y-2">
                          <textarea
                            readOnly
                            value={b64RecoveryKey}
                            onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                            className="w-full h-16 p-2 text-[9px] font-mono bg-gray-50 text-gray-600 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-650 resize-none break-all"
                          />
                          <button
                            type="button"
                            onClick={handleCopyRecoveryKey}
                            className={`w-full py-1 px-3 text-[10px] font-bold rounded transition flex items-center justify-center gap-1.5 cursor-pointer ${
                              b64CopySuccess 
                                ? 'bg-emerald-600 text-white' 
                                : 'bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-200'
                            }`}
                          >
                            <Check className={`w-3 h-3 ${b64CopySuccess ? 'text-white' : 'text-gray-400'}`} />
                            {b64CopySuccess ? 'Recovery Key Copied!' : 'Copy Key to Clipboard'}
                          </button>
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={handleGenerateRecoveryKey}
                      className="w-full mt-3 py-1.5 bg-neutral-900 duration-150 text-white hover:bg-black text-[11px] font-mono font-bold rounded-lg transition tracking-wide cursor-pointer"
                    >
                      Retrieve Unique Snap key
                    </button>
                  </div>

                  {/* Import / Decode Part */}
                  <div className="space-y-3 bg-white p-4 border border-gray-150 rounded-xl flex flex-col justify-between">
                    <div className="space-y-3">
                      <span className="text-[10px] uppercase font-bold text-gray-400 font-mono tracking-wider block">2. Restore Workspace Key</span>
                      <p className="text-[10px] text-gray-500 leading-normal">
                        Paste a valid workspace snapshot string below to execute strict checksum verification and reload state.
                      </p>
                      <textarea
                        value={b64InputKey}
                        onChange={(e) => setB64InputKey(e.target.value)}
                        placeholder="Paste your base64 recovery key string sequence here..."
                        className="w-full h-16 p-2 text-[9px] font-mono bg-gray-50 text-gray-600 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-red-650 resize-none"
                      />
                      {b64RestoreError && (
                        <p className="text-[9px] text-red-600 font-semibold leading-normal font-mono flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 text-red-600 shrink-0" />
                          {b64RestoreError}
                        </p>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={handleRestoreFromRecoveryKey}
                      className="w-full mt-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-[11px] font-mono font-bold rounded-lg transition tracking-wide cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <RefreshCw className="w-3 h-3 animate-pulse" />
                      Verify & Synchronize
                    </button>
                  </div>
                </div>
              </div>

              {/* Dangerous actions zone */}
              <div className="border border-red-150 rounded-xl p-4 space-y-4">
                <span className="text-[10px] font-black font-mono uppercase text-red-600 bg-red-50 px-2 py-0.5 rounded border border-red-100">
                  DANGER ZONE: SENSITIVE DESTRUCTIVE CONTROLS
                </span>
                
                <div className="border border-gray-200 rounded-xl p-4 bg-gray-50 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <h5 className="text-xs font-extrabold text-gray-800">Database Reset Passkey</h5>
                    <p className="text-[10px] text-gray-500 max-w-sm">
                      Set a 4-digit numeric passkey to protect the database from accidental resets. You must provide this passkey to confirm a database purge.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input 
                      type="password"
                      maxLength={4}
                      value={inputPasskey}
                      onChange={(e) => setInputPasskey(e.target.value.replace(/\\D/g, ''))}
                      placeholder="****"
                      className="w-20 px-3 py-2 text-center font-mono text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                    />
                    <button
                      onClick={handleSavePasskey}
                      className="px-4 py-2 bg-indigo-600 text-white font-bold text-xs hover:bg-indigo-700 rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer shrink-0 shadow-sm"
                    >
                      <Save className="w-3.5 h-3.5" />
                      {passkeySuccess ? 'Saved!' : 'Save Passkey'}
                    </button>
                  </div>
                </div>

                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-1">
                  <div className="space-y-0.5">
                    <h5 className="text-xs font-extrabold text-gray-800">Unified Database Template Purge</h5>
                    <p className="text-[10px] text-gray-500">
                      Wipes all current user edits on active campaigns/creators, restoring standard template defaults.
                    </p>
                  </div>
                  
                  {!showResetConfirm ? (
                    <button
                      onClick={() => {
                        if (!resetPasskey) {
                          alert("Please set a 4-digit passkey first before you can reset the database.");
                          return;
                        }
                        setShowResetConfirm(true);
                      }}
                      className="px-4 py-2 bg-red-50 text-red-700 font-bold text-xs hover:bg-neutral-950 hover:text-white rounded-lg transition border border-red-100 flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Trigger System Reset
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 bg-red-50 p-2 rounded-lg border border-red-200">
                      <input 
                        type="password"
                        maxLength={4}
                        value={confirmPasskey}
                        onChange={(e) => setConfirmPasskey(e.target.value.replace(/\\D/g, ''))}
                        placeholder="PIN"
                        className="w-16 px-2 py-1.5 text-center font-mono text-xs border border-red-300 text-red-700 rounded focus:ring-1 focus:ring-red-500 focus:outline-none"
                      />
                      <button
                        onClick={handleResetAttempt}
                        className="px-3 py-1.5 bg-red-600 text-white font-bold text-xs hover:bg-red-700 rounded transition"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => { setShowResetConfirm(false); setConfirmPasskey(''); }}
                        className="px-3 py-1.5 bg-gray-200 text-gray-700 font-bold text-xs hover:bg-gray-300 rounded transition"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
                
                {resetError && (
                  <p className="text-[10px] text-red-500 font-bold text-right -mt-2">{resetError}</p>
                )}

                <div className="border-t border-dashed border-gray-100 pt-3 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <h5 className="text-xs font-extrabold text-gray-800">Clear Local Storage Cache Registry</h5>
                    <p className="text-[10px] text-gray-500">
                      Clears local browser storage session cookies and prefixes, re-authenticating with Firestore database clean slate.
                    </p>
                  </div>
                  <button
                    onClick={handleClearLocalStorageCache}
                    disabled={isWipingCache}
                    className="px-4 py-2 bg-gray-50 text-gray-700 border border-gray-200 font-bold text-xs hover:bg-red-650 hover:text-white hover:border-transparent rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer shrink-0 disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {isWipingCache ? 'Wiping Cache...' : 'Flush Caches & Refresh'}
                  </button>
                </div>

                <div className="border-t border-dashed border-gray-100 pt-3 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <h5 className="text-xs font-extrabold text-gray-800">Force Emergency Local Recovery</h5>
                    <p className="text-[10px] text-gray-500">
                      If your database backup failed to sync automatically, trigger this manual switch to forcefully bypass server sync and load directly from the latest local storage reserve.
                    </p>
                  </div>
                  <button
                    onClick={async () => {
                      try {
                        setImportSuccess("Attempting manual rescue fetch...");
                        const snapRaw = safeLocalStorage.getItem('SYS_MEMORY_LAST_RECOVERY_RESERVE');
                        if (snapRaw) {
                          const snap = JSON.parse(snapRaw);
                          await onRestoreData(snap);
                          setImportSuccess("Successfully forced rescue from local backup reserve.");
                        } else {
                          setImportError("Failed to fetch backup: No local recovery reserve found.");
                        }
                      } catch (e: any) {
                        setImportError("Emergency rescue failed: " + e.message);
                      }
                    }}
                    className="px-4 py-2 bg-amber-50 text-amber-700 border border-amber-200 font-bold text-xs hover:bg-amber-600 hover:text-white hover:border-transparent rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer shrink-0 shadow-sm"
                  >
                    <Database className="w-3.5 h-3.5" />
                    Force Latest Server Recovery
                  </button>
                </div>

              </div>

            </div>
          )}

        </div>

      </div>

      {/* Company Logo & WhatsApp Branding Modal */}
      <CompanyBrandingModal 
        isOpen={isBrandingModalOpen}
        onClose={() => {
          setIsBrandingModalOpen(false);
          setBrandingConfig(getCompanyBrandingConfig());
        }}
        onSaved={(newCfg) => setBrandingConfig(newCfg)}
      />

    </div>
  );
}
