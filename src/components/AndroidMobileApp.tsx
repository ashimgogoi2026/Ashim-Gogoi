import React, { useState, useEffect, useMemo } from 'react';
import { 
  Smartphone, Download, CheckCircle, Settings, Code, Terminal, ExternalLink, FileText, Check, AlertCircle, PlayCircle, Info, Database, Upload, Eye, MousePointerClick, CheckCircle2, FileArchive, Clock
} from 'lucide-react';
import { Influencer, Campaign, Task, Message, Contract, BillingEntry } from '../types';
import { type User } from 'firebase/auth';
import GoogleDriveSync from './GoogleDriveSync';
import MobileLiteCompletedApp from './MobileLiteCompletedApp';
import {
  buildMobileLiteSnapshot,
  downloadSignedAndroidApk,
  downloadStandaloneMobileHtmlApp,
  downloadCapacitorAndroidStudioZip
} from '../lib/apkGenerator';
import { globalToast } from '../lib/toast';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

interface AndroidMobileAppProps {
  influencers: Influencer[];
  campaigns: Campaign[];
  tasks: Task[];
  messages: Message[];
  contracts: Contract[];
  billingEntries: BillingEntry[];
  aovEntries?: any[];
  dashboardProducts?: any[];
  monthlyTargets?: any[];
  savedProducts?: string[];
  user: User | null;
  accessToken: string | null;
  onRestoreData: (restoredData: {
    influencers?: Influencer[];
    campaigns?: Campaign[];
    tasks?: Task[];
    messages?: Message[];
    contracts?: Contract[];
    billingEntries?: BillingEntry[];
  }) => void;
  onLoginSuccess: (currentUser: User, token: string) => void;
  onLogoutSuccess: () => void;
  onLaunchLiteMode?: () => void;
}

export default function AndroidMobileApp({
  influencers,
  campaigns,
  tasks,
  messages,
  contracts,
  billingEntries,
  aovEntries = [],
  dashboardProducts = [],
  monthlyTargets = [],
  savedProducts = [],
  user,
  accessToken,
  onRestoreData,
  onLoginSuccess,
  onLogoutSuccess,
  onLaunchLiteMode
}: AndroidMobileAppProps) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [activeSegment, setActiveSegment] = useState<'lite-apk' | 'pwa' | 'capacitor' | 'backup-restore'>('lite-apk');
  const [isGeneratingApk, setIsGeneratingApk] = useState(false);
  const [copyState, setCopyState] = useState<string | null>(null);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [restoreText, setRestoreText] = useState('');
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreSuccess, setRestoreSuccess] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const liteSnapshot = useMemo(
    () => buildMobileLiteSnapshot(tasks, influencers, 'PRO-TO-GROW'),
    [tasks, influencers]
  );

  const handleDownloadLiteApk = async () => {
    try {
      setIsGeneratingApk(true);
      globalToast.info('Building signed Android APK (Completed Video Tasks, Views & Clicks Only)...');
      const res = await downloadSignedAndroidApk(liteSnapshot);
      globalToast.success(
        `APK Downloaded: ${res.filename} (${Math.max(1, Math.round(res.sizeBytes / 1024))} KB)`
      );
    } catch (err: any) {
      globalToast.error('Failed to build APK: ' + (err?.message || 'Unknown error'));
    } finally {
      setIsGeneratingApk(false);
    }
  };

  useEffect(() => {
    // Listen for standard browser PWA install prompts
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    // Detect if app is launched in standalone mode (installed)
    if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone) {
      setIsInstalled(true);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    
    deferredPrompt.prompt();
    const choiceResult = await deferredPrompt.userChoice;
    
    if (choiceResult.outcome === 'accepted') {
      console.log('User accepted the install prompt');
      setIsInstalled(true);
      setDeferredPrompt(null);
    } else {
      console.log('User dismissed the install prompt');
    }
  };

  const handleCopyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopyState(id);
    setTimeout(() => setCopyState(null), 2500);
  };

  const capConfigCode = `import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.protogrow.completedtasks',
  appName: 'PTG Tasks & Views',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    // Locked to Completed Video Tasks, Views & Clicks Lite Mode
    url: '${window.location.origin}/?mode=apk-lite'
  }
};

export default config;`;

  const capCommands = `# 1. Install Capacitor core and mobile android packages
npm install @capacitor/core @capacitor/android
npm install -D @capacitor/cli

# 2. Build the production React assets inside dist/
npm run build

# 3. Initialize Capacitor app configuration
npx cap init "PTG Tasks & Views" "com.protogrow.completedtasks" --web-dir=dist

# 4. Add the Android Studio workspace directories
npx cap add android

# 5. Copy built assets & open Android Studio
npx cap sync
npx cap open android`;

  return (
    <div className="space-y-6">
      
      {/* Tab/Segment Controls */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between border-b border-gray-200 pb-4 gap-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-emerald-600" />
            Downloadable Android APK — Completed Video Tasks, Views & Clicks
          </h2>
          <p className="text-xs text-gray-500">
            Download the dedicated Android APK version that displays strictly Completed Video Tasks, Video Views, and Link Clicks only.
          </p>
        </div>
        
        <div className="inline-flex flex-wrap rounded-lg border border-gray-200 p-1 bg-gray-50 gap-1">
          <button
            onClick={() => setActiveSegment('lite-apk')}
            className={`px-3 py-1.5 text-xs font-bold rounded-md transition flex items-center gap-1.5 cursor-pointer ${
              activeSegment === 'lite-apk'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            Completed Tasks Lite APK
          </button>
          <button
            onClick={() => setActiveSegment('pwa')}
            className={`px-3 py-1.5 text-xs font-bold rounded-md transition cursor-pointer ${
              activeSegment === 'pwa'
                ? 'bg-red-600 text-white shadow-xs'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            PWA Instant Launcher
          </button>
          <button
            onClick={() => setActiveSegment('capacitor')}
            className={`px-3 py-1.5 text-xs font-bold rounded-md transition cursor-pointer ${
              activeSegment === 'capacitor'
                ? 'bg-red-600 text-white shadow-xs'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            Compile Native APK (Capacitor)
          </button>
          <button
            onClick={() => setActiveSegment('backup-restore')}
            className={`px-3 py-1.5 text-xs font-bold rounded-md transition flex items-center gap-1.5 cursor-pointer ${
              activeSegment === 'backup-restore'
                ? 'bg-red-600 text-white shadow-xs'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            <Database className="w-3.5 h-3.5" /> Backup & Restore
          </button>
        </div>
      </div>

      {activeSegment === 'lite-apk' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Direct APK Download & Package Controls */}
          <div className="lg:col-span-7 space-y-5">
            <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950 text-white rounded-2xl p-6 border border-emerald-500/30 shadow-xl space-y-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center text-slate-950 font-black text-base shadow-lg shadow-emerald-500/20">
                    APK
                  </div>
                  <div>
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-[10px] font-black uppercase tracking-wider">
                      <CheckCircle2 className="w-3 h-3" /> Read-Only Executive Lite Edition
                    </span>
                    <h3 className="text-lg font-black tracking-tight text-white mt-1">
                      PTG Completed Video Tasks, Views & Clicks APK
                    </h3>
                    <p className="text-xs text-slate-300">
                      Package ID: <code className="text-emerald-300 font-mono">com.protogrow.completedtasks</code> • Version 1.0.0
                    </p>
                  </div>
                </div>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">
                This lightweight mobile edition strips out all billing ledgers, editing forms, and admin menus — showing <strong>Completed Video Tasks, Number of Awaiting Uploads (with Influencer Name & Product), Video Views, and Link Clicks</strong>. It comes pre-loaded with your live workspace data so you can view everything immediately on your phone.
              </p>

              {/* Embedded Snapshot Summary Counters */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-950/70 border border-emerald-500/30 rounded-xl p-3">
                  <div className="flex items-center justify-between text-emerald-400 text-[10px] font-black uppercase">
                    <span>Completed</span>
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div className="text-xl font-black text-white mt-1">
                    {liteSnapshot.totalCompletedTasks.toLocaleString('en-IN')}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    {liteSnapshot.totalVideoLinks.toLocaleString('en-IN')} uploaded links
                  </div>
                </div>

                <div className="bg-slate-950/70 border border-rose-500/30 rounded-xl p-3">
                  <div className="flex items-center justify-between text-rose-400 text-[10px] font-black uppercase">
                    <span>Awaiting Upload</span>
                    <Clock className="w-4 h-4" />
                  </div>
                  <div className="text-xl font-black text-white mt-1">
                    {liteSnapshot.totalAwaitingUploads.toLocaleString('en-IN')}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    Creator & Product list
                  </div>
                </div>

                <div className="bg-slate-950/70 border border-cyan-500/30 rounded-xl p-3">
                  <div className="flex items-center justify-between text-cyan-400 text-[10px] font-black uppercase">
                    <span>Total Views</span>
                    <Eye className="w-4 h-4" />
                  </div>
                  <div className="text-xl font-black text-white mt-1">
                    {liteSnapshot.totalViews.toLocaleString('en-IN')}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    IG, FB & YouTube
                  </div>
                </div>

                <div className="bg-slate-950/70 border border-amber-500/30 rounded-xl p-3">
                  <div className="flex items-center justify-between text-amber-400 text-[10px] font-black uppercase">
                    <span>Total Clicks</span>
                    <MousePointerClick className="w-4 h-4" />
                  </div>
                  <div className="text-xl font-black text-white mt-1">
                    {liteSnapshot.totalClicks.toLocaleString('en-IN')}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    {liteSnapshot.overallCtrPercent}% overall CTR
                  </div>
                </div>
              </div>

              {/* Primary Download Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleDownloadLiteApk}
                  disabled={isGeneratingApk}
                  className="py-3.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 transition cursor-pointer disabled:opacity-50"
                >
                  <Download className="w-4 h-4 stroke-[2.5]" />
                  <span>
                    {isGeneratingApk
                      ? 'Building Signed .APK...'
                      : 'Download Android APK (.apk)'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (onLaunchLiteMode) {
                      onLaunchLiteMode();
                    } else {
                      const url = new URL(window.location.href);
                      url.searchParams.set('mode', 'apk-lite');
                      window.history.pushState({}, '', url.toString());
                      window.dispatchEvent(new PopStateEvent('popstate'));
                    }
                  }}
                  className="py-3.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <Smartphone className="w-4 h-4 text-cyan-400" />
                  <span>Open Full-Screen Lite App</span>
                </button>
              </div>

              {/* Secondary Offline HTML & Android Studio Project Downloads */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    downloadStandaloneMobileHtmlApp(liteSnapshot);
                    globalToast.success('Downloaded standalone offline Mobile App (.html)');
                  }}
                  className="py-2.5 px-3 rounded-xl bg-slate-950/80 hover:bg-slate-900 border border-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <FileText className="w-4 h-4 text-emerald-400" />
                  <span>Download Offline Mobile App (.html)</span>
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    await downloadCapacitorAndroidStudioZip(liteSnapshot);
                    globalToast.success('Downloaded Capacitor Android Studio APK Project (.zip)');
                  }}
                  className="py-2.5 px-3 rounded-xl bg-slate-950/80 hover:bg-slate-900 border border-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <FileArchive className="w-4 h-4 text-amber-400" />
                  <span>Download Android Studio Project (.zip)</span>
                </button>
              </div>
            </div>

            {/* What's Inside the Lite APK Card */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3 shadow-xs">
              <h4 className="text-sm font-black text-gray-900 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                What Is Included in This APK Version
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200">
                  <div className="font-black text-emerald-900 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    1. Completed Tasks
                  </div>
                  <p className="text-[11px] text-emerald-800 mt-1">
                    Every completed video task with Creator Name, Product, Upload Date, Video ID, and direct Video 1/2/3 playback links.
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-rose-50/70 border border-rose-200">
                  <div className="font-black text-rose-900 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-rose-600" />
                    2. Awaiting Uploads
                  </div>
                  <p className="text-[11px] text-rose-800 mt-1">
                    Total number of awaiting uploads, product-wise pending breakdown, Influencer Name, and assigned Product.
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-cyan-50/70 border border-cyan-200">
                  <div className="font-black text-cyan-900 flex items-center gap-1.5">
                    <Eye className="w-4 h-4 text-cyan-600" />
                    3. Video Views
                  </div>
                  <p className="text-[11px] text-cyan-800 mt-1">
                    Total views across Instagram, Facebook & YouTube plus top creator and video view rankings.
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200">
                  <div className="font-black text-amber-900 flex items-center gap-1.5">
                    <MousePointerClick className="w-4 h-4 text-amber-600" />
                    4. Link Clicks
                  </div>
                  <p className="text-[11px] text-amber-800 mt-1">
                    Total link clicks, verified human clicks, and Click-Through Rate (CTR %) per video and creator.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Live Interactive Phone Preview of the APK App */}
          <div className="lg:col-span-5">
            <div className="mb-2 flex items-center justify-between px-2">
              <span className="text-xs font-black uppercase tracking-wider text-gray-700 flex items-center gap-1.5">
                <Smartphone className="w-4 h-4 text-emerald-600" />
                Live Interactive APK Preview
              </span>
              <span className="text-[11px] text-emerald-600 font-bold">
                Completed • Awaiting • Views • Clicks
              </span>
            </div>
            <MobileLiteCompletedApp
              tasks={tasks}
              influencers={influencers}
              embeddedPreview={true}
            />
          </div>
        </div>
      ) : activeSegment === 'pwa' ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Main PWA Install Panel */}
          <div className="md:col-span-2 space-y-6">
            <div className="bg-gradient-to-br from-red-50 to-white border border-red-100 rounded-xl p-6 shadow-xs relative overflow-hidden">
              <div className="absolute right-0 bottom-0 translate-x-5 translate-y-5 opacity-5 pointer-events-none">
                <Smartphone className="w-64 h-64 text-red-650" />
              </div>

              <div className="flex items-start gap-4">
                <div className="p-3 bg-red-600 text-white rounded-xl shadow-md shrink-0">
                  <Smartphone className="w-8 h-8 stroke-[1.5]" />
                </div>
                <div>
                  <span className="inline-block px-2.5 py-0.5 bg-red-100 text-red-750 text-[10px] uppercase font-bold tracking-wider rounded-full mb-2">
                    Recommended Mobile Option
                  </span>
                  <h3 className="text-base font-bold text-gray-950">Install Instant PWA Launcher</h3>
                  <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                    Progressive Web Apps (PWAs) are the standard mechanism for packaged full-stack React applications on Android. It acts as an installed app shortcut, displays an immersive splash screen, hides browser UI, and retains full real-time access to the Cloud database and back-end live view scraper syncs!
                  </p>
                </div>
              </div>

              {/* Install Action Widget */}
              <div className="mt-6 pt-5 border-t border-red-100 flex flex-wrap items-center justify-between gap-4">
                <div>
                  {isInstalled ? (
                    <div className="flex items-center gap-1.5 text-emerald-600 text-xs font-bold">
                      <CheckCircle className="w-4 h-4" /> Installed / Standing Alone
                    </div>
                  ) : (
                    <div className="text-[11px] text-gray-500 font-mono">
                      ⭐ Status: <span className="text-red-650 font-bold">Ready to Add to Home Screen</span>
                    </div>
                  )}
                </div>

                {!isInstalled && deferredPrompt && (
                  <button
                    onClick={handleInstallClick}
                    className="px-4 py-2 bg-red-600 hover:bg-red-750 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-md"
                  >
                    <Download className="w-3.5 h-3.5" /> Install App on Device
                  </button>
                )}

                {!isInstalled && !deferredPrompt && (
                  <div className="text-xs text-gray-500 italic">
                    Open this URL in Google Chrome or Firefox on your Android phone to trigger instant installation.
                  </div>
                )}
              </div>
            </div>

            {/* Quick Android Installation Guide */}
            <div className="bg-white border border-gray-150 rounded-xl p-5 space-y-4">
              <h4 className="text-sm font-bold text-gray-950 flex items-center gap-1.5">
                <Info className="w-4 h-4 text-gray-450" /> 
                How to install on Android Devices (Chrome/Firefox)
              </h4>
              
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                  <div className="w-6 h-6 rounded-full bg-red-50 text-red-650 text-xs font-bold flex items-center justify-center mb-2 font-mono">1</div>
                  <h5 className="text-xs font-bold text-gray-800">Visit Workspace</h5>
                  <p className="text-[11px] text-gray-500 mt-0.5">Open the Development App URL using mobile <strong>Google Chrome</strong>.</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                  <div className="w-6 h-6 rounded-full bg-red-50 text-red-650 text-xs font-bold flex items-center justify-center mb-2 font-mono">2</div>
                  <h5 className="text-xs font-bold text-gray-800">Tap Browser Menu</h5>
                  <p className="text-[11px] text-gray-500 mt-0.5">Tap the <strong>three dots menu icon (⋮)</strong> at the top-right corner of Chrome.</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                  <div className="w-6 h-6 rounded-full bg-red-50 text-red-650 text-xs font-bold flex items-center justify-center mb-2 font-mono">3</div>
                  <h5 className="text-xs font-bold text-gray-800">Add to Home Screen</h5>
                  <p className="text-[11px] text-gray-500 mt-0.5">Select <strong>"Install app"</strong> or <strong>"Add to Home screen"</strong> to pin the APK.</p>
                </div>
              </div>
            </div>

          </div>

          {/* Side stats summary */}
          <div className="space-y-5">
            <div className="bg-white border border-gray-150 rounded-xl p-5 space-y-3">
              <h4 className="text-xs font-bold uppercase text-gray-400 font-mono tracking-widest">PWA Capabilities Table</h4>
              
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-xs pb-2 border-b border-gray-100">
                  <span className="text-gray-500">Android System Docking</span>
                  <span className="font-semibold text-emerald-600 flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Supported</span>
                </div>
                <div className="flex items-center justify-between text-xs pb-2 border-b border-gray-100">
                  <span className="text-gray-500">Custom Brand Splash Screen</span>
                  <span className="font-semibold text-emerald-600 flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Supported</span>
                </div>
                <div className="flex items-center justify-between text-xs pb-2 border-b border-gray-100">
                  <span className="text-gray-500">Full Screen standalone frame</span>
                  <span className="font-semibold text-emerald-600 flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Supported</span>
                </div>
                <div className="flex items-center justify-between text-xs pb-2 border-b border-gray-100">
                  <span className="text-gray-500">Offline Page Caching</span>
                  <span className="font-semibold text-emerald-600 flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Supported</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Live Scrapers / NodeJS proxy</span>
                  <span className="font-semibold text-emerald-600 flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Supported</span>
                </div>
              </div>
            </div>

            <div className="bg-gray-900 text-white rounded-xl p-5 space-y-2">
              <div className="flex items-center gap-1.5 text-xs text-red-400 font-bold font-mono">
                <AlertCircle className="w-3.5 h-3.5 text-red-500" /> NOTE FOR FULL-STACK
              </div>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                Because this influencer manager implements backend scraping engines to automatically monitor views and utilizes the Gemini API server-side, a simple local client-only APK would fail to run these dynamic microservices. PWA is highly recommended as it communicates perfectly with your production web container.
              </p>
            </div>
          </div>

        </div>
      ) : activeSegment === 'capacitor' ? (
        <div className="space-y-6">
          
          <div className="bg-amber-50/50 border border-amber-200 rounded-xl p-5 flex items-start gap-3.5">
            <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-xs font-bold text-amber-800 uppercase tracking-wider font-mono">Prerequisites to Compile a Native Android APK (.apk)</h4>
              <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                To compile an standalone <strong>.apk</strong> binary package local to your own device, you should register and coordinate assets via native <strong>Capacitor</strong>. A native APK must be compiled using <strong>Android Studio / Gradle</strong>, which you run on your native computer after pulling down this repository's source code files.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Capacitor setup guide */}
            <div className="lg:col-span-2 space-y-5">
              
              {/* Commands guide block */}
              <div className="bg-white border border-gray-150 rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                    <Terminal className="w-4 h-4 text-gray-450" />
                    Step 1: Install and sync Capacitor CLI locally
                  </h4>
                  <button
                    onClick={() => handleCopyCode(capCommands, 'commands')}
                    className="text-[11px] text-red-600 hover:text-red-750 font-bold flex items-center gap-1 px-2.5 py-1 rounded bg-red-50 hover:bg-red-100 transition cursor-pointer"
                  >
                    {copyState === 'commands' ? (
                      <><Check className="w-3 h-3 text-emerald-600" /> Copied</>
                    ) : (
                      <>Copy Terminal Script</>
                    )}
                  </button>
                </div>
                <p className="text-[11px] text-gray-500">Run the following commands inside the root directory of your project folder:</p>
                <div className="relative">
                  <pre className="bg-gray-950 text-gray-100 p-4 rounded-lg text-[10px] font-mono overflow-x-auto leading-relaxed max-h-60">
                    {capCommands}
                  </pre>
                </div>
              </div>

              {/* config template block */}
              <div className="bg-white border border-gray-150 rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                    <Code className="w-4 h-4 text-gray-450" />
                    Step 2: Define capacitor.config.ts config file
                  </h4>
                  <button
                    onClick={() => handleCopyCode(capConfigCode, 'config')}
                    className="text-[11px] text-red-600 hover:text-red-750 font-bold flex items-center gap-1 px-2.5 py-1 rounded bg-red-50 hover:bg-red-100 transition cursor-pointer"
                  >
                    {copyState === 'config' ? (
                      <><Check className="w-3 h-3 text-emerald-600" /> Copied</>
                    ) : (
                      <>Copy Code</>
                    )}
                  </button>
                </div>
                <p className="text-[11px] text-gray-500">Create a file named <code>capacitor.config.ts</code> in your project root and paste the configuration below:</p>
                <div className="relative">
                  <pre className="bg-gray-955 text-gray-200 p-4 rounded-lg text-[10px] font-mono overflow-x-auto leading-relaxed max-h-52">
                    {capConfigCode}
                  </pre>
                </div>
              </div>

            </div>

            {/* Android compiling helper instructions */}
            <div className="space-y-5">
              
              <div className="bg-white border border-gray-150 rounded-xl p-5 space-y-4">
                <h4 className="text-xs font-bold uppercase text-gray-400 font-mono tracking-widest flex items-center gap-1">
                  <PlayCircle className="w-4 h-4 text-red-600 animate-pulse" />
                  Step 3: Compiling the APK
                </h4>

                <div className="space-y-4">
                  <div className="flex gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-red-50 text-red-650 text-xs font-bold flex items-center justify-center shrink-0 font-mono">1</span>
                    <div className="text-xs">
                      <span className="font-bold text-gray-800">Launch Android Studio</span>
                      <p className="text-[11px] text-gray-500 mt-1">Capacitor automatically launches Android Studio for you when you run <code>npx cap open android</code>.</p>
                    </div>
                  </div>

                  <div className="flex gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-red-50 text-red-650 text-xs font-bold flex items-center justify-center shrink-0 font-mono">2</span>
                    <div className="text-xs">
                      <span className="font-bold text-gray-800">Wait for Gradle Build Sync</span>
                      <p className="text-[11px] text-gray-500 mt-1">Accept the automatic dependencies request and let early project configurations settle down.</p>
                    </div>
                  </div>

                  <div className="flex gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-red-50 text-red-650 text-xs font-bold flex items-center justify-center shrink-0 font-mono">3</span>
                    <div className="text-xs">
                      <span className="font-bold text-gray-800">Execute APK Compile</span>
                      <p className="text-[11px] text-gray-500 mt-1">Go to: <strong>Build</strong> inside the top application menu bar &rarr; Select <strong>Build Bundle(s) / APK(s)</strong> &rarr; Click <strong>Build APK(s)</strong>.</p>
                    </div>
                  </div>

                  <div className="flex gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-red-50 text-red-650 text-xs font-bold flex items-center justify-center shrink-0 font-mono">4</span>
                    <div className="text-xs">
                      <span className="font-bold text-gray-800">Locate and deploy</span>
                      <p className="text-[11px] text-gray-500 mt-1">Once completed, a notification bubble will show: <code>"APK(s) generated successfully: locate"</code>. Click it to find your compiled <strong>app-debug.apk</strong> file!</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 border border-gray-150 rounded-xl p-5 space-y-3.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 block font-mono">Useful Resources</span>
                <div className="space-y-2">
                  <a 
                    href="https://capacitorjs.com/docs/getting-started" 
                    target="_blank" 
                    rel="noreferrer"
                    className="flex items-center justify-between text-xs font-semibold text-gray-700 hover:text-red-750 transition"
                  >
                    <span>Capacitor Docs</span>
                    <ExternalLink className="w-3.5 h-3.5 text-gray-400" />
                  </a>
                  <a 
                    href="https://developer.android.com/studio" 
                    target="_blank" 
                    rel="noreferrer"
                    className="flex items-center justify-between text-xs font-semibold text-gray-700 hover:text-red-750 transition border-t border-gray-100 pt-2"
                  >
                    <span>Android Studio Download</span>
                    <ExternalLink className="w-3.5 h-3.5 text-gray-400" />
                  </a>
                </div>
              </div>

            </div>

          </div>

        </div>
      ) : (
        /* Render Backup & Restore Database Panel */
        <div className="space-y-6 animate-fade-in">
          
          <GoogleDriveSync 
            influencers={influencers}
            campaigns={campaigns}
            tasks={tasks}
            messages={messages}
            contracts={contracts}
            billingEntries={billingEntries}
            user={user}
            accessToken={accessToken}
            onRestoreData={onRestoreData}
            onLoginSuccess={onLoginSuccess}
            onLogoutSuccess={onLogoutSuccess}
          />

          <div className="bg-white border border-gray-150 rounded-xl p-5 md:p-6 shadow-sm">
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2 mb-2">
              <Database className="w-5 h-5 text-red-650" />
              Comprehensive Workspace Snapshot Backup & Restore
            </h3>
            <p className="text-xs text-gray-600 leading-relaxed max-w-4xl">
              Take complete manual database snapshots of active creator records, monthly marketing campaigns, deliverable task lists, unread/read chat threads, verified contracts, and billing ledgers. Backup files are fully client-side and open standard. Save snapshots dynamically to your drive space or restore historical sessions.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Left Column: Backup Generation */}
            <div className="bg-white border border-gray-150 rounded-xl p-5 md:p-6 space-y-5 flex flex-col justify-between shadow-xs">
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-bold text-gray-950 flex items-center gap-2">
                    📥 Take Live Snapshot Backup
                  </h4>
                  <p className="text-xs text-gray-500 mt-0.5">Generate a physical database snapshot to save or distribute locally.</p>
                </div>

                <div className="bg-gray-50 border border-gray-155 rounded-lg p-4 space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 font-mono">Payload Manifest Summary</span>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                    <div className="flex justify-between border-b border-gray-200/50 pb-1">
                      <span className="text-gray-500">Creators Count:</span>
                      <span className="font-mono font-bold text-gray-805">{influencers?.length ?? 0}</span>
                    </div>
                    <div className="flex justify-between border-b border-gray-200/50 pb-1">
                      <span className="text-gray-500">Campaigns count:</span>
                      <span className="font-mono font-bold text-gray-805">{campaigns?.length ?? 0}</span>
                    </div>
                    <div className="flex justify-between border-b border-gray-200/50 pb-1 border-dotted">
                      <span className="text-gray-500">Video Tasks:</span>
                      <span className="font-mono font-bold text-gray-805">{tasks?.length ?? 0}</span>
                    </div>
                    <div className="flex justify-between border-b border-gray-200/50 pb-1 border-dotted">
                      <span className="text-gray-500">Interactions Logs:</span>
                      <span className="font-mono font-bold text-gray-850">{messages?.length ?? 0}</span>
                    </div>
                    <div className="flex justify-between col-span-2 border-b border-gray-200/50 pb-1">
                      <span className="text-gray-500">Contracts & Billings:</span>
                      <span className="font-mono font-bold text-gray-805">{(contracts?.length ?? 0) + (billingEntries?.length ?? 0)} records</span>
                    </div>
                  </div>
                </div>

                <div className="text-[11px] text-gray-500 leading-normal bg-red-50/40 p-3 rounded-lg border border-red-100/50 font-medium">
                  ⚠️ <strong>Security Note:</strong> Backup snapshots contain creator financial metrics, campaign configurations, and private pricing structures. Store backup files in secure environments.
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => {
                    try {
                      const dataStr = JSON.stringify({
                        influencers,
                        campaigns,
                        tasks,
                        messages,
                        contracts,
                        billingEntries,
                        aovEntries,
                        dashboardProducts,
                        monthlyTargets,
                        savedProducts
                      }, null, 2);
                      const blob = new Blob([dataStr], { type: 'application/json' });
                      const url = URL.createObjectURL(blob);
                      const link = document.createElement('a');
                      link.href = url;
                      link.download = `influencer-manager-snapshot-${new Date().toLocaleString('en-GB').replace(/[\/:]/g, '-').replace(', ', '_')}.json`;
                      link.target = '_blank';
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                      URL.revokeObjectURL(url);
                      setExportSuccess(true);
                      setTimeout(() => setExportSuccess(false), 3000);
                    } catch (err: any) {
                      alert("Error generating backup: " + err.message);
                    }
                  }}
                  className="w-full sm:flex-1 py-2.5 px-4 rounded-lg bg-red-600 hover:bg-red-750 text-white transition font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                >
                  {exportSuccess ? (
                    <>
                      <CheckCircle className="w-4 h-4" /> Snapshot Downloaded
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" /> Download Snapshot File
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    try {
                      const dataStr = JSON.stringify({
                        influencers,
                        campaigns,
                        tasks,
                        messages,
                        contracts,
                        billingEntries,
                        aovEntries,
                        dashboardProducts,
                        monthlyTargets,
                        savedProducts
                      }, null, 2);
                      navigator.clipboard.writeText(dataStr);
                      setCopyState('backup');
                      setTimeout(() => setCopyState(null), 2500);
                    } catch (err: any) {
                      alert("Error copying backup data: " + err.message);
                    }
                  }}
                  className="w-full sm:w-auto py-2.5 px-4 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-700 transition font-bold text-xs flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap"
                >
                  {copyState === 'backup' ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-600" /> Copied Text
                    </>
                  ) : (
                    <>
                      Copy Schema Text
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Right Column: Restore Actions */}
            <div className="bg-white border border-gray-150 rounded-xl p-5 md:p-6 space-y-4 shadow-xs flex flex-col justify-between">
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                    🔄 Restore & Reconstruct Database State
                  </h4>
                  <p className="text-xs text-gray-500 mt-0.5">Parse, verify, and load external backup snapshot JSON documents.</p>
                </div>

                {/* Drag n Drop block Area */}
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    const file = e.dataTransfer.files[0];
                    if (file && (file.type === "application/json" || file.name.endsWith('.json'))) {
                      const reader = new FileReader();
                      reader.onload = (evt) => {
                        if (evt.target?.result) {
                          try {
                            const parsed = JSON.parse(evt.target.result as string);
                            const data = parsed.payload || parsed;
                            if (!Array.isArray(data.influencers) && !Array.isArray(data.campaigns)) {
                              throw new Error("Target file lacks the required Influencers arrays structure.");
                            }
                            onRestoreData(data);
                            setRestoreSuccess("Workspace snapshot restored successfully!");
                            setRestoreError(null);
                            setRestoreText('');
                            setTimeout(() => setRestoreSuccess(null), 3000);
                          } catch (err: any) {
                            setRestoreError(err.message || "Invalid backup JSON schema.");
                            setRestoreSuccess(null);
                          }
                        }
                      };
                      reader.readAsText(file);
                    } else {
                      setRestoreError("Please load a valid .json snapshot file.");
                    }
                  }}
                  onClick={() => document.getElementById('backup-dropzone-file-input')?.click()}
                  className={`border-2 border-dashed rounded-xl p-5 text-center transition cursor-pointer flex flex-col items-center justify-center ${
                    isDragging
                      ? 'border-red-500 bg-red-50/30'
                      : 'border-gray-250 bg-gray-50 hover:bg-gray-100/50'
                  }`}
                >
                  <div className="p-2.5 bg-red-50 text-red-600 rounded-full mb-1">
                    <Upload className="w-5 h-5" />
                  </div>
                  <p className="text-xs font-bold text-gray-750">Drag & Drop `.json` Snapshot file</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">or click to browse from device folders</p>
                  <input
                    id="backup-dropzone-file-input"
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = (evt) => {
                          if (evt.target?.result) {
                            try {
                              const parsed = JSON.parse(evt.target.result as string);
                              const data = parsed.payload || parsed;
                              if (!Array.isArray(data.influencers) && !Array.isArray(data.campaigns)) {
                                                    throw new Error("Parsed JSON file lacks the required structures.");
                              }
                              onRestoreData(data);
                              setRestoreSuccess("Workspace state snapshot restored successfully!");
                              setRestoreError(null);
                              setRestoreText('');
                              setTimeout(() => setRestoreSuccess(null), 3000);
                            } catch (err: any) {
                              setRestoreError(err.message || "Invalid backup JSON schema.");
                              setRestoreSuccess(null);
                            } finally {
                              e.target.value = '';
                            }
                          }
                        };
                        reader.readAsText(file);
                      }
                    }}
                  />
                </div>

                {/* Textarea Paste block Option */}
                <div className="space-y-2">
                  <textarea
                    className="w-full text-xs font-mono p-2 px-3 border border-gray-250 rounded-lg focus:ring-1 focus:ring-red-550 focus:border-red-550 outline-none transition bg-white text-gray-800"
                    rows={2}
                    placeholder={`Alternatively, paste raw snapshot JSON content text here ...\ne.g. { "influencers": [...], "campaigns": [...] }`}
                    value={restoreText}
                    onChange={(e) => {
                      setRestoreText(e.target.value);
                      setRestoreError(null);
                      setRestoreSuccess(null);
                    }}
                  />
                  <button
                    type="button"
                    disabled={!restoreText.trim()}
                    onClick={() => {
                      try {
                        const parsed = JSON.parse(restoreText.trim());
                        const data = parsed.payload || parsed;
                        if (!Array.isArray(data.influencers) && !Array.isArray(data.campaigns)) {
                          throw new Error("Specified data payload lacks the required array schemas.");
                        }
                        onRestoreData(data);
                        setRestoreSuccess("Workspace coordinates verified and loaded perfectly!");
                        setRestoreError(null);
                        setRestoreText('');
                        setTimeout(() => setRestoreSuccess(null), 3500);
                      } catch (err: any) {
                        setRestoreError("Verification failed: " + err.message);
                        setRestoreSuccess(null);
                      }
                    }}
                    className={`w-full py-2 px-3 rounded-lg text-xs font-bold transition uppercase tracking-wider ${
                      !restoreText.trim()
                        ? 'bg-gray-150 text-gray-400 cursor-not-allowed border border-transparent'
                        : 'bg-neutral-850 hover:bg-neutral-955 text-white cursor-pointer hover:scale-[1.005]'
                    }`}
                  >
                    Verify & Import Clipboard Snapshot
                  </button>
                </div>
              </div>

              <div className="space-y-2 pt-2">
                {restoreError && (
                  <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-xs rounded-lg flex items-center gap-2 font-medium">
                    <AlertCircle className="w-4 h-4 text-red-650 shrink-0" />
                    <span>{restoreError}</span>
                  </div>
                )}

                {restoreSuccess && (
                  <div className="p-3 bg-emerald-50 border border-emerald-150 text-emerald-800 text-xs rounded-lg flex items-center gap-2 font-medium">
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 animate-bounce" />
                    <span>{restoreSuccess}</span>
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
