import React, { useState, useRef, useMemo } from 'react';
import Papa from 'papaparse';
import { safeLocalStorage } from '../lib/safeLocalStorage';
import { Save } from 'lucide-react';
import RecentShipmentsFab from './RecentShipmentsFab';
import { updateDocBatchInDb } from '../lib/firestoreService';
import { auth } from '../lib/firebaseAuth';
import { triggerUpdateWhatsAppModal } from '../lib/whatsappPrompt';
import { globalToast } from '../lib/toast';
import { openWhatsAppChat, cleanSingleMobileForStorage } from '../lib/whatsappHelper';
import { formatDateToDMY } from '../lib/dateUtils';
import { 
  Calendar as CalendarIcon, 
  HelpCircle, 
  Plus, 
  Trash2, 
  Search, 
  Sparkles, 
  DollarSign, 
  CheckCircle, 
  Clock, 
  ArrowUpDown,
  Filter,
  Download,
  MessageCircle,
  Cloud,
  ExternalLink,
  Package,
  Copyright,
  Zap,
  Calculator,
  LayoutGrid,
  List,
  RefreshCw,
  XCircle,
  FileSpreadsheet,
  Users,
  Eye,
  EyeOff,
  Copy,
  TriangleAlert,
  UserPlus, X, Database, Film,
  Globe
} from 'lucide-react';
import AllReelsDirectoryModal, { detectReelPlatform } from './AllReelsDirectoryModal';
import { Campaign, Task, Influencer, ProductConfig } from '../types';
import { isTaskInPeriod } from '../lib/taskUtils';
import { MonthlyProductTarget } from './MonthlyTargets';

interface CampaignPlannerProps {
  campaigns: Campaign[];
  tasks: Task[];
  monthlyBudgets?: any[];
  influencers: Influencer[];
  onUpdateCampaignDates?: (campaignId: string, startDate: string, endDate: string) => void;
  onUpdateTask?: (taskId: string, updatedFields: Partial<Task>) => void;
  onCreateCampaign?: (newCampaign: Omit<Campaign, 'id' | 'metrics'>) => void;
  onCreateTask?: (newTask: Omit<Task, 'id'> & { id?: string }) => void;
  onDeleteTask?: (taskId: string) => void;
  onUpdateTasksBulk?: (updates: {id: string, updates: Partial<Task>}[]) => void;
  onBulkDeleteTasks?: (taskIds: string[]) => void;
  onUpdateInfluencer?: (influencerId: string, updatedFields: Partial<Influencer>) => void;
  onAddInfluencer?: (newInfluencer: any) => string | void;
  onAddInfluencersBulk?: (newInfluencers: any[]) => void;
  user?: any;
  accessToken?: string | null;
  savedProducts: string[];
  setSavedProducts: React.Dispatch<React.SetStateAction<string[]>>;
  dashboardProducts: ProductConfig[];
  notebookNotes?: any[];
  setDashboardProducts: React.Dispatch<React.SetStateAction<ProductConfig[]>>;
  monthFilter: string;
  setMonthFilter: (m: string) => void;
  yearFilter: string;
  setYearFilter: (y: string) => void;
  weekFilter: string;
  setWeekFilter: (w: string) => void;
  autoSyncPlannerWithTargets?: boolean;
  setAutoSyncPlannerWithTargets?: (val: boolean) => void;
  monthlyTargets?: MonthlyProductTarget[];
  onlyShowPlacedProducts?: boolean;
  onToggleOnlyShowPlacedProducts?: (val: boolean) => void;
  onForceGlobalBackup?: () => void;
  salesData?: any[];
}

const isOthersProduct = (name?: string): boolean => {
  if (!name) return false;
  const upper = name.trim().toUpperCase();
  return (
    upper === 'OTHERS 1' ||
    upper === 'OTHERS 2' ||
    upper === 'OTHERS 3' ||
    upper === 'OTHERS 4' ||
    upper === 'OTHERS 5' ||
    /^OTHERS\s*[1-5]?$/i.test(upper) ||
    upper.startsWith('OTHERS')
  );
};

const COLORS = [
  { bg: 'bg-rose-100', bgSoft: 'bg-rose-50', hover: 'hover:bg-rose-200', text: 'text-rose-950', border: 'border-rose-300', stickyBg: 'bg-rose-100', stickyHover: 'group-hover/row:bg-rose-200' },
  { bg: 'bg-emerald-100', bgSoft: 'bg-emerald-50', hover: 'hover:bg-emerald-200', text: 'text-emerald-950', border: 'border-emerald-300', stickyBg: 'bg-emerald-100', stickyHover: 'group-hover/row:bg-emerald-200' },
  { bg: 'bg-indigo-100', bgSoft: 'bg-indigo-50', hover: 'hover:bg-indigo-200', text: 'text-indigo-950', border: 'border-indigo-300', stickyBg: 'bg-indigo-100', stickyHover: 'group-hover/row:bg-indigo-200' },
  { bg: 'bg-amber-100', bgSoft: 'bg-amber-50', hover: 'hover:bg-amber-200', text: 'text-amber-950', border: 'border-amber-300', stickyBg: 'bg-amber-100', stickyHover: 'group-hover/row:bg-amber-200' },
  { bg: 'bg-sky-100', bgSoft: 'bg-sky-50', hover: 'hover:bg-sky-200', text: 'text-sky-950', border: 'border-sky-300', stickyBg: 'bg-sky-100', stickyHover: 'group-hover/row:bg-sky-200' },
  { bg: 'bg-fuchsia-100', bgSoft: 'bg-fuchsia-50', hover: 'hover:bg-fuchsia-200', text: 'text-fuchsia-950', border: 'border-fuchsia-300', stickyBg: 'bg-fuchsia-100', stickyHover: 'group-hover/row:bg-fuchsia-200' },
  { bg: 'bg-lime-100', bgSoft: 'bg-lime-50', hover: 'hover:bg-lime-200', text: 'text-lime-950', border: 'border-lime-300', stickyBg: 'bg-lime-100', stickyHover: 'group-hover/row:bg-lime-200' },
  { bg: 'bg-orange-100', bgSoft: 'bg-orange-50', hover: 'hover:bg-orange-200', text: 'text-orange-950', border: 'border-orange-300', stickyBg: 'bg-orange-100', stickyHover: 'group-hover/row:bg-orange-200' },
  { bg: 'bg-purple-100', bgSoft: 'bg-purple-50', hover: 'hover:bg-purple-200', text: 'text-purple-950', border: 'border-purple-300', stickyBg: 'bg-purple-100', stickyHover: 'group-hover/row:bg-purple-200' },
  { bg: 'bg-teal-100', bgSoft: 'bg-teal-50', hover: 'hover:bg-teal-200', text: 'text-teal-950', border: 'border-teal-300', stickyBg: 'bg-teal-100', stickyHover: 'group-hover/row:bg-teal-200' },
];

const getInfluencerColor = (influencerId?: string) => {
  if (!influencerId) return { bg: 'bg-white', bgSoft: 'bg-white', hover: 'hover:bg-gray-50', text: 'text-gray-900', border: 'border-gray-200', stickyBg: 'bg-white', stickyHover: 'group-hover/row:bg-gray-100/70' };
  let hash = 0;
  for (let i = 0; i < influencerId.length; i++) {
    hash = influencerId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return COLORS[Math.abs(hash) % COLORS.length];
};

const ShortIoInput = ({ value, onChange, ...props }: any) => {
  const [localVal, setLocalVal] = useState(value ?? '');
  const [isFocused, setIsFocused] = useState(false);
  const lastReportedVal = React.useRef(value ?? '');
  
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;

  const extractSlug = (url: string) => {
    if (!url) return '';
    try {
      const parts = url.split('/');
      return parts[parts.length - 1];
    } catch {
      return url;
    }
  };

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
    }, 500);
    return () => clearTimeout(handler);
  }, [localVal]);

  const displayVal = isFocused ? localVal : extractSlug(localVal);

  return (
    <input
      {...props}
      value={displayVal}
      onChange={e => setLocalVal(e.target.value)}
      onFocus={(e) => {
        setIsFocused(true);
        if (props.onFocus) props.onFocus(e);
      }}
      onBlur={(e) => {
        setIsFocused(false);
        if (props.onBlur) props.onBlur(e);
      }}
    />
  );
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (String(localVal) !== String(lastReportedVal.current)) {
        lastReportedVal.current = localVal;
        onChangeRef.current(localVal);
      }
    }
    if (props.onKeyDown) {
      props.onKeyDown(e);
    }
  };

  return (
    <input
      value={localVal}
      onChange={(e) => setLocalVal(e.target.value)}
      onBlur={handleBlur}
      onFocus={handleFocus}
      onKeyDown={handleKeyDown}
      {...props}
    />
  );
};

export default function CampaignPlanner({
  campaigns,
  tasks,
  monthlyBudgets = [],
  influencers,
  weekFilter,
  setWeekFilter,
  onUpdateCampaignDates,
  onUpdateTask,
  onCreateCampaign,
  onCreateTask,
  onDeleteTask,
  onUpdateTasksBulk,
  onBulkDeleteTasks,
  onUpdateInfluencer,
  onAddInfluencer,
  onAddInfluencersBulk,
  user = null,
  accessToken = null,
  savedProducts,
  setSavedProducts,
  dashboardProducts,
  setDashboardProducts,
  notebookNotes = [],
  monthFilter,
  setMonthFilter,
  yearFilter,
  setYearFilter,
  autoSyncPlannerWithTargets = true,
  setAutoSyncPlannerWithTargets = () => {},
  monthlyTargets = [],
  onlyShowPlacedProducts = true,
  onToggleOnlyShowPlacedProducts,
  onForceGlobalBackup,
  salesData = []
}: CampaignPlannerProps) {
  const detectPlatform = (url1?: string, url2?: string, url3?: string): Task['platform'] | undefined => {
    const allUrls = [url1, url2, url3].filter(Boolean).map(u => String(u).toLowerCase());
    const detected = new Set<string>();

    for (const url of allUrls) {
      if (url.includes('instagram.com')) detected.add('Instagram');
      else if (url.includes('youtube.com') || url.includes('youtu.be')) detected.add('YouTube');
      else if (url.includes('facebook.com') || url.includes('fb.com') || url.includes('fb.watch')) detected.add('Facebook');
      else if (url.includes('tiktok.com')) detected.add('TikTok');
      else if (url.includes('twitter.com') || url.includes('x.com')) detected.add('Twitter');
    }
    
    if (detected.size > 1) return 'Multi-Platform';
    if (detected.size === 1) return Array.from(detected)[0] as Task['platform'];
    return undefined;
  };

  // State for search and filtration
  const getFilterSaved = (key: string, def: string) => safeLocalStorage.getItem('CP_FILTER_' + key) ?? def;

  const [searchTerm, setSearchTerm] = useState(() => getFilterSaved('searchTerm', ''));
  const [copiedVideoId, setCopiedVideoId] = useState<string | null>(null);
  const [sortField, setSortField] = useState<'planned' | 'actual' | null>(() => {
    const val = getFilterSaved('sortField', 'null');
    return val === 'null' ? null : (val as 'planned' | 'actual');
  });
  const [sortAsc, setSortAsc] = useState<boolean>(() => getFilterSaved('sortAsc', 'true') === 'true');
  const [completionFilter, setCompletionFilter] = useState<'all' | 'completed' | 'uncompleted' | 'reels'>(() => getFilterSaved('completionFilter', 'all') as any);
  const [showAllReelsModal, setShowAllReelsModal] = useState(false);

  const hasReelLink = (t: Task) => Boolean(
    (t.videoLink1 && detectReelPlatform(t.videoLink1)) ||
    (t.videoLink2 && detectReelPlatform(t.videoLink2)) ||
    (t.videoLink3 && detectReelPlatform(t.videoLink3))
  );
  // Using weekFilter from props
  const [showHiddenTasks, setShowHiddenTasks] = useState(() => getFilterSaved('showHiddenTasks', 'false') === 'true');
  const [showSecondaryInfluencer, setShowSecondaryInfluencer] = useState(() => getFilterSaved('showSecondaryInfluencer', 'false') === 'true');
  const [viewMode, setViewMode] = useState<'table' | 'product-board'>(() => getFilterSaved('viewMode', 'table') as any);

  React.useEffect(() => {
    safeLocalStorage.setItem('CP_FILTER_searchTerm', searchTerm);
    safeLocalStorage.setItem('CP_FILTER_sortField', sortField || 'null');
    safeLocalStorage.setItem('CP_FILTER_sortAsc', String(sortAsc));
    safeLocalStorage.setItem('CP_FILTER_completionFilter', completionFilter);
    safeLocalStorage.setItem('CP_FILTER_weekFilter', weekFilter);
    safeLocalStorage.setItem('CP_FILTER_showHiddenTasks', String(showHiddenTasks));
    safeLocalStorage.setItem('CP_FILTER_showSecondaryInfluencer', String(showSecondaryInfluencer));
    safeLocalStorage.setItem('CP_FILTER_viewMode', viewMode);
  }, [searchTerm, sortField, sortAsc, completionFilter, weekFilter, showHiddenTasks, viewMode, showSecondaryInfluencer]);

  const [taskToDelete, setTaskToDelete] = useState<{id: string, title: string, dispId: string} | null>(null);
  const [fetchingReelLinkUrls, setFetchingReelLinkUrls] = useState<Record<string, boolean>>({});

  const handleFetchReelViews = async (taskId: string, linkKey: 'videoLink1' | 'videoLink2' | 'videoLink3', url: string) => {
    if (!url || fetchingReelLinkUrls[url]) return;
    setFetchingReelLinkUrls(prev => ({ ...prev, [url]: true }));
    try {
      const res = await fetch('/api/link-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      const json = await res.json();
      if (json.success && json.views !== undefined) {
        const viewsCount = Number(json.views);
        const viewsKey = `${linkKey}Views` as const;
        onUpdateTask?.(taskId, {
          [viewsKey]: viewsCount,
          views: viewsCount
        });
        try {
          const cache = JSON.parse(localStorage.getItem('REELS_DIRECTORY_VIEWS_CACHE') || '{}');
          cache[url] = viewsCount;
          localStorage.setItem('REELS_DIRECTORY_VIEWS_CACHE', JSON.stringify(cache));
        } catch (e) {}
      }
    } catch (err) {
      console.error('Failed to fetch reel views:', err);
    } finally {
      setFetchingReelLinkUrls(prev => {
        const next = { ...prev };
        delete next[url];
        return next;
      });
    }
  };

  const [customProductToAdd, setCustomProductToAdd] = useState('');

  // Short.io live sync effect
  React.useEffect(() => {
    try {
      const stored = safeLocalStorage.getItem('SHORT_IO_TRACKED_LINKS');
      let trackedLinks: any[] = [];
      if (stored) {
        trackedLinks = JSON.parse(stored);
      }
      
      let storageChanged = false;

      tasks.forEach(t => {
        const linkStr = t.shortIoLink ? String(t.shortIoLink || '').trim() : '';
        if (linkStr) {
          const inf = influencers.find(i => i.id === t.influencerId);
          const infName = inf ? inf.name : 'Unknown Influencer';
          const expectedLabel = `${infName} - ${t.title || 'Product'}`;

          const existingLinkIdx = trackedLinks.findIndex(l => l.id === `planner-${t.id}` || l.url === linkStr);
          if (existingLinkIdx === -1) {
             // Create it
             trackedLinks.unshift({
               id: `planner-${t.id}`,
               url: linkStr,
               label: expectedLabel
             });
             storageChanged = true;
          } else {
             // Update label if needed
             if (trackedLinks[existingLinkIdx].label !== expectedLabel || trackedLinks[existingLinkIdx].url !== linkStr) {
                 trackedLinks[existingLinkIdx].label = expectedLabel;
                 trackedLinks[existingLinkIdx].url = linkStr;
                 storageChanged = true;
             }
          }
        }
      });

      if (storageChanged) {
         safeLocalStorage.setItem('SHORT_IO_TRACKED_LINKS', JSON.stringify(trackedLinks));
         window.dispatchEvent(new Event('shortio-links-updated'));
      }

    } catch (e) {
      console.error("Failed to sync Short.io links", e);
    }
  }, [tasks, influencers]);

  // Google Sheets extraction states
  const [isExtractingSheets, setIsExtractingSheets] = useState(false);

  // Secure Save Feature
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const performSecureSave = React.useCallback(async () => {
    setIsSaving(true);
    try {
      // Save directly to local storage to prevent data loss on logout or network loss
      safeLocalStorage.setItem('MONTHLY_PLANNER_SECURE_BACKUP', JSON.stringify(tasks));
      
      if (auth.currentUser) {
        // Prepare bulk update array for Firestore to guarantee cloud sync
        const batchUpdates = tasks.map(t => ({
          id: t.id,
          data: { ...t, ownerId: auth.currentUser!.uid }
        }));
        await updateDocBatchInDb('tasks', batchUpdates).catch(err => console.warn('Bulk sync skipped:', err));
      }
      
      // Attempt to trigger global storage sync event
      window.dispatchEvent(new CustomEvent('TRIGGER_CENTRAL_REFRESH'));
      
      setLastSaved(new Date());
    } catch (e) {
      console.error("Auto-save failed", e);
    } finally {
      setTimeout(() => setIsSaving(false), 800);
    }
  }, [tasks]);

  // Auto-save every 30 seconds
  React.useEffect(() => {
    const intervalId = setInterval(() => {
      performSecureSave();
    }, 30000);
    return () => clearInterval(intervalId);
  }, [performSecureSave]);


  const [extractionMessage, setExtractionMessage] = useState<{ type: 'success' | 'error'; text: string; url?: string } | null>(null);

  const MONTHS_MAP_SHORT: { [key: string]: string } = {
    '01': 'Jan', '02': 'Feb', '03': 'Mar', '04': 'Apr',
    '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Aug',
    '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dec'
  };

  // Helper to format date into date - month - year format (e.g. 15/06/2026)
  const formatDateCustom = (dateStr: string) => {
    return formatDateToDMY(dateStr);
  };

  // Add a product to future select list
  const handleAddProductToSaved = () => {
    if (!customProductToAdd.trim()) return;
    const trimmed = customProductToAdd.trim();
    const suffix = user ? user.uid : 'guest';
    if (!savedProducts.includes(trimmed)) {
      const updated = [...savedProducts, trimmed];
      setSavedProducts(updated);
      safeLocalStorage.setItem('INFLUENCER_MANAGER_SAVED_PRODUCTS', JSON.stringify(updated));
      safeLocalStorage.setItem(`INFLUENCER_MANAGER_SAVED_PRODUCTS_${suffix}`, JSON.stringify(updated));
      setNewProduct(trimmed); // Select it immediately
      setCustomProductToAdd('');
      if (onForceGlobalBackup) onForceGlobalBackup();
    } else {
      setNewProduct(trimmed);
      setCustomProductToAdd('');
    }
  };

  // Remove a product from saved list
  const handleRemoveProductFromSaved = (productToRemove: string) => {
    const suffix = user ? user.uid : 'guest';
    const updated = savedProducts.filter(p => p !== productToRemove);
    setSavedProducts(updated);
    safeLocalStorage.setItem('INFLUENCER_MANAGER_SAVED_PRODUCTS', JSON.stringify(updated));
    safeLocalStorage.setItem(`INFLUENCER_MANAGER_SAVED_PRODUCTS_${suffix}`, JSON.stringify(updated));
    if (newProduct === productToRemove) {
      setNewProduct(updated[0] || '');
    }
    if (onForceGlobalBackup) onForceGlobalBackup();
  };

  // Rename a product select option
  const handleRenameProductOption = () => {
    if (!newProduct) return;
    const oldName = newProduct;
    const newName = editedProductName.trim();
    if (!newName || oldName === newName) return;

    const suffix = user ? user.uid : 'guest';
    const updated = savedProducts.map(p => p === oldName ? newName : p);
    setSavedProducts(updated);
    safeLocalStorage.setItem('INFLUENCER_MANAGER_SAVED_PRODUCTS', JSON.stringify(updated));
    safeLocalStorage.setItem(`INFLUENCER_MANAGER_SAVED_PRODUCTS_${suffix}`, JSON.stringify(updated));
    setNewProduct(newName);
    if (onForceGlobalBackup) onForceGlobalBackup();
  };

  // Google Sheets Extraction implementation
  const handleAutoCalculateAllMetrics = () => {
    let updatedCount = 0;
    tasks.forEach(t => {
      const viewsValue = t.views !== undefined ? t.views : 0;
      const clicksValue = t.clicks !== undefined ? t.clicks : 0;
      const remunerationValue = t.remuneration || 0;
      
      const ctrValue = viewsValue > 0 ? parseFloat(((clicksValue / viewsValue) * 100).toFixed(2)) : 0;
      const cpcValue = clicksValue > 0 ? parseFloat((remunerationValue / clicksValue).toFixed(2)) : 0;
      const cpvValue = viewsValue > 0 ? parseFloat((remunerationValue / viewsValue).toFixed(3)) : 0;

      // Ensure epsilon tolerance check for float mismatch issues to avoid unnecessary updates
      const diffCtr = Math.abs((t.ctr || 0) - ctrValue);
      const diffCpc = Math.abs((t.cpc || 0) - cpcValue);
      const diffCpv = Math.abs((t.cpv || 0) - cpvValue);

      if (diffCtr > 0.01 || diffCpc > 0.01 || diffCpv > 0.01) {
        onUpdateTask?.(t.id, {
          ctr: ctrValue,
          cpc: cpcValue,
          cpv: cpvValue
        });
        updatedCount++;
      }
    });

    if (updatedCount > 0) {
      alert(`Successfully auto-calculated and synced metrics for ${updatedCount} video(s)!`);
    } else {
      alert('All video metrics are already up to date!');
    }
  };

  const handleExtractToGoogleSheets = async () => {
    if (!accessToken) {
      alert("Please sign in with Google first using the 'Cloud Backup & Restore' button at the top right to enable Google Sheet extraction!");
      return;
    }

    setIsExtractingSheets(true);
    setExtractionMessage(null);

    try {
      // 1. Create a new Spreadsheet file
      const createSpreadsheetResponse = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          properties: {
            title: `Influencer Manager Monthly Campaign Planner - Month:${monthFilter}-Year:${yearFilter}`
          }
        })
      });

      if (!createSpreadsheetResponse.ok) {
        const errorText = await createSpreadsheetResponse.text();
        throw new Error(`Failed to create spreadsheet: ${createSpreadsheetResponse.statusText}. Details: ${errorText}`);
      }

      const spreadsheet = await createSpreadsheetResponse.json();
      const spreadsheetId = spreadsheet.spreadsheetId;
      const spreadsheetUrl = spreadsheet.spreadsheetUrl;
      const firstSheet = spreadsheet.sheets && spreadsheet.sheets.length > 0 
        ? spreadsheet.sheets[0] 
        : null;
      const firstSheetName = firstSheet?.properties?.title || 'Sheet1';
      const firstSheetId = firstSheet?.properties?.sheetId ?? 0;

      // 2. Prepare headers and rows of filteredTasks
      const sheetData = [
        [
          'Serial No',
          'Video Id',
          'Influencer Name',
          'Product / Campaign Item',
          'Planed Video Release Date',
          'Actual Date',
          'Video Link 1',
          'Video Link 2',
          'Video Link 3',
          'Short.io Link',
          'Amount',
          'Views',
          'Clicks',
          'CTR (%)',
          'CPC',
          'CPV',
          'Sample Cost',
          'Order ID',
          'Order Date',
          'Order Platform',
          'Media Right'
        ]
      ];

      const tasksToExport = [...filteredTasks].sort((a, b) => {
        const dateA = a.deadline || a.releaseDate || '9999-99-99';
        const dateB = b.deadline || b.releaseDate || '9999-99-99';
        return new Date(dateA).getTime() - new Date(dateB).getTime();
      });

      tasksToExport.forEach((t, idx) => {
        const influencer = influencers.find(inf => inf.id === t.influencerId);
        const influencerName = influencer ? influencer.name : (t.secondaryInfluencerName || 'Unknown');
        
        const videoId = getVideoDisplayId(t, idx);
        
        // Calculate fields
        const amount = t.remuneration || 0;
        const views = t.views || 0;
        const clicks = t.clicks || 0;
        const ctr = views > 0 ? ((clicks / views) * 105).toFixed(2) : '0.00';
        const cpc = clicks > 0 ? (amount / clicks).toFixed(2) : '0.00';
        const cpv = views > 0 ? (amount / views).toFixed(3) : '0.000';

        const sampleCost = t.sampleCost || 0;
        const orderId = t.orderId || '';
        const orderDate = t.orderDate ? formatDateCustom(t.orderDate) : '';
        const orderPlatform = t.orderPlatform || '';
        const mediaRight = t.mediaRightAmount || 0;

        sheetData.push([
          (idx + 1).toString(),
          videoId,
          influencerName,
          t.title || '',
          t.deadline ? formatDateCustom(t.deadline) : '',
          t.releaseDate ? formatDateCustom(t.releaseDate) : '',
          t.videoLink1 || '',
          t.videoLink2 || '',
          t.videoLink3 || '',
          t.shortIoLink || '',
          amount.toString(),
          views.toString(),
          clicks.toString(),
          `${ctr}%`,
          cpc,
          cpv,
          sampleCost.toString(),
          orderId,
          orderDate,
          orderPlatform,
          mediaRight.toString()
        ]);
      });

      // Add summary/totals row
      const totalAmount = filteredTasks.reduce((sum, t) => sum + (t.remuneration || 0), 0);
      const totalViews = filteredTasks.reduce((sum, t) => sum + (t.views || 0), 0);
      const totalClicks = filteredTasks.reduce((sum, t) => sum + (t.clicks || 0), 0);
      const avgCtr = totalViews > 0 ? ((totalClicks / totalViews) * 100).toFixed(2) : '0.00';
      const avgCpc = totalClicks > 0 ? (totalAmount / totalClicks).toFixed(2) : '0.00';
      const avgCpv = totalViews > 0 ? (totalAmount / totalViews).toFixed(3) : '0.000';
      const totalSampleCost = filteredTasks.reduce((sum, t) => sum + (t.sampleCost || 0), 0);
      const totalMediaRight = filteredTasks.reduce((sum, t) => sum + (t.mediaRightAmount || 0), 0);

      sheetData.push([
        'Total / Averages',
        '-',
        '-',
        '-',
        '-',
        '-',
        '-',
        '-',
        '-',
        '-',
        totalAmount.toString(),
        totalViews.toString(),
        totalClicks.toString(),
        `${avgCtr}%`,
        avgCpc,
        avgCpv,
        totalSampleCost.toString(),
        '-',
        '-',
        '-',
        totalMediaRight.toString()
      ]);

      // --- CALCULATE SUMMARY ---
      const isReleased = (t: Task) => !!(t.videoLink1?.trim() || t.videoLink2?.trim() || t.videoLink3?.trim());
      const getTaskWeek = (t: Task): number => {
        const dateStr = (t.releaseDate && t.releaseDate.trim()) ? t.releaseDate.trim() : (t.deadline && t.deadline.trim() ? t.deadline.trim() : '');
        if (dateStr && /^\d{4}/.test(dateStr)) {
          const parts = dateStr.split('-');
          const day = parts.length >= 3 ? parseInt(parts[2], 10) : 1;
          if (!isNaN(day) && day > 0) {
            const w = Math.ceil(day / 7);
            return Math.min(Math.max(w, 1), 5);
          }
        }
        return 1;
      };
      const activeTasks = filteredTasks.filter(t => t.status !== 'Cancelled');
      const publishedTasks = activeTasks.filter(t => isReleased(t));
      
      const totalPublishedVideos = publishedTasks.length;
      const totalAmountSpent = publishedTasks.reduce((sum, t) => sum + (t.remuneration || 0), 0);
      
      const currentMonthActive = monthFilter === 'ALL' ? (new Date().getMonth() + 1).toString().padStart(2, '0') : monthFilter;
      const currentYearActive = yearFilter === 'ALL' ? new Date().getFullYear().toString() : yearFilter;

      // Directly collect video dashboard Product-wise Video Planning & Delivery Schedule tasks for this period
      const scheduleTasks = tasks.filter(t => isTaskInPeriod(t, currentMonthActive, currentYearActive, weekFilter) && t.status !== 'Cancelled');

      const productSummary: Record<string, any> = {};
      activeTasks.forEach(t => {
        const prod = (t.title || 'Unknown Product').trim();
        if (isOthersProduct(prod)) return; // OTHERS products are not influencer campaign tasks
        if (!productSummary[prod]) {
           productSummary[prod] = { 
             published: 0, 
             week1Published: 0, 
             week2Published: 0, 
             week3Published: 0, 
             week4Published: 0, 
             week5Published: 0, 
             awaitingRelease: 0, 
             spent: 0, 
             sampleCost: 0, 
             mediaRight: 0 
           };
        }
        if (isReleased(t)) {
          productSummary[prod].published += 1;
          productSummary[prod].spent += (t.remuneration || 0);
          productSummary[prod].sampleCost += (t.sampleCost || 0);
          productSummary[prod].mediaRight += (t.mediaRightAmount || 0);

          const w = getTaskWeek(t);
          if (w === 1) productSummary[prod].week1Published = (productSummary[prod].week1Published || 0) + 1;
          else if (w === 2) productSummary[prod].week2Published = (productSummary[prod].week2Published || 0) + 1;
          else if (w === 3) productSummary[prod].week3Published = (productSummary[prod].week3Published || 0) + 1;
          else if (w === 4) productSummary[prod].week4Published = (productSummary[prod].week4Published || 0) + 1;
          else if (w === 5) productSummary[prod].week5Published = (productSummary[prod].week5Published || 0) + 1;
        }
      });

      const monthMap: Record<string, number> = {
        'january': 1, 'jan': 1, '1': 1, '01': 1,
        'february': 2, 'feb': 2, '2': 2, '02': 2,
        'march': 3, 'mar': 3, '3': 3, '03': 3,
        'april': 4, 'apr': 4, '4': 4, '04': 4,
        'may': 5, '5': 5, '05': 5,
        'june': 6, 'jun': 6, '6': 6, '06': 6,
        'july': 7, 'jul': 7, '7': 7, '07': 7,
        'august': 8, 'aug': 8, '8': 8, '08': 8,
        'september': 9, 'sep': 9, '9': 9, '09': 9,
        'october': 10, 'oct': 10, '10': 10,
        'november': 11, 'nov': 11, '11': 11,
        'december': 12, 'dec': 12, '12': 12
      };

      // Also ensure any products defined in monthly targets for this active month are included (excluding OTHERS)
      monthlyTargets?.forEach(mt => {
        const matchesYear = currentYearActive === 'ALL' || String(mt.year).trim() === String(currentYearActive).trim();
        let matchesMonth = currentMonthActive === 'ALL';
        if (currentMonthActive !== 'ALL') {
          const tMInt = parseInt(String(mt.month).replace(/\D/g, ''), 10);
          const activeMInt = parseInt(String(currentMonthActive).replace(/\D/g, ''), 10);
          matchesMonth = (!isNaN(tMInt) && !isNaN(activeMInt) && tMInt === activeMInt);
        }
        if (matchesMonth && matchesYear && mt.productName?.trim()) {
          const pName = mt.productName.trim();
          if (isOthersProduct(pName)) return; // Do not include OTHERS from monthly targets without sales dashboard data
          const existingKey = Object.keys(productSummary).find(k => k.toLowerCase() === pName.toLowerCase());
          if (!existingKey) {
            productSummary[pName] = { 
              published: 0, 
              week1Published: 0, 
              week2Published: 0, 
              week3Published: 0, 
              week4Published: 0, 
              week5Published: 0, 
              awaitingRelease: 0, 
              spent: 0, 
              sampleCost: 0, 
              mediaRight: 0 
            };
          }
        }
      });

      // Also ensure any products present in salesData (such as OTHERS 1) are included ONLY IF data is available
      if (salesData && salesData.length > 0) {
        salesData.forEach(row => {
          if (!row.productName) return;
          const pName = row.productName.trim();
          const isOthers = isOthersProduct(pName);
          const matchesYear = currentYearActive === 'ALL' || (row.year && String(row.year).trim() === String(currentYearActive).trim());
          let matchesMonth = currentMonthActive === 'ALL';
          if (currentMonthActive !== 'ALL') {
            const mStr = String(row.month).trim().toLowerCase();
            const mInt = monthMap[mStr] || parseInt(mStr.replace(/\D/g, ''), 10);
            const activeMInt = parseInt(String(currentMonthActive).replace(/\D/g, ''), 10);
            matchesMonth = (!isNaN(mInt) && !isNaN(activeMInt) && mInt === activeMInt);
          }
          if (matchesYear && matchesMonth) {
            const amt = Number(row.netRevenue) || Number(row.grossSales) || 0;
            // For OTHERS products, ONLY include if there are actual non-zero sales in salesData
            if (isOthers && amt <= 0) return;
            const existingKey = Object.keys(productSummary).find(k => k.toLowerCase() === pName.toLowerCase());
            if (!existingKey) {
              productSummary[pName] = { 
                published: 0, 
                week1Published: 0, 
                week2Published: 0, 
                week3Published: 0, 
                week4Published: 0, 
                week5Published: 0, 
                awaitingRelease: 0, 
                spent: 0, 
                sampleCost: 0, 
                mediaRight: 0 
              };
            }
          }
        });
      }

      // Also ensure any products present in the Video Dashboard Planning Schedule are included (excluding OTHERS)
      scheduleTasks.forEach(t => {
        const prod = (t.title || 'Unknown Product').trim();
        if (isOthersProduct(prod)) return; // Never include OTHERS from video schedule tasks
        const existingKey = Object.keys(productSummary).find(k => k.toLowerCase() === prod.toLowerCase());
        if (!existingKey) {
          productSummary[prod] = { 
            published: 0, 
            week1Published: 0, 
            week2Published: 0, 
            week3Published: 0, 
            week4Published: 0, 
            week5Published: 0, 
            awaitingRelease: 0, 
            spent: 0, 
            sampleCost: 0, 
            mediaRight: 0 
          };
        }
      });
      
      let overallTotalSampleCost = 0;
      let overallTotalMediaRight = 0;
      let overallTotalRevenueAchieved = 0;
      let overallTotalRevenueForROAS = 0;
      let overallTotalRevenueTarget = 0;
      let overallTotalVideoTarget = 0;

      Object.keys(productSummary).forEach(prod => {
        const ps = productSummary[prod];
        const isOthers = isOthersProduct(prod);
        
        // Find Targets
        const activeMInt = parseInt(String(currentMonthActive).replace(/\D/g, ''), 10);
        const mt = monthlyTargets?.find(m => {
          if (m.productName?.trim().toLowerCase() !== prod.toLowerCase()) return false;
          if (currentYearActive !== 'ALL' && m.year && String(m.year).trim() !== String(currentYearActive).trim()) return false;
          if (currentMonthActive !== 'ALL') {
            const tMInt = parseInt(String(m.month).replace(/\D/g, ''), 10);
            if (!isNaN(tMInt) && !isNaN(activeMInt) && tMInt !== activeMInt) return false;
          }
          return true;
        });
        const dp = dashboardProducts?.find(p => p.name?.trim().toLowerCase() === prod.toLowerCase());
        
        ps.videoTarget = isOthers ? 0 : (mt ? (mt.videoTarget ?? mt.target) : (dp?.target || 0));
        ps.revenueTarget = isOthers ? 0 : (dp?.revenueTarget || 0);
        let revAchieved = isOthers ? 0 : (mt ? (mt.salesAmount || 0) : 0);

        // Aggregate from salesData if revAchieved is 0 or if salesData is available
        let salesWeek1 = 0;
        let salesWeek2 = 0;
        let salesWeek3 = 0;
        let salesWeek4 = 0;
        let salesWeek5 = 0;

        if (salesData && salesData.length > 0) {
          let salesFromData = 0;
          salesData.forEach(row => {
            if (!row.productName || row.productName.trim().toLowerCase() !== prod.toLowerCase()) return;
            const matchesYear = currentYearActive === 'ALL' || (row.year && String(row.year).trim() === String(currentYearActive).trim());
            let matchesMonth = currentMonthActive === 'ALL';
            if (currentMonthActive !== 'ALL') {
              const mStr = String(row.month).trim().toLowerCase();
              const mInt = monthMap[mStr] || parseInt(mStr.replace(/\D/g, ''), 10);
              matchesMonth = (!isNaN(mInt) && !isNaN(activeMInt) && mInt === activeMInt);
            }
            if (matchesYear && matchesMonth) {
              const amt = Number(row.netRevenue) || Number(row.grossSales) || 0;
              salesFromData += amt;

              let weekNum = 0;
              const match = String(row.week).match(/\d+/);
              if (match) weekNum = parseInt(match[0], 10);
              if (weekNum === 1) salesWeek1 += amt;
              else if (weekNum === 2) salesWeek2 += amt;
              else if (weekNum === 3) salesWeek3 += amt;
              else if (weekNum === 4) salesWeek4 += amt;
              else if (weekNum === 5) salesWeek5 += amt;
            }
          });
          if (salesFromData > 0) {
            revAchieved = salesFromData;
          }
        }

        // If weekly sales from salesData were 0, check monthlyTargets (NEVER for OTHERS)
        if (!isOthers && salesWeek1 === 0 && salesWeek2 === 0 && salesWeek3 === 0 && salesWeek4 === 0 && salesWeek5 === 0 && monthlyTargets) {
          const matchingTargets = monthlyTargets.filter(m => {
            if (m.productName?.trim().toLowerCase() !== prod.toLowerCase()) return false;
            if (currentYearActive !== 'ALL' && m.year && String(m.year).trim() !== String(currentYearActive).trim()) return false;
            if (currentMonthActive !== 'ALL') {
              const tMInt = parseInt(String(m.month).replace(/\D/g, ''), 10);
              if (!isNaN(tMInt) && !isNaN(activeMInt) && tMInt !== activeMInt) return false;
            }
            return true;
          });
          matchingTargets.forEach(m => {
            salesWeek1 += (m.salesAmountWeek1 || 0);
            salesWeek2 += (m.salesAmountWeek2 || 0);
            salesWeek3 += (m.salesAmountWeek3 || 0);
            salesWeek4 += (m.salesAmountWeek4 || 0);
            salesWeek5 += (m.salesAmountWeek5 || 0);
          });
        }

        ps.salesWeek1 = salesWeek1;
        ps.salesWeek2 = salesWeek2;
        ps.salesWeek3 = salesWeek3;
        ps.salesWeek4 = salesWeek4;
        ps.salesWeek5 = salesWeek5;
        ps.revenueAchieved = isOthers ? (salesWeek1 + salesWeek2 + salesWeek3 + salesWeek4 + salesWeek5) : revAchieved;
        
        // Collect videos to be released directly from Video Dashboard Product-wise Video Planning & Delivery Schedule AWAITING RELEASE details (without synthetic changes)
        const productScheduleTasks = scheduleTasks.filter(
          t => t.title && t.title.trim().toLowerCase() === prod.toLowerCase()
        );
        const awaitingList = productScheduleTasks.filter(t => !isReleased(t));
        ps.awaitingRelease = awaitingList.length;

        const totalCost = ps.spent + ps.sampleCost + ps.mediaRight;
        ps.roas = (!isOthers && totalCost > 0) ? (ps.revenueAchieved / totalCost).toFixed(2) : '0.00';
        
        overallTotalSampleCost += ps.sampleCost;
        overallTotalMediaRight += ps.mediaRight;
        overallTotalRevenueAchieved += ps.revenueAchieved;
        if (!isOthers) {
          overallTotalRevenueForROAS += ps.revenueAchieved;
        }
        overallTotalRevenueTarget += ps.revenueTarget;
        overallTotalVideoTarget += ps.videoTarget;
      });

      const totalAwaitingRelease = Object.values(productSummary).reduce((sum: number, ps: any) => sum + (ps.awaitingRelease || 0), 0);
      const totalAwaitingReleaseRemuneration = scheduleTasks
        .filter(t => !isReleased(t) && !isOthersProduct((t.title || '').trim()))
        .reduce((sum, t) => sum + (t.remuneration || 0), 0);

      const budgetEntry = monthlyBudgets?.find(b => {
        const bMonth = String(b.month || '').trim().toLowerCase();
        const bYear = String(b.year || '').trim();
        const actM = String(currentMonthActive || '').trim().toLowerCase();
        const actY = String(currentYearActive || '').trim();
        const mMatch = (bMonth === actM) || (parseInt(bMonth, 10) === parseInt(actM, 10));
        const yMatch = (bYear === actY);
        return mMatch && yMatch;
      }) || monthlyBudgets?.find(b => b.month === currentMonthActive && b.year === currentYearActive);

      const currentMonthlyBudget = budgetEntry ? Number(budgetEntry.budget || 0) : 0;
      const remainingBalance = currentMonthlyBudget - totalAmountSpent;
      const remainingBalanceStr = remainingBalance < 0 
        ? `(${Math.abs(remainingBalance).toLocaleString('en-IN')})` 
        : remainingBalance.toLocaleString('en-IN');

      const overallTotalCost = totalAmountSpent + overallTotalSampleCost + overallTotalMediaRight;
      const overallROAS = overallTotalCost > 0 ? (overallTotalRevenueForROAS / overallTotalCost).toFixed(2) : '0.00';

      const delivHeaderRow = 0;
      const delivDataStartRow = 1;
      const delivDataEndRow = 1 + tasksToExport.length;
      const delivTotalRow = 1 + tasksToExport.length;

      // Spacer 1
      const spacer1Row = sheetData.length;
      sheetData.push([]);

      // Section 2: MONTHLY PLANNER SUMMARY (Original Clean Design)
      const sortedProdKeys = Object.keys(productSummary).sort();

      const summaryTitleRow = sheetData.length;
      sheetData.push(['MONTHLY PLANNER SUMMARY', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
      const summaryDataStartRow = sheetData.length;
      sheetData.push(['Total Videos Target', overallTotalVideoTarget.toString()]);
      sheetData.push(['Total Videos Achieved', totalPublishedVideos.toString()]);

      // Product-wise video release breakdown directly after Total Videos Achieved and before Total Number of Awaiting Release
      sortedProdKeys.forEach(prod => {
        if (isOthersProduct(prod)) return;
        const ps = productSummary[prod];
        const releasedCount = ps?.published || 0;
        sheetData.push([prod, releasedCount.toString()]);
      });

      sheetData.push(['Total Number of Awaiting Release', totalAwaitingRelease.toString()]);
      sheetData.push(['Awaiting Release Remuneration', totalAwaitingReleaseRemuneration.toLocaleString('en-IN')]);
      sheetData.push(['Total Revenue Target', overallTotalRevenueTarget.toLocaleString('en-IN')]);
      sheetData.push(['Total Revenue Achieved', overallTotalRevenueAchieved.toLocaleString('en-IN')]);
      sheetData.push(['Total Remuneration Spent', totalAmountSpent.toLocaleString('en-IN')]);
      sheetData.push(['Total Sample Cost', overallTotalSampleCost.toLocaleString('en-IN')]);
      sheetData.push(['Total Media Right', overallTotalMediaRight.toLocaleString('en-IN')]);
      sheetData.push(['Overall ROAS', overallROAS]);
      sheetData.push(['Total Monthly Budget', currentMonthlyBudget.toLocaleString('en-IN')]);
      sheetData.push(['Remaining Balance', remainingBalanceStr]);

      // If Awaiting Release Remuneration overtakes the Monthly Budget (or Remaining Balance), show the difference
      let budgetOvertakeRowIndex = -1;
      let projectedOvertakeRowIndex = -1;
      if (currentMonthlyBudget > 0) {
        if (totalAwaitingReleaseRemuneration > currentMonthlyBudget) {
          budgetOvertakeRowIndex = sheetData.length;
          const overtakeDiff = totalAwaitingReleaseRemuneration - currentMonthlyBudget;
          sheetData.push(['Budget Overtake Difference', overtakeDiff.toLocaleString('en-IN')]);
          if (totalAmountSpent > 0) {
            projectedOvertakeRowIndex = sheetData.length;
            const projDiff = (totalAmountSpent + totalAwaitingReleaseRemuneration) - currentMonthlyBudget;
            sheetData.push(['Total Spend Overtake Difference', projDiff.toLocaleString('en-IN')]);
          }
        } else if ((totalAmountSpent + totalAwaitingReleaseRemuneration) > currentMonthlyBudget) {
          budgetOvertakeRowIndex = sheetData.length;
          const overtakeDiff = (totalAmountSpent + totalAwaitingReleaseRemuneration) - currentMonthlyBudget;
          sheetData.push(['Budget Overtake Difference', overtakeDiff.toLocaleString('en-IN')]);
        }
      }
      const summaryDataEndRow = sheetData.length;
      
      // Spacer 2
      const spacer2Row = sheetData.length;
      sheetData.push([]);

      const breakdownTitleRow = sheetData.length;
      sheetData.push(['BREAKDOWN PER PRODUCT', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
      const breakdownAccentRow = sheetData.length;
      sheetData.push(['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
      const breakdownHeaderRow = sheetData.length;
      sheetData.push([
        'PRODUCTS', 
        'Target Videos', 
        'Week 1', 
        'Week 2', 
        'Week 3', 
        'Week 4', 
        'Week 5', 
        'MTD', 
        'Variation', 
        'Variation %',
        'Remuneration', 
        'Media Right', 
        'Sample Cost', 
        'Total Spend', 
        'Revenue Target', 
        'MTD', 
        'Variation', 
        'Variation %', 
        'RoAS'
      ]);

      const breakdownDataStartRow = sheetData.length;
      let sumTargetVideos = 0;
      let sumW1 = 0;
      let sumW2 = 0;
      let sumW3 = 0;
      let sumW4 = 0;
      let sumW5 = 0;
      let sumMTDVideos = 0;
      let sumRemuneration = 0;
      let sumMediaRight = 0;
      let sumSampleCost = 0;
      let sumTotalSpend = 0;
      let sumRevTarget = 0;
      let sumRevMTD = 0;
      let sumRevMTDForRoas = 0;

      sortedProdKeys.forEach(prod => {
         const ps = productSummary[prod];
         const isOthers = isOthersProduct(prod);

         const othersW1 = isOthers ? (ps.salesWeek1 || 0) : 0;
         const othersW2 = isOthers ? (ps.salesWeek2 || 0) : 0;
         const othersW3 = isOthers ? (ps.salesWeek3 || 0) : 0;
         const othersW4 = isOthers ? (ps.salesWeek4 || 0) : 0;
         const othersW5 = isOthers ? (ps.salesWeek5 || 0) : 0;
         const othersMTD = isOthers 
           ? (othersW1 + othersW2 + othersW3 + othersW4 + othersW5)
           : 0;

         // If isOthers has NO sales from Sales Dashboard, do NOT show it anywhere in the extract
         if (isOthers && othersMTD === 0 && (ps.revenueAchieved || 0) === 0) {
           return;
         }

         const targetVideos = isOthers ? 0 : (ps.videoTarget || 0);
         const w1 = isOthers ? othersW1 : (ps.week1Published || 0);
         const w2 = isOthers ? othersW2 : (ps.week2Published || 0);
         const w3 = isOthers ? othersW3 : (ps.week3Published || 0);
         const w4 = isOthers ? othersW4 : (ps.week4Published || 0);
         const w5 = isOthers ? othersW5 : (ps.week5Published || 0);
         const mtdVideos = isOthers ? othersMTD : (ps.published || 0);
         const vidVariation = isOthers ? 0 : (mtdVideos - targetVideos);
         const vidVariationPctVal = (!isOthers && targetVideos > 0) ? (vidVariation / targetVideos) * 100 : 0;
         const vidVariationPct = isOthers 
           ? "0" 
           : (vidVariationPctVal > 0 
               ? `+${vidVariationPctVal.toFixed(2)}%` 
               : (vidVariationPctVal < 0 ? `${vidVariationPctVal.toFixed(2)}%` : '0.00%'));

         const remuneration = ps.spent || 0;
         const mediaRight = ps.mediaRight || 0;
         const sampleCost = ps.sampleCost || 0;
         const totalSpend = remuneration + mediaRight + sampleCost;

         const revTarget = isOthers ? 0 : (ps.revenueTarget || 0);
         const revMTD = ps.revenueAchieved || 0;
         const revVariation = isOthers ? 0 : (revMTD - revTarget);
         const revVariationPctVal = (!isOthers && revTarget > 0) ? (revVariation / revTarget) * 100 : 0;
         const revVariationPct = isOthers 
           ? "0" 
           : (revVariationPctVal > 0 
               ? `+${revVariationPctVal.toFixed(2)}%` 
               : (revVariationPctVal < 0 ? `${revVariationPctVal.toFixed(2)}%` : '0.00%'));
         const roas = (!isOthers && totalSpend > 0) ? (revMTD / totalSpend).toFixed(2) : '0.00';

         if (!isOthers) {
           sumTargetVideos += targetVideos;
           sumW1 += w1;
           sumW2 += w2;
           sumW3 += w3;
           sumW4 += w4;
           sumW5 += w5;
           sumMTDVideos += mtdVideos;
           sumRevMTDForRoas += revMTD;
         }
         sumRemuneration += remuneration;
         sumMediaRight += mediaRight;
         sumSampleCost += sampleCost;
         sumTotalSpend += totalSpend;
         sumRevTarget += revTarget;
         sumRevMTD += revMTD;

         const formatNum = (val: number) => {
           if (val === 0) return "0";
           return Number.isInteger(val) ? val.toString() : Number(val.toFixed(2)).toString();
         };

         sheetData.push([
           prod, 
           isOthers ? "0" : targetVideos.toString(), 
           formatNum(w1),
           formatNum(w2),
           formatNum(w3),
           formatNum(w4),
           formatNum(w5),
           formatNum(mtdVideos),
           isOthers ? "0" : (vidVariation > 0 ? `+${vidVariation}` : vidVariation.toString()),
           isOthers ? "0" : vidVariationPct,
           remuneration.toLocaleString('en-IN'),
           mediaRight.toLocaleString('en-IN'),
           sampleCost.toLocaleString('en-IN'),
           totalSpend.toLocaleString('en-IN'),
           isOthers ? "0" : revTarget.toLocaleString('en-IN'),
           revMTD.toLocaleString('en-IN'),
           isOthers ? "0" : (revVariation >= 0 ? `+${revVariation.toLocaleString('en-IN')}` : `-${Math.abs(revVariation).toLocaleString('en-IN')}`),
           isOthers ? "0" : revVariationPct,
           roas
         ]);
      });
      const breakdownDataEndRow = sheetData.length;

      const totalVidVariation = sumMTDVideos - sumTargetVideos;
      const totalVidVariationPctVal = sumTargetVideos > 0 ? (totalVidVariation / sumTargetVideos) * 100 : 0;
      const totalVidVariationPct = totalVidVariationPctVal > 0 
        ? `+${totalVidVariationPctVal.toFixed(2)}%` 
        : (totalVidVariationPctVal < 0 ? `${totalVidVariationPctVal.toFixed(2)}%` : '0.00%');

      const totalRevVariation = sumRevMTD - sumRevTarget;
      const totalRevVariationPctVal = sumRevTarget > 0 ? (totalRevVariation / sumRevTarget) * 100 : 0;
      const totalRevVariationPct = totalRevVariationPctVal > 0 
        ? `+${totalRevVariationPctVal.toFixed(2)}%` 
        : (totalRevVariationPctVal < 0 ? `${totalRevVariationPctVal.toFixed(2)}%` : '0.00%');
      const tableOverallRoas = sumTotalSpend > 0 ? (sumRevMTDForRoas / sumTotalSpend).toFixed(2) : '0.00';

      const breakdownTotalRow = sheetData.length;
      sheetData.push([
        'TOTAL',
        sumTargetVideos.toString(),
        sumW1.toString(),
        sumW2.toString(),
        sumW3.toString(),
        sumW4.toString(),
        sumW5.toString(),
        sumMTDVideos.toString(),
        totalVidVariation > 0 ? `+${totalVidVariation}` : totalVidVariation.toString(),
        totalVidVariationPct,
        sumRemuneration.toLocaleString('en-IN'),
        sumMediaRight.toLocaleString('en-IN'),
        sumSampleCost.toLocaleString('en-IN'),
        sumTotalSpend.toLocaleString('en-IN'),
        sumRevTarget.toLocaleString('en-IN'),
        sumRevMTD.toLocaleString('en-IN'),
        totalRevVariation >= 0 ? `+${totalRevVariation.toLocaleString('en-IN')}` : `-${Math.abs(totalRevVariation).toLocaleString('en-IN')}`,
        totalRevVariationPct,
        tableOverallRoas
      ]);

      // Spacer 3
      const spacer3Row = sheetData.length;
      sheetData.push([]);
      const awaitingTitleRow = sheetData.length;
      sheetData.push(['AWAITING RELEASE DETAILS', '', '', '']);
      const awaitingHeaderRow = sheetData.length;
      sheetData.push([
        'Product Name',
        'Total Videos to be Released',
        'Influencer Name',
        'Remuneration'
      ]);

      const awaitingDataStartRow = sheetData.length;
      const sortedProducts = Object.keys(productSummary).sort();
      let grandTotalAwaiting = 0;
      let grandTotalAwaitingRemuneration = 0;
      if (sortedProducts.length === 0) {
        sheetData.push(['No products found', '0', '-', '0']);
      } else {
        sortedProducts.forEach(prod => {
          const ps = productSummary[prod];
          const awaitingCount = ps.awaitingRelease || 0;
          if (isOthersProduct(prod)) {
            return;
          }
          grandTotalAwaiting += awaitingCount;

          const productAwaitingTasks = scheduleTasks.filter(
            t => t.title && t.title.trim().toLowerCase() === prod.toLowerCase() && !isReleased(t)
          );

          // Group by influencer for this product so each influencer gets their own row
          const influencerVideoCounts: Record<string, number> = {};
          const influencerRemuneration: Record<string, number> = {};
          productAwaitingTasks.forEach((t: any) => {
            const inf = influencers.find((i: any) => i.id === t.influencerId);
            const name = inf ? inf.name : (t.secondaryInfluencerName || t.influencerName || 'Unknown');
            if (name) {
              influencerVideoCounts[name] = (influencerVideoCounts[name] || 0) + 1;
              influencerRemuneration[name] = (influencerRemuneration[name] || 0) + (t.remuneration || 0);
            }
          });

          const uniqueInfluencers = Object.keys(influencerVideoCounts).sort();

          if (uniqueInfluencers.length === 0) {
            sheetData.push([
              prod,
              awaitingCount.toString(),
              '-',
              '0'
            ]);
          } else {
            uniqueInfluencers.forEach(infName => {
              const rem = influencerRemuneration[infName] || 0;
              grandTotalAwaitingRemuneration += rem;
              sheetData.push([
                prod,
                influencerVideoCounts[infName].toString(),
                infName,
                rem > 0 ? rem.toLocaleString('en-IN') : '0'
              ]);
            });
          }
        });
      }
      const awaitingDataEndRow = sheetData.length;

      const awaitingTotalRow = sheetData.length;
      sheetData.push([
        'Total Awaiting Release',
        grandTotalAwaiting.toString(),
        '',
        grandTotalAwaitingRemuneration > 0 ? grandTotalAwaitingRemuneration.toLocaleString('en-IN') : '0'
      ]);
      // --- END SUMMARY ---

      // 3. Write data to the spreadsheet
      const writeResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          valueInputOption: 'USER_ENTERED',
          data: [
            {
              range: `'${firstSheetName}'!A1`,
              majorDimension: 'ROWS',
              values: sheetData
            }
          ]
        })
      });

      if (!writeResponse.ok) {
        const errorText = await writeResponse.text();
        throw new Error(`Failed to write values: ${writeResponse.statusText}. Details: ${errorText}`);
      }

      // 4. Build formatting requests to style sheet matching REPORT SAMPLE.png and create distinct vibrant view
      const formatRequests: any[] = [];
      const cWhite = { red: 1.0, green: 1.0, blue: 1.0 };
      const cBlack = { red: 0.0, green: 0.0, blue: 0.0 };
      const cLightBorder = { red: 0.82, green: 0.82, blue: 0.82 };
      const cSubtleBorder = { red: 0.90, green: 0.90, blue: 0.90 };

      // Section 1: Deliverables Table Styling
      // Royal Navy Header
      formatRequests.push({
        repeatCell: {
          range: {
            sheetId: firstSheetId,
            startRowIndex: delivHeaderRow,
            endRowIndex: delivHeaderRow + 1,
            startColumnIndex: 0,
            endColumnIndex: 21
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.118, green: 0.251, blue: 0.686 }, // Royal Navy #1e40af
              textFormat: { bold: true, foregroundColor: cWhite, fontSize: 10 },
              horizontalAlignment: 'CENTER',
              verticalAlignment: 'MIDDLE'
            }
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
        }
      });

      // Deliverables Total / Averages Row
      formatRequests.push({
        repeatCell: {
          range: {
            sheetId: firstSheetId,
            startRowIndex: delivTotalRow,
            endRowIndex: delivTotalRow + 1,
            startColumnIndex: 0,
            endColumnIndex: 21
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.878, green: 0.906, blue: 1.0 }, // Soft Indigo/Periwinkle #e0e7ff
              textFormat: { bold: true, foregroundColor: { red: 0.12, green: 0.16, blue: 0.38 }, fontSize: 10 },
              verticalAlignment: 'MIDDLE'
            }
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,verticalAlignment)'
        }
      });

      // Deliverables Grid Borders
      formatRequests.push({
        updateBorders: {
          range: {
            sheetId: firstSheetId,
            startRowIndex: delivHeaderRow,
            endRowIndex: delivTotalRow + 1,
            startColumnIndex: 0,
            endColumnIndex: 21
          },
          top: { style: 'SOLID', color: cLightBorder },
          bottom: { style: 'SOLID', color: cLightBorder },
          left: { style: 'SOLID', color: cLightBorder },
          right: { style: 'SOLID', color: cLightBorder },
          innerHorizontal: { style: 'SOLID', color: cSubtleBorder },
          innerVertical: { style: 'SOLID', color: cSubtleBorder }
        }
      });

      // Section 2: Monthly Planner Summary Styling (Original Exact Color & Design)
      // Deep Teal Header Banner (#0f766e)
      formatRequests.push({
        repeatCell: {
          range: {
            sheetId: firstSheetId,
            startRowIndex: summaryTitleRow,
            endRowIndex: summaryTitleRow + 1,
            startColumnIndex: 0,
            endColumnIndex: 2
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.059, green: 0.463, blue: 0.431 }, // Deep Teal #0f766e
              textFormat: { bold: true, foregroundColor: cWhite, fontSize: 11 },
              verticalAlignment: 'MIDDLE'
            }
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,verticalAlignment)'
        }
      });

      // Soft Teal Background for Column A Labels (#f0fdfa)
      formatRequests.push({
        repeatCell: {
          range: {
            sheetId: firstSheetId,
            startRowIndex: summaryDataStartRow,
            endRowIndex: summaryDataEndRow,
            startColumnIndex: 0,
            endColumnIndex: 1
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.941, green: 0.992, blue: 0.980 }, // Soft Teal #f0fdfa
              textFormat: { bold: true, foregroundColor: { red: 0.08, green: 0.20, blue: 0.20 }, fontSize: 10 },
              verticalAlignment: 'MIDDLE'
            }
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,verticalAlignment)'
        }
      });

      // White Background for Column B Values with Right Alignment
      formatRequests.push({
        repeatCell: {
          range: {
            sheetId: firstSheetId,
            startRowIndex: summaryDataStartRow,
            endRowIndex: summaryDataEndRow,
            startColumnIndex: 1,
            endColumnIndex: 2
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: cWhite,
              textFormat: { bold: true, foregroundColor: cBlack, fontSize: 10 },
              horizontalAlignment: 'RIGHT',
              verticalAlignment: 'MIDDLE'
            }
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
        }
      });

      // Special Highlight for Budget Overtake Rows if present (Soft Rose #fef2f2 with Dark Red Text)
      const highlightOvertakeRow = (rowIdx: number) => {
        if (rowIdx < 0) return;
        formatRequests.push({
          repeatCell: {
            range: {
              sheetId: firstSheetId,
              startRowIndex: rowIdx,
              endRowIndex: rowIdx + 1,
              startColumnIndex: 0,
              endColumnIndex: 1
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.996, green: 0.945, blue: 0.945 },
                textFormat: { bold: true, foregroundColor: { red: 0.6, green: 0.1, blue: 0.1 }, fontSize: 10 },
                verticalAlignment: 'MIDDLE'
              }
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat,verticalAlignment)'
          }
        });
        formatRequests.push({
          repeatCell: {
            range: {
              sheetId: firstSheetId,
              startRowIndex: rowIdx,
              endRowIndex: rowIdx + 1,
              startColumnIndex: 1,
              endColumnIndex: 2
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.996, green: 0.945, blue: 0.945 },
                textFormat: { bold: true, foregroundColor: { red: 0.75, green: 0.1, blue: 0.1 }, fontSize: 10 },
                horizontalAlignment: 'RIGHT',
                verticalAlignment: 'MIDDLE'
              }
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
          }
        });
      };
      highlightOvertakeRow(budgetOvertakeRowIndex);
      highlightOvertakeRow(projectedOvertakeRowIndex);

      // Borders for Monthly Planner Summary Table
      formatRequests.push({
        updateBorders: {
          range: {
            sheetId: firstSheetId,
            startRowIndex: summaryTitleRow,
            endRowIndex: summaryDataEndRow,
            startColumnIndex: 0,
            endColumnIndex: 2
          },
          top: { style: 'SOLID', color: cLightBorder },
          bottom: { style: 'SOLID', color: cLightBorder },
          left: { style: 'SOLID', color: cLightBorder },
          right: { style: 'SOLID', color: cLightBorder },
          innerHorizontal: { style: 'SOLID', color: cSubtleBorder },
          innerVertical: { style: 'SOLID', color: cSubtleBorder }
        }
      });

      // Section 3: BREAKDOWN PER PRODUCT Styling (EXACT Match to REPORT SAMPLE.png)
      // Title Banner
      formatRequests.push({
        repeatCell: {
          range: {
            sheetId: firstSheetId,
            startRowIndex: breakdownTitleRow,
            endRowIndex: breakdownTitleRow + 1,
            startColumnIndex: 0,
            endColumnIndex: 19
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.078, green: 0.325, blue: 0.176 }, // Dark Forest Green #14532d
              textFormat: { bold: true, foregroundColor: cWhite, fontSize: 11 },
              verticalAlignment: 'MIDDLE'
            }
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,verticalAlignment)'
        }
      });

      // Sky Blue Accent Bar (matching REPORT SAMPLE.png #6fa8dc)
      formatRequests.push({
        repeatCell: {
          range: {
            sheetId: firstSheetId,
            startRowIndex: breakdownAccentRow,
            endRowIndex: breakdownAccentRow + 1,
            startColumnIndex: 0,
            endColumnIndex: 19
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.435, green: 0.659, blue: 0.863 }, // Sky Blue #6fa8dc
              verticalAlignment: 'MIDDLE'
            }
          },
          fields: 'userEnteredFormat(backgroundColor,verticalAlignment)'
        }
      });

      // Forest Green Header Row (matching REPORT SAMPLE.png #274e13)
      formatRequests.push({
        repeatCell: {
          range: {
            sheetId: firstSheetId,
            startRowIndex: breakdownHeaderRow,
            endRowIndex: breakdownHeaderRow + 1,
            startColumnIndex: 0,
            endColumnIndex: 19
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.153, green: 0.306, blue: 0.075 }, // Forest Green #274e13
              textFormat: { bold: true, foregroundColor: cWhite, fontSize: 10 },
              horizontalAlignment: 'CENTER',
              verticalAlignment: 'MIDDLE'
            }
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
        }
      });

      // Left-align 'PRODUCTS' header cell
      formatRequests.push({
        repeatCell: {
          range: {
            sheetId: firstSheetId,
            startRowIndex: breakdownHeaderRow,
            endRowIndex: breakdownHeaderRow + 1,
            startColumnIndex: 0,
            endColumnIndex: 1
          },
          cell: {
            userEnteredFormat: {
              horizontalAlignment: 'LEFT'
            }
          },
          fields: 'userEnteredFormat(horizontalAlignment)'
        }
      });

      // Data Rows Formatting
      if (breakdownDataEndRow > breakdownDataStartRow) {
        // Base white cells with right-alignment for values
        formatRequests.push({
          repeatCell: {
            range: {
              sheetId: firstSheetId,
              startRowIndex: breakdownDataStartRow,
              endRowIndex: breakdownDataEndRow,
              startColumnIndex: 0,
              endColumnIndex: 19
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: cWhite,
                textFormat: { fontSize: 10, foregroundColor: cBlack },
                horizontalAlignment: 'RIGHT',
                verticalAlignment: 'MIDDLE'
              }
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
          }
        });

        // PRODUCTS column (Col 0) - Bold, left aligned
        formatRequests.push({
          repeatCell: {
            range: {
              sheetId: firstSheetId,
              startRowIndex: breakdownDataStartRow,
              endRowIndex: breakdownDataEndRow,
              startColumnIndex: 0,
              endColumnIndex: 1
            },
            cell: {
              userEnteredFormat: {
                textFormat: { bold: true, fontSize: 10, foregroundColor: cBlack },
                horizontalAlignment: 'LEFT'
              }
            },
            fields: 'userEnteredFormat(textFormat,horizontalAlignment)'
          }
        });

        // Video quantities (Cols 1..7: Target Videos, Week 1-5, MTD) - Center aligned
        formatRequests.push({
          repeatCell: {
            range: {
              sheetId: firstSheetId,
              startRowIndex: breakdownDataStartRow,
              endRowIndex: breakdownDataEndRow,
              startColumnIndex: 1,
              endColumnIndex: 8
            },
            cell: {
              userEnteredFormat: {
                horizontalAlignment: 'CENTER'
              }
            },
            fields: 'userEnteredFormat(horizontalAlignment)'
          }
        });

        // Video Variation (Col 8) - Soft Sky Blue, bold, center aligned
        formatRequests.push({
          repeatCell: {
            range: {
              sheetId: firstSheetId,
              startRowIndex: breakdownDataStartRow,
              endRowIndex: breakdownDataEndRow,
              startColumnIndex: 8,
              endColumnIndex: 9
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.812, green: 0.886, blue: 0.953 }, // Soft Sky Blue #cfe2f3
                textFormat: { bold: true, fontSize: 10, foregroundColor: cBlack },
                horizontalAlignment: 'CENTER'
              }
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
          }
        });

        // Video Variation % (Col 9) - Soft Periwinkle, bold, center aligned
        formatRequests.push({
          repeatCell: {
            range: {
              sheetId: firstSheetId,
              startRowIndex: breakdownDataStartRow,
              endRowIndex: breakdownDataEndRow,
              startColumnIndex: 9,
              endColumnIndex: 10
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.788, green: 0.855, blue: 0.973 }, // Soft Periwinkle #c9daf8
                textFormat: { bold: true, fontSize: 10, foregroundColor: cBlack },
                horizontalAlignment: 'CENTER'
              }
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
          }
        });

        // Total Spend column (Col 13) - Peach/Orange #f9cb9c (from REPORT SAMPLE.png)
        formatRequests.push({
          repeatCell: {
            range: {
              sheetId: firstSheetId,
              startRowIndex: breakdownDataStartRow,
              endRowIndex: breakdownDataEndRow,
              startColumnIndex: 13,
              endColumnIndex: 14
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.976, green: 0.796, blue: 0.612 }, // Peach #f9cb9c
                textFormat: { bold: true, fontSize: 10, foregroundColor: cBlack },
                horizontalAlignment: 'RIGHT'
              }
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
          }
        });

        // Revenue Target column (Col 14) - Lavender/Purple #b4a7d6 (from REPORT SAMPLE.png)
        formatRequests.push({
          repeatCell: {
            range: {
              sheetId: firstSheetId,
              startRowIndex: breakdownDataStartRow,
              endRowIndex: breakdownDataEndRow,
              startColumnIndex: 14,
              endColumnIndex: 15
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.706, green: 0.655, blue: 0.839 }, // Lavender #b4a7d6
                textFormat: { bold: true, fontSize: 10, foregroundColor: cBlack },
                horizontalAlignment: 'RIGHT'
              }
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
          }
        });

        // MTD Revenue column (Col 15) - Bright Yellow #ffff00 (from REPORT SAMPLE.png)
        formatRequests.push({
          repeatCell: {
            range: {
              sheetId: firstSheetId,
              startRowIndex: breakdownDataStartRow,
              endRowIndex: breakdownDataEndRow,
              startColumnIndex: 15,
              endColumnIndex: 16
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 1.0, green: 1.0, blue: 0.0 }, // Bright Yellow #ffff00
                textFormat: { bold: true, fontSize: 10, foregroundColor: cBlack },
                horizontalAlignment: 'RIGHT'
              }
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
          }
        });

        // Revenue Variation (Col 16) - Soft Green #b6d7a8, bold, right aligned
        formatRequests.push({
          repeatCell: {
            range: {
              sheetId: firstSheetId,
              startRowIndex: breakdownDataStartRow,
              endRowIndex: breakdownDataEndRow,
              startColumnIndex: 16,
              endColumnIndex: 17
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.714, green: 0.843, blue: 0.659 }, // Soft Green #b6d7a8
                textFormat: { bold: true, fontSize: 10, foregroundColor: cBlack },
                horizontalAlignment: 'RIGHT'
              }
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
          }
        });

        // Revenue Variation % (Col 17) - Soft Mint #d9ead3, bold, right aligned
        formatRequests.push({
          repeatCell: {
            range: {
              sheetId: firstSheetId,
              startRowIndex: breakdownDataStartRow,
              endRowIndex: breakdownDataEndRow,
              startColumnIndex: 17,
              endColumnIndex: 18
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.851, green: 0.918, blue: 0.827 }, // Soft Mint #d9ead3
                textFormat: { bold: true, fontSize: 10, foregroundColor: cBlack },
                horizontalAlignment: 'RIGHT'
              }
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
          }
        });

        // RoAS (Col 18) - Golden Amber #ffd966, bold, center aligned
        formatRequests.push({
          repeatCell: {
            range: {
              sheetId: firstSheetId,
              startRowIndex: breakdownDataStartRow,
              endRowIndex: breakdownDataEndRow,
              startColumnIndex: 18,
              endColumnIndex: 19
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 1.0, green: 0.851, blue: 0.400 }, // Golden Amber #ffd966
                textFormat: { bold: true, fontSize: 10, foregroundColor: cBlack },
                horizontalAlignment: 'CENTER'
              }
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
          }
        });
      }

      // TOTAL Row - Bright Cyan/Turquoise #00ffff across all 19 columns (from REPORT SAMPLE.png)
      formatRequests.push({
        repeatCell: {
          range: {
            sheetId: firstSheetId,
            startRowIndex: breakdownTotalRow,
            endRowIndex: breakdownTotalRow + 1,
            startColumnIndex: 0,
            endColumnIndex: 19
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.0, green: 1.0, blue: 1.0 }, // Bright Cyan #00ffff
              textFormat: { bold: true, fontSize: 10, foregroundColor: cBlack },
              horizontalAlignment: 'RIGHT',
              verticalAlignment: 'MIDDLE'
            }
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
        }
      });

      // Align 'TOTAL' label in Col 0 Center
      formatRequests.push({
        repeatCell: {
          range: {
            sheetId: firstSheetId,
            startRowIndex: breakdownTotalRow,
            endRowIndex: breakdownTotalRow + 1,
            startColumnIndex: 0,
            endColumnIndex: 1
          },
          cell: {
            userEnteredFormat: {
              horizontalAlignment: 'CENTER'
            }
          },
          fields: 'userEnteredFormat(horizontalAlignment)'
        }
      });

      // Center-align video quantities, Variation, and Variation % in TOTAL row (Cols 1..10)
      formatRequests.push({
        repeatCell: {
          range: {
            sheetId: firstSheetId,
            startRowIndex: breakdownTotalRow,
            endRowIndex: breakdownTotalRow + 1,
            startColumnIndex: 1,
            endColumnIndex: 10
          },
          cell: {
            userEnteredFormat: {
              horizontalAlignment: 'CENTER'
            }
          },
          fields: 'userEnteredFormat(horizontalAlignment)'
        }
      });
      formatRequests.push({
        repeatCell: {
          range: {
            sheetId: firstSheetId,
            startRowIndex: breakdownTotalRow,
            endRowIndex: breakdownTotalRow + 1,
            startColumnIndex: 18,
            endColumnIndex: 19
          },
          cell: {
            userEnteredFormat: {
              horizontalAlignment: 'CENTER'
            }
          },
          fields: 'userEnteredFormat(horizontalAlignment)'
        }
      });

      // Breakdown Table Grid Borders
      formatRequests.push({
        updateBorders: {
          range: {
            sheetId: firstSheetId,
            startRowIndex: breakdownAccentRow,
            endRowIndex: breakdownTotalRow + 1,
            startColumnIndex: 0,
            endColumnIndex: 19
          },
          top: { style: 'SOLID', color: cLightBorder },
          bottom: { style: 'SOLID', color: cLightBorder },
          left: { style: 'SOLID', color: cLightBorder },
          right: { style: 'SOLID', color: cLightBorder },
          innerHorizontal: { style: 'SOLID', color: cSubtleBorder },
          innerVertical: { style: 'SOLID', color: cSubtleBorder }
        }
      });

      // Section 4: Awaiting Release Details Styling
      // Deep Amber Title
      formatRequests.push({
        repeatCell: {
          range: {
            sheetId: firstSheetId,
            startRowIndex: awaitingTitleRow,
            endRowIndex: awaitingTitleRow + 1,
            startColumnIndex: 0,
            endColumnIndex: 4
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.761, green: 0.255, blue: 0.047 }, // Deep Amber #c2410c
              textFormat: { bold: true, foregroundColor: cWhite, fontSize: 11 },
              verticalAlignment: 'MIDDLE'
            }
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,verticalAlignment)'
        }
      });

      // Tangerine Header
      formatRequests.push({
        repeatCell: {
          range: {
            sheetId: firstSheetId,
            startRowIndex: awaitingHeaderRow,
            endRowIndex: awaitingHeaderRow + 1,
            startColumnIndex: 0,
            endColumnIndex: 4
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.918, green: 0.345, blue: 0.047 }, // Tangerine #ea580c
              textFormat: { bold: true, foregroundColor: cWhite, fontSize: 10 },
              horizontalAlignment: 'CENTER',
              verticalAlignment: 'MIDDLE'
            }
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
        }
      });

      // Left align Product Name header
      formatRequests.push({
        repeatCell: {
          range: {
            sheetId: firstSheetId,
            startRowIndex: awaitingHeaderRow,
            endRowIndex: awaitingHeaderRow + 1,
            startColumnIndex: 0,
            endColumnIndex: 1
          },
          cell: {
            userEnteredFormat: {
              horizontalAlignment: 'LEFT'
            }
          },
          fields: 'userEnteredFormat(horizontalAlignment)'
        }
      });

      // Right align Remuneration header
      formatRequests.push({
        repeatCell: {
          range: {
            sheetId: firstSheetId,
            startRowIndex: awaitingHeaderRow,
            endRowIndex: awaitingHeaderRow + 1,
            startColumnIndex: 3,
            endColumnIndex: 4
          },
          cell: {
            userEnteredFormat: {
              horizontalAlignment: 'RIGHT'
            }
          },
          fields: 'userEnteredFormat(horizontalAlignment)'
        }
      });

      // Data Rows
      if (awaitingDataEndRow > awaitingDataStartRow) {
        formatRequests.push({
          repeatCell: {
            range: {
              sheetId: firstSheetId,
              startRowIndex: awaitingDataStartRow,
              endRowIndex: awaitingDataEndRow,
              startColumnIndex: 0,
              endColumnIndex: 4
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: cWhite,
                textFormat: { fontSize: 10, foregroundColor: cBlack },
                verticalAlignment: 'MIDDLE'
              }
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat,verticalAlignment)'
          }
        });
        formatRequests.push({
          repeatCell: {
            range: {
              sheetId: firstSheetId,
              startRowIndex: awaitingDataStartRow,
              endRowIndex: awaitingDataEndRow,
              startColumnIndex: 1,
              endColumnIndex: 2
            },
            cell: {
              userEnteredFormat: {
                horizontalAlignment: 'CENTER',
                textFormat: { bold: true }
              }
            },
            fields: 'userEnteredFormat(horizontalAlignment,textFormat)'
          }
        });
        formatRequests.push({
          repeatCell: {
            range: {
              sheetId: firstSheetId,
              startRowIndex: awaitingDataStartRow,
              endRowIndex: awaitingDataEndRow,
              startColumnIndex: 3,
              endColumnIndex: 4
            },
            cell: {
              userEnteredFormat: {
                horizontalAlignment: 'RIGHT',
                textFormat: { bold: true }
              }
            },
            fields: 'userEnteredFormat(horizontalAlignment,textFormat)'
          }
        });
      }

      // Total Row - Soft Apricot
      formatRequests.push({
        repeatCell: {
          range: {
            sheetId: firstSheetId,
            startRowIndex: awaitingTotalRow,
            endRowIndex: awaitingTotalRow + 1,
            startColumnIndex: 0,
            endColumnIndex: 4
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.996, green: 0.843, blue: 0.667 }, // Soft Peach #fed7aa
              textFormat: { bold: true, fontSize: 10, foregroundColor: { red: 0.3, green: 0.1, blue: 0.0 } },
              verticalAlignment: 'MIDDLE'
            }
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,verticalAlignment)'
        }
      });
      formatRequests.push({
        repeatCell: {
          range: {
            sheetId: firstSheetId,
            startRowIndex: awaitingTotalRow,
            endRowIndex: awaitingTotalRow + 1,
            startColumnIndex: 1,
            endColumnIndex: 2
          },
          cell: {
            userEnteredFormat: {
              horizontalAlignment: 'CENTER'
            }
          },
          fields: 'userEnteredFormat(horizontalAlignment)'
        }
      });
      formatRequests.push({
        repeatCell: {
          range: {
            sheetId: firstSheetId,
            startRowIndex: awaitingTotalRow,
            endRowIndex: awaitingTotalRow + 1,
            startColumnIndex: 3,
            endColumnIndex: 4
          },
          cell: {
            userEnteredFormat: {
              horizontalAlignment: 'RIGHT',
              textFormat: { bold: true }
            }
          },
          fields: 'userEnteredFormat(horizontalAlignment,textFormat)'
        }
      });

      // Awaiting Release Grid Borders
      formatRequests.push({
        updateBorders: {
          range: {
            sheetId: firstSheetId,
            startRowIndex: awaitingTitleRow,
            endRowIndex: awaitingTotalRow + 1,
            startColumnIndex: 0,
            endColumnIndex: 4
          },
          top: { style: 'SOLID', color: cLightBorder },
          bottom: { style: 'SOLID', color: cLightBorder },
          left: { style: 'SOLID', color: cLightBorder },
          right: { style: 'SOLID', color: cLightBorder },
          innerHorizontal: { style: 'SOLID', color: cSubtleBorder },
          innerVertical: { style: 'SOLID', color: cSubtleBorder }
        }
      });

      // Auto-resize all columns to fit content cleanly
      formatRequests.push({
        autoResizeDimensions: {
          dimensions: {
            sheetId: firstSheetId,
            dimension: 'COLUMNS',
            startIndex: 0,
            endIndex: 21
          }
        }
      });

      // --- ROW HEIGHT MANAGEMENT (Prevents excessive vertical spreading) ---
      // 1. Sleek 12px spacer rows between major sections
      [spacer1Row, spacer2Row, spacer3Row].forEach(rowIdx => {
        formatRequests.push({
          updateDimensionProperties: {
            range: {
              sheetId: firstSheetId,
              dimension: 'ROWS',
              startIndex: rowIdx,
              endIndex: rowIdx + 1
            },
            properties: {
              pixelSize: 16
            },
            fields: 'pixelSize'
          }
        });
      });

      // 2. Sleek 8px sky-blue accent ribbon in Breakdown Per Product
      formatRequests.push({
        updateDimensionProperties: {
          range: {
            sheetId: firstSheetId,
            dimension: 'ROWS',
            startIndex: breakdownAccentRow,
            endIndex: breakdownAccentRow + 1
          },
          properties: {
            pixelSize: 8
          },
          fields: 'pixelSize'
        }
      });

      // 3. Crisp 28px height for title banners and 26px for table headers
      const titleRowIndexes = [
        summaryTitleRow,
        breakdownTitleRow,
        awaitingTitleRow
      ];
      titleRowIndexes.forEach(rowIdx => {
        formatRequests.push({
          updateDimensionProperties: {
            range: {
              sheetId: firstSheetId,
              dimension: 'ROWS',
              startIndex: rowIdx,
              endIndex: rowIdx + 1
            },
            properties: {
              pixelSize: 28
            },
            fields: 'pixelSize'
          }
        });
      });

      const headerRowIndexes = [
        delivHeaderRow,
        breakdownHeaderRow,
        awaitingHeaderRow
      ];
      headerRowIndexes.forEach(rowIdx => {
        formatRequests.push({
          updateDimensionProperties: {
            range: {
              sheetId: firstSheetId,
              dimension: 'ROWS',
              startIndex: rowIdx,
              endIndex: rowIdx + 1
            },
            properties: {
              pixelSize: 26
            },
            fields: 'pixelSize'
          }
        });
      });

      // 4. Compact 24px height for total rows
      [delivTotalRow, breakdownTotalRow, awaitingTotalRow].forEach(rowIdx => {
        formatRequests.push({
          updateDimensionProperties: {
            range: {
              sheetId: firstSheetId,
              dimension: 'ROWS',
              startIndex: rowIdx,
              endIndex: rowIdx + 1
            },
            properties: {
              pixelSize: 24
            },
            fields: 'pixelSize'
          }
        });
      });

      // 5. Clean 22px height for all data rows
      const dataRowRanges = [
        { start: delivDataStartRow, end: delivDataEndRow },
        { start: summaryDataStartRow, end: summaryDataEndRow },
        { start: breakdownDataStartRow, end: breakdownDataEndRow },
        { start: awaitingDataStartRow, end: awaitingDataEndRow }
      ];
      dataRowRanges.forEach(range => {
        if (range.end > range.start) {
          formatRequests.push({
            updateDimensionProperties: {
              range: {
                sheetId: firstSheetId,
                dimension: 'ROWS',
                startIndex: range.start,
                endIndex: range.end
              },
              properties: {
                pixelSize: 22
              },
              fields: 'pixelSize'
            }
          });
        }
      });

      // Execute formatting requests via spreadsheet batchUpdate
      if (formatRequests.length > 0) {
        try {
          const formatResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              requests: formatRequests
            })
          });
          if (!formatResponse.ok) {
            const formatErrText = await formatResponse.text();
            console.warn('Formatting batchUpdate warning:', formatErrText);
          }
        } catch (fmtErr) {
          console.warn('Formatting could not be fully applied:', fmtErr);
        }
      }

      setExtractionMessage({
        type: 'success',
        text: 'Successfully extracted and formatted Google Sheet with report styling!',
        url: spreadsheetUrl
      });
    } catch (err: any) {
      console.error(err);
      setExtractionMessage({
        type: 'error',
        text: `Extraction error: ${err.message || err}`
      });
    } finally {
      setIsExtractingSheets(false);
    }
  };

  // State for inline editor focus tracking
  const [editInfluencerId, setEditInfluencerId] = useState<string | null>(null);
  const [editProductId, setEditProductId] = useState<string | null>(null);
  const [isCustomProduct, setIsCustomProduct] = useState(false);
  const [copiedShortIoTaskId, setCopiedShortIoTaskId] = useState<string | null>(null);

  // Quick form adding states
  const getSaved = (key: string, def: string) => safeLocalStorage.getItem('CP_ADD_FORM_' + key) ?? def;
  
  const [showAddForm, setShowAddForm] = useState(false);
  const [showBulkAddForm, setShowBulkAddForm] = useState(false);
  const [bulkInfluencerIds, setBulkInfluencerIds] = useState<string[]>([]);
  const [bulkSearchQuery, setBulkSearchQuery] = useState('');
  const [newVideoIdPrefix, setNewVideoIdPrefix] = useState('10' + (tasks.length + 1));
  const [manualVideoId, setManualVideoId] = useState(() => getSaved('manualVideoId', ''));
  const [newInfluencerId, setNewInfluencerId] = useState(() => getSaved('newInfluencerId', influencers[0]?.id || ''));
  const [singleInfluencerSearch, setSingleInfluencerSearch] = useState('');

  const filteredSingleInfluencers = useMemo(() => {
    const list = influencers
      .filter(i => i.status !== 'Future Creator')
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));
    if (!singleInfluencerSearch.trim()) return list;
    const q = singleInfluencerSearch.toLowerCase();
    return list.filter(i => 
      (i.name || '').toLowerCase().includes(q) ||
      (i.niche || '').toLowerCase().includes(q) ||
      (i.handle || '').toLowerCase().includes(q)
    );
  }, [influencers, singleInfluencerSearch]);
  const [newProduct, setNewProduct] = useState(() => getSaved('newProduct', 'Eco Apparel Launch'));
  const [newPlannedDay, setNewPlannedDay] = useState(() => getSaved('newPlannedDay', new Date().getDate().toString().padStart(2, '0')));
  const [newPlannedMonth, setNewPlannedMonth] = useState(() => getSaved('newPlannedMonth', (new Date().getMonth() + 1).toString().padStart(2, '0')));
  const [newPlannedYear, setNewPlannedYear] = useState(() => getSaved('newPlannedYear', new Date().getFullYear().toString()));
  const [newActualDay, setNewActualDay] = useState(() => getSaved('newActualDay', new Date().getDate().toString().padStart(2, '0')));
  const [newActualMonth, setNewActualMonth] = useState(() => getSaved('newActualMonth', (new Date().getMonth() + 1).toString().padStart(2, '0')));
  const [newActualYear, setNewActualYear] = useState(() => getSaved('newActualYear', new Date().getFullYear().toString()));
  const [newAmount, setNewAmount] = useState(() => getSaved('newAmount', ''));
  const [newSampleCost, setNewSampleCost] = useState(() => getSaved('newSampleCost', ''));
  const [newNeedsSample, setNewNeedsSample] = useState(() => getSaved('newNeedsSample', 'false') === 'true');
  const [newOrderId, setNewOrderId] = useState(() => getSaved('newOrderId', ''));
  const [newOrderDate, setNewOrderDate] = useState(() => getSaved('newOrderDate', ''));
  const [newOrderPlatform, setNewOrderPlatform] = useState<string>(() => getSaved('newOrderPlatform', 'PTG'));
  const [newMediaRightAmount, setNewMediaRightAmount] = useState(() => getSaved('newMediaRightAmount', '0'));
  const [newViews, setNewViews] = useState(() => getSaved('newViews', '0'));
  const [newClicks, setNewClicks] = useState(() => getSaved('newClicks', '0'));
  const [newCtr, setNewCtr] = useState(() => getSaved('newCtr', ''));
  const [newCpc, setNewCpc] = useState(() => getSaved('newCpc', ''));
  const [newCpv, setNewCpv] = useState(() => getSaved('newCpv', ''));
  const [newSecondaryInfluencer, setNewSecondaryInfluencer] = useState(() => getSaved('newSecondaryInfluencer', ''));
  const [newVideoLink1, setNewVideoLink1] = useState(() => getSaved('newVideoLink1', ''));
  const [newVideoLink2, setNewVideoLink2] = useState(() => getSaved('newVideoLink2', ''));
  const [newVideoLink3, setNewVideoLink3] = useState(() => getSaved('newVideoLink3', ''));
  const [newShortIoLink, setNewShortIoLink] = useState(() => getSaved('newShortIoLink', ''));
  const [editedProductName, setEditedProductName] = useState(() => getSaved('newProduct', 'Eco Apparel Launch'));
  const [newAdvanceAmountReceived, setNewAdvanceAmountReceived] = useState(() => getSaved('newAdvanceAmountReceived', '0'));
  const [newAdvanceAmountDate, setNewAdvanceAmountDate] = useState(() => getSaved('newAdvanceAmountDate', ''));

  React.useEffect(() => {
    safeLocalStorage.setItem('CP_ADD_FORM_manualVideoId', manualVideoId);
    safeLocalStorage.setItem('CP_ADD_FORM_newInfluencerId', newInfluencerId);
    safeLocalStorage.setItem('CP_ADD_FORM_newProduct', newProduct);
    safeLocalStorage.setItem('CP_ADD_FORM_newPlannedDay', newPlannedDay);
    safeLocalStorage.setItem('CP_ADD_FORM_newPlannedMonth', newPlannedMonth);
    safeLocalStorage.setItem('CP_ADD_FORM_newPlannedYear', newPlannedYear);
    safeLocalStorage.setItem('CP_ADD_FORM_newActualDay', newActualDay);
    safeLocalStorage.setItem('CP_ADD_FORM_newActualMonth', newActualMonth);
    safeLocalStorage.setItem('CP_ADD_FORM_newActualYear', newActualYear);
    safeLocalStorage.setItem('CP_ADD_FORM_newAmount', newAmount);
    safeLocalStorage.setItem('CP_ADD_FORM_newSampleCost', newSampleCost);
    safeLocalStorage.setItem('CP_ADD_FORM_newNeedsSample', newNeedsSample ? 'true' : 'false');
    safeLocalStorage.setItem('CP_ADD_FORM_newOrderId', newOrderId);
    safeLocalStorage.setItem('CP_ADD_FORM_newOrderDate', newOrderDate);
    safeLocalStorage.setItem('CP_ADD_FORM_newOrderPlatform', newOrderPlatform);
    safeLocalStorage.setItem('CP_ADD_FORM_newMediaRightAmount', newMediaRightAmount);
    safeLocalStorage.setItem('CP_ADD_FORM_newViews', newViews);
    safeLocalStorage.setItem('CP_ADD_FORM_newClicks', newClicks);
    safeLocalStorage.setItem('CP_ADD_FORM_newCtr', newCtr);
    safeLocalStorage.setItem('CP_ADD_FORM_newCpc', newCpc);
    safeLocalStorage.setItem('CP_ADD_FORM_newCpv', newCpv);
    safeLocalStorage.setItem('CP_ADD_FORM_newSecondaryInfluencer', newSecondaryInfluencer);
    safeLocalStorage.setItem('CP_ADD_FORM_newVideoLink1', newVideoLink1);
    safeLocalStorage.setItem('CP_ADD_FORM_newVideoLink2', newVideoLink2);
    safeLocalStorage.setItem('CP_ADD_FORM_newVideoLink3', newVideoLink3);
    safeLocalStorage.setItem('CP_ADD_FORM_newShortIoLink', newShortIoLink);
    safeLocalStorage.setItem('CP_ADD_FORM_newAdvanceAmountReceived', newAdvanceAmountReceived);
    safeLocalStorage.setItem('CP_ADD_FORM_newAdvanceAmountDate', newAdvanceAmountDate);
  });

  React.useEffect(() => {
    setEditedProductName(newProduct);
  }, [newProduct]);

  // Automatically calculate CTR, CPC, and CPV when Amount, Views, or Clicks change in Wizard Scheduler
  React.useEffect(() => {
    const amountVal = parseFloat(newAmount) || 0;
    const viewsVal = parseInt(newViews, 10) || 0;
    const clicksVal = parseInt(newClicks, 10) || 0;

    // CTR = (Clicks / Views) * 100
    if (viewsVal > 0) {
      setNewCtr(((clicksVal / viewsVal) * 100).toFixed(2));
    } else {
      setNewCtr('0');
    }

    // CPC = Amount / Clicks
    if (clicksVal > 0) {
      setNewCpc((amountVal / clicksVal).toFixed(2));
    } else {
      setNewCpc('0');
    }

    // CPV = Amount / Views
    if (viewsVal > 0) {
      setNewCpv((amountVal / viewsVal).toFixed(3));
    } else {
      setNewCpv('0');
    }
  }, [newAmount, newViews, newClicks]);

  // WhatsApp Messaging Dialog States
  const [whatsappTask, setWhatsappTask] = useState<Task | null>(null);
  const [whatsappTemplate, setWhatsappTemplate] = useState<string>('confirm');
  const [whatsappLanguage, setWhatsappLanguage] = useState<'en' | 'as'>(() => {
    try {
      return (localStorage.getItem('wa_msg_lang') as 'en' | 'as') || 'en';
    } catch {
      return 'en';
    }
  });
  const [whatsappMessageText, setWhatsappMessageText] = useState<string>('');
  const [whatsappPhone, setWhatsappPhone] = useState<string>('');
  const [whatsappSaveSuccess, setWhatsappSaveSuccess] = useState<boolean>(false);

  // Auto-populate message text on state changes
  React.useEffect(() => {
    if (!whatsappTask) return;
    
    const creator = influencers.find(i => i.id === whatsappTask.influencerId);
    const creatorName = creator ? creator.name : 'Creator';
    const product = whatsappTask.title || 'the sponsored placement';
    const plannedDate = whatsappTask.deadline ? whatsappTask.deadline : 'soon';
    
    const views = whatsappTask.views || 0;
    const clicks = whatsappTask.clicks || 0;

    let text = '';
    if (whatsappLanguage === 'as') {
      if (whatsappTemplate === 'confirm') {
        text = `নমস্কাৰ ${creatorName}! 📅 PRO-TO-GROW ৰ ফালৰ পৰা জনাইছোঁ। আপোনাৰ "${product}" ভিডিঅ' কেম্পেইনৰ বাবে মাহেকীয়া সময়সূচী অনুসৰি ${plannedDate} তাৰিখে ভিডিঅ' ৰিলিজৰ কথা নিৰ্ধাৰণ কৰা হৈছে। অনুগ্ৰহ কৰি কামখিনি সময়মতে আগবঢ়াবচোন। কিবা সহায় লাগিলে জনাব। ধন্যবাদ!`;
      } else if (whatsappTemplate === 'sample') {
        text = `নমস্কাৰ ${creatorName}! 📦 PRO-TO-GROW ৰ ফালৰ পৰা জনাইছোঁ। আমি আপোনালৈ "${product}" ৰ প্ৰডাক্ট ছেম্পলটো পঠিয়াই দিছিলোঁ। পাৰ্চেলটো আপুনি সঠিকভাৱে পালে নে অনুগ্ৰহ কৰি জনাবচোন? যাতে আমি ভিডিঅ'ৰ পৰৱৰ্তী কামখিনি আগবঢ়াব পাৰোঁ। ধন্যবাদ!`;
      } else if (whatsappTemplate === 'reminder') {
        text = `নমস্কাৰ ${creatorName}! আশা কৰোঁ আপুনি ভালে আছে। "${product}" ভিডিঅ' ড্ৰাফ্টৰ সন্দৰ্ভত যোগাযোগ কৰিছোঁ। যিহেতু আমাৰ নিৰ্ধাৰিত তাৰিখ হৈছে ${plannedDate}, সেয়েহে ড্ৰাফ্টটো প্ৰস্তুত হ'লে এবাৰ ৰিভিউ লিংকটো শ্বেয়াৰ কৰিবচোন। ধন্যবাদ!`;
      } else if (whatsappTemplate === 'update') {
        text = `নমস্কাৰ ${creatorName}! কেম্পেইনৰ এটা আপডেট: আপোনাৰ "${product}" ভিডিঅ'টোত এতিয়ালৈকে আমাৰ প্লেনাৰত ${views.toLocaleString()} ভিউজ আৰু ${clicks.toLocaleString()} ক্লিস্ক দেখা পোৱা গৈছে! 📊 আপোনাৰ যদি নতুন ষ্টেটছৰ স্ক্ৰীনশ্বট আছে অনুগ্ৰহ কৰি শ্বেয়াৰ কৰিব। সুন্দৰ প্ৰদৰ্শনৰ বাবে ধন্যবাদ!`;
      } else if (whatsappTemplate === 'payment') {
        const amt = whatsappTask.billedAmount || whatsappTask.remuneration || 0;
        text = `নমস্কাৰ ${creatorName}! 💳 PRO-TO-GROW ৰ ফালৰ পৰা জনাইছোঁ। আপোনাৰ "${product}" ভিডিঅ'ৰ বাবে নিৰ্ধাৰিত ${amt ? `₹${amt.toLocaleString()}` : 'পাৰিশ্ৰমিক'} ৰ পেমেন্ট প্ৰচেছ কৰা হৈছে। অনুগ্ৰহ কৰি আপোনাৰ একাউণ্ট পৰীক্ষা কৰি পেমেন্ট পোৱাটো নিশ্চিত কৰিবচোন। ধন্যবাদ!`;
      } else {
        text = `নমস্কাৰ ${creatorName}! আমাৰ নিৰ্ধাৰিত "${product}" স্পন্সৰশ্বিপ সম্পৰ্কে যোগাযোগ কৰিছোঁ। অনুগ্ৰহ কৰি এবাৰ আমাৰ সৈতে কথা পাতকচোন। ধন্যবাদ!`;
      }
    } else {
      if (whatsappTemplate === 'confirm') {
        text = `Hi ${creatorName}! 📅 This is from PRO-TO-GROW. Just confirming our publication schedule on the monthly planner for your "${product}" video campaign. We have you scheduled for video release on ${plannedDate}. Let us know if you are all set to go. Thanks!`;
      } else if (whatsappTemplate === 'sample') {
        text = `Hi ${creatorName}! 📦 This is from PRO-TO-GROW. We recently sent out the product sample for "${product}" to your address. Could you please confirm if you have received the parcel safely? Let us know so we can coordinate the next steps! Thank you.`;
      } else if (whatsappTemplate === 'reminder') {
        text = `Hey ${creatorName}! Hope you are having a wonderful week. Reaching out regarding the upcoming "${product}" video draft. Since we have our target release planned for ${plannedDate}, could you please share a draft review link when it's ready? Thank you!`;
      } else if (whatsappTemplate === 'update') {
        text = `Hi ${creatorName}! Quick campaign update: we checked the stats for your video on "${product}" and noted ${views.toLocaleString()} views & ${clicks.toLocaleString()} clicks on our planner! 📊 Let us know if you have an updated stats screenshot to share. Beautiful performance, and thank you!`;
      } else if (whatsappTemplate === 'payment') {
        const amt = whatsappTask.billedAmount || whatsappTask.remuneration || 0;
        text = `Hi ${creatorName}! 💳 This is from PRO-TO-GROW. We have cleared and processed the payment of ${amt ? `₹${amt.toLocaleString()}` : 'your remuneration'} for your video placement on "${product}". Please check your bank account and confirm receipt. Thank you!`;
      } else {
        text = `Hi ${creatorName}! Reaching out regarding our scheduled "${product}" sponsorship. Please let us know if you are available for a quick sync! Thanks.`;
      }
    }
    
    setWhatsappMessageText(text);

    if (creator) {
      setWhatsappPhone(cleanSingleMobileForStorage(creator.mobile || ''));
    }
  }, [whatsappTask, whatsappTemplate, whatsappLanguage, influencers]);

  // Formatter to turn task ID into clean user-facing format e.g. "VID104"
  const getVideoDisplayId = (task: Task, index?: number) => {
    if (task.videoId !== undefined) {
      return String(task.videoId);
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

  // Extract months represented in the current tasks so the user can easily filter
  const getRepresentedMonths = () => {
    const list = new Set<string>();
    tasks.forEach(t => {
      const hasLink = !!((typeof t.videoLink1 === 'string' ? t.videoLink1.trim() : '') || (typeof t.videoLink2 === 'string' ? t.videoLink2.trim() : '') || (typeof t.videoLink3 === 'string' ? t.videoLink3.trim() : ''));
      const isCompleted = (t.status === 'Completed' || hasLink) && hasLink;
      let datesToCheck: string[] = [];
      if (isCompleted && t.releaseDate) {
        datesToCheck = [t.releaseDate];
      } else {
        datesToCheck = [t.deadline, t.releaseDate].filter(Boolean) as string[];
      }
      
      datesToCheck.forEach(d => {
        if (d) {
          const parts = d.split('-');
          if (parts.length >= 2) {
            const yearMonth = `${parts[0]}-${parts[1]}`; // e.g. "2026-06"
            list.add(yearMonth);
          }
        }
      });
    });
    return Array.from(list).sort();
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!onCreateTask && !onUpdateTasksBulk && !onUpdateTask) {
      alert("Function to import/update tasks is not available.");
      return;
    }

    // Helper: case-insensitive, symbol-free key getter from CSV row
    const getRowVal = (row: any, ...keys: string[]): any => {
      if (!row || typeof row !== 'object') return undefined;
      // 1. Direct match
      for (const k of keys) {
        if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') {
          return row[k];
        }
      }
      // 2. Normalized alphanumeric match
      const rowKeys = Object.keys(row);
      const normalizedMap = new Map<string, string>();
      for (const k of rowKeys) {
        const cleanK = k.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (cleanK && !normalizedMap.has(cleanK)) {
          normalizedMap.set(cleanK, k);
        }
      }
      for (const k of keys) {
        const cleanK = k.toLowerCase().replace(/[^a-z0-9]/g, '');
        const matchedKey = normalizedMap.get(cleanK);
        if (matchedKey && row[matchedKey] !== undefined && row[matchedKey] !== null && String(row[matchedKey]).trim() !== '') {
          return row[matchedKey];
        }
      }
      return undefined;
    };

    // Helper: Parse currency, commas, percentages, and strings safely into numbers
    const parseNumeric = (val: any, fallback = 0): number => {
      if (val === undefined || val === null) return fallback;
      if (typeof val === 'number') return isNaN(val) ? fallback : val;
      const str = String(val).trim();
      if (!str || str === '-' || str.toLowerCase() === 'n/a' || str.toLowerCase() === 'null') return fallback;
      const cleaned = str
        .replace(/[₹$€£,]/g, '')
        .replace(/%+/g, '')
        .replace(/\/\-$/g, '')
        .trim();
      const parsed = parseFloat(cleaned);
      return isNaN(parsed) ? fallback : parsed;
    };

    // Helper: Normalize dates from any CSV format (ISO, DD/MM/YYYY, Excel serial, natural language)
    const normalizeDate = (d: any): string => {
      if (!d) return '';
      const trimmed = String(d).trim();
      if (!trimmed || trimmed === '-' || trimmed.toLowerCase() === 'null' || trimmed.toLowerCase() === 'undefined') return '';
      
      // 1. If already YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

      // 2. Excel numeric serial date (e.g. 45000 to 60000)
      if (/^\d{5}$/.test(trimmed)) {
        const serial = parseInt(trimmed, 10);
        if (serial > 30000 && serial < 70000) {
          const dt = new Date(Math.round((serial - 25569) * 86400 * 1000));
          if (!isNaN(dt.getTime())) {
            return dt.toISOString().split('T')[0];
          }
        }
      }

      // 3. DD/MM/YYYY, MM/DD/YYYY, DD-MM-YYYY, YYYY/MM/DD, with optional 2-digit years
      const parts = trimmed.split(/[\/\-\.]/);
      if (parts.length === 3) {
        // Case A: YYYY/MM/DD
        if (parts[0].length === 4) {
          const y = parts[0];
          const m = parts[1].padStart(2, '0');
          const d = parts[2].padStart(2, '0');
          return `${y}-${m}-${d}`;
        }
        // Case B: Year is at the end (DD/MM/YYYY or DD/MM/YY)
        let yStr = parts[2];
        if (yStr.length === 2) {
          yStr = `20${yStr}`;
        }
        if (yStr.length === 4) {
          const p1 = parseInt(parts[0], 10);
          const p2 = parseInt(parts[1], 10);
          if (!isNaN(p1) && !isNaN(p2)) {
            if (p2 > 12) {
              return `${yStr}-${p1.toString().padStart(2, '0')}-${p2.toString().padStart(2, '0')}`;
            } else if (p1 > 12) {
              return `${yStr}-${p2.toString().padStart(2, '0')}-${p1.toString().padStart(2, '0')}`;
            } else {
              // Ambiguous: Assume DD/MM/YYYY (Standard for India/UK)
              return `${yStr}-${p2.toString().padStart(2, '0')}-${p1.toString().padStart(2, '0')}`;
            }
          }
        }
      }

      // 4. Natural language date parser (e.g. "15 May 2026", "May 15, 2026", "15-May-2026")
      try {
        const dt = new Date(trimmed);
        if (!isNaN(dt.getTime())) {
          const y = dt.getFullYear();
          if (y > 2000 && y < 2100) {
            const m = String(dt.getMonth() + 1).padStart(2, '0');
            const day = String(dt.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
          }
        }
      } catch (e) {}

      return trimmed;
    };

    Papa.parse(file, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (header: string) => header.trim().replace(/^\uFEFF/, ''),
      complete: (results) => {
        const data = results.data as any[];
        let addedCount = 0;
        const bulkUpdates: { id: string; updates: Partial<Task> }[] = [];
        const newCreatorsMap = new Map<string, string>();
        
        data.forEach(row => {
          if (!row || typeof row !== 'object') return;
          // Check if this row is completely empty
          const hasAnyContent = Object.values(row).some(v => v !== undefined && v !== null && String(v).trim() !== '');
          if (!hasAnyContent) return;

          const parentCampaignId = (row.campaignId && campaigns.some(c => c.id === row.campaignId))
            ? row.campaignId
            : (campaigns[0]?.id || 'camp-1');
          
          // Match creator by name, handle, or id
          const rawCreatorName = String(
            getRowVal(row,
              'Influencer name',
              'INFLUENCER NAME',
              'Influencer Name',
              'Influencer',
              'influencer',
              'Creator',
              'creator',
              'Creator Name',
              'Influencer / Creator',
              'Name',
              'name',
              'handle',
              'Handle'
            ) || ''
          ).trim();

          const secInfluencer = String(
            getRowVal(row,
              'Sec. Influencer',
              'Secondary Influencer',
              'secondaryInfluencerName',
              'Sec Influencer',
              'Sec. Influencer Name',
              'Secondary Influencer Name'
            ) || ''
          ).trim();

          let infId = influencers[0]?.id || 'inf-1';
          let finalSecName = secInfluencer || rawCreatorName;
          
          if (rawCreatorName) {
            const normCreator = rawCreatorName.toLowerCase();
            const foundCreator = influencers.find(inf => 
              (inf.name && inf.name.toLowerCase() === normCreator) || 
              (inf.handle && inf.handle.toLowerCase() === normCreator) ||
              (inf.id && inf.id.toLowerCase() === normCreator)
            );
            if (foundCreator) {
              infId = foundCreator.id;
              if (!finalSecName) finalSecName = foundCreator.name;
            } else if (newCreatorsMap.has(normCreator)) {
              infId = newCreatorsMap.get(normCreator)!;
            } else if (onAddInfluencer) {
              const handle = rawCreatorName.replace(/\s+/g, '').toLowerCase();
              const newId = onAddInfluencer({
                name: rawCreatorName,
                handle: getRowVal(row, 'Handle', 'handle') || `@${handle}`,
                avatar: getRowVal(row, 'Avatar', 'avatar') || `https://ui-avatars.com/api/?name=${encodeURIComponent(rawCreatorName)}&background=random`,
                niche: getRowVal(row, 'Niche', 'niche') || 'General',
                followers: Math.round(parseNumeric(getRowVal(row, 'Followers', 'followers'))),
                location: getRowVal(row, 'Location', 'location') || 'Unknown',
                platforms: [{ name: 'Instagram', followers: '0' }],
                topDemographics: [{ ageRange: '18-24', percentage: 100 }],
                engagementRate: parseNumeric(getRowVal(row, 'Engagement Rate', 'engagementRate')),
                costPerPost: parseNumeric(getRowVal(row, 'Cost Per Post', 'costPerPost')),
                averageROI: parseNumeric(getRowVal(row, 'Average ROI', 'averageROI')),
                notes: getRowVal(row, 'Notes', 'notes') || 'Imported from Monthly Planner CSV',
                mobile: getRowVal(row, 'Mobile', 'mobile') || '',
                status: getRowVal(row, 'Status', 'Communication Status', 'status') || 'Available'
              });
              if (typeof newId === 'string') {
                infId = newId;
                newCreatorsMap.set(normCreator, newId);
              }
            }
          }

          const productTitle = String(
            getRowVal(row,
              'Product',
              'product',
              'Product Name',
              'product_name',
              'title',
              'Title'
            ) || 'Unassigned Product'
          ).trim();

          // Add newly discovered product to savedProducts state so it appears in dropdowns
          if (productTitle && !isOthersProduct(productTitle) && setSavedProducts) {
            setSavedProducts(prev => prev.includes(productTitle) ? prev : [...prev, productTitle]);
          }

          // Dates extraction
          const rawDeadline = getRowVal(row,
            'Planed video release date',
            'Planned video release date',
            'Planned Release Date',
            'Planned Date',
            'Planed Date',
            'Planned Video Release Date',
            'deadline',
            'Deadline',
            'plannedDate',
            'PlannedDate',
            'planned',
            'Planned',
            'Target Date',
            'Date',
            'date'
          );
          let parsedDeadline = normalizeDate(rawDeadline);

          const rawReleaseDate = getRowVal(row,
            'actual date',
            'Actual date',
            'Actual Date',
            'Actual Video Release Date',
            'releaseDate',
            'ReleaseDate',
            'Release Date',
            'actualDate',
            'ActualDate',
            'actual',
            'Actual',
            'Published Date',
            'publishedDate'
          );
          let parsedReleaseDate = normalizeDate(rawReleaseDate);

          // If neither deadline nor releaseDate was specified in the row, default to the current active month/year filter so the task doesn't disappear
          if (!parsedDeadline && !parsedReleaseDate) {
            if (monthFilter !== 'ALL' && yearFilter !== 'ALL') {
              parsedDeadline = `${yearFilter}-${monthFilter.padStart(2, '0')}-15`;
            } else {
              parsedDeadline = new Date().toISOString().split('T')[0];
            }
          }

          // Video Links
          const link1 = String(getRowVal(row, 'Video Link 1', 'Video Link', 'videoLink1', 'VideoLink1', 'videoLink', 'VideoLink', 'Video 1', 'url1', 'link', 'Link') || '').trim();
          const link2 = String(getRowVal(row, 'Video Link 2', 'videoLink2', 'VideoLink2', 'Video 2', 'url2') || '').trim();
          const link3 = String(getRowVal(row, 'Video Link 3', 'videoLink3', 'VideoLink3', 'Video 3', 'url3') || '').trim();
          const shortIoLink = String(getRowVal(row, 'Short.io Link', 'SHORT.IO LINK', 'shortIoLink', 'ShortIoLink', 'shortioLink', 'Shortio', 'Short IO Link', 'Tracking Link') || '').trim();

          const detectedPlatform = detectPlatform(link1, link2, link3);
          const rawPlatform = getRowVal(row, 'Video Platform', 'Video platform', 'videoPlatform', 'VideoPlatform', 'platform', 'Platform');
          const finalPlatform = rawPlatform ? String(rawPlatform).trim() : (detectedPlatform || 'Instagram');

          // Financials & Numbers
          const amountVal = parseNumeric(getRowVal(row, 'amount', 'Amount', 'Remuneration', 'remuneration', 'Cost', 'Cost (₹)', 'Amount (₹)', 'Remuneration (₹)', 'Budget', 'budget'));
          const sampleCostVal = parseNumeric(getRowVal(row, 'Sample Cost (₹)', 'Sample Cost', 'sampleCost', 'SampleCost'));
          const mediaRightVal = parseNumeric(getRowVal(row, 'Media Right (₹)', 'Media Right', 'mediaRight', 'MediaRight', 'mediaRightAmount'));

          const viewsVal = Math.round(parseNumeric(getRowVal(row, 'Views', 'views')));
          const clicksVal = Math.round(parseNumeric(getRowVal(row, 'Clicks', 'clicks')));
          const conversionsVal = Math.round(parseNumeric(getRowVal(row, 'Conversions', 'conversions')));

          const ctrRaw = parseNumeric(getRowVal(row, 'CTR (%)', 'CTR', 'ctr'), -1);
          const ctrVal = ctrRaw >= 0 ? ctrRaw : (viewsVal > 0 ? parseFloat(((clicksVal / viewsVal) * 100).toFixed(2)) : 0);

          const cpcRaw = parseNumeric(getRowVal(row, 'CPC (₹)', 'CPC', 'cpc'), -1);
          const cpcVal = cpcRaw >= 0 ? cpcRaw : (clicksVal > 0 ? parseFloat((amountVal / clicksVal).toFixed(2)) : 0);

          const cpvRaw = parseNumeric(getRowVal(row, 'CPV (₹)', 'CPV', 'cpv'), -1);
          const cpvVal = cpvRaw >= 0 ? cpvRaw : (viewsVal > 0 ? parseFloat((amountVal / viewsVal).toFixed(3)) : 0);

          const cvrRaw = parseNumeric(getRowVal(row, 'CVR (%)', 'CVR', 'cvr'), -1);
          const cvrVal = cvrRaw >= 0 ? cvrRaw : 0;

          // Order details
          const rawOrderId = getRowVal(row, 'Order ID', 'Order Id', 'orderId', 'OrderId');
          const rawOrderDate = getRowVal(row, 'Order Date', 'Order date', 'orderDate', 'OrderDate');
          const rawOrderPlatform = getRowVal(row, 'Order Platform', 'Order platform', 'orderPlatform', 'OrderPlatform');

          // Video ID
          const rawVideoId = getRowVal(row, 'Video Id', 'Video ID', 'videoId', 'VideoId', 'videoID', 'VideoID');
          const sanitizedVideoId = rawVideoId ? String(rawVideoId).trim() : undefined;

          // Status calculation
          const rawStatus = getRowVal(row, 'Status', 'status');
          const hasAnyVideoLink = !!(link1 || link2 || link3);
          let parsedStatus = rawStatus ? String(rawStatus).trim() : 'Pending';
          if (hasAnyVideoLink) {
            parsedStatus = 'Completed';
          } else if (parsedStatus === 'Completed') {
            parsedStatus = 'Pending';
          }

          // Check if an existing task matches this row by id or videoId
          const rawId = getRowVal(row, 'id', 'Id', 'ID', 'Task ID', 'taskId', 'TaskId');
          let existingTask: Task | undefined = undefined;
          if (rawId) {
            existingTask = tasks.find(t => t.id === String(rawId).trim());
          }
          if (!existingTask && sanitizedVideoId) {
            const vIdLower = sanitizedVideoId.toLowerCase();
            existingTask = tasks.find(t => t.videoId && t.videoId.trim().toLowerCase() === vIdLower);
          }

          const taskPayload: Omit<Task, 'id'> = {
            campaignId: parentCampaignId,
            influencerId: infId,
            secondaryInfluencerName: finalSecName,
            title: productTitle,
            type: getRowVal(row, 'Type', 'type') || (existingTask?.type || 'Dedicated Video'),
            deadline: parsedDeadline,
            releaseDate: parsedReleaseDate || undefined,
            status: parsedStatus,
            remuneration: amountVal,
            sampleCost: sampleCostVal > 0 ? sampleCostVal : null,
            mediaRightAmount: mediaRightVal,
            orderId: rawOrderId ? String(rawOrderId).trim() : undefined,
            orderDate: normalizeDate(rawOrderDate) || undefined,
            orderPlatform: rawOrderPlatform ? String(rawOrderPlatform).trim() : 'PTG',
            platform: finalPlatform,
            views: viewsVal,
            clicks: clicksVal,
            conversions: conversionsVal,
            ctr: ctrVal,
            cvr: cvrVal,
            cpc: cpcVal,
            cpv: cpvVal,
            videoLink1: link1 || undefined,
            videoLink2: link2 || undefined,
            videoLink3: link3 || undefined,
            shortIoLink: shortIoLink || undefined,
            videoId: sanitizedVideoId || existingTask?.videoId
          };

          if (existingTask) {
            bulkUpdates.push({
              id: existingTask.id,
              updates: taskPayload
            });
          } else if (onCreateTask) {
            onCreateTask(taskPayload);
            addedCount++;
          }
        });

        // Apply bulk updates for matched existing tasks
        if (bulkUpdates.length > 0) {
          if (onUpdateTasksBulk) {
            onUpdateTasksBulk(bulkUpdates);
          } else if (onUpdateTask) {
            bulkUpdates.forEach(bu => onUpdateTask(bu.id, bu.updates));
          }
        }

        if (fileInputRef.current) fileInputRef.current.value = '';
        if (onForceGlobalBackup) onForceGlobalBackup();

        const totalProcessed = addedCount + bulkUpdates.length;
        if (totalProcessed === 0) {
          alert("No valid video plans found in the CSV file.");
          return;
        }

        let summaryMsg = `Successfully imported ${totalProcessed} video plan(s)!`;
        if (bulkUpdates.length > 0 && addedCount > 0) {
          summaryMsg = `CSV Import complete: ${addedCount} new plan(s) added, ${bulkUpdates.length} existing plan(s) updated.`;
        } else if (bulkUpdates.length > 0) {
          summaryMsg = `CSV Import complete: ${bulkUpdates.length} existing video plan(s) updated!`;
        }
        alert(summaryMsg);
      },
      error: (error: any) => {
        console.error("Error parsing CSV:", error);
        alert("Failed to parse CSV file. Please ensure it is a valid CSV format.");
      }
    });
  };

  const handleClearAll = () => {
    if (!onBulkDeleteTasks || filteredTasks.length === 0) return;
    
    if (window.confirm(`⚠️ WARNING: Are you absolutely sure you want to permanently delete all ${filteredTasks.length} visible tasks in the monthly planner? This action cannot be undone.`)) {
      const taskIds = filteredTasks.map(t => t.id);
      onBulkDeleteTasks(taskIds);
    }
  };

  const handleExportCSV = () => {
    if (filteredTasks.length === 0) {
      alert("No video plans to export.");
      return;
    }
    const tasksToExport = [...filteredTasks].sort((a, b) => {
      const dateA = a.deadline || a.releaseDate || '9999-99-99';
      const dateB = b.deadline || b.releaseDate || '9999-99-99';
      return new Date(dateA).getTime() - new Date(dateB).getTime();
    });

    const csv = Papa.unparse(tasksToExport.map(t => {
      const influencer: any = influencers.find(i => i.id === t.influencerId) || {};
      
      const res = {
        ...t,
        ...influencer,
        'INFLUENCER NAME': influencer.name || t.secondaryInfluencerName || 'Unknown',
        'Creator': influencer.name || t.secondaryInfluencerName || 'Unknown',
        'Handle': influencer.handle || '',
        'Mobile': influencer.mobile || '',
        'Communication Status': influencer.status || '',
        'Video ID': t.videoId || '',
        'Product': t.title,
        'SHORT.IO LINK': t.shortIoLink || ''
      };
      
      return res;
    }));
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `monthly_planner_${new Date().toLocaleString('en-GB').replace(/[\/:]/g, '-').replace(', ', '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Handle adding a new planned videoroll
  const handleAddNewRow = (e: React.FormEvent) => {
    e.preventDefault();
    if (!onCreateTask) return;

    // Use current first campaign or fallback
    const parentCampaignId = campaigns[0]?.id || 'camp-1';

    // Format potential custom manual video ID
    let customId: string | undefined = undefined;
    if (manualVideoId.trim()) {
      const trimmed = manualVideoId.trim();
      if (trimmed.toLowerCase().startsWith('task-')) {
        customId = trimmed;
      } else if (trimmed.toLowerCase().startsWith('vid-')) {
        customId = `task-${trimmed.slice(4)}`;
      } else {
        customId = `task-${trimmed}`;
      }
    }

    const calculatedPlannedDate = `${newPlannedYear}-${newPlannedMonth}-${newPlannedDay}`;
    const calculatedActualDate = (newVideoLink1.trim() || newVideoLink2.trim() || newVideoLink3.trim()) ? `${newActualYear}-${newActualMonth}-${newActualDay}` : '';

    onCreateTask({
      id: customId,
      campaignId: parentCampaignId,
      influencerId: newInfluencerId,
      title: newProduct.trim() || 'Premium Wireless Headset Launch',
      type: 'Video Sponsor Integration',
      deadline: calculatedPlannedDate,
      status: (newVideoLink1.trim() || newVideoLink2.trim() || newVideoLink3.trim() || newShortIoLink.trim()) ? 'Completed' : 'Pending',
      remuneration: newAmount ? parseFloat(newAmount) : 0,
      sampleCost: newSampleCost === '' ? null : (parseFloat(newSampleCost) !== undefined ? parseFloat(newSampleCost) : null),
      orderId: newOrderId.trim(),
      orderDate: newOrderDate.trim(),
      orderPlatform: newOrderPlatform,
      advanceAmountReceived: parseFloat(newAdvanceAmountReceived) || 0,
      advanceAmountDate: newAdvanceAmountDate,
      mediaRightAmount: parseFloat(newMediaRightAmount) || 0,
      releaseDate: calculatedActualDate,
      platform: 'YouTube',
      views: parseInt(newViews, 10) || 0,
      clicks: parseInt(newClicks, 10) || 0,
      ctr: newCtr.trim() !== '' ? parseFloat(newCtr) : undefined,
      cpc: newCpc.trim() !== '' ? parseFloat(newCpc) : undefined,
      cpv: newCpv.trim() !== '' ? parseFloat(newCpv) : undefined,
      secondaryInfluencerName: newSecondaryInfluencer.trim() || (influencers.find(inf => inf.id === newInfluencerId)?.name || ''),
      videoLink1: newVideoLink1.trim(),
      videoLink2: newVideoLink2.trim(),
      videoLink3: newVideoLink3.trim(),
      shortIoLink: newShortIoLink.trim(),
      needsSample: newNeedsSample,
      videoId: manualVideoId.trim() || undefined
    });

    // Reset Form fields
    setNewNeedsSample(false);
    setNewAmount('');
    setNewProduct('');
    setManualVideoId('');
    setNewActualDay('15');
    setNewActualMonth('05');
    setNewActualYear('2026');
    setNewViews('0');
    setNewClicks('0');
    setNewCtr('');
    setNewCpc('');
    setNewCpv('');
    setNewSampleCost('0');
    setNewOrderId('');
    setNewOrderDate('');
    setNewOrderPlatform('PTG');
    setNewAdvanceAmountReceived('0');
    setNewAdvanceAmountDate('');
    setNewMediaRightAmount('0');
    setNewVideoLink1('');
    setNewVideoLink2('');
    setNewVideoLink3('');
    setNewShortIoLink('');
    setShowAddForm(false);
    if (onForceGlobalBackup) onForceGlobalBackup();
  };

  
  const handleManualRestoreCreators = (isAuto = false) => {
    let restoredCount = 0;
    const updates: { id: string, updates: Partial<Task> }[] = [];
    const newInfluencersBulk: any[] = [];
    const existingInfIds = new Set(influencers.map(inf => inf.id));
    
    // Map to reuse newly created influencers by their secondary name
    const createdMap = new Map<string, string>();
    
    tasks.forEach(t => {
      // Check if task is missing a valid influencerId but has a secondary name
      if ((!t.influencerId || !existingInfIds.has(t.influencerId)) && t.secondaryInfluencerName && t.secondaryInfluencerName.trim() !== '') {
        const secName = t.secondaryInfluencerName.trim();
        const secNameLower = secName.toLowerCase();
        
        let newId = createdMap.get(secNameLower);
        
        if (!newId) {
          const existingInf = influencers.find(inf => inf.name.trim().toLowerCase() === secNameLower);
          if (existingInf) {
            newId = existingInf.id;
          }
        }
        
        if (!newId && onAddInfluencer) {
           const handle = secName.replace(/\s+/g, '').toLowerCase();
           newId = `inf-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
           const fullInfluencer = {
              id: newId,
              name: secName.toUpperCase(),
              handle: `@${handle}`,
              avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(secName)}&background=random`,
              niche: 'General',
              followers: "0",
              location: 'Unknown',
              platforms: [{ name: 'Instagram', followers: '0' }],
              topDemographics: [{ ageRange: '18-24', percentage: 100 }],
              engagementRate: "0",
              costPerPost: 0,
              averageROI: 0,
              notes: 'Added from Monthly Planner (Manual Restore)',
              mobile: '',
              status: 'Available'
           };
           newInfluencersBulk.push(fullInfluencer);
           createdMap.set(secNameLower, newId);
           existingInfIds.add(newId);
           restoredCount++;
        }
        
        if (newId && typeof newId === 'string') {
           // We do this per-task so it strictly happens within the same task
           updates.push({ id: t.id, updates: { influencerId: newId } });
        }
      }
    });

    if (newInfluencersBulk.length > 0 && onAddInfluencersBulk) {
       onAddInfluencersBulk(newInfluencersBulk);
    } else if (newInfluencersBulk.length > 0 && onAddInfluencer) {
       newInfluencersBulk.forEach(inf => onAddInfluencer(inf));
    }

    if (updates.length > 0) {
      if (onUpdateTasksBulk) {
        onUpdateTasksBulk(updates);
      } else if (onUpdateTask) {
        updates.forEach(u => onUpdateTask(u.id, u.updates));
      }
      if (!isAuto) alert(`Successfully restored ${restoredCount} creator(s) and assigned them to ${updates.length} task(s).`);
    } else {
      if (!isAuto) alert("No missing creators found with secondary names to restore.");
    }
  };

  const handleRemoveAndRefreshShortIo = () => {
    if (window.confirm("Are you sure you want to remove and refresh all Short.io tracker links? This will reset the local cache and rebuild from the database.")) {
      safeLocalStorage.removeItem('SHORT_IO_TRACKED_LINKS');
      window.location.reload();
    }
  };

  // Handle adding bulk planned videorolls
  const handleBulkAddNewRows = (e: React.FormEvent) => {
    e.preventDefault();
    if (!onCreateTask) return;
    if (bulkInfluencerIds.length === 0) {
      alert("Please select at least one influencer for bulk scheduling.");
      return;
    }

    const parentCampaignId = campaigns[0]?.id || 'camp-1';
    const calculatedPlannedDate = `${newPlannedYear}-${newPlannedMonth}-${newPlannedDay}`;
    const calculatedActualDate = (newVideoLink1.trim() || newVideoLink2.trim() || newVideoLink3.trim()) ? `${newActualYear}-${newActualMonth}-${newActualDay}` : '';

    bulkInfluencerIds.forEach((influencerId, index) => {
      const bulkInf = influencers.find(i => i.id === influencerId);
      // Create a unique id for each bulk item if manual video id is provided
      let customId: string | undefined = undefined;
      if (manualVideoId.trim()) {
        const trimmed = manualVideoId.trim();
        let baseId = trimmed;
        if (trimmed.toLowerCase().startsWith('task-')) {
           baseId = trimmed.slice(5);
        } else if (trimmed.toLowerCase().startsWith('vid-')) {
           baseId = trimmed.slice(4);
        }
        customId = `task-${baseId}-${index + 1}`;
      }

      onCreateTask({
        id: customId,
        campaignId: parentCampaignId,
        influencerId: influencerId,
        title: newProduct.trim() || 'Premium Wireless Headset Launch',
        type: 'Video Sponsor Integration',
        deadline: calculatedPlannedDate,
        status: (newVideoLink1.trim() || newVideoLink2.trim() || newVideoLink3.trim() || newShortIoLink.trim()) ? 'Completed' : 'Pending',
        remuneration: newAmount ? parseFloat(newAmount) : 0,
        sampleCost: newSampleCost === '' ? null : (parseFloat(newSampleCost) !== undefined ? parseFloat(newSampleCost) : null),
        orderId: newOrderId.trim(),
        orderDate: newOrderDate.trim(),
        orderPlatform: newOrderPlatform,
        advanceAmountReceived: parseFloat(newAdvanceAmountReceived) || 0,
        advanceAmountDate: newAdvanceAmountDate,
        mediaRightAmount: parseFloat(newMediaRightAmount) || 0,
        releaseDate: calculatedActualDate,
        secondaryInfluencerName: bulkInf ? bulkInf.name : '',
        platform: detectPlatform(newVideoLink1, newVideoLink2, newVideoLink3) || 'YouTube',
        views: parseInt(newViews, 10) || 0,
        clicks: parseInt(newClicks, 10) || 0,
        ctr: newCtr.trim() !== '' ? parseFloat(newCtr) : undefined,
        cpc: newCpc.trim() !== '' ? parseFloat(newCpc) : undefined,
        cpv: newCpv.trim() !== '' ? parseFloat(newCpv) : undefined,
        videoLink1: newVideoLink1.trim(),
        videoLink2: newVideoLink2.trim(),
        videoLink3: newVideoLink3.trim(),
        shortIoLink: newShortIoLink.trim(),
        needsSample: newNeedsSample,
        videoId: manualVideoId.trim() ? `${manualVideoId.trim()}-${index + 1}` : undefined
      });
    });

    // Reset Form fields
    setNewNeedsSample(false);
    setNewAmount('');
    setNewProduct('');
    setManualVideoId('');
    setNewActualDay('15');
    setNewActualMonth('05');
    setNewActualYear('2026');
    setNewViews('0');
    setNewClicks('0');
    setNewCtr('');
    setNewCpc('');
    setNewCpv('');
    setNewSampleCost('0');
    setNewOrderId('');
    setNewOrderDate('');
    setNewOrderPlatform('PTG');
    setNewAdvanceAmountReceived('0');
    setNewAdvanceAmountDate('');
    setNewMediaRightAmount('0');
    setNewVideoLink1('');
    setNewVideoLink2('');
    setNewVideoLink3('');
    setNewShortIoLink('');
    setBulkInfluencerIds([]);
    setShowBulkAddForm(false);
    if (onForceGlobalBackup) onForceGlobalBackup();
  };

  // Master quick clean appender row
  const handleAddQuickEmptyRow = () => {
    if (!onCreateTask) return;
    const parentCampaignId = campaigns[0]?.id || 'camp-1';
    const activeInfluencers = influencers.filter(i => i.status !== 'Future Creator');
    const randomInfluencerId = (activeInfluencers.length > 0 ? activeInfluencers : influencers)[Math.floor(Math.random() * (activeInfluencers.length || influencers.length))]?.id || '';
    
    // Choose tomorrow as default planned launch
    const today = new Date();
    const localToday = new Date(today.getTime() - today.getTimezoneOffset() * 60000);
    const futureDate = new Date(localToday);
    futureDate.setDate(localToday.getDate() + 15);
    const plannedStr = futureDate.toISOString().split('T')[0];

    onCreateTask({
      campaignId: parentCampaignId,
      influencerId: randomInfluencerId,
      title: 'New Eco Apparel Launch',
      type: 'Social Video integration',
      deadline: plannedStr,
      status: 'Pending',
      remuneration: 0,
      releaseDate: '',
      platform: 'Unknown',
      views: 0,
      clicks: 0,
      videoLink1: '',
      videoLink2: '',
      videoLink3: '',
      shortIoLink: '',
      orderId: '',
      orderDate: '',
      orderPlatform: 'PTG',
      videoId: `VID${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`
    });
    if (onForceGlobalBackup) onForceGlobalBackup();
  };

  // Filter tasks based on Search (influencer name, product name) and month filter
  let hiddenStats = {
    search: 0,
    date: 0,
    completion: 0,
    total: 0
  };

  let filteredTasks = tasks.filter((t, idx) => {
    const influencer = influencers.find(inf => inf.id === t.influencerId);
    const influencerName = (influencer ? String(influencer.name) : (t.secondaryInfluencerName || '')).toLowerCase();
    const productTitle = t.title ? String(t.title).toLowerCase() : '';
    
    // Search matching
    const matchesSearch = influencerName.includes(searchTerm.toLowerCase()) || 
                          productTitle.includes(searchTerm.toLowerCase()) ||
                          getVideoDisplayId(t, idx).toLowerCase().includes(searchTerm.toLowerCase());

    // Month & Year matching
    const hasLink = !!((typeof t.videoLink1 === 'string' ? t.videoLink1.trim() : '') || (typeof t.videoLink2 === 'string' ? t.videoLink2.trim() : '') || (typeof t.videoLink3 === 'string' ? t.videoLink3.trim() : '') || (typeof t.shortIoLink === 'string' ? t.shortIoLink.trim() : ''));
    const isCompleted = (t.status === 'Completed' || hasLink) && hasLink;
    const isDateMatch = isTaskInPeriod(t, monthFilter, yearFilter, weekFilter) || showHiddenTasks;

    // Completion filter matching (completed if any videoLink1, videoLink2 or videoLink3 is present and non-empty)
    let matchesCompletion = true;
    if (completionFilter === 'completed') {
      matchesCompletion = isCompleted;
    } else if (completionFilter === 'uncompleted') {
      matchesCompletion = !isCompleted;
    } else if (completionFilter === 'reels') {
      matchesCompletion = hasReelLink(t);
    }

    if (!matchesSearch) hiddenStats.search++;
    else if (!isDateMatch) hiddenStats.date++;
    else if (!matchesCompletion) hiddenStats.completion++;

    const isVisible = matchesSearch && isDateMatch && matchesCompletion;
    if (!isVisible) hiddenStats.total++;
    
    return isVisible;
  });

  // Apply sorting if sortField is selected
  if (sortField) {
    filteredTasks = [...filteredTasks].sort((a, b) => {
      let valA = '';
      let valB = '';
      if (sortField === 'planned') {
        valA = a.deadline || '';
        valB = b.deadline || '';
      } else if (sortField === 'actual') {
        valA = a.releaseDate || '';
        valB = b.releaseDate || '';
      }
      
      // Push empty dates to the bottom
      if (!valA && valB) return 1;
      if (valA && !valB) return -1;
      if (!valA && !valB) return 0;
      
      const comp = valA.localeCompare(valB);
      return sortAsc ? comp : -comp;
    });
  }

  // Financial summary numbers based on filter
  const activeFilteredTasks = filteredTasks.filter(t => t.status !== 'Cancelled');
  const totalPlannedCost = activeFilteredTasks.reduce((sum, t) => sum + (t.remuneration || 0), 0);
  const totalBaseSampleCost = activeFilteredTasks.reduce((sum, t) => sum + (t.sampleCost || 0), 0);
  const totalSampleCost = totalBaseSampleCost;
  const totalMediaRightAmount = activeFilteredTasks.reduce((sum, t) => sum + (t.mediaRightAmount || 0), 0);
  const totalPostedCount = activeFilteredTasks.filter(t => !!(t.videoLink1 || t.videoLink2 || t.videoLink3)).length;


  // Microsoft Excel download spreadsheet generator
  const handleDownloadExcel = () => {
    // Exact requested columns alignment: Serial No, Video Id, Influencer name, Product, Planed video release date, actual date, video link 1, video link 2, video link 3, amount, Views, Clicks
    const headers = [
      'Serial No',
      'Video Id',
      'Influencer name',
      'Product',
      'Planed video release date',
      'actual date',
      'Sec. Influencer',
      'Video Link 1',
      'Video Link 2',
      'Video Link 3',
      'Short.io Link',
      'amount',
      'Sample Cost (₹)',
      'Order ID',
      'Order Date',
      'Order Platform',
      'Video Platform',
      'Media Right (₹)',
      'Views',
      'Clicks',
      'CTR (%)',
      'CPC (₹)',
      'CPV (₹)'
    ];

    const rows = filteredTasks.map((t, idx) => {
      const influencer = influencers.find(inf => inf.id === t.influencerId);
      const serialNo = idx + 1;
      const videoId = getVideoDisplayId(t, idx);
      const influencerName = influencer ? influencer.name : (t.secondaryInfluencerName || 'Unassigned');
      const product = t.title || '';
      const plannedDate = t.deadline || '';
      const actualDate = t.releaseDate || '';
      const secInfluencer = t.secondaryInfluencerName || '';
      const videoLink1 = t.videoLink1 || '';
      const videoLink2 = t.videoLink2 || '';
      const videoLink3 = t.videoLink3 || '';
      const shortIoLink = t.shortIoLink || '';
      const amount = t.remuneration || 0;
      const sampleCost = t.sampleCost || 0;
      const orderId = t.orderId || '';
      const orderDate = t.orderDate || '';
      const orderPlatform = t.orderPlatform || 'PTG';
      const videoPlatform = t.platform || '';
      const mediaRightAmount = t.mediaRightAmount || 0;
      const views = t.views || 0;
      const clicks = t.clicks || 0;
      const ctr = t.ctr !== undefined ? t.ctr : (views ? parseFloat(((clicks / views) * 100).toFixed(2)) : 0);
      const cpc = t.cpc !== undefined ? t.cpc : (clicks ? parseFloat((amount / clicks).toFixed(2)) : 0);
      const cpv = t.cpv !== undefined ? t.cpv : (views ? parseFloat((amount / views).toFixed(3)) : 0);

      // Escape quotes and wrap values containing commas/newlines in quotes for perfect Excel CSV opening
      const formatValueForExcel = (val: string | number) => {
        const text = String(val).replace(/"/g, '""');
        return text.includes(',') || text.includes('"') || text.includes('\n') ? `"${text}"` : text;
      };

      return [
        serialNo,
        formatValueForExcel(videoId),
        formatValueForExcel(influencerName),
        formatValueForExcel(product),
        formatValueForExcel(plannedDate),
        formatValueForExcel(actualDate),
        formatValueForExcel(secInfluencer),
        formatValueForExcel(videoLink1),
        formatValueForExcel(videoLink2),
        formatValueForExcel(videoLink3),
        formatValueForExcel(shortIoLink),
        amount,
        sampleCost,
        formatValueForExcel(orderId),
        formatValueForExcel(orderDate),
        formatValueForExcel(orderPlatform),
        formatValueForExcel(videoPlatform),
        mediaRightAmount,
        views,
        clicks,
        ctr,
        cpc,
        cpv
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\r\n');
    
    // Prefix UTF-8 BOM so Microsoft Excel processes custom language charsets and columns flawlessly
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    
    const formattedFilter = monthFilter === 'ALL' ? 'all' : monthFilter;
    const formattedWeek = weekFilter === 'ALL' ? '' : `_W${weekFilter}`;
    link.setAttribute('download', `Campaign_Planner_${formattedFilter}_${new Date().toLocaleString('en-GB').replace(/[\/:]/g, '-').replace(', ', '_')}.csv`);
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Modify a specific product revenue target inline
  const handleUpdateRevenueTarget = (productName: string, targetVal: number) => {
    setDashboardProducts(prev => prev.map(p => {
      if (p.name === productName) {
        return { ...p, revenueTarget: Math.max(0, targetVal) };
      }
      return p;
    }));
  };

  // --- Duplicate Detection ---
  const duplicateWarnings: { key: string; influencerName: string; reason: string }[] = [];
  const groupedByVideoId = new Map<string, Task[]>();
  const groupedByInfProduct = new Map<string, Task[]>();
  const groupedByShortIoLink = new Map<string, Task[]>();
  const groupedByVideoLink = new Map<string, Task[]>();

  filteredTasks.forEach(t => {
    if (typeof t.videoId === 'string' && t.videoId.trim()) {
      const key = t.videoId.trim().toLowerCase();
      if (!groupedByVideoId.has(key)) groupedByVideoId.set(key, []);
      groupedByVideoId.get(key)!.push(t);
    }
    
    if (t.influencerId && typeof t.title === 'string') {
      const key = `${t.influencerId}-${t.title.trim().toLowerCase()}`;
      if (!groupedByInfProduct.has(key)) groupedByInfProduct.set(key, []);
      groupedByInfProduct.get(key)!.push(t);
    }

    if (typeof t.shortIoLink === 'string' && String(t.shortIoLink || '').trim()) {
      const key = String(t.shortIoLink || '').trim().toLowerCase();
      if (!groupedByShortIoLink.has(key)) groupedByShortIoLink.set(key, []);
      groupedByShortIoLink.get(key)!.push(t);
    }

    const checkVideoLink = (link?: any) => {
      if (typeof link === 'string' && link.trim()) {
        const key = link.trim().toLowerCase();
        if (!groupedByVideoLink.has(key)) groupedByVideoLink.set(key, []);
        groupedByVideoLink.get(key)!.push(t);
      }
    };
    checkVideoLink(t.videoLink1);
    checkVideoLink(t.videoLink2);
    checkVideoLink(t.videoLink3);
  });

  for (const [key, tasksGroup] of groupedByVideoId.entries()) {
    if (tasksGroup.length > 1) {
      const infNames = Array.from(new Set(tasksGroup.map(t => {
        const inf = influencers.find(i => i.id === t.influencerId);
        return inf ? inf.name : 'Unknown';
      }))).join(', ');
      duplicateWarnings.push({
        key: `vid-${key}`,
        influencerName: infNames,
        reason: `Duplicate Video ID "${tasksGroup[0].videoId}" used in ${tasksGroup.length} entries.`,
      });
    }
  }

  for (const [key, tasksGroup] of groupedByShortIoLink.entries()) {
    if (tasksGroup.length > 1) {
      const uniqueTasks = Array.from(new Set(tasksGroup));
      if (uniqueTasks.length > 1) {
        const infNames = Array.from(new Set(uniqueTasks.map(t => {
          const inf = influencers.find(i => i.id === t.influencerId);
          return inf ? inf.name : 'Unknown';
        }))).join(', ');
        duplicateWarnings.push({
          key: `shortio-${key}`,
          influencerName: infNames,
          reason: `Duplicate Short.io Link used in ${uniqueTasks.length} entries.`,
        });
      }
    }
  }

  for (const [key, tasksGroup] of groupedByVideoLink.entries()) {
    if (tasksGroup.length > 1) {
      const uniqueTasks = Array.from(new Set(tasksGroup));
      if (uniqueTasks.length > 1) {
        const infNames = Array.from(new Set(uniqueTasks.map(t => {
          const inf = influencers.find(i => i.id === t.influencerId);
          return inf ? inf.name : 'Unknown';
        }))).join(', ');
        duplicateWarnings.push({
          key: `videolink-${key}`,
          influencerName: infNames,
          reason: `Duplicate Video Link used in ${uniqueTasks.length} entries.`,
        });
      }
    }
  }

  for (const [key, tasksGroup] of groupedByInfProduct.entries()) {
    if (tasksGroup.length > 1) {
      // Check if these tasks already flagged under video ID
      const hasDefinedVideoId = tasksGroup.some(t => typeof t.videoId === 'string' && t.videoId.trim());
      if (!hasDefinedVideoId) {
        const inf = influencers.find(i => i.id === tasksGroup[0].influencerId);
        duplicateWarnings.push({
          key: `inf-prod-${key}`,
          influencerName: inf ? inf.name : 'Unknown',
          reason: `Assigned to product "${tasksGroup[0].title}" ${tasksGroup.length} times without unique Video IDs.`,
        });
      }
    }
  }

  
  const handleAutoCopyNextMonth = () => {
    const currentM = monthFilter === 'ALL' ? (new Date().getMonth() + 1) : parseInt(monthFilter, 10);
    const currentY = yearFilter === 'ALL' ? new Date().getFullYear() : parseInt(yearFilter, 10);
    
    const currMStr = String(currentM).padStart(2, '0');
    const currYStr = String(currentY);
    
    // JS months are 0-indexed. Passing currentM exactly moves to the next month!
    const nextDate = new Date(currentY, currentM, 1); 
    const nextMStr = String(nextDate.getMonth() + 1).padStart(2, '0');
    const nextYStr = String(nextDate.getFullYear());
    
    const sourceTasks = tasks.filter(t => {
      if (!t.deadline) return false;
      return t.deadline.startsWith(`${currYStr}-${currMStr}-`);
    });
    
    if (sourceTasks.length === 0) {
      alert(`No tasks found in ${currMStr}/${currYStr} to copy.`);
      return;
    }
    
    if (!confirm(`Found ${sourceTasks.length} videos scheduled for ${currMStr}/${currYStr}. This macro will auto-generate a fresh schedule for ${nextMStr}/${nextYStr} with the exact same creators and products. Proceed?`)) {
      return;
    }
    
    sourceTasks.forEach((t, i) => {
       const dayStr = t.deadline.split('-')[2] || '01';
       let nd = new Date(Number(nextYStr), Number(nextMStr) - 1, Number(dayStr));
       if (nd.getMonth() !== Number(nextMStr) - 1) {
           nd = new Date(Number(nextYStr), Number(nextMStr), 0);
       }
       const finalDayStr = String(nd.getDate()).padStart(2, '0');
       
       const newDeadline = `${nextYStr}-${nextMStr}-${finalDayStr}`;
       const newVideoId = `VID${Date.now().toString().slice(-4)}${Math.floor(Math.random() * 10000)}${i}`;
       
       onCreateTask?.({
          campaignId: t.campaignId,
          influencerId: t.influencerId,
          title: t.title,
          type: t.type,
          deadline: newDeadline,
          status: 'Pending',
          remuneration: t.remuneration,
          sampleCost: t.sampleCost,
          releaseDate: '',
          views: 0,
          clicks: 0,
          videoLink1: '',
          videoLink2: '',
          videoLink3: '',
          shortIoLink: '',
          orderId: '',
          orderDate: '',
          videoId: newVideoId,
          platform: t.platform
       });
    });
    
    alert(`Successfully scheduled ${sourceTasks.length} videos for ${nextMStr}/${nextYStr}!`);
  };

  const handleMergeAllDuplicates = () => {
    if (!onUpdateTask || (!onDeleteTask && !onBulkDeleteTasks)) return;
    if (!window.confirm("Are you sure you want to merge all detected duplicate entries? This action cannot be undone.")) return;
    
    const groupsToMerge = [];
    
    for (const [key, tasksGroup] of groupedByVideoId.entries()) {
      if (tasksGroup.length > 1) groupsToMerge.push(tasksGroup);
    }
    for (const [key, tasksGroup] of groupedByShortIoLink.entries()) {
      const uniqueTasks = Array.from(new Set(tasksGroup));
      if (uniqueTasks.length > 1) groupsToMerge.push(uniqueTasks);
    }
    for (const [key, tasksGroup] of groupedByVideoLink.entries()) {
      const uniqueTasks = Array.from(new Set(tasksGroup));
      if (uniqueTasks.length > 1) groupsToMerge.push(uniqueTasks);
    }
    // Monthly Planner New-Entry Guard: Do NOT merge/delete tasks solely by (influencer + product)
    // because a creator can have multiple planned/newly entered tasks for the same product.
    // Also protect any newly entered task (created within the last 24 hours without duplicate videoId/link) from deletion.

    const processedTaskIds = new Set();
    const tasksToDelete: string[] = [];
    
    groupsToMerge.forEach(group => {
      const tasksToMerge = group.filter(t => !processedTaskIds.has(t.id));
      if (tasksToMerge.length < 2) return;
      
      tasksToMerge.forEach(t => processedTaskIds.add(t.id));
      
      // Determine base task (preferably one with a valid influencer)
      let baseTask = tasksToMerge[0];
      for (const t of tasksToMerge) {
        if (t.influencerId && influencers.find(inf => inf.id === t.influencerId)?.name) {
          baseTask = t;
          break;
        }
      }
      
      const mergedData = { ...baseTask };
      
      // Merge other properties
      tasksToMerge.forEach(t => {
        if (t.id === baseTask.id) return;
        Object.keys(t).forEach(key => {
          if (!mergedData[key as keyof Task] && t[key as keyof Task]) {
            (mergedData as any)[key] = (t as any)[key];
          }
        });
        
        // Priority for influencer mapping
        if (!mergedData.influencerId && t.influencerId) {
            const inf = influencers.find(i => i.id === t.influencerId);
            if (inf && inf.name) {
                mergedData.influencerId = t.influencerId;
            }
        }
      });
      
      // Update base task
      if (onUpdateTask) {
        onUpdateTask(baseTask.id, mergedData);
      }
      
      // Delete others
      tasksToMerge.forEach(t => {
        if (t.id !== baseTask.id) {
          tasksToDelete.push(t.id);
        }
      });
    });
    
    if (tasksToDelete.length > 0) {
      if (onBulkDeleteTasks) {
         onBulkDeleteTasks(tasksToDelete);
      } else if (onDeleteTask) {
         tasksToDelete.forEach(id => onDeleteTask(id));
      }
    }
    
    // alert("Merged all duplicate entries successfully!");
  };


  // --- Autosave Tasks to TASK FOR RECOVERY ---
  React.useEffect(() => {
    // Only auto-save if tasks array is loaded and has length
    if (tasks && tasks.length > 0) {
      // Safety check: ensure tasks are structurally valid before overwriting the backup
      const isValidTask = (t: any) => t && typeof t === 'object' && t.id && t.title;
      if (!tasks.every(isValidTask)) {
        console.warn("Tasks data appears corrupted. Auto-backup aborted to protect TASK FOR RECOVERY.");
        return;
      }

      try {
        const NOTES_KEY = 'INFLUENCER_MANAGER_NOTEBOOK_NOTES';
        const saved = safeLocalStorage.getItem(NOTES_KEY);
        let notes = saved ? JSON.parse(saved) : [];
        
        const backupNote = {
          id: 'rec-auto',
          title: 'TASK FOR RECOVERY',
          content: JSON.stringify(tasks, null, 2),
          date: 'Global-TaskRecovery',
          lastUpdated: new Date().toISOString()
        };
        
        const existingIdx = notes.findIndex((n: any) => n.date === 'Global-TaskRecovery' && n.title === 'TASK FOR RECOVERY');
        // Let's only update if the content has changed to avoid unnecessary saves
        if (existingIdx >= 0) {
          if (notes[existingIdx].content !== backupNote.content) {
             notes[existingIdx] = backupNote;
             safeLocalStorage.setItem(NOTES_KEY, JSON.stringify(notes));
          }
        } else {
          notes.push(backupNote);
          safeLocalStorage.setItem(NOTES_KEY, JSON.stringify(notes));
        }
      } catch (e) {
        console.error("Auto backup failed:", e);
      }
    }
  }, [tasks]);

  const handleBackupToTaskRecovery = () => {
    if (!window.confirm("Are you sure you want to backup all current tasks to TASK FOR RECOVERY in the Calendar Notebook?")) return;
    try {
      const NOTES_KEY = 'INFLUENCER_MANAGER_NOTEBOOK_NOTES';
      const saved = safeLocalStorage.getItem(NOTES_KEY);
      let notes = saved ? JSON.parse(saved) : [];
      
      const backupNote = {
        id: 'rec-' + Date.now().toString(),
        title: 'TASK FOR RECOVERY',
        content: JSON.stringify(tasks, null, 2),
        date: 'Global-TaskRecovery',
        lastUpdated: new Date().toISOString()
      };
      
      const existingIdx = notes.findIndex((n: any) => n.date === 'Global-TaskRecovery' && n.title === 'TASK FOR RECOVERY');
      if (existingIdx >= 0) {
        notes[existingIdx] = backupNote;
      } else {
        notes.push(backupNote);
      }
      
      safeLocalStorage.setItem(NOTES_KEY, JSON.stringify(notes));
      alert("Successfully backed up tasks to TASK FOR RECOVERY in Calendar Notebook.");
    } catch (e) {
      console.error(e);
      alert("Failed to backup tasks.");
    }
  };

  return (
    <div className="space-y-6" id="campaign-planner-container">
      <RecentShipmentsFab notebookNotes={notebookNotes} selectedMonth={monthFilter} selectedYear={yearFilter} onCreateTaskForShipment={(influencerName, product, orderDate, cost, orderId, platform) => {
        if (!onCreateTask) return;
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + 2);
        const formattedDeadline = targetDate.toISOString().split("T")[0];
        onCreateTask({
          type: "Video",
          title: product,
          influencerId: influencers.find(i => i.name.toLowerCase().trim() === influencerName.toLowerCase().trim())?.id || influencerName.trim(),
          secondaryInfluencerName: influencerName.trim(),
          deadline: formattedDeadline,
          status: "Pending",
          remuneration: 0,
          videoId: `VID-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
          campaignId: "camp-1",
          sampleCost: cost !== undefined ? Number(cost) : undefined,
          orderId: orderId,
          orderDate: orderDate,
          orderPlatform: platform
        });
      }} />
      {duplicateWarnings.length > 0 && (
        <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-r-lg shadow-sm">
          <div className="flex items-start gap-3">
            <TriangleAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-amber-900">Duplicate Entries Detected</h3>
                <button
                  onClick={handleMergeAllDuplicates}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded shadow-sm transition self-start"
                >
                  Merge All Duplicates
                </button>
              </div>
              <p className="text-xs text-amber-700 mt-1">Please review the following duplicates to avoid tracking errors:</p>
              <ul className="mt-2 space-y-1.5">
                {duplicateWarnings.map(warning => (
                  <li key={warning.key} className="text-xs text-amber-800 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-amber-400 rounded-full inline-block shrink-0" />
                    <strong>{warning.influencerName}</strong>: {warning.reason}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Visual Header Grid Panel */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-5 rounded-xl border border-gray-150 shadow-xs gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1 px-2.5 bg-red-50 text-red-650 font-mono text-[10px] font-extrabold uppercase rounded-md border border-red-100">
              Interactive Dashboard
            </span>
            <div className="flex items-center gap-1 font-mono text-[10px] text-gray-400">
              <span className="w-1.5 h-1.5 bg-red-600 rounded-full inline-block animate-pulse" />
              Calendar Scheduler mode
            </div>
          </div>
          <h2 className="text-xl font-black text-gray-800 tracking-tight mt-1 flex items-center gap-2 font-sans">
            <CalendarIcon className="w-5 h-5 text-red-655" />
            Monthly Campaign Planner
          </h2>
          <p className="text-xs text-gray-500 mt-1 max-w-xl">
            Input, schedule, and edit release targets directly inside the central workflow spreadsheet. Focuses exclusively on Video ID tracking, Creator assignments, and release timelines.
          </p>
        </div>

        {/* Buttons */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <button
            onClick={() => setShowAllReelsModal(true)}
            className="w-full md:w-auto inline-flex justify-center items-center gap-1.5 bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white px-3.5 py-2 rounded-lg text-xs font-bold transition shadow-xs cursor-pointer"
            title="View all reel links and their live views in the campaign"
          >
            <Film className="w-3.5 h-3.5" /> 🎬 View All Reels ({tasks.filter(hasReelLink).length})
          </button>
          
          <button
            onClick={() => handleManualRestoreCreators(false)}
            className="w-full md:w-auto inline-flex justify-center items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-3.5 py-2 rounded-lg text-xs font-bold transition border border-emerald-200 cursor-pointer"
            title="Restore missing creators using secondary influencer names"
          >
            <UserPlus className="w-3.5 h-3.5" /> Restore Creators
          </button>

          <button
            onClick={handleRemoveAndRefreshShortIo}
            className="w-full md:w-auto inline-flex justify-center items-center gap-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 px-3.5 py-2 rounded-lg text-xs font-bold transition border border-rose-200 cursor-pointer"
            title="Remove & Refresh All SHORT.IO LINK tracking locally"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Reset Short.io Tracker
          </button>
          

          <div className="flex items-center gap-2 group relative">
            <button
              onClick={handleBackupToTaskRecovery}
              className="w-full md:w-auto inline-flex justify-center items-center gap-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 px-3.5 py-2 rounded-lg text-xs font-bold transition border border-purple-200 cursor-pointer"
              title="Backup Monthly Planner tasks to TASK FOR RECOVERY"
            >
              <Database className="w-3.5 h-3.5" /> Backup to Recovery
            </button>
            <div className="absolute top-full mt-2 left-0 w-64 bg-gray-800 text-white text-[10px] p-2 rounded shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
              Isolated Backup: Data crashes in the Monthly Planner will not affect your TASK FOR RECOVERY backup. It remains a safe recovery option.
            </div>
          </div>
          <button
            onClick={performSecureSave}
            disabled={isSaving}
            className="w-full md:w-auto inline-flex justify-center items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition shadow-md cursor-pointer disabled:opacity-75"
          >
            {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} 
            {isSaving ? 'Saving...' : 'Secure Save'}
          </button>
          {lastSaved && (
            <span className="text-[10px] text-gray-400 font-mono hidden md:inline-block ml-1">
              Last saved: {lastSaved.toLocaleTimeString()}
            </span>
          )}

          <button
            onClick={handleAddQuickEmptyRow}
            className="w-full md:w-auto inline-flex justify-center items-center gap-1.5 bg-gray-50 hover:bg-gray-100 text-gray-700 px-3.5 py-2 rounded-lg text-xs font-bold transition border border-gray-200 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> Fast Add Row
          </button>
          
          <input 
            type="file" 
            accept=".csv,text/csv,text/plain,application/vnd.ms-excel" 
            ref={fileInputRef} 
            onChange={handleImportCSV} 
            onClick={(e) => { (e.target as HTMLInputElement).value = ''; }}
            className="hidden" 
            id="planner-csv-upload" 
          />
          <label 
            htmlFor="planner-csv-upload"
            className="w-full md:w-auto inline-flex justify-center items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition shadow-md cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" /> Import CSV
          </label>

          {onBulkDeleteTasks && filteredTasks.length > 0 && (
            <button
              onClick={handleClearAll}
              className="w-full md:w-auto inline-flex justify-center items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition shadow-md cursor-pointer"
            >
              <Trash2 className="w-4 h-4" /> Clear All ({filteredTasks.length})
            </button>
          )}

          <button
            onClick={handleExportCSV}
            className="w-full md:w-auto inline-flex justify-center items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition shadow-md cursor-pointer"
          >
            <Download className="w-4 h-4" /> Export CSV
          </button>

          <button
            onClick={() => { 
              if (!showAddForm) {
                setManualVideoId(`VID${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`);
              }
              const d = new Date();
              setNewPlannedMonth((d.getMonth() + 1).toString().padStart(2, '0'));
              setNewPlannedYear(d.getFullYear().toString());
              
              setShowAddForm(!showAddForm); 
              setShowBulkAddForm(false); 
            }}
            className="w-full md:w-auto inline-flex justify-center items-center gap-1.5 bg-gradient-to-r from-rose-500 via-fuchsia-500 to-indigo-500 hover:from-rose-600 hover:via-fuchsia-600 hover:to-indigo-600 text-white px-5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition shadow-md cursor-pointer animate-pulse-slow"
          >
            <Sparkles className="w-4 h-4" /> Wizard Scheduler
          </button>
          

          <button
            onClick={handleAutoCopyNextMonth}
            className="w-full md:w-auto inline-flex justify-center items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition shadow-md cursor-pointer"
            title="Auto-copy current month schedule to the upcoming month"
          >
            <CalendarIcon className="w-4 h-4" /> Schedule Next Month
          </button>
            
          <button
            onClick={() => { 
              if (!showBulkAddForm) {
                setManualVideoId(`VID${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`);
              }
              setShowBulkAddForm(!showBulkAddForm); 
              setShowAddForm(false); 
            }}
            className="w-full md:w-auto inline-flex justify-center items-center gap-1.5 bg-gradient-to-r from-amber-500 via-orange-500 to-red-500 hover:from-amber-600 hover:via-orange-600 hover:to-red-600 text-white px-5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition shadow-md cursor-pointer animate-pulse-slow"
          >
            <Users className="w-4 h-4" /> Bulk Wizard
          </button>
        </div>
      </div>

      {/* Target Auto-Sync Configuration Widget */}
      <div className="bg-red-50/40 border border-red-150 rounded-xl p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 text-left shadow-2xs">
        <div className="space-y-1 flex-1">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full inline-block ${autoSyncPlannerWithTargets ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
            <h4 className="text-xs font-black uppercase tracking-wider text-red-950 font-sans flex items-center gap-1.5">
              <span>��</span> Planner-Targets Dynamic Auto-Synchronizer
            </h4>
          </div>
          <p className="text-[11px] text-gray-500 leading-relaxed max-w-2xl font-sans">
            {autoSyncPlannerWithTargets ? (
              <>
                <strong>Always-On Active Sync</strong> is enabled. Any creator scheduling or video target rows in this planner automatically define the <strong>Video Goal Target</strong> inside the Monthly Targets & Progress matrices for <strong>{monthFilter === 'ALL' ? 'all months' : `Month:${monthFilter}-Year:${yearFilter}${weekFilter === 'ALL' ? '' : '-Week:' + weekFilter}`}</strong>.
              </>
            ) : (
              <>
                <strong>Sync is Frozen</strong>. Targets and Planner tasks are decoupled: changes in the Campaign Planner spreadsheet will not overwrite your manual video goals inside the Monthly Targets manager.
              </>
            )}
          </p>
        </div>

        <div className="flex items-center gap-4.5 shrink-0 bg-white border border-gray-200/60 p-2.5 rounded-lg shadow-3xs">
          <label className="relative inline-flex items-center cursor-pointer select-none">
            <input 
              type="checkbox" 
              checked={autoSyncPlannerWithTargets}
              onChange={(e) => setAutoSyncPlannerWithTargets(e.target.checked)}
              className="sr-only peer"
              id="planner-targets-autosync-checkbox"
            />
            <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-red-650"></div>
            <span className="ml-2.5 text-xs font-extrabold text-gray-700 tracking-tight uppercase font-sans">
              Auto-Sync Targets
            </span>
          </label>
        </div>
      </div>



      {/* Wizard Scheduler Expandable form */}
      {(showAddForm || showBulkAddForm) && (
        <form onSubmit={showBulkAddForm ? handleBulkAddNewRows : handleAddNewRow} className={`bg-gradient-to-br ${showBulkAddForm ? 'from-amber-500 via-orange-500 to-red-600' : 'from-emerald-500 via-teal-500 to-cyan-600'} rounded-2xl p-6 shadow-xl animate-fade-in space-y-5 relative overflow-hidden`}>
          {/* Decorative background element */}
          <div className="absolute -top-24 -right-24 w-64 h-64 bg-yellow-300 rounded-full mix-blend-overlay filter blur-3xl opacity-30 animate-blob"></div>
          <div className="absolute top-12 -left-12 w-48 h-48 bg-white rounded-full mix-blend-overlay filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>

          <div className="flex justify-between items-center pb-3 border-b border-white/20 relative z-10">
            <h3 className="text-sm font-mono font-black uppercase tracking-widest flex items-center gap-2 text-white">
              <span className="p-1.5 bg-white/20 backdrop-blur-sm rounded-md shadow-sm">��</span> {showBulkAddForm ? 'Bulk Schedule Video Placements (Multiple Creators)' : 'Add New Video Campaign Placement'}
            </h3>
            <button 
              type="button" 
              onClick={() => { setShowAddForm(false); setShowBulkAddForm(false); }} 
              className={`text-white/80 hover:text-white text-xs font-bold uppercase tracking-wider bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition-colors border border-white/20`}
            >
              Cancel
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 relative z-10">
            <div className="space-y-1">
              <label className={`text-[10px] font-black ${showBulkAddForm ? 'text-amber-100' : 'text-emerald-100'} uppercase font-mono tracking-wider`}>Manual Video ID (Optional)</label>
              <input
                type="text"
                className="w-full text-xs text-slate-800 bg-white/90 focus:bg-white px-3 py-2 border border-transparent rounded-lg focus:ring-2 focus:ring-white focus:outline-none font-mono transition-colors placeholder:text-gray-400 font-bold"
                placeholder="Auto-generated if empty"
                value={manualVideoId}
                onChange={(e) => setManualVideoId(e.target.value)}
              />
            </div>

            {showBulkAddForm ? (
              <div className="space-y-1">
                <div className="flex justify-between items-end">
                  <label className="text-[10px] font-black text-amber-100 uppercase font-mono tracking-wider">Select Creators</label>
                  <div className="flex gap-2">
                    <button 
                      type="button" 
                      onClick={() => setBulkInfluencerIds(influencers.filter(i => i.status !== 'Future Creator').map(i => i.id))} 
                      className="text-[9px] text-amber-200 hover:text-white uppercase font-bold"
                    >
                      All
                    </button>
                    <button 
                      type="button" 
                      onClick={() => setBulkInfluencerIds([])} 
                      className="text-[9px] text-amber-200 hover:text-white uppercase font-bold"
                    >
                      Clear
                    </button>
                  </div>
                </div>
                <div className="w-full h-44 overflow-y-auto bg-white/90 rounded border border-transparent focus-within:border-amber-300 p-2 space-y-1.5 custom-scrollbar">
                  <div className="relative mb-1">
                    <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-amber-700" />
                    <input
                      type="text"
                      placeholder="Search creators by name or niche..."
                      value={bulkSearchQuery}
                      onChange={e => setBulkSearchQuery(e.target.value)}
                      className="w-full pl-6 pr-2 py-1 text-xs bg-amber-50/70 border border-amber-200 rounded text-slate-800 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-amber-500 font-medium"
                    />
                  </div>
                  {influencers
                    .filter(i => i.status !== 'Future Creator')
                    .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }))
                    .filter(i => {
                      if (!bulkSearchQuery.trim()) return true;
                      const q = bulkSearchQuery.toLowerCase();
                      return (i.name || '').toLowerCase().includes(q) || (i.niche || '').toLowerCase().includes(q) || (i.handle || '').toLowerCase().includes(q);
                    })
                    .map(i => (
                      <label key={i.id} className="flex items-center gap-2 cursor-pointer hover:bg-amber-100 p-1 rounded transition-colors text-xs text-slate-800">
                        <input
                          type="checkbox"
                          className="w-3.5 h-3.5 rounded text-amber-600 focus:ring-amber-500 cursor-pointer"
                          checked={bulkInfluencerIds.includes(i.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setBulkInfluencerIds(prev => [...prev, i.id]);
                            } else {
                              setBulkInfluencerIds(prev => prev.filter(id => id !== i.id));
                            }
                          }}
                        />
                        <span className="font-bold truncate w-28" title={i.name}>{i.name}</span>
                        <span className="text-[9px] text-gray-500 truncate" title={i.niche}>({i.niche})</span>
                      </label>
                    ))}
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <label className="text-[10px] font-black text-emerald-100 uppercase font-mono tracking-wider">Influencer Name</label>
                <select
                  required
                  className="w-full text-xs text-gray-800 bg-white/95 px-3 py-2 border border-transparent rounded-lg focus:ring-2 focus:ring-white focus:outline-none font-sans font-bold cursor-pointer"
                  value={newInfluencerId}
                  onChange={(e) => setNewInfluencerId(e.target.value)}
                >
                  <option value="">-- Select Creator ({influencers.filter(i => i.status !== 'Future Creator').length} available) --</option>
                  {influencers
                    .filter(i => i.status !== 'Future Creator')
                    .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }))
                    .map((i: Influencer) => (
                      <option key={i.id} value={i.id}>{i.name} ({i.niche})</option>
                    ))
                  }
                </select>
              </div>
            )}

            <div className="space-y-1 md:col-span-2">
              <label className={`text-[10px] font-black ${showBulkAddForm ? 'text-amber-100' : 'text-emerald-100'} uppercase font-mono tracking-wider block`}>Product / Campaign Item Selector</label>
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <select
                    required
                    className="flex-1 text-xs text-slate-800 bg-white/90 hover:bg-white px-3 py-2 border border-transparent rounded-lg focus:ring-2 focus:ring-white focus:outline-none font-sans font-bold transition-colors cursor-pointer"
                    value={newProduct}
                    onChange={(e) => setNewProduct(e.target.value)}
                  >
                    <option value="">-- Select or Add Product --</option>
                    {savedProducts.filter(p => p !== 'CENTRAL_BUDGET').map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                  {newProduct && savedProducts.includes(newProduct) && (
                    <button
                      type="button"
                      onClick={() => handleRemoveProductFromSaved(newProduct)}
                      className="px-3 bg-rose-500 hover:bg-rose-600 text-white border border-rose-400 rounded-lg text-[9px] font-black uppercase tracking-wider transition-colors shadow-sm whitespace-nowrap cursor-pointer"
                      title="Remove this product option"
                    >
                      Remove Option
                    </button>
                  )}
                </div>

                {newProduct && (
                  <div className="flex gap-2 p-1.5 bg-white/10 border border-white/20 rounded-lg backdrop-blur-sm">
                    <input
                      type="text"
                      className="flex-1 text-[11px] text-slate-800 bg-white/90 focus:bg-white px-2 py-1.5 border border-transparent rounded-md focus:ring-2 focus:ring-white focus:outline-none font-bold transition-colors placeholder:text-gray-400"
                      value={editedProductName}
                      onChange={(e) => setEditedProductName(e.target.value)}
                      placeholder="Rename selected preset name..."
                    />
                    <button
                      type="button"
                      onClick={handleRenameProductOption}
                      className="px-3 bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-500 rounded-md text-[9px] font-black uppercase tracking-wider transition-colors shadow-sm whitespace-nowrap cursor-pointer"
                    >
                      Rename Preset
                    </button>
                  </div>
                )}

                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Enter new product to save..."
                    className="flex-1 text-[10px] text-slate-800 bg-white/90 focus:bg-white px-3 py-2 border border-transparent rounded-lg focus:ring-2 focus:ring-white focus:outline-none font-bold transition-colors placeholder:text-gray-400"
                    value={customProductToAdd}
                    onChange={(e) => setCustomProductToAdd(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={handleAddProductToSaved}
                    className="px-3 bg-teal-600 hover:bg-teal-700 text-white border border-teal-500 rounded-lg text-[9px] font-black uppercase tracking-wider transition-colors shadow-sm whitespace-nowrap cursor-pointer"
                    title="Save value for future select options list"
                  >
                    Save Option
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <label className={`text-[10px] font-black ${showBulkAddForm ? 'text-amber-100' : 'text-emerald-100'} uppercase font-mono tracking-wider`}>Planned Release Interval</label>
              <input
                type="date"
                required
                onClick={(e: any) => {
                  try {
                    if ('showPicker' in HTMLInputElement.prototype) {
                      (e.target as HTMLInputElement).showPicker();
                    }
                  } catch (err) {}
                }}
                className="w-full text-xs text-slate-800 bg-white/90 hover:bg-white px-3 py-2 border border-transparent rounded-lg focus:ring-2 focus:ring-white focus:outline-none font-mono font-bold transition-colors cursor-pointer"
                value={`${newPlannedYear}-${newPlannedMonth}-${newPlannedDay}`}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val) {
                    const parts = val.split('-');
                    if (parts.length === 3) {
                      setNewPlannedYear(parts[0]);
                      setNewPlannedMonth(parts[1]);
                      setNewPlannedDay(parts[2]);
                    }
                  }
                }}
              />
            </div>

            <div className="space-y-1">
              <label className={`text-[10px] font-black ${showBulkAddForm ? 'text-amber-100' : 'text-emerald-100'} uppercase font-mono tracking-wider`}>Actual Interval</label>
              {newVideoLink1.trim() || newVideoLink2.trim() || newVideoLink3.trim() ? (
                <input
                  type="date"
                  required
                  onClick={(e: any) => {
                    try {
                      if ('showPicker' in HTMLInputElement.prototype) {
                        (e.target as HTMLInputElement).showPicker();
                      }
                    } catch (err) {}
                  }}
                  className="w-full text-xs text-slate-800 bg-white/90 hover:bg-white px-3 py-2 border border-transparent rounded-lg focus:ring-2 focus:ring-white focus:outline-none font-mono font-bold transition-colors cursor-pointer"
                  value={`${newActualYear}-${newActualMonth}-${newActualDay}`}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val) {
                      const parts = val.split('-');
                      if (parts.length === 3) {
                        setNewActualYear(parts[0]);
                        setNewActualMonth(parts[1]);
                        setNewActualDay(parts[2]);
                      }
                    }
                  }}
                />
              ) : (
                <div
                  className="w-full text-xs text-emerald-100/50 bg-white/10 px-3 py-2 border border-transparent rounded-lg font-mono font-bold cursor-not-allowed flex items-center justify-between h-[34px]"
                  title="Add a video link to unlock Actual Date"
                >
                  <span className={`flex items-center gap-1.5 ${showBulkAddForm ? 'text-amber-100/50' : 'text-emerald-100/50'}`}><Clock className="w-3.5 h-3.5 opacity-50" /> Locked</span>
                </div>
              )}
            </div>

            <div className="space-y-1">
              <label className={`text-[10px] font-black ${showBulkAddForm ? 'text-amber-100' : 'text-emerald-100'} uppercase font-mono tracking-wider`}>Amount (₹)</label>
              <input
                type="number"
                required
                className="w-full text-xs text-slate-800 bg-white/90 hover:bg-white px-3 py-2 border border-transparent rounded-lg focus:ring-2 focus:ring-white focus:outline-none font-mono font-bold transition-colors"
                value={newAmount}
                onChange={(e) => setNewAmount(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label className={`text-[10px] font-black ${showBulkAddForm ? 'text-amber-100' : 'text-emerald-100'} uppercase font-mono tracking-wider`}>Sample Cost (₹)</label>
              <input
                type="number"
                className="w-full text-xs text-slate-800 bg-white/90 hover:bg-white px-3 py-2 border border-transparent rounded-lg focus:ring-2 focus:ring-white focus:outline-none font-mono font-bold transition-colors"
                value={newSampleCost}
                onChange={(e) => setNewSampleCost(e.target.value)}
              />
            </div>

            <div className="space-y-1 flex flex-col justify-end">
               <label className="text-[10px] font-black uppercase font-mono tracking-wider block mb-2 invisible">Needs Sample</label>
               <label className={`flex items-center gap-2 cursor-pointer bg-white/10 hover:bg-white/20 p-2 rounded-lg transition-colors border border-white/10 w-full h-[34px]`}>
                 <input 
                   type="checkbox" 
                   checked={newNeedsSample}
                   onChange={(e) => setNewNeedsSample(e.target.checked)}
                   className={`w-4 h-4 rounded ${showBulkAddForm ? 'text-amber-500 focus:ring-amber-500 bg-amber-900/50 border-amber-400/50' : 'text-emerald-500 focus:ring-emerald-500 bg-emerald-900/50 border-emerald-400/50'} cursor-pointer`}
                 />
                 <span className={`text-[11px] font-bold font-mono ${showBulkAddForm ? 'text-amber-50' : 'text-emerald-50'} tracking-wide uppercase`}>Needs Sample</span>
               </label>
            </div>

            <div className="space-y-1">
              <label className={`text-[10px] font-black ${showBulkAddForm ? 'text-amber-100' : 'text-emerald-100'} uppercase font-mono tracking-wider`}>Order ID</label>
              <input
                type="text"
                placeholder="Order ID"
                className="w-full text-xs text-slate-800 bg-white/90 hover:bg-white px-3 py-2 border border-transparent rounded-lg focus:ring-2 focus:ring-white focus:outline-none font-mono font-bold transition-colors placeholder:text-gray-400"
                value={newOrderId}
                onChange={(e) => setNewOrderId(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label className={`text-[10px] font-black ${showBulkAddForm ? 'text-amber-100' : 'text-emerald-100'} uppercase font-mono tracking-wider`}>Order Date</label>
              <input
                type="date"
                onClick={(e: any) => {
                  try {
                    if ('showPicker' in HTMLInputElement.prototype) {
                      (e.target as HTMLInputElement).showPicker();
                    }
                  } catch (err) {}
                }}
                className="w-full text-xs text-slate-800 bg-white/90 hover:bg-white px-3 py-2 border border-transparent rounded-lg focus:ring-2 focus:ring-white focus:outline-none font-mono font-bold transition-colors cursor-pointer"
                value={newOrderDate}
                onChange={(e) => setNewOrderDate(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label className={`text-[10px] font-black ${showBulkAddForm ? 'text-amber-100' : 'text-emerald-100'} uppercase font-mono tracking-wider`}>Order Platform</label>
              <div className="flex gap-1.5 pt-1">
                {(['PTG', 'AMAZON', 'FLIPKART', 'OTHER'] as const).map((p) => {
                  const isActive = newOrderPlatform === p;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setNewOrderPlatform(p)}
                      className={`flex-1 px-2 py-1.5 text-[9px] font-black uppercase rounded-lg transition-colors border cursor-pointer font-mono text-center tracking-wider ${
                        isActive
                          ? `bg-white ${showBulkAddForm ? 'text-amber-700' : 'text-emerald-700'} border-white shadow-md`
                          : `bg-white/10 ${showBulkAddForm ? 'text-amber-50' : 'text-emerald-50'} border-white/20 hover:bg-white/20`
                      }`}
                    >
                      {p}
                    </button>
                  );
                })}
              </div>
            </div>



            <div className="space-y-1">
              <label className={`text-[10px] font-black ${showBulkAddForm ? 'text-amber-100' : 'text-emerald-100'} uppercase font-mono tracking-wider`}>Media Right Amount (₹)</label>
              <input
                type="number"
                required
                className="w-full text-xs text-slate-800 bg-white/90 hover:bg-white px-3 py-2 border border-transparent rounded-lg focus:ring-2 focus:ring-white focus:outline-none font-mono font-bold transition-colors"
                value={newMediaRightAmount}
                onChange={(e) => setNewMediaRightAmount(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label className={`text-[10px] font-black ${showBulkAddForm ? 'text-amber-100' : 'text-emerald-100'} uppercase font-mono tracking-wider`}>Views</label>
              <input
                type="number"
                required
                className="w-full text-xs text-slate-800 bg-white/90 hover:bg-white px-3 py-2 border border-transparent rounded-lg focus:ring-2 focus:ring-white focus:outline-none font-mono font-bold transition-colors"
                value={newViews}
                onChange={(e) => setNewViews(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label className={`text-[10px] font-black ${showBulkAddForm ? 'text-amber-100' : 'text-emerald-100'} uppercase font-mono tracking-wider`}>Clicks</label>
              <input
                type="number"
                required
                className="w-full text-xs text-slate-800 bg-white/90 hover:bg-white px-3 py-2 border border-transparent rounded-lg focus:ring-2 focus:ring-white focus:outline-none font-mono font-bold transition-colors"
                value={newClicks}
                onChange={(e) => setNewClicks(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label className={`text-[10px] font-black ${showBulkAddForm ? 'text-amber-100' : 'text-emerald-100'} uppercase font-mono tracking-wider flex justify-between`}>
                <span>CTR (%)</span>
                <span className={`text-[9px] ${showBulkAddForm ? 'text-amber-200' : 'text-emerald-200'} font-sans tracking-normal lowercase italic font-normal`}>auto</span>
              </label>
              <input
                type="number"
                step="0.01"
                readOnly
                className="w-full text-xs text-white px-3 py-2 border border-white/20 rounded-lg focus:outline-none font-mono bg-white/10 cursor-not-allowed font-bold backdrop-blur-sm placeholder:text-white/50"
                placeholder="Auto"
                value={newCtr}
              />
            </div>

            <div className="space-y-1">
              <label className={`text-[10px] font-black ${showBulkAddForm ? 'text-amber-100' : 'text-emerald-100'} uppercase font-mono tracking-wider flex justify-between`}>
                <span>CPC (₹)</span>
                <span className={`text-[9px] ${showBulkAddForm ? 'text-amber-200' : 'text-emerald-200'} font-sans tracking-normal lowercase italic font-normal`}>auto</span>
              </label>
              <input
                type="number"
                step="0.01"
                readOnly
                className="w-full text-xs text-white px-3 py-2 border border-white/20 rounded-lg focus:outline-none font-mono bg-white/10 cursor-not-allowed font-bold backdrop-blur-sm placeholder:text-white/50"
                placeholder="Auto"
                value={newCpc}
              />
            </div>

            <div className="space-y-1">
              <label className={`text-[10px] font-black ${showBulkAddForm ? 'text-amber-100' : 'text-emerald-100'} uppercase font-mono tracking-wider flex justify-between`}>
                <span>CPV (₹)</span>
                <span className={`text-[9px] ${showBulkAddForm ? 'text-amber-200' : 'text-emerald-200'} font-sans tracking-normal lowercase italic font-normal`}>auto</span>
              </label>
              <input
                type="number"
                step="0.001"
                readOnly
                className="w-full text-xs text-white px-3 py-2 border border-white/20 rounded-lg focus:outline-none font-mono bg-white/10 cursor-not-allowed font-bold backdrop-blur-sm placeholder:text-white/50"
                placeholder="Auto"
                value={newCpv}
              />
            </div>


            
            <div className="space-y-1">
              <label className={`text-[10px] font-black ${showBulkAddForm ? 'text-amber-100' : 'text-emerald-100'} uppercase font-mono tracking-wider`}>Video Link 1</label>
              <input
                type="url"
                className="w-full text-xs text-slate-800 bg-white/90 hover:bg-white px-3 py-2 border border-transparent rounded-lg focus:ring-2 focus:ring-white focus:outline-none font-mono font-bold transition-colors placeholder:text-gray-400"
                placeholder="URL"
                value={newVideoLink1}
                onChange={(e) => setNewVideoLink1(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label className={`text-[10px] font-black ${showBulkAddForm ? 'text-amber-100' : 'text-emerald-100'} uppercase font-mono tracking-wider`}>Video Link 2</label>
              <input
                type="url"
                className="w-full text-xs text-slate-800 bg-white/90 hover:bg-white px-3 py-2 border border-transparent rounded-lg focus:ring-2 focus:ring-white focus:outline-none font-mono font-bold transition-colors placeholder:text-gray-400"
                placeholder="URL"
                value={newVideoLink2}
                onChange={(e) => setNewVideoLink2(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label className={`text-[10px] font-black ${showBulkAddForm ? 'text-amber-100' : 'text-emerald-100'} uppercase font-mono tracking-wider`}>Video Link 3</label>
              <input
                type="url"
                className="w-full text-xs text-slate-800 bg-white/90 hover:bg-white px-3 py-2 border border-transparent rounded-lg focus:ring-2 focus:ring-white focus:outline-none font-mono font-bold transition-colors placeholder:text-gray-400"
                placeholder="URL"
                value={newVideoLink3}
                onChange={(e) => setNewVideoLink3(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label className={`text-[10px] font-black ${showBulkAddForm ? 'text-amber-200' : 'text-indigo-200'} uppercase font-mono tracking-wider`}>Short.io Link</label>
              <ShortIoInput
                type="url"
                className="w-full text-xs text-indigo-900 bg-indigo-50 hover:bg-white px-3 py-2 border border-transparent rounded-lg focus:ring-2 focus:ring-indigo-300 focus:outline-none font-mono font-bold transition-colors placeholder:text-indigo-300"
                placeholder="URL"
                value={newShortIoLink}
                onChange={(val: string) => setNewShortIoLink(val)}
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2 relative z-10">
            <button
              type="button"
              onClick={() => { setShowAddForm(false); setShowBulkAddForm(false); }}
              className="bg-white/10 hover:bg-white/20 text-white border border-white/20 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-colors backdrop-blur-sm cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`bg-white ${showBulkAddForm ? 'text-amber-600 hover:bg-amber-50' : 'text-emerald-600 hover:bg-emerald-50'} px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-colors shadow-[0_0_20px_rgba(255,255,255,0.4)] cursor-pointer`}
            >
              {showBulkAddForm ? `Bulk Schedule (${bulkInfluencerIds.length})` : 'Add Video Plan'}
            </button>
          </div>
        </form>
      )}

      {/* Hidden tasks warning */}
      {hiddenStats.total > 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-xl mb-6 shadow-sm flex items-start gap-3 animate-fade-in mx-2 md:mx-0">
          <TriangleAlert className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-bold mb-1">Some tasks are hidden from view ({hiddenStats.total} total)</p>
            <ul className="list-disc pl-5 space-y-0.5 text-xs text-amber-700">
              {hiddenStats.search > 0 && <li>{hiddenStats.search} tasks hidden by search query "{searchTerm}"</li>}
              {hiddenStats.date > 0 && <li>{hiddenStats.date} tasks hidden by date filter (Month: {monthFilter || 'All'}, Year: {yearFilter}, Week: {weekFilter || 'All'})</li>}
              {hiddenStats.completion > 0 && <li>{hiddenStats.completion} tasks hidden by completion filter ({completionFilter})</li>}
            </ul>
          </div>
        </div>
      )}

      {/* Operational Stats Widget Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-gradient-to-br from-sky-400 to-sky-600 p-5 rounded-2xl shadow-lg flex items-center gap-4 hover:shadow-xl hover:-translate-y-1 transition-all animate-fade-in text-white" id="planner-stat-videos">
          <div className="p-3.5 bg-white/20 text-white rounded-xl shadow-inner backdrop-blur-md">
            <CalendarIcon className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] font-black text-sky-100 uppercase tracking-widest font-mono">Total Planned</p>
            <p className="text-xl font-black text-white tracking-tight mt-0.5 drop-shadow-md">{filteredTasks.length}</p>
            <span className="text-[9px] text-sky-50 font-medium font-mono uppercase">Videos mapped</span>
          </div>
        </div>

        <div className="bg-gradient-to-br from-emerald-400 to-emerald-600 p-5 rounded-2xl shadow-lg flex items-center gap-4 hover:shadow-xl hover:-translate-y-1 transition-all animate-fade-in text-white" id="planner-stat-release">
          <div className="p-3.5 bg-white/20 text-white rounded-xl shadow-inner backdrop-blur-md">
            <CheckCircle className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] font-black text-emerald-100 uppercase tracking-widest font-mono">Actual Posted</p>
            <p className="text-xl font-black text-white tracking-tight mt-0.5 drop-shadow-md">{totalPostedCount} / {filteredTasks.length}</p>
            <span className="text-[9px] text-emerald-50 font-bold font-mono">
              {filteredTasks.length > 0 ? Math.round((totalPostedCount / filteredTasks.length) * 100) : 0}% ACTUAL RATE
            </span>
          </div>
        </div>

        <div className="bg-gradient-to-br from-amber-400 to-amber-600 p-5 rounded-2xl shadow-lg flex items-center gap-4 hover:shadow-xl hover:-translate-y-1 transition-all animate-fade-in text-white" id="planner-stat-budget">
          <div className="p-3.5 bg-white/20 text-white rounded-xl shadow-inner backdrop-blur-md">
            <DollarSign className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] font-black text-amber-100 uppercase tracking-widest font-mono">Budget Allocated</p>
            <p className="text-xl font-black text-white tracking-tight mt-0.5 drop-shadow-md">₹{totalPlannedCost.toLocaleString()}</p>
            <span className="text-[9px] text-amber-50 font-medium font-mono uppercase">Filtered Spend</span>
          </div>
        </div>

        <div className="bg-gradient-to-br from-indigo-400 to-indigo-600 p-5 rounded-2xl shadow-lg flex items-center gap-4 hover:shadow-xl hover:-translate-y-1 transition-all animate-fade-in text-white" id="planner-stat-samplecost">
          <div className="p-3.5 bg-white/20 text-white rounded-xl shadow-inner backdrop-blur-md">
            <Package className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] font-black text-indigo-100 uppercase tracking-widest font-mono">Sample Cost</p>
            <p className="text-xl font-black text-white tracking-tight mt-0.5 drop-shadow-md">₹{totalBaseSampleCost.toLocaleString()}</p>
            <span className="text-[9px] text-indigo-50 font-medium font-mono uppercase block">Filtered Costs</span>
          </div>
        </div>

        <div className="bg-gradient-to-br from-fuchsia-400 to-purple-600 p-5 rounded-2xl shadow-lg flex items-center gap-4 hover:shadow-xl hover:-translate-y-1 transition-all animate-fade-in text-white" id="planner-stat-mediaright">
          <div className="p-3.5 bg-white/20 text-white rounded-xl shadow-inner backdrop-blur-md">
            <Copyright className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] font-black text-fuchsia-100 uppercase tracking-widest font-mono">Media Rights</p>
            <p className="text-xl font-black text-white tracking-tight mt-0.5 drop-shadow-md">₹{totalMediaRightAmount.toLocaleString()}</p>
            <span className="text-[9px] text-fuchsia-50 font-medium font-mono uppercase">Filtered Cost</span>
          </div>
        </div>
      </div>



        {/* Row Delete Confirmation Pop-up */}
        {taskToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 max-w-sm w-full p-6 text-center">
              <h3 className="font-black text-rose-600 text-lg mb-2">Confirm Delete</h3>
              <p className="text-xs font-medium text-gray-600 mb-6">
                Are you sure you want to delete the plan <strong>{taskToDelete.dispId}</strong> for <strong>"{taskToDelete.title || 'untitled product'}"</strong>? This action cannot be undone.
              </p>
              <div className="flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setTaskToDelete(null)}
                  className="px-4 py-2 font-bold text-xs uppercase text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (onDeleteTask) {
                      onDeleteTask(taskToDelete.id);
                    }
                    setTaskToDelete(null);
                  }}
                  className="px-4 py-2 font-black text-xs uppercase tracking-wider text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-md transition cursor-pointer"
                >
                  Yes, Delete
                </button>
              </div>
            </div>
          </div>
        )}




      {/* Main Table Spreadsheet Panel */}
      <div className="bg-white rounded-xl border border-gray-150 shadow-xs overflow-hidden">
        
        {/* Table Toolbar */}
        <div className="p-4 bg-gray-50 border-b border-gray-150 flex flex-col sm:flex-row justify-between items-center gap-3">
          
          {/* Left search & completion status filters */}
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3 w-full lg:w-auto">
            <div className="relative w-full sm:w-72">
              <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-gray-400">
                <Search className="w-3.5 h-3.5" />
              </span>
              <input
                type="text"
                className="pl-8 pr-3 py-1.5 w-full bg-white border border-gray-250 rounded-lg text-xs placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-red-500"
                placeholder="Search ID, creator, or product..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {searchTerm.length > 0 && (
                <div className="absolute top-full left-0 mt-2 w-full z-50 bg-red-600 border border-red-700 text-white text-[10px] px-3 py-2 rounded-lg shadow-lg font-bold animate-pulse flex items-center justify-between">
                  <span className="flex items-center gap-1.5"><Search className="w-3.5 h-3.5" /> SEARCH ACTIVE: "{searchTerm}" - Clear to see all records</span>
                  <button onClick={() => setSearchTerm('')} className="text-red-100 hover:text-white ml-2 bg-red-700 hover:bg-red-800 p-1 rounded-full transition-colors" title="Clear search">
                    <XCircle className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Right filtration dropdowns */}
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
            <span className="text-[10px] font-bold text-gray-400 uppercase font-mono flex items-center gap-1">
              <Filter className="w-3 h-3" /> Filters:
            </span>
            <select
              className="text-xs bg-white border border-gray-250 rounded-lg px-2.5 py-1.5 font-mono text-gray-700 focus:outline-none focus:ring-1 focus:ring-red-500 font-semibold"
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              title="Select Month"
            >
              <option value="ALL">All Months</option>
              <option value="01">January</option>
              <option value="02">February</option>
              <option value="03">March</option>
              <option value="04">April</option>
              <option value="05">May</option>
              <option value="06">June</option>
              <option value="07">July</option>
              <option value="08">August</option>
              <option value="09">September</option>
              <option value="10">October</option>
              <option value="11">November</option>
              <option value="12">December</option>
            </select>

            <select
              className="text-xs bg-white border border-gray-250 rounded-lg px-2.5 py-1.5 font-mono text-gray-700 focus:outline-none focus:ring-1 focus:ring-red-500 font-semibold"
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
              title="Select Year"
            >
              <option value="ALL">All Years</option>
              <option value="2025">2025</option>
              <option value="2026">2026</option>
              <option value="2027">2027</option>
              <option value="2028">2028</option>
              <option value="2029">2029</option>
            </select>

            <select
              className="text-xs bg-white border border-gray-250 rounded-lg px-2.5 py-1.5 font-mono text-gray-700 focus:outline-none focus:ring-1 focus:ring-red-500 font-semibold"
              value={weekFilter}
              onChange={(e) => setWeekFilter(e.target.value)}
              title="Select Week"
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

            <span className="text-[10px] font-bold text-gray-400 uppercase font-mono flex items-center gap-1 sm:ml-1">
              <ArrowUpDown className="w-3 h-3" /> Sort:
            </span>
            <button
              type="button"
              onClick={() => {
                if (sortField === 'planned') {
                  setSortAsc(!sortAsc);
                } else {
                  setSortField('planned');
                  setSortAsc(true);
                }
              }}
              className={`inline-flex items-center gap-1 text-[10px] px-2.5 py-1.5 rounded-lg border font-mono tracking-wider font-extrabold uppercase transition cursor-pointer select-none ${
                sortField === 'planned'
                  ? 'bg-red-50 text-red-650 border-red-200'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
              }`}
              title="Sort items by Planned Video Release Date"
              id="sort-planned-date-btn"
            >
              <span>Planned Date {sortField === 'planned' ? (sortAsc ? '▲' : '▼') : '↕'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (sortField === 'actual') {
                  setSortAsc(!sortAsc);
                } else {
                  setSortField('actual');
                  setSortAsc(true);
                }
              }}
              className={`inline-flex items-center gap-1 text-[10px] px-2.5 py-1.5 rounded-lg border font-mono tracking-wider font-extrabold uppercase transition cursor-pointer select-none ${
                sortField === 'actual'
                  ? 'bg-red-50 text-red-650 border-red-200'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
              }`}
              title="Sort items by Actual Release Date"
              id="sort-actual-date-btn"
            >
              <span>Actual Date {sortField === 'actual' ? (sortAsc ? '▲' : '▼') : '↕'}</span>
            </button>

            {/* View Mode Toggle */}
            <div className="flex bg-gray-100 p-0.5 rounded-lg border border-gray-200">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`inline-flex items-center gap-1.5 px-3 py-1 text-[10px] font-extrabold uppercase rounded-md transition ${viewMode === 'table' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
                title="Master Table View"
              >
                <List className="w-3.5 h-3.5" />
                Table
              </button>
              <button
                type="button"
                onClick={() => setViewMode('product-board')}
                className={`inline-flex items-center gap-1.5 px-3 py-1 text-[10px] font-extrabold uppercase rounded-md transition ${viewMode === 'product-board' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
                title="Product Wise Video Schedule"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                Product Wise Video Schedule
              </button>
            </div>

            <button
              type="button"
              onClick={handleAutoCalculateAllMetrics}
              className="inline-flex items-center gap-1.5 text-[10px] text-white hover:bg-orange-600 bg-orange-500 font-extrabold uppercase transition border border-orange-600 px-3 py-1.5 rounded-lg shadow-xs cursor-pointer"
              title="Automatically calculate CTR, CPC, and CPV across all deliverables"
              id="auto-calc-metrics-btn"
            >
              <Calculator className="w-3.5 h-3.5" />
              <span>Auto-Calc Metrics</span>
            </button>

            <button
              type="button"
              onClick={() => setCompletionFilter('all')}
              className={`inline-flex items-center gap-1.5 text-[10px] ${completionFilter === 'all' ? 'text-white bg-indigo-600 hover:bg-indigo-700 border-indigo-700' : 'text-indigo-700 bg-indigo-50 border-indigo-200 hover:bg-indigo-100'} font-extrabold uppercase transition border px-3 py-1.5 rounded-lg shadow-xs cursor-pointer`}
              id="btn-completion-all"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>SHOW ALL</span>
            </button>

            <button
              type="button"
              onClick={() => setCompletionFilter('completed')}
              className={`inline-flex items-center gap-1.5 text-[10px] ${completionFilter === 'completed' ? 'text-white bg-emerald-600 hover:bg-emerald-700 border-emerald-700' : 'text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100'} font-extrabold uppercase transition border px-3 py-1.5 rounded-lg shadow-xs cursor-pointer`}
              id="btn-completion-completed"
            >
              <CheckCircle className="w-3.5 h-3.5" />
              <span>VIEW COMPLETED</span>
            </button>

            <button
              type="button"
              onClick={() => setCompletionFilter('uncompleted')}
              className={`inline-flex items-center gap-1.5 text-[10px] ${completionFilter === 'uncompleted' ? 'text-white bg-rose-600 hover:bg-rose-700 border-rose-700' : 'text-rose-700 bg-rose-50 border-rose-200 hover:bg-rose-100'} font-extrabold uppercase transition border px-3 py-1.5 rounded-lg shadow-xs cursor-pointer`}
              id="btn-completion-uncompleted"
            >
              <Clock className="w-3.5 h-3.5" />
              <span>VIEW UNCOMPLETED</span>
            </button>

            <button
              type="button"
              onClick={() => setCompletionFilter(completionFilter === 'reels' ? 'all' : 'reels')}
              className={`inline-flex items-center gap-1.5 text-[10px] ${completionFilter === 'reels' ? 'text-white bg-fuchsia-600 hover:bg-fuchsia-700 border-fuchsia-700' : 'text-fuchsia-700 bg-fuchsia-50 border-fuchsia-200 hover:bg-fuchsia-100'} font-extrabold uppercase transition border px-3 py-1.5 rounded-lg shadow-xs cursor-pointer`}
              id="btn-completion-reels"
              title="Filter to deliverables with Facebook Reels, YouTube Shorts, or Instagram Reels"
            >
              <Film className="w-3.5 h-3.5" />
              <span>🎬 REELS ONLY ({tasks.filter(hasReelLink).length})</span>
            </button>

            <button
              type="button"
              onClick={() => setShowAllReelsModal(true)}
              className="inline-flex items-center gap-1.5 text-[10px] text-white bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 font-extrabold uppercase transition border border-pink-700 px-3 py-1.5 rounded-lg shadow-xs cursor-pointer"
              title="Open All Reels Directory modal"
            >
              <Film className="w-3.5 h-3.5" />
              <span>ALL REELS DIRECTORY</span>
            </button>

            <button
              type="button"
              onClick={() => setShowHiddenTasks(!showHiddenTasks)}
              className={`inline-flex items-center gap-1.5 text-[10px] ${showHiddenTasks ? 'text-white bg-fuchsia-600 hover:bg-fuchsia-700 border-fuchsia-700' : 'text-fuchsia-700 bg-fuchsia-50 border-fuchsia-200 hover:bg-fuchsia-100'} font-extrabold uppercase transition border px-3 py-1.5 rounded-lg shadow-xs cursor-pointer`}
              title="Show all tasks, overriding current date and completion filters"
            >
              {showHiddenTasks ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              <span>{showHiddenTasks ? 'HIDE OUT-OF-SCOPE' : 'VIEW ALL/HIDDEN TASKS'}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowSecondaryInfluencer(!showSecondaryInfluencer)}
              className={`inline-flex items-center gap-1.5 text-[10px] ${showSecondaryInfluencer ? 'text-white bg-teal-600 hover:bg-teal-700 border-teal-700' : 'text-teal-700 bg-teal-50 border-teal-200 hover:bg-teal-100'} font-extrabold uppercase transition border px-3 py-1.5 rounded-lg shadow-xs cursor-pointer`}
              title="Show/Hide Secondary Influencer Column"
            >
              {showSecondaryInfluencer ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              <span>{showSecondaryInfluencer ? 'HIDE SEC. INFLUENCER' : 'SHOW SEC. INFLUENCER'}</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadExcel}
              className="inline-flex items-center gap-1.5 text-[10px] text-white hover:bg-green-700 bg-green-600 font-extrabold uppercase transition border border-green-700 px-3 py-1.5 rounded-lg shadow-xs cursor-pointer"
              title="Download Microsoft Excel workbook"
              id="download-excel-btn"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Excel</span>
            </button>

            <button
              type="button"
              onClick={handleExtractToGoogleSheets}
              disabled={isExtractingSheets}
              className="inline-flex items-center gap-1.5 text-[10px] text-white hover:bg-blue-700 bg-blue-600 font-extrabold uppercase transition border border-blue-700 px-3 py-1.5 rounded-lg shadow-xs cursor-pointer disabled:opacity-50"
              title="Extract data to Google Sheets via Cloud Integration"
              id="extract-google-sheets-btn"
            >
              <Cloud className="w-3.5 h-3.5" />
              <span>{isExtractingSheets ? 'Extracting...' : 'Extract to Google Sheets'}</span>
            </button>

            <button
              onClick={() => {
                setSearchTerm('');
                setMonthFilter('ALL');
                setYearFilter('ALL');
                setSortField(null);
                setSortAsc(true);
                setCompletionFilter('all');
              }}
              className="text-[10px] text-gray-400 hover:text-red-650 font-bold uppercase transition bg-white border border-gray-200 hover:border-gray-300 px-2.5 py-1.5 rounded-lg cursor-pointer"
            >
              Reset
            </button>
          </div>
        </div>

        {/* Google Sheets extraction alert message */}
        {extractionMessage && (
          <div className={`p-4 mx-4 mt-2 rounded-lg border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 ${
            extractionMessage.type === 'success' 
              ? 'bg-emerald-50 border-emerald-250 text-emerald-800' 
              : 'bg-red-50 border-red-200 text-red-800'
          }`}>
            <div className="flex items-center gap-2">
              <span className="text-lg">{extractionMessage.type === 'success' ? '✅' : '❌'}</span>
              <div>
                <p className="text-xs font-bold leading-normal">{extractionMessage.text}</p>
                {extractionMessage.type === 'success' && (
                  <p className="text-[10px] text-emerald-600 font-medium">Your planner data has been saved as a spreadsheet in your Google Drive.</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {extractionMessage.url && (
                <a
                  href={extractionMessage.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase px-3 py-2 rounded shadow-xs transition"
                >
                  <span>Open Spreadsheet</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
              <button
                onClick={() => setExtractionMessage(null)}
                className="text-[10px] font-black uppercase text-gray-400 hover:text-gray-600 px-2 py-1"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Master Table view or Product Board view */}
        {viewMode === 'table' ? (
        <div className="overflow-auto relative max-h-[65vh] border border-gray-150 rounded-lg shadow-inner bg-white custom-scrollbar select-none">
          <table className="min-w-full border-separate border-spacing-0 divide-y divide-gray-150 relative">
            <thead className="bg-gray-50/50">
              <tr className="bg-gradient-to-r from-sky-600 to-indigo-600">
                <th scope="col" className="sticky top-0 left-0 bg-sky-700 border-b border-sky-800 px-4 py-3 text-left text-[10px] font-extrabold font-mono text-sky-50 uppercase tracking-widest z-40 w-[60px] min-w-[60px] max-w-[60px] select-none shadow-[inset_0_-1px_0_rgba(7,89,133,1)]">
                  S. No.
                </th>
                <th scope="col" className="sticky top-0 left-[60px] bg-sky-700 border-b border-sky-800 px-4 py-3 text-left text-[10px] font-extrabold font-mono text-sky-50 uppercase tracking-widest z-40 w-[160px] min-w-[160px] max-w-[160px] select-none shadow-[inset_0_-1px_0_rgba(7,89,133,1)]">
                  Video Id
                </th>
                <th scope="col" className="sticky top-0 left-[220px] bg-sky-700 border-r border-b border-sky-800 px-4 py-3 text-left text-[10px] font-extrabold font-mono text-sky-50 uppercase tracking-widest z-40 w-[230px] min-w-[230px] max-w-[230px] select-none shadow-[inset_0_-1px_0_rgba(7,89,133,1),4px_0_8px_-4px_rgba(0,0,0,0.2)]">
                  Influencer name
                </th>
                <th scope="col" className="sticky top-0 bg-sky-600/95 backdrop-blur-sm border-b border-sky-700 px-5 py-3 text-left text-[10px] font-bold font-mono text-blue-50 uppercase tracking-widest z-30 min-w-[240px] shadow-[inset_0_-1px_0_rgba(3,105,161,1)]">
                  Product / Campaign Item
                </th>
                <th scope="col" className="sticky top-0 bg-sky-600/95 backdrop-blur-sm border-b border-sky-700 px-5 py-3 text-left text-[10px] font-bold font-mono text-blue-50 uppercase tracking-widest z-30 shadow-[inset_0_-1px_0_rgba(3,105,161,1)]">
                  Planed video release date
                </th>
                <th scope="col" className="sticky top-0 bg-sky-600/95 backdrop-blur-sm border-b border-sky-700 px-5 py-3 text-left text-[10px] font-bold font-mono text-blue-50 uppercase tracking-widest z-30 shadow-[inset_0_-1px_0_rgba(3,105,161,1)]">
                  Actual date
                </th>
                {showSecondaryInfluencer && (
                <th scope="col" className="sticky top-0 bg-sky-600/95 backdrop-blur-sm border-b border-sky-700 px-5 py-3 text-left text-[10px] font-bold font-mono text-teal-100 uppercase tracking-widest z-30 min-w-[180px] shadow-[inset_0_-1px_0_rgba(3,105,161,1)]">
                  Sec. Influencer
                </th>
              )}
              <th scope="col" className="sticky top-0 bg-sky-600/95 backdrop-blur-sm border-b border-sky-700 px-5 py-3 text-left text-[10px] font-bold font-mono text-blue-50 uppercase tracking-widest z-30 min-w-[140px] shadow-[inset_0_-1px_0_rgba(3,105,161,1)]">
                  Video Link 1
                </th>
                <th scope="col" className="sticky top-0 bg-sky-600/95 backdrop-blur-sm border-b border-sky-700 px-5 py-3 text-left text-[10px] font-bold font-mono text-blue-50 uppercase tracking-widest z-30 min-w-[140px] shadow-[inset_0_-1px_0_rgba(3,105,161,1)]">
                  Video Link 2
                </th>
                <th scope="col" className="sticky top-0 bg-sky-600/95 backdrop-blur-sm border-b border-sky-700 px-5 py-3 text-left text-[10px] font-bold font-mono text-blue-50 uppercase tracking-widest z-30 min-w-[140px] shadow-[inset_0_-1px_0_rgba(3,105,161,1)]">
                  Video Link 3
                </th>
                <th scope="col" className="sticky top-0 bg-sky-600/95 backdrop-blur-sm border-b border-sky-700 px-5 py-3 text-left text-[10px] font-bold font-mono text-blue-50 uppercase tracking-widest z-30 min-w-[140px] shadow-[inset_0_-1px_0_rgba(3,105,161,1)]">
                  <div className="flex items-center justify-between gap-1.5">
                    <span>Short.io Link</span>
                    <button
                      type="button"
                      onClick={() => {
                        const links = filteredTasks
                          .map(t => String(t.shortIoLink || '').trim())
                          .filter(l => Boolean(l));
                        if (links.length === 0) {
                          globalToast.info('No Short.io links found in the current view.');
                          return;
                        }
                        navigator.clipboard.writeText(links.join('\n'));
                        globalToast.success(`Copied ${links.length} Short.io links to clipboard!`);
                      }}
                      className="px-1.5 py-0.5 rounded text-[9px] bg-white/20 hover:bg-white/30 text-white font-mono lowercase flex items-center gap-1 transition cursor-pointer"
                      title="Copy all available Short.io links in current view"
                    >
                      <Copy className="w-2.5 h-2.5" />
                      <span>copy all</span>
                    </button>
                  </div>
                </th>
                <th scope="col" className="sticky top-0 bg-sky-600/95 backdrop-blur-sm border-b border-sky-700 px-5 py-3 text-right text-[10px] font-bold font-mono text-blue-50 uppercase tracking-widest z-30 pr-7 shadow-[inset_0_-1px_0_rgba(3,105,161,1)]">
                  Amount
                </th>
                <th scope="col" className="sticky top-0 bg-sky-600/95 backdrop-blur-sm border-b border-sky-700 px-5 py-3 text-right text-[10px] font-bold font-mono text-blue-50 uppercase tracking-widest z-30 pr-7 shadow-[inset_0_-1px_0_rgba(3,105,161,1)]">
                  Sample Cost
                </th>
                <th scope="col" className="sticky top-0 bg-sky-600/95 backdrop-blur-sm border-b border-sky-700 px-5 py-3 text-left text-[10px] font-bold font-mono text-blue-50 uppercase tracking-widest z-30 min-w-[140px] shadow-[inset_0_-1px_0_rgba(3,105,161,1)]">
                  Order ID
                </th>
                <th scope="col" className="sticky top-0 bg-indigo-600/95 backdrop-blur-sm border-b border-indigo-700 px-5 py-3 text-left text-[10px] font-bold font-mono text-indigo-50 uppercase tracking-widest z-30 min-w-[145px] shadow-[inset_0_-1px_0_rgba(67,56,202,1)]">
                  Order Date
                </th>
                <th scope="col" className="sticky top-0 bg-indigo-600/95 backdrop-blur-sm border-b border-indigo-700 px-5 py-3 text-left text-[10px] font-bold font-mono text-indigo-50 uppercase tracking-widest z-30 min-w-[190px] shadow-[inset_0_-1px_0_rgba(67,56,202,1)]">
                  Order Platform
                </th>
                <th scope="col" className="sticky top-0 bg-sky-600/95 backdrop-blur-sm border-b border-sky-700 px-5 py-3 text-left text-[10px] font-bold font-mono text-blue-50 uppercase tracking-widest z-30 min-w-[140px] shadow-[inset_0_-1px_0_rgba(3,105,161,1)]">
                  Video Platform
                </th>
                <th scope="col" className="sticky top-0 bg-purple-600/95 backdrop-blur-sm border-b border-purple-700 px-5 py-3 text-right text-[10px] font-bold font-mono text-purple-50 uppercase tracking-widest z-30 pr-7 shadow-[inset_0_-1px_0_rgba(147,51,234,1)]">
                  Media Right
                </th>
                <th scope="col" className="sticky top-0 bg-purple-600/95 backdrop-blur-sm border-b border-purple-700 px-5 py-3 text-right text-[10px] font-bold font-mono text-purple-50 uppercase tracking-widest z-30 pr-7 shadow-[inset_0_-1px_0_rgba(147,51,234,1)]">
                  Views
                </th>
                <th scope="col" className="sticky top-0 bg-purple-600/95 backdrop-blur-sm border-b border-purple-700 px-5 py-3 text-right text-[10px] font-bold font-mono text-purple-50 uppercase tracking-widest z-30 pr-7 shadow-[inset_0_-1px_0_rgba(147,51,234,1)]">
                  Clicks
                </th>
                <th scope="col" className="sticky top-0 bg-fuchsia-600/95 backdrop-blur-sm border-b border-fuchsia-700 px-5 py-3 text-right text-[10px] font-bold font-mono text-fuchsia-50 uppercase tracking-widest z-30 pr-7 shadow-[inset_0_-1px_0_rgba(192,38,211,1)]">
                  CTR (%)
                </th>
                <th scope="col" className="sticky top-0 bg-fuchsia-600/95 backdrop-blur-sm border-b border-fuchsia-700 px-5 py-3 text-right text-[10px] font-bold font-mono text-fuchsia-50 uppercase tracking-widest z-30 pr-7 shadow-[inset_0_-1px_0_rgba(192,38,211,1)]">
                  CPC (₹)
                </th>
                <th scope="col" className="sticky top-0 bg-fuchsia-600/95 backdrop-blur-sm border-b border-fuchsia-700 px-5 py-3 text-right text-[10px] font-bold font-mono text-fuchsia-50 uppercase tracking-widest z-30 pr-7 shadow-[inset_0_-1px_0_rgba(192,38,211,1)]">
                  CPV (₹)
                </th>
                <th scope="col" className="sticky top-0 bg-indigo-600/95 backdrop-blur-sm border-b border-indigo-700 px-4 py-3 text-center text-[10px] font-bold font-mono text-indigo-50 uppercase tracking-widest z-30 shadow-[inset_0_-1px_0_rgba(79,70,229,1)]">
                  Theme
                </th>
                <th scope="col" className="sticky top-0 bg-rose-600/95 backdrop-blur-sm border-b border-rose-700 px-4 py-3 text-center text-[10px] font-bold font-mono text-rose-50 uppercase z-30 shadow-[inset_0_-1px_0_rgba(225,29,72,1)]">
                  Action
                </th>
              </tr>
            </thead>
            
            <tbody className="bg-white divide-y divide-gray-150 relative">
              {filteredTasks.length === 0 ? (
                <tr>
                  <td colSpan={15} className="px-5 py-12 text-center text-sm text-gray-450 bg-gray-50/30">
                    <CalendarIcon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="font-semibold text-gray-600">No scheduled video releases found for this filter.</p>
                    {tasks.length > 0 && (
                      <p className="text-xs text-red-500 font-bold mt-2">
                        Note: There are {tasks.length} total tasks in your database, but they are hidden by your current filters (Month: {monthFilter === 'ALL' ? 'All' : monthFilter}, Year: {yearFilter}, Week: {weekFilter}). Try setting the month to "All Months" to see them.
                      </p>
                    )}
                  </td>
                </tr>
              ) : filteredTasks.map((t, idx) => {
                const currInfluencer = influencers.find(i => i.id === t.influencerId);
                const dispId = getVideoDisplayId(t, idx);
                const infColor = getInfluencerColor(t.influencerId);
                const hasVideoLink = !!((typeof t.videoLink1 === 'string' ? t.videoLink1.trim() : '') || (typeof t.videoLink2 === 'string' ? t.videoLink2.trim() : '') || (typeof t.videoLink3 === 'string' ? t.videoLink3.trim() : ''));

                return (
                  <tr key={t.id} className={`${infColor.bg} ${infColor.hover} group/row transition duration-150 ${t.status === 'Cancelled' ? 'opacity-60 grayscale-[0.5]' : ''}`}>
                    
                    {/* SERIAL NO COLUMN */}
                    <td className={`sticky left-0 ${infColor.bg} ${infColor.stickyHover} border-b ${infColor.border} px-4 py-3 whitespace-nowrap text-xs font-mono font-bold ${infColor.text} z-10 w-[60px] min-w-[60px] max-w-[60px] transition-colors duration-150`}>
                      {idx + 1}
                    </td>

                    {/* VIDEO ID COLUMN */}
                    <td className={`sticky left-[60px] ${infColor.bg} ${infColor.stickyHover} border-b ${infColor.border} px-4 py-3 whitespace-nowrap z-10 w-[160px] min-w-[160px] max-w-[160px] transition-colors duration-150`}>
                      <div className="flex items-center gap-1 group/copy relative">
                        <DebouncedInput
                          type="text"
                          value={t.videoId !== undefined ? t.videoId : dispId}
                          onChange={(val: string) => {
                            const updates: Partial<Task> = { videoId: val };
                            onUpdateTask?.(t.id, updates);
                          }}
                          placeholder={dispId}
                          className="text-[13px] tracking-tight font-black font-mono px-2 py-1.5 rounded bg-white border border-gray-300 shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)] focus:border-red-500 focus:bg-white focus:ring-2 focus:ring-red-200 outline-none transition w-full text-gray-900"
                          title="Click to edit Video ID directly"
                          id={`v-id-input-${t.id}`}
                        />
                        <button
                          onClick={() => {
                            const valToCopy = t.videoId !== undefined ? t.videoId : dispId;
                            navigator.clipboard.writeText(valToCopy);
                            setCopiedVideoId(t.id);
                            setTimeout(() => setCopiedVideoId(null), 2000);
                          }}
                          className={`p-1 rounded transition-opacity ${infColor.text} hover:bg-white/50 shrink-0 opacity-70 hover:opacity-100`}
                          title="Copy Video ID"
                        >
                          {copiedVideoId === t.id ? <CheckCircle className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </td>

                    {/* INFLUENCER NAME COLUMN (CLICKABLE DROPDOWN SELECT) */}
                    <td className={`sticky left-[220px] ${infColor.bg} ${infColor.stickyHover} border-r border-b ${infColor.border} shadow-[4px_0_8px_-4px_rgba(0,0,0,0.12)] px-4 py-3 whitespace-nowrap z-10 w-[230px] min-w-[230px] max-w-[230px] transition-colors duration-150`}>
                      {editInfluencerId === t.id ? (
                        <div className="relative flex items-center gap-1 w-full min-w-[210px]">
                          <select
                            value={t.influencerId || ''}
                            onChange={(e) => {
                              const infId = e.target.value;
                              const inf = influencers.find(i => i.id === infId);
                              onUpdateTask?.(t.id, { 
                                influencerId: infId, 
                                ...(inf ? { secondaryInfluencerName: inf.name } : {})
                              });
                              setEditInfluencerId(null);
                            }}
                            className="w-full text-xs bg-white border border-indigo-300 rounded px-2 py-1 font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                          >
                            <option value="">-- Select Creator --</option>
                            {influencers
                              .filter(inf => inf.status !== 'Future Creator')
                              .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }))
                              .map(inf => (
                                <option key={inf.id} value={inf.id}>{inf.name}</option>
                              ))
                            }
                          </select>
                          <button 
                            onClick={(e: any) => { e.stopPropagation(); setEditInfluencerId(null); }}
                            className="bg-red-50 text-red-500 hover:bg-red-100 p-1.5 rounded-lg transition-colors cursor-pointer shrink-0"
                            title="Cancel"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div
                          onClick={() => setEditInfluencerId(t.id)}
                          className={`flex items-center gap-2.5 ${infColor.hover} p-1 rounded-md text-left transition w-full group/btn cursor-pointer`}
                          title="Click to select names from creator list"
                          id={`inf-select-btn-${t.id}`}
                        >
                          {currInfluencer ? (
                            <>
                              <img 
                                src={currInfluencer.avatar} 
                                className="w-6 h-6 rounded-full object-cover ring-1 ring-gray-100 shrink-0" 
                                alt={currInfluencer.name || "Unnamed Creator"} 
                                referrerPolicy="no-referrer"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 justify-between w-full min-w-0">
                                  <p className="text-xs font-extrabold text-gray-800 group-hover/btn:text-red-600 truncate leading-none min-w-0" style={{ maxWidth: "120px" }}>
                                    {currInfluencer.name || t.secondaryInfluencerName || "Unnamed Creator"}
                                  </p>
                                  {currInfluencer.costPerPost ? (
                                    <span className="shrink-0 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full whitespace-nowrap">₹{currInfluencer.costPerPost}</span>
                                  ) : null}
                                </div>
                                <div className="flex items-center gap-1 text-[9px] text-gray-400 font-mono truncate min-w-0" style={{ maxWidth: "120px" }}>
                                  <span className="truncate">{currInfluencer.handle}</span>
                                </div>
                              </div>
                            </>
                          ) : t.secondaryInfluencerName ? (
                            <div className="flex items-center justify-between w-full min-w-0 gap-2">
                              <span className="text-xs text-indigo-700 font-bold hover:underline flex items-center gap-1 truncate min-w-0" style={{ maxWidth: "160px" }}>
                                {t.secondaryInfluencerName}
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-red-600 font-bold hover:underline flex items-center gap-1">
                              <span>➕</span> Click to select creator
                            </span>
                          )}
                        </div>
                      )}
                    </td>

                    {/* PRODUCT COLUMN */}
                    <td className="px-5 py-3.5 min-w-[240px]">
                      {editProductId === t.id ? (
                        <div className="flex flex-col gap-1 w-full" id={`edit-prod-container-${t.id}`}>
                          <select
                            value={savedProducts.includes(t.title || '') ? (t.title || '') : 'custom'}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === 'custom') {
                                setIsCustomProduct(true);
                              } else {
                                onUpdateTask?.(t.id, { title: val });
                                setEditProductId(null);
                                setIsCustomProduct(false);
                              }
                            }}
                            className="w-full text-xs font-bold font-sans p-1.5 border border-red-300 rounded-md bg-white text-gray-800 focus:outline-none cursor-pointer"
                          >
                            <option value="">-- Click to Select Product --</option>
                            {savedProducts.filter(p => p !== 'CENTRAL_BUDGET').map((p, pIdx) => (
                              <option key={pIdx} value={p}>{p}</option>
                            ))}
                            <option value="custom">✍️ Type Custom Product...</option>
                          </select>
                          {(!savedProducts.includes(t.title || '') || isCustomProduct) && (
                            <div className="flex gap-1 items-center mt-1 font-sans">
                              <DebouncedInput
                                type="text"
                                value={t.title || ''}
                                onChange={(val: string) => onUpdateTask?.(t.id, { title: val })}
                                placeholder="Type custom product..."
                                className="flex-1 text-xs font-bold px-2 py-1 rounded border border-red-300 focus:border-red-500 outline-none bg-white text-gray-900 font-sans"
                                autoFocus
                                onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                                  if (e.key === 'Enter') {
                                    setEditProductId(null);
                                    setIsCustomProduct(false);
                                  }
                                }}
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  setEditProductId(null);
                                  setIsCustomProduct(false);
                                }}
                                className="bg-red-650 hover:bg-red-700 text-white font-bold text-[10px] px-2 py-1.5 rounded transition cursor-pointer shrink-0"
                                title="Confirm custom name"
                              >
                                ✓
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div
                          onClick={() => {
                            setEditProductId(t.id);
                            setIsCustomProduct(!savedProducts.includes(t.title || ''));
                          }}
                          className="flex items-center justify-between hover:bg-neutral-50 p-1 px-2 rounded-md text-left transition w-full group/prod cursor-pointer border border-transparent hover:border-gray-200/50"
                          title="Click to select or edit this product"
                          id={`prod-select-btn-${t.id}`}
                        >
                          <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            <Package className="w-3.5 h-3.5 text-red-550 shrink-0" />
                            <span className="text-xs font-bold text-gray-800 group-hover/prod:text-red-600 truncate">
                              {t.title || 'Click to select product'}
                            </span>
                            {t.status === 'Cancelled' && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded font-black font-mono uppercase bg-rose-100 text-rose-800 border border-rose-200 ml-1">
                                Cancelled
                              </span>
                            )}
                          </div>
                          <span className="text-[9px] text-gray-400 font-mono font-black uppercase tracking-wider ml-1 hover:underline opacity-0 group-hover/prod:opacity-100 transition-opacity whitespace-nowrap shrink-0">
                            Select ✎
                          </span>
                        </div>
                      )}
                    </td>

                    {/* PLANNED VIDEO RELEASE DATE COLUMN (CLICKABLE TO SELECT EXACT DATE) */}
                    <td className="px-5 py-3.5 whitespace-nowrap min-w-[170px] relative group/date">
                      {t.status === 'Completed' || !!t.releaseDate ? (
                        <div className="text-xs px-3 py-1.5 rounded-lg font-mono font-bold transition flex items-center gap-1.5 border bg-gray-50 border-gray-100 text-gray-500 cursor-not-allowed" title="Cannot edit planned date for completed videos">
                          <CalendarIcon className="w-3.5 h-3.5" />
                          <span>{t.deadline ? formatDateCustom(t.deadline) : 'No Date Set'}</span>
                        </div>
                      ) : (
                        <div className="relative">
                          <input
                            type="date"
                            value={t.deadline || ''}
                            onChange={(e) => {
                              onUpdateTask?.(t.id, { deadline: e.target.value });
                            }}
                            onClick={(e: any) => {
                              try {
                                if ('showPicker' in HTMLInputElement.prototype) {
                                  (e.target as HTMLInputElement).showPicker();
                                }
                              } catch (err) {}
                            }}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                            title="Select planned date"
                          />
                          <div className={`text-xs px-3 py-1.5 rounded-lg font-mono font-bold transition flex items-center justify-between gap-1.5 border ${
                              t.deadline 
                                ? 'bg-red-5/70 border-red-100 text-red-750 group-hover/date:border-red-300'
                                : 'bg-gray-100 border-gray-200 text-gray-400 group-hover/date:border-red-300 border-dashed'
                            }`}>
                            <div className="flex items-center gap-1.5">
                              <CalendarIcon className="w-3.5 h-3.5" />
                              <span>{t.deadline ? formatDateCustom(t.deadline) : 'Click to Add Date'}</span>
                            </div>
                          </div>
                          {t.deadline && (
                            <button
                              type="button"
                              onClick={(e: any) => {
                                e.preventDefault();
                                e.stopPropagation();
                                onUpdateTask?.(t.id, { deadline: '' });
                              }}
                              className="absolute right-1.5 top-1/2 -translate-y-1/2 z-20 text-red-300 hover:text-red-600 bg-white rounded-full transition-colors opacity-0 group-hover/date:opacity-100 shadow-sm"
                              title="Clear Planned Date"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </td>

                    {/* ACTUAL DATE COLUMN (CLICKABLE TO SELECT EXACT DATE) */}
                    <td className="px-5 py-3.5 whitespace-nowrap min-w-[170px] relative group/date-actual">
                      {!hasVideoLink ? (
                        <div className="text-xs px-3 py-1.5 rounded-lg font-mono font-bold transition flex items-center gap-1.5 border bg-gray-100 border-gray-100 text-gray-300 cursor-not-allowed opacity-60" title="Add a video link first to unlock">
                          <Clock className="w-3.5 h-3.5" />
                          <span>Locked</span>
                        </div>
                      ) : (
                        <div className="relative">
                          <input
                            type="date"
                            value={t.releaseDate || ''}
                            onChange={(e) => {
                              onUpdateTask?.(t.id, { 
                                releaseDate: e.target.value,
                                status: (e.target.value && !!((typeof t.videoLink1 === 'string' ? t.videoLink1.trim() : '') || (typeof t.videoLink2 === 'string' ? t.videoLink2.trim() : '') || (typeof t.videoLink3 === 'string' ? t.videoLink3.trim() : '') || (typeof t.shortIoLink === 'string' ? t.shortIoLink.trim() : ''))) ? 'Completed' : ((!e.target.value) && t.status === 'Completed' ? 'Pending' : t.status)
                              });
                            }}
                            onClick={(e: any) => {
                              try {
                                if ('showPicker' in HTMLInputElement.prototype) {
                                  (e.target as HTMLInputElement).showPicker();
                                }
                              } catch (err) {}
                            }}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                            title="Select actual date"
                          />
                          <div className={`text-xs px-3 py-1.5 rounded-lg font-mono transition flex items-center justify-between gap-1.5 border shadow-2xs ${
                              t.releaseDate 
                                ? 'bg-emerald-50 border-emerald-300 text-emerald-950 font-black group-hover/date-actual:border-emerald-400'
                                : 'bg-gray-50 border-gray-200 text-gray-400 font-bold group-hover/date-actual:border-green-300 border-dashed'
                            }`}>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Clock className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                              <strong className="font-black text-emerald-950 text-xs tracking-tight">{t.releaseDate ? formatDateCustom(t.releaseDate) : 'Click to Add Date'}</strong>
                              {t.uploadTime && (
                                <strong className="font-black text-[11px] text-fuchsia-950 bg-fuchsia-100 px-1.5 py-0.5 rounded border border-fuchsia-300 ml-1">
                                  {t.uploadTime}
                                </strong>
                              )}
                            </div>
                          </div>
                          {t.releaseDate && (
                            <button
                              type="button"
                              onClick={(e: any) => {
                                e.preventDefault();
                                e.stopPropagation();
                                onUpdateTask?.(t.id, { 
                                  releaseDate: '',
                                  status: 'Pending'
                                });
                              }}
                              className="absolute right-1.5 top-1/2 -translate-y-1/2 z-20 text-red-300 hover:text-red-600 bg-white rounded-full transition-colors opacity-0 group-hover/date-actual:opacity-100 shadow-sm"
                              title="Clear Actual Date"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </td>

                    {showSecondaryInfluencer && (
                      <td className="px-5 py-3.5 font-mono min-w-[180px]">
                        <div className="w-full text-xs text-gray-500 font-medium px-2 py-1 rounded border border-transparent bg-gray-50 truncate" title="Auto-copied from Influencer">{t.secondaryInfluencerName || "Auto-assigned"}</div>
                      </td>
                    )}
                    {/* VIDEO LINK 1 COLUMN */}
                    <td className="px-5 py-3.5 font-mono">
                      <div className="flex flex-col gap-1 min-w-[170px]">
                        <div className="flex items-center gap-1.5">
                          <DebouncedInput
                            type="url"
                            value={t.videoLink1 || ''}
                            onChange={(val: string) => {
                              const hasLink = !!(val.trim() || (typeof t.videoLink2 === 'string' ? t.videoLink2.trim() : '') || (typeof t.videoLink3 === 'string' ? t.videoLink3.trim() : '')); const hasDate = !!(typeof t.releaseDate === 'string' && t.releaseDate.trim()); const newStatus = (hasLink && hasDate) ? 'Completed' : 
                                                ((!hasLink) && t.status === 'Completed' ? 'Pending' : t.status);
                              
                              const detected = detectPlatform(val, t.videoLink2, t.videoLink3);
                              const platformUpdate = detected ? { platform: detected } : {};
                              
                              onUpdateTask?.(t.id, { videoLink1: val, status: newStatus as any, ...platformUpdate });
                            }}
                            placeholder="Link 1 URL"
                            className="flex-1 text-xs text-blue-600 font-medium px-2 py-1 rounded border border-transparent hover:border-gray-200 focus:border-red-500 focus:bg-white bg-transparent outline-none transition"
                            title="Click to edit Video Link 1"
                            id={`link1-input-${t.id}`}
                          />
                          {t.videoLink1 && String(t.videoLink1 || '').trim() && (
                            <a
                              href={String(t.videoLink1 || '').trim().startsWith('http') ? String(t.videoLink1 || '').trim() : `https://${String(t.videoLink1 || '').trim()}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1 hover:bg-blue-50 text-blue-500 hover:text-blue-700 rounded transition shrink-0"
                              title="Open Video Link 1 in new tab"
                              id={`link1-click-${t.id}`}
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>

                        {/* Reel indicator and view count */}
                        {t.videoLink1 && String(t.videoLink1).trim() && (() => {
                          const platform = detectReelPlatform(t.videoLink1);
                          const viewsVal = (t as any).videoLink1Views ?? t.views;
                          const isFetching = fetchingReelLinkUrls[t.videoLink1];
                          return (
                            <div className="flex items-center gap-1.5 text-[10px]">
                              {platform && (
                                <span className={`px-1.5 py-0.2 rounded font-bold uppercase shadow-2xs font-mono text-[9px] ${
                                  platform === 'Facebook Reel' ? 'bg-blue-600 text-white' :
                                  platform === 'YouTube Short' ? 'bg-red-600 text-white' :
                                  platform === 'Instagram Reel' ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white' :
                                  'bg-indigo-600 text-white'
                                }`}>
                                  🎬 {platform === 'Facebook Reel' ? 'FB Reel' : platform === 'YouTube Short' ? 'YT Short' : platform === 'Instagram Reel' ? 'IG Reel' : 'Reel'}
                                </span>
                              )}
                              <span className="font-mono text-sky-800 font-bold bg-sky-50 border border-sky-200 px-1.5 py-0.2 rounded flex items-center gap-1">
                                <Eye className="w-3 h-3 text-sky-600" />
                                {viewsVal !== undefined && viewsVal > 0 ? `${viewsVal.toLocaleString('en-IN')} views` : 'Pending fetch'}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleFetchReelViews(t.id, 'videoLink1', t.videoLink1!)}
                                disabled={isFetching}
                                className="p-0.5 hover:bg-sky-100 text-sky-600 rounded transition cursor-pointer"
                                title="Fetch / Refresh live views"
                              >
                                <RefreshCw className={`w-3 h-3 ${isFetching ? 'animate-spin' : ''}`} />
                              </button>
                            </div>
                          );
                        })()}
                      </div>
                    </td>

                    {/* VIDEO LINK 2 COLUMN */}
                    <td className="px-5 py-3.5 font-mono">
                      <div className="flex flex-col gap-1 min-w-[170px]">
                        <div className="flex items-center gap-1.5">
                          <DebouncedInput
                            type="url"
                            value={t.videoLink2 || ''}
                            onChange={(val: string) => {
                              const hasLink = !!((typeof t.videoLink1 === 'string' ? t.videoLink1.trim() : '') || val.trim() || (typeof t.videoLink3 === 'string' ? t.videoLink3.trim() : '')); const hasDate = !!(typeof t.releaseDate === 'string' && t.releaseDate.trim()); const newStatus = (hasLink && hasDate) ? 'Completed' : 
                                                ((!hasLink) && t.status === 'Completed' ? 'Pending' : t.status);
                              
                              const detected = detectPlatform(t.videoLink1, val, t.videoLink3);
                              const platformUpdate = detected ? { platform: detected } : {};
                              
                              onUpdateTask?.(t.id, { videoLink2: val, status: newStatus as any, ...platformUpdate });
                            }}
                            placeholder="Link 2 URL"
                            className="flex-1 text-xs text-blue-600 font-medium px-2 py-1 rounded border border-transparent hover:border-gray-200 focus:border-red-500 focus:bg-white bg-transparent outline-none transition"
                            title="Click to edit Video Link 2"
                            id={`link2-input-${t.id}`}
                          />
                          {t.videoLink2 && String(t.videoLink2 || '').trim() && (
                            <a
                              href={String(t.videoLink2 || '').trim().startsWith('http') ? String(t.videoLink2 || '').trim() : `https://${String(t.videoLink2 || '').trim()}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1 hover:bg-blue-50 text-blue-500 hover:text-blue-700 rounded transition shrink-0"
                              title="Open Video Link 2 in new tab"
                              id={`link2-click-${t.id}`}
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>

                        {/* Reel indicator and view count */}
                        {t.videoLink2 && String(t.videoLink2).trim() && (() => {
                          const platform = detectReelPlatform(t.videoLink2);
                          const viewsVal = (t as any).videoLink2Views ?? t.views;
                          const isFetching = fetchingReelLinkUrls[t.videoLink2];
                          return (
                            <div className="flex items-center gap-1.5 text-[10px]">
                              {platform && (
                                <span className={`px-1.5 py-0.2 rounded font-bold uppercase shadow-2xs font-mono text-[9px] ${
                                  platform === 'Facebook Reel' ? 'bg-blue-600 text-white' :
                                  platform === 'YouTube Short' ? 'bg-red-600 text-white' :
                                  platform === 'Instagram Reel' ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white' :
                                  'bg-indigo-600 text-white'
                                }`}>
                                  🎬 {platform === 'Facebook Reel' ? 'FB Reel' : platform === 'YouTube Short' ? 'YT Short' : platform === 'Instagram Reel' ? 'IG Reel' : 'Reel'}
                                </span>
                              )}
                              <span className="font-mono text-sky-800 font-bold bg-sky-50 border border-sky-200 px-1.5 py-0.2 rounded flex items-center gap-1">
                                <Eye className="w-3 h-3 text-sky-600" />
                                {viewsVal !== undefined && viewsVal > 0 ? `${viewsVal.toLocaleString('en-IN')} views` : 'Pending fetch'}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleFetchReelViews(t.id, 'videoLink2', t.videoLink2!)}
                                disabled={isFetching}
                                className="p-0.5 hover:bg-sky-100 text-sky-600 rounded transition cursor-pointer"
                                title="Fetch / Refresh live views"
                              >
                                <RefreshCw className={`w-3 h-3 ${isFetching ? 'animate-spin' : ''}`} />
                              </button>
                            </div>
                          );
                        })()}
                      </div>
                    </td>

                    {/* VIDEO LINK 3 COLUMN */}
                    <td className="px-5 py-3.5 font-mono">
                      <div className="flex flex-col gap-1 min-w-[170px]">
                        <div className="flex items-center gap-1.5">
                          <DebouncedInput
                            type="url"
                            value={t.videoLink3 || ''}
                            onChange={(val: string) => {
                              const hasLink = !!((typeof t.videoLink1 === 'string' ? t.videoLink1.trim() : '') || (typeof t.videoLink2 === 'string' ? t.videoLink2.trim() : '') || val.trim()); const hasDate = !!(typeof t.releaseDate === 'string' && t.releaseDate.trim()); const newStatus = (hasLink && hasDate) ? 'Completed' : 
                                                ((!hasLink) && t.status === 'Completed' ? 'Pending' : t.status);
                              
                              const detected = detectPlatform(t.videoLink1, t.videoLink2, val);
                              const platformUpdate = detected ? { platform: detected } : {};
                              
                              onUpdateTask?.(t.id, { videoLink3: val, status: newStatus as any, ...platformUpdate });
                            }}
                            placeholder="Link 3 URL"
                            className="flex-1 text-xs text-blue-600 font-medium px-2 py-1 rounded border border-transparent hover:border-gray-200 focus:border-red-500 focus:bg-white bg-transparent outline-none transition"
                            title="Click to edit Video Link 3"
                            id={`link3-input-${t.id}`}
                          />
                          {t.videoLink3 && String(t.videoLink3 || '').trim() && (
                            <a
                              href={String(t.videoLink3 || '').trim().startsWith('http') ? String(t.videoLink3 || '').trim() : `https://${String(t.videoLink3 || '').trim()}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1 hover:bg-blue-50 text-blue-500 hover:text-blue-700 rounded transition shrink-0"
                              title="Open Video Link 3 in new tab"
                              id={`link3-click-${t.id}`}
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>

                        {/* Reel indicator and view count */}
                        {t.videoLink3 && String(t.videoLink3).trim() && (() => {
                          const platform = detectReelPlatform(t.videoLink3);
                          const viewsVal = (t as any).videoLink3Views ?? t.views;
                          const isFetching = fetchingReelLinkUrls[t.videoLink3];
                          return (
                            <div className="flex items-center gap-1.5 text-[10px]">
                              {platform && (
                                <span className={`px-1.5 py-0.2 rounded font-bold uppercase shadow-2xs font-mono text-[9px] ${
                                  platform === 'Facebook Reel' ? 'bg-blue-600 text-white' :
                                  platform === 'YouTube Short' ? 'bg-red-600 text-white' :
                                  platform === 'Instagram Reel' ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white' :
                                  'bg-indigo-600 text-white'
                                }`}>
                                  🎬 {platform === 'Facebook Reel' ? 'FB Reel' : platform === 'YouTube Short' ? 'YT Short' : platform === 'Instagram Reel' ? 'IG Reel' : 'Reel'}
                                </span>
                              )}
                              <span className="font-mono text-sky-800 font-bold bg-sky-50 border border-sky-200 px-1.5 py-0.2 rounded flex items-center gap-1">
                                <Eye className="w-3 h-3 text-sky-600" />
                                {viewsVal !== undefined && viewsVal > 0 ? `${viewsVal.toLocaleString('en-IN')} views` : 'Pending fetch'}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleFetchReelViews(t.id, 'videoLink3', t.videoLink3!)}
                                disabled={isFetching}
                                className="p-0.5 hover:bg-sky-100 text-sky-600 rounded transition cursor-pointer"
                                title="Fetch / Refresh live views"
                              >
                                <RefreshCw className={`w-3 h-3 ${isFetching ? 'animate-spin' : ''}`} />
                              </button>
                            </div>
                          );
                        })()}
                      </div>
                    </td>

                    {/* SHORT.IO LINK COLUMN */}
                    <td className="px-5 py-3.5 font-mono">
                      <div className="flex items-center gap-1.5 min-w-[170px]">
                        <ShortIoInput
                          type="url"
                          value={t.shortIoLink || ''}
                          onChange={(val: string) => {
                            const updates: Partial<Task> = { shortIoLink: val };
                            onUpdateTask?.(t.id, updates);
                          }}
                          placeholder="Short.io URL"
                          className="flex-1 text-xs text-indigo-600 font-medium px-2 py-1 rounded border border-transparent hover:border-gray-200 focus:border-indigo-500 focus:bg-white bg-transparent outline-none transition"
                          title="Click to edit Short.io Link"
                          id={`shortio-link-input-${t.id}`}
                        />
                        {t.shortIoLink && String(t.shortIoLink || '').trim() && (
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                const linkStr = String(t.shortIoLink || '').trim();
                                navigator.clipboard.writeText(linkStr);
                                setCopiedShortIoTaskId(t.id);
                                setTimeout(() => setCopiedShortIoTaskId(null), 2000);
                                globalToast.success(`Copied Short.io link for ${t.influencerName || 'deliverable'}!`);
                              }}
                              className={`p-1.5 rounded-md transition cursor-pointer flex items-center justify-center border shadow-3xs ${
                                copiedShortIoTaskId === t.id
                                  ? 'bg-emerald-600 text-white border-emerald-600 ring-2 ring-emerald-300'
                                  : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-600 hover:text-indigo-800 border-indigo-200'
                              }`}
                              title={`Copy Short.io link: ${t.shortIoLink}`}
                              id={`shortio-link-copy-${t.id}`}
                            >
                              {copiedShortIoTaskId === t.id ? (
                                <CheckCircle className="w-3.5 h-3.5 text-white" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                            <a
                              href={String(t.shortIoLink || '').trim().startsWith('http') ? String(t.shortIoLink || '').trim() : `https://${String(t.shortIoLink || '').trim()}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1 hover:bg-indigo-50 text-indigo-500 hover:text-indigo-700 rounded transition shrink-0"
                              title="Open Short.io Link in new tab"
                              id={`shortio-link-click-${t.id}`}
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        )}
                      </div>
                    </td>

                    {/* AMOUNT COLUMN TABLE ROW */}
                    <td className="px-5 py-3.5 whitespace-nowrap text-right">
                      <div className="inline-flex items-center gap-1 rounded bg-transparent focus-within:bg-white border border-transparent focus-within:border-red-500 focus-within:ring-1 focus-within:ring-red-500 pl-2 transition">
                        <span className="text-gray-400 text-xs font-mono">₹</span>
                        <DebouncedInput
                          type="number"
                          value={t.remuneration === undefined || t.remuneration === null || t.remuneration === 0 ? '' : t.remuneration}
                          onChange={(val: string) => {
                            const valStr = val;
                            const remunerationValue = valStr === '' ? 0 : parseFloat(valStr) || 0;
                            const viewsValue = t.views !== undefined ? t.views : 0;
                            const clicksValue = t.clicks !== undefined ? t.clicks : 0;
                            const ctrValue = viewsValue > 0 ? parseFloat(((clicksValue / viewsValue) * 100).toFixed(2)) : 0;
                            const cpcValue = clicksValue > 0 ? parseFloat((remunerationValue / clicksValue).toFixed(2)) : 0;
                            const cpvValue = viewsValue > 0 ? parseFloat((remunerationValue / viewsValue).toFixed(3)) : 0;
                            onUpdateTask?.(t.id, { 
                              remuneration: remunerationValue,
                              ctr: ctrValue,
                              cpc: cpcValue,
                              cpv: cpvValue
                            });
                          }}
                          className="w-24 text-xs text-gray-808 font-mono text-right pr-2 py-1 outline-none bg-transparent"
                          title="Click to adjust campaign placement budget"
                          id={`amount-input-${t.id}`}
                        />
                      </div>
                    </td>

                    {/* SAMPLE COST COLUMN TABLE ROW */}
                    <td className="px-5 py-3.5 whitespace-nowrap text-right">
                      <div className="flex flex-col items-end gap-1">
                        <div className="inline-flex items-center gap-1 rounded bg-transparent focus-within:bg-white border border-transparent focus-within:border-red-500 focus-within:ring-1 focus-within:ring-red-500 pl-2 transition">
                          <span className="text-gray-400 text-[10px] font-mono">₹</span>
                          <DebouncedInput
                            type="number"
                            value={t.sampleCost === undefined || t.sampleCost === null || t.sampleCost === 0 ? '' : t.sampleCost}
                            onChange={(val: string) => {
                              const valStr = val;
                              const sampleCostValue = valStr === '' ? null : parseFloat(valStr);
                              onUpdateTask?.(t.id, { 
                                sampleCost: sampleCostValue
                              });
                            }}
                            className="w-20 text-xs text-gray-888 font-mono text-right pr-1 py-0.5 outline-none bg-transparent"
                            title="Click to adjust sample cost"
                            id={`samplecost-input-${t.id}`}
                          />
                        </div>
                      </div>
                    </td>

                    {/* ORDER ID COLUMN TABLE ROW */}
                    <td className="px-5 py-3.5 whitespace-nowrap text-left">
                      <div className="inline-flex items-center gap-1 rounded bg-transparent focus-within:bg-white border border-transparent focus-within:border-red-500 focus-within:ring-1 focus-within:ring-red-500 px-2 transition">
                        <DebouncedInput
                          type="text"
                          value={t.orderId || ''}
                          onChange={(val: string) => {
                            onUpdateTask?.(t.id, { 
                              orderId: val
                            });
                          }}
                          placeholder="Order ID"
                          className="w-28 text-xs text-gray-808 font-mono text-left py-1 outline-none bg-transparent"
                          title="Click to enter/edit Order ID"
                          id={`orderid-input-${t.id}`}
                        />
                      </div>
                    </td>

                    {/* ORDER DATE COLUMN TABLE ROW */}
                    <td className="px-5 py-3.5 whitespace-nowrap text-left">
                      <div className="inline-flex items-center gap-1 rounded bg-transparent focus-within:bg-white border border-transparent focus-within:border-red-500 focus-within:ring-1 focus-within:ring-red-500 px-2 transition">
                        <DebouncedInput
                          type="date"
                          onClick={(e: any) => {
                            try {
                              if ('showPicker' in HTMLInputElement.prototype) {
                                (e.target as HTMLInputElement).showPicker();
                              }
                            } catch (err) {}
                          }}
                          value={t.orderDate || ''}
                          onChange={(val: string) => {
                            onUpdateTask?.(t.id, { 
                              orderDate: val
                            });
                          }}
                          className="text-xs text-gray-808 font-mono text-left py-1 outline-none bg-transparent cursor-pointer"
                          title="Click to select Order Date"
                          id={`orderdate-input-${t.id}`}
                        />
                      </div>
                    </td>

                    {/* ORDER PLATFORM COLUMN TABLE ROW */}
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <div className="flex items-center gap-1 select-none">
                        {(['PTG', 'AMAZON', 'FLIPKART', 'OTHER'] as const).map((p) => {
                          const isActive = t.orderPlatform === p;
                          return (
                            <button
                              key={p}
                              type="button"
                              onClick={() => {
                                onUpdateTask?.(t.id, { orderPlatform: p });
                              }}
                              className={`px-2 py-1 text-[9px] font-extrabold uppercase rounded-md transition cursor-pointer font-mono shadow-xs border ${
                                isActive
                                  ? 'bg-red-600 text-white border-red-600'
                                  : 'bg-gray-50 text-gray-550 border-gray-200 hover:bg-gray-100'
                              }`}
                              title={`Set Order Platform to ${p}`}
                              id={`platform-btn-${t.id}-${p}`}
                            >
                              {p}
                            </button>
                          );
                        })}
                      </div>
                    </td>

                    {/* VIDEO PLATFORM COLUMN TABLE ROW */}
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <div className="flex items-center gap-1 select-none">
                        <select
                          value={t.platform || 'Unknown'}
                          onChange={(e) => onUpdateTask?.(t.id, { platform: e.target.value as Task['platform'] })}
                          className="bg-transparent text-xs font-mono font-medium text-gray-700 outline-none border border-gray-200 rounded px-2 py-1 focus:border-red-500 hover:border-gray-300 transition-colors"
                          id={`video-platform-select-${t.id}`}
                        >
                          <option value="Unknown">Unknown</option>
                          <option value="Instagram">Instagram</option>
                          <option value="YouTube">YouTube</option>
                          <option value="Facebook">Facebook</option>
                          <option value="TikTok">TikTok</option>
                          <option value="Twitter">Twitter</option>
                          <option value="Multi-Platform">Multi-Platform</option>
                        </select>
                      </div>
                    </td>

                    {/* MEDIA RIGHT COLUMN TABLE ROW */}
                    <td className="px-5 py-3.5 whitespace-nowrap text-right">
                      <div className="inline-flex items-center gap-1 rounded bg-transparent focus-within:bg-white border border-transparent focus-within:border-red-500 focus-within:ring-1 focus-within:ring-red-500 pl-2 transition">
                        <span className="text-gray-400 text-xs font-mono">₹</span>
                        <DebouncedInput
                          type="number"
                          value={t.mediaRightAmount || 0}
                          onChange={(val: string) => {
                            const mediaRightValue = parseFloat(val) || 0;
                            onUpdateTask?.(t.id, { 
                              mediaRightAmount: mediaRightValue
                            });
                          }}
                          className="w-24 text-xs text-gray-808 font-mono text-right pr-2 py-1 outline-none bg-transparent"
                          title="Click to adjust media right authorization budget"
                          id={`mediaright-input-${t.id}`}
                        />
                      </div>
                    </td>

                    {/* VIEWS COLUMN TABLE ROW */}
                    <td className="px-5 py-3.5 whitespace-nowrap text-right">
                      <div className="inline-flex items-center gap-1 rounded bg-transparent focus-within:bg-white border border-transparent focus-within:border-red-500 focus-within:ring-1 focus-within:ring-red-500 pl-2 transition">
                        <DebouncedInput
                          type="number"
                          value={t.views !== undefined ? t.views : 0}
                          onChange={(val: string) => {
                            const viewsValue = parseInt(val, 10) || 0;
                            const remunerationValue = t.remuneration || 0;
                            const clicksValue = t.clicks !== undefined ? t.clicks : 0;
                            const ctrValue = viewsValue > 0 ? parseFloat(((clicksValue / viewsValue) * 100).toFixed(2)) : 0;
                            const cpcValue = clicksValue > 0 ? parseFloat((remunerationValue / clicksValue).toFixed(2)) : 0;
                            const cpvValue = viewsValue > 0 ? parseFloat((remunerationValue / viewsValue).toFixed(3)) : 0;
                            onUpdateTask?.(t.id, { 
                              views: viewsValue,
                              ctr: ctrValue,
                              cpc: cpcValue,
                              cpv: cpvValue
                            });
                          }}
                          className="w-24 text-xs text-gray-808 font-mono text-right pr-2 py-1 outline-none bg-transparent"
                          title="Click to adjust views metric"
                          id={`views-input-${t.id}`}
                        />
                      </div>
                    </td>

                    {/* CLICKS COLUMN TABLE ROW */}
                    <td className="px-5 py-3.5 whitespace-nowrap text-right font-mono">
                      <div className="inline-flex items-center gap-1 rounded bg-transparent focus-within:bg-white border border-transparent focus-within:border-red-500 focus-within:ring-1 focus-within:ring-red-500 pl-2 transition">
                        <DebouncedInput
                          type="number"
                          value={t.clicks !== undefined ? t.clicks : 0}
                          onChange={(val: string) => {
                            const clicksValue = parseInt(val, 10) || 0;
                            const remunerationValue = t.remuneration || 0;
                            const viewsValue = t.views !== undefined ? t.views : 0;
                            const ctrValue = viewsValue > 0 ? parseFloat(((clicksValue / viewsValue) * 100).toFixed(2)) : 0;
                            const cpcValue = clicksValue > 0 ? parseFloat((remunerationValue / clicksValue).toFixed(2)) : 0;
                            const cpvValue = viewsValue > 0 ? parseFloat((remunerationValue / viewsValue).toFixed(3)) : 0;

                            // Update local storage to prevent effect override flicker
                            const stored = safeLocalStorage.getItem('SHORT_IO_TRACKED_LINKS');
                            if (stored) {
                               let trackedLinks = JSON.parse(stored);
                               let storageChanged = false;
                               const linkStr = t.shortIoLink ? String(t.shortIoLink || '').trim() : '';
                               const existingLinkIdx = trackedLinks.findIndex((l: any) => l.id === `planner-${t.id}` || (linkStr && l.url === linkStr));
                               if (existingLinkIdx !== -1) {
                                   trackedLinks[existingLinkIdx].manualClicksOverride = clicksValue;
                                   storageChanged = true;
                               }
                               if (storageChanged) {
                                   safeLocalStorage.setItem('SHORT_IO_TRACKED_LINKS', JSON.stringify(trackedLinks));
                                   window.dispatchEvent(new Event('shortio-links-updated'));
                               }
                            }

                            onUpdateTask?.(t.id, { 
                              clicks: clicksValue,
                              ctr: ctrValue,
                              cpc: cpcValue,
                              cpv: cpvValue
                            });
                          }}
                          className="w-24 text-xs text-gray-808 font-mono text-right pr-2 py-1 outline-none bg-transparent"
                          title="Click to adjust clicks metric"
                          id={`clicks-input-${t.id}`}
                        />
                      </div>
                    </td>

                    {/* CTR COLUMN TABLE ROW */}
                    <td className="px-5 py-3.5 whitespace-nowrap text-right font-mono">
                      <div className="inline-flex items-center gap-1 rounded bg-gray-50 border border-gray-200 pl-2 transition">
                        <input
                          type="number"
                          step="0.01"
                          value={t.views ? parseFloat(((t.clicks || 0) / t.views * 100).toFixed(2)) : 0}
                          readOnly
                          className="w-20 text-xs text-gray-500 font-mono text-right pr-1 py-1 outline-none bg-transparent cursor-not-allowed"
                          title="Calculated automatically from views and clicks"
                        />
                        <span className="text-gray-400 text-[10px] pr-1">%</span>
                      </div>
                    </td>

                    {/* CPC COLUMN TABLE ROW */}
                    <td className="px-5 py-3.5 whitespace-nowrap text-right font-mono">
                      <div className="inline-flex items-center gap-1 rounded bg-gray-50 border border-gray-200 pl-2 transition">
                        <span className="text-gray-400 text-[10px] pl-1">₹</span>
                        <input
                          type="number"
                          step="0.01"
                          value={t.clicks ? parseFloat((t.remuneration / t.clicks).toFixed(2)) : 0}
                          readOnly
                          className="w-20 text-xs text-gray-500 font-mono text-right pr-2 py-1 outline-none bg-transparent cursor-not-allowed"
                          title="Calculated automatically from amount and clicks"
                        />
                      </div>
                    </td>

                    {/* CPV COLUMN TABLE ROW */}
                    <td className="px-5 py-3.5 whitespace-nowrap text-right font-mono">
                      <div className="inline-flex items-center gap-1 rounded bg-gray-50 border border-gray-200 pl-2 transition">
                        <span className="text-gray-400 text-[10px] pl-1 font-mono">₹</span>
                        <input
                          type="number"
                          step="0.001"
                          value={t.views ? parseFloat((t.remuneration / t.views).toFixed(3)) : 0}
                          readOnly
                          className="w-20 text-xs text-gray-500 font-mono text-right pr-2 py-1 outline-none bg-transparent cursor-not-allowed"
                          title="Calculated automatically from amount and views"
                        />
                      </div>
                    </td>

                    <td className="px-3 py-3.5 whitespace-nowrap">
                      <input
                        type="text"
                        value={t.theme || ''}
                        onChange={(e) => onUpdateTask?.(t.id, { theme: e.target.value })}
                        placeholder="Theme"
                        className="w-28 text-xs font-semibold px-2 py-1 bg-white border border-gray-200 rounded text-gray-700 outline-none focus:ring-1 focus:ring-indigo-500 hover:border-indigo-300 transition"
                      />
                    </td>

                    {/* ROW ACTION DELETE & WHATSAPP & COMPLETE */}
                    <td className="px-4 py-3.5 whitespace-nowrap text-center text-sm font-medium">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const hasLink = !!((typeof t.videoLink1 === 'string' ? t.videoLink1.trim() : '') || (typeof t.videoLink2 === 'string' ? t.videoLink2.trim() : '') || (typeof t.videoLink3 === 'string' ? t.videoLink3.trim() : ''));
                            const hasDate = !!(typeof t.releaseDate === 'string' && t.releaseDate.trim());
                            const currentIsCompleted = (t.status === 'Completed' || hasLink) && hasLink && hasDate;
                            
                            if (!currentIsCompleted) {
                               if (!hasLink || !hasDate) {
                                  alert('Both a video link and Actual Date are mandatory to mark a task as completed.');
                                  return;
                               }
                            } else if (hasLink || hasDate) {
                               alert('You must remove the video links and actual date before marking this task as incomplete.');
                               return;
                            }
                            onUpdateTask?.(t.id, { status: currentIsCompleted ? 'In Progress' : 'Completed' });
                          }}
                          className={`${(((t.status === 'Completed' || !!((typeof t.videoLink1 === 'string' ? t.videoLink1.trim() : '') || (typeof t.videoLink2 === 'string' ? t.videoLink2.trim() : '') || (typeof t.videoLink3 === 'string' ? t.videoLink3.trim() : ''))) && !!((typeof t.videoLink1 === 'string' ? t.videoLink1.trim() : '') || (typeof t.videoLink2 === 'string' ? t.videoLink2.trim() : '') || (typeof t.videoLink3 === 'string' ? t.videoLink3.trim() : '')) && !!(typeof t.releaseDate === 'string' && t.releaseDate.trim()))) ? 'bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-700 hover:border-emerald-800' : 'bg-gray-50 hover:bg-gray-100 text-gray-400 border border-gray-200 hover:border-gray-300'} p-1.5 rounded-lg transition shadow-xs cursor-pointer inline-flex items-center justify-center`}
                          title={(((t.status === 'Completed' || !!((typeof t.videoLink1 === 'string' ? t.videoLink1.trim() : '') || (typeof t.videoLink2 === 'string' ? t.videoLink2.trim() : '') || (typeof t.videoLink3 === 'string' ? t.videoLink3.trim() : ''))) && !!((typeof t.videoLink1 === 'string' ? t.videoLink1.trim() : '') || (typeof t.videoLink2 === 'string' ? t.videoLink2.trim() : '') || (typeof t.videoLink3 === 'string' ? t.videoLink3.trim() : '')) && !!(typeof t.releaseDate === 'string' && t.releaseDate.trim()))) ? 'Mark as In Progress' : 'Mark as Completed manually'}
                        >
                          <CheckCircle className={`w-4 h-4 ${(((t.status === 'Completed' || !!((typeof t.videoLink1 === 'string' ? t.videoLink1.trim() : '') || (typeof t.videoLink2 === 'string' ? t.videoLink2.trim() : '') || (typeof t.videoLink3 === 'string' ? t.videoLink3.trim() : ''))) && !!((typeof t.videoLink1 === 'string' ? t.videoLink1.trim() : '') || (typeof t.videoLink2 === 'string' ? t.videoLink2.trim() : '') || (typeof t.videoLink3 === 'string' ? t.videoLink3.trim() : '')) && !!(typeof t.releaseDate === 'string' && t.releaseDate.trim()))) ? 'text-white' : ''}`} />
                        </button>
                        {currInfluencer && (
                          <button
                            type="button"
                            onClick={() => {
                              if (!currInfluencer.mobile) {
                                triggerUpdateWhatsAppModal({
                                  influencerId: currInfluencer.id,
                                  influencerName: currInfluencer.name || "Creator",
                                  influencerAvatar: currInfluencer.avatar,
                                  influencerHandle: currInfluencer.handle,
                                  currentMobile: currInfluencer.mobile || '',
                                  contextTitle: 'Campaign Brief & Updates',
                                  onSuccess: () => {
                                    setWhatsappTask(t);
                                  }
                                });
                              } else {
                                setWhatsappTask(t);
                              }
                            }}
                            className="bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-200 hover:border-emerald-300 p-1.5 rounded-lg transition shadow-xs cursor-pointer inline-flex items-center justify-center animate-fade-in"
                            title={`Send WhatsApp Message to ${currInfluencer.name || "Unnamed Creator"}`}
                            id={`wa-action-btn-${t.id}`}
                          >
                            <MessageCircle className="w-4 h-4 fill-emerald-50/50" />
                          </button>
                        )}
                        {onDeleteTask && (
                          <button
                            type="button"
                            onClick={() => setTaskToDelete({ id: t.id, title: t.title, dispId })}
                            className="text-gray-300 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 transition cursor-pointer inline-flex items-center justify-center"
                            title="Delete entry from Monthly Planner"
                            id={`delete-btn-${t.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>

                  </tr>
                );
              })}

              {filteredTasks.length > 0 && (
                <tr className="font-bold text-gray-850">
                  <td className="sticky bottom-0 left-0 bg-gray-100 border-t-2 border-b border-gray-200 px-4 py-3 whitespace-nowrap text-xs font-mono font-black text-gray-600 z-45 w-[60px] min-w-[60px] max-w-[60px] shadow-[inset_0_1px_0_#e5e7eb,0_-2px_4px_rgba(0,0,0,0.06)]">
                    Sum
                  </td>
                  <td className="sticky bottom-0 left-[60px] bg-gray-100 border-t-2 border-b border-gray-200 px-4 py-3 whitespace-nowrap text-xs text-gray-400 font-mono z-45 w-[160px] min-w-[160px] max-w-[160px] shadow-[inset_0_1px_0_#e5e7eb,0_-2px_4px_rgba(0,0,0,0.06)]">
                    -
                  </td>
                  <td className="sticky bottom-0 left-[220px] bg-gray-100 border-r border-t-2 border-b border-gray-200 shadow-[inset_0_1px_0_#e5e7eb,4px_0_8px_-4px_rgba(0,0,0,0.12),0_-2px_4px_rgba(0,0,0,0.06)] px-4 py-3 whitespace-nowrap text-xs text-gray-400 font-mono z-45 w-[230px] min-w-[230px] max-w-[230px]">
                    -
                  </td>
                  <td className="sticky bottom-0 bg-gray-50 border-t-2 border-b border-gray-200 px-5 py-3 whitespace-nowrap text-xs text-gray-400 z-30 shadow-[inset_0_1px_0_#e5e7eb,0_-2px_4px_rgba(0,0,0,0.06)]">
                    -
                  </td>
                  <td className="sticky bottom-0 bg-gray-50 border-t-2 border-b border-gray-200 px-5 py-3 whitespace-nowrap text-xs text-gray-400 font-mono border-r border-dashed border-gray-200 z-30 shadow-[inset_0_1px_0_#e5e7eb,0_-2px_4px_rgba(0,0,0,0.06)]">
                    -
                  </td>
                  <td className="sticky bottom-0 bg-gray-50 border-t-2 border-b border-gray-200 px-5 py-3 whitespace-nowrap text-xs text-gray-400 font-mono z-30 shadow-[inset_0_1px_0_#e5e7eb,0_-2px_4px_rgba(0,0,0,0.06)]">
                    -
                  </td>
                  <td className="sticky bottom-0 bg-gray-50 border-t-2 border-b border-gray-200 px-5 py-3 italic text-gray-400 text-xs font-mono z-30 shadow-[inset_0_1px_0_#e5e7eb,0_-2px_4px_rgba(0,0,0,0.06)]">-</td>
                  <td className="sticky bottom-0 bg-gray-50 border-t-2 border-b border-gray-200 px-5 py-3 italic text-gray-400 text-xs font-mono z-30 shadow-[inset_0_1px_0_#e5e7eb,0_-2px_4px_rgba(0,0,0,0.06)]">-</td>
                  <td className="sticky bottom-0 bg-gray-50 border-t-2 border-b border-gray-200 px-5 py-3 italic text-gray-400 text-xs font-mono z-30 shadow-[inset_0_1px_0_#e5e7eb,0_-2px_4px_rgba(0,0,0,0.06)]">-</td>
                  <td className="sticky bottom-0 bg-gray-50 border-t-2 border-b border-gray-200 px-5 py-3 italic text-gray-400 text-xs font-mono border-r border-dashed border-gray-200 z-30 shadow-[inset_0_1px_0_#e5e7eb,0_-2px_4px_rgba(0,0,0,0.06)]">-</td>
                  <td className="sticky bottom-0 bg-gray-50 border-t-2 border-b border-gray-200 px-5 py-3 whitespace-nowrap text-right text-xs font-mono font-extrabold text-red-750 pr-7 z-30 shadow-[inset_0_1px_0_#e5e7eb,0_-2px_4px_rgba(0,0,0,0.06)]">
                    ₹{totalPlannedCost.toLocaleString()}
                  </td>
                  <td className="sticky bottom-0 bg-gray-50 border-t-2 border-b border-gray-200 px-5 py-3 whitespace-nowrap text-right text-xs font-mono font-extrabold text-indigo-700 pr-7 z-30 shadow-[inset_0_1px_0_#e5e7eb,0_-2px_4px_rgba(0,0,0,0.06)]">
                    ₹{totalSampleCost.toLocaleString()}
                  </td>
                  <td className="sticky bottom-0 bg-gray-50 border-t-2 border-b border-gray-200 px-5 py-3 whitespace-nowrap text-[10px] text-gray-400 font-mono z-30 shadow-[inset_0_1px_0_#e5e7eb,0_-2px_4px_rgba(0,0,0,0.06)]">
                    -
                  </td>
                  <td className="sticky bottom-0 bg-gray-50 border-t-2 border-b border-gray-200 px-5 py-3 whitespace-nowrap text-[10px] text-gray-400 font-mono z-30 shadow-[inset_0_1px_0_#e5e7eb,0_-2px_4px_rgba(0,0,0,0.06)]">
                    -
                  </td>
                  <td className="sticky bottom-0 bg-gray-50 border-t-2 border-b border-gray-200 px-5 py-3 whitespace-nowrap text-[10px] text-gray-400 font-mono z-30 shadow-[inset_0_1px_0_#e5e7eb,0_-2px_4px_rgba(0,0,0,0.06)]">
                    -
                  </td>
                  <td className="sticky bottom-0 bg-gray-50 border-t-2 border-b border-gray-200 px-5 py-3 whitespace-nowrap text-[10px] text-gray-400 font-mono z-30 shadow-[inset_0_1px_0_#e5e7eb,0_-2px_4px_rgba(0,0,0,0.06)]">
                    -
                  </td>
                  <td className="sticky bottom-0 bg-gray-50 border-t-2 border-b border-gray-200 px-5 py-3 whitespace-nowrap text-right text-xs font-mono font-extrabold text-red-600 pr-7 z-30 shadow-[inset_0_1px_0_#e5e7eb,0_-2px_4px_rgba(0,0,0,0.06)]">
                    ₹{totalMediaRightAmount.toLocaleString()}
                  </td>
                  <td className="sticky bottom-0 bg-gray-50 border-t-2 border-b border-gray-200 px-5 py-3 whitespace-nowrap text-right text-xs font-mono font-extrabold text-gray-750 pr-7 z-30 shadow-[inset_0_1px_0_#e5e7eb,0_-2px_4px_rgba(0,0,0,0.06)]">
                    {activeFilteredTasks.reduce((sum, t) => sum + (t.views || 0), 0).toLocaleString()}
                  </td>
                  <td className="sticky bottom-0 bg-gray-50 border-t-2 border-b border-gray-200 px-5 py-3 whitespace-nowrap text-right text-xs font-mono font-extrabold text-gray-750 pr-7 border-r border-dashed border-gray-200 z-30 shadow-[inset_0_1px_0_#e5e7eb,0_-2px_4px_rgba(0,0,0,0.06)]">
                    {activeFilteredTasks.reduce((sum, t) => sum + (t.clicks || 0), 0).toLocaleString()}
                  </td>
                  <td className="sticky bottom-0 bg-gray-50 border-t-2 border-b border-gray-200 px-5 py-3 whitespace-nowrap text-right text-xs font-mono font-extrabold text-emerald-700 pr-7 z-30 shadow-[inset_0_1px_0_#e5e7eb,0_-2px_4px_rgba(0,0,0,0.06)]">
                    {(() => {
                      const totalV = activeFilteredTasks.reduce((sum, t) => sum + (t.views || 0), 0);
                      const totalC = activeFilteredTasks.reduce((sum, t) => sum + (t.clicks || 0), 0);
                      return totalV > 0 ? ((totalC / totalV) * 100).toFixed(2) : '0.00';
                    })()}%
                  </td>
                  <td className="sticky bottom-0 bg-gray-50 border-t-2 border-b border-gray-200 px-5 py-3 whitespace-nowrap text-right text-xs font-mono font-extrabold text-emerald-700 pr-7 z-30 shadow-[inset_0_1px_0_#e5e7eb,0_-2px_4px_rgba(0,0,0,0.06)]">
                    ₹{(() => {
                      const totalC = activeFilteredTasks.reduce((sum, t) => sum + (t.clicks || 0), 0);
                      return totalC > 0 ? (totalPlannedCost / totalC).toFixed(2) : '0.00';
                    })()}
                  </td>
                  <td className="sticky bottom-0 bg-gray-50 border-t-2 border-b border-gray-200 px-5 py-3 whitespace-nowrap text-right text-xs font-mono font-extrabold text-emerald-700 pr-7 z-30 shadow-[inset_0_1px_0_#e5e7eb,0_-2px_4px_rgba(0,0,0,0.06)]">
                    ₹{(() => {
                      const totalV = activeFilteredTasks.reduce((sum, t) => sum + (t.views || 0), 0);
                      return totalV > 0 ? (totalPlannedCost / totalV).toFixed(3) : '0.000';
                    })()}
                  </td>
                  <td className="sticky bottom-0 bg-gray-50 border-t-2 border-b border-gray-200 z-30 shadow-[inset_0_1px_0_#e5e7eb,0_-2px_4px_rgba(0,0,0,0.06)]"></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 max-h-[65vh] overflow-y-auto custom-scrollbar p-1">
            {filteredTasks.length === 0 ? (
              <div className="col-span-full py-12 text-center text-sm text-gray-450 bg-gray-50/30 rounded-lg">
                <CalendarIcon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="font-semibold text-gray-600">No scheduled video releases found for this filter.</p>
                {tasks.length > 0 && (
                  <p className="text-xs text-red-500 font-bold mt-2">
                    Note: There are {tasks.length} total tasks in your database, but they are hidden by your current filters (Month: {monthFilter === 'ALL' ? 'All' : monthFilter}, Year: {yearFilter}, Week: {weekFilter}). Try setting the month to "All Months" to see them.
                  </p>
                )}
                <p className="text-xs text-gray-400 mt-1">Try resetting dates, updating search filters, or click &ldquo;Fast Add Row&rdquo; to start afresh!</p>
              </div>
            ) : (
              Object.entries(
                filteredTasks.reduce((acc, t) => {
                  const p = t.title || 'Unassigned Product';
                  if (!acc[p]) acc[p] = [];
                  acc[p].push(t);
                  return acc;
                }, {} as Record<string, typeof filteredTasks>)
              ).map(([productName, tasks]) => {
                const activeTasksForProduct = (tasks as any[]).filter(t => t.status !== 'Cancelled');
                const totalAmount = activeTasksForProduct.reduce((sum, t) => sum + (t.remuneration || 0), 0);
                const isComplete = activeTasksForProduct.length > 0 && activeTasksForProduct.every((t: any) => { const hasLink = !!((typeof t.videoLink1 === 'string' ? t.videoLink1.trim() : '') || (typeof t.videoLink2 === 'string' ? t.videoLink2.trim() : '') || (typeof t.videoLink3 === 'string' ? t.videoLink3.trim() : '')); const hasDate = !!(typeof t.releaseDate === 'string' && t.releaseDate.trim()); return (t.status === 'Completed' || hasLink) && hasLink && hasDate; });

                return (
                  <div key={productName} className="bg-white border text-left border-indigo-100 rounded-2xl shadow-md overflow-hidden flex flex-col h-full hover:shadow-lg transition">
                    <div className="bg-gradient-to-r from-indigo-50 to-fuchsia-50 p-4 border-b border-indigo-100 flex items-start justify-between">
                      <div>
                        <h3 className="font-black text-indigo-950 text-sm tracking-tight flex items-center gap-1.5">
                          {productName}
                          {isComplete && <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />}
                        </h3>
                        <p className="text-[10px] font-mono text-fuchsia-700 font-bold mt-1.5">
                          {activeTasksForProduct.length} Active • {(tasks as any[]).length - activeTasksForProduct.length} Cancelled • ₹{totalAmount.toLocaleString()}
                        </p>
                      </div>
                      <div className="p-2 bg-white rounded-lg shadow-sm border border-indigo-50">
                        <Package className="w-4 h-4 text-indigo-500" />
                      </div>
                    </div>
                    
                    <div className="p-3 bg-gray-50/30 flex-1 overflow-y-auto space-y-2.5 max-h-[400px] custom-scrollbar">
                      {(tasks as any[]).map((t: any) => {
                        const inf = influencers.find(i => i.id === t.influencerId);
                        const hasLink = !!(t.videoLink1?.trim() || t.videoLink2?.trim() || t.videoLink3?.trim()); const hasDate = !!(t.releaseDate?.trim()); const isDone = Boolean((t.status === 'Completed' || hasLink) && hasLink && hasDate);
                        return (
                          <div key={t.id} className="bg-white border border-gray-150 p-3 rounded-xl shadow-sm text-xs">
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <img src={inf?.avatar || 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=240'} alt="avatar" className="w-6 h-6 rounded-full object-cover border border-gray-200" referrerPolicy="no-referrer" />
                                <div>
                                  <p className="font-bold text-gray-800 leading-none">{inf?.name || t.secondaryInfluencerName || 'Unassigned'}</p>
                                  <p className="text-[9px] text-gray-400 font-mono mt-0.5">{getVideoDisplayId(t, filteredTasks.indexOf(t))}</p>
                                </div>
                              </div>
                              {t.status === 'Cancelled' ? (
                                <span className="bg-rose-50 text-rose-700 border border-rose-200 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest flex items-center gap-0.5">
                                  <XCircle className="w-2.5 h-2.5" /> CANCEL
                                </span>
                              ) : isDone ? (
                                <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest flex items-center gap-0.5">
                                  <CheckCircle className="w-2.5 h-2.5" /> LIVE
                                </span>
                              ) : (
                                <span className="bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest flex items-center gap-0.5">
                                  <Clock className="w-2.5 h-2.5" /> Draft
                                </span>
                              )}
                            </div>
                            
                            <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-gray-50 text-[10px]">
                              <div>
                                <p className="text-gray-400 uppercase font-mono font-semibold text-[8px] mb-0.5">Release Date & Time</p>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <strong className="font-mono text-gray-950 font-black text-xs">{t.releaseDate ? formatDateCustom(t.releaseDate) : 'Not set'}</strong>
                                  {t.uploadTime && (
                                    <strong className="font-mono text-fuchsia-950 bg-fuchsia-100 px-1 py-0.5 rounded border border-fuchsia-300 font-black text-[10px]">
                                      {t.uploadTime}
                                    </strong>
                                  )}
                                </div>
                              </div>
                              <div>
                                <p className="text-gray-400 uppercase font-mono font-semibold text-[8px] mb-0.5">Fee</p>
                                <p className="font-mono text-emerald-600 font-bold text-right">₹{(t.remuneration || 0).toLocaleString()}</p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Small spreadsheet instructions footer */}
        <div className="bg-gray-50 p-3.5 border-t border-gray-150 flex items-center justify-between text-[11px] text-gray-550">
          <span className="font-medium flex items-center gap-1">
            <HelpCircle className="w-3.5 h-3.5 text-gray-400" />
            Tip: Use mouse cursor or swipe to scroll columns sideways. Creators, S. No., and Video IDs are frozen to stay anchored in view!
          </span>
          <span className="font-mono font-semibold text-gray-600">
            {filteredTasks.length} active planner entries display
          </span>
        </div>

      </div>

      {/* WHATSAPP messaging modal */}
      {whatsappTask && (() => {
        const waCreator = influencers.find(i => i.id === whatsappTask.influencerId);
        const originalMobile = waCreator?.mobile || '';
        const hasPhoneChanged = whatsappPhone !== originalMobile;

        return (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
            <div className="bg-white rounded-2xl shadow-2xl border border-gray-150 max-w-lg w-full overflow-hidden flex flex-col my-8 animate-in fade-in zoom-in-95 duration-200">
              
              {/* Header */}
              <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 p-5 text-white flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-white/10">
                    <MessageCircle className="w-5 h-5 fill-white/20" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm uppercase tracking-wider">WhatsApp Creator Messenger</h3>
                    <p className="text-[10px] text-emerald-100 font-medium">Instantly dispatch campaign briefs, drafts & report updates</p>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    setWhatsappTask(null);
                    setWhatsappSaveSuccess(false);
                  }}
                  className="bg-white/10 hover:bg-white/20 rounded-full w-7 h-7 flex items-center justify-center transition cursor-pointer text-white font-bold"
                  title="Close messenger modal"
                >
                  &times;
                </button>
              </div>

              {/* Body */}
              <div className="p-6 space-y-5 flex-1 max-h-[75vh] overflow-y-auto">
                
                {/* Creator Card Presentation */}
                {waCreator ? (
                  <div className="flex items-center gap-3.5 p-3 rounded-xl bg-gray-50 border border-gray-150 shadow-xs">
                    <img 
                      src={waCreator.avatar} 
                      className="w-12 h-12 rounded-full object-cover border-2 border-white ring-1 ring-emerald-500/30 shadow-xs" 
                      alt={waCreator.name}
                      referrerPolicy="no-referrer"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h4 className="font-black text-sm text-gray-800 leading-none">{waCreator.name}</h4>
                        <span className="text-[10px] text-gray-400 font-mono font-medium">({waCreator.handle})</span>
                      </div>
                      <p className="text-xs text-gray-450 mt-1">{waCreator.niche}</p>
                      <span className="inline-flex items-center px-2 py-0.5 mt-1.5 rounded-full text-[9px] font-bold bg-emerald-50 text-emerald-700 uppercase tracking-wider">
                        {waCreator.status}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-amber-600 bg-amber-50 p-3 rounded-lg font-bold">
                    ⚠️ No specific creator model bound to this planner entry! Please close and select a creator first.
                  </div>
                )}

                {/* Mobile / Contact update form */}
                {waCreator && (
                  <div className="space-y-2">
                    <label className="block text-[11px] font-extrabold text-gray-600 uppercase tracking-wider">
                      WhatsApp Mobile Number (Includes Country Code):
                    </label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-xs font-bold text-gray-400">
                          ��
                        </span>
                        <input
                          type="tel"
                          placeholder="e.g. +919876543210 or +15555418932"
                          value={whatsappPhone}
                          onChange={(e) => {
                            setWhatsappPhone(e.target.value);
                            setWhatsappSaveSuccess(false);
                          }}
                          className="w-full text-xs font-mono text-gray-800 pl-8 pr-3 py-2 border border-gray-250 rounded-lg focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition"
                        />
                      </div>
                      {hasPhoneChanged && (
                        <button
                          type="button"
                          onClick={() => {
                            if (onUpdateInfluencer) {
                              onUpdateInfluencer(waCreator.id, { mobile: cleanSingleMobileForStorage(whatsappPhone) });
                              setWhatsappSaveSuccess(true);
                              setTimeout(() => setWhatsappSaveSuccess(false), 3000);
                            }
                          }}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3.5 py-2 rounded-lg transition shadow-xs cursor-pointer inline-flex items-center gap-1 shrink-0"
                        >
                          Save
                        </button>
                      )}
                    </div>
                    {whatsappSaveSuccess && (
                      <p className="text-[11px] font-semibold text-emerald-600 animate-pulse">
                        ✓ Creator contact details stored and synchronized successfully.
                      </p>
                    )}
                    <p className="text-[10px] text-gray-400 leading-normal">
                      Provide the full mobile digits (e.g. starting with +91 for India or +1 for US) to open direct chat without saving the contact on your phone.
                    </p>
                  </div>
                )}

                {/* Language Selector: English vs Assamese */}
                <div className="flex items-center justify-between bg-slate-100 p-2.5 rounded-xl border border-gray-200 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs font-black text-gray-800">
                      {whatsappLanguage === 'as' ? "বাৰ্তাৰ ভাষা (Message Language):" : "Message Language:"}
                    </span>
                    {whatsappLanguage === 'as' && (
                      <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black px-2 py-0.5 rounded-full border border-emerald-300">
                        অসমীয়া সক্ৰিয়
                      </span>
                    )}
                  </div>
                  <div className="inline-flex rounded-lg bg-white p-0.5 shadow-xs border border-gray-200">
                    <button
                      type="button"
                      onClick={() => {
                        setWhatsappLanguage('en');
                        try { localStorage.setItem('wa_msg_lang', 'en'); } catch {}
                      }}
                      className={`px-3 py-1 text-xs font-black rounded-md transition cursor-pointer flex items-center gap-1.5 ${
                        whatsappLanguage === 'en'
                          ? 'bg-gray-900 text-white shadow-xs'
                          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                      }`}
                    >
                      🇬🇧 English
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setWhatsappLanguage('as');
                        try { localStorage.setItem('wa_msg_lang', 'as'); } catch {}
                      }}
                      className={`px-3 py-1 text-xs font-black rounded-md transition cursor-pointer flex items-center gap-1.5 ${
                        whatsappLanguage === 'as'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-gray-600 hover:text-emerald-700 hover:bg-gray-50'
                      }`}
                    >
                      🇮🇳 অসমীয়া (Assamese)
                    </button>
                  </div>
                </div>

                {/* Quick Templates Selector */}
                <div className="space-y-2.5">
                  <label className="block text-[11px] font-extrabold text-gray-600 uppercase tracking-wider">
                    {whatsappLanguage === 'as' ? "কেম্পেইন বাৰ্তাৰ টেমপ্লেট বাছনি কৰক:" : "Select Message Campaign Template:"}
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setWhatsappTemplate('confirm')}
                      className={`text-[11px] font-bold px-2 py-2.5 rounded-lg border text-left transition ${
                        whatsappTemplate === 'confirm'
                          ? 'bg-emerald-50 border-emerald-250 text-emerald-800 ring-1 ring-emerald-500'
                          : 'bg-white border-gray-200 text-gray-605 hover:bg-gray-50'
                      }`}
                    >
                      <p className="font-mono text-[9px] text-emerald-600 uppercase mb-0.5">{whatsappLanguage === 'as' ? 'পদক্ষেপ ১' : 'STEP 1'}</p>
                      📅 {whatsappLanguage === 'as' ? 'সময়সূচী নিশ্চিতকৰণ' : 'Confirm Schedule'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setWhatsappTemplate('sample')}
                      className={`text-[11px] font-bold px-2 py-2.5 rounded-lg border text-left transition ${
                        whatsappTemplate === 'sample'
                          ? 'bg-orange-50 border-orange-300 text-orange-900 ring-1 ring-orange-500'
                          : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <p className="font-mono text-[9px] text-orange-600 uppercase mb-0.5">
                        {whatsappLanguage === 'as' ? "ছেম্পল প্ৰেৰণ" : "DISPATCH"}
                      </p>
                      📦 {whatsappLanguage === 'as' ? "ছেম্পল পোৱা নিশ্চিতকৰণ" : "Sample Received Check"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setWhatsappTemplate('reminder')}
                      className={`text-[11px] font-bold px-2 py-2.5 rounded-lg border text-left transition ${
                        whatsappTemplate === 'reminder'
                          ? 'bg-emerald-50 border-emerald-250 text-emerald-800 ring-1 ring-emerald-500'
                          : 'bg-white border-gray-200 text-gray-605 hover:bg-gray-50'
                      }`}
                    >
                      <p className="font-mono text-[9px] text-emerald-600 uppercase mb-0.5">{whatsappLanguage === 'as' ? 'পদক্ষেপ ২' : 'STEP 2'}</p>
                      📹 {whatsappLanguage === 'as' ? "ভিডিঅ' ড্ৰাফ্ট ৰিভিউ" : 'Video Draft Review'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setWhatsappTemplate('update')}
                      className={`text-[11px] font-bold px-2 py-2.5 rounded-lg border text-left transition ${
                        whatsappTemplate === 'update'
                          ? 'bg-emerald-50 border-emerald-250 text-emerald-800 ring-1 ring-emerald-500'
                          : 'bg-white border-gray-200 text-gray-605 hover:bg-gray-50'
                      }`}
                    >
                      <p className="font-mono text-[9px] text-emerald-600 uppercase mb-0.5">{whatsappLanguage === 'as' ? 'পদক্ষেপ ৩' : 'STEP 3'}</p>
                      📊 {whatsappLanguage === 'as' ? 'প্ৰদৰ্শন পৰিসংখ্যা' : 'Performance Analytics'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setWhatsappTemplate('payment')}
                      className={`text-[11px] font-bold px-2 py-2.5 rounded-lg border text-left transition ${
                        whatsappTemplate === 'payment'
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-900 ring-1 ring-emerald-500'
                          : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <p className="font-mono text-[9px] text-emerald-600 uppercase mb-0.5">
                        {whatsappLanguage === 'as' ? "পেমেন্ট" : "PAYMENT"}
                      </p>
                      💳 {whatsappLanguage === 'as' ? "পেমেন্টৰ তথ্য প্ৰেৰণ" : "Send Payment Details"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setWhatsappTemplate('custom')}
                      className={`text-[11px] font-bold px-2 py-2.5 rounded-lg border text-left transition ${
                        whatsappTemplate === 'custom'
                          ? 'bg-emerald-50 border-emerald-250 text-emerald-800 ring-1 ring-emerald-500'
                          : 'bg-white border-gray-200 text-gray-605 hover:bg-gray-50'
                      }`}
                    >
                      <p className="font-mono text-[9px] text-emerald-600 uppercase mb-0.5">
                        {whatsappLanguage === 'as' ? "যিকোনো সময়ত" : "ANYTIME"}
                      </p>
                      ✏️ {whatsappLanguage === 'as' ? "ক্ষিপ্ৰ যোগাযোগ" : "Quick Check-In"}
                    </button>
                  </div>
                </div>

                {/* Message Editor */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-[11px] font-extrabold text-gray-600 uppercase tracking-wider">
                      {whatsappLanguage === 'as' ? "বাৰ্তাৰ খচৰা (Message Draft):" : "Compose Message Draft:"}
                    </label>
                    <span className="text-[10px] text-gray-400 font-mono">
                      {whatsappMessageText.length} characters
                    </span>
                  </div>
                  <textarea
                    rows={4}
                    value={whatsappMessageText}
                    onChange={(e) => setWhatsappMessageText(e.target.value)}
                    placeholder={whatsappLanguage === 'as' ? "বাৰ্তাৰ পাঠ্য লিখক বা সলনি কৰক..." : "Draft message content to dispatch..."}
                    className="w-full text-xs text-gray-800 p-3 border border-gray-250 rounded-xl focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition bg-slate-50/50 font-sans"
                  />
                </div>

              </div>

              {/* Footer */}
              <div className="bg-gray-50 px-6 py-4 border-t border-gray-150 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    setWhatsappTask(null);
                    setWhatsappSaveSuccess(false);
                  }}
                  className="px-4 py-2 text-xs font-bold text-gray-550 hover:text-gray-850 hover:bg-gray-100 rounded-lg transition"
                >
                  {whatsappLanguage === 'as' ? "বন্ধ কৰক (Close)" : "Close"}
                </button>
                <button
                  type="button"
                  disabled={!whatsappMessageText}
                  onClick={() => {
                    if (!whatsappPhone) {
                      if (waCreator) {
                        triggerUpdateWhatsAppModal({
                          influencerId: waCreator.id,
                          influencerName: waCreator.name,
                          influencerAvatar: waCreator.avatar,
                          influencerHandle: waCreator.handle,
                          currentMobile: '',
                          messageText: whatsappMessageText,
                          contextTitle: 'Campaign Deliverable Dispatch',
                          onSuccess: (savedNum) => {
                            setWhatsappPhone(savedNum);
                          }
                        });
                      }
                      return;
                    }
                    openWhatsAppChat({
                      phoneNumber: whatsappPhone,
                      text: whatsappMessageText,
                      preferApp: true,
                      contactName: waCreator?.name || 'Creator'
                    });
                  }}
                  className={`inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-xs font-bold transition shadow-xs cursor-pointer text-white tracking-wide uppercase ${
                    whatsappMessageText
                      ? 'bg-emerald-600 hover:bg-emerald-700 border border-emerald-700 text-white shadow-emerald-200/50'
                      : 'bg-gray-300 border-gray-300 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  <MessageCircle className="w-3.5 h-3.5 fill-white/10" />
                  <span>{whatsappLanguage === 'as' ? "হোৱাটছএপত পঠিয়াওক (WhatsApp Send)" : "Send via WhatsApp"}</span>
                </button>
              </div>

            </div>
          </div>
        );
      })()}

      {/* Centralized All Reels Links Directory Modal */}
      <AllReelsDirectoryModal
        isOpen={showAllReelsModal}
        onClose={() => setShowAllReelsModal(false)}
        tasks={tasks}
        influencers={influencers}
        onUpdateTask={onUpdateTask}
        onUpdateTasksBulk={onUpdateTasksBulk}
      />

    </div>
  );
}
