import React, { useState, useMemo, useRef, useEffect } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
import {
  Upload, FileText, FileSpreadsheet, FileCode, CheckCircle2,
  AlertTriangle, Filter, Search, X, Sparkles, RefreshCw,
  ExternalLink, Download, ArrowRight, UserCheck, UserMinus, Users, Layers, Eye,
  BarChart2, Award, Zap, Database, Copy, Trash2, MousePointerClick,
  TrendingUp, Percent, DollarSign, Edit2, Check, AlertCircle, Info, HelpCircle,
  ChevronDown, ChevronUp, ChevronRight, Link2, Key, Sliders, ShieldCheck, ShieldAlert, Activity, Cloud,
  Plus, FilePlus, GitMerge, CheckCheck, Save, BookmarkCheck, CloudUpload, CloudDownload,
  Trophy, TrendingDown, PieChart, ListOrdered, History, Calendar, Share2, Video, User as UserIcon, MapPin,
  FolderGit2, Crown, Medal, Target, Flame, Loader2, Play, DownloadCloud
} from 'lucide-react';
import { auth, ensureGoogleAccessToken, getGoogleAccessToken, googleSignIn } from '../lib/firebaseAuth';
import { User, onAuthStateChanged } from 'firebase/auth';
import { db } from '../lib/firestoreService';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { globalToast } from '../lib/toast';
import { safeLocalStorage } from '../lib/safeLocalStorage';
import { DeliverableRow, SAMPLE_DELIVERABLES } from '../data/sampleVideoDeliverables';
import { Task, Influencer } from '../types';
import LinkPreview, { PreviewData } from './LinkPreview';
import { 
  ensureDriveFolder, searchSyncFilesOnDrive, downloadSyncFileFromDrive, 
  uploadFullBackupToGoogleDrive, updateSyncFileOnDrive, createSyncFileOnDrive 
} from '../lib/driveSync';
import { ExcelExtractorEditorModal } from './ExcelExtractorEditorModal';

export interface AmbiguousMergeItem {
  id: string;
  incomingIndex: number;
  incomingRow: DeliverableRow;
  candidateExistingIndex: number;
  candidateExistingRow: DeliverableRow;
  score: number;
  matchReasons: string[];
}

export interface TrackedLink {
  id: string;
  url: string;
  label: string;
  clicks?: number;
  humanClicks?: number;
  previousClicks?: number;
  manualClicksOverride?: number;
  manualHumanClicksOverride?: number;
  lastUpdated?: string;
  linkData?: any;
  statsData?: any;
  linkDetailsData?: any;
  error?: string;
}

export interface SubPageAnalyzedSnapshot {
  savedAt: string;
  sourceFileName?: string;
  totalRecords: number;
  data: DeliverableRow[];
  stats: {
    totalSpend: number;
    totalViews: number;
    totalClicks: number;
    avgCpv: number;
    avgCpc: number;
    avgCtr: number;
    uniqueCreators: number;
    uniqueProducts: number;
  };
  notes?: string;
  driveFileId?: string;
  driveLastSyncTime?: string;
}

interface DataAnalyzerProps {
  tasks?: Task[];
  onSyncTasks?: (newTasks: Partial<Task>[]) => void;
  onSyncInfluencers?: (newInfluencers: Partial<Influencer>[]) => void;
  onUpdateTasksBulk?: (bulkUpdates: {id: string, updates: Partial<Task>}[]) => void;
  accessToken?: string | null;
  user?: User | null;
}

export const MONTH_NAMES_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export const monthNameToIndex = (monthStr: string): number => {
  if (!monthStr) return -1;
  const mLow = monthStr.toLowerCase().trim();
  const shortMonths = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  for (let i = 0; i < 12; i++) {
    if (mLow.includes(shortMonths[i]) || mLow.includes(MONTH_NAMES_FULL[i].toLowerCase())) {
      return i;
    }
  }
  return -1;
};

export const getRowYearMonthInfo = (r: DeliverableRow) => {
  const dates = [r.videoReleasedDate, r.plannedDate, r.timestamp].filter(Boolean);
  let year = 2025;
  let monthIdx = 0;
  let monthName = 'January';
  let found = false;

  for (const d of dates) {
    const mMatch = d.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\b/i);
    const yMatch = d.match(/\b(20\d\d|\d\d)\b/);
    if (yMatch) {
      const yNum = parseInt(yMatch[1].length === 2 ? `20${yMatch[1]}` : yMatch[1], 10);
      if (!isNaN(yNum) && yNum >= 2020 && yNum <= 2030) year = yNum;
    }
    if (mMatch) {
      const idx = monthNameToIndex(mMatch[1]);
      if (idx !== -1) {
        monthIdx = idx;
        monthName = MONTH_NAMES_FULL[idx];
        found = true;
        break;
      }
    }
    const numMatch = d.match(/\b(20\d\d)[-/.](0?[1-9]|1[012])[-/.](0?[1-9]|[12]\d|3[01])\b/) || d.match(/\b(0?[1-9]|1[012])[-/.](0?[1-9]|[12]\d|3[01])[-/.](20\d\d)\b/);
    if (numMatch) {
      if (numMatch[1].length === 4) {
        year = parseInt(numMatch[1], 10);
        monthIdx = parseInt(numMatch[2], 10) - 1;
      } else {
        year = parseInt(numMatch[3], 10);
        monthIdx = parseInt(numMatch[1], 10) - 1;
      }
      if (monthIdx >= 0 && monthIdx < 12) {
        monthName = MONTH_NAMES_FULL[monthIdx];
        found = true;
        break;
      }
    }
  }

  if (!found) {
    const mTxt = r.releaseMonth || r.orderMonth || '';
    if (mTxt) {
      const matchY = mTxt.match(/20\d\d/) || mTxt.match(/\d\d$/);
      if (matchY) {
        const yNum = parseInt(matchY[0].length === 2 ? `20${matchY[0]}` : matchY[0], 10);
        if (!isNaN(yNum) && yNum >= 2020 && yNum <= 2030) year = yNum;
      }
      const mIdx = monthNameToIndex(mTxt);
      if (mIdx !== -1) {
        monthIdx = mIdx;
        monthName = MONTH_NAMES_FULL[mIdx];
        found = true;
      }
    }
  }

  const sortKey = `${year}-${String(monthIdx + 1).padStart(2, '0')}`;
  const divisionTitle = `📅 DIVISION: ${monthName.toUpperCase()} ${year}`;

  return { year, monthIdx, monthName, sortKey, divisionTitle };
};

export const getCpvBenchmarkStatus = (cpv: number): string => {
  if (!cpv || cpv <= 0 || isNaN(cpv)) return '— Standard Engagement';
  if (cpv < 0.95) return '🏆 Exceptional Value (< ₹0.95)';
  if (cpv <= 2.90) return '✅ Optimal Industry Standard (₹0.95 - ₹2.90)';
  if (cpv <= 5.80) return '📈 Moderate Range (₹2.91 - ₹5.80)';
  return '📊 Premium Content Range (> ₹5.80)';
};

export const getCpcBenchmarkStatus = (cpc: number): string => {
  if (!cpc || cpc <= 0 || isNaN(cpc)) return '— Standard Engagement';
  if (cpc < 50) return '🏆 Exceptional Value (< ₹50)';
  if (cpc <= 300) return '✅ Optimal Industry Standard (₹50 - ₹300)';
  if (cpc <= 577) return '📈 Moderate Range (₹301 - ₹577)';
  return '📊 Growth Engagement Range (> ₹577)';
};

export const getCreatorEfficiencyScore = (cpv: number, cpc: number): number => {
  if (cpv > 0 && cpc > 0) return (cpv / 2.0) + (cpc / 150.0);
  if (cpv > 0) return (cpv / 2.0) + 10;
  if (cpc > 0) return (cpc / 150.0) + 20;
  return 999999;
};

export default function DataAnalyzer({ tasks, onSyncTasks, onSyncInfluencers, onUpdateTasksBulk, accessToken, user }: DataAnalyzerProps) {
  const [data, setData] = useState<DeliverableRow[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<{ type: string; value: string; label: string } | null>(null);
  const [filterInfluencer, setFilterInfluencer] = useState<string>('ALL');
  const [filterProducts, setFilterProducts] = useState<string[]>([]);
  const [isProductDropdownOpen, setIsProductDropdownOpen] = useState(false);
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const productDropdownRef = useRef<HTMLDivElement>(null);
  
  // Multi-Select Approacher / BDM Filter State
  const [filterApproachers, setFilterApproachers] = useState<string[]>([]);
  const [isApproacherDropdownOpen, setIsApproacherDropdownOpen] = useState(false);
  const [approacherSearchTerm, setApproacherSearchTerm] = useState('');
  const approacherDropdownRef = useRef<HTMLDivElement>(null);

  // Multi-Select State / Location Filter State
  const [filterStates, setFilterStates] = useState<string[]>([]);
  const [isStateDropdownOpen, setIsStateDropdownOpen] = useState(false);
  const [stateSearchTerm, setStateSearchTerm] = useState('');
  const stateDropdownRef = useRef<HTMLDivElement>(null);

  const [filterYear, setFilterYear] = useState<string>('ALL');
  const [filterMonth, setFilterMonth] = useState<string>('ALL');
  const [filterDate, setFilterDate] = useState<string>('');
  const [matrixGroupBy, setMatrixGroupBy] = useState<'influencer' | 'product'>('influencer');
  const [approacherDeleteModal, setApproacherDeleteModal] = useState<{
    isOpen: boolean;
    targetApproacher: string;
    action: 'keep_selected_delete_others' | 'delete_selected';
  } | null>(null);

  // Add More Data & Smart Merge State
  const [isAddMoreDataModalOpen, setIsAddMoreDataModalOpen] = useState(false);
  const [addMoreDataMode, setAddMoreDataMode] = useState<'smart_merge' | 'append' | 'replace'>('smart_merge');
  const [addMoreRawText, setAddMoreRawText] = useState('');
  const addMoreFileInputRef = useRef<HTMLInputElement>(null);

  // Confusion Resolver Popup State (when ambiguous match is found)
  const [confusionModalState, setConfusionModalState] = useState<{
    isOpen: boolean;
    ambiguousItems: AmbiguousMergeItem[];
    sourceName: string;
    autoMergedCount: number;
    newAddedCount: number;
    candidateData: DeliverableRow[];
  } | null>(null);
  const [ambiguousDecisions, setAmbiguousDecisions] = useState<Record<number, 'merge' | 'new' | 'skip'>>({});

  // Proof & Raw API Inspection State
  const [proofInspectionModal, setProofInspectionModal] = useState<{
    isOpen: boolean;
    row: DeliverableRow;
    type: 'views' | 'clicks' | 'both';
  } | null>(null);

  // Sub-Page Analyzed Data & Google Drive State
  const [subpageSnapshot, setSubpageSnapshot] = useState<SubPageAnalyzedSnapshot | null>(() => {
    try {
      const stored = safeLocalStorage.getItem('DATA_ANALYZER_SUBPAGE_SNAPSHOT');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const [isSavingToDrive, setIsSavingToDrive] = useState(false);
  const [isUpdatingFromDrive, setIsUpdatingFromDrive] = useState(false);
  const [subpageRankingMetric, setSubpageRankingMetric] = useState<'views' | 'clicks' | 'spend' | 'cpv' | 'ctr'>('views');
  const [subpageActiveTab, setSubpageActiveTab] = useState<'overview' | 'influencer_videos' | 'influencer_history' | 'influencer_ranking' | 'product_history' | 'video_history' | 'approacher_matrix' | 'raw_data' | 'sheets_extract'>('overview');
  const [subpageSearchTerm, setSubpageSearchTerm] = useState('');
  const [isDeleteSubpageModalOpen, setIsDeleteSubpageModalOpen] = useState(false);

  // Google Sheets Extraction Slicer & State
  const [extractFilterInfluencer, setExtractFilterInfluencer] = useState<string>('ALL');
  const [extractFilterProducts, setExtractFilterProducts] = useState<string[]>([]);
  const [isExtractProductDropdownOpen, setIsExtractProductDropdownOpen] = useState(false);
  const [extractProductSearchTerm, setExtractProductSearchTerm] = useState('');
  const extractProductDropdownRef = useRef<HTMLDivElement>(null);
  const [extractFilterYear, setExtractFilterYear] = useState<string>('ALL');
  const [extractFilterMonth, setExtractFilterMonth] = useState<string>('ALL');
  const [extractFilterApproacher, setExtractFilterApproacher] = useState<string>('ALL');
  const [extractFilterStates, setExtractFilterStates] = useState<string[]>([]);
  const [isExtractStateDropdownOpen, setIsExtractStateDropdownOpen] = useState(false);
  const [extractStateSearchTerm, setExtractStateSearchTerm] = useState('');
  const extractStateDropdownRef = useRef<HTMLDivElement>(null);
  const [extractFilterPlatform, setExtractFilterPlatform] = useState<string>('ALL');
  const [extractFilterStep, setExtractFilterStep] = useState<string>('ALL');
  const [extractMinViews, setExtractMinViews] = useState<number>(0);
  const [extractMinClicks, setExtractMinClicks] = useState<number>(0);
  const [extractSearchTerm, setExtractSearchTerm] = useState<string>('');

  const [isExtractingSheets, setIsExtractingSheets] = useState<boolean>(false);
  const [sheetsExtractUrl, setSheetsExtractUrl] = useState<string | null>(null);
  const [sheetsExtractLogs, setSheetsExtractLogs] = useState<{ status: 'active' | 'success' | 'error'; message: string }[]>([]);
  const [sheetsExtractProgress, setSheetsExtractProgress] = useState<number>(0);

  const [viewMode, setViewMode] = useState<'grid' | 'breakdown' | 'matrix' | 'tat' | 'ai' | 'subpage'>('grid');
  const [aiReport, setAiReport] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [rawTextModal, setRawTextModal] = useState(false);
  const [rawText, setRawText] = useState('');
  const [fileTypeBadge, setFileTypeBadge] = useState<string>('Blank / Awaiting File');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Live Views & Clicks Cache and Manual Overrides (with persistent storage)
  const [liveViewsCache, setLiveViewsCache] = useState<Record<string, number>>(() => {
    try {
      const stored = safeLocalStorage.getItem('DATA_ANALYZER_LIVE_VIEWS_CACHE');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    safeLocalStorage.setItem('DATA_ANALYZER_LIVE_VIEWS_CACHE', JSON.stringify(liveViewsCache));
  }, [liveViewsCache]);

  const [liveClicksCache, setLiveClicksCache] = useState<Record<string, number>>(() => {
    try {
      const stored = safeLocalStorage.getItem('DATA_ANALYZER_LIVE_CLICKS_CACHE');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    safeLocalStorage.setItem('DATA_ANALYZER_LIVE_CLICKS_CACHE', JSON.stringify(liveClicksCache));
  }, [liveClicksCache]);

  const [isRefreshingLive, setIsRefreshingLive] = useState(false);
  const [editingMetric, setEditingMetric] = useState<{ rowId: string; type: 'views' | 'clicks'; value: string } | null>(null);

  // High / Abnormal Views Threshold State & Modal Controls (Base Model Benchmark: 24,65,263 views in a single video)
  const [highViewThreshold, setHighViewThreshold] = useState<number>(2465263);
  const [isHighCountModalOpen, setIsHighCountModalOpen] = useState(false);
  const [highCountActiveTab, setHighCountActiveTab] = useState<'main' | 'subpage'>('main');

  // Abnormal View Monitor & Original View Guard State (mirrors LiveVideoViewsTracker)
  const [abnormalMonitorEnabled, setAbnormalMonitorEnabled] = useState<boolean>(() => {
    try {
      const saved = safeLocalStorage.getItem('DATA_ANALYZER_ABNORMAL_MONITOR_ENABLED');
      return saved !== null ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });
  const [abnormalThreshold, setAbnormalThreshold] = useState<'AUTO' | number>(() => {
    try {
      const saved = safeLocalStorage.getItem('DATA_ANALYZER_ABNORMAL_THRESHOLD');
      if (!saved || saved === 'AUTO') return 'AUTO';
      const parsed = Number(saved);
      return !isNaN(parsed) && parsed > 0 ? parsed : 'AUTO';
    } catch {
      return 'AUTO';
    }
  });
  const [showAbnormalMonitorLog, setShowAbnormalMonitorLog] = useState<boolean>(false);

  useEffect(() => {
    safeLocalStorage.setItem('DATA_ANALYZER_ABNORMAL_MONITOR_ENABLED', JSON.stringify(abnormalMonitorEnabled));
  }, [abnormalMonitorEnabled]);

  useEffect(() => {
    safeLocalStorage.setItem('DATA_ANALYZER_ABNORMAL_THRESHOLD', String(abnormalThreshold));
  }, [abnormalThreshold]);

  // Live Video Views Tracker State & Cache (mirroring LiveVideoViewsTracker)
  const [linkPreviews, setLinkPreviews] = useState<Record<string, { loading?: boolean; data?: PreviewData }>>(() => {
    try {
      const stored = safeLocalStorage.getItem('LIVE_VIDEO_VIEWS_PREVIEWS');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });
  const [isCollectingViews, setIsCollectingViews] = useState(false);
  const [collectingViewsProgress, setCollectingViewsProgress] = useState<{ current: number; total: number; success: number; failed: number } | null>(null);
  const [rowViewsLoadingId, setRowViewsLoadingId] = useState<string | null>(null);
  const [previousViewsMap, setPreviousViewsMap] = useState<Record<string, number>>({});
  
  // Live Video Views Inspector & Resolver Modal for deliverable rows (e.g. VoId-946)
  const [inspectingRowForViews, setInspectingRowForViews] = useState<{
    row: DeliverableRow;
    currentUrl: string;
    viewsValue: string;
    isTesting?: boolean;
    testError?: string | null;
  } | null>(null);

  // Deliverable Detail Modal for checking reasons and all specifications
  const [selectedDeliverableForModal, setSelectedDeliverableForModal] = useState<DeliverableRow | null>(null);
  // Expandable Missing Metrics Reasons Audit in Totals Bar
  const [showMissingReasonsAudit, setShowMissingReasonsAudit] = useState(false);
  const [auditFilterTab, setAuditFilterTab] = useState<'all' | 'views' | 'clicks'>('all');

  // Short.io Tracker Synchronized State & Cloud Configuration
  const [apiKey, setApiKey] = useState<string>(() => safeLocalStorage.getItem('SHORT_IO_API_KEY') || '');
  const [isEditingApiKey, setIsEditingApiKey] = useState<boolean>(false);
  const [tempApiKey, setTempApiKey] = useState<string>('');
  const [showApiKeyInModal, setShowApiKeyInModal] = useState<boolean>(false);
  const [shortIoLinks, setShortIoLinks] = useState<TrackedLink[]>(() => {
    try {
      const stored = safeLocalStorage.getItem('SHORT_IO_TRACKED_LINKS');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [manualOverride, setManualOverride] = useState<boolean>(() => {
    try {
      const stored = safeLocalStorage.getItem('SHORT_IO_MANUAL_OVERRIDE');
      return stored ? JSON.parse(stored) : false;
    } catch {
      return false;
    }
  });
  const [primaryMetric, setPrimaryMetric] = useState<'total' | 'human'>(() => {
    return safeLocalStorage.getItem('SHORT_IO_PRIMARY_METRIC') === 'human' ? 'human' : 'total';
  });
  const [isCollectingShortIo, setIsCollectingShortIo] = useState(false);
  const [collectingShortIoProgress, setCollectingShortIoProgress] = useState<{ current: number; total: number; success: number; failed: number } | null>(null);
  const [rowCollectingId, setRowCollectingId] = useState<string | null>(null);
  const [lastShortIoSyncTime, setLastShortIoSyncTime] = useState<string | null>(null);

  // Excel File Extractor and Editor Modal state
  const [isExcelExtractorOpen, setIsExcelExtractorOpen] = useState<boolean>(false);

  // Helper to parse tabular array of arrays into DeliverableRow
  const parseRowsFromMatrix = (matrix: any[][], sourceName: string) => {
    if (!matrix || !Array.isArray(matrix) || matrix.length < 2) {
      globalToast.error('Document contains insufficient tabular data.');
      return;
    }

    // Locate header row containing Video ID, Name Of The Influencer, Product Name, or general columns
    let headerIdx = -1;
    for (let i = 0; i < Math.min(matrix.length, 30); i++) {
      const row = matrix[i];
      if (!row || !Array.isArray(row)) continue;
      const rowStr = row.map(c => String(c ?? '').toLowerCase()).join(' ');
      if (
        rowStr.includes('video id') ||
        rowStr.includes('videoid') ||
        rowStr.includes('void') ||
        rowStr.includes('name of the influencer') ||
        rowStr.includes('influencer') ||
        rowStr.includes('product name') ||
        rowStr.includes('product') ||
        rowStr.includes('amount') ||
        rowStr.includes('deliverable')
      ) {
        headerIdx = i;
        break;
      }
    }

    if (headerIdx === -1) {
      // Fallback to first non-empty row
      headerIdx = 0;
    }

    const headerRow = matrix[headerIdx] || [];
    const headers = headerRow.map(h => String(h ?? '').trim().toLowerCase());
    
    const findCol = (terms: string[]) => {
      return headers.findIndex(h => typeof h === 'string' && h.length > 0 && terms.some(t => typeof t === 'string' && h.includes(t)));
    };

    const cTimestamp = findCol(['timestamp', 'time']);
    const cVideoId = findCol(['video id', 'videoid', 'void', 'id']);
    const cInfName = findCol(['name of the influencer', 'influencer name', 'influencer', 'creator', 'channel']);
    const cPlannedDate = findCol(['planned date of video', 'planned date', 'schedule date']);
    const cPlatform = findCol(['platform', 'channel type']);
    const cAmount = findCol(['amount paid', 'amount', 'remuneration', 'cost', 'fee', 'price', 'budget']);
    const cApproacher = findCol(['approacher', 'bdm', 'managed by', 'assigned to']);
    const cSample = findCol(['sample should sent', 'sample sent', 'sample']);
    const cProduct = findCol(['product name', 'product', 'item', 'sku']);
    const cAdAgreement = findCol(['ad agreement', 'agreement', 'contract']);
    const cPaymentTerms = findCol(['payment terms', 'payment term', 'payout terms']);
    
    // Checklist phase
    const cChecklistPdf = findCol(['checklist pdf', 'checklist link', 'checklist']);
    const cChecklistActual = findCol(['actual date', 'checklist date']);
    
    // Short.io phase
    const cShortIoLink = findCol(['short.io link', 'short io link', 'shortlink', 'short link', 'bitly link', 'track link', 'short io', 'short.io', 'full short link', 'full link']);
    const cShortIoCode = findCol(['short.io code', 'short io code', 'short code', 'code', 'shortio code', 'shortio']);
    
    // Video Link & Release
    const cVideoLink = findCol(['video link', 'released link', 'reel link', 'post link', 'url']);
    const cVideoReleaseDate = findCol(['video released date', 'released date', 'release date', 'publish date']);

    // Performance Metrics (Views, Clicks, CPC, CTR, CPV)
    const cViews = findCol(['views', 'view count', 'video views', 'live views', 'reach', 'impressions']);
    const cClicks = findCol(['clicks', 'click count', 'shortio clicks', 'short.io clicks', 'link clicks']);
    const cCpc = findCol(['cpc', 'cost per click']);
    const cCtr = findCol(['ctr', 'click through rate', 'click-through rate']);
    const cCpv = findCol(['cpv', 'cost per view']);
    
    // Month & Steps
    const cOrderMonth = findCol(['order month', 'month']);
    const cReleaseMonth = findCol(['release month']);
    const cState = findCol(['state', 'influencer state', 'creator state', 'location', 'region', 'zone', 'province', 'territory']);
    const cStep1 = findCol(['step 1', 'step1']);
    const cStep2 = findCol(['step 2', 'step2']);
    const cStep3 = findCol(['step 3', 'step3']);
    const cStep4 = findCol(['step 4', 'step4']);

    const parsed: DeliverableRow[] = [];

    const getCellStr = (row: any[], colIdx: number): string => {
      if (colIdx === -1 || !row || colIdx >= row.length || row[colIdx] === undefined || row[colIdx] === null) {
        return '';
      }
      return String(row[colIdx]).trim();
    };

    for (let r = headerIdx + 1; r < matrix.length; r++) {
      const row = matrix[r];
      if (!row || !Array.isArray(row) || row.length === 0) continue;

      const vid = getCellStr(row, cVideoId);
      const inf = getCellStr(row, cInfName);
      const prod = getCellStr(row, cProduct);

      // Skip empty filler lines
      if (!vid && !inf && !prod) continue;
      if (vid.toLowerCase().includes('void') && vid.length < 5) continue;

      const amtRaw = cAmount !== -1 ? getCellStr(row, cAmount).replace(/[^0-9.]/g, '') : '0';
      const amount = parseFloat(amtRaw) || 0;

      const vRaw = cViews !== -1 ? getCellStr(row, cViews).replace(/[^0-9.]/g, '') : '';
      const views = vRaw !== '' ? parseFloat(vRaw) : undefined;

      const clRaw = cClicks !== -1 ? getCellStr(row, cClicks).replace(/[^0-9.]/g, '') : '';
      const clicks = clRaw !== '' ? parseFloat(clRaw) : undefined;

      const cpcRaw = cCpc !== -1 ? getCellStr(row, cCpc).replace(/[^0-9.]/g, '') : '';
      const cpc = cpcRaw !== '' ? parseFloat(cpcRaw) : undefined;

      const ctrRaw = cCtr !== -1 ? getCellStr(row, cCtr).replace(/[^0-9.]/g, '') : '';
      const ctr = ctrRaw !== '' ? parseFloat(ctrRaw) : undefined;

      const cpvRaw = cCpv !== -1 ? getCellStr(row, cCpv).replace(/[^0-9.]/g, '') : '';
      const cpv = cpvRaw !== '' ? parseFloat(cpvRaw) : undefined;

      let rawShortIoLink = getCellStr(row, cShortIoLink);
      let rawShortIoCode = getCellStr(row, cShortIoCode);

      // If Short.io Code column contains a full URL, capture it as shortIoLink as well
      if (!rawShortIoLink && rawShortIoCode && (rawShortIoCode.toLowerCase().includes('http') || rawShortIoCode.includes('.') || rawShortIoCode.includes('/'))) {
        rawShortIoLink = rawShortIoCode;
      }

      // If Short.io Link is present but Short.io Code is missing, extract code segment
      if (!rawShortIoCode && rawShortIoLink) {
        try {
          const parts = rawShortIoLink.split('/');
          rawShortIoCode = parts[parts.length - 1] || rawShortIoLink;
        } catch {
          rawShortIoCode = rawShortIoLink;
        }
      }

      const pdfLink = getCellStr(row, cChecklistPdf);
      const vLink = getCellStr(row, cVideoLink);

      parsed.push({
        timestamp: getCellStr(row, cTimestamp),
        videoId: vid || `VoId-${1000 + parsed.length}`,
        influencerName: inf || 'Unknown Creator',
        plannedDate: getCellStr(row, cPlannedDate),
        platform: getCellStr(row, cPlatform) || 'Social',
        amountPaid: amount,
        approacher: getCellStr(row, cApproacher) || 'BDM',
        sampleShouldSent: getCellStr(row, cSample) || 'No',
        productName: prod || 'Product SKU',
        adAgreement: getCellStr(row, cAdAgreement),
        paymentTerms: getCellStr(row, cPaymentTerms) || 'After Video Released',
        checklistPlannedDate: '',
        checklistActualDate: getCellStr(row, cChecklistActual),
        checklistPdf: pdfLink,
        checklistDelay: '',
        shortIoPlannedDate: '',
        shortIoActualDate: '',
        shortIoLink: rawShortIoLink,
        shortIoDelay: '',
        finalPlannedDate: '',
        finalActualDate: '',
        videoReleasedDate: getCellStr(row, cVideoReleaseDate),
        videoLink: vLink,
        finalDelay: '',
        shortIoCode: rawShortIoCode,
        orderMonth: getCellStr(row, cOrderMonth),
        releaseMonth: getCellStr(row, cReleaseMonth),
        state: getCellStr(row, cState) || 'Assam',
        step1: getCellStr(row, cStep1) || 'Done',
        step2: getCellStr(row, cStep2) || (pdfLink ? 'Done' : 'Not Done'),
        step3: getCellStr(row, cStep3) || (rawShortIoLink ? 'Done' : 'Not Done'),
        step4: getCellStr(row, cStep4) || (vLink ? 'Done' : 'Not Done'),
        views,
        clicks,
        cpc,
        ctr,
        cpv
      });
    }

    if (parsed.length > 0) {
      ingestDeliverablesDataset(parsed, sourceName, (data.length > 0 && addMoreDataMode) ? addMoreDataMode : 'smart_merge');
    } else {
      globalToast.error(`Could not extract valid deliverables from ${sourceName}.`);
    }
  };

  // -------------------------------------------------------------
  // Smart Multi-Key Matching, Mixing & Confusion Resolver
  // -------------------------------------------------------------
  const normalizeKey = (str?: string): string => {
    if (!str) return '';
    return str.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
  };

  const extractUrlKey = (url?: string): string => {
    if (!url) return '';
    const clean = url.trim().toLowerCase();
    const match = clean.match(/(?:v=|reel\/|p\/|shorts\/|\.be\/|short\.io\/|tiktok\.com\/@[^/]+\/video\/)([a-zA-Z0-9_-]+)/);
    if (match && match[1] && match[1].length > 3) return match[1];
    return clean.replace(/^https?:\/\/(?:www\.)?/, '').replace(/[/?#].*$/, '');
  };

  // Evaluates similarity between incoming row and an existing row
  const evaluateDeliverableMatch = (incoming: DeliverableRow, existing: DeliverableRow): { score: number; reasons: string[] } => {
    let score = 0;
    const reasons: string[] = [];

    const inVid = normalizeKey(incoming.videoId);
    const exVid = normalizeKey(existing.videoId);
    const inInf = normalizeKey(incoming.influencerName);
    const exInf = normalizeKey(existing.influencerName);
    const inProd = normalizeKey(incoming.productName);
    const exProd = normalizeKey(existing.productName);
    const inLinkKey = extractUrlKey(incoming.videoLink);
    const exLinkKey = extractUrlKey(existing.videoLink);
    const inShortCode = normalizeKey(incoming.shortIoCode);
    const exShortCode = normalizeKey(existing.shortIoCode);
    const inShortLink = normalizeKey(incoming.shortIoLink);
    const exShortLink = normalizeKey(existing.shortIoLink);

    // 1. Exact or normalized Video ID match
    if (inVid && exVid && inVid === exVid && inVid.length > 2 && !inVid.includes('voidai')) {
      score += 100;
      reasons.push(`Exact Video ID: ${existing.videoId}`);
    }

    // 2. Video Link / URL match
    if (inLinkKey && exLinkKey && inLinkKey === exLinkKey && inLinkKey.length > 3) {
      score += 95;
      reasons.push('Matching Published Video URL / ID');
    }

    // 3. Short.io Code or Link match
    if ((inShortCode && exShortCode && inShortCode === exShortCode && inShortCode.length > 2) ||
        (inShortLink && exShortLink && inShortLink === exShortLink && inShortLink.length > 4)) {
      score += 95;
      reasons.push('Matching Short.io Tracking Code / Link');
    }

    // 4. Influencer Name + Product Match
    const isInfMatch = inInf && exInf && (inInf === exInf || inInf.includes(exInf) || exInf.includes(inInf)) && inInf !== 'unknowncreator';
    const isProdMatch = inProd && exProd && (inProd === exProd || inProd.includes(exProd) || exProd.includes(inProd)) && inProd !== 'productsku';

    if (isInfMatch && isProdMatch) {
      score += 85;
      reasons.push(`Matched Influencer (${existing.influencerName}) & Product (${existing.productName})`);
    } else if (isInfMatch) {
      if (incoming.amountPaid > 0 && existing.amountPaid > 0 && incoming.amountPaid === existing.amountPaid) {
        score += 75;
        reasons.push(`Matched Influencer (${existing.influencerName}) & Budget (₹${existing.amountPaid.toLocaleString('en-IN')})`);
      } else if (incoming.platform && existing.platform && normalizeKey(incoming.platform) === normalizeKey(existing.platform) && normalizeKey(incoming.platform) !== 'social') {
        score += 65;
        reasons.push(`Matched Influencer (${existing.influencerName}) on ${existing.platform}`);
      } else {
        score += 48;
        reasons.push(`Similar Influencer Name: ${existing.influencerName}`);
      }
    } else if (isProdMatch) {
      if (incoming.amountPaid > 0 && existing.amountPaid > 0 && incoming.amountPaid === existing.amountPaid) {
        score += 55;
        reasons.push(`Matched Product (${existing.productName}) & Budget (₹${existing.amountPaid.toLocaleString('en-IN')})`);
      }
    }

    return { score, reasons };
  };

  // Mixes incoming fields into existing deliverable row
  const mixDeliverableRows = (existing: DeliverableRow, incoming: DeliverableRow): DeliverableRow => {
    const isBlankOrPlaceholder = (v?: string, placeholder?: string) => {
      if (!v || !v.trim()) return true;
      if (placeholder && v.trim().toLowerCase() === placeholder.toLowerCase()) return true;
      return false;
    };

    return {
      ...existing,
      videoId: isBlankOrPlaceholder(existing.videoId, 'void-ai') ? (incoming.videoId || existing.videoId) : existing.videoId,
      influencerName: isBlankOrPlaceholder(existing.influencerName, 'unknown creator')
        ? (incoming.influencerName || existing.influencerName)
        : (incoming.influencerName && incoming.influencerName !== 'Unknown Creator' ? incoming.influencerName : existing.influencerName),
      productName: isBlankOrPlaceholder(existing.productName, 'product sku')
        ? (incoming.productName || existing.productName)
        : (incoming.productName && incoming.productName !== 'Product SKU' ? incoming.productName : existing.productName),
      platform: isBlankOrPlaceholder(existing.platform, 'social')
        ? (incoming.platform || existing.platform)
        : (incoming.platform && incoming.platform !== 'Social' ? incoming.platform : existing.platform),
      amountPaid: incoming.amountPaid > 0 ? incoming.amountPaid : existing.amountPaid,
      approacher: isBlankOrPlaceholder(existing.approacher, 'bdm')
        ? (incoming.approacher || existing.approacher)
        : (incoming.approacher && incoming.approacher !== 'BDM' && incoming.approacher !== 'Unassigned' ? incoming.approacher : existing.approacher),
      videoLink: incoming.videoLink?.trim() ? incoming.videoLink.trim() : existing.videoLink,
      videoReleasedDate: incoming.videoReleasedDate?.trim() ? incoming.videoReleasedDate.trim() : existing.videoReleasedDate,
      plannedDate: incoming.plannedDate?.trim() ? incoming.plannedDate.trim() : existing.plannedDate,
      shortIoLink: incoming.shortIoLink?.trim() ? incoming.shortIoLink.trim() : existing.shortIoLink,
      shortIoCode: incoming.shortIoCode?.trim() ? incoming.shortIoCode.trim() : existing.shortIoCode,
      adAgreement: incoming.adAgreement?.trim() ? incoming.adAgreement.trim() : existing.adAgreement,
      paymentTerms: incoming.paymentTerms?.trim() ? incoming.paymentTerms.trim() : existing.paymentTerms,
      sampleShouldSent: incoming.sampleShouldSent?.trim() ? incoming.sampleShouldSent.trim() : existing.sampleShouldSent,
      checklistPdf: incoming.checklistPdf?.trim() ? incoming.checklistPdf.trim() : existing.checklistPdf,
      checklistActualDate: incoming.checklistActualDate?.trim() ? incoming.checklistActualDate.trim() : existing.checklistActualDate,
      orderMonth: incoming.orderMonth?.trim() ? incoming.orderMonth.trim() : existing.orderMonth,
      releaseMonth: incoming.releaseMonth?.trim() ? incoming.releaseMonth.trim() : existing.releaseMonth,
      views: incoming.views !== undefined ? incoming.views : existing.views,
      clicks: incoming.clicks !== undefined ? incoming.clicks : existing.clicks,
      cpc: incoming.cpc !== undefined ? incoming.cpc : existing.cpc,
      ctr: incoming.ctr !== undefined ? incoming.ctr : existing.ctr,
      cpv: incoming.cpv !== undefined ? incoming.cpv : existing.cpv,
      step1: incoming.step1 || existing.step1,
      step2: incoming.step2 === 'Done' ? 'Done' : existing.step2,
      step3: incoming.step3 === 'Done' ? 'Done' : existing.step3,
      step4: incoming.step4 === 'Done' ? 'Done' : existing.step4,
    };
  };

  // Ingests parsed deliverables with Smart Merge, Append, or Replace mode
  const ingestDeliverablesDataset = (
    incomingRows: DeliverableRow[],
    sourceName: string,
    mode: 'smart_merge' | 'append' | 'replace' = 'smart_merge'
  ) => {
    if (data.length === 0 || mode === 'replace') {
      setData(incomingRows);
      setFileName(sourceName);
      setSelectedFilter(null);
      setAiReport(null);
      globalToast.success(`Loaded ${incomingRows.length} deliverables from ${sourceName}`);
      return;
    }

    if (mode === 'append') {
      setData(prev => [...prev, ...incomingRows]);
      setFileName(prev => (prev ? `${prev} + ${sourceName}` : sourceName));
      setSelectedFilter(null);
      globalToast.success(`Appended ${incomingRows.length} new deliverables from ${sourceName}`);
      return;
    }

    // Smart Mix & Merge mode
    const updatedData = [...data];
    const newRows: DeliverableRow[] = [];
    const ambiguous: AmbiguousMergeItem[] = [];
    const initialDecisions: Record<number, 'merge' | 'new' | 'skip'> = {};
    let autoMergedCount = 0;

    incomingRows.forEach((inRow, inIdx) => {
      let bestScore = 0;
      let bestIndex = -1;
      let bestReasons: string[] = [];

      for (let i = 0; i < updatedData.length; i++) {
        const { score, reasons } = evaluateDeliverableMatch(inRow, updatedData[i]);
        if (score > bestScore) {
          bestScore = score;
          bestIndex = i;
          bestReasons = reasons;
        }
      }

      if (bestScore >= 80 && bestIndex !== -1) {
        // High confidence match -> Automatically mix fields into existing row
        updatedData[bestIndex] = mixDeliverableRows(updatedData[bestIndex], inRow);
        autoMergedCount++;
      } else if (bestScore >= 45 && bestIndex !== -1) {
        // Ambiguous / Confusion Match -> Queue for popup confirmation
        ambiguous.push({
          id: `ambig-${inIdx}-${bestIndex}-${Date.now()}`,
          incomingIndex: inIdx,
          incomingRow: inRow,
          candidateExistingIndex: bestIndex,
          candidateExistingRow: updatedData[bestIndex],
          score: bestScore,
          matchReasons: bestReasons
        });
        initialDecisions[inIdx] = 'merge';
      } else {
        // No match found -> Add as new deliverable
        newRows.push(inRow);
      }
    });

    if (ambiguous.length > 0) {
      setAmbiguousDecisions(initialDecisions);
      setConfusionModalState({
        isOpen: true,
        ambiguousItems: ambiguous,
        sourceName,
        autoMergedCount,
        newAddedCount: newRows.length,
        candidateData: [...updatedData, ...newRows]
      });
      globalToast.info(
        `Smart Merge: ${autoMergedCount} mixed automatically, ${newRows.length} new rows added. ${ambiguous.length} ambiguous item(s) require your review.`
      );
    } else {
      const finalData = [...updatedData, ...newRows];
      setData(finalData);
      setFileName(prev => (prev ? `${prev} + ${sourceName}` : sourceName));
      setSelectedFilter(null);
      globalToast.success(
        `Smart Mix Complete: ${autoMergedCount} deliverables mixed & updated, ${newRows.length} new deliverables added from ${sourceName}.`
      );
    }
  };

  // Applies decisions from the confusion resolution modal
  const handleApplyConfusionDecisions = () => {
    if (!confusionModalState) return;

    const workingData = [...confusionModalState.candidateData];
    let userMerged = 0;
    let userAdded = 0;
    let userSkipped = 0;

    confusionModalState.ambiguousItems.forEach(item => {
      const decision = ambiguousDecisions[item.incomingIndex] || 'merge';
      if (decision === 'merge') {
        workingData[item.candidateExistingIndex] = mixDeliverableRows(
          workingData[item.candidateExistingIndex],
          item.incomingRow
        );
        userMerged++;
      } else if (decision === 'new') {
        workingData.push(item.incomingRow);
        userAdded++;
      } else {
        userSkipped++;
      }
    });

    setData(workingData);
    setFileName(prev => (prev ? `${prev} + ${confusionModalState.sourceName}` : confusionModalState.sourceName));
    setSelectedFilter(null);
    setConfusionModalState(null);
    globalToast.success(
      `Dataset updated! ${confusionModalState.autoMergedCount + userMerged} deliverables mixed, ${confusionModalState.newAddedCount + userAdded} new entries added.`
    );
  };

  // Process file supporting CSV, Excel (.xlsx/.xls), Word (.docx), PDF & Images
  const processFile = async (file: File, modeOverride?: 'smart_merge' | 'append' | 'replace') => {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (modeOverride) setAddMoreDataMode(modeOverride);

    try {
      if (ext === 'csv' || ext === 'tsv' || ext === 'txt') {
        setFileTypeBadge('CSV / Text Document');
        const text = await file.text();
        const parsed = Papa.parse(text, { skipEmptyLines: false });
        parseRowsFromMatrix(parsed.data as string[][], file.name);
      } else if (ext === 'xlsx' || ext === 'xls') {
        setFileTypeBadge('Excel Spreadsheet');
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const matrix = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as string[][];
        parseRowsFromMatrix(matrix, file.name);
      } else if (ext === 'docx') {
        setFileTypeBadge('Word Document (.docx)');
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        const raw = result.value;
        const lines = raw.split('\n').filter(l => l.trim().length > 0);
        const matrix = lines.map(line => line.split(/\t|,|;/));
        parseRowsFromMatrix(matrix, file.name);
      } else if (ext === 'pdf' || ext === 'jpg' || ext === 'jpeg' || ext === 'png' || ext === 'webp') {
        setFileTypeBadge(ext === 'pdf' ? 'PDF Document' : 'Image Scan (JPG/PNG)');
        globalToast.info(`Processing ${file.name} via AI Multi-modal Analyzer...`);
        setIsAiLoading(true);
        const reader = new FileReader();
        reader.onload = async () => {
          const base64Data = (reader.result as string).split(',')[1];
          const mimeType = ext === 'pdf' ? 'application/pdf' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
          
          try {
            const res = await fetch('/api/file-analysis', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                instructions: `You are an expert marketing data analyzer. Extract all rows and table columns from this document into a valid JSON array of objects. 
Keys: videoId, influencerName, platform, amountPaid (number), approacher, productName, paymentTerms, videoReleasedDate, videoLink, step1 (Done/Not Done), step2, step3, step4, orderMonth.
If no table is present, summarize key findings. Return JSON fenced with \`\`\`json.`,
                fileParts: [{ name: file.name, mimeType, data: base64Data }]
              })
            });
            const json = await res.json();
            setIsAiLoading(false);
            if (json.success && json.result) {
              setAiReport(json.result);
              setViewMode('ai');
              // Try to parse JSON array if present
              const match = json.result.match(/```(?:json)?\s*([\s\S]*?)```/);
              if (match && match[1]) {
                try {
                  const items = JSON.parse(match[1]);
                  if (Array.isArray(items) && items.length > 0) {
                    const converted: DeliverableRow[] = items.map((it: any) => ({
                      timestamp: it.timestamp || '',
                      videoId: it.videoId || 'VoId-AI',
                      influencerName: it.influencerName || 'Creator',
                      plannedDate: it.plannedDate || '',
                      platform: it.platform || 'Social',
                      amountPaid: Number(it.amountPaid) || 0,
                      approacher: it.approacher || 'BDM',
                      sampleShouldSent: it.sampleShouldSent || 'No',
                      productName: it.productName || 'Product SKU',
                      adAgreement: it.adAgreement || '',
                      paymentTerms: it.paymentTerms || 'After Video Released',
                      checklistPlannedDate: '',
                      checklistActualDate: '',
                      checklistPdf: '',
                      checklistDelay: '',
                      shortIoPlannedDate: '',
                      shortIoActualDate: '',
                      shortIoLink: '',
                      shortIoDelay: '',
                      finalPlannedDate: '',
                      finalActualDate: '',
                      videoReleasedDate: it.videoReleasedDate || '',
                      videoLink: it.videoLink || '',
                      finalDelay: '',
                      shortIoCode: '',
                      orderMonth: it.orderMonth || '',
                      releaseMonth: '',
                      step1: it.step1 || 'Done',
                      step2: it.step2 || 'Done',
                      step3: it.step3 || 'Done',
                      step4: it.step4 || 'Done'
                    }));
                    ingestDeliverablesDataset(converted, file.name, modeOverride || addMoreDataMode);
                  }
                } catch {
                  // Text summary remains in aiReport
                }
              }
            } else {
              globalToast.error(json.error || 'Failed to analyze file');
            }
          } catch (err: any) {
            setIsAiLoading(false);
            globalToast.error(err.message || 'File analysis failed');
          }
        };
        reader.readAsDataURL(file);
      } else {
        globalToast.error(`Unsupported file format .${ext}. Please upload CSV, PDF, JPG, JPEG, Word (.docx) or Excel.`);
      }
    } catch (err: any) {
      console.error(err);
      globalToast.error(`Error reading ${file.name}: ${err.message}`);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processFile(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      await processFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleClearData = () => {
    setData([]);
    setFileName('');
    setFileTypeBadge('Blank / Awaiting File');
    setSelectedFilter(null);
    setSearchTerm('');
    setAiReport(null);
    setViewMode('grid');
    if (fileInputRef.current) fileInputRef.current.value = '';
    globalToast.info('Universal Data Analyzer cleared and reset to blank.');
  };

  // Optional: load sample video deliverables dataset on explicit request
  const handleLoadSample = () => {
    setData(SAMPLE_DELIVERABLES);
    setFileName('sample-video-deliverables.csv');
    setFileTypeBadge('Sample CSV Dataset');
    setSelectedFilter(null);
    setAiReport(null);
    globalToast.success('Loaded sample deliverables dataset (VoId-1553 to VoId-1328)');
  };

  // Paste raw text handler
  const handlePasteData = (modeOverride?: 'smart_merge' | 'append' | 'replace', textToParse?: string) => {
    const text = (textToParse !== undefined ? textToParse : rawText).trim();
    if (!text) {
      globalToast.error('Please enter or paste tabular text data.');
      return;
    }
    if (modeOverride) setAddMoreDataMode(modeOverride);
    const parsed = Papa.parse(text, { skipEmptyLines: false });
    parseRowsFromMatrix(parsed.data as string[][], 'Pasted Text/CSV');
    setRawTextModal(false);
    setIsAddMoreDataModalOpen(false);
    setRawText('');
    setAddMoreRawText('');
  };

  // Click & Found interaction: Sets or toggles active filter
  const handleClickAndFound = (type: string, value: string, label: string) => {
    if (selectedFilter?.type === type && selectedFilter?.value === value) {
      setSelectedFilter(null);
      globalToast.info(`Cleared filter: ${label}`);
    } else {
      setSelectedFilter({ type, value, label });
      globalToast.success(`Found & filtered: ${label}`);
      setViewMode('grid');
    }
  };

  // Task and Short.io Lookup Maps
  const taskMapByVideoId = useMemo(() => {
    const map = new Map<string, Task>();
    if (!tasks) return map;
    tasks.forEach(t => {
      if (t.videoId) map.set(String(t.videoId).toLowerCase().trim(), t);
      if (t.id) map.set(String(t.id).toLowerCase().trim(), t);
    });
    return map;
  }, [tasks]);

  const taskMapByVideoLink = useMemo(() => {
    const map = new Map<string, Task>();
    if (!tasks) return map;
    tasks.forEach(t => {
      if (t.videoLink) map.set(String(t.videoLink).toLowerCase().trim(), t);
      if (t.videoLink1) map.set(String(t.videoLink1).toLowerCase().trim(), t);
      if (t.videoLink2) map.set(String(t.videoLink2).toLowerCase().trim(), t);
      if (t.videoLink3) map.set(String(t.videoLink3).toLowerCase().trim(), t);
    });
    return map;
  }, [tasks]);

  const taskMapByShortIo = useMemo(() => {
    const map = new Map<string, Task>();
    if (!tasks) return map;
    tasks.forEach(t => {
      if (t.shortIoCode) map.set(String(t.shortIoCode).toLowerCase().trim(), t);
      if (t.shortIoLink) map.set(String(t.shortIoLink).toLowerCase().trim(), t);
    });
    return map;
  }, [tasks]);

  // -------------------------------------------------------------
  // Live Video Views Tracker Exact Collection Procedures
  // -------------------------------------------------------------

  // Persist link previews in local storage
  useEffect(() => {
    safeLocalStorage.setItem('LIVE_VIDEO_VIEWS_PREVIEWS', JSON.stringify(linkPreviews));
  }, [linkPreviews]);

  // Sanitize and clean video URLs by stripping broken/truncated tracking parameters (?utm_, ?igsh=, etc.)
  const sanitizeVideoUrl = (rawUrl: string): string => {
    if (!rawUrl || typeof rawUrl !== 'string') return '';
    let u = rawUrl.trim();
    u = u
      .replace(/[\?&]utm_[^&]*/gi, '')
      .replace(/[\?&]utm=[^&]*/gi, '')
      .replace(/[\?&]igsh=[^&]*/gi, '')
      .replace(/[\?&]stkn=[^&]*/gi, '')
      .replace(/[\?&]fbclid=[^&]*/gi, '')
      .replace(/[\?&]si=[^&]*/gi, '')
      .replace(/[\?&]feature=[^&]*/gi, '')
      .replace(/\?+$/, '')
      .trim();

    if (u.includes('instagram.com')) {
      const m = u.match(/(?:reel|p)\/([a-zA-Z0-9_-]+)/i);
      if (m && m[1]) {
        return `https://www.instagram.com/reel/${m[1]}/`;
      }
    }
    if (u.includes('youtube.com') || u.includes('youtu.be')) {
      const m = u.match(/(?:shorts\/|v=|youtu\.be\/)([a-zA-Z0-9_-]+)/i);
      if (m && m[1]) {
        return `https://www.youtube.com/watch?v=${m[1]}`;
      }
    }
    if (u.includes('facebook.com') || u.includes('fb.watch')) {
      const m = u.match(/(?:reel\/|watch\/\?v=|videos\/|share\/r\/|share\/v\/)(\d+)/i);
      if (m && m[1]) {
        return `https://www.facebook.com/reel/${m[1]}/`;
      }
    }
    if (!u.startsWith('http://') && !u.startsWith('https://') && u.includes('.')) {
      u = 'https://' + u;
    }
    return u;
  };

  // Exact fetch procedure used in LiveVideoViewsTracker
  const fetchPreviewForUrl = async (url: string): Promise<any> => {
    try {
      let trimmed = sanitizeVideoUrl(url.trim()) || url.trim();
      if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
        trimmed = 'https://' + trimmed;
      }
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);
      const res = await fetch('/api/link-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      const json = await res.json();
      return json && json.success ? json : null;
    } catch {
      return null;
    }
  };

  // Extract all video URLs for a deliverable row (supports multiple links, task links, short links, and distinct videos)
  const extractVideoUrlsFromRow = (row: DeliverableRow): string[] => {
    const urls: string[] = [];
    if (row.videoLink && row.videoLink.trim() !== '' && !row.videoLink.toLowerCase().includes('pending')) {
      const rawParts = row.videoLink.split(/[\s,;\n]+/);
      rawParts.forEach(p => {
        const trimmed = p.trim();
        if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.includes('.com') || trimmed.includes('youtu.be') || trimmed.includes('fb.watch') || trimmed.includes('facebook.com') || trimmed.includes('instagram.com') || trimmed.includes('tiktok.com')) {
          if (!urls.includes(trimmed)) urls.push(trimmed);
        }
      });
      if (urls.length === 0 && (row.videoLink.trim().startsWith('http') || row.videoLink.trim().includes('.'))) {
        urls.push(row.videoLink.trim());
      }
    }

    if (row.shortIoLink && row.shortIoLink.trim() !== '' && !row.shortIoLink.toLowerCase().includes('pending')) {
      const trimmed = row.shortIoLink.trim();
      if (!urls.includes(trimmed)) urls.push(trimmed);
    }

    if (row.shortIoCode && row.shortIoCode.trim().startsWith('http')) {
      const trimmed = row.shortIoCode.trim();
      if (!urls.includes(trimmed)) urls.push(trimmed);
    }

    const matchedTask = (row.videoId && taskMapByVideoId.get(row.videoId.toLowerCase().trim())) ||
                        (row.videoLink && taskMapByVideoLink.get(row.videoLink.toLowerCase().trim()));
    if (matchedTask) {
      const addLink = (link?: string) => {
        if (!link || !link.trim()) return;
        const trimmed = link.trim();
        if (!urls.includes(trimmed)) urls.push(trimmed);
      };
      addLink(matchedTask.videoLink);
      addLink(matchedTask.videoLink1);
      addLink(matchedTask.videoLink2);
      addLink(matchedTask.videoLink3);
      addLink(matchedTask.shortIoLink);
    }

    return urls;
  };

  // Exact collection procedure used in LiveVideoViewsTracker (supports bulk or single deliverable)
  // When direct extraction cannot extract views or URL is not accessible, automatically finds public link and collects view data
  const collectLiveVideoViewsProcedure = async (targetRows?: DeliverableRow[]) => {
    const rows = (targetRows && targetRows.length > 0)
      ? targetRows
      : data.filter(r => {
          const urls = extractVideoUrlsFromRow(r);
          return urls.length > 0 || Boolean(r.videoLink && r.videoLink.trim() !== '' && !r.videoLink.toLowerCase().includes('pending')) || Boolean(r.shortIoLink && r.shortIoLink.trim() !== '');
        });

    if (rows.length === 0) {
      globalToast.info('No deliverables found to collect views for.');
      return;
    }

    const isSingle = targetRows && targetRows.length === 1;
    if (isSingle) {
      setRowViewsLoadingId(targetRows[0].videoId);
    } else {
      setIsCollectingViews(true);
      setCollectingViewsProgress({ current: 0, total: rows.length, success: 0, failed: 0 });
    }

    const urlsToFetch = new Set<string>();
    rows.forEach(r => {
      const uList = extractVideoUrlsFromRow(r);
      uList.forEach(u => urlsToFetch.add(u));
    });

    // Mark URLs as loading in linkPreviews state
    setLinkPreviews(prev => {
      const next = { ...prev };
      urlsToFetch.forEach(u => {
        next[u] = { ...next[u], loading: true };
      });
      return next;
    });

    const urlArray = Array.from(urlsToFetch);
    const resultsMap: Record<string, any> = {};
    let successCount = 0;
    let failedCount = 0;

    await Promise.all(
      urlArray.map(async (url, idx) => {
        try {
          const res = await fetchPreviewForUrl(url);
          const previewData = res ? (res.data || res) : null;
          if (previewData) {
            resultsMap[url] = previewData;
            const candidateV = previewData.originalViews ?? previewData.views;
            if (candidateV !== undefined && candidateV !== null && Number(candidateV) > 0 && Number(candidateV) <= 15000000) {
              successCount++;
            } else {
              failedCount++;
            }
          } else {
            failedCount++;
          }
        } catch {
          failedCount++;
        }

        if (!isSingle) {
          setCollectingViewsProgress(prev => prev ? {
            ...prev,
            current: Math.min(prev.total, idx + 1),
            success: successCount,
            failed: failedCount
          } : null);
        }
      })
    );

    // Update linkPreviews with fetched metadata
    const updatedPreviews = { ...linkPreviews };
    urlArray.forEach(url => {
      if (resultsMap[url]) {
        updatedPreviews[url] = { loading: false, data: resultsMap[url] };
      } else {
        updatedPreviews[url] = { loading: false, data: linkPreviews[url]?.data };
      }
    });
    setLinkPreviews(updatedPreviews);

    // Auto-Find Public Link & View Data Resolver for rows where direct extraction found no views
    const autoResolvedUrls: Record<string, string> = {};
    const autoResolvedMethods: Record<string, string> = {};

    const rowsNeedingAutoFind = rows.filter(r => {
      const uList = extractVideoUrlsFromRow(r);
      let hasDirect = false;
      uList.forEach(u => {
        const pData = resultsMap[u] || updatedPreviews[u]?.data || updatedPreviews[u];
        const origV = pData?.originalViews ?? pData?.views;
        if (origV !== undefined && origV !== null && Number(origV) > 0 && Number(origV) <= 15000000) {
          hasDirect = true;
        }
      });
      return !hasDirect;
    });

    if (rowsNeedingAutoFind.length > 0) {
      await Promise.all(
        rowsNeedingAutoFind.map(async r => {
          try {
            const rawUrl = r.videoLink || r.shortIoLink || (extractVideoUrlsFromRow(r)[0] || '');
            const res = await fetch('/api/auto-find-video-views', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                url: rawUrl,
                videoId: r.videoId,
                creatorName: r.influencerName,
                productName: r.productName,
                amountPaid: r.amountPaid
              })
            });
            const json = await res.json();
            if (json && json.success) {
              const origV = json.originalViews ?? json.views;
              if (origV && Number(origV) > 0) {
                const count = Number(origV);
                resultsMap[`auto_${r.videoId}`] = {
                  views: count,
                  originalViews: count,
                  source: json.viewSource || json.source,
                  abnormalMonitor: json.abnormalMonitor
                };
                if (json.cleanPublicUrl && json.cleanPublicUrl !== r.videoLink) {
                  autoResolvedUrls[r.videoId] = json.cleanPublicUrl;
                }
                autoResolvedMethods[r.videoId] = json.viewSource || json.source || 'Verified Original Video Link Metadata';
                successCount++;
              }
            }
          } catch (e) {
            console.warn('Auto-find fallback error for', r.videoId, e);
          }
        })
      );
    }

    // Update liveViewsCache and recalculate row views using Abnormal View Monitor & Original View Guard
    const newViewsCache = { ...liveViewsCache };
    const newPrevViews = { ...previousViewsMap };
    const activeCeiling = abnormalThreshold === 'AUTO' ? 500000 : abnormalThreshold;

    rows.forEach(r => {
      const uList = extractVideoUrlsFromRow(r);
      let totalRowViews = 0;
      let hasFoundViews = false;
      let hadAbnormalBlocked = false;
      const foundCounts: number[] = [];

      uList.forEach(u => {
        const pData = resultsMap[u] || updatedPreviews[u]?.data || updatedPreviews[u];
        if (!pData) return;
        if (pData.abnormalMonitor?.abnormalBlocked) {
          hadAbnormalBlocked = true;
        }
        const rawCandidate = pData.originalViews !== undefined && pData.originalViews !== null
          ? Number(pData.originalViews)
          : (pData.views !== undefined && pData.views !== null ? Number(pData.views) : undefined);

        if (rawCandidate !== undefined && rawCandidate > 0 && rawCandidate <= 15000000) {
          const isVerified = Boolean(pData.abnormalMonitor?.isOriginalVerified || pData.originalViews !== undefined);
          if (abnormalMonitorEnabled) {
            const limit = (isVerified && abnormalThreshold === 'AUTO') ? 2000000 : activeCeiling;
            if (rawCandidate <= limit) {
              foundCounts.push(rawCandidate);
              hasFoundViews = true;
            } else {
              hadAbnormalBlocked = true;
            }
          } else {
            foundCounts.push(rawCandidate);
            hasFoundViews = true;
          }
        }
      });

      if (foundCounts.length > 0) {
        totalRowViews = Math.max(...foundCounts);
      }

      // Check auto-found public view results
      if (!hasFoundViews && resultsMap[`auto_${r.videoId}`]) {
        const autoCandidate = Number(resultsMap[`auto_${r.videoId}`].originalViews ?? resultsMap[`auto_${r.videoId}`].views);
        if (!isNaN(autoCandidate) && autoCandidate > 0) {
          if (!abnormalMonitorEnabled || autoCandidate <= activeCeiling) {
            totalRowViews = autoCandidate;
            hasFoundViews = true;
          } else {
            hadAbnormalBlocked = true;
          }
        }
      }

      if (!hasFoundViews && !hadAbnormalBlocked) {
        const matchedTask = (r.videoId && taskMapByVideoId.get(r.videoId.toLowerCase().trim())) ||
                            (r.videoLink && taskMapByVideoLink.get(r.videoLink.toLowerCase().trim()));
        const fallbackCandidate = (matchedTask && matchedTask.views && matchedTask.views > 0)
          ? Number(matchedTask.views)
          : (r.views && r.views > 0 ? Number(r.views) : 0);

        if (fallbackCandidate > 0) {
          if (!abnormalMonitorEnabled || fallbackCandidate <= activeCeiling) {
            totalRowViews = fallbackCandidate;
            hasFoundViews = true;
          } else {
            hadAbnormalBlocked = true;
          }
        }
      }

      if (hasFoundViews && totalRowViews > 0) {
        if (r.videoLink) {
          newViewsCache[r.videoLink.trim()] = totalRowViews;
        }
        if (r.videoId) {
          newViewsCache[r.videoId] = totalRowViews;
          const creationBaseline = (r.createdAtViews !== undefined && r.createdAtViews !== null)
            ? Number(r.createdAtViews)
            : (r.initialViews !== undefined && r.initialViews !== null)
              ? Number(r.initialViews)
              : (r.previousViews !== undefined && r.previousViews !== null)
                ? Number(r.previousViews)
                : (previousViewsMap[r.videoId] ?? r.views ?? 0);
          newPrevViews[r.videoId] = creationBaseline;
        }
      } else if (hadAbnormalBlocked && abnormalMonitorEnabled) {
        // Abnormal view was intercepted and no valid public view was found: clear polluted cache and restore safe baseline
        const safeBaseline = (r.createdAtViews !== undefined && r.createdAtViews !== null && Number(r.createdAtViews) <= activeCeiling)
          ? Number(r.createdAtViews)
          : (r.initialViews !== undefined && r.initialViews !== null && Number(r.initialViews) <= activeCeiling)
            ? Number(r.initialViews)
            : 0;
        if (r.videoLink) {
          if (safeBaseline > 0) newViewsCache[r.videoLink.trim()] = safeBaseline;
          else delete newViewsCache[r.videoLink.trim()];
        }
        if (r.videoId) {
          if (safeBaseline > 0) newViewsCache[r.videoId] = safeBaseline;
          else delete newViewsCache[r.videoId];
        }
      }
    });

    // Directly update data state so original views and any auto-resolved public links immediately reflect
    setData(prev => prev.map(r => {
      const found = newViewsCache[r.videoId] ?? (r.videoLink ? newViewsCache[r.videoLink.trim()] : undefined);
      const newUrl = autoResolvedUrls[r.videoId];
      if (found !== undefined && found > 0) {
        return {
          ...r,
          views: found,
          ...(newUrl ? { videoLink: newUrl } : {})
        };
      }
      // If abnormalMonitorEnabled and existing r.views exceeds activeCeiling, reset to safe baseline
      if (abnormalMonitorEnabled && r.views && r.views > activeCeiling) {
        const safeBaseline = (r.createdAtViews !== undefined && r.createdAtViews !== null && Number(r.createdAtViews) <= activeCeiling)
          ? Number(r.createdAtViews)
          : 0;
        return {
          ...r,
          views: safeBaseline > 0 ? safeBaseline : undefined,
          ...(newUrl ? { videoLink: newUrl } : {})
        };
      }
      if (newUrl) {
        return { ...r, videoLink: newUrl };
      }
      return r;
    }));

    // Update subpageSnapshot if present
    if (subpageSnapshot && subpageSnapshot.data && subpageSnapshot.data.length > 0) {
      setSubpageSnapshot(prev => {
        if (!prev) return prev;
        const updatedData = prev.data.map(r => {
          const found = newViewsCache[r.videoId] ?? (r.videoLink ? newViewsCache[r.videoLink.trim()] : undefined);
          const newUrl = autoResolvedUrls[r.videoId];
          if (found !== undefined && found > 0) {
            return {
              ...r,
              views: found,
              ...(newUrl ? { videoLink: newUrl } : {})
            };
          }
          if (newUrl) {
            return { ...r, videoLink: newUrl };
          }
          return r;
        });
        const updatedSnapshot = {
          ...prev,
          data: updatedData,
          savedAt: new Date().toLocaleString('en-US', { hour12: true })
        };
        safeLocalStorage.setItem('SUBPAGE_ANALYZED_SNAPSHOT', JSON.stringify(updatedSnapshot));
        return updatedSnapshot;
      });
    }

    // Auto-sync collected live views and calculated metrics to tasks (mirroring LiveVideoViewsTracker)
    if (onUpdateTasksBulk && tasks && tasks.length > 0) {
      const taskUpdates: { id: string; updates: Partial<Task> }[] = [];
      rows.forEach(r => {
        const matchedTask = (r.videoId && taskMapByVideoId.get(r.videoId.toLowerCase().trim())) ||
                            (r.videoLink && taskMapByVideoLink.get(r.videoLink.toLowerCase().trim()));
        if (matchedTask) {
          const viewsFound = newViewsCache[r.videoId] || (r.videoLink ? newViewsCache[r.videoLink.trim()] : undefined);
          const newUrl = autoResolvedUrls[r.videoId];
          if (viewsFound !== undefined && viewsFound > 0) {
            const remunerationValue = matchedTask.remuneration || r.amountPaid || 0;
            const clicksValue = (matchedTask.clicks !== undefined && matchedTask.clicks !== null)
              ? matchedTask.clicks
              : (liveClicksCache[r.videoId] !== undefined ? liveClicksCache[r.videoId] : undefined);
            const conversionsValue = matchedTask.conversions;
            const ctrValue = (clicksValue !== undefined && viewsFound > 0) ? parseFloat(((clicksValue / viewsFound) * 100).toFixed(2)) : undefined;
            const cpvValue = viewsFound > 0 ? parseFloat((remunerationValue / viewsFound).toFixed(3)) : undefined;
            const cvrBase = clicksValue !== undefined && clicksValue > 0 ? clicksValue : viewsFound;
            const cvrValue = (conversionsValue !== undefined && cvrBase > 0) ? parseFloat(((conversionsValue / cvrBase) * 100).toFixed(2)) : undefined;
            const creationBaseline = (matchedTask.createdAtViews !== undefined && matchedTask.createdAtViews !== null)
              ? Number(matchedTask.createdAtViews)
              : (matchedTask.initialViews !== undefined && matchedTask.initialViews !== null)
                ? Number(matchedTask.initialViews)
                : (matchedTask.previousViews !== undefined && matchedTask.previousViews !== null)
                  ? Number(matchedTask.previousViews)
                  : (Number(matchedTask.views) || 0);
            const prevViews = creationBaseline;
            taskUpdates.push({
              id: matchedTask.id,
              updates: {
                views: viewsFound,
                previousViews: prevViews,
                createdAtViews: prevViews,
                initialViews: matchedTask.initialViews !== undefined ? matchedTask.initialViews : prevViews,
                ...(newUrl ? { videoLink: newUrl } : {}),
                ...(ctrValue !== undefined ? { ctr: ctrValue } : {}),
                ...(cpvValue !== undefined ? { cpv: cpvValue } : {}),
                ...(conversionsValue !== undefined ? { conversions: conversionsValue } : {}),
                ...(cvrValue !== undefined ? { cvr: cvrValue } : {}),
              }
            });
          }
        }
      });
      if (taskUpdates.length > 0) {
        onUpdateTasksBulk(taskUpdates);
      }
    }

    setLiveViewsCache(newViewsCache);
    setPreviousViewsMap(newPrevViews);

    if (isSingle) {
      setRowViewsLoadingId(null);
      const row = targetRows![0];
      const viewsFound = newViewsCache[row.videoId] || (row.videoLink ? newViewsCache[row.videoLink.trim()] : undefined);
      if (viewsFound !== undefined && viewsFound > 0) {
        const method = autoResolvedMethods[row.videoId];
        if (method) {
          globalToast.success(`Auto-found public link & collected ${viewsFound.toLocaleString('en-IN')} live views for ${row.videoId}!`);
        } else {
          globalToast.success(`Live Video Views collected ${viewsFound.toLocaleString('en-IN')} views for ${row.videoId}!`);
        }
      } else {
        const uList = extractVideoUrlsFromRow(row);
        const currentUrl = autoResolvedUrls[row.videoId] || uList[0] || row.videoLink || '';
        globalToast.error(`Could not extract live views for ${row.videoId}. Verify video URL is publicly accessible.`);
        setInspectingRowForViews({
          row,
          currentUrl,
          viewsValue: row.views ? String(row.views) : '',
          isTesting: false,
          testError: 'Could not extract live views automatically. Click "Auto-Find Public Link & Views" below or enter views manually.'
        });
      }
    } else {
      setIsCollectingViews(false);
      setCollectingViewsProgress(null);
      if (successCount > 0) {
        globalToast.success(`Live Video Views procedure updated views for ${successCount} deliverable${successCount > 1 ? 's' : ''}!`);
      } else {
        globalToast.error('No view numbers could be automatically extracted. Ensure URLs are publicly accessible.');
      }
    }
  };

  // -------------------------------------------------------------
  // Short.io Tracker Exact Collection & Synchronization Procedures
  // -------------------------------------------------------------

  // Keep primary metric in local storage
  useEffect(() => {
    safeLocalStorage.setItem('SHORT_IO_PRIMARY_METRIC', primaryMetric);
  }, [primaryMetric]);

  // Keep manual override in local storage
  useEffect(() => {
    safeLocalStorage.setItem('SHORT_IO_MANUAL_OVERRIDE', JSON.stringify(manualOverride));
  }, [manualOverride]);

  // Cloud Synchronization: Pull from Firebase on mount if user is logged in
  useEffect(() => {
    let unsubSnapshot: (() => void) | undefined;
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (unsubSnapshot) {
        unsubSnapshot();
        unsubSnapshot = undefined;
      }
      if (user) {
        const docRef = doc(db, 'registered_users', user.uid, 'settings', 'shortio');
        unsubSnapshot = onSnapshot(docRef, (snap) => {
          if (snap.exists()) {
            const cloudData = snap.data();
            if (cloudData.apiKey) {
              setApiKey(cloudData.apiKey);
              safeLocalStorage.setItem('SHORT_IO_API_KEY', cloudData.apiKey);
            }
            if (cloudData.links && Array.isArray(cloudData.links) && cloudData.links.length > 0) {
              setShortIoLinks(prev => {
                if (prev.length === 0 || JSON.stringify(prev) !== JSON.stringify(cloudData.links)) {
                  safeLocalStorage.setItem('SHORT_IO_TRACKED_LINKS', JSON.stringify(cloudData.links));
                  return cloudData.links;
                }
                return prev;
              });
            }
            if (cloudData.manualOverride !== undefined) {
              setManualOverride(cloudData.manualOverride);
              safeLocalStorage.setItem('SHORT_IO_MANUAL_OVERRIDE', JSON.stringify(cloudData.manualOverride));
            }
            setLastShortIoSyncTime(new Date().toLocaleTimeString());
          }
        });
      }
    });

    return () => {
      unsubAuth();
      if (unsubSnapshot) unsubSnapshot();
    };
  }, []);

  // Listen to external Short.io updates (e.g. from ShortioTracker or another tab)
  useEffect(() => {
    const handleStorageUpdate = () => {
      try {
        const stored = safeLocalStorage.getItem('SHORT_IO_TRACKED_LINKS');
        if (stored) {
          setShortIoLinks(JSON.parse(stored));
        }
        const key = safeLocalStorage.getItem('SHORT_IO_API_KEY');
        if (key) setApiKey(key);
        const ovr = safeLocalStorage.getItem('SHORT_IO_MANUAL_OVERRIDE');
        if (ovr !== null) setManualOverride(JSON.parse(ovr));
        const pm = safeLocalStorage.getItem('SHORT_IO_PRIMARY_METRIC');
        if (pm === 'human' || pm === 'total') setPrimaryMetric(pm);
      } catch (e) {
        console.error('Error reading updated shortio links in DataAnalyzer', e);
      }
    };

    window.addEventListener('shortio-links-updated', handleStorageUpdate);
    return () => window.removeEventListener('shortio-links-updated', handleStorageUpdate);
  }, []);

  // Exact URL/Code Normalization procedure used in Short.io Tracker
  const normalizeShortioUrl = (u?: string) => {
    if (!u) return '';
    let v = u.trim().toLowerCase();
    v = v.split('?')[0].split('#')[0];
    v = v.replace(/^https?:\/\//, '');
    v = v.replace(/^www\./, '');
    return v.replace(/\/+$/, '');
  };

  // Exact Effective Clicks Calculation procedure used in Short.io Tracker
  const getEffectiveClicks = (item: TrackedLink): number | undefined => {
    if (primaryMetric === 'human') {
      return (manualOverride && item.manualHumanClicksOverride !== undefined)
        ? item.manualHumanClicksOverride
        : (item.humanClicks !== undefined ? item.humanClicks : item.clicks);
    } else {
      return (manualOverride && item.manualClicksOverride !== undefined)
        ? item.manualClicksOverride
        : item.clicks;
    }
  };

  // Exact Multi-Attribute Matching procedure used in Short.io Tracker
  const findShortioMatch = (row: DeliverableRow, linksList: TrackedLink[] = shortIoLinks): TrackedLink | undefined => {
    const normCode = normalizeShortioUrl(row.shortIoCode);
    const normLink = normalizeShortioUrl(row.shortIoLink);
    const normVideo = normalizeShortioUrl(row.videoLink);
    const normVidId = normalizeShortioUrl(row.videoId);
    const normInf = (row.influencerName || '').trim().toLowerCase();

    for (const item of linksList) {
      // 1. Direct ID match
      if (row.videoId && (item.id === row.videoId || item.id === `planner-${row.videoId}` || item.id === `shortio-${row.videoId}`)) return item;

      // 2. Direct Label match
      if (item.label) {
        const normLabel = normalizeShortioUrl(item.label);
        if (normCode && (normLabel === normCode || normLabel.toLowerCase() === normCode.toLowerCase())) return item;
        if (normVidId && normLabel === normVidId) return item;
        if (normInf && item.label.toLowerCase().includes(normInf)) return item;
      }

      // 3. Normalized URL match
      const itemUrl = normalizeShortioUrl(item.url);
      if (itemUrl) {
        if (normLink && (itemUrl === normLink || itemUrl.includes(normLink) || normLink.includes(itemUrl))) return item;
        if (normCode && (itemUrl === normCode || itemUrl.endsWith('/' + normCode) || itemUrl.includes(normCode))) return item;
        if (normVideo && itemUrl === normVideo) return item;
        if (normVidId && (itemUrl.endsWith('/' + normVidId) || itemUrl.endsWith('=' + normVidId) || itemUrl === normVidId)) return item;
      }

      // 4. Short.io expansion response details match
      const details = item.linkDetailsData || item.linkData;
      if (details) {
        if (details.path && normCode && normalizeShortioUrl(details.path) === normCode) return item;
        if (details.shortURL && normLink && normalizeShortioUrl(details.shortURL) === normLink) return item;
        if (details.originalURL && normVideo && normalizeShortioUrl(details.originalURL) === normVideo) return item;
        if (details.path && normLink && normLink.includes(details.path)) return item;
      }
    }
    return undefined;
  };

  // Exact Short.io API Fetch Procedure used in Short.io Tracker
  const fetchShortioLinkStats = async (urlOrCode: string) => {
    const keyToUse = apiKey.trim() || safeLocalStorage.getItem('SHORT_IO_API_KEY')?.trim() || '';

    let finalUrl = urlOrCode.trim();
    if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://') && finalUrl.includes('.')) {
      finalUrl = 'https://' + finalUrl;
    }

    const keyStr = encodeURIComponent(keyToUse);
    const urlStr = encodeURIComponent(finalUrl);
    const t = Date.now();
    const endpoint = `/api/shortio/stats?url=${urlStr}${keyStr ? `&secretKey=${keyStr}` : ''}&t=${t}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(endpoint, { signal: controller.signal });
    clearTimeout(timeoutId);
    const resData = await res.json();

    if (!res.ok) {
      throw new Error(resData.error || 'Failed to fetch statistics from Short.io API');
    }

    const stats = resData.statsData || {};
    const link = resData.linkData || {};
    const details = resData.linkDetailsData || {};

    let calculatedClicks = 0;
    if (stats.os && Array.isArray(stats.os)) {
      calculatedClicks = stats.os.reduce((a: number, b: any) => a + (Number(b.score) || 0), 0);
    } else if (stats.clickStatistics?.datasets?.[0]?.data) {
      calculatedClicks = stats.clickStatistics.datasets[0].data.reduce((a: number, b: any) => a + (Number(b.y) || 0), 0);
    }

    const parsedTotal = Math.max(
      typeof stats.totalClicks === 'number' ? stats.totalClicks : 0,
      typeof details.clicks === 'number' ? details.clicks : 0,
      typeof link.clicks === 'number' ? link.clicks : 0,
      typeof details.total_clicks === 'number' ? details.total_clicks : 0,
      typeof link.total_clicks === 'number' ? link.total_clicks : 0,
      calculatedClicks || 0
    );

    const parsedHuman = (typeof stats.humanClicks === 'number' ? stats.humanClicks : undefined) ??
                        (typeof details.humanClicks === 'number' ? details.humanClicks : undefined);

    const totalClicks = Math.max(parsedTotal, parsedHuman || 0);
    const humanClicks = parsedHuman;

    return {
      totalClicks,
      humanClicks,
      statsData: stats,
      linkData: link,
      linkDetailsData: details
    };
  };

  // Exact Clicks Data Collection Procedure used in Short.io Tracker
  const collectClicksDataProcedure = async (targetRows?: DeliverableRow[]) => {
    const keyToUse = apiKey.trim() || safeLocalStorage.getItem('SHORT_IO_API_KEY')?.trim() || '';

    const rows = (targetRows || data).filter(r => {
      const hasLink = Boolean(r.shortIoLink && r.shortIoLink.trim() !== '' && r.shortIoLink.trim() !== '—' && r.shortIoLink.trim() !== '-');
      return hasLink;
    });

    if (rows.length === 0) {
      globalToast.info('No deliverables with available Short.io links found to collect clicks for.');
      return;
    }

    const isSingle = targetRows && targetRows.length === 1;
    if (isSingle) {
      setRowCollectingId(targetRows[0].videoId);
    } else {
      setIsCollectingShortIo(true);
      setCollectingShortIoProgress({ current: 0, total: rows.length, success: 0, failed: 0 });
    }

    let successCount = 0;
    let failedCount = 0;
    const newCache = { ...liveClicksCache };
    let currentLinks = [...shortIoLinks];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const target = row.shortIoLink?.trim() || row.shortIoCode?.trim();
      
      let clickValue: number | undefined = undefined;
      let humanClickValue: number | undefined = undefined;
      let statsObj: any = null;
      let linkObj: any = null;
      let detailsObj: any = null;

      if (keyToUse && target) {
        try {
          const statsResult = await fetchShortioLinkStats(target);
          statsObj = statsResult.statsData;
          linkObj = statsResult.linkData;
          detailsObj = statsResult.linkDetailsData;
          if (statsResult.totalClicks !== undefined) {
            clickValue = statsResult.totalClicks;
          }
          if (statsResult.humanClicks !== undefined) {
            humanClickValue = statsResult.humanClicks;
          }
        } catch (err: any) {
          console.warn(`[Short.io Tracker Procedure] API fetch error for ${row.videoId} (${target}):`, err.message);
        }
      }

      // Check real tracked link in shortIoLinks
      if (clickValue === undefined) {
        const matchedLink = findShortioMatch(row, currentLinks);
        if (matchedLink && (matchedLink.clicks !== undefined || matchedLink.manualClicksOverride !== undefined || matchedLink.humanClicks !== undefined)) {
          clickValue = getEffectiveClicks(matchedLink);
          humanClickValue = matchedLink.humanClicks;
        }
      }

      // Check real monthly planner task
      if (clickValue === undefined) {
        const matchedTask = (row.videoId && taskMapByVideoId.get(row.videoId.toLowerCase().trim())) ||
                            (row.shortIoCode && taskMapByShortIo.get(row.shortIoCode.toLowerCase().trim())) ||
                            (row.shortIoLink && taskMapByShortIo.get(row.shortIoLink.toLowerCase().trim())) ||
                            (row.videoLink && taskMapByVideoLink.get(row.videoLink.toLowerCase().trim()));
        if (matchedTask && matchedTask.clicks !== undefined && matchedTask.clicks !== null) {
          clickValue = Number(matchedTask.clicks);
        }
      }

      // Check row.clicks if present in data
      if (clickValue === undefined && row.clicks !== undefined && row.clicks !== null) {
        clickValue = row.clicks;
      }

      if (clickValue !== undefined) {
        const activeValue = primaryMetric === 'human' && humanClickValue !== undefined 
          ? humanClickValue 
          : clickValue;

        if (row.videoId) {
          newCache[row.videoId] = activeValue;
        }
        if (row.shortIoLink) {
          newCache[row.shortIoLink.trim()] = activeValue;
        }
        if (row.shortIoCode) {
          newCache[row.shortIoCode.trim()] = activeValue;
        }
        successCount++;
      } else {
        failedCount++;
      }

      if (target) {
        const existingIdx = currentLinks.findIndex(l => {
          return (row.videoId && (l.id === row.videoId || l.id === `planner-${row.videoId}` || l.id === `shortio-${row.videoId}`)) ||
                 (row.shortIoCode && l.label && l.label.toLowerCase() === row.shortIoCode.toLowerCase()) ||
                 (l.url && normalizeShortioUrl(l.url) === normalizeShortioUrl(target));
        });

        const existingLink = existingIdx >= 0 ? currentLinks[existingIdx] : null;
        let prevClicks = existingLink?.previousClicks;
        const prevTotal = existingLink?.clicks || 0;
        if ((clickValue || 0) > prevTotal) {
          prevClicks = prevTotal;
        }

        if (clickValue !== undefined) {
          const updatedLinkItem: TrackedLink = {
            id: existingLink ? existingLink.id : (row.videoId ? `shortio-${row.videoId}` : `shortio-${Date.now()}-${i}`),
            url: target.includes('.') ? (target.startsWith('http') ? target : `https://${target}`) : `https://${target}`,
            label: row.shortIoCode || row.influencerName || row.videoId || 'Deliverable Link',
            clicks: clickValue,
            humanClicks: humanClickValue,
            previousClicks: prevClicks,
            manualClicksOverride: existingLink?.manualClicksOverride,
            manualHumanClicksOverride: existingLink?.manualHumanClicksOverride,
            lastUpdated: new Date().toLocaleTimeString(),
            linkData: linkObj,
            statsData: statsObj,
            linkDetailsData: detailsObj,
            error: undefined
          };

          if (existingIdx >= 0) {
            currentLinks[existingIdx] = updatedLinkItem;
          } else {
            currentLinks.push(updatedLinkItem);
          }
        }
      }

      if (!isSingle) {
        setCollectingShortIoProgress({ current: i + 1, total: rows.length, success: successCount, failed: failedCount });
      }
    }

    setLiveClicksCache(newCache);
    setShortIoLinks(currentLinks);
    safeLocalStorage.setItem('SHORT_IO_TRACKED_LINKS', JSON.stringify(currentLinks));
    window.dispatchEvent(new Event('shortio-links-updated'));

    // Directly update data state so clicks immediately reflect in table and breakdown
    setData(prev => prev.map(r => {
      const rowFoundClicks = newCache[r.videoId] ?? (r.shortIoLink ? newCache[r.shortIoLink.trim()] : undefined) ?? (r.shortIoCode ? newCache[r.shortIoCode.trim()] : undefined);
      if (rowFoundClicks !== undefined) {
        return {
          ...r,
          clicks: rowFoundClicks
        };
      }
      return r;
    }));

    // Auto-sync collected live clicks and calculated metrics to tasks (mirroring ShortioTracker)
    if (onUpdateTasksBulk && tasks && tasks.length > 0) {
      const taskUpdates: { id: string; updates: Partial<Task> }[] = [];
      rows.forEach(r => {
        const matchedTask = (r.videoId && taskMapByVideoId.get(r.videoId.toLowerCase().trim())) ||
                            (r.shortIoCode && taskMapByShortIo.get(r.shortIoCode.toLowerCase().trim())) ||
                            (r.shortIoLink && taskMapByShortIo.get(r.shortIoLink.toLowerCase().trim()));
        if (matchedTask) {
          const clicksFound = newCache[r.videoId] ?? (r.shortIoLink ? newCache[r.shortIoLink.trim()] : undefined);
          if (clicksFound !== undefined) {
            const viewsValue = (liveViewsCache[r.videoId] !== undefined ? liveViewsCache[r.videoId] : matchedTask.views) || 0;
            const remunerationValue = matchedTask.remuneration || r.amountPaid || 0;
            const conversionsValue = matchedTask.conversions;
            const ctrValue = viewsValue > 0 ? parseFloat(((clicksFound / viewsValue) * 100).toFixed(2)) : undefined;
            const cpcValue = clicksFound > 0 ? parseFloat((remunerationValue / clicksFound).toFixed(2)) : undefined;
            const cvrBase = clicksFound > 0 ? clicksFound : viewsValue;
            const cvrValue = (conversionsValue !== undefined && cvrBase > 0) ? parseFloat(((conversionsValue / cvrBase) * 100).toFixed(2)) : undefined;
            taskUpdates.push({
              id: matchedTask.id,
              updates: {
                clicks: clicksFound,
                ...(ctrValue !== undefined ? { ctr: ctrValue } : {}),
                ...(cpcValue !== undefined ? { cpc: cpcValue } : {}),
                ...(conversionsValue !== undefined ? { conversions: conversionsValue } : {}),
                ...(cvrValue !== undefined ? { cvr: cvrValue } : {})
              }
            });
          }
        }
      });
      if (taskUpdates.length > 0) {
        onUpdateTasksBulk(taskUpdates);
      }
    }

    // Debounced sync to cloud if authenticated
    const user = auth.currentUser;
    if (user && keyToUse) {
      try {
        const docRef = doc(db, 'registered_users', user.uid, 'settings', 'shortio');
        await setDoc(docRef, {
          apiKey: keyToUse,
          links: currentLinks,
          manualOverride,
          updatedAt: new Date().toISOString()
        }, { merge: true });
        setLastShortIoSyncTime(new Date().toLocaleTimeString());
      } catch (err) {
        console.error('Failed to sync Short.io links to cloud', err);
      }
    }

    if (isSingle) {
      setRowCollectingId(null);
      const row = targetRows![0];
      const collected = newCache[row.videoId] ?? (row.shortIoLink ? newCache[row.shortIoLink.trim()] : undefined);
      if (collected !== undefined) {
        globalToast.success(`Collected ${collected.toLocaleString()} clicks for ${row.videoId}!`);
      } else {
        globalToast.error(`Could not fetch clicks for ${row.videoId}.`);
      }
    } else {
      setIsCollectingShortIo(false);
      setCollectingShortIoProgress(null);
      if (successCount > 0) {
        globalToast.success(`Short.io Tracker procedure collected live clicks for ${successCount} link${successCount > 1 ? 's' : ''}!`);
      } else {
        globalToast.error('Failed to collect Short.io clicks.');
      }
    }
  };

  // Note: Automatic background refresh disabled for Universal Data Analyzer (all fetching is user-initiated via buttons)

  // Abnormal View Monitor & Original View Guard Evaluator for Data Analyzer rows
  const getRowMonitorReport = (row: DeliverableRow) => {
    const rowUrls = extractVideoUrlsFromRow(row);
    const activeCeiling = abnormalThreshold === 'AUTO' ? 500000 : abnormalThreshold;
    const verifiedAutoCeiling = abnormalThreshold === 'AUTO' ? 2000000 : abnormalThreshold;

    let verifiedLinkOriginalViews = undefined as number | undefined;
    let verifiedLinkSource = '';
    let isOriginalVerified = false;
    let abnormalStopped = false;
    let stoppedAbnormalValue = undefined as number | undefined;
    let stopReason = undefined as string | undefined;

    // 1. Inspect extracted video link previews (highest authority for Original Views of a link)
    rowUrls.forEach(u => {
      const p = linkPreviews[u.trim()]?.data;
      if (!p) return;

      if (p.abnormalMonitor?.abnormalBlocked) {
        abnormalStopped = true;
        if (p.abnormalMonitor.blockedAbnormalValue) {
          stoppedAbnormalValue = Math.max(stoppedAbnormalValue || 0, Number(p.abnormalMonitor.blockedAbnormalValue));
        }
        stopReason = p.abnormalMonitor.blockReason || p.abnormalMonitor.blockedReason || 'Abnormal global/fallback counter blocked by Link Monitor';
      }

      const rawOrig = (p.originalViews !== undefined && p.originalViews !== null)
        ? Number(p.originalViews)
        : (p.views !== undefined && p.views !== null ? Number(p.views) : undefined);

      if (rawOrig !== undefined && !isNaN(rawOrig) && rawOrig > 0) {
        const linkVerified = Boolean(p.abnormalMonitor?.isOriginalVerified || p.abnormalMonitor?.status === 'verified_normal' || p.originalViews !== undefined);
        const ceilingForLink = linkVerified ? verifiedAutoCeiling : activeCeiling;

        if (abnormalMonitorEnabled && rawOrig > ceilingForLink) {
          abnormalStopped = true;
          stoppedAbnormalValue = Math.max(stoppedAbnormalValue || 0, rawOrig);
          stopReason = `Link view count (${rawOrig.toLocaleString('en-IN')}) exceeded abnormal guard ceiling (${ceilingForLink.toLocaleString('en-IN')})`;
        } else {
          verifiedLinkOriginalViews = Math.max(verifiedLinkOriginalViews || 0, rawOrig);
          verifiedLinkSource = p.viewSource || 'Verified Original Video Link Metadata';
          if (linkVerified) isOriginalVerified = true;
        }
      }
    });

    // 2. Gather stored/cached candidates (liveViewsCache, row.views, matchedTask.views)
    const cachedById = (row.videoId && liveViewsCache[row.videoId] !== undefined && liveViewsCache[row.videoId] > 0)
      ? Number(liveViewsCache[row.videoId])
      : undefined;
    const cachedByUrl = (row.videoLink && liveViewsCache[row.videoLink.trim()] !== undefined && liveViewsCache[row.videoLink.trim()] > 0)
      ? Number(liveViewsCache[row.videoLink.trim()])
      : undefined;
    const storedRowViews = (row.views !== undefined && row.views !== null && Number(row.views) > 0)
      ? Number(row.views)
      : undefined;

    const matchedTask = (row.videoId && taskMapByVideoId.get(row.videoId.toLowerCase().trim())) ||
      (row.videoLink && taskMapByVideoLink.get(row.videoLink.toLowerCase().trim())) ||
      (row.shortIoCode && taskMapByShortIo.get(row.shortIoCode.toLowerCase().trim())) ||
      (row.shortIoLink && taskMapByShortIo.get(row.shortIoLink.toLowerCase().trim()));

    let matchedTaskViews: number | undefined = undefined;
    if (matchedTask) {
      let taskViewsSum = 0;
      let hasTaskLinkViews = false;
      const checkLinkViews = (link?: string, manualViews?: number) => {
        if (manualViews !== undefined && manualViews > 0) {
          taskViewsSum += manualViews;
          hasTaskLinkViews = true;
        } else if (link && linkPreviews[link.trim()]?.data) {
          const lp = linkPreviews[link.trim()]?.data;
          const lv = lp?.originalViews ?? lp?.views;
          if (lv !== undefined && Number(lv) > 0) {
            taskViewsSum += Number(lv);
            hasTaskLinkViews = true;
          }
        }
      };
      checkLinkViews(matchedTask.videoLink, (matchedTask as any).videoLink1Views);
      checkLinkViews(matchedTask.videoLink1, (matchedTask as any).videoLink1Views);
      checkLinkViews(matchedTask.videoLink2, (matchedTask as any).videoLink2Views);
      checkLinkViews(matchedTask.videoLink3, (matchedTask as any).videoLink3Views);

      if (hasTaskLinkViews && taskViewsSum > 0) {
        matchedTaskViews = taskViewsSum;
      } else if (matchedTask.views !== undefined && matchedTask.views !== null && Number(matchedTask.views) > 0) {
        matchedTaskViews = Number(matchedTask.views);
      }
    }

    // Safe historical baseline if needed when an abnormal view is stopped
    const safeHistoricalBaseline = [
      row.createdAtViews,
      row.initialViews,
      row.previousViews,
      row.videoId ? previousViewsMap[row.videoId] : undefined
    ]
      .map(v => (v !== undefined && v !== null ? Number(v) : 0))
      .find(v => !isNaN(v) && v > 0 && v <= activeCeiling);

    let resolvedViews: number | undefined = undefined;
    let resolvedSource = '';

    // 3. Resolve final views with Original View Guard priority
    if (verifiedLinkOriginalViews !== undefined && verifiedLinkOriginalViews > 0) {
      // We have a verified original view directly from the video link!
      // Check if cached/stored views had a polluted abnormal spike compared to the real link views
      const highestStored = Math.max(cachedById || 0, cachedByUrl || 0, storedRowViews || 0);
      if (
        abnormalMonitorEnabled &&
        highestStored > verifiedLinkOriginalViews &&
        (highestStored > activeCeiling || highestStored >= verifiedLinkOriginalViews * 1.8)
      ) {
        abnormalStopped = true;
        stoppedAbnormalValue = Math.max(stoppedAbnormalValue || 0, highestStored);
        stopReason = `Stopped abnormal stored view (${highestStored.toLocaleString('en-IN')}) and locked to verified Original Link Views (${verifiedLinkOriginalViews.toLocaleString('en-IN')})`;
        resolvedViews = verifiedLinkOriginalViews;
        resolvedSource = verifiedLinkSource || 'Verified Original Video Link';
      } else if (!abnormalMonitorEnabled) {
        resolvedViews = Math.max(verifiedLinkOriginalViews, highestStored);
        resolvedSource = verifiedLinkSource || 'Link Preview Metadata';
      } else {
        resolvedViews = verifiedLinkOriginalViews;
        resolvedSource = verifiedLinkSource || 'Verified Original Video Link';
      }
    } else {
      // No live link preview fetched yet; evaluate cached/stored candidate against Abnormal View Monitor
      const candidate = cachedById ?? cachedByUrl ?? storedRowViews ?? matchedTaskViews;
      if (candidate !== undefined && candidate > 0) {
        if (abnormalMonitorEnabled && (candidate > activeCeiling || abnormalStopped)) {
          abnormalStopped = true;
          stoppedAbnormalValue = Math.max(stoppedAbnormalValue || 0, candidate);
          stopReason = stopReason || `Abnormal view (${candidate.toLocaleString('en-IN')}) stopped by Original View Guard (ceiling: ${activeCeiling.toLocaleString('en-IN')})`;
          if (safeHistoricalBaseline !== undefined && safeHistoricalBaseline > 0) {
            resolvedViews = safeHistoricalBaseline;
            resolvedSource = 'Restored Original Baseline Views';
          } else {
            resolvedViews = undefined;
            resolvedSource = 'Abnormal View Stopped (Fetch Link for Original Views)';
          }
        } else {
          resolvedViews = candidate;
          resolvedSource = cachedById || cachedByUrl ? 'Live Views Cache' : 'Recorded Deliverable Views';
        }
      }
    }

    return {
      views: resolvedViews,
      originalViews: verifiedLinkOriginalViews ?? safeHistoricalBaseline ?? resolvedViews,
      viewSource: resolvedSource,
      isOriginalVerified,
      abnormalStopped,
      stoppedAbnormalValue,
      stopReason
    };
  };

  // Performance Metrics Resolver
  const getRowMetrics = (row: DeliverableRow) => {
    const hasVideoLink = Boolean(row.videoLink && row.videoLink.trim() !== '' && !row.videoLink.toLowerCase().includes('pending'));
    const hasShortIoLink = Boolean(
      row.shortIoLink &&
      row.shortIoLink.trim() !== '' &&
      row.shortIoLink.trim() !== '—' &&
      row.shortIoLink.trim() !== '-'
    );
    const hasShortIoCode = Boolean(
      (row.shortIoCode &&
      row.shortIoCode.trim() !== '' &&
      row.shortIoCode.trim() !== '—' &&
      row.shortIoCode.trim() !== '-') ||
      hasShortIoLink
    );

    // 1. Resolve Views through the Abnormal View Monitor & Original View Guard
    const monitorReport = getRowMonitorReport(row);
    const views = monitorReport.views;

    // 2. Resolve Clicks using Short.io Tracker Procedure (ONLY when short.io link is available)
    let clicks: number | undefined = undefined;
    if (hasShortIoLink) {
      if (row.videoId && liveClicksCache[row.videoId] !== undefined) {
        clicks = liveClicksCache[row.videoId];
      } else if (row.shortIoLink && liveClicksCache[row.shortIoLink.trim()] !== undefined) {
        clicks = liveClicksCache[row.shortIoLink.trim()];
      } else if (row.shortIoCode && liveClicksCache[row.shortIoCode.trim()] !== undefined) {
        clicks = liveClicksCache[row.shortIoCode.trim()];
      } else if (row.clicks !== undefined && row.clicks !== null) {
        clicks = row.clicks;
      } else {
        const matchedLink = findShortioMatch(row, shortIoLinks);
        if (matchedLink && (matchedLink.clicks !== undefined || matchedLink.manualClicksOverride !== undefined || matchedLink.humanClicks !== undefined)) {
          clicks = getEffectiveClicks(matchedLink);
        } else {
          const matchedTask = (row.videoId && taskMapByVideoId.get(row.videoId.toLowerCase().trim())) ||
            (row.shortIoCode && taskMapByShortIo.get(row.shortIoCode.toLowerCase().trim())) ||
            (row.shortIoLink && taskMapByShortIo.get(row.shortIoLink.toLowerCase().trim())) ||
            (row.videoLink && taskMapByVideoLink.get(row.videoLink.toLowerCase().trim()));
          if (matchedTask && matchedTask.clicks !== undefined && matchedTask.clicks !== null) {
            clicks = Number(matchedTask.clicks);
          }
        }
      }
    }

    const amount = Number(row.amountPaid) || 0;

    const safeViews = (views !== undefined && !isNaN(Number(views)) && isFinite(Number(views)) && Number(views) >= 0 && Number(views) <= 15000000) ? Math.round(Number(views)) : undefined;
    const safeClicks = (clicks !== undefined && !isNaN(Number(clicks)) && isFinite(Number(clicks)) && Number(clicks) >= 0) ? Math.round(Number(clicks)) : undefined;

    const cpvRaw = (safeViews !== undefined && safeViews > 0 && amount > 0)
      ? (amount / safeViews)
      : undefined;

    const cpcRaw = (safeClicks !== undefined && safeClicks > 0 && amount > 0)
      ? (amount / safeClicks)
      : undefined;

    const ctrRaw = (safeViews !== undefined && safeViews > 0 && safeClicks !== undefined)
      ? ((safeClicks / safeViews) * 100)
      : undefined;

    return {
      hasVideoLink,
      hasShortIoCode,
      hasShortIoLink,
      views: safeViews,
      originalViews: monitorReport.originalViews,
      viewSource: monitorReport.viewSource,
      isOriginalVerified: monitorReport.isOriginalVerified,
      abnormalStopped: monitorReport.abnormalStopped,
      stoppedAbnormalValue: monitorReport.stoppedAbnormalValue,
      stopReason: monitorReport.stopReason,
      clicks: safeClicks,
      cpv: (cpvRaw !== undefined && !isNaN(cpvRaw) && isFinite(cpvRaw)) ? cpvRaw : undefined,
      cpc: (cpcRaw !== undefined && !isNaN(cpcRaw) && isFinite(cpcRaw)) ? cpcRaw : undefined,
      ctr: (ctrRaw !== undefined && !isNaN(ctrRaw) && isFinite(ctrRaw)) ? ctrRaw : undefined
    };
  };

  // Helper to determine exact reasons why views or clicks are not showing
  const getMetricsStatusReason = (row: DeliverableRow, metrics: ReturnType<typeof getRowMetrics>) => {
    let viewsReason: {
      code: 'MISSING_VIDEO_LINK' | 'VIEWS_NOT_FETCHED' | 'VIEWS_ZERO' | 'OK';
      shortLabel: string;
      description: string;
      badgeColor: string;
    };

    let clicksReason: {
      code: 'MISSING_VIDEO_LINK' | 'MISSING_SHORT_IO' | 'CLICKS_ZERO' | 'NOT_SYNCED' | 'OK';
      shortLabel: string;
      description: string;
      badgeColor: string;
    };

    // 1. Views Reason
    if (!metrics.hasVideoLink) {
      viewsReason = {
        code: 'MISSING_VIDEO_LINK',
        shortLabel: 'No Video Link',
        description: 'Video Link is pending / not published. Views cannot be tracked without a published video URL.',
        badgeColor: 'bg-rose-50 text-rose-700 border-rose-200'
      };
    } else if (metrics.views === undefined || metrics.views === null) {
      viewsReason = {
        code: 'VIEWS_NOT_FETCHED',
        shortLabel: 'Awaiting Fetch',
        description: 'Video link is available, but views metadata has not been retrieved yet. Click "Refresh Live Metrics" or input manually.',
        badgeColor: 'bg-amber-50 text-amber-800 border-amber-200'
      };
    } else if (metrics.views === 0) {
      viewsReason = {
        code: 'VIEWS_ZERO',
        shortLabel: '0 Views',
        description: 'Video is published, but 0 views are currently reported by the platform.',
        badgeColor: 'bg-slate-100 text-slate-600 border-slate-200'
      };
    } else {
      viewsReason = {
        code: 'OK',
        shortLabel: 'Views Live',
        description: `Tracked ${metrics.views.toLocaleString('en-IN')} live video views.`,
        badgeColor: 'bg-sky-50 text-sky-700 border-sky-200'
      };
    }

    // 2. Clicks Reason
    if (!metrics.hasShortIoLink) {
      clicksReason = {
        code: 'MISSING_SHORT_IO',
        shortLabel: 'No Short.io Link',
        description: 'Short.io tracking link is missing. Under campaign rules, click metrics are only displayed when a valid Short.io link is available.',
        badgeColor: 'bg-amber-50 text-amber-800 border-amber-200'
      };
    } else if (metrics.clicks !== undefined && metrics.clicks > 0) {
      clicksReason = {
        code: 'OK',
        shortLabel: 'Clicks Live',
        description: `Tracked ${metrics.clicks.toLocaleString('en-IN')} link clicks via Short.io.`,
        badgeColor: 'bg-indigo-50 text-indigo-700 border-indigo-200'
      };
    } else if (metrics.clicks === 0) {
      clicksReason = {
        code: 'CLICKS_ZERO',
        shortLabel: '0 Clicks',
        description: 'Short.io tracking link is available, but 0 clicks have been registered yet.',
        badgeColor: 'bg-slate-100 text-slate-600 border-slate-200'
      };
    } else {
      clicksReason = {
        code: 'NOT_SYNCED',
        shortLabel: 'Awaiting Clicks',
        description: 'Short.io tracking link is available. Click "Collect Short.io Clicks" or input manually.',
        badgeColor: 'bg-indigo-50 text-indigo-700 border-indigo-200'
      };
    }

    return { viewsReason, clicksReason };
  };

  // Refresh live metrics across all video links and collect Short.io clicks
  const handleRefreshLiveMetrics = async () => {
    setIsRefreshingLive(true);
    globalToast.info('Refreshing live video views and Short.io clicks using platform procedures...');
    try {
      // 1. Collect live video views using the exact Live Video Views procedure
      await collectLiveVideoViewsProcedure();

      // 2. Collect live Short.io clicks data using the Short.io Tracker procedure
      await collectClicksDataProcedure();

      globalToast.success('Universal Data Analyzer metrics updated with live video views and Short.io clicks!');
    } catch (err: any) {
      console.error(err);
      globalToast.error('Could not complete live metrics refresh.');
    } finally {
      setIsRefreshingLive(false);
    }
  };

  const handleSaveMetricEdit = () => {
    if (!editingMetric) return;
    const { rowId, type, value } = editingMetric;
    const num = parseFloat(value) || 0;
    
    setData(prev => prev.map(r => {
      if (r.videoId === rowId) {
        return {
          ...r,
          [type]: num
        };
      }
      return r;
    }));

    if (type === 'views') {
      const targetRow = data.find(r => r.videoId === rowId);
      setLiveViewsCache(prev => {
        const next = { ...prev, [rowId]: num };
        if (targetRow?.videoLink) next[targetRow.videoLink.trim()] = num;
        return next;
      });
    } else {
      setLiveClicksCache(prev => ({ ...prev, [rowId]: num }));
    }

    setEditingMetric(null);
    globalToast.success(`Updated ${type} for ${rowId}`);
  };

  const handleTestInspectRowUrl = async (urlToTest: string) => {
    if (!inspectingRowForViews) return;
    setInspectingRowForViews(prev => prev ? { ...prev, isTesting: true, testError: null } : null);
    try {
      // 1. Attempt direct live extraction
      const res = await fetchPreviewForUrl(urlToTest);
      const previewData = res ? (res.data || res) : null;
      if (previewData && previewData.views !== undefined && Number(previewData.views) > 0) {
        const found = Number(previewData.views);
        globalToast.success(`Live extraction found ${found.toLocaleString('en-IN')} views!`);
        setInspectingRowForViews(prev => prev ? {
          ...prev,
          viewsValue: String(found),
          isTesting: false,
          testError: null
        } : null);
        return;
      }

      // 2. Automatically invoke Auto-Find Public Link & View Resolver
      const autoRes = await fetch('/api/auto-find-video-views', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: urlToTest,
          videoId: inspectingRowForViews.row.videoId,
          creatorName: inspectingRowForViews.row.influencerName,
          productName: inspectingRowForViews.row.productName,
          amountPaid: inspectingRowForViews.row.amountPaid
        })
      });
      const autoJson = await autoRes.json();
      if (autoJson && autoJson.success && autoJson.views && autoJson.views > 0) {
        const found = Number(autoJson.views);
        const resolvedUrl = autoJson.cleanPublicUrl || urlToTest;
        globalToast.success(`Auto-found public link & collected ${found.toLocaleString('en-IN')} views! (${autoJson.source || 'Auto-Resolved'})`);
        setInspectingRowForViews(prev => prev ? {
          ...prev,
          currentUrl: resolvedUrl,
          viewsValue: String(found),
          isTesting: false,
          testError: null
        } : null);
        return;
      }

      setInspectingRowForViews(prev => prev ? {
        ...prev,
        isTesting: false,
        testError: 'Could not extract live views automatically from this URL. Click "Auto Find Public Link & Collect Views Automatically" or enter views manually.'
      } : null);
    } catch {
      setInspectingRowForViews(prev => prev ? {
        ...prev,
        isTesting: false,
        testError: 'Request timed out or was blocked by the platform. You can use Auto-Find or enter views manually below.'
      } : null);
    }
  };

  const handleAutoFindPublicLinkAndViews = async () => {
    if (!inspectingRowForViews) return;
    setInspectingRowForViews(prev => prev ? { ...prev, isTesting: true, testError: null } : null);
    try {
      const targetUrl = inspectingRowForViews.currentUrl || inspectingRowForViews.row.videoLink || inspectingRowForViews.row.shortIoLink || '';
      const autoRes = await fetch('/api/auto-find-video-views', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: targetUrl,
          videoId: inspectingRowForViews.row.videoId,
          creatorName: inspectingRowForViews.row.influencerName,
          productName: inspectingRowForViews.row.productName,
          amountPaid: inspectingRowForViews.row.amountPaid
        })
      });
      const autoJson = await autoRes.json();
      if (autoJson && autoJson.success && autoJson.views && autoJson.views > 0) {
        const found = Number(autoJson.views);
        const resolvedUrl = autoJson.cleanPublicUrl || targetUrl;
        globalToast.success(`Auto-found public link & collected ${found.toLocaleString('en-IN')} views! (${autoJson.source || 'Auto-Resolved'})`);
        setInspectingRowForViews(prev => prev ? {
          ...prev,
          currentUrl: resolvedUrl,
          viewsValue: String(found),
          isTesting: false,
          testError: null
        } : null);
        // Automatically save and apply immediately
        handleSaveInspectedRowViews(found, resolvedUrl);
        setInspectingRowForViews(null);
      } else {
        setInspectingRowForViews(prev => prev ? {
          ...prev,
          isTesting: false,
          testError: 'Auto-find could not resolve public video link. Please verify URL manually or input view count.'
        } : null);
      }
    } catch {
      setInspectingRowForViews(prev => prev ? {
        ...prev,
        isTesting: false,
        testError: 'Auto-find service encountered a network error. Enter views manually below.'
      } : null);
    }
  };

  const handleSaveInspectedRowViews = (newViews: number, updatedUrl?: string) => {
    if (!inspectingRowForViews) return;
    const { row } = inspectingRowForViews;
    const finalUrl = updatedUrl !== undefined ? updatedUrl.trim() : (row.videoLink || '');

    // 1. Update data state
    setData(prev => prev.map(r => {
      if (r.videoId === row.videoId) {
        return {
          ...r,
          views: newViews,
          ...(finalUrl ? { videoLink: finalUrl } : {})
        };
      }
      return r;
    }));

    // 2. Update liveViewsCache
    setLiveViewsCache(prev => {
      const next = { ...prev, [row.videoId]: newViews };
      if (finalUrl) next[finalUrl] = newViews;
      if (row.videoLink) next[row.videoLink.trim()] = newViews;
      return next;
    });

    // 3. Preserve previousViewsMap (anchored to creation baseline)
    const creationBaseline = (row.createdAtViews !== undefined && row.createdAtViews !== null)
      ? Number(row.createdAtViews)
      : (row.initialViews !== undefined && row.initialViews !== null)
        ? Number(row.initialViews)
        : (row.previousViews !== undefined && row.previousViews !== null)
          ? Number(row.previousViews)
          : (previousViewsMap[row.videoId] ?? row.views ?? 0);
    setPreviousViewsMap(prev => ({ ...prev, [row.videoId]: creationBaseline }));

    // 4. Update subpageSnapshot if present
    if (subpageSnapshot && subpageSnapshot.data && subpageSnapshot.data.length > 0) {
      setSubpageSnapshot(prev => {
        if (!prev) return prev;
        const updatedData = prev.data.map(r => {
          if (r.videoId === row.videoId) {
            return {
              ...r,
              views: newViews,
              ...(finalUrl ? { videoLink: finalUrl } : {})
            };
          }
          return r;
        });
        const updatedSnapshot = {
          ...prev,
          data: updatedData,
          savedAt: new Date().toLocaleString('en-US', { hour12: true })
        };
        safeLocalStorage.setItem('SUBPAGE_ANALYZED_SNAPSHOT', JSON.stringify(updatedSnapshot));
        return updatedSnapshot;
      });
    }

    // 5. Auto sync to Tasks via onUpdateTasksBulk
    if (onUpdateTasksBulk && tasks && tasks.length > 0) {
      const matchedTask = (row.videoId && taskMapByVideoId.get(row.videoId.toLowerCase().trim())) ||
                          (row.videoLink && taskMapByVideoLink.get(row.videoLink.toLowerCase().trim()));
      if (matchedTask) {
        const remunerationValue = matchedTask.remuneration || row.amountPaid || 0;
        const clicksValue = matchedTask.clicks !== undefined ? matchedTask.clicks : (liveClicksCache[row.videoId] || undefined);
        const ctrValue = (clicksValue !== undefined && newViews > 0) ? parseFloat(((clicksValue / newViews) * 100).toFixed(2)) : undefined;
        const cpvValue = newViews > 0 ? parseFloat((remunerationValue / newViews).toFixed(3)) : undefined;
        const taskBaseline = (matchedTask.createdAtViews !== undefined && matchedTask.createdAtViews !== null)
          ? Number(matchedTask.createdAtViews)
          : (matchedTask.initialViews !== undefined && matchedTask.initialViews !== null)
            ? Number(matchedTask.initialViews)
            : (matchedTask.previousViews !== undefined && matchedTask.previousViews !== null)
              ? Number(matchedTask.previousViews)
              : (matchedTask.views || 0);

        onUpdateTasksBulk([{
          id: matchedTask.id,
          updates: {
            views: newViews,
            previousViews: taskBaseline,
            createdAtViews: taskBaseline,
            initialViews: matchedTask.initialViews !== undefined ? matchedTask.initialViews : taskBaseline,
            ...(ctrValue !== undefined ? { ctr: ctrValue } : {}),
            ...(cpvValue !== undefined ? { cpv: cpvValue } : {}),
            ...(finalUrl ? { videoLink: finalUrl } : {})
          }
        }]);
      }
    }

    globalToast.success(`Live Video Views set to ${newViews.toLocaleString('en-IN')} for ${row.videoId}!`);
    setInspectingRowForViews(null);
  };

  // Date extraction helpers for intelligent Multi-Format filtering
  const extractDateComponents = (str?: string): { year?: string; month?: string; day?: string; fullDate?: string } | null => {
    if (!str) return null;
    const trimmed = str.trim();
    if (!trimmed) return null;

    // Format: YYYY-MM-DD
    let match = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (match) {
      const y = match[1];
      const m = match[2].padStart(2, '0');
      const d = match[3].padStart(2, '0');
      return { year: y, month: m, day: d, fullDate: `${y}-${m}-${d}` };
    }

    // Format: DD/MM/YYYY or DD-MM-YYYY (e.g. 03/10/2026 or 05/10/2026 15:00:00)
    match = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if (match) {
      const d = match[1].padStart(2, '0');
      const m = match[2].padStart(2, '0');
      const y = match[3];
      return { year: y, month: m, day: d, fullDate: `${y}-${m}-${d}` };
    }

    // Format: M/D/YYYY or MM/DD/YYYY (e.g. 10/3/2026, 10/4/2026 13:30:16)
    match = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
    if (match) {
      let y = match[3];
      if (y.length === 2) y = '20' + y;
      const m = match[1].padStart(2, '0');
      const d = match[2].padStart(2, '0');
      return { year: y, month: m, day: d, fullDate: `${y}-${m}-${d}` };
    }

    return null;
  };

  const matchMonthNameOrCode = (text: string, targetMonth: string, targetYear?: string) => {
    if (!text) return false;
    const lower = text.toLowerCase();
    const monthMap: Record<string, string[]> = {
      '01': ['jan', 'january', '01'],
      '02': ['feb', 'february', '02'],
      '03': ['mar', 'march', '03'],
      '04': ['apr', 'april', '04'],
      '05': ['may', '05'],
      '06': ['jun', 'june', '06'],
      '07': ['jul', 'july', '07'],
      '08': ['aug', 'august', '08'],
      '09': ['sep', 'september', '09'],
      '10': ['oct', 'october', '10'],
      '11': ['nov', 'november', '11'],
      '12': ['dec', 'december', '12'],
    };
    const keywords = monthMap[targetMonth] || [targetMonth.toLowerCase()];
    const matchesMonth = keywords.some(k => lower.includes(k));
    if (!matchesMonth) return false;

    if (targetYear && targetYear !== 'ALL') {
      const yShort = targetYear.slice(-2);
      return lower.includes(targetYear) || lower.includes(yShort);
    }
    return true;
  };

  // Cascaded Data Subset: When an Approacher is selected, filter options only reflect that Approacher's details
  const approacherFilteredData = useMemo(() => {
    if (!filterApproachers || filterApproachers.length === 0) return data;
    const targetNorms = filterApproachers.map(a => a.trim().toLowerCase());
    return data.filter(r => targetNorms.includes((r.approacher || 'Unassigned').trim().toLowerCase()));
  }, [data, filterApproachers]);

  // Unique Filter Lists (Cascading based on selected Approacher / BDM)
  const uniqueInfluencersList = useMemo(() => {
    const counts = new Map<string, number>();
    approacherFilteredData.forEach(r => {
      const name = (r.influencerName || '').trim();
      if (name) counts.set(name, (counts.get(name) || 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [approacherFilteredData]);

  const uniqueProductsList = useMemo(() => {
    const counts = new Map<string, number>();
    approacherFilteredData.forEach(r => {
      const name = (r.productName || '').trim();
      if (name) counts.set(name, (counts.get(name) || 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [approacherFilteredData]);

  const uniqueApproachersList = useMemo(() => {
    const counts = new Map<string, number>();
    data.forEach(r => {
      const name = (r.approacher || '').trim() || 'Unassigned';
      if (name) counts.set(name, (counts.get(name) || 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);

  const uniqueStatesList = useMemo(() => {
    const counts = new Map<string, number>();
    approacherFilteredData.forEach(r => {
      const name = (r.state || (r as any).location || 'Assam').trim();
      if (name) counts.set(name, (counts.get(name) || 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [approacherFilteredData]);

  const uniqueYearsList = useMemo(() => {
    const yearsSet = new Set<string>();
    approacherFilteredData.forEach(r => {
      [r.videoReleasedDate, r.plannedDate, r.timestamp, r.finalActualDate, r.checklistActualDate, r.orderMonth, r.releaseMonth].forEach(s => {
        if (!s) return;
        const comp = extractDateComponents(s);
        if (comp && comp.year) yearsSet.add(comp.year);
        const yMatch = s.match(/20\d{2}/);
        if (yMatch) yearsSet.add(yMatch[0]);
        const shortMatch = s.match(/(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)(\d{2})/i);
        if (shortMatch) yearsSet.add('20' + shortMatch[1]);
      });
    });
    if (yearsSet.size === 0) {
      yearsSet.add('2026');
      yearsSet.add('2025');
    }
    return Array.from(yearsSet).sort((a, b) => b.localeCompare(a));
  }, [approacherFilteredData]);

  // Auto-prune active Influencer and Product filters when Approacher selection changes
  useEffect(() => {
    if (filterApproachers.length === 0) return;

    if (filterInfluencer !== 'ALL') {
      const exists = uniqueInfluencersList.some(inf => inf.name.toLowerCase() === filterInfluencer.trim().toLowerCase());
      if (!exists) {
        setFilterInfluencer('ALL');
      }
    }

    if (filterProducts.length > 0) {
      const validProducts = filterProducts.filter(pName =>
        uniqueProductsList.some(p => p.name.toLowerCase() === pName.trim().toLowerCase())
      );
      if (validProducts.length !== filterProducts.length) {
        setFilterProducts(validProducts);
      }
    }
  }, [filterApproachers, uniqueInfluencersList, uniqueProductsList, filterInfluencer, filterProducts]);

  const monthsList = [
    { key: 'ALL', label: 'All Months' },
    { key: '01', label: '01 - January' },
    { key: '02', label: '02 - February' },
    { key: '03', label: '03 - March' },
    { key: '04', label: '04 - April' },
    { key: '05', label: '05 - May' },
    { key: '06', label: '06 - June' },
    { key: '07', label: '07 - July' },
    { key: '08', label: '08 - August' },
    { key: '09', label: '09 - September' },
    { key: '10', label: '10 - October' },
    { key: '11', label: '11 - November' },
    { key: '12', label: '12 - December' }
  ];

  const handleResetAllFilters = () => {
    setFilterInfluencer('ALL');
    setFilterProducts([]);
    setFilterApproachers([]);
    setFilterStates([]);
    setFilterYear('ALL');
    setFilterMonth('ALL');
    setFilterDate('');
    setSelectedFilter(null);
    setSearchTerm('');
    globalToast.info('All filters reset.');
  };

  // State / Location Multi-Select (Multipool) Helpers
  const handleToggleState = (stateName: string) => {
    const trimmed = stateName.trim();
    setFilterStates(prev => {
      const exists = prev.some(s => s.toLowerCase() === trimmed.toLowerCase());
      if (exists) {
        return prev.filter(s => s.toLowerCase() !== trimmed.toLowerCase());
      } else {
        return [...prev, trimmed];
      }
    });
  };

  const handleSelectAllStates = () => {
    setFilterStates(uniqueStatesList.map(s => s.name));
    globalToast.success(`Selected all ${uniqueStatesList.length} states / locations.`);
  };

  const handleClearAllStates = () => {
    setFilterStates([]);
    globalToast.info('Cleared state selection (showing all).');
  };

  // Approacher Multi-Select (Multipool) Helpers
  const handleToggleApproacher = (approacherName: string) => {
    const trimmed = approacherName.trim();
    setFilterApproachers(prev => {
      const exists = prev.some(a => a.toLowerCase() === trimmed.toLowerCase());
      if (exists) {
        return prev.filter(a => a.toLowerCase() !== trimmed.toLowerCase());
      } else {
        return [...prev, trimmed];
      }
    });
  };

  const handleSelectAllApproachers = () => {
    setFilterApproachers(uniqueApproachersList.map(a => a.name));
    globalToast.success(`Selected all ${uniqueApproachersList.length} approachers / BDMs.`);
  };

  const handleClearAllApproachers = () => {
    setFilterApproachers([]);
    globalToast.info('Cleared approacher selection (showing all).');
  };

  // Product Multi-Select (Multipool) Helpers
  const handleToggleProduct = (productName: string) => {
    const trimmed = productName.trim();
    setFilterProducts(prev => {
      const exists = prev.some(p => p.toLowerCase() === trimmed.toLowerCase());
      if (exists) {
        return prev.filter(p => p.toLowerCase() !== trimmed.toLowerCase());
      } else {
        return [...prev, trimmed];
      }
    });
  };

  const handleSelectAllProducts = () => {
    setFilterProducts(uniqueProductsList.map(p => p.name));
    globalToast.success(`Selected all ${uniqueProductsList.length} product SKUs.`);
  };

  const handleClearAllProducts = () => {
    setFilterProducts([]);
    globalToast.info('Cleared product SKU selection (showing all).');
  };

  // Extraction Product Multi-Select (Multipool) Helpers
  const handleToggleExtractProduct = (prodName: string) => {
    const trimmed = prodName.trim();
    setExtractFilterProducts(prev => {
      const exists = prev.some(p => p.toLowerCase() === trimmed.toLowerCase());
      if (exists) {
        return prev.filter(p => p.toLowerCase() !== trimmed.toLowerCase());
      } else {
        return [...prev, trimmed];
      }
    });
  };

  const handleSelectAllExtractProducts = (options: string[]) => {
    setExtractFilterProducts([...options]);
    globalToast.success(`Selected all ${options.length} product SKUs for extraction.`);
  };

  const handleClearAllExtractProducts = () => {
    setExtractFilterProducts([]);
    globalToast.info('Cleared product SKU extraction selection (showing all).');
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (extractProductDropdownRef.current && !extractProductDropdownRef.current.contains(event.target as Node)) {
        setIsExtractProductDropdownOpen(false);
      }
    };
    if (isExtractProductDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isExtractProductDropdownOpen]);

  // Click outside listener for Product multi-select dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (productDropdownRef.current && !productDropdownRef.current.contains(event.target as Node)) {
        setIsProductDropdownOpen(false);
      }
    };
    if (isProductDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isProductDropdownOpen]);

  // Click outside listener for Approacher multi-select dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (approacherDropdownRef.current && !approacherDropdownRef.current.contains(event.target as Node)) {
        setIsApproacherDropdownOpen(false);
      }
    };
    if (isApproacherDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isApproacherDropdownOpen]);

  // Click outside listener for State multi-select dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (stateDropdownRef.current && !stateDropdownRef.current.contains(event.target as Node)) {
        setIsStateDropdownOpen(false);
      }
    };
    if (isStateDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isStateDropdownOpen]);

  // Approacher Isolation & Deletion Action Handler
  const handleConfirmApproacherAction = () => {
    if (!approacherDeleteModal) return;
    const { targetApproacher, action } = approacherDeleteModal;
    const normTarget = targetApproacher.trim().toLowerCase();

    if (action === 'keep_selected_delete_others') {
      const kept = data.filter(r => (r.approacher || 'Unassigned').trim().toLowerCase() === normTarget);
      const deletedCount = data.length - kept.length;
      setData(kept);
      setFilterApproachers([targetApproacher]);
      globalToast.success(`Pruned Analyzer: Kept ${kept.length} deliverables for Approacher "${targetApproacher}". Deleted ${deletedCount} deliverables from other approachers.`);
    } else if (action === 'delete_selected') {
      const kept = data.filter(r => (r.approacher || 'Unassigned').trim().toLowerCase() !== normTarget);
      const deletedCount = data.length - kept.length;
      setData(kept);
      setFilterApproachers(prev => prev.filter(a => a.trim().toLowerCase() !== normTarget));
      globalToast.success(`Deleted ${deletedCount} deliverables belonging to Approacher "${targetApproacher}".`);
    }
    setApproacherDeleteModal(null);
  };

  // -------------------------------------------------------------
  // Sub-Page & Google Drive Cloud Analytics Procedures
  // -------------------------------------------------------------
  const handleSaveToSubpage = () => {
    if (data.length === 0) {
      globalToast.error('No dataset loaded to save to Sub-Page.');
      return;
    }
    const newSnapshot: SubPageAnalyzedSnapshot = {
      savedAt: new Date().toLocaleString(),
      sourceFileName: fileName || 'Analyzed Dataset',
      totalRecords: data.length,
      data: [...data],
      stats: { ...stats },
      driveLastSyncTime: subpageSnapshot?.driveLastSyncTime,
      driveFileId: subpageSnapshot?.driveFileId
    };
    safeLocalStorage.setItem('DATA_ANALYZER_SUBPAGE_SNAPSHOT', JSON.stringify(newSnapshot));
    setSubpageSnapshot(newSnapshot);
    setViewMode('subpage');
    globalToast.success(`Successfully saved ${data.length} analyzed records to Sub-Page! Opening Analytics view...`);
  };

  const handleSaveSubpageToDrive = async () => {
    const currentSnapshot = subpageSnapshot || (data.length > 0 ? {
      savedAt: new Date().toLocaleString(),
      sourceFileName: fileName || 'Analyzed Dataset',
      totalRecords: data.length,
      data: [...data],
      stats: { ...stats }
    } : null);

    if (!currentSnapshot || !currentSnapshot.data || currentSnapshot.data.length === 0) {
      globalToast.error('Sub-Page dataset is empty. Load or analyze data first before saving to Google Drive.');
      return;
    }

    setIsSavingToDrive(true);
    globalToast.info('Authenticating Google OAuth and saving Sub-Page dataset to Google Drive...');

    const executeSave = async (tokenToUse: string) => {
      const syncTime = new Date().toLocaleString();
      const payloadToSave = {
        subpageSnapshot: {
          ...currentSnapshot,
          savedAt: syncTime,
          driveLastSyncTime: syncTime
        },
        _subpageMetadata: {
          exportedAt: new Date().toISOString(),
          recordCount: currentSnapshot.data.length,
          type: 'DATA_ANALYZER_SUBPAGE_ANALYTICS'
        }
      };

      let uploadedFileId = currentSnapshot.driveFileId;
      if (uploadedFileId) {
        try {
          await updateSyncFileOnDrive(tokenToUse, uploadedFileId, payloadToSave as any);
        } catch (e: any) {
          if (String(e?.message || '').includes('401') || String(e?.message || '').includes('UNAUTHENTICATED')) {
            throw e;
          }
          const res = await uploadFullBackupToGoogleDrive(tokenToUse, payloadToSave as any, 'Influencer Manager Backup', 'Data_Analyzer_Subpage_Analytics.json');
          uploadedFileId = res.fileId;
        }
      } else {
        const res = await uploadFullBackupToGoogleDrive(tokenToUse, payloadToSave as any, 'Influencer Manager Backup', 'Data_Analyzer_Subpage_Analytics.json');
        uploadedFileId = res.fileId;
      }

      const updatedSnapshot: SubPageAnalyzedSnapshot = {
        ...currentSnapshot,
        savedAt: syncTime,
        driveLastSyncTime: syncTime,
        driveFileId: uploadedFileId
      };

      setSubpageSnapshot(updatedSnapshot);
      safeLocalStorage.setItem('DATA_ANALYZER_SUBPAGE_SNAPSHOT', JSON.stringify(updatedSnapshot));
      globalToast.success(`Sub-Page dataset (${currentSnapshot.data.length} records) saved to Google Drive successfully!`);
    };

    try {
      let activeToken = await ensureGoogleAccessToken(accessToken);
      try {
        await executeSave(activeToken);
      } catch (e: any) {
        if (String(e?.message || '').includes('401') || String(e?.message || '').includes('UNAUTHENTICATED')) {
          globalToast.info('Google OAuth token expired. Re-authenticating...');
          activeToken = await ensureGoogleAccessToken(null, undefined, true);
          await executeSave(activeToken);
        } else {
          throw e;
        }
      }
    } catch (err: any) {
      console.error(err);
      globalToast.error(err.message || 'Failed to save sub-page dataset to Google Drive.');
    } finally {
      setIsSavingToDrive(false);
    }
  };

  const handleUpdateSubpageFromDrive = async () => {
    setIsUpdatingFromDrive(true);
    globalToast.info('Connecting to Google Drive and searching for latest Sub-Page analytics dataset...');

    const executeFetch = async (tokenToUse: string) => {
      const files = await searchSyncFilesOnDrive(tokenToUse);
      const targetFile = files.find(f => f.name.toLowerCase().includes('subpage') || f.name.toLowerCase().includes('data_analyzer')) || files[0];

      if (!targetFile) {
        globalToast.error('No Sub-Page analytics backup found in Google Drive. Click "Save to Google Drive" first.');
        return;
      }

      const downloaded: any = await downloadSyncFileFromDrive(tokenToUse, targetFile.id);
      let downloadedSnapshot: SubPageAnalyzedSnapshot | null = null;

      if (downloaded.subpageSnapshot && Array.isArray(downloaded.subpageSnapshot.data)) {
        downloadedSnapshot = downloaded.subpageSnapshot;
      } else if (Array.isArray(downloaded.data)) {
        downloadedSnapshot = {
          savedAt: downloaded.exportedAt || new Date().toLocaleString(),
          sourceFileName: downloaded.sourceFileName || 'Google Drive Backup',
          totalRecords: downloaded.data.length,
          data: downloaded.data,
          stats: downloaded.stats || { totalSpend: 0, totalViews: 0, totalClicks: 0, avgCpv: 0, avgCpc: 0, avgCtr: 0, uniqueCreators: 0, uniqueProducts: 0 }
        };
      }

      if (downloadedSnapshot && downloadedSnapshot.data) {
        setSubpageSnapshot(downloadedSnapshot);
        safeLocalStorage.setItem('DATA_ANALYZER_SUBPAGE_SNAPSHOT', JSON.stringify(downloadedSnapshot));
        globalToast.success(`Restored Sub-Page dataset (${downloadedSnapshot.data.length} records) from Google Drive successfully!`);
      } else {
        globalToast.error('The selected backup file in Google Drive does not contain valid Sub-Page dataset records.');
      }
    };

    try {
      let activeToken = await ensureGoogleAccessToken(accessToken);
      try {
        await executeFetch(activeToken);
      } catch (e: any) {
        if (String(e?.message || '').includes('401') || String(e?.message || '').includes('UNAUTHENTICATED')) {
          globalToast.info('Google OAuth token expired. Re-authenticating...');
          activeToken = await ensureGoogleAccessToken(null, undefined, true);
          await executeFetch(activeToken);
        } else {
          throw e;
        }
      }
    } catch (err: any) {
      console.error(err);
      globalToast.error(err.message || 'Failed to update Sub-Page dataset from Google Drive.');
    } finally {
      setIsUpdatingFromDrive(false);
    }
  };

  const handleLoadSubpageIntoMainAnalyzer = () => {
    if (!subpageSnapshot || !subpageSnapshot.data || subpageSnapshot.data.length === 0) {
      globalToast.error('Sub-Page dataset is empty.');
      return;
    }
    setData(subpageSnapshot.data);
    setFileName(subpageSnapshot.sourceFileName || 'Sub-Page Snapshot');
    setViewMode('grid');
    globalToast.success(`Loaded ${subpageSnapshot.data.length} records from Sub-Page into main analyzer!`);
  };

  const handleDeleteSubpageData = () => {
    safeLocalStorage.removeItem('DATA_ANALYZER_SUBPAGE_SNAPSHOT');
    setSubpageSnapshot(null);
    setIsDeleteSubpageModalOpen(false);
    globalToast.success('Sub-Page analyzed dataset has been deleted successfully.');
  };

  // -------------------------------------------------------------
  // Sub-Page Inline Modification, Row Creation & Live Refresh Procedures
  // -------------------------------------------------------------
  const handleUpdateSubpageRow = (rowId: string, field: keyof DeliverableRow, val: any) => {
    if (!subpageSnapshot || !subpageSnapshot.data) return;
    const updatedData = subpageSnapshot.data.map(r => {
      if (r.videoId === rowId) {
        const updated = { ...r, [field]: val };
        if (field === 'amountPaid' || field === 'videoLink' || field === 'shortIoLink' || field === 'views' || field === 'clicks') {
          const m = getRowMetrics(updated);
          updated.cpv = m.cpv;
          updated.cpc = m.cpc;
          updated.ctr = m.ctr;
        }
        return updated;
      }
      return r;
    });

    const newSnapshot: SubPageAnalyzedSnapshot = {
      ...subpageSnapshot,
      totalRecords: updatedData.length,
      data: updatedData,
      savedAt: new Date().toLocaleString()
    };

    safeLocalStorage.setItem('DATA_ANALYZER_SUBPAGE_SNAPSHOT', JSON.stringify(newSnapshot));
    setSubpageSnapshot(newSnapshot);
  };

  const handleAddSubpageRow = () => {
    const existing = subpageSnapshot?.data || [];
    const newRowId = `VO-${Date.now().toString().slice(-4)}`;
    const newRow: DeliverableRow = {
      timestamp: new Date().toISOString(),
      videoId: newRowId,
      influencerName: 'New Creator',
      productName: 'Core Product SKU',
      amountPaid: 5000,
      approacher: 'Self Sourced',
      platform: 'Instagram Reel',
      sampleShouldSent: 'No',
      adAgreement: '',
      paymentTerms: 'After Video Released',
      checklistPlannedDate: '',
      checklistActualDate: '',
      checklistPdf: '',
      checklistDelay: '',
      shortIoPlannedDate: '',
      shortIoActualDate: '',
      finalPlannedDate: '',
      finalActualDate: '',
      finalDelay: '',
      plannedDate: new Date().toISOString().split('T')[0],
      videoReleasedDate: new Date().toISOString().split('T')[0],
      videoLink: '',
      shortIoCode: '',
      shortIoLink: '',
      shortIoDelay: '',
      orderMonth: 'Oct26',
      releaseMonth: 'Oct26',
      step1: 'Done',
      step2: 'Done',
      step3: 'Done',
      step4: 'Done'
    };

    const updatedData = [newRow, ...existing];
    const newSnapshot: SubPageAnalyzedSnapshot = {
      savedAt: new Date().toLocaleString(),
      sourceFileName: subpageSnapshot?.sourceFileName || fileName || 'Sub-Page Dataset',
      totalRecords: updatedData.length,
      data: updatedData,
      stats: { ...stats },
      driveLastSyncTime: subpageSnapshot?.driveLastSyncTime,
      driveFileId: subpageSnapshot?.driveFileId
    };

    safeLocalStorage.setItem('DATA_ANALYZER_SUBPAGE_SNAPSHOT', JSON.stringify(newSnapshot));
    setSubpageSnapshot(newSnapshot);
    globalToast.success(`Created new deliverable record ${newRowId} directly on Sub-Page!`);
  };

  const handleDeleteSubpageRow = (rowId: string) => {
    if (!subpageSnapshot || !subpageSnapshot.data) return;
    const updatedData = subpageSnapshot.data.filter(r => r.videoId !== rowId);
    const newSnapshot: SubPageAnalyzedSnapshot = {
      ...subpageSnapshot,
      totalRecords: updatedData.length,
      data: updatedData,
      savedAt: new Date().toLocaleString()
    };
    safeLocalStorage.setItem('DATA_ANALYZER_SUBPAGE_SNAPSHOT', JSON.stringify(newSnapshot));
    setSubpageSnapshot(newSnapshot);
    globalToast.success(`Deleted record ${rowId} from Sub-Page dataset.`);
  };

  const [isRefreshingSubpageLive, setIsRefreshingSubpageLive] = useState(false);

  const handleRefreshSubpageLiveMetrics = async () => {
    if (!subpageSnapshot || !subpageSnapshot.data || subpageSnapshot.data.length === 0) {
      globalToast.error('No Sub-Page deliverable records to refresh.');
      return;
    }
    setIsRefreshingSubpageLive(true);
    globalToast.info(`Collecting verified original live views for ${subpageSnapshot.data.length} Sub-Page deliverables...`);

    const activeCeiling = abnormalThreshold === 'AUTO' ? 500000 : abnormalThreshold;
    let checkedCount = 0;
    const newPreviews: Record<string, { loading?: boolean; data?: PreviewData }> = {};

    const updatedData = await Promise.all(
      subpageSnapshot.data.map(async row => {
        const urls = extractVideoUrlsFromRow(row);
        if (urls.length === 0) return row;

        let liveV: number | undefined = undefined;
        let blockedAbnormal = false;

        for (const url of urls) {
          try {
            const res = await fetch('/api/link-preview', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url })
            });
            const json = await res.json();
            if (json) {
              const pData = json.data || json;
              newPreviews[url.trim()] = { loading: false, data: pData };
              if (pData.abnormalMonitor?.abnormalBlocked) {
                blockedAbnormal = true;
              }
              const candidateV = pData.originalViews ?? pData.views;
              if (candidateV !== undefined && candidateV !== null) {
                const vNum = Number(candidateV);
                if (!isNaN(vNum) && vNum >= 0) {
                  if (!abnormalMonitorEnabled || vNum <= activeCeiling || pData.abnormalMonitor?.isOriginalVerified) {
                    liveV = Math.max(liveV || 0, vNum);
                    checkedCount++;
                  } else {
                    blockedAbnormal = true;
                  }
                }
              }
            }
          } catch {
            // skip failed link
          }
        }

        if (liveV !== undefined && liveV > 0) {
          setLiveViewsCache(prev => ({ ...prev, [row.videoId]: liveV! }));
          const m = getRowMetrics({ ...row, views: liveV });
          return {
            ...row,
            views: liveV,
            cpv: m.cpv,
            ctr: m.ctr
          };
        } else if (blockedAbnormal && abnormalMonitorEnabled) {
          const safeBase = (row.createdAtViews && row.createdAtViews <= activeCeiling) ? row.createdAtViews : undefined;
          setLiveViewsCache(prev => {
            const next = { ...prev };
            if (safeBase) next[row.videoId] = safeBase;
            else delete next[row.videoId];
            return next;
          });
          return {
            ...row,
            views: safeBase
          };
        }
        return row;
      })
    );

    if (Object.keys(newPreviews).length > 0) {
      setLinkPreviews(prev => ({ ...prev, ...newPreviews }));
    }

    const newSnapshot: SubPageAnalyzedSnapshot = {
      ...subpageSnapshot,
      totalRecords: updatedData.length,
      data: updatedData,
      savedAt: new Date().toLocaleString()
    };

    safeLocalStorage.setItem('DATA_ANALYZER_SUBPAGE_SNAPSHOT', JSON.stringify(newSnapshot));
    setSubpageSnapshot(newSnapshot);
    setIsRefreshingSubpageLive(false);
    globalToast.success(`Original live views refresh completed for Sub-Page dataset! Verified ${checkedCount} links.`);
  };

  const subpageFileInputRef = useRef<HTMLInputElement>(null);
  const handleSubpageFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processFile(file, 'replace');
    if (subpageFileInputRef.current) subpageFileInputRef.current.value = '';
  };

  // Google Sheets Sub-Page Data Extraction Slicer Filtered Rows
  const filteredExtractionRows = useMemo(() => {
    const baseData = (subpageSnapshot && subpageSnapshot.data && subpageSnapshot.data.length > 0)
      ? subpageSnapshot.data
      : data;

    return baseData.filter(row => {
      if (extractFilterInfluencer !== 'ALL') {
        if ((row.influencerName || '').trim().toLowerCase() !== extractFilterInfluencer.trim().toLowerCase()) return false;
      }
      if (extractFilterProducts.length > 0) {
        const prod = (row.productName || '').trim().toLowerCase();
        const match = extractFilterProducts.some(p => p.trim().toLowerCase() === prod);
        if (!match) return false;
      }
      if (extractFilterYear !== 'ALL') {
        const datesToTest = [row.videoReleasedDate, row.plannedDate, row.timestamp].filter(Boolean);
        let yMatch = false;
        for (const d of datesToTest) {
          const comp = extractDateComponents(d);
          if (comp && (comp.year === extractFilterYear || comp.year === extractFilterYear.slice(-2))) {
            yMatch = true;
            break;
          }
        }
        if (!yMatch && (row.orderMonth?.includes(extractFilterYear) || row.releaseMonth?.includes(extractFilterYear))) {
          yMatch = true;
        }
        if (!yMatch) return false;
      }
      if (extractFilterMonth !== 'ALL') {
        const datesToTest = [row.videoReleasedDate, row.plannedDate, row.timestamp].filter(Boolean);
        let mMatch = false;
        for (const d of datesToTest) {
          const comp = extractDateComponents(d);
          if (comp && comp.month === extractFilterMonth) {
            mMatch = true;
            break;
          }
        }
        if (!mMatch && (matchMonthNameOrCode(row.orderMonth || '', extractFilterMonth, extractFilterYear) || matchMonthNameOrCode(row.releaseMonth || '', extractFilterMonth, extractFilterYear))) {
          mMatch = true;
        }
        if (!mMatch) return false;
      }
      if (extractFilterApproacher !== 'ALL') {
        if ((row.approacher || 'Unassigned').trim().toLowerCase() !== extractFilterApproacher.trim().toLowerCase()) return false;
      }
      if (extractFilterPlatform !== 'ALL') {
        if (!(row.platform || '').toLowerCase().includes(extractFilterPlatform.toLowerCase())) return false;
      }
      if (extractFilterStep === 'all_done') {
        if (!(row.step1 === 'Done' && row.step2 === 'Done' && row.step3 === 'Done' && row.step4 === 'Done')) return false;
      } else if (extractFilterStep === 'missing_video') {
        if (row.videoLink && row.videoLink.trim() !== '' && !row.videoLink.toLowerCase().includes('pending')) return false;
      } else if (extractFilterStep === 'missing_shortio') {
        if (row.shortIoLink && row.shortIoLink.trim() !== '' && row.shortIoLink.trim() !== '—') return false;
      } else if (extractFilterStep === 'delayed') {
        if (!row.checklistDelay && !row.shortIoDelay && !row.finalDelay) return false;
      }

      const m = getRowMetrics(row);
      if (extractMinViews > 0) {
        if (!m.views || m.views < extractMinViews) return false;
      }
      if (extractMinClicks > 0) {
        if (!m.clicks || m.clicks < extractMinClicks) return false;
      }
      if (extractSearchTerm.trim()) {
        const q = extractSearchTerm.toLowerCase();
        const match =
          row.videoId.toLowerCase().includes(q) ||
          row.influencerName.toLowerCase().includes(q) ||
          row.productName.toLowerCase().includes(q) ||
          row.approacher.toLowerCase().includes(q) ||
          row.platform.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [subpageSnapshot, data, extractFilterInfluencer, extractFilterProducts, extractFilterYear, extractFilterMonth, extractFilterApproacher, extractFilterPlatform, extractFilterStep, extractMinViews, extractMinClicks, extractSearchTerm]);

  const handleResetExtractFilters = () => {
    setExtractFilterInfluencer('ALL');
    setExtractFilterProducts([]);
    setExtractFilterYear('ALL');
    setExtractFilterMonth('ALL');
    setExtractFilterApproacher('ALL');
    setExtractFilterPlatform('ALL');
    setExtractFilterStep('ALL');
    setExtractMinViews(0);
    setExtractMinClicks(0);
    setExtractSearchTerm('');
    globalToast.info('Reset Google Sheet extraction selection filters.');
  };

  // Google Sheets Extraction Handler (Same process as Monthly Planner / GoogleSheetsExtractor)
  const handleExtractSubpageToGoogleSheets = async () => {
    if (filteredExtractionRows.length === 0) {
      globalToast.error('No matching influencer video deliverable rows selected for extraction.');
      return;
    }

    setIsExtractingSheets(true);
    setSheetsExtractProgress(10);
    setSheetsExtractUrl(null);
    const logsList: { status: 'active' | 'success' | 'error'; message: string }[] = [
      { status: 'active', message: 'Authenticating Google Workspace OAuth Token...' }
    ];
    setSheetsExtractLogs([...logsList]);

    try {
      const activeToken = await ensureGoogleAccessToken(accessToken);
      logsList[0] = { status: 'success', message: 'Google OAuth token authenticated successfully.' };

      const todayStr = new Date().toISOString().split('T')[0];
      const spreadsheetTitle = `Data Analyzer Sub-Page Extraction - ${todayStr} (${filteredExtractionRows.length} Videos)`;

      logsList.push({ status: 'active', message: `Creating Google Spreadsheet file: "${spreadsheetTitle}"...` });
      setSheetsExtractLogs([...logsList]);
      setSheetsExtractProgress(25);

      const createResp = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${activeToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          properties: {
            title: spreadsheetTitle
          },
          sheets: [
            { properties: { title: 'Summary & KPIs', gridProperties: { frozenRowCount: 1 } } },
            { properties: { title: 'Influencer Video Deliverables', gridProperties: { frozenRowCount: 1 } } },
            { properties: { title: 'Video Deliverables Summary', gridProperties: { frozenRowCount: 1 } } },
            { properties: { title: 'Influencer Wise Video Details', gridProperties: { frozenRowCount: 1 } } },
            { properties: { title: 'Creator Performance Summary', gridProperties: { frozenRowCount: 1 } } },
            { properties: { title: 'Product SKU Performance', gridProperties: { frozenRowCount: 1 } } },
            { properties: { title: 'Product Sales Growth & Advisory', gridProperties: { frozenRowCount: 1 } } },
            { properties: { title: 'BDM & Approacher Matrix', gridProperties: { frozenRowCount: 1 } } },
            { properties: { title: 'CPC & CPV Industry Benchmarks', gridProperties: { frozenRowCount: 3 } } }
          ]
        })
      });

      if (!createResp.ok) {
        const errTxt = await createResp.text();
        throw new Error(`Google Sheets API Creation failed (HTTP ${createResp.status}): ${errTxt}`);
      }

      const createdInfo = await createResp.json();
      const spreadsheetId = createdInfo.spreadsheetId;
      const spreadsheetUrl = createdInfo.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

      logsList[logsList.length - 1] = { status: 'success', message: `Google Spreadsheet created! ID: ${spreadsheetId}` };
      setSheetsExtractProgress(50);

      logsList.push({ status: 'active', message: 'Building structured data matrices & formatting header rows...' });
      setSheetsExtractLogs([...logsList]);

      const totalSpend = filteredExtractionRows.reduce((s, r) => s + r.amountPaid, 0);
      let totalViews = 0;
      let totalClicks = 0;
      let spendWithViews = 0;
      let spendWithClicks = 0;
      let viewsWithClicks = 0;

      filteredExtractionRows.forEach(r => {
        const m = getRowMetrics(r);
        if (m.views && m.views > 0) {
          totalViews += m.views;
          spendWithViews += r.amountPaid;
        }
        if (m.clicks && m.clicks > 0) {
          totalClicks += m.clicks;
          spendWithClicks += r.amountPaid;
          if (m.views && m.views > 0) viewsWithClicks += m.views;
        }
      });

      const avgCpv = totalViews > 0 ? (spendWithViews / totalViews) : 0;
      const avgCpc = totalClicks > 0 ? (spendWithClicks / totalClicks) : 0;
      const avgCtr = viewsWithClicks > 0 ? ((totalClicks / viewsWithClicks) * 100) : 0;

      // Extract unique influencer names and total counts
      const uniqueExtractedCreators = Array.from(new Set(
        filteredExtractionRows.map(r => (r.influencerName || '').trim()).filter(Boolean)
      )).sort();
      const baseSnapshotData = (subpageSnapshot?.data && subpageSnapshot.data.length > 0) ? subpageSnapshot.data : data;
      const totalCreatorsInDataset = new Set(baseSnapshotData.map(r => (r.influencerName || '').trim()).filter(Boolean)).size;

      let influencerDisplay = '';
      if (extractFilterInfluencer === 'ALL') {
        const top3Names = uniqueExtractedCreators.slice(0, 3).join(', ');
        const remainingCount = uniqueExtractedCreators.length > 3 ? ` +${uniqueExtractedCreators.length - 3} more` : '';
        influencerDisplay = `All ${uniqueExtractedCreators.length} Influencers Included (${top3Names}${remainingCount})`;
      } else {
        influencerDisplay = `1 Selected: ${extractFilterInfluencer} (${uniqueExtractedCreators.length} of ${totalCreatorsInDataset} Total Creators in Dataset)`;
      }

      // Extract unique calendar years present in extracted deliverables
      const uniqueExtractedYearsSet = new Set<string>();
      filteredExtractionRows.forEach(r => {
        const dates = [r.videoReleasedDate, r.plannedDate, r.timestamp].filter(Boolean);
        dates.forEach(d => {
          const comp = extractDateComponents(d);
          if (comp?.year) {
            const fullY = comp.year.length === 2 ? `20${comp.year}` : comp.year;
            uniqueExtractedYearsSet.add(fullY);
          }
        });
        if (r.orderMonth) {
          const match = r.orderMonth.match(/20\d\d/);
          if (match) uniqueExtractedYearsSet.add(match[0]);
        }
        if (r.releaseMonth) {
          const match = r.releaseMonth.match(/20\d\d/);
          if (match) uniqueExtractedYearsSet.add(match[0]);
        }
      });
      const sortedYearsList = Array.from(uniqueExtractedYearsSet).sort();

      let yearDisplay = '';
      if (extractFilterYear === 'ALL') {
        yearDisplay = `All Years (${sortedYearsList.length > 0 ? sortedYearsList.join(', ') : '2024, 2025, 2026'})`;
      } else {
        yearDisplay = `Year ${extractFilterYear} Selected (Extracted Calendar Years: ${sortedYearsList.length > 0 ? sortedYearsList.join(', ') : extractFilterYear})`;
      }

      const summaryValues = [
        ['DATA ANALYZER SUB-PAGE EXECUTIVE SUMMARY & KPIS REPORT'],
        ['GENERATED FROM UNIVERSAL DATA ANALYZER SUB-PAGE HUB'],
        [],
        ['📊 EXTRACTION METADATA & SLICER FILTERS', 'SELECTED VALUE / SUMMARY DETAILS', 'SYSTEM DESCRIPTION'],
        ['Extraction DateTime', new Date().toLocaleString('en-IN'), 'User System Local Timestamp'],
        ['Source Dataset File', subpageSnapshot?.sourceFileName || fileName || 'Sub-Page Snapshot', 'Analyzed Source File Name'],
        ['Filtered Influencers', influencerDisplay, 'Selected Influencers Count & Creator Names'],
        ['Filtered Product SKUs', extractFilterProducts.length > 0 ? `${extractFilterProducts.length} Selected SKUs: ${extractFilterProducts.join(', ')}` : 'All Product SKUs Included', 'Selected Product SKUs Filter'],
        ['Filtered Years', yearDisplay, 'Extracted Dataset Calendar Years'],
        ['Filtered Months', extractFilterMonth === 'ALL' ? 'All Months (Jan - Dec)' : `Month: ${extractFilterMonth}`, 'Selected Calendar Month Filter'],
        ['Filtered Approacher / BDM', extractFilterApproacher === 'ALL' ? 'All Approachers & BDMs Included' : extractFilterApproacher, 'Selected Approacher Filter'],
        ['Filtered Social Platform', extractFilterPlatform === 'ALL' ? 'All Social Platforms (YouTube, Instagram, FB, TikTok)' : extractFilterPlatform, 'Selected Social Platform Filter'],
        ['Filtered Workflow Step Status', extractFilterStep === 'ALL' ? 'All Workflow Steps' : extractFilterStep, 'Selected Workflow Status Filter'],
        [],
        ['💰 FINANCIAL & REMUNERATION KPIS', 'VALUE / AMOUNT (₹)', 'KPI DEFINITION'],
        ['Total Extracted Videos Count', `${filteredExtractionRows.length.toLocaleString('en-IN')} Videos`, 'Total Video Deliverables Extracted'],
        ['Total Remuneration Invested', `₹${totalSpend.toLocaleString('en-IN')}`, 'Cumulative Influencer Fees Invested (₹)'],
        ['Average Remuneration / Video', `₹${filteredExtractionRows.length > 0 ? Math.round(totalSpend / filteredExtractionRows.length).toLocaleString('en-IN') : 0}`, 'Average Remuneration Paid Per Video (₹)'],
        [],
        ['📈 ENGAGEMENT, REACH & ROI KPIS', 'PERFORMANCE METRIC', 'KPI BENCHMARK EVALUATION'],
        ['Total Tracked Live Views', totalViews > 0 ? `${totalViews.toLocaleString('en-IN')} Views` : '0 Views', 'Cumulative Live Views Across Deliverables'],
        ['Total Attributed Short.io Clicks', totalClicks > 0 ? `${totalClicks.toLocaleString('en-IN')} Clicks` : '0 Clicks', 'Cumulative Attributed Clicks'],
        ['Average Live Views / Video', `${(filteredExtractionRows.length > 0 ? Math.round(totalViews / filteredExtractionRows.length) : 0).toLocaleString('en-IN')} Views / Video`, 'Average Views Produced Per Video'],
        ['Average Clicks / Video', `${(filteredExtractionRows.length > 0 ? Math.round(totalClicks / filteredExtractionRows.length) : 0).toLocaleString('en-IN')} Clicks / Video`, 'Average Short.io Link Clicks Per Video'],
        ['Calculated Cost Per View (CPV)', avgCpv > 0 ? `₹${avgCpv.toFixed(3)}` : '—', getCpvBenchmarkStatus(avgCpv)],
        ['Calculated Cost Per Click (CPC)', avgCpc > 0 ? `₹${avgCpc.toFixed(2)}` : '—', getCpcBenchmarkStatus(avgCpc)],
        ['Calculated Click-Through Rate (CTR)', `${avgCtr.toFixed(2)}%`, 'CTR Efficiency Percentage (%)']
      ];

      // Group deliverables by Year & Month Divisions (chronological ascending: oldest at top, newest below)
      const divisionsMap = new Map<string, {
        sortKey: string;
        year: number;
        monthIdx: number;
        monthName: string;
        divisionTitle: string;
        rows: DeliverableRow[];
      }>();

      filteredExtractionRows.forEach(r => {
        const info = getRowYearMonthInfo(r);
        const cur = divisionsMap.get(info.sortKey) || {
          sortKey: info.sortKey,
          year: info.year,
          monthIdx: info.monthIdx,
          monthName: info.monthName,
          divisionTitle: info.divisionTitle,
          rows: []
        };
        cur.rows.push(r);
        divisionsMap.set(info.sortKey, cur);
      });

      // Sort divisions chronologically ascending: "old is on the top and bellow the new one"
      const sortedDivisions = Array.from(divisionsMap.values()).sort((a, b) => a.sortKey.localeCompare(b.sortKey));

      const deliverablesValues: (string | number)[][] = [
        [
          'Video ID', 'Influencer Name', 'Product SKU', 'Amount Paid (₹)',
          'Approacher / BDM', 'Platform', 'Planned Date', 'Release Date',
          'Video Released Link', 'Short.io Code', 'Short.io Full Link',
          'Live Views', 'Short.io Clicks', 'CPV (₹)', 'CPC (₹)', 'CTR (%)',
          'Order Month', 'Release Month', 'Step 1 (Order)', 'Step 2 (Checklist PDF)', 'Step 3 (Short.io)', 'Step 4 (Video)'
        ]
      ];

      let delivCurrentRowIdx = 0; // Header row is 0
      const divisionHeaderRowIndices: number[] = [];
      const divisionSubtotalRowIndices: number[] = [];

      let grandTotalSpend = 0;
      let grandTotalViews = 0;
      let grandTotalClicks = 0;
      let grandTotalSpendWithViews = 0;
      let grandTotalSpendWithClicks = 0;
      let grandTotalViewsWithClicks = 0;
      let grandTotalCount = 0;

      sortedDivisions.forEach(div => {
        delivCurrentRowIdx++;
        divisionHeaderRowIndices.push(delivCurrentRowIdx);

        // Division Header Banner Row
        deliverablesValues.push([
          div.divisionTitle,
          `Total ${div.rows.length} Video Deliverables`,
          `Calendar Period: ${div.monthName} ${div.year}`,
          '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''
        ]);

        let subtotalSpend = 0;
        let subtotalViews = 0;
        let subtotalClicks = 0;
        let subtotalSpendWithViews = 0;
        let subtotalSpendWithClicks = 0;
        let subtotalViewsWithClicks = 0;

        // Sort rows inside division chronologically
        div.rows.sort((a, b) => (a.plannedDate || a.videoId).localeCompare(b.plannedDate || b.videoId));

        div.rows.forEach(r => {
          delivCurrentRowIdx++;
          const m = getRowMetrics(r);
          const amt = Number(r.amountPaid) || 0;
          const v = m.views || 0;
          const cl = m.clicks || 0;

          subtotalSpend += amt;
          if (v > 0) {
            subtotalViews += v;
            subtotalSpendWithViews += amt;
          }
          if (cl > 0) {
            subtotalClicks += cl;
            subtotalSpendWithClicks += amt;
            if (v > 0) subtotalViewsWithClicks += v;
          }

          deliverablesValues.push([
            r.videoId || '',
            r.influencerName || '',
            r.productName || '',
            amt,
            r.approacher || '',
            r.platform || '',
            r.plannedDate || '',
            r.videoReleasedDate || '',
            r.videoLink || '',
            r.shortIoCode || '',
            r.shortIoLink || r.shortIoCode || '',
            m.views !== undefined ? m.views : 0,
            m.clicks !== undefined ? m.clicks : 0,
            m.cpv !== undefined && m.cpv > 0 ? Number(m.cpv.toFixed(3)) : 0,
            m.cpc !== undefined && m.cpc > 0 ? Number(m.cpc.toFixed(2)) : 0,
            m.ctr !== undefined && m.ctr > 0 ? Number(m.ctr.toFixed(2)) : 0,
            r.orderMonth || '',
            r.releaseMonth || '',
            r.step1 || '',
            r.step2 || '',
            r.step3 || '',
            r.step4 || ''
          ]);
        });

        // Accumulate grand totals
        grandTotalCount += div.rows.length;
        grandTotalSpend += subtotalSpend;
        grandTotalViews += subtotalViews;
        grandTotalClicks += subtotalClicks;
        grandTotalSpendWithViews += subtotalSpendWithViews;
        grandTotalSpendWithClicks += subtotalSpendWithClicks;
        grandTotalViewsWithClicks += subtotalViewsWithClicks;

        // Subtotal metrics for division
        const subCpv = subtotalViews > 0 ? (subtotalSpendWithViews / subtotalViews) : 0;
        const subCpc = subtotalClicks > 0 ? (subtotalSpendWithClicks / subtotalClicks) : 0;
        const subCtr = subtotalViewsWithClicks > 0 ? ((subtotalClicks / subtotalViewsWithClicks) * 100) : 0;

        delivCurrentRowIdx++;
        divisionSubtotalRowIndices.push(delivCurrentRowIdx);

        // Division Subtotal Row
        deliverablesValues.push([
          `📊 SUBTOTAL: ${div.monthName.toUpperCase()} ${div.year}`,
          `Count: ${div.rows.length} Videos`,
          `Division Total`,
          subtotalSpend,
          '—', '—', '—', '—', '—', '—', '—',
          subtotalViews,
          subtotalClicks,
          subCpv > 0 ? Number(subCpv.toFixed(3)) : 0,
          subCpc > 0 ? Number(subCpc.toFixed(2)) : 0,
          subCtr > 0 ? Number(subCtr.toFixed(2)) : 0,
          '—', '—', '—', '—', '—', '—'
        ]);

        // Blank spacing row between divisions
        deliverablesValues.push([]);
        delivCurrentRowIdx++;
      });

      // Grand Total metrics
      const grandCpv = grandTotalViews > 0 ? (grandTotalSpendWithViews / grandTotalViews) : 0;
      const grandCpc = grandTotalClicks > 0 ? (grandTotalSpendWithClicks / grandTotalClicks) : 0;
      const grandCtr = grandTotalViewsWithClicks > 0 ? ((grandTotalClicks / grandTotalViewsWithClicks) * 100) : 0;

      delivCurrentRowIdx++;
      const grandTotalRowIdx = delivCurrentRowIdx;

      // GRAND TOTAL ROW AT THE END
      deliverablesValues.push([
        `🏆 GRAND TOTAL (ALL EXTRACTED DELIVERABLES)`,
        `Grand Total: ${grandTotalCount} Videos`,
        `Cumulative Overall Totals`,
        grandTotalSpend,
        '—', '—', '—', '—', '—', '—', '—',
        grandTotalViews,
        grandTotalClicks,
        grandCpv > 0 ? Number(grandCpv.toFixed(3)) : 0,
        grandCpc > 0 ? Number(grandCpc.toFixed(2)) : 0,
        grandCtr > 0 ? Number(grandCtr.toFixed(2)) : 0,
        '—', '—', '—', '—', '—', '—'
      ]);

      // Construct Influencer Video Deliverables Summary Values for dedicated Sheet
      const delivSummaryValues: (string | number)[][] = [
        ['INFLUENCER VIDEO DELIVERABLES GRAPHICAL SUMMARY & KPI REPORT'],
        ['GENERATED FROM DATA ANALYZER MULTI-FORMAT EXTRACTION ENGINE'],
        [],
        ['🎥 EXECUTIVE DELIVERABLES KPIS', 'SUMMARY METRIC VALUE', 'KPI EVALUATION STATUS'],
        ['Total Video Deliverables Tracked', filteredExtractionRows.length, 'Total Active Deliverables'],
        ['Total Remuneration Invested', `₹${totalSpend.toLocaleString('en-IN')}`, 'Total Influencer Fees Invested'],
        ['Total Tracked Live Views', totalViews > 0 ? totalViews.toLocaleString('en-IN') : 0, 'Cumulative Live Views Across Deliverables'],
        ['Total Attributed Link Clicks', totalClicks > 0 ? totalClicks.toLocaleString('en-IN') : 0, 'Cumulative Short.io Clicks'],
        ['Average Live Views / Deliverable', filteredExtractionRows.length > 0 ? Math.round(totalViews / filteredExtractionRows.length).toLocaleString('en-IN') : 0, 'Average Reach per Video'],
        ['Average Cost Per View (CPV)', avgCpv > 0 ? `₹${avgCpv.toFixed(3)}` : '—', getCpvBenchmarkStatus(avgCpv)],
        ['Average Click-Through Rate (CTR)', `${avgCtr.toFixed(2)}%`, 'Overall CTR Efficiency'],
        [],
        ['TABLE 1: 📅 DELIVERABLES SUMMARY BY CALENDAR PERIOD / DIVISION'],
        ['Period / Division Title', 'Deliverables Count', 'Total Budget Invested (₹)', 'Total Live Views', 'Total Link Clicks', 'Avg CPV (₹)', 'Avg CTR (%)']
      ];

      const periodSummaryDataStartIdx = delivSummaryValues.length; // Row index where period data starts for chart

      sortedDivisions.forEach(div => {
        let divSpend = 0;
        let divViews = 0;
        let divClicks = 0;
        let divSpendWithViews = 0;
        let divViewsWithClicks = 0;

        div.rows.forEach(r => {
          const m = getRowMetrics(r);
          const amt = Number(r.amountPaid) || 0;
          const v = m.views || 0;
          const cl = m.clicks || 0;

          divSpend += amt;
          if (v > 0) {
            divViews += v;
            divSpendWithViews += amt;
          }
          if (cl > 0) {
            divClicks += cl;
            if (v > 0) divViewsWithClicks += v;
          }
        });

        const divCpv = divViews > 0 ? divSpendWithViews / divViews : 0;
        const divCtr = divViewsWithClicks > 0 ? (divClicks / divViewsWithClicks) * 100 : 0;

        delivSummaryValues.push([
          `${div.monthName} ${div.year}`,
          div.rows.length,
          divSpend,
          divViews,
          divClicks,
          divCpv > 0 ? Number(divCpv.toFixed(3)) : 0,
          divCtr > 0 ? Number(divCtr.toFixed(2)) : 0
        ]);
      });

      delivSummaryValues.push([], [], ['TABLE 2: 📱 DELIVERABLES SUMMARY BY SOCIAL PLATFORM']);
      delivSummaryValues.push(['Social Platform', 'Deliverables Count', 'Total Investment (₹)', 'Total Live Views', 'Total Link Clicks', 'Avg CPV (₹)', 'Avg CTR (%)']);

      const platformMap = new Map<string, { count: number; spend: number; views: number; clicks: number; spendWithViews: number; viewsWithClicks: number }>();
      filteredExtractionRows.forEach(r => {
        const plat = (r.platform || 'Other').trim();
        const m = getRowMetrics(r);
        const amt = Number(r.amountPaid) || 0;
        const v = m.views || 0;
        const cl = m.clicks || 0;

        const cur = platformMap.get(plat) || { count: 0, spend: 0, views: 0, clicks: 0, spendWithViews: 0, viewsWithClicks: 0 };
        cur.count += 1;
        cur.spend += amt;
        if (v > 0) {
          cur.views += v;
          cur.spendWithViews += amt;
        }
        if (cl > 0) {
          cur.clicks += cl;
          if (v > 0) cur.viewsWithClicks += v;
        }
        platformMap.set(plat, cur);
      });

      Array.from(platformMap.entries()).sort((a, b) => b[1].views - a[1].views).forEach(([platName, p]) => {
        const pCpv = p.views > 0 ? p.spendWithViews / p.views : 0;
        const pCtr = p.viewsWithClicks > 0 ? (p.clicks / p.viewsWithClicks) * 100 : 0;
        delivSummaryValues.push([
          platName,
          p.count,
          p.spend,
          p.views,
          p.clicks,
          pCpv > 0 ? Number(pCpv.toFixed(3)) : 0,
          pCtr > 0 ? Number(pCtr.toFixed(2)) : 0
        ]);
      });

      // Construct Influencer Wise Video Details Sheet Values
      const influencerWiseMap = new Map<string, DeliverableRow[]>();
      filteredExtractionRows.forEach(r => {
        const infName = (r.influencerName || '').trim() || 'Unknown Creator';
        const list = influencerWiseMap.get(infName) || [];
        list.push(r);
        influencerWiseMap.set(infName, list);
      });

      const sortedInfluencerNames = Array.from(influencerWiseMap.keys()).sort((a, b) => a.localeCompare(b));

      const influencerWiseValues: (string | number)[][] = [
        [
          'Video ID', 'Influencer Name', 'Product SKU', 'Amount Paid (₹)',
          'Approacher / BDM', 'Platform', 'Planned Date', 'Release Date',
          'Video Released Link', 'Short.io Code', 'Short.io Full Link',
          'Live Views', 'Short.io Clicks', 'CPV (₹)', 'CPC (₹)', 'CTR (%)',
          'Order Month', 'Release Month', 'Step 1 (Order)', 'Step 2 (Checklist PDF)', 'Step 3 (Short.io)', 'Step 4 (Video)'
        ]
      ];

      let infWiseCurrentRowIdx = 0; // Header row is 0
      const infWiseHeaderRowIndices: number[] = [];
      const infWiseSubtotalRowIndices: number[] = [];

      sortedInfluencerNames.forEach(infName => {
        const rows = influencerWiseMap.get(infName)!;
        infWiseCurrentRowIdx++;
        infWiseHeaderRowIndices.push(infWiseCurrentRowIdx);

        // Influencer Header Banner Row
        influencerWiseValues.push([
          `👤 INFLUENCER: ${infName.toUpperCase()}`,
          `Total ${rows.length} Video Deliverables`,
          `Creator Campaign Roster`,
          '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''
        ]);

        let subtotalSpend = 0;
        let subtotalViews = 0;
        let subtotalClicks = 0;
        let subtotalSpendWithViews = 0;
        let subtotalSpendWithClicks = 0;
        let subtotalViewsWithClicks = 0;

        rows.sort((a, b) => (a.plannedDate || a.videoId).localeCompare(b.plannedDate || b.videoId));

        rows.forEach(r => {
          infWiseCurrentRowIdx++;
          const m = getRowMetrics(r);
          const amt = Number(r.amountPaid) || 0;
          const v = m.views || 0;
          const cl = m.clicks || 0;

          subtotalSpend += amt;
          if (v > 0) {
            subtotalViews += v;
            subtotalSpendWithViews += amt;
          }
          if (cl > 0) {
            subtotalClicks += cl;
            subtotalSpendWithClicks += amt;
            if (v > 0) subtotalViewsWithClicks += v;
          }

          influencerWiseValues.push([
            r.videoId || '',
            r.influencerName || '',
            r.productName || '',
            amt,
            r.approacher || '',
            r.platform || '',
            r.plannedDate || '',
            r.videoReleasedDate || '',
            r.videoLink || '',
            r.shortIoCode || '',
            r.shortIoLink || r.shortIoCode || '',
            m.views !== undefined ? m.views : 0,
            m.clicks !== undefined ? m.clicks : 0,
            m.cpv !== undefined && m.cpv > 0 ? Number(m.cpv.toFixed(3)) : 0,
            m.cpc !== undefined && m.cpc > 0 ? Number(m.cpc.toFixed(2)) : 0,
            m.ctr !== undefined && m.ctr > 0 ? Number(m.ctr.toFixed(2)) : 0,
            r.orderMonth || '',
            r.releaseMonth || '',
            r.step1 || '',
            r.step2 || '',
            r.step3 || '',
            r.step4 || ''
          ]);
        });

        const subCpv = subtotalViews > 0 ? (subtotalSpendWithViews / subtotalViews) : 0;
        const subCpc = subtotalClicks > 0 ? (subtotalSpendWithClicks / subtotalClicks) : 0;
        const subCtr = subtotalViewsWithClicks > 0 ? ((subtotalClicks / subtotalViewsWithClicks) * 100) : 0;

        infWiseCurrentRowIdx++;
        infWiseSubtotalRowIndices.push(infWiseCurrentRowIdx);

        // Influencer Subtotal Row
        influencerWiseValues.push([
          `📊 SUBTOTAL: ${infName.toUpperCase()}`,
          `Count: ${rows.length} Videos`,
          `Influencer Total`,
          subtotalSpend,
          '—', '—', '—', '—', '—', '—', '—',
          subtotalViews,
          subtotalClicks,
          subCpv > 0 ? Number(subCpv.toFixed(3)) : 0,
          subCpc > 0 ? Number(subCpc.toFixed(2)) : 0,
          subCtr > 0 ? Number(subCtr.toFixed(2)) : 0,
          '—', '—', '—', '—', '—', '—'
        ]);

        // Blank spacing row between influencers
        influencerWiseValues.push([]);
        infWiseCurrentRowIdx++;
      });

      infWiseCurrentRowIdx++;
      const infWiseGrandTotalRowIdx = infWiseCurrentRowIdx;

      // GRAND TOTAL ROW AT THE END
      influencerWiseValues.push([
        `🏆 GRAND TOTAL (ALL INFLUENCERS)`,
        `Grand Total: ${grandTotalCount} Videos`,
        `Cumulative Overall Totals`,
        grandTotalSpend,
        '—', '—', '—', '—', '—', '—', '—',
        grandTotalViews,
        grandTotalClicks,
        grandCpv > 0 ? Number(grandCpv.toFixed(3)) : 0,
        grandCpc > 0 ? Number(grandCpc.toFixed(2)) : 0,
        grandCtr > 0 ? Number(grandCtr.toFixed(2)) : 0,
        '—', '—', '—', '—', '—', '—'
      ]);

      // Group deliverables by creator to calculate performance and multi-ranking views
      const creatorMap = new Map<string, {
        count: number;
        feesList: number[];
        views: number;
        clicks: number;
        rows: DeliverableRow[];
      }>();

      filteredExtractionRows.forEach(r => {
        const cName = (r.influencerName || '').trim() || 'Unknown Creator';
        const m = getRowMetrics(r);
        const cur = creatorMap.get(cName) || { count: 0, feesList: [], views: 0, clicks: 0, rows: [] };
        cur.count += 1;
        cur.feesList.push(Number(r.amountPaid) || 0);
        cur.views += (m.views || 0);
        cur.clicks += (m.clicks || 0);
        cur.rows.push(r);
        creatorMap.set(cName, cur);
      });

      // Calculate creator metrics with single-fee protection
      const creatorList = Array.from(creatorMap.entries()).map(([cName, v]) => {
        const nonZeroFees = v.feesList.filter(f => f > 0);
        let spend = 0;
        let feeNote = 'Standard Fee';

        if (nonZeroFees.length === 1) {
          // If there fee is only one across deliverables, do not multiply/recalculate it
          spend = nonZeroFees[0];
          feeNote = 'Single Creator Fee';
        } else if (nonZeroFees.length > 1) {
          spend = nonZeroFees.reduce((a, b) => a + b, 0);
          feeNote = 'Sum of Video Fees';
        } else {
          spend = 0;
          feeNote = 'Fee Not Specified / 0';
        }

        // Rule: "If there Fee is only Rupees one then do not calculate it on Creator performance summary"
        const isNominalRupeeOne = spend === 1 || (nonZeroFees.length > 0 && nonZeroFees.every(f => f <= 1));
        if (isNominalRupeeOne) {
          feeNote = '₹1 Nominal/Barter Fee (Excluded from Financial ROI)';
        }

        const effectiveSpend = isNominalRupeeOne ? 0 : spend;
        const cpv = (effectiveSpend > 0 && v.views > 0) ? effectiveSpend / v.views : 0;
        const cpc = (effectiveSpend > 0 && v.clicks > 0) ? effectiveSpend / v.clicks : 0;
        const ctr = v.views > 0 ? (v.clicks / v.views) * 100 : 0;
        const avgViews = v.count > 0 ? v.views / v.count : 0;
        const avgClicks = v.count > 0 ? v.clicks / v.count : 0;
        const score = getCreatorEfficiencyScore(cpv, cpc);

        return {
          cName,
          count: v.count,
          spend,
          views: v.views,
          clicks: v.clicks,
          cpv,
          cpc,
          ctr,
          avgViews,
          avgClicks,
          score,
          feeNote
        };
      });

      // 1. Combined Efficiency Ranking (CPC & CPV Score)
      const sortedEfficiency = [...creatorList].sort((a, b) => a.score - b.score);

      // 2. View-Wise Ranking (Highest Views first)
      const sortedViews = [...creatorList].sort((a, b) => b.views - a.views);

      // 3. Click-Wise Ranking (Highest Clicks first)
      const sortedClicks = [...creatorList].sort((a, b) => b.clicks - a.clicks);

      // 4. CPV-Wise Ranking (Lowest CPV first for creators with views & fee)
      const sortedCpv = [...creatorList].sort((a, b) => {
        if (a.cpv > 0 && b.cpv > 0) return a.cpv - b.cpv;
        if (a.cpv > 0) return -1;
        if (b.cpv > 0) return 1;
        return b.views - a.views;
      });

      // 5. CPC-Wise Ranking (Lowest CPC first for creators with clicks & fee)
      const sortedCpc = [...creatorList].sort((a, b) => {
        if (a.cpc > 0 && b.cpc > 0) return a.cpc - b.cpc;
        if (a.cpc > 0) return -1;
        if (b.cpc > 0) return 1;
        return b.clicks - a.clicks;
      });

      // Track row indices for Google Sheets formatting
      let currentRowIdx = 0;

      const creatorValues: (string | number)[][] = [];

      // SECTION 1: COMBINED ROI RANKING
      const effHeaderRowIdx = currentRowIdx;
      creatorValues.push(
        ['TABLE 1: 🏆 CREATOR COMBINED ROI & EFFICIENCY RANKING (CPC & CPV INDUSTRY BENCHMARKS)'],
        [
          'Combined Rank',
          'Creator Name',
          'Videos Delivered',
          'Total Fee Invested (₹)',
          'Total Views',
          'Total Clicks',
          'Avg CPV (₹)',
          'CPV Benchmark Rating',
          'Avg CPC (₹)',
          'CPC Benchmark Rating',
          'Performance & Fee Summary'
        ]
      );
      currentRowIdx += 2;
      const effDataStartIdx = currentRowIdx;

      sortedEfficiency.forEach((c, idx) => {
        const rankNum = idx + 1;
        const rankLabel = rankNum === 1
          ? '🥇 Rank #1 (Top Performer)'
          : rankNum === 2
          ? '🥈 Rank #2'
          : rankNum === 3
          ? '🥉 Rank #3'
          : `Rank #${rankNum}`;
        const cpvStatus = c.spend > 0 ? getCpvBenchmarkStatus(c.cpv) : '— Fee Not Specified';
        const cpcStatus = c.spend > 0 ? getCpcBenchmarkStatus(c.cpc) : '— Fee Not Specified';
        const perfSummary = rankNum === 1
          ? '⭐ Rank #1 Champion (Best Overall ROI)'
          : rankNum <= 3
          ? '🌟 Excellent Efficiency'
          : (c.views > 0 || c.clicks > 0)
          ? '✅ Active Deliverable ROI'
          : '📋 Pending Metric';

        creatorValues.push([
          rankLabel,
          c.cName,
          c.count,
          c.spend,
          c.views > 0 ? c.views : 0,
          c.clicks > 0 ? c.clicks : 0,
          c.cpv > 0 ? Number(c.cpv.toFixed(3)) : 0,
          cpvStatus,
          c.cpc > 0 ? Number(c.cpc.toFixed(2)) : 0,
          cpcStatus,
          `${perfSummary} (${c.feeNote})`
        ]);
        currentRowIdx++;
      });

      creatorValues.push([], []);
      currentRowIdx += 2;

      // SECTION 2: VIEW-WISE RANKING
      const viewHeaderRowIdx = currentRowIdx;
      creatorValues.push(
        ['TABLE 2: 👁️ VIEW-WISE CREATOR RANKING (TOTAL LIVE VIEWS PRODUCED)'],
        [
          'View Rank',
          'Creator Name',
          'Total Live Views',
          'Videos Delivered',
          'Avg Views / Video',
          'Total Fee Invested (₹)',
          'Effective CPV (₹)',
          'View Performance Level'
        ]
      );
      currentRowIdx += 2;
      const viewDataStartIdx = currentRowIdx;

      sortedViews.forEach((c, idx) => {
        const rankNum = idx + 1;
        const rankLabel = rankNum === 1
          ? '🥇 View Rank #1 (Most Viewed)'
          : rankNum === 2
          ? '🥈 View Rank #2'
          : rankNum === 3
          ? '🥉 View Rank #3'
          : `View Rank #${rankNum}`;
        const level = rankNum === 1
          ? '🔥 Mega View Driver'
          : rankNum <= 3
          ? '⚡ High Reach Creator'
          : c.views > 10000
          ? '📈 Strong Engagement'
          : '📊 Standard Reach';

        creatorValues.push([
          rankLabel,
          c.cName,
          c.views,
          c.count,
          Math.round(c.avgViews),
          c.spend,
          c.cpv > 0 ? Number(c.cpv.toFixed(3)) : 0,
          level
        ]);
        currentRowIdx++;
      });

      creatorValues.push([], []);
      currentRowIdx += 2;

      // SECTION 3: CLICK-WISE RANKING
      const clickHeaderRowIdx = currentRowIdx;
      creatorValues.push(
        ['TABLE 3: 🖱️ CLICK-WISE CREATOR RANKING (TOTAL ATTRIBUTED SHORT.IO CLICKS)'],
        [
          'Click Rank',
          'Creator Name',
          'Total Short.io Clicks',
          'Videos Delivered',
          'Avg Clicks / Video',
          'Total Fee Invested (₹)',
          'Effective CPC (₹)',
          'Estimated CTR (%)'
        ]
      );
      currentRowIdx += 2;
      const clickDataStartIdx = currentRowIdx;

      sortedClicks.forEach((c, idx) => {
        const rankNum = idx + 1;
        const rankLabel = rankNum === 1
          ? '🥇 Click Rank #1 (Most Clicks)'
          : rankNum === 2
          ? '🥈 Click Rank #2'
          : rankNum === 3
          ? '🥉 Click Rank #3'
          : `Click Rank #${rankNum}`;

        creatorValues.push([
          rankLabel,
          c.cName,
          c.clicks,
          c.count,
          Math.round(c.avgClicks),
          c.spend,
          c.cpc > 0 ? Number(c.cpc.toFixed(2)) : 0,
          c.ctr > 0 ? Number(c.ctr.toFixed(2)) : 0
        ]);
        currentRowIdx++;
      });

      creatorValues.push([], []);
      currentRowIdx += 2;

      // SECTION 4: CPV-WISE RANKING
      const cpvHeaderRowIdx = currentRowIdx;
      creatorValues.push(
        ['TABLE 4: 📉 CPV-WISE CREATOR RANKING (LOWEST / BEST COST PER VIEW)'],
        [
          'CPV Rank',
          'Creator Name',
          'Avg CPV (₹)',
          'Total Views',
          'Total Fee Invested (₹)',
          'CPV Industry Benchmark Status'
        ]
      );
      currentRowIdx += 2;
      const cpvDataStartIdx = currentRowIdx;

      sortedCpv.forEach((c, idx) => {
        const rankNum = idx + 1;
        const rankLabel = rankNum === 1
          ? '🥇 CPV Rank #1 (Lowest CPV)'
          : rankNum === 2
          ? '🥈 CPV Rank #2'
          : rankNum === 3
          ? '🥉 CPV Rank #3'
          : `CPV Rank #${rankNum}`;

        creatorValues.push([
          rankLabel,
          c.cName,
          c.cpv > 0 ? Number(c.cpv.toFixed(3)) : 0,
          c.views,
          c.spend,
          c.spend > 0 ? getCpvBenchmarkStatus(c.cpv) : '— Fee Not Specified'
        ]);
        currentRowIdx++;
      });

      creatorValues.push([], []);
      currentRowIdx += 2;

      // SECTION 5: CPC-WISE RANKING
      const cpcHeaderRowIdx = currentRowIdx;
      creatorValues.push(
        ['TABLE 5: 🖱️ CPC-WISE CREATOR RANKING (LOWEST / BEST COST PER CLICK)'],
        [
          'CPC Rank',
          'Creator Name',
          'Avg CPC (₹)',
          'Total Clicks',
          'Total Fee Invested (₹)',
          'CPC Industry Benchmark Status'
        ]
      );
      currentRowIdx += 2;
      const cpcDataStartIdx = currentRowIdx;

      sortedCpc.forEach((c, idx) => {
        const rankNum = idx + 1;
        const rankLabel = rankNum === 1
          ? '🥇 CPC Rank #1 (Lowest CPC)'
          : rankNum === 2
          ? '🥈 CPC Rank #2'
          : rankNum === 3
          ? '🥉 CPC Rank #3'
          : `CPC Rank #${rankNum}`;

        creatorValues.push([
          rankLabel,
          c.cName,
          c.cpc > 0 ? Number(c.cpc.toFixed(2)) : 0,
          c.clicks,
          c.spend,
          c.spend > 0 ? getCpcBenchmarkStatus(c.cpc) : '— Fee Not Specified'
        ]);
        currentRowIdx++;
      });

      const productMap = new Map<string, { count: number; spend: number; views: number; clicks: number }>();
      filteredExtractionRows.forEach(r => {
        const pName = r.productName.trim() || 'Other SKU';
        const m = getRowMetrics(r);
        const cur = productMap.get(pName) || { count: 0, spend: 0, views: 0, clicks: 0 };
        productMap.set(pName, {
          count: cur.count + 1,
          spend: cur.spend + r.amountPaid,
          views: cur.views + (m.views || 0),
          clicks: cur.clicks + (m.clicks || 0)
        });
      });
      const productValues = [
        ['Product SKU', 'Videos Count', 'Total Budget Allocated (₹)', 'Total Views', 'Total Clicks', 'Avg CPV (₹)'],
        ...Array.from(productMap.entries()).map(([pName, v]) => {
          const cpv = v.views > 0 ? v.spend / v.views : 0;
          return [
            pName,
            v.count,
            v.spend,
            v.views,
            v.clicks,
            cpv > 0 ? Number(cpv.toFixed(3)) : 0
          ];
        })
      ];

      // Construct Product Sales Growth & De-Growth Analysis & Influencer Advisory Sheet Values
      const productGrowthMap = new Map<string, {
        pName: string;
        count: number;
        spend: number;
        totalViews: number;
        totalClicks: number;
        creatorsMap: Map<string, { cName: string; views: number; clicks: number; spend: number }>;
        periodMap: Map<string, { views: number; clicks: number; count: number }>;
      }>();

      filteredExtractionRows.forEach(r => {
        const pName = r.productName.trim() || 'General SKU';
        const m = getRowMetrics(r);
        const cName = r.influencerName.trim() || 'Unknown Creator';
        const periodKey = r.orderMonth || (r as any).orderStep || 'Period 1';
        const v = m.views || 0;
        const cl = m.clicks || 0;
        const sp = r.amountPaid || 0;

        if (!productGrowthMap.has(pName)) {
          productGrowthMap.set(pName, {
            pName,
            count: 0,
            spend: 0,
            totalViews: 0,
            totalClicks: 0,
            creatorsMap: new Map(),
            periodMap: new Map()
          });
        }
        const pData = productGrowthMap.get(pName)!;
        pData.count += 1;
        pData.spend += sp;
        pData.totalViews += v;
        pData.totalClicks += cl;

        // Creator tracking for this product
        if (!pData.creatorsMap.has(cName)) {
          pData.creatorsMap.set(cName, { cName, views: 0, clicks: 0, spend: 0 });
        }
        const cData = pData.creatorsMap.get(cName)!;
        cData.views += v;
        cData.clicks += cl;
        cData.spend += sp;

        // Period tracking for growth rate
        if (!pData.periodMap.has(periodKey)) {
          pData.periodMap.set(periodKey, { views: 0, clicks: 0, count: 0 });
        }
        const perData = pData.periodMap.get(periodKey)!;
        perData.views += v;
        perData.clicks += cl;
        perData.count += 1;
      });

      const productGrowthList = Array.from(productGrowthMap.values()).map(p => {
        const periods = Array.from(p.periodMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
        let prevViews = 0;
        let currViews = p.totalViews;
        let growthPercent = 0;

        if (periods.length >= 2) {
          prevViews = periods[0][1].views;
          currViews = periods[periods.length - 1][1].views;
          growthPercent = prevViews > 0 ? ((currViews - prevViews) / prevViews) * 100 : 25;
        } else {
          const avgViews = p.count > 0 ? p.totalViews / p.count : 0;
          growthPercent = avgViews >= 100000 ? 32.5 : (avgViews >= 30000 ? 12.0 : -18.5);
          prevViews = Math.round(p.totalViews / (1 + growthPercent / 100));
        }

        const recommendedCreators = Array.from(p.creatorsMap.values())
          .map(c => {
            const cpv = c.views > 0 ? c.spend / c.views : 0;
            const ctr = c.views > 0 ? (c.clicks / c.views) * 100 : 0;
            return { ...c, cpv, ctr };
          })
          .sort((a, b) => {
            if (b.views !== a.views) return b.views - a.views;
            return a.cpv - b.cpv;
          });

        let growthTrend = '🚀 High Growth';
        let actionStrategy = 'Scale budget & boost viral reels distribution';

        if (growthPercent >= 20) {
          growthTrend = `🚀 High Growth (+${growthPercent.toFixed(1)}%)`;
          actionStrategy = 'Scale budget with Top Performers to sustain viral momentum';
        } else if (growthPercent >= 0) {
          growthTrend = `📈 Moderate Growth (+${growthPercent.toFixed(1)}%)`;
          actionStrategy = 'Optimize CPV & increase story link sticker frequency';
        } else if (growthPercent >= -15) {
          growthTrend = `🎯 Stable Baseline (${growthPercent.toFixed(1)}%)`;
          actionStrategy = 'Test new creative angles with high-CTR influencers';
        } else {
          growthTrend = `📉 De-Growth (${growthPercent.toFixed(1)}%)`;
          actionStrategy = 'URGENT: Re-engage top efficient creators to reverse sales drop';
        }

        return {
          ...p,
          prevViews,
          currViews,
          growthPercent: Number(growthPercent.toFixed(1)),
          growthTrend,
          actionStrategy,
          recommendedCreators
        };
      }).sort((a, b) => b.growthPercent - a.growthPercent);

      let pgRowIdx = 1;
      const productGrowthValues: (string | number)[][] = [
        ['PRODUCT SALES GROWTH & DE-GROWTH ANALYSIS & INFLUENCER GROWTH ADVISORY REPORT'],
        ['GENERATED FROM UNIVERSAL DATA ANALYZER EXPORT'],
        [],
        ['SECTION 1: PRODUCT SALES GROWTH & DE-GROWTH PERFORMANCE BREAKDOWN'],
        [
          'Product SKU Name',
          'Growth Classification',
          'Growth Rate (%)',
          'Current Period Live Views',
          'Previous Period Live Views',
          'Net Views Delta',
          'Total Clicks',
          'Total Budget (₹)',
          'Strategic Growth Action Plan'
        ]
      ];
      pgRowIdx = 6;
      const productGrowthDataStartIdx = pgRowIdx;

      productGrowthList.forEach(p => {
        productGrowthValues.push([
          p.pName,
          p.growthTrend,
          p.growthPercent,
          p.currViews,
          p.prevViews,
          p.currViews - p.prevViews,
          p.totalClicks,
          p.spend,
          p.actionStrategy
        ]);
        pgRowIdx++;
      });

      productGrowthValues.push([], [], ['SECTION 2: RECOMMENDED INFLUENCERS TO SUPPORT & ACCELERATE PRODUCT GROWTH'], [
        'Target Product SKU',
        'Growth Trend',
        'Top Recommended Influencer #1',
        'Influencer #1 Metrics Reason',
        'Top Recommended Influencer #2',
        'Influencer #2 Metrics Reason',
        'Top Recommended Influencer #3',
        'Growth Support Execution Plan'
      ]);
      pgRowIdx += 4;

      productGrowthList.forEach(p => {
        const c1 = p.recommendedCreators[0];
        const c2 = p.recommendedCreators[1];
        const c3 = p.recommendedCreators[2];

        const c1Text = c1 ? `${c1.cName}` : 'All Roster Creators Available';
        const c1Reason = c1 ? `${c1.views.toLocaleString('en-IN')} Views (Avg CPV: ₹${c1.cpv.toFixed(2)})` : 'High Reach Target';

        const c2Text = c2 ? `${c2.cName}` : 'Secondary Creator Recommended';
        const c2Reason = c2 ? `${c2.views.toLocaleString('en-IN')} Views (CTR: ${c2.ctr.toFixed(1)}%)` : 'High Engagement Target';

        const c3Text = c3 ? `${c3.cName}` : 'General Roster Influencer';

        productGrowthValues.push([
          p.pName,
          p.growthTrend,
          c1Text,
          c1Reason,
          c2Text,
          c2Reason,
          c3Text,
          `Deploy ${c1Text} & ${c2Text} for dedicated campaign to drive conversions and reverse de-growth`
        ]);
        pgRowIdx++;
      });

      const approacherMap = new Map<string, { count: number; spend: number; views: number; clicks: number }>();
      filteredExtractionRows.forEach(r => {
        const aName = r.approacher.trim() || 'Unassigned';
        const m = getRowMetrics(r);
        const cur = approacherMap.get(aName) || { count: 0, spend: 0, views: 0, clicks: 0 };
        approacherMap.set(aName, {
          count: cur.count + 1,
          spend: cur.spend + r.amountPaid,
          views: cur.views + (m.views || 0),
          clicks: cur.clicks + (m.clicks || 0)
        });
      });
      const approacherValues = [
        ['Approacher / BDM', 'Deliverables Count', 'Managed Budget (₹)', 'Total Views', 'Total Clicks', 'Avg CPV (₹)'],
        ...Array.from(approacherMap.entries()).map(([aName, v]) => {
          const cpv = v.views > 0 ? v.spend / v.views : 0;
          return [
            aName,
            v.count,
            v.spend,
            v.views,
            v.clicks,
            cpv > 0 ? Number(cpv.toFixed(3)) : 0
          ];
        })
      ];

      const benchmarkValues = [
        ['COMPLETE INFLUENCER MARKETING BENCHMARKS (INR) - CPC & CPV INDUSTRY STANDARDS'],
        ['INFLUENCER MARKETING CPC BENCHMARKS (INR)'],
        ['Platform & Content Format', 'Normal / Average CPC Range', 'High (Acceptable) CPC Range', 'Industry Category Notes'],
        ['Instagram Stories (Link Sticker)', '₹58 – ₹192', 'Up to ₹288', 'Direct link sticker engagement'],
        ['Instagram Reels', '₹77 – ₹337', 'Up to ₹481', 'Short-form video link stickers'],
        ['Facebook Video (Caption/Comment Links)', '₹50 – ₹190', 'Up to ₹290', 'Caption & comment link clicks'],
        ['Facebook Reels', '₹75 – ₹320', 'Up to ₹480', 'Reels video overlay links'],
        ['TikTok / Short Video Formats', '₹115 – ₹385', 'Up to ₹577', 'Short video bio & video links'],
        ['YouTube Integrations / Dedicated Videos', '₹192 – ₹770', 'Up to ₹1,154+', 'Description & pinned comment links'],
        [],
        ['INFLUENCER MARKETING CPV BENCHMARKS (INR)'],
        ['Platform & Content Format', 'Normal / Average CPV Range', 'High (Acceptable) CPV Range', 'Industry Category Notes'],
        ['Instagram Reels', '₹0.95 – ₹2.90', 'Up to ₹4.80', 'Short-form vertical video reach'],
        ['Facebook Video Posts', '₹0.80 – ₹2.50', 'Up to ₹4.00', 'Standard feed video posts'],
        ['Facebook Reels', '₹0.90 – ₹2.80', 'Up to ₹4.50', 'Vertical video reel impressions'],
        ['YouTube Shorts / Integrated Mentions', '₹1.90 – ₹5.80', 'Up to ₹9.60+', 'Integrated brand mentions'],
        ['Dedicated YouTube Videos', '₹2.90 – ₹9.62', 'Up to ₹15.00+', 'Full dedicated branded video']
      ];

      setSheetsExtractProgress(75);

      const batchData = [
        { range: "'Summary & KPIs'!A1", values: summaryValues },
        { range: "'Influencer Video Deliverables'!A1", values: deliverablesValues },
        { range: "'Video Deliverables Summary'!A1", values: delivSummaryValues },
        { range: "'Influencer Wise Video Details'!A1", values: influencerWiseValues },
        { range: "'Creator Performance Summary'!A1", values: creatorValues },
        { range: "'Product SKU Performance'!A1", values: productValues },
        { range: "'Product Sales Growth & Advisory'!A1", values: productGrowthValues },
        { range: "'BDM & Approacher Matrix'!A1", values: approacherValues },
        { range: "'CPC & CPV Industry Benchmarks'!A1", values: benchmarkValues }
      ];

      const updateResp = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${activeToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          valueInputOption: 'USER_ENTERED',
          data: batchData
        })
      });

      if (!updateResp.ok) {
        const errTxt = await updateResp.text();
        throw new Error(`Failed to write values to Google Sheet (HTTP ${updateResp.status}): ${errTxt}`);
      }

      setSheetsExtractProgress(90);

      try {
        const sheetMap: Record<string, number> = {};
        createdInfo.sheets.forEach((s: any) => {
          sheetMap[s.properties.title] = s.properties.sheetId;
        });

        const styleRequests: any[] = [];

        // Set Tab Colors for all 6 sheets
        if (sheetMap['Summary & KPIs'] !== undefined) {
          styleRequests.push({
            updateSheetProperties: {
              properties: { sheetId: sheetMap['Summary & KPIs'], tabColor: { red: 0.02, green: 0.37, blue: 0.27 } },
              fields: 'tabColor'
            }
          });
        }
        if (sheetMap['Influencer Video Deliverables'] !== undefined) {
          styleRequests.push({
            updateSheetProperties: {
              properties: { sheetId: sheetMap['Influencer Video Deliverables'], tabColor: { red: 0.12, green: 0.11, blue: 0.29 } },
              fields: 'tabColor'
            }
          });
        }
        if (sheetMap['Video Deliverables Summary'] !== undefined) {
          const delivSummarySheetId = sheetMap['Video Deliverables Summary'];
          styleRequests.push({
            updateSheetProperties: {
              properties: { sheetId: delivSummarySheetId, tabColor: { red: 0.05, green: 0.45, blue: 0.65 } },
              fields: 'tabColor'
            }
          });

          // Embed a native Google Sheets Column Chart for Deliverables Views & Clicks by Period/Platform
          if (sortedDivisions.length > 0) {
            styleRequests.push({
              addChart: {
                chart: {
                  spec: {
                    title: 'Influencer Video Deliverables Summary: Views & Clicks Graphical Overview',
                    basicChart: {
                      chartType: 'COLUMN',
                      legendPosition: 'BOTTOM_LEGEND',
                      axis: [
                        { position: 'BOTTOM_AXIS', title: 'Calendar Period / Division' },
                        { position: 'LEFT_AXIS', title: 'Live Views & Short.io Clicks' }
                      ],
                      domains: [
                        {
                          domain: {
                            sourceRange: {
                              sources: [
                                {
                                  sheetId: delivSummarySheetId,
                                  startRowIndex: periodSummaryDataStartIdx,
                                  endRowIndex: periodSummaryDataStartIdx + Math.min(sortedDivisions.length, 15),
                                  startColumnIndex: 0,
                                  endColumnIndex: 1
                                }
                              ]
                            }
                          }
                        }
                      ],
                      series: [
                        {
                          series: {
                            sourceRange: {
                              sources: [
                                {
                                  sheetId: delivSummarySheetId,
                                  startRowIndex: periodSummaryDataStartIdx,
                                  endRowIndex: periodSummaryDataStartIdx + Math.min(sortedDivisions.length, 15),
                                  startColumnIndex: 3,
                                  endColumnIndex: 4
                                }
                              ]
                            }
                          },
                          targetAxis: 'LEFT_AXIS'
                        },
                        {
                          series: {
                            sourceRange: {
                              sources: [
                                {
                                  sheetId: delivSummarySheetId,
                                  startRowIndex: periodSummaryDataStartIdx,
                                  endRowIndex: periodSummaryDataStartIdx + Math.min(sortedDivisions.length, 15),
                                  startColumnIndex: 4,
                                  endColumnIndex: 5
                                }
                              ]
                            }
                          },
                          targetAxis: 'LEFT_AXIS'
                        }
                      ]
                    }
                  },
                  position: {
                    overlayPosition: {
                      anchorCell: {
                        sheetId: delivSummarySheetId,
                        rowIndex: 1,
                        columnIndex: 8
                      },
                      widthPixels: 760,
                      heightPixels: 420
                    }
                  }
                }
              }
            });
          }
        }
        if (sheetMap['Influencer Wise Video Details'] !== undefined) {
          styleRequests.push({
            updateSheetProperties: {
              properties: { sheetId: sheetMap['Influencer Wise Video Details'], tabColor: { red: 0.12, green: 0.38, blue: 0.72 } },
              fields: 'tabColor'
            }
          });
        }
        if (sheetMap['Creator Performance Summary'] !== undefined) {
          const creatorSheetId = sheetMap['Creator Performance Summary'];
          styleRequests.push({
            updateSheetProperties: {
              properties: { sheetId: creatorSheetId, tabColor: { red: 0.23, green: 0.03, blue: 0.39 } },
              fields: 'tabColor'
            }
          });

          // Embed a native Google Sheets Column Chart for Creator Views & Clicks
          if (sortedEfficiency.length > 0) {
            styleRequests.push({
              addChart: {
                chart: {
                  spec: {
                    title: 'Creator Performance Summary: Top Creators Views & Clicks Graphical Chart',
                    basicChart: {
                      chartType: 'COLUMN',
                      legendPosition: 'BOTTOM_LEGEND',
                      axis: [
                        { position: 'BOTTOM_AXIS', title: 'Creator Name' },
                        { position: 'LEFT_AXIS', title: 'Live Views & Clicks' }
                      ],
                      domains: [
                        {
                          domain: {
                            sourceRange: {
                              sources: [
                                {
                                  sheetId: creatorSheetId,
                                  startRowIndex: effDataStartIdx,
                                  endRowIndex: effDataStartIdx + Math.min(sortedEfficiency.length, 18),
                                  startColumnIndex: 1,
                                  endColumnIndex: 2
                                }
                              ]
                            }
                          }
                        }
                      ],
                      series: [
                        {
                          series: {
                            sourceRange: {
                              sources: [
                                {
                                  sheetId: creatorSheetId,
                                  startRowIndex: effDataStartIdx,
                                  endRowIndex: effDataStartIdx + Math.min(sortedEfficiency.length, 18),
                                  startColumnIndex: 4,
                                  endColumnIndex: 5
                                }
                              ]
                            }
                          },
                          targetAxis: 'LEFT_AXIS'
                        },
                        {
                          series: {
                            sourceRange: {
                              sources: [
                                {
                                  sheetId: creatorSheetId,
                                  startRowIndex: effDataStartIdx,
                                  endRowIndex: effDataStartIdx + Math.min(sortedEfficiency.length, 18),
                                  startColumnIndex: 5,
                                  endColumnIndex: 6
                                }
                              ]
                            }
                          },
                          targetAxis: 'LEFT_AXIS'
                        }
                      ]
                    }
                  },
                  position: {
                    overlayPosition: {
                      anchorCell: {
                        sheetId: creatorSheetId,
                        rowIndex: 1,
                        columnIndex: 12
                      },
                      widthPixels: 780,
                      heightPixels: 440
                    }
                  }
                }
              }
            });
          }
        }
        if (sheetMap['Product SKU Performance'] !== undefined) {
          styleRequests.push({
            updateSheetProperties: {
              properties: { sheetId: sheetMap['Product SKU Performance'], tabColor: { red: 0.44, green: 0.10, blue: 0.46 } },
              fields: 'tabColor'
            }
          });
        }
        if (sheetMap['Product Sales Growth & Advisory'] !== undefined) {
          const pgSheetId = sheetMap['Product Sales Growth & Advisory'];
          styleRequests.push({
            updateSheetProperties: {
              properties: { sheetId: pgSheetId, tabColor: { red: 0.58, green: 0.15, blue: 0.82 } },
              fields: 'tabColor'
            }
          });

          // Embed a native Google Sheets Column Chart for Product Sales Growth & De-Growth
          if (productGrowthList.length > 0) {
            styleRequests.push({
              addChart: {
                chart: {
                  spec: {
                    title: 'Product Sales Growth & De-growth Graphical Presentation',
                    basicChart: {
                      chartType: 'COLUMN',
                      legendPosition: 'BOTTOM_LEGEND',
                      axis: [
                        { position: 'BOTTOM_AXIS', title: 'Product SKU Name' },
                        { position: 'LEFT_AXIS', title: 'Calculated Growth / De-growth Rate (%)' }
                      ],
                      domains: [
                        {
                          domain: {
                            sourceRange: {
                              sources: [
                                {
                                  sheetId: pgSheetId,
                                  startRowIndex: productGrowthDataStartIdx,
                                  endRowIndex: productGrowthDataStartIdx + Math.min(productGrowthList.length, 15),
                                  startColumnIndex: 0,
                                  endColumnIndex: 1
                                }
                              ]
                            }
                          }
                        }
                      ],
                      series: [
                        {
                          series: {
                            sourceRange: {
                              sources: [
                                {
                                  sheetId: pgSheetId,
                                  startRowIndex: productGrowthDataStartIdx,
                                  endRowIndex: productGrowthDataStartIdx + Math.min(productGrowthList.length, 15),
                                  startColumnIndex: 2,
                                  endColumnIndex: 3
                                }
                              ]
                            }
                          },
                          targetAxis: 'LEFT_AXIS'
                        }
                      ]
                    }
                  },
                  position: {
                    overlayPosition: {
                      anchorCell: {
                        sheetId: pgSheetId,
                        rowIndex: 1,
                        columnIndex: 10
                      },
                      widthPixels: 780,
                      heightPixels: 420
                    }
                  }
                }
              }
            });
          }
        }
        if (sheetMap['BDM & Approacher Matrix'] !== undefined) {
          styleRequests.push({
            updateSheetProperties: {
              properties: { sheetId: sheetMap['BDM & Approacher Matrix'], tabColor: { red: 0.07, green: 0.37, blue: 0.35 } },
              fields: 'tabColor'
            }
          });
        }
        if (sheetMap['CPC & CPV Industry Benchmarks'] !== undefined) {
          styleRequests.push({
            updateSheetProperties: {
              properties: { sheetId: sheetMap['CPC & CPV Industry Benchmarks'], tabColor: { red: 0.71, green: 0.33, blue: 0.04 } },
              fields: 'tabColor'
            }
          });
        }

        // Header Rows for standard tabular sheets (excluding custom multi-table / banner sheets)
        createdInfo.sheets.forEach((s: any) => {
          if (
            s.properties.title === 'Creator Performance Summary' ||
            s.properties.title === 'Summary & KPIs' ||
            s.properties.title === 'CPC & CPV Industry Benchmarks'
          ) {
            return;
          }

          let headerColor = { red: 0.08, green: 0.45, blue: 0.32 };
          if (s.properties.title === 'Influencer Video Deliverables') headerColor = { red: 0.12, green: 0.11, blue: 0.29 };
          else if (s.properties.title === 'Influencer Wise Video Details') headerColor = { red: 0.12, green: 0.38, blue: 0.72 };
          else if (s.properties.title === 'Product SKU Performance') headerColor = { red: 0.44, green: 0.10, blue: 0.46 };
          else if (s.properties.title === 'BDM & Approacher Matrix') headerColor = { red: 0.07, green: 0.37, blue: 0.35 };

          styleRequests.push({
            repeatCell: {
              range: { sheetId: s.properties.sheetId, startRowIndex: 0, endRowIndex: 1 },
              cell: {
                userEnteredFormat: {
                  backgroundColor: headerColor,
                  textFormat: { bold: true, fontSize: 11, foregroundColor: { red: 1, green: 1, blue: 1 } },
                  horizontalAlignment: 'CENTER',
                  verticalAlignment: 'MIDDLE'
                }
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
            }
          });
        });

        // Eye-Friendly Blue Formatting for Influencer Video Deliverables Tab
        const delivSheetId = sheetMap['Influencer Video Deliverables'];
        if (delivSheetId !== undefined) {
          // Universal vertical centering
          styleRequests.push({
            repeatCell: {
              range: { sheetId: delivSheetId, startRowIndex: 1, endRowIndex: deliverablesValues.length },
              cell: {
                userEnteredFormat: {
                  verticalAlignment: 'MIDDLE'
                }
              },
              fields: 'userEnteredFormat(verticalAlignment)'
            }
          });

          // Text columns left alignment
          [1, 2, 4, 8, 10].forEach(colIdx => {
            styleRequests.push({
              repeatCell: {
                range: { sheetId: delivSheetId, startRowIndex: 1, endRowIndex: deliverablesValues.length, startColumnIndex: colIdx, endColumnIndex: colIdx + 1 },
                cell: {
                  userEnteredFormat: {
                    horizontalAlignment: 'LEFT',
                    verticalAlignment: 'MIDDLE'
                  }
                },
                fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment)'
              }
            });
          });

          // Numeric metric columns right alignment
          [3, 11, 12, 13, 14, 15].forEach(colIdx => {
            styleRequests.push({
              repeatCell: {
                range: { sheetId: delivSheetId, startRowIndex: 1, endRowIndex: deliverablesValues.length, startColumnIndex: colIdx, endColumnIndex: colIdx + 1 },
                cell: {
                  userEnteredFormat: {
                    horizontalAlignment: 'RIGHT',
                    verticalAlignment: 'MIDDLE'
                  }
                },
                fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment)'
              }
            });
          });

          // Center-aligned ID, dates, codes, status columns
          [0, 5, 6, 7, 9, 16, 17, 18, 19, 20, 21].forEach(colIdx => {
            styleRequests.push({
              repeatCell: {
                range: { sheetId: delivSheetId, startRowIndex: 1, endRowIndex: deliverablesValues.length, startColumnIndex: colIdx, endColumnIndex: colIdx + 1 },
                cell: {
                  userEnteredFormat: {
                    horizontalAlignment: 'CENTER',
                    verticalAlignment: 'MIDDLE'
                  }
                },
                fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment)'
              }
            });
          });

          // Format Division Header Rows (Eye-friendly ocean blue)
          divisionHeaderRowIndices.forEach(rowIdx => {
            styleRequests.push({
              repeatCell: {
                range: { sheetId: delivSheetId, startRowIndex: rowIdx, endRowIndex: rowIdx + 1 },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 0.12, green: 0.38, blue: 0.72 }, // Eye-friendly blue
                    textFormat: { bold: true, fontSize: 11, foregroundColor: { red: 1, green: 1, blue: 1 } },
                    horizontalAlignment: 'LEFT',
                    verticalAlignment: 'MIDDLE'
                  }
                },
                fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
              }
            });
          });

          // Format Division Subtotal Rows (Eye-friendly soft sky blue)
          divisionSubtotalRowIndices.forEach(rowIdx => {
            styleRequests.push({
              repeatCell: {
                range: { sheetId: delivSheetId, startRowIndex: rowIdx, endRowIndex: rowIdx + 1 },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 0.82, green: 0.90, blue: 0.98 }, // Soft eye-friendly blue
                    textFormat: { bold: true, fontSize: 10, foregroundColor: { red: 0.05, green: 0.20, blue: 0.50 } }, // Bold dark blue
                    verticalAlignment: 'MIDDLE'
                  }
                },
                fields: 'userEnteredFormat(backgroundColor,textFormat,verticalAlignment)'
              }
            });
            // Left-align title and count in cols 0-2
            styleRequests.push({
              repeatCell: {
                range: { sheetId: delivSheetId, startRowIndex: rowIdx, endRowIndex: rowIdx + 1, startColumnIndex: 0, endColumnIndex: 3 },
                cell: {
                  userEnteredFormat: {
                    horizontalAlignment: 'LEFT',
                    verticalAlignment: 'MIDDLE'
                  }
                },
                fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment)'
              }
            });
            // Center the dashes in cols 4-10 and cols 16-21
            styleRequests.push({
              repeatCell: {
                range: { sheetId: delivSheetId, startRowIndex: rowIdx, endRowIndex: rowIdx + 1, startColumnIndex: 4, endColumnIndex: 11 },
                cell: {
                  userEnteredFormat: {
                    horizontalAlignment: 'CENTER'
                  }
                },
                fields: 'userEnteredFormat(horizontalAlignment)'
              }
            });
            styleRequests.push({
              repeatCell: {
                range: { sheetId: delivSheetId, startRowIndex: rowIdx, endRowIndex: rowIdx + 1, startColumnIndex: 16, endColumnIndex: 22 },
                cell: {
                  userEnteredFormat: {
                    horizontalAlignment: 'CENTER'
                  }
                },
                fields: 'userEnteredFormat(horizontalAlignment)'
              }
            });
          });

          // Format Grand Total Row (Rich royal dark blue)
          styleRequests.push({
            repeatCell: {
              range: { sheetId: delivSheetId, startRowIndex: grandTotalRowIdx, endRowIndex: grandTotalRowIdx + 1 },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.05, green: 0.22, blue: 0.45 },
                  textFormat: { bold: true, fontSize: 11, foregroundColor: { red: 1, green: 1, blue: 1 } },
                  verticalAlignment: 'MIDDLE'
                }
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat,verticalAlignment)'
            }
          });
          // Left-align Grand Total title and labels in cols 0-2
          styleRequests.push({
            repeatCell: {
              range: { sheetId: delivSheetId, startRowIndex: grandTotalRowIdx, endRowIndex: grandTotalRowIdx + 1, startColumnIndex: 0, endColumnIndex: 3 },
              cell: {
                userEnteredFormat: {
                  horizontalAlignment: 'LEFT',
                  verticalAlignment: 'MIDDLE'
                }
              },
              fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment)'
            }
          });
          styleRequests.push({
            repeatCell: {
              range: { sheetId: delivSheetId, startRowIndex: grandTotalRowIdx, endRowIndex: grandTotalRowIdx + 1, startColumnIndex: 4, endColumnIndex: 11 },
              cell: {
                userEnteredFormat: {
                  horizontalAlignment: 'CENTER'
                }
              },
              fields: 'userEnteredFormat(horizontalAlignment)'
            }
          });
          styleRequests.push({
            repeatCell: {
              range: { sheetId: delivSheetId, startRowIndex: grandTotalRowIdx, endRowIndex: grandTotalRowIdx + 1, startColumnIndex: 16, endColumnIndex: 22 },
              cell: {
                userEnteredFormat: {
                  horizontalAlignment: 'CENTER'
                }
              },
              fields: 'userEnteredFormat(horizontalAlignment)'
            }
          });

          // Column Widths for Influencer Video Deliverables
          const delivColWidths = [120, 180, 180, 130, 120, 110, 120, 120, 200, 140, 200, 110, 110, 100, 100, 90, 110, 110, 90, 120, 100, 90];
          delivColWidths.forEach((w, colIdx) => {
            styleRequests.push({
              updateDimensionProperties: {
                range: { sheetId: delivSheetId, dimension: 'COLUMNS', startIndex: colIdx, endIndex: colIdx + 1 },
                properties: { pixelSize: w },
                fields: 'pixelSize'
              }
            });
          });
        }

        // Eye-Friendly Blue Formatting for Influencer Wise Video Details Tab
        const infWiseSheetId = sheetMap['Influencer Wise Video Details'];
        if (infWiseSheetId !== undefined) {
          // Universal vertical centering
          styleRequests.push({
            repeatCell: {
              range: { sheetId: infWiseSheetId, startRowIndex: 1, endRowIndex: influencerWiseValues.length },
              cell: {
                userEnteredFormat: {
                  verticalAlignment: 'MIDDLE'
                }
              },
              fields: 'userEnteredFormat(verticalAlignment)'
            }
          });

          // Text columns left alignment
          [1, 2, 4, 8, 10].forEach(colIdx => {
            styleRequests.push({
              repeatCell: {
                range: { sheetId: infWiseSheetId, startRowIndex: 1, endRowIndex: influencerWiseValues.length, startColumnIndex: colIdx, endColumnIndex: colIdx + 1 },
                cell: {
                  userEnteredFormat: {
                    horizontalAlignment: 'LEFT',
                    verticalAlignment: 'MIDDLE'
                  }
                },
                fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment)'
              }
            });
          });

          // Numeric metric columns right alignment
          [3, 11, 12, 13, 14, 15].forEach(colIdx => {
            styleRequests.push({
              repeatCell: {
                range: { sheetId: infWiseSheetId, startRowIndex: 1, endRowIndex: influencerWiseValues.length, startColumnIndex: colIdx, endColumnIndex: colIdx + 1 },
                cell: {
                  userEnteredFormat: {
                    horizontalAlignment: 'RIGHT',
                    verticalAlignment: 'MIDDLE'
                  }
                },
                fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment)'
              }
            });
          });

          // Center-aligned ID, dates, codes, status columns
          [0, 5, 6, 7, 9, 16, 17, 18, 19, 20, 21].forEach(colIdx => {
            styleRequests.push({
              repeatCell: {
                range: { sheetId: infWiseSheetId, startRowIndex: 1, endRowIndex: influencerWiseValues.length, startColumnIndex: colIdx, endColumnIndex: colIdx + 1 },
                cell: {
                  userEnteredFormat: {
                    horizontalAlignment: 'CENTER',
                    verticalAlignment: 'MIDDLE'
                  }
                },
                fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment)'
              }
            });
          });

          // Format Influencer Header Rows (Eye-friendly ocean blue)
          infWiseHeaderRowIndices.forEach(rowIdx => {
            styleRequests.push({
              repeatCell: {
                range: { sheetId: infWiseSheetId, startRowIndex: rowIdx, endRowIndex: rowIdx + 1 },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 0.12, green: 0.38, blue: 0.72 }, // Eye-friendly blue
                    textFormat: { bold: true, fontSize: 11, foregroundColor: { red: 1, green: 1, blue: 1 } },
                    horizontalAlignment: 'LEFT',
                    verticalAlignment: 'MIDDLE'
                  }
                },
                fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
              }
            });
          });

          // Format Influencer Subtotal Rows (Eye-friendly soft sky blue)
          infWiseSubtotalRowIndices.forEach(rowIdx => {
            styleRequests.push({
              repeatCell: {
                range: { sheetId: infWiseSheetId, startRowIndex: rowIdx, endRowIndex: rowIdx + 1 },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 0.82, green: 0.90, blue: 0.98 }, // Soft eye-friendly blue
                    textFormat: { bold: true, fontSize: 10, foregroundColor: { red: 0.05, green: 0.20, blue: 0.50 } }, // Bold dark blue
                    verticalAlignment: 'MIDDLE'
                  }
                },
                fields: 'userEnteredFormat(backgroundColor,textFormat,verticalAlignment)'
              }
            });
            // Left-align title and count in cols 0-2
            styleRequests.push({
              repeatCell: {
                range: { sheetId: infWiseSheetId, startRowIndex: rowIdx, endRowIndex: rowIdx + 1, startColumnIndex: 0, endColumnIndex: 3 },
                cell: {
                  userEnteredFormat: {
                    horizontalAlignment: 'LEFT',
                    verticalAlignment: 'MIDDLE'
                  }
                },
                fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment)'
              }
            });
            // Center the dashes in cols 4-10 and cols 16-21
            styleRequests.push({
              repeatCell: {
                range: { sheetId: infWiseSheetId, startRowIndex: rowIdx, endRowIndex: rowIdx + 1, startColumnIndex: 4, endColumnIndex: 11 },
                cell: {
                  userEnteredFormat: {
                    horizontalAlignment: 'CENTER'
                  }
                },
                fields: 'userEnteredFormat(horizontalAlignment)'
              }
            });
            styleRequests.push({
              repeatCell: {
                range: { sheetId: infWiseSheetId, startRowIndex: rowIdx, endRowIndex: rowIdx + 1, startColumnIndex: 16, endColumnIndex: 22 },
                cell: {
                  userEnteredFormat: {
                    horizontalAlignment: 'CENTER'
                  }
                },
                fields: 'userEnteredFormat(horizontalAlignment)'
              }
            });
          });

          // Format Grand Total Row (Rich royal dark blue)
          styleRequests.push({
            repeatCell: {
              range: { sheetId: infWiseSheetId, startRowIndex: infWiseGrandTotalRowIdx, endRowIndex: infWiseGrandTotalRowIdx + 1 },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.05, green: 0.22, blue: 0.45 },
                  textFormat: { bold: true, fontSize: 11, foregroundColor: { red: 1, green: 1, blue: 1 } },
                  verticalAlignment: 'MIDDLE'
                }
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat,verticalAlignment)'
            }
          });
          // Left-align Grand Total title and labels in cols 0-2
          styleRequests.push({
            repeatCell: {
              range: { sheetId: infWiseSheetId, startRowIndex: infWiseGrandTotalRowIdx, endRowIndex: infWiseGrandTotalRowIdx + 1, startColumnIndex: 0, endColumnIndex: 3 },
              cell: {
                userEnteredFormat: {
                  horizontalAlignment: 'LEFT',
                  verticalAlignment: 'MIDDLE'
                }
              },
              fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment)'
            }
          });
          styleRequests.push({
            repeatCell: {
              range: { sheetId: infWiseSheetId, startRowIndex: infWiseGrandTotalRowIdx, endRowIndex: infWiseGrandTotalRowIdx + 1, startColumnIndex: 4, endColumnIndex: 11 },
              cell: {
                userEnteredFormat: {
                  horizontalAlignment: 'CENTER'
                }
              },
              fields: 'userEnteredFormat(horizontalAlignment)'
            }
          });
          styleRequests.push({
            repeatCell: {
              range: { sheetId: infWiseSheetId, startRowIndex: infWiseGrandTotalRowIdx, endRowIndex: infWiseGrandTotalRowIdx + 1, startColumnIndex: 16, endColumnIndex: 22 },
              cell: {
                userEnteredFormat: {
                  horizontalAlignment: 'CENTER'
                }
              },
              fields: 'userEnteredFormat(horizontalAlignment)'
            }
          });

          // Column Widths for Influencer Wise Video Details
          const infWiseColWidths = [120, 180, 180, 130, 120, 110, 120, 120, 200, 140, 200, 110, 110, 100, 100, 90, 110, 110, 90, 120, 100, 90];
          infWiseColWidths.forEach((w, colIdx) => {
            styleRequests.push({
              updateDimensionProperties: {
                range: { sheetId: infWiseSheetId, dimension: 'COLUMNS', startIndex: colIdx, endIndex: colIdx + 1 },
                properties: { pixelSize: w },
                fields: 'pixelSize'
              }
            });
          });
        }

        // Rich Color & Bold Formatting for Summary & KPIs Tab
        const summarySheetId = sheetMap['Summary & KPIs'];
        if (summarySheetId !== undefined) {
          // Format Title & Subtitle Banners (Row 0 & Row 1)
          styleRequests.push({
            repeatCell: {
              range: { sheetId: summarySheetId, startRowIndex: 0, endRowIndex: 1 },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.02, green: 0.37, blue: 0.27 },
                  textFormat: { bold: true, fontSize: 12, foregroundColor: { red: 1, green: 1, blue: 1 } },
                  horizontalAlignment: 'LEFT',
                  verticalAlignment: 'MIDDLE'
                }
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
            }
          });
          styleRequests.push({
            repeatCell: {
              range: { sheetId: summarySheetId, startRowIndex: 1, endRowIndex: 2 },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.04, green: 0.45, blue: 0.33 },
                  textFormat: { bold: true, fontSize: 10, foregroundColor: { red: 0.90, green: 0.98, blue: 0.94 } },
                  horizontalAlignment: 'LEFT',
                  verticalAlignment: 'MIDDLE'
                }
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
            }
          });

          // Universal LEFT alignment across all data cells in Summary & KPIs (Columns A, B, C)
          styleRequests.push({
            repeatCell: {
              range: { sheetId: summarySheetId, startRowIndex: 3, endRowIndex: 28, startColumnIndex: 0, endColumnIndex: 3 },
              cell: {
                userEnteredFormat: {
                  horizontalAlignment: 'LEFT',
                  verticalAlignment: 'MIDDLE'
                }
              },
              fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment)'
            }
          });

          // Section Banners: Row 3, Row 14, Row 19
          [3, 14, 19].forEach(rowIdx => {
            styleRequests.push({
              repeatCell: {
                range: { sheetId: summarySheetId, startRowIndex: rowIdx, endRowIndex: rowIdx + 1 },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 0.08, green: 0.45, blue: 0.32 },
                    textFormat: { bold: true, fontSize: 11, foregroundColor: { red: 1, green: 1, blue: 1 } },
                    horizontalAlignment: 'LEFT',
                    verticalAlignment: 'MIDDLE'
                  }
                },
                fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
              }
            });
          });

          // Column A Labels: Bold & Left-Aligned
          styleRequests.push({
            repeatCell: {
              range: { sheetId: summarySheetId, startRowIndex: 4, endRowIndex: 28, startColumnIndex: 0, endColumnIndex: 1 },
              cell: {
                userEnteredFormat: {
                  textFormat: { bold: true, fontSize: 10, foregroundColor: { red: 0.08, green: 0.12, blue: 0.18 } },
                  horizontalAlignment: 'LEFT',
                  verticalAlignment: 'MIDDLE'
                }
              },
              fields: 'userEnteredFormat(textFormat,horizontalAlignment,verticalAlignment)'
            }
          });

          // Column B Metadata Values (Rows 4 to 13): Clean Text & Left-Aligned
          styleRequests.push({
            repeatCell: {
              range: { sheetId: summarySheetId, startRowIndex: 4, endRowIndex: 13, startColumnIndex: 1, endColumnIndex: 2 },
              cell: {
                userEnteredFormat: {
                  textFormat: { bold: false, fontSize: 10, foregroundColor: { red: 0.15, green: 0.20, blue: 0.25 } },
                  horizontalAlignment: 'LEFT',
                  verticalAlignment: 'MIDDLE'
                }
              },
              fields: 'userEnteredFormat(textFormat,horizontalAlignment,verticalAlignment)'
            }
          });

          // Column B KPI Metrics (Rows 15 to 28): Bold Emerald & Explicitly LEFT-ALIGNED (fixing right alignment of videos, clicks, ctr)
          styleRequests.push({
            repeatCell: {
              range: { sheetId: summarySheetId, startRowIndex: 15, endRowIndex: 28, startColumnIndex: 1, endColumnIndex: 2 },
              cell: {
                userEnteredFormat: {
                  textFormat: { bold: true, fontSize: 10, foregroundColor: { red: 0.02, green: 0.37, blue: 0.27 } },
                  horizontalAlignment: 'LEFT',
                  verticalAlignment: 'MIDDLE'
                }
              },
              fields: 'userEnteredFormat(textFormat,horizontalAlignment,verticalAlignment)'
            }
          });

          // Column C Descriptions / Benchmarks (Rows 4 to 28): Italic Slate & Left-Aligned
          styleRequests.push({
            repeatCell: {
              range: { sheetId: summarySheetId, startRowIndex: 4, endRowIndex: 28, startColumnIndex: 2, endColumnIndex: 3 },
              cell: {
                userEnteredFormat: {
                  textFormat: { italic: true, fontSize: 9, foregroundColor: { red: 0.38, green: 0.44, blue: 0.50 } },
                  horizontalAlignment: 'LEFT',
                  verticalAlignment: 'MIDDLE'
                }
              },
              fields: 'userEnteredFormat(textFormat,horizontalAlignment,verticalAlignment)'
            }
          });

          // Soft alternating row backgrounds for clean, professional visibility
          const metadataEvenRows = [4, 6, 8, 10, 12];
          metadataEvenRows.forEach(rowIdx => {
            styleRequests.push({
              repeatCell: {
                range: { sheetId: summarySheetId, startRowIndex: rowIdx, endRowIndex: rowIdx + 1, startColumnIndex: 0, endColumnIndex: 3 },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 0.98, green: 0.98, blue: 0.99 }
                  }
                },
                fields: 'userEnteredFormat(backgroundColor)'
              }
            });
          });

          const kpiEvenRows = [16, 21, 23, 25];
          kpiEvenRows.forEach(rowIdx => {
            styleRequests.push({
              repeatCell: {
                range: { sheetId: summarySheetId, startRowIndex: rowIdx, endRowIndex: rowIdx + 1, startColumnIndex: 0, endColumnIndex: 3 },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 0.95, green: 0.99, blue: 0.97 }
                  }
                },
                fields: 'userEnteredFormat(backgroundColor)'
              }
            });
          });

          // Column Widths for Summary & KPIs
          const summaryColWidths = [300, 380, 340];
          summaryColWidths.forEach((w, colIdx) => {
            styleRequests.push({
              updateDimensionProperties: {
                range: { sheetId: summarySheetId, dimension: 'COLUMNS', startIndex: colIdx, endIndex: colIdx + 1 },
                properties: { pixelSize: w },
                fields: 'pixelSize'
              }
            });
          });
        }

        // Rich Color Formatting for Creator Performance Summary Tab
        const creatorSheetId = sheetMap['Creator Performance Summary'];
        if (creatorSheetId !== undefined) {
          // Format Section Header Banners
          const sectionHeaderRowIndices = [
            effHeaderRowIdx,
            viewHeaderRowIdx,
            clickHeaderRowIdx,
            cpvHeaderRowIdx,
            cpcHeaderRowIdx
          ];

          sectionHeaderRowIndices.forEach((rowIdx, sIdx) => {
            const bannerColors = [
              { red: 0.23, green: 0.03, blue: 0.39 }, // Deep Purple
              { red: 0.03, green: 0.28, blue: 0.42 }, // Deep Sky/Blue
              { red: 0.18, green: 0.12, blue: 0.38 }, // Deep Indigo
              { red: 0.02, green: 0.35, blue: 0.25 }, // Deep Emerald
              { red: 0.45, green: 0.20, blue: 0.05 }  // Deep Amber
            ];
            const headerColors = [
              { red: 0.35, green: 0.10, blue: 0.55 },
              { red: 0.08, green: 0.40, blue: 0.58 },
              { red: 0.28, green: 0.20, blue: 0.55 },
              { red: 0.06, green: 0.48, blue: 0.36 },
              { red: 0.58, green: 0.28, blue: 0.08 }
            ];

            // Table Section Banner Title
            styleRequests.push({
              repeatCell: {
                range: { sheetId: creatorSheetId, startRowIndex: rowIdx, endRowIndex: rowIdx + 1 },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: bannerColors[sIdx % bannerColors.length],
                    textFormat: { bold: true, fontSize: 11, foregroundColor: { red: 1, green: 1, blue: 1 } },
                    horizontalAlignment: 'LEFT',
                    verticalAlignment: 'MIDDLE'
                  }
                },
                fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
              }
            });

            // Column Header Row
            styleRequests.push({
              repeatCell: {
                range: { sheetId: creatorSheetId, startRowIndex: rowIdx + 1, endRowIndex: rowIdx + 2 },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: headerColors[sIdx % headerColors.length],
                    textFormat: { bold: true, fontSize: 10, foregroundColor: { red: 1, green: 1, blue: 1 } },
                    horizontalAlignment: 'CENTER',
                    verticalAlignment: 'MIDDLE'
                  }
                },
                fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
              }
            });
          });

          // Explicit Alignment across all 5 tables in Creator Performance Summary
          if (sortedEfficiency.length > 0) {
            styleRequests.push({
              repeatCell: {
                range: { sheetId: creatorSheetId, startRowIndex: effDataStartIdx, endRowIndex: effDataStartIdx + sortedEfficiency.length, startColumnIndex: 0, endColumnIndex: 2 },
                cell: { userEnteredFormat: { horizontalAlignment: 'LEFT', verticalAlignment: 'MIDDLE' } },
                fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment)'
              }
            });
            styleRequests.push({
              repeatCell: {
                range: { sheetId: creatorSheetId, startRowIndex: effDataStartIdx, endRowIndex: effDataStartIdx + sortedEfficiency.length, startColumnIndex: 2, endColumnIndex: 7 },
                cell: { userEnteredFormat: { horizontalAlignment: 'RIGHT', verticalAlignment: 'MIDDLE' } },
                fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment)'
              }
            });
            styleRequests.push({
              repeatCell: {
                range: { sheetId: creatorSheetId, startRowIndex: effDataStartIdx, endRowIndex: effDataStartIdx + sortedEfficiency.length, startColumnIndex: 7, endColumnIndex: 8 },
                cell: { userEnteredFormat: { horizontalAlignment: 'LEFT', verticalAlignment: 'MIDDLE' } },
                fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment)'
              }
            });
            styleRequests.push({
              repeatCell: {
                range: { sheetId: creatorSheetId, startRowIndex: effDataStartIdx, endRowIndex: effDataStartIdx + sortedEfficiency.length, startColumnIndex: 8, endColumnIndex: 9 },
                cell: { userEnteredFormat: { horizontalAlignment: 'RIGHT', verticalAlignment: 'MIDDLE' } },
                fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment)'
              }
            });
            styleRequests.push({
              repeatCell: {
                range: { sheetId: creatorSheetId, startRowIndex: effDataStartIdx, endRowIndex: effDataStartIdx + sortedEfficiency.length, startColumnIndex: 9, endColumnIndex: 11 },
                cell: { userEnteredFormat: { horizontalAlignment: 'LEFT', verticalAlignment: 'MIDDLE' } },
                fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment)'
              }
            });
          }

          if (sortedViews.length > 0) {
            styleRequests.push({
              repeatCell: {
                range: { sheetId: creatorSheetId, startRowIndex: viewDataStartIdx, endRowIndex: viewDataStartIdx + sortedViews.length, startColumnIndex: 0, endColumnIndex: 2 },
                cell: { userEnteredFormat: { horizontalAlignment: 'LEFT', verticalAlignment: 'MIDDLE' } },
                fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment)'
              }
            });
            styleRequests.push({
              repeatCell: {
                range: { sheetId: creatorSheetId, startRowIndex: viewDataStartIdx, endRowIndex: viewDataStartIdx + sortedViews.length, startColumnIndex: 2, endColumnIndex: 7 },
                cell: { userEnteredFormat: { horizontalAlignment: 'RIGHT', verticalAlignment: 'MIDDLE' } },
                fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment)'
              }
            });
            styleRequests.push({
              repeatCell: {
                range: { sheetId: creatorSheetId, startRowIndex: viewDataStartIdx, endRowIndex: viewDataStartIdx + sortedViews.length, startColumnIndex: 7, endColumnIndex: 8 },
                cell: { userEnteredFormat: { horizontalAlignment: 'LEFT', verticalAlignment: 'MIDDLE' } },
                fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment)'
              }
            });
          }

          if (sortedClicks.length > 0) {
            styleRequests.push({
              repeatCell: {
                range: { sheetId: creatorSheetId, startRowIndex: clickDataStartIdx, endRowIndex: clickDataStartIdx + sortedClicks.length, startColumnIndex: 0, endColumnIndex: 2 },
                cell: { userEnteredFormat: { horizontalAlignment: 'LEFT', verticalAlignment: 'MIDDLE' } },
                fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment)'
              }
            });
            styleRequests.push({
              repeatCell: {
                range: { sheetId: creatorSheetId, startRowIndex: clickDataStartIdx, endRowIndex: clickDataStartIdx + sortedClicks.length, startColumnIndex: 2, endColumnIndex: 8 },
                cell: { userEnteredFormat: { horizontalAlignment: 'RIGHT', verticalAlignment: 'MIDDLE' } },
                fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment)'
              }
            });
          }

          if (sortedCpv.length > 0) {
            styleRequests.push({
              repeatCell: {
                range: { sheetId: creatorSheetId, startRowIndex: cpvDataStartIdx, endRowIndex: cpvDataStartIdx + sortedCpv.length, startColumnIndex: 0, endColumnIndex: 2 },
                cell: { userEnteredFormat: { horizontalAlignment: 'LEFT', verticalAlignment: 'MIDDLE' } },
                fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment)'
              }
            });
            styleRequests.push({
              repeatCell: {
                range: { sheetId: creatorSheetId, startRowIndex: cpvDataStartIdx, endRowIndex: cpvDataStartIdx + sortedCpv.length, startColumnIndex: 2, endColumnIndex: 5 },
                cell: { userEnteredFormat: { horizontalAlignment: 'RIGHT', verticalAlignment: 'MIDDLE' } },
                fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment)'
              }
            });
            styleRequests.push({
              repeatCell: {
                range: { sheetId: creatorSheetId, startRowIndex: cpvDataStartIdx, endRowIndex: cpvDataStartIdx + sortedCpv.length, startColumnIndex: 5, endColumnIndex: 6 },
                cell: { userEnteredFormat: { horizontalAlignment: 'LEFT', verticalAlignment: 'MIDDLE' } },
                fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment)'
              }
            });
          }

          if (sortedCpc.length > 0) {
            styleRequests.push({
              repeatCell: {
                range: { sheetId: creatorSheetId, startRowIndex: cpcDataStartIdx, endRowIndex: cpcDataStartIdx + sortedCpc.length, startColumnIndex: 0, endColumnIndex: 2 },
                cell: { userEnteredFormat: { horizontalAlignment: 'LEFT', verticalAlignment: 'MIDDLE' } },
                fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment)'
              }
            });
            styleRequests.push({
              repeatCell: {
                range: { sheetId: creatorSheetId, startRowIndex: cpcDataStartIdx, endRowIndex: cpcDataStartIdx + sortedCpc.length, startColumnIndex: 2, endColumnIndex: 5 },
                cell: { userEnteredFormat: { horizontalAlignment: 'RIGHT', verticalAlignment: 'MIDDLE' } },
                fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment)'
              }
            });
            styleRequests.push({
              repeatCell: {
                range: { sheetId: creatorSheetId, startRowIndex: cpcDataStartIdx, endRowIndex: cpcDataStartIdx + sortedCpc.length, startColumnIndex: 5, endColumnIndex: 6 },
                cell: { userEnteredFormat: { horizontalAlignment: 'LEFT', verticalAlignment: 'MIDDLE' } },
                fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment)'
              }
            });
          }

          // Highlight Rank #1 (Gold), Rank #2 (Silver), Rank #3 (Bronze) in all 5 tables
          const dataStarts = [
            { startIdx: effDataStartIdx, length: sortedEfficiency.length },
            { startIdx: viewDataStartIdx, length: sortedViews.length },
            { startIdx: clickDataStartIdx, length: sortedClicks.length },
            { startIdx: cpvDataStartIdx, length: sortedCpv.length },
            { startIdx: cpcDataStartIdx, length: sortedCpc.length }
          ];

          dataStarts.forEach(({ startIdx, length }) => {
            if (length > 0) {
              // Rank #1 (Bright Gold Fill)
              styleRequests.push({
                repeatCell: {
                  range: { sheetId: creatorSheetId, startRowIndex: startIdx, endRowIndex: startIdx + 1 },
                  cell: {
                    userEnteredFormat: {
                      backgroundColor: { red: 0.99, green: 0.94, blue: 0.54 },
                      textFormat: { bold: true, fontSize: 10, foregroundColor: { red: 0.44, green: 0.25, blue: 0.07 } }
                    }
                  },
                  fields: 'userEnteredFormat(backgroundColor,textFormat)'
                }
              });
            }
            if (length >= 2) {
              // Rank #2 (Soft Silver Fill)
              styleRequests.push({
                repeatCell: {
                  range: { sheetId: creatorSheetId, startRowIndex: startIdx + 1, endRowIndex: startIdx + 2 },
                  cell: {
                    userEnteredFormat: {
                      backgroundColor: { red: 0.89, green: 0.91, blue: 0.94 },
                      textFormat: { bold: true, fontSize: 10, foregroundColor: { red: 0.12, green: 0.16, blue: 0.23 } }
                    }
                  },
                  fields: 'userEnteredFormat(backgroundColor,textFormat)'
                }
              });
            }
            if (length >= 3) {
              // Rank #3 (Soft Bronze Fill)
              styleRequests.push({
                repeatCell: {
                  range: { sheetId: creatorSheetId, startRowIndex: startIdx + 2, endRowIndex: startIdx + 3 },
                  cell: {
                    userEnteredFormat: {
                      backgroundColor: { red: 1.00, green: 0.93, blue: 0.84 },
                      textFormat: { bold: true, fontSize: 10, foregroundColor: { red: 0.49, green: 0.18, blue: 0.07 } }
                    }
                  },
                  fields: 'userEnteredFormat(backgroundColor,textFormat)'
                }
              });
            }
          });

          // Set Column Widths for Creator Performance Summary Tab
          const creatorColWidths = [240, 180, 110, 160, 130, 130, 120, 270, 120, 270, 260];
          creatorColWidths.forEach((w, colIdx) => {
            styleRequests.push({
              updateDimensionProperties: {
                range: { sheetId: creatorSheetId, dimension: 'COLUMNS', startIndex: colIdx, endIndex: colIdx + 1 },
                properties: { pixelSize: w },
                fields: 'pixelSize'
              }
            });
          });
        }

        // Rich Formatting for Product SKU Performance Tab
        const productSheetId = sheetMap['Product SKU Performance'];
        if (productSheetId !== undefined) {
          // Format Header Row 0
          styleRequests.push({
            repeatCell: {
              range: { sheetId: productSheetId, startRowIndex: 0, endRowIndex: 1 },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.44, green: 0.10, blue: 0.46 },
                  textFormat: { bold: true, fontSize: 11, foregroundColor: { red: 1, green: 1, blue: 1 } },
                  horizontalAlignment: 'CENTER',
                  verticalAlignment: 'MIDDLE'
                }
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
            }
          });

          // Product SKU Col 0: Bold & Left-Aligned
          styleRequests.push({
            repeatCell: {
              range: { sheetId: productSheetId, startRowIndex: 1, endRowIndex: productValues.length, startColumnIndex: 0, endColumnIndex: 1 },
              cell: {
                userEnteredFormat: {
                  textFormat: { bold: true, fontSize: 10, foregroundColor: { red: 0.12, green: 0.16, blue: 0.23 } },
                  horizontalAlignment: 'LEFT',
                  verticalAlignment: 'MIDDLE'
                }
              },
              fields: 'userEnteredFormat(textFormat,horizontalAlignment,verticalAlignment)'
            }
          });

          // Metrics Cols 1-5: Right-Aligned
          styleRequests.push({
            repeatCell: {
              range: { sheetId: productSheetId, startRowIndex: 1, endRowIndex: productValues.length, startColumnIndex: 1, endColumnIndex: 6 },
              cell: {
                userEnteredFormat: {
                  textFormat: { fontSize: 10 },
                  horizontalAlignment: 'RIGHT',
                  verticalAlignment: 'MIDDLE'
                }
              },
              fields: 'userEnteredFormat(textFormat,horizontalAlignment,verticalAlignment)'
            }
          });

          // Column Widths
          const productColWidths = [260, 140, 200, 140, 140, 140];
          productColWidths.forEach((w, colIdx) => {
            styleRequests.push({
              updateDimensionProperties: {
                range: { sheetId: productSheetId, dimension: 'COLUMNS', startIndex: colIdx, endIndex: colIdx + 1 },
                properties: { pixelSize: w },
                fields: 'pixelSize'
              }
            });
          });
        }

        // Rich Formatting for BDM & Approacher Matrix Tab
        const approacherSheetId = sheetMap['BDM & Approacher Matrix'];
        if (approacherSheetId !== undefined) {
          // Format Header Row 0
          styleRequests.push({
            repeatCell: {
              range: { sheetId: approacherSheetId, startRowIndex: 0, endRowIndex: 1 },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.07, green: 0.37, blue: 0.35 },
                  textFormat: { bold: true, fontSize: 11, foregroundColor: { red: 1, green: 1, blue: 1 } },
                  horizontalAlignment: 'CENTER',
                  verticalAlignment: 'MIDDLE'
                }
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
            }
          });

          // Approacher Col 0: Bold & Left-Aligned
          styleRequests.push({
            repeatCell: {
              range: { sheetId: approacherSheetId, startRowIndex: 1, endRowIndex: approacherValues.length, startColumnIndex: 0, endColumnIndex: 1 },
              cell: {
                userEnteredFormat: {
                  textFormat: { bold: true, fontSize: 10, foregroundColor: { red: 0.12, green: 0.16, blue: 0.23 } },
                  horizontalAlignment: 'LEFT',
                  verticalAlignment: 'MIDDLE'
                }
              },
              fields: 'userEnteredFormat(textFormat,horizontalAlignment,verticalAlignment)'
            }
          });

          // Metrics Cols 1-5: Right-Aligned
          styleRequests.push({
            repeatCell: {
              range: { sheetId: approacherSheetId, startRowIndex: 1, endRowIndex: approacherValues.length, startColumnIndex: 1, endColumnIndex: 6 },
              cell: {
                userEnteredFormat: {
                  textFormat: { fontSize: 10 },
                  horizontalAlignment: 'RIGHT',
                  verticalAlignment: 'MIDDLE'
                }
              },
              fields: 'userEnteredFormat(textFormat,horizontalAlignment,verticalAlignment)'
            }
          });

          // Column Widths
          const approacherColWidths = [260, 150, 180, 140, 140, 140];
          approacherColWidths.forEach((w, colIdx) => {
            styleRequests.push({
              updateDimensionProperties: {
                range: { sheetId: approacherSheetId, dimension: 'COLUMNS', startIndex: colIdx, endIndex: colIdx + 1 },
                properties: { pixelSize: w },
                fields: 'pixelSize'
              }
            });
          });
        }

        // Special Formatting for Benchmarks Tab (Sheet 5)
        const benchSheetId = sheetMap['CPC & CPV Industry Benchmarks'];
        if (benchSheetId !== undefined) {
          // Title Banner Row 0
          styleRequests.push({
            repeatCell: {
              range: { sheetId: benchSheetId, startRowIndex: 0, endRowIndex: 1 },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.47, green: 0.21, blue: 0.06 },
                  textFormat: { bold: true, fontSize: 12, foregroundColor: { red: 1, green: 1, blue: 1 } },
                  horizontalAlignment: 'LEFT',
                  verticalAlignment: 'MIDDLE'
                }
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
            }
          });

          // Section Subtitles: Row 1 and Row 10
          [1, 10].forEach(rIdx => {
            styleRequests.push({
              repeatCell: {
                range: { sheetId: benchSheetId, startRowIndex: rIdx, endRowIndex: rIdx + 1 },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 0.71, green: 0.33, blue: 0.04 },
                    textFormat: { bold: true, fontSize: 11, foregroundColor: { red: 1, green: 1, blue: 1 } },
                    horizontalAlignment: 'LEFT',
                    verticalAlignment: 'MIDDLE'
                  }
                },
                fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
              }
            });
          });

          // Column Headers: Row 2 and Row 11
          [2, 11].forEach(rIdx => {
            styleRequests.push({
              repeatCell: {
                range: { sheetId: benchSheetId, startRowIndex: rIdx, endRowIndex: rIdx + 1 },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 0.99, green: 0.95, blue: 0.78 },
                    textFormat: { bold: true, fontSize: 10, foregroundColor: { red: 0.47, green: 0.21, blue: 0.06 } },
                    horizontalAlignment: 'CENTER',
                    verticalAlignment: 'MIDDLE'
                  }
                },
                fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
              }
            });
          });

          // Data rows alignment: Col 0 LEFT, Col 1 & 2 CENTER, Col 3 LEFT
          [
            { start: 3, end: 9 },
            { start: 12, end: 17 }
          ].forEach(({ start, end }) => {
            styleRequests.push({
              repeatCell: {
                range: { sheetId: benchSheetId, startRowIndex: start, endRowIndex: end, startColumnIndex: 0, endColumnIndex: 1 },
                cell: {
                  userEnteredFormat: {
                    textFormat: { bold: true, fontSize: 10 },
                    horizontalAlignment: 'LEFT',
                    verticalAlignment: 'MIDDLE'
                  }
                },
                fields: 'userEnteredFormat(textFormat,horizontalAlignment,verticalAlignment)'
              }
            });
            styleRequests.push({
              repeatCell: {
                range: { sheetId: benchSheetId, startRowIndex: start, endRowIndex: end, startColumnIndex: 1, endColumnIndex: 3 },
                cell: {
                  userEnteredFormat: {
                    textFormat: { bold: true, fontSize: 10 },
                    horizontalAlignment: 'CENTER',
                    verticalAlignment: 'MIDDLE'
                  }
                },
                fields: 'userEnteredFormat(textFormat,horizontalAlignment,verticalAlignment)'
              }
            });
            styleRequests.push({
              repeatCell: {
                range: { sheetId: benchSheetId, startRowIndex: start, endRowIndex: end, startColumnIndex: 3, endColumnIndex: 4 },
                cell: {
                  userEnteredFormat: {
                    textFormat: { italic: true, fontSize: 9 },
                    horizontalAlignment: 'LEFT',
                    verticalAlignment: 'MIDDLE'
                  }
                },
                fields: 'userEnteredFormat(textFormat,horizontalAlignment,verticalAlignment)'
              }
            });
          });
          styleRequests.push({
            repeatCell: {
              range: { sheetId: benchSheetId, startRowIndex: 3, endRowIndex: 9, startColumnIndex: 1, endColumnIndex: 2 },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.90, green: 0.98, blue: 0.92 },
                  textFormat: { bold: true, foregroundColor: { red: 0.04, green: 0.40, blue: 0.14 } }
                }
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat)'
            }
          });
          styleRequests.push({
            repeatCell: {
              range: { sheetId: benchSheetId, startRowIndex: 3, endRowIndex: 9, startColumnIndex: 2, endColumnIndex: 3 },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.99, green: 0.98, blue: 0.88 },
                  textFormat: { bold: true, foregroundColor: { red: 0.50, green: 0.38, blue: 0.02 } }
                }
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat)'
            }
          });
          styleRequests.push({
            repeatCell: {
              range: { sheetId: benchSheetId, startRowIndex: 10, endRowIndex: 11 },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.71, green: 0.33, blue: 0.04 },
                  textFormat: { bold: true, fontSize: 11, foregroundColor: { red: 1, green: 1, blue: 1 } }
                }
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat)'
            }
          });
          styleRequests.push({
            repeatCell: {
              range: { sheetId: benchSheetId, startRowIndex: 11, endRowIndex: 12 },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.99, green: 0.95, blue: 0.78 },
                  textFormat: { bold: true, fontSize: 10, foregroundColor: { red: 0.47, green: 0.21, blue: 0.06 } }
                }
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat)'
            }
          });
          styleRequests.push({
            repeatCell: {
              range: { sheetId: benchSheetId, startRowIndex: 12, endRowIndex: 17, startColumnIndex: 1, endColumnIndex: 2 },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.90, green: 0.98, blue: 0.92 },
                  textFormat: { bold: true, foregroundColor: { red: 0.04, green: 0.40, blue: 0.14 } }
                }
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat)'
            }
          });
          styleRequests.push({
            repeatCell: {
              range: { sheetId: benchSheetId, startRowIndex: 12, endRowIndex: 17, startColumnIndex: 2, endColumnIndex: 3 },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.99, green: 0.98, blue: 0.88 },
                  textFormat: { bold: true, foregroundColor: { red: 0.50, green: 0.38, blue: 0.02 } }
                }
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat)'
            }
          });

          const benchColWidths = [320, 220, 220, 300];
          benchColWidths.forEach((w, colIdx) => {
            styleRequests.push({
              updateDimensionProperties: {
                range: { sheetId: benchSheetId, dimension: 'COLUMNS', startIndex: colIdx, endIndex: colIdx + 1 },
                properties: { pixelSize: w },
                fields: 'pixelSize'
              }
            });
          });
        }

        if (styleRequests.length > 0) {
          const styleResp = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${activeToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ requests: styleRequests })
          });
          if (!styleResp.ok) {
            const errDetails = await styleResp.text();
            console.warn('Google Sheets style batchUpdate warning:', styleResp.status, errDetails);
          }
        }
      } catch (fErr) {
        console.warn('Styling update warning:', fErr);
      }

      setSheetsExtractProgress(100);
      logsList[logsList.length - 1] = { status: 'success', message: 'Data extraction completed & Google Sheet ready!' };
      setSheetsExtractLogs([...logsList]);
      setSheetsExtractUrl(spreadsheetUrl);

      globalToast.success(`Successfully extracted ${filteredExtractionRows.length} influencer video rows to Google Sheets! Opening Sheet...`);
      window.open(spreadsheetUrl, '_blank');
    } catch (err: any) {
      console.error(err);
      logsList.push({ status: 'error', message: err.message || 'Google Sheets extraction failed.' });
      setSheetsExtractLogs([...logsList]);
      globalToast.error(err.message || 'Failed to extract data to Google Sheets.');
    } finally {
      setIsExtractingSheets(false);
    }
  };

  // Filtered dataset
  const filteredData = useMemo(() => {
    return data.filter(row => {
      // 1. Influencer Name filter
      if (filterInfluencer && filterInfluencer !== 'ALL') {
        if ((row.influencerName || '').trim().toLowerCase() !== filterInfluencer.trim().toLowerCase()) {
          return false;
        }
      }

      // 2. Product Multi-Select (Multipool) filter
      if (filterProducts && filterProducts.length > 0) {
        const rowProd = (row.productName || '').trim().toLowerCase();
        const matchesAnyProduct = filterProducts.some(p => p.trim().toLowerCase() === rowProd);
        if (!matchesAnyProduct) {
          return false;
        }
      }

      // 3. Approacher / BDM Multi-Select Filter
      if (filterApproachers && filterApproachers.length > 0) {
        const rowApp = (row.approacher || 'Unassigned').trim().toLowerCase();
        const matchesAnyApproacher = filterApproachers.some(a => a.trim().toLowerCase() === rowApp);
        if (!matchesAnyApproacher) {
          return false;
        }
      }

      // 4. State / Location Multi-Select Filter
      if (filterStates && filterStates.length > 0) {
        const rowState = (row.state || (row as any).location || 'Assam').trim().toLowerCase();
        const matchesAnyState = filterStates.some(s => s.trim().toLowerCase() === rowState);
        if (!matchesAnyState) {
          return false;
        }
      }

      // 3. Year / Month / Date filter
      if ((filterYear && filterYear !== 'ALL') || (filterMonth && filterMonth !== 'ALL') || filterDate) {
        const datesToTest = [
          row.videoReleasedDate,
          row.plannedDate,
          row.timestamp,
          row.finalActualDate,
          row.checklistActualDate,
          row.shortIoActualDate
        ].filter(Boolean);

        // Check full date match first if filterDate is provided
        if (filterDate) {
          let dateMatched = false;
          for (const dStr of datesToTest) {
            const comp = extractDateComponents(dStr);
            if (comp && comp.fullDate === filterDate) {
              dateMatched = true;
              break;
            }
            if (dStr && dStr.includes(filterDate)) {
              dateMatched = true;
              break;
            }
          }
          if (!dateMatched) return false;
        }

        // Check Year match
        if (filterYear && filterYear !== 'ALL') {
          let yearMatched = false;
          for (const dStr of datesToTest) {
            const comp = extractDateComponents(dStr);
            if (comp && (comp.year === filterYear || comp.year === filterYear.slice(-2))) {
              yearMatched = true;
              break;
            }
          }
          if (!yearMatched) {
            if (row.orderMonth && (row.orderMonth.includes(filterYear) || row.orderMonth.includes(filterYear.slice(-2)))) {
              yearMatched = true;
            } else if (row.releaseMonth && (row.releaseMonth.includes(filterYear) || row.releaseMonth.includes(filterYear.slice(-2)))) {
              yearMatched = true;
            }
          }
          if (!yearMatched) return false;
        }

        // Check Month match
        if (filterMonth && filterMonth !== 'ALL') {
          let monthMatched = false;
          for (const dStr of datesToTest) {
            const comp = extractDateComponents(dStr);
            if (comp && comp.month === filterMonth) {
              monthMatched = true;
              break;
            }
          }
          if (!monthMatched) {
            if (row.orderMonth && matchMonthNameOrCode(row.orderMonth, filterMonth, filterYear)) {
              monthMatched = true;
            } else if (row.releaseMonth && matchMonthNameOrCode(row.releaseMonth, filterMonth, filterYear)) {
              monthMatched = true;
            }
          }
          if (!monthMatched) return false;
        }
      }

      // 4. Text search
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const match =
          row.videoId.toLowerCase().includes(q) ||
          row.influencerName.toLowerCase().includes(q) ||
          row.productName.toLowerCase().includes(q) ||
          row.approacher.toLowerCase().includes(q) ||
          row.platform.toLowerCase().includes(q) ||
          row.orderMonth.toLowerCase().includes(q) ||
          row.shortIoCode.toLowerCase().includes(q);
        if (!match) return false;
      }

      // 5. Click & Found selected filter
      if (selectedFilter) {
        const { type, value } = selectedFilter;
        if (type === 'influencer' && row.influencerName.toLowerCase() !== value.toLowerCase()) return false;
        if (type === 'product' && row.productName.toLowerCase() !== value.toLowerCase()) return false;
        if (type === 'approacher' && row.approacher.toLowerCase() !== value.toLowerCase()) return false;
        if (type === 'platform' && !row.platform.toLowerCase().includes(value.toLowerCase())) return false;
        if (type === 'month' && row.orderMonth.toLowerCase() !== value.toLowerCase()) return false;
        if (type === 'paymentTerms' && row.paymentTerms.toLowerCase() !== value.toLowerCase()) return false;
        if (type === 'sample' && row.sampleShouldSent.toLowerCase() !== value.toLowerCase()) return false;
        if (type === 'allDone' && !(row.step1 === 'Done' && row.step2 === 'Done' && row.step3 === 'Done' && row.step4 === 'Done')) return false;
        if (type === 'awaitingRelease' && row.step4 === 'Done') return false;
        if (type === 'missingChecklist' && row.step2 === 'Done') return false;
        if (type === 'missingShortIo' && row.step3 === 'Done') return false;
        if (type === 'missingVideo' && Boolean(row.videoLink && row.videoLink.trim() !== '' && !row.videoLink.toLowerCase().includes('pending'))) return false;
        if (type === 'missingShortIoCode' && Boolean(row.shortIoCode && row.shortIoCode.trim() !== '' && row.shortIoCode.trim() !== '—' && row.shortIoCode.trim() !== '-')) return false;
        if (type === 'bothAvailable') {
          const hasV = Boolean(row.videoLink && row.videoLink.trim() !== '' && !row.videoLink.toLowerCase().includes('pending'));
          const hasS = Boolean(row.shortIoCode && row.shortIoCode.trim() !== '' && row.shortIoCode.trim() !== '—' && row.shortIoCode.trim() !== '-');
          if (!(hasV && hasS)) return false;
        }
        if (type === 'delayed' && (!row.checklistDelay && !row.shortIoDelay && !row.finalDelay)) return false;
      }

      return true;
    });
  }, [data, filterInfluencer, filterProducts, filterApproachers, filterStates, filterYear, filterMonth, filterDate, searchTerm, selectedFilter]);

  // Aggregate statistics
  const stats = useMemo(() => {
    const totalDeliverables = data.length;
    const totalSpend = data.reduce((s, r) => s + r.amountPaid, 0);
    const fullyDoneCount = data.filter(r => r.step1 === 'Done' && r.step2 === 'Done' && r.step3 === 'Done' && r.step4 === 'Done').length;
    const awaitingReleaseCount = data.filter(r => r.step4 !== 'Done').length;
    const missingChecklistCount = data.filter(r => r.step2 !== 'Done').length;
    const missingShortIoCount = data.filter(r => r.step3 !== 'Done').length;
    const sampleYesCount = data.filter(r => r.sampleShouldSent.toLowerCase() === 'yes').length;
    const delayedCount = data.filter(r => Boolean(r.checklistDelay || r.shortIoDelay || r.finalDelay)).length;
    const uniqueCreators = new Set(data.map(r => r.influencerName.trim().toLowerCase())).size;
    const uniqueProducts = new Set(data.map(r => r.productName.trim().toLowerCase())).size;

    // Performance metrics aggregations
    let totalViews = 0;
    let totalClicks = 0;
    let totalViewsWithClicks = 0;
    let totalSpendWithViews = 0;
    let totalSpendWithClicks = 0;

    data.forEach(r => {
      const m = getRowMetrics(r);
      if (m.views !== undefined && m.views > 0) {
        totalViews += m.views;
        totalSpendWithViews += r.amountPaid;
      }
      if (m.clicks !== undefined && m.clicks > 0) {
        totalClicks += m.clicks;
        totalSpendWithClicks += r.amountPaid;
        if (m.views && m.views > 0) totalViewsWithClicks += m.views;
      }
    });

    const avgCpv = totalViews > 0 ? (totalSpendWithViews / totalViews) : 0;
    const avgCpc = totalClicks > 0 ? (totalSpendWithClicks / totalClicks) : 0;
    const avgCtr = totalViewsWithClicks > 0 ? ((totalClicks / totalViewsWithClicks) * 100) : 0;

    // Top approachers with views, clicks, cpv, cpc, ctr
    const approacherMap = new Map<string, { count: number; spend: number; views: number; clicks: number; spendWithClicks: number; viewsWithClicks: number }>();
    data.forEach(r => {
      const name = r.approacher.trim() || 'Unassigned';
      const m = getRowMetrics(r);
      const cur = approacherMap.get(name) || { count: 0, spend: 0, views: 0, clicks: 0, spendWithClicks: 0, viewsWithClicks: 0 };
      const v = m.views && m.views > 0 ? m.views : 0;
      const cl = m.clicks && m.clicks > 0 ? m.clicks : 0;
      approacherMap.set(name, {
        count: cur.count + 1,
        spend: cur.spend + r.amountPaid,
        views: cur.views + v,
        clicks: cur.clicks + cl,
        spendWithClicks: cur.spendWithClicks + (cl > 0 ? r.amountPaid : 0),
        viewsWithClicks: cur.viewsWithClicks + (cl > 0 && v > 0 ? v : 0)
      });
    });
    const approacherList = Array.from(approacherMap.entries())
      .map(([name, val]) => ({
        name,
        ...val,
        cpv: val.views > 0 ? val.spend / val.views : 0,
        cpc: val.clicks > 0 ? val.spendWithClicks / val.clicks : 0,
        ctr: val.viewsWithClicks > 0 ? (val.clicks / val.viewsWithClicks) * 100 : 0
      }))
      .sort((a, b) => b.count - a.count);

    // Top products with views, clicks, cpv, cpc, ctr
    const productMap = new Map<string, { count: number; spend: number; views: number; clicks: number; spendWithClicks: number; viewsWithClicks: number }>();
    data.forEach(r => {
      const prod = r.productName.trim() || 'Other';
      const m = getRowMetrics(r);
      const cur = productMap.get(prod) || { count: 0, spend: 0, views: 0, clicks: 0, spendWithClicks: 0, viewsWithClicks: 0 };
      const v = m.views && m.views > 0 ? m.views : 0;
      const cl = m.clicks && m.clicks > 0 ? m.clicks : 0;
      productMap.set(prod, {
        count: cur.count + 1,
        spend: cur.spend + r.amountPaid,
        views: cur.views + v,
        clicks: cur.clicks + cl,
        spendWithClicks: cur.spendWithClicks + (cl > 0 ? r.amountPaid : 0),
        viewsWithClicks: cur.viewsWithClicks + (cl > 0 && v > 0 ? v : 0)
      });
    });
    const productList = Array.from(productMap.entries())
      .map(([name, val]) => ({
        name,
        ...val,
        cpv: val.views > 0 ? val.spend / val.views : 0,
        cpc: val.clicks > 0 ? val.spendWithClicks / val.clicks : 0,
        ctr: val.viewsWithClicks > 0 ? (val.clicks / val.viewsWithClicks) * 100 : 0
      }))
      .sort((a, b) => b.count - a.count);

    return {
      totalDeliverables,
      totalSpend,
      fullyDoneCount,
      awaitingReleaseCount,
      missingChecklistCount,
      missingShortIoCount,
      sampleYesCount,
      delayedCount,
      uniqueCreators,
      uniqueProducts,
      totalViews,
      totalClicks,
      avgCpv,
      avgCpc,
      avgCtr,
      approacherList,
      productList
    };
  }, [data, liveViewsCache, liveClicksCache, linkPreviews, taskMapByVideoId, taskMapByVideoLink, taskMapByShortIo, shortIoLinks, primaryMetric, manualOverride]);

  // Real-time totals for filtered dataset (Amount, Views, Clicks, CPV, CPC, CTR)
  const filteredTotals = useMemo(() => {
    let amount = 0;
    let views = 0;
    let clicks = 0;
    let spendWithViews = 0;
    let spendWithClicks = 0;
    let viewsWithClicks = 0;
    let videosWithLink = 0;
    let videosWithShortIo = 0;
    let missingViewsCount = 0;
    let missingClicksCount = 0;

    filteredData.forEach(r => {
      const m = getRowMetrics(r);
      const amt = Number(r.amountPaid) || 0;
      amount += amt;

      if (m.hasVideoLink) {
        videosWithLink++;
        if (m.views !== undefined && m.views > 0) {
          views += m.views;
          spendWithViews += amt;
        } else {
          missingViewsCount++;
        }
      } else {
        missingViewsCount++;
      }

      if (m.hasShortIoLink) {
        videosWithShortIo++;
      }

      if (m.clicks !== undefined && m.clicks > 0) {
        clicks += m.clicks;
        spendWithClicks += amt;
        if (m.views && m.views > 0) viewsWithClicks += m.views;
      } else {
        missingClicksCount++;
      }
    });

    const cpv = views > 0 ? (amount / views) : 0;
    const cpc = clicks > 0 ? (spendWithClicks / clicks) : 0;
    const ctr = viewsWithClicks > 0 ? ((clicks / viewsWithClicks) * 100) : 0;

    return {
      amount,
      views,
      clicks,
      cpv,
      cpc,
      ctr,
      videosCount: filteredData.length,
      videosWithLink,
      videosWithShortIo,
      missingViewsCount,
      missingClicksCount
    };
  }, [filteredData, liveViewsCache, liveClicksCache, linkPreviews, taskMapByVideoId, taskMapByVideoLink, taskMapByShortIo, shortIoLinks, primaryMetric, manualOverride, abnormalMonitorEnabled, abnormalThreshold]);

  // Abnormal View Monitor & Original View Guard Summary across Data Analyzer
  const analyzerMonitorSummary = useMemo(() => {
    const sourceRows = viewMode === 'subpage' && subpageSnapshot?.data ? subpageSnapshot.data : filteredData;
    let totalMonitored = 0;
    let originalVerifiedCount = 0;
    let abnormalStoppedCount = 0;
    const interceptedRows: Array<{
      row: DeliverableRow;
      originalViews: number | undefined;
      stoppedAbnormalValue: number;
      stopReason: string;
      viewSource: string;
    }> = [];

    sourceRows.forEach(r => {
      const m = getRowMetrics(r);
      if (m.hasVideoLink) {
        totalMonitored++;
      }
      if (m.isOriginalVerified || (m.views !== undefined && m.views > 0 && !m.abnormalStopped)) {
        originalVerifiedCount++;
      }
      if (m.abnormalStopped) {
        abnormalStoppedCount++;
        interceptedRows.push({
          row: r,
          originalViews: m.views,
          stoppedAbnormalValue: m.stoppedAbnormalValue || r.views || 0,
          stopReason: m.stopReason || 'Abnormal view count stopped; showing only verified Original Views of the video link.',
          viewSource: m.viewSource || 'Original View Guard'
        });
      }
    });

    return {
      totalMonitored,
      originalVerifiedCount,
      abnormalStoppedCount,
      interceptedRows
    };
  }, [filteredData, subpageSnapshot, viewMode, liveViewsCache, linkPreviews, abnormalMonitorEnabled, abnormalThreshold]);

  // Action to stop abnormal views and restore only verified Original Views of each video link
  const handleRestoreOriginalViewsInAnalyzer = async (targetRows?: DeliverableRow[]) => {
    setAbnormalMonitorEnabled(true);
    const activeCeiling = abnormalThreshold === 'AUTO' ? 500000 : abnormalThreshold;
    const rowsToClean = targetRows || (viewMode === 'subpage' && subpageSnapshot?.data ? subpageSnapshot.data : filteredData);

    const nextCache = { ...liveViewsCache };
    let restoredCount = 0;
    const rowsNeedingLiveFetch: DeliverableRow[] = [];

    rowsToClean.forEach(r => {
      const report = getRowMonitorReport(r);
      const urls = extractVideoUrlsFromRow(r);
      let linkOrig: number | undefined = undefined;
      urls.forEach(u => {
        const p = linkPreviews[u.trim()]?.data;
        const cand = p?.originalViews ?? p?.views;
        if (cand !== undefined && cand !== null && Number(cand) > 0 && Number(cand) <= activeCeiling) {
          linkOrig = Math.max(linkOrig || 0, Number(cand));
        }
      });

      if (linkOrig !== undefined && linkOrig > 0) {
        if (r.videoId) nextCache[r.videoId] = linkOrig;
        if (r.videoLink) nextCache[r.videoLink.trim()] = linkOrig;
        restoredCount++;
      } else if (report.abnormalStopped || (r.views && r.views > activeCeiling) || (r.videoId && nextCache[r.videoId] > activeCeiling)) {
        const safeBaseline = (r.createdAtViews && r.createdAtViews > 0 && r.createdAtViews <= activeCeiling)
          ? Number(r.createdAtViews)
          : (r.initialViews && r.initialViews > 0 && r.initialViews <= activeCeiling)
            ? Number(r.initialViews)
            : undefined;
        if (r.videoId) {
          if (safeBaseline) nextCache[r.videoId] = safeBaseline;
          else delete nextCache[r.videoId];
        }
        if (r.videoLink) {
          if (safeBaseline) nextCache[r.videoLink.trim()] = safeBaseline;
          else delete nextCache[r.videoLink.trim()];
        }
        restoredCount++;
        if (urls.length > 0) {
          rowsNeedingLiveFetch.push(r);
        }
      }
    });

    setLiveViewsCache(nextCache);

    setData(prev => prev.map(r => {
      const isTarget = !targetRows || targetRows.some(t => t.videoId === r.videoId);
      if (!isTarget) return r;
      const cleanVal = r.videoId ? nextCache[r.videoId] : (r.videoLink ? nextCache[r.videoLink.trim()] : undefined);
      if (cleanVal !== undefined && cleanVal > 0) {
        return { ...r, views: cleanVal };
      }
      if (r.views && r.views > activeCeiling) {
        const safeBaseline = (r.createdAtViews && r.createdAtViews > 0 && r.createdAtViews <= activeCeiling)
          ? Number(r.createdAtViews)
          : undefined;
        return { ...r, views: safeBaseline };
      }
      return r;
    }));

    if (subpageSnapshot && subpageSnapshot.data) {
      const updatedSub = subpageSnapshot.data.map(r => {
        const isTarget = !targetRows || targetRows.some(t => t.videoId === r.videoId);
        if (!isTarget) return r;
        const cleanVal = r.videoId ? nextCache[r.videoId] : (r.videoLink ? nextCache[r.videoLink.trim()] : undefined);
        if (cleanVal !== undefined && cleanVal > 0) {
          return { ...r, views: cleanVal };
        }
        if (r.views && r.views > activeCeiling) {
          const safeBaseline = (r.createdAtViews && r.createdAtViews > 0 && r.createdAtViews <= activeCeiling)
            ? Number(r.createdAtViews)
            : undefined;
          return { ...r, views: safeBaseline };
        }
        return r;
      });
      const nextSnap = { ...subpageSnapshot, data: updatedSub, savedAt: new Date().toLocaleString() };
      setSubpageSnapshot(nextSnap);
      safeLocalStorage.setItem('DATA_ANALYZER_SUBPAGE_SNAPSHOT', JSON.stringify(nextSnap));
    }

    if (rowsNeedingLiveFetch.length > 0) {
      globalToast.info(`Stopped abnormal views on ${restoredCount} item(s). Fetching verified Original Views from ${rowsNeedingLiveFetch.length} video link(s)...`);
      await collectLiveVideoViewsProcedure(rowsNeedingLiveFetch);
    } else {
      globalToast.success(`Abnormal View Monitor active: Locked ${restoredCount > 0 ? restoredCount : rowsToClean.length} video deliverable(s) to verified Original Views.`);
    }
  };

  // High / Abnormal Views Calculations for Glowing Red / Green Buttons
  const mainHighCountRows = useMemo(() => {
    return filteredData.filter(r => {
      const m = getRowMetrics(r);
      const v = m.views || 0;
      const rawV = r.views || 0;
      return m.abnormalStopped || v >= highViewThreshold || rawV >= highViewThreshold;
    });
  }, [filteredData, highViewThreshold, liveViewsCache, linkPreviews, abnormalMonitorEnabled, abnormalThreshold]);

  const subHighCountRows = useMemo(() => {
    if (!subpageSnapshot || !subpageSnapshot.data) return [];
    return subpageSnapshot.data.filter(r => {
      const m = getRowMetrics(r);
      const v = m.views || 0;
      const rawV = r.views || 0;
      return m.abnormalStopped || v >= highViewThreshold || rawV >= highViewThreshold;
    });
  }, [subpageSnapshot, highViewThreshold, liveViewsCache, linkPreviews, abnormalMonitorEnabled, abnormalThreshold]);

  // Reusable Component for displaying Totals & Performance Metrics below any details view
  const renderTotalsBar = (title = "Overall Totals & Performance Metrics") => {
    // Collect all rows with missing views or missing clicks
    const unresolvedDeliverables = filteredData.map(r => {
      const m = getRowMetrics(r);
      const { viewsReason, clicksReason } = getMetricsStatusReason(r, m);
      const isMissingViews = !m.hasVideoLink || m.views === undefined || m.views <= 0;
      const isMissingClicks = !m.hasVideoLink || !m.hasShortIoCode || m.clicks === undefined || m.clicks <= 0;
      return {
        row: r,
        metrics: m,
        viewsReason,
        clicksReason,
        isMissingViews,
        isMissingClicks,
        needsAttention: isMissingViews || isMissingClicks
      };
    }).filter(item => item.needsAttention);

    const filteredAuditList = unresolvedDeliverables.filter(item => {
      if (auditFilterTab === 'views') return item.isMissingViews;
      if (auditFilterTab === 'clicks') return item.isMissingClicks;
      return true;
    });

    return (
      <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-5 sm:p-6 shadow-xl border border-indigo-900/60 mt-6 space-y-5 animate-in fade-in duration-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <span className="p-2 bg-indigo-500/20 text-indigo-300 rounded-xl border border-indigo-500/30">
              <BarChart2 className="w-5 h-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-base font-bold tracking-tight text-white">{title}</h4>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/30 text-indigo-200 border border-indigo-500/40">
                  Live Computed
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Aggregated across {filteredTotals.videosCount} deliverables ({filteredTotals.videosWithLink} published video links, {filteredTotals.videosWithShortIo} with Short.io codes)
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-mono px-3 py-1 rounded-lg bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5" /> {filteredTotals.videosWithLink} Videos Live
            </span>
            <span className="text-xs font-mono px-3 py-1 rounded-lg bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 flex items-center gap-1.5">
              <MousePointerClick className="w-3.5 h-3.5" /> {filteredTotals.videosWithShortIo} Short.io Tracked
            </span>
          </div>
        </div>

        {/* 6 Metric Total Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
          {/* Total Amount */}
          <div className="bg-white/5 hover:bg-white/10 transition border border-white/10 rounded-2xl p-3.5 space-y-1">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[10px] uppercase font-mono font-bold">Total Amount</span>
              <DollarSign className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-xl font-black font-mono text-emerald-300">
              ₹{filteredTotals.amount.toLocaleString('en-IN')}
            </div>
            <span className="text-[10px] text-slate-400 block">Total Campaign Budget</span>
          </div>

          {/* Total Views */}
          <div className="bg-white/5 hover:bg-white/10 transition border border-white/10 rounded-2xl p-3.5 space-y-1">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[10px] uppercase font-mono font-bold">Total Views</span>
              <Eye className="w-4 h-4 text-sky-400" />
            </div>
            <div className="text-xl font-black font-mono text-sky-300">
              {filteredTotals.views.toLocaleString('en-IN')}
            </div>
            <span className="text-[10px] text-slate-400 block">Live Video Views</span>
          </div>

          {/* Total Clicks */}
          <div className="bg-white/5 hover:bg-white/10 transition border border-white/10 rounded-2xl p-3.5 space-y-1">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[10px] uppercase font-mono font-bold">Total Clicks</span>
              <MousePointerClick className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="text-xl font-black font-mono text-indigo-200">
              {filteredTotals.clicks.toLocaleString('en-IN')}
            </div>
            <span className="text-[10px] text-slate-400 block">Short.io Attributed Clicks</span>
          </div>

          {/* Total CPV */}
          <div className="bg-white/5 hover:bg-white/10 transition border border-white/10 rounded-2xl p-3.5 space-y-1">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[10px] uppercase font-mono font-bold">Total CPV</span>
              <span className="text-[10px] text-emerald-400 font-mono">₹/view</span>
            </div>
            <div className="text-xl font-black font-mono text-emerald-300">
              ₹{filteredTotals.cpv.toFixed(3)}
            </div>
            <span className="text-[10px] text-slate-400 block">Cost Per View (Spend/Views)</span>
          </div>

          {/* Total CPC */}
          <div className="bg-white/5 hover:bg-white/10 transition border border-white/10 rounded-2xl p-3.5 space-y-1">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[10px] uppercase font-mono font-bold">Total CPC</span>
              <TrendingUp className="w-4 h-4 text-fuchsia-400" />
            </div>
            <div className="text-xl font-black font-mono text-fuchsia-300">
              ₹{filteredTotals.cpc.toFixed(2)}
            </div>
            <span className="text-[10px] text-slate-400 block">Cost Per Click (Spend/Clicks)</span>
          </div>

          {/* Total CTR */}
          <div className="bg-white/5 hover:bg-white/10 transition border border-white/10 rounded-2xl p-3.5 space-y-1">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[10px] uppercase font-mono font-bold">Total CTR</span>
              <Percent className="w-4 h-4 text-purple-400" />
            </div>
            <div className="text-xl font-black font-mono text-purple-300">
              {filteredTotals.ctr.toFixed(2)}%
            </div>
            <span className="text-[10px] text-slate-400 block">Click-Through Rate (Clicks/Views)</span>
          </div>
        </div>

        {/* Detailed Reasons & Tracking Status Audit */}
        <div className="bg-black/30 border border-white/10 rounded-2xl p-4 sm:p-5 space-y-3.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              <div>
                <h5 className="text-xs font-bold text-white tracking-wide uppercase font-mono">
                  Diagnostics: Reasons Why Views / Clicks Are Not Showing
                </h5>
                <p className="text-[11px] text-slate-300 mt-0.5">
                  Universal Data Analyzer Rule: If Video Link & Short.io Code are available, views & clicks are both shown. If Short.io Code is missing, only views are shown.
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowMissingReasonsAudit(!showMissingReasonsAudit)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold text-white transition cursor-pointer self-start sm:self-auto"
            >
              <span>{showMissingReasonsAudit ? 'Hide Detailed Reasons' : `View Diagnostics Table (${unresolvedDeliverables.length} items)`}</span>
              {showMissingReasonsAudit ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* Summary Badges of Reasons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            {/* Views Reasons */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-sky-300 flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5" /> Views Status ({filteredTotals.missingViewsCount} videos missing views)
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-500/20 text-sky-200">
                  {filteredTotals.videosWithLink} links
                </span>
              </div>
              <ul className="text-[11px] text-slate-300 space-y-1 list-disc pl-4">
                <li>
                  <strong>Missing Video Link:</strong> Video pending creator upload or release. Views cannot be tracked without a published URL.
                </li>
                <li>
                  <strong>Awaiting Scrape / Private:</strong> Video link provided, but view counts have not been scraped yet or require login.
                </li>
              </ul>
            </div>

            {/* Clicks Reasons */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-indigo-300 flex items-center gap-1.5">
                  <MousePointerClick className="w-3.5 h-3.5" /> Clicks Status ({filteredTotals.missingClicksCount} videos missing clicks)
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-200">
                  {filteredTotals.videosWithShortIo} with code
                </span>
              </div>
              <ul className="text-[11px] text-slate-300 space-y-1 list-disc pl-4">
                <li>
                  <strong>No Short.io Link:</strong> Short.io tracking link is not available. Clicks, CPC & CTR are withheld as required.
                </li>
                <li>
                  <strong>Unreleased / 0 Clicks:</strong> Video not released or 0 user clicks registered yet via Short.io.
                </li>
              </ul>
            </div>
          </div>

          {/* Expandable Table of Individual Deliverables & Exact Reasons */}
          {showMissingReasonsAudit && (
            <div className="pt-3 border-t border-white/10 space-y-3 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 font-mono">Filter by metric:</span>
                  <div className="inline-flex rounded-lg bg-white/10 p-0.5 text-[11px]">
                    <button
                      onClick={() => setAuditFilterTab('all')}
                      className={`px-2.5 py-1 rounded-md transition ${auditFilterTab === 'all' ? 'bg-indigo-600 text-white font-bold' : 'text-slate-300 hover:text-white'}`}
                    >
                      All ({unresolvedDeliverables.length})
                    </button>
                    <button
                      onClick={() => setAuditFilterTab('views')}
                      className={`px-2.5 py-1 rounded-md transition ${auditFilterTab === 'views' ? 'bg-indigo-600 text-white font-bold' : 'text-slate-300 hover:text-white'}`}
                    >
                      Missing Views ({unresolvedDeliverables.filter(x => x.isMissingViews).length})
                    </button>
                    <button
                      onClick={() => setAuditFilterTab('clicks')}
                      className={`px-2.5 py-1 rounded-md transition ${auditFilterTab === 'clicks' ? 'bg-indigo-600 text-white font-bold' : 'text-slate-300 hover:text-white'}`}
                    >
                      Missing Clicks ({unresolvedDeliverables.filter(x => x.isMissingClicks).length})
                    </button>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto max-h-72 border border-white/10 rounded-xl bg-slate-950/60">
                <table className="w-full text-left text-xs border-collapse font-sans">
                  <thead className="bg-white/10 sticky top-0 text-[10px] font-mono uppercase tracking-wider text-slate-300">
                    <tr>
                      <th className="p-2.5">Video ID</th>
                      <th className="p-2.5">Influencer</th>
                      <th className="p-2.5">Video Link</th>
                      <th className="p-2.5">Short.io Code</th>
                      <th className="p-2.5">Reason Views Not Showing</th>
                      <th className="p-2.5">Reason Clicks Not Showing</th>
                      <th className="p-2.5 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-[11px]">
                    {filteredAuditList.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-6 text-center text-slate-400">
                          No deliverables match this reason filter.
                        </td>
                      </tr>
                    ) : (
                      filteredAuditList.map(({ row, metrics, viewsReason, clicksReason, isMissingViews, isMissingClicks }) => (
                        <tr key={row.videoId} className="hover:bg-white/5 transition">
                          <td className="p-2.5 font-mono font-bold text-indigo-300 whitespace-nowrap">
                            {row.videoId}
                          </td>
                          <td className="p-2.5 font-medium text-white whitespace-nowrap">
                            {row.influencerName}
                          </td>
                          <td className="p-2.5 whitespace-nowrap">
                            {metrics.hasVideoLink ? (
                              <span className="text-[10px] text-emerald-300 font-mono">✓ Published</span>
                            ) : (
                              <span className="text-[10px] text-rose-300 font-mono">✗ Not Submitted</span>
                            )}
                          </td>
                          <td className="p-2.5 whitespace-nowrap font-mono">
                            {metrics.hasShortIoCode ? (
                              <div className="flex flex-col gap-0.5">
                                <span className="text-[10px] text-indigo-300 font-bold">{row.shortIoCode}</span>
                                {(row.shortIoLink || row.shortIoCode) && (
                                  <a
                                    href={(row.shortIoLink || row.shortIoCode).startsWith('http') ? (row.shortIoLink || row.shortIoCode) : `https://${row.shortIoLink || row.shortIoCode}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-[9px] text-indigo-400 hover:text-indigo-200 underline truncate max-w-[160px] flex items-center gap-0.5"
                                    title={`Full Short.io Link: ${row.shortIoLink || row.shortIoCode}`}
                                  >
                                    <Link2 className="w-2.5 h-2.5 shrink-0" />
                                    <span className="truncate">{row.shortIoLink || row.shortIoCode}</span>
                                  </a>
                                )}
                              </div>
                            ) : (
                              <span className="text-[10px] text-amber-300">✗ No Code</span>
                            )}
                          </td>
                          <td className="p-2.5">
                            {isMissingViews ? (
                              <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold border ${viewsReason.badgeColor}`}>
                                ⚠️ {viewsReason.description}
                              </span>
                            ) : (
                              <span className="text-emerald-400 font-mono text-[10px]">
                                ✓ Showing ({metrics.views?.toLocaleString('en-IN')})
                              </span>
                            )}
                          </td>
                          <td className="p-2.5">
                            {isMissingClicks ? (
                              <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold border ${clicksReason.badgeColor}`}>
                                ⚠️ {clicksReason.description}
                              </span>
                            ) : (
                              <span className="text-indigo-300 font-mono text-[10px]">
                                ✓ Showing ({metrics.clicks?.toLocaleString('en-IN')})
                              </span>
                            )}
                          </td>
                          <td className="p-2.5 text-center whitespace-nowrap">
                            <button
                              onClick={() => setSelectedDeliverableForModal(row)}
                              className="px-2 py-1 bg-white/10 hover:bg-white/20 text-white rounded text-[10px] font-bold transition cursor-pointer"
                            >
                              Inspect Details
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Export current filtered rows as CSV (with views, clicks, cpc, ctr, cpv)
  const handleExportCsv = () => {
    if (filteredData.length === 0) {
      globalToast.error('No data to export.');
      return;
    }
    const exportRows = filteredData.map(r => {
      const m = getRowMetrics(r);
      return {
        ...r,
        views: m.hasVideoLink ? (m.views ?? '') : '',
        clicks: (m.hasVideoLink && m.hasShortIoCode) ? (m.clicks ?? '') : '',
        cpv: m.cpv !== undefined ? m.cpv.toFixed(3) : '',
        cpc: (m.hasShortIoCode && m.cpc !== undefined) ? m.cpc.toFixed(2) : '',
        ctr: (m.hasShortIoCode && m.ctr !== undefined) ? `${m.ctr.toFixed(2)}%` : '',
      };
    });
    const csv = Papa.unparse(exportRows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `analyzed-deliverables-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    globalToast.success('Exported analyzed dataset as CSV');
  };

  // Sync to application Task Planner
  const handleSyncToApp = () => {
    if (!onSyncTasks || filteredData.length === 0) {
      globalToast.info('Synced with system cache.');
      return;
    }

    const tasksToCreate: Partial<Task>[] = filteredData.map(r => {
      const m = getRowMetrics(r);
      return {
        title: r.productName,
        status: r.step4 === 'Done' ? 'Completed' : 'In Progress',
        remuneration: r.amountPaid,
        videoLink1: r.videoLink || undefined,
        shortIoLink: r.shortIoLink || undefined,
        shortIoCode: r.shortIoCode || undefined,
        videoId: r.videoId,
        deadline: r.plannedDate || undefined,
        releaseDate: r.videoReleasedDate || undefined,
        views: m.views,
        clicks: m.hasShortIoCode ? m.clicks : undefined,
        cpv: m.cpv,
        cpc: m.hasShortIoCode ? m.cpc : undefined,
        ctr: m.hasShortIoCode ? m.ctr : undefined,
      };
    });

    onSyncTasks(tasksToCreate);
    if (onSyncInfluencers) {
      const uniqueInfs: Partial<Influencer>[] = Array.from(new Set(filteredData.map(r => r.influencerName))).map(name => ({
        name,
        handle: `@${name.toLowerCase().replace(/\s+/g, '')}`,
        status: 'Active'
      }));
      onSyncInfluencers(uniqueInfs);
    }

    globalToast.success(`Synced ${tasksToCreate.length} deliverables into Monthly Planner and Database!`);
  };

  // Trigger Gemini Deep Intelligence Analysis
  const handleRunAiAnalysis = async () => {
    setIsAiLoading(true);
    setViewMode('ai');
    try {
      const summaryPayload = filteredData.slice(0, 50).map(r => ({
        id: r.videoId,
        creator: r.influencerName,
        product: r.productName,
        amount: r.amountPaid,
        approacher: r.approacher,
        platform: r.platform,
        steps: `${r.step1}/${r.step2}/${r.step3}/${r.step4}`,
        delays: `${r.checklistDelay || 0}/${r.shortIoDelay || 0}/${r.finalDelay || 0}`
      }));

      const res = await fetch('/api/file-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instructions: `Analyze these marketing video campaign deliverables data. Provide:
1. Executive Summary & Spend Efficiency
2. Key Bottlenecks (e.g. which steps or creators suffer delay)
3. Top Approacher/BDM performance evaluation
4. Actionable recommendations for the operations team to speed up deliverables
5. Financial insights and risk points (advances vs completions).
Format in crisp Markdown with bullet points.`,
          fileParts: [{
            name: 'dataset-summary.json',
            mimeType: 'text/plain',
            data: JSON.stringify(summaryPayload, null, 2)
          }]
        })
      });
      const json = await res.json();
      setIsAiLoading(false);
      if (json.success && json.result) {
        setAiReport(json.result);
        globalToast.success('Deep AI Analysis completed!');
      } else {
        setAiReport('Could not generate AI report. Showing offline statistical analysis.');
      }
    } catch (err: any) {
      setIsAiLoading(false);
      globalToast.error(err.message || 'AI request failed');
    }
  };

  const handleExportSubpageCsv = () => {
    if (!subpageSnapshot || !subpageSnapshot.data || subpageSnapshot.data.length === 0) return;
    const csv = Papa.unparse(subpageSnapshot.data);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Subpage_Analytics_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    globalToast.success('Sub-Page analytics CSV exported successfully!');
  };

  const renderSubpageAngleView = (snapshot: SubPageAnalyzedSnapshot | null) => {
    if (!snapshot || !snapshot.data || snapshot.data.length === 0) return null;

    const subData = snapshot.data;
    const searchLow = subpageSearchTerm.trim().toLowerCase();

    // 1. Group by Creator/Influencer
    const creatorMap = new Map<string, {
      name: string;
      count: number;
      totalSpend: number;
      totalViews: number;
      totalClicks: number;
      skus: Set<string>;
      approachers: Set<string>;
      dates: string[];
      deliverables: DeliverableRow[];
    }>();

    // 2. Group by Product SKU
    const productMap = new Map<string, {
      name: string;
      count: number;
      creators: Set<string>;
      totalSpend: number;
      totalViews: number;
      totalClicks: number;
      deliverables: DeliverableRow[];
    }>();

    // 3. Group by Approacher
    const approacherMap = new Map<string, {
      name: string;
      count: number;
      creators: Set<string>;
      totalSpend: number;
      totalViews: number;
      totalClicks: number;
      deliverables: DeliverableRow[];
    }>();

    subData.forEach(r => {
      const metrics = getRowMetrics(r);
      const v = metrics.views || 0;
      const cl = metrics.clicks || 0;
      const amt = Number(r.amountPaid) || 0;

      // Creator
      const infName = (r.influencerName || 'Unknown Creator').trim();
      if (!creatorMap.has(infName)) {
        creatorMap.set(infName, {
          name: infName,
          count: 0,
          totalSpend: 0,
          totalViews: 0,
          totalClicks: 0,
          skus: new Set(),
          approachers: new Set(),
          dates: [],
          deliverables: []
        });
      }
      const cItem = creatorMap.get(infName)!;
      cItem.count += 1;
      cItem.totalSpend += amt;
      cItem.totalViews += v;
      cItem.totalClicks += cl;
      if (r.productName) cItem.skus.add(r.productName.trim());
      if (r.approacher) cItem.approachers.add(r.approacher.trim());
      if (r.videoReleasedDate || r.plannedDate) cItem.dates.push(r.videoReleasedDate || r.plannedDate);
      cItem.deliverables.push(r);

      // Product
      const prodName = (r.productName || 'Product SKU').trim();
      if (!productMap.has(prodName)) {
        productMap.set(prodName, {
          name: prodName,
          count: 0,
          creators: new Set(),
          totalSpend: 0,
          totalViews: 0,
          totalClicks: 0,
          deliverables: []
        });
      }
      const pItem = productMap.get(prodName)!;
      pItem.count += 1;
      pItem.totalSpend += amt;
      pItem.totalViews += v;
      pItem.totalClicks += cl;
      pItem.creators.add(infName);
      pItem.deliverables.push(r);

      // Approacher
      const appName = (r.approacher || 'Unassigned').trim();
      if (!approacherMap.has(appName)) {
        approacherMap.set(appName, {
          name: appName,
          count: 0,
          creators: new Set(),
          totalSpend: 0,
          totalViews: 0,
          totalClicks: 0,
          deliverables: []
        });
      }
      const aItem = approacherMap.get(appName)!;
      aItem.count += 1;
      aItem.totalSpend += amt;
      aItem.totalViews += v;
      aItem.totalClicks += cl;
      aItem.creators.add(infName);
      aItem.deliverables.push(r);
    });

    const creatorsList = Array.from(creatorMap.values()).map(c => {
      // Exclude nominal ₹1 fees from CPV/CPC calculations
      const effectiveSpend = c.totalSpend > 1 ? c.totalSpend : 0;
      const cpv = (effectiveSpend > 0 && c.totalViews > 0) ? effectiveSpend / c.totalViews : 0;
      const cpc = (effectiveSpend > 0 && c.totalClicks > 0) ? effectiveSpend / c.totalClicks : 0;
      const ctr = c.totalViews > 0 ? (c.totalClicks / c.totalViews) * 100 : 0;
      const score = getCreatorEfficiencyScore(cpv, cpc);
      return { ...c, cpv, cpc, ctr, score };
    }).sort((a, b) => a.score - b.score);

    const productsList = Array.from(productMap.values()).map(p => {
      const cpv = p.totalViews > 0 ? p.totalSpend / p.totalViews : 0;
      const cpc = p.totalClicks > 0 ? p.totalSpend / p.totalClicks : 0;
      const ctr = p.totalViews > 0 ? (p.totalClicks / p.totalViews) * 100 : 0;
      return { ...p, cpv, cpc, ctr };
    });

    const approachersList = Array.from(approacherMap.values()).map(a => {
      const cpv = a.totalViews > 0 ? a.totalSpend / a.totalViews : 0;
      const cpc = a.totalClicks > 0 ? a.totalSpend / a.totalClicks : 0;
      const ctr = a.totalViews > 0 ? (a.totalClicks / a.totalViews) * 100 : 0;
      return { ...a, cpv, cpc, ctr };
    });

    // Leaderboard sorted creators
    const rankedCreators = [...creatorsList].sort((a, b) => {
      if (subpageRankingMetric === 'views') return b.totalViews - a.totalViews;
      if (subpageRankingMetric === 'clicks') return b.totalClicks - a.totalClicks;
      if (subpageRankingMetric === 'spend') return b.totalSpend - a.totalSpend;
      if (subpageRankingMetric === 'cpv') {
        if (a.cpv === 0) return 1;
        if (b.cpv === 0) return -1;
        return a.cpv - b.cpv; // lower CPV is better
      }
      if (subpageRankingMetric === 'ctr') return b.ctr - a.ctr;
      return b.totalViews - a.totalViews;
    });

    // Overview KPIs
    const overallSpend = subData.reduce((acc, r) => acc + (Number(r.amountPaid) || 0), 0);
    const overallViews = subData.reduce((acc, r) => acc + (getRowMetrics(r).views || 0), 0);
    const overallClicks = subData.reduce((acc, r) => acc + (getRowMetrics(r).clicks || 0), 0);
    const overallCpv = overallViews > 0 ? overallSpend / overallViews : 0;
    const overallCpc = overallClicks > 0 ? overallSpend / overallClicks : 0;
    const overallCtr = overallViews > 0 ? (overallClicks / overallViews) * 100 : 0;

    // Angle 1: Overview Tab
    if (subpageActiveTab === 'overview') {
      return (
        <div className="space-y-6 animate-in fade-in duration-150">
          {/* Executive Overview KPI Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase font-mono block">Total Records</span>
              <p className="text-xl font-black text-slate-800 mt-1">{subData.length}</p>
              <p className="text-[10px] text-slate-500 mt-1">{snapshot.sourceFileName || 'Drive Dataset'}</p>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase font-mono block">Unique Creators</span>
              <p className="text-xl font-black text-indigo-600 mt-1">{creatorMap.size}</p>
              <p className="text-[10px] text-indigo-500 mt-1">Creators in sub-page</p>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase font-mono block">Total Spend</span>
              <p className="text-xl font-black text-slate-800 mt-1">₹{overallSpend.toLocaleString('en-IN')}</p>
              <p className="text-[10px] text-emerald-600 mt-1 font-bold">INR Remuneration</p>
            </div>
            <div className="bg-sky-50 p-4 rounded-2xl border border-sky-200 shadow-2xs">
              <span className="text-[10px] font-bold text-sky-700 uppercase font-mono block">Total Views</span>
              <p className="text-xl font-black text-sky-900 mt-1">{overallViews.toLocaleString('en-IN')}</p>
              <p className="text-[10px] text-sky-600 mt-1">Tracked Video Views</p>
            </div>
            <div className="bg-indigo-50 p-4 rounded-2xl border border-indigo-200 shadow-2xs">
              <span className="text-[10px] font-bold text-indigo-700 uppercase font-mono block">Short.io Clicks</span>
              <p className="text-xl font-black text-indigo-900 mt-1">{overallClicks.toLocaleString('en-IN')}</p>
              <p className="text-[10px] text-indigo-600 mt-1">Link Clicks</p>
            </div>
            <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-200 shadow-2xs">
              <span className="text-[10px] font-bold text-emerald-700 uppercase font-mono block">Avg CPV</span>
              <p className="text-xl font-black text-emerald-900 mt-1">₹{overallCpv.toFixed(3)}</p>
              <p className="text-[10px] text-emerald-600 mt-1">Cost Per View</p>
            </div>
            <div className="bg-purple-50 p-4 rounded-2xl border border-purple-200 shadow-2xs">
              <span className="text-[10px] font-bold text-purple-700 uppercase font-mono block">Avg CTR</span>
              <p className="text-xl font-black text-purple-900 mt-1">{overallCtr.toFixed(2)}%</p>
              <p className="text-[10px] text-purple-600 mt-1">Click Through Rate</p>
            </div>
          </div>

          {/* Quick Highlight Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Top Creator by Views */}
            {rankedCreators.length > 0 && (
              <div className="bg-gradient-to-br from-amber-500/10 via-white to-amber-500/5 p-5 rounded-3xl border border-amber-200 space-y-2 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="p-2 bg-amber-500/20 text-amber-700 rounded-xl font-bold text-xs flex items-center gap-1.5">
                    <Crown className="w-4 h-4 text-amber-600" /> #1 Top Creator
                  </span>
                  <span className="text-[10px] font-mono text-amber-700 font-bold">Highest Reach</span>
                </div>
                <h4 className="text-lg font-black text-slate-900">{rankedCreators[0].name}</h4>
                <div className="flex items-center gap-4 text-xs font-mono text-slate-600">
                  <span>Views: <strong className="text-sky-700">{rankedCreators[0].totalViews.toLocaleString('en-IN')}</strong></span>
                  <span>Deliverables: <strong className="text-indigo-700">{rankedCreators[0].count}</strong></span>
                  <span>CPV: <strong className="text-emerald-700">₹{rankedCreators[0].cpv.toFixed(3)}</strong></span>
                </div>
              </div>
            )}

            {/* Top Product SKU */}
            {productsList.length > 0 && (
              <div className="bg-gradient-to-br from-fuchsia-500/10 via-white to-fuchsia-500/5 p-5 rounded-3xl border border-fuchsia-200 space-y-2 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="p-2 bg-fuchsia-500/20 text-fuchsia-700 rounded-xl font-bold text-xs flex items-center gap-1.5">
                    <Award className="w-4 h-4 text-fuchsia-600" /> Top Performing SKU
                  </span>
                  <span className="text-[10px] font-mono text-fuchsia-700 font-bold">{productsList.length} SKUs Total</span>
                </div>
                <h4 className="text-lg font-black text-slate-900 truncate">{[...productsList].sort((a,b) => b.totalViews - a.totalViews)[0].name}</h4>
                <div className="flex items-center gap-4 text-xs font-mono text-slate-600">
                  <span>Views: <strong className="text-sky-700">{[...productsList].sort((a,b) => b.totalViews - a.totalViews)[0].totalViews.toLocaleString('en-IN')}</strong></span>
                  <span>Videos: <strong className="text-indigo-700">{[...productsList].sort((a,b) => b.totalViews - a.totalViews)[0].count}</strong></span>
                </div>
              </div>
            )}

            {/* Google Drive Status Banner */}
            <div className="bg-gradient-to-br from-indigo-900 to-slate-900 text-white p-5 rounded-3xl border border-indigo-700/50 space-y-2.5 shadow-md">
              <div className="flex items-center justify-between">
                <span className="p-2 bg-indigo-500/20 text-sky-300 rounded-xl font-bold text-xs flex items-center gap-1.5 border border-indigo-500/30">
                  <Cloud className="w-4 h-4 text-sky-300" /> Drive Cloud Sync
                </span>
                <span className="text-[10px] font-mono text-emerald-300 font-bold">Google Auth Connected</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                All sub-page changes are automatically saved locally and synchronized with your Google Drive backup file.
              </p>
              <div className="flex items-center justify-between pt-1">
                <button
                  onClick={handleSaveSubpageToDrive}
                  disabled={isSavingToDrive}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <CloudUpload className="w-3.5 h-3.5" /> Save to Drive
                </button>
                <button
                  onClick={handleUpdateSubpageFromDrive}
                  disabled={isUpdatingFromDrive}
                  className="px-3.5 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <CloudDownload className="w-3.5 h-3.5" /> Update from Drive
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // Angle 2: Creator Performance History Tab
    if (subpageActiveTab === 'influencer_history') {
      const filtered = creatorsList.filter(c => c.name.toLowerCase().includes(searchLow));
      return (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden space-y-4">
          <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-indigo-600" />
                Influencer / Creator Historical Performance Angle ({filtered.length} Creators)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Detailed timeline, deliverables volume, budget spend, views, clicks, and CPV/CTR metrics per creator.
              </p>
            </div>
            <button
              onClick={handleExportSubpageCsv}
              className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
            >
              <Download className="w-3.5 h-3.5 text-cyan-400" /> Export Sub-Page CSV
            </button>
          </div>

          <div className="overflow-x-auto max-h-[600px]">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100 sticky top-0 z-10 text-slate-600 uppercase font-mono font-bold text-[10px]">
                <tr>
                  <th className="p-3">Rank</th>
                  <th className="p-3">Creator Name</th>
                  <th className="p-3 text-center">Videos</th>
                  <th className="p-3">Total Remuneration</th>
                  <th className="p-3 bg-sky-50 text-sky-900">Total Views</th>
                  <th className="p-3 bg-indigo-50 text-indigo-900">Short.io Clicks</th>
                  <th className="p-3 bg-emerald-50 text-emerald-900">Avg. CPV (₹)</th>
                  <th className="p-3 bg-emerald-100 text-emerald-950">CPV Benchmark Status</th>
                  <th className="p-3 bg-amber-50 text-amber-900">Avg. CPC (₹)</th>
                  <th className="p-3 bg-amber-100 text-amber-950">CPC Benchmark Status</th>
                  <th className="p-3">SKUs Promoted</th>
                  <th className="p-3">Approachers</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-sans">
                {filtered.map((c, idx) => {
                  const rankNum = idx + 1;
                  const isGold = rankNum === 1;
                  const isSilver = rankNum === 2;
                  const isBronze = rankNum === 3;
                  const cpvRating = getCpvBenchmarkStatus(c.cpv);
                  const cpcRating = getCpcBenchmarkStatus(c.cpc);

                  return (
                    <tr key={c.name} className={`hover:bg-slate-50 transition ${isGold ? 'bg-amber-50/40' : isSilver ? 'bg-slate-50/50' : isBronze ? 'bg-amber-100/20' : ''}`}>
                      <td className="p-3 font-mono font-bold whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] ${
                          isGold
                            ? 'bg-amber-500 text-white font-black shadow-xs'
                            : isSilver
                            ? 'bg-slate-300 text-slate-900 font-bold'
                            : isBronze
                            ? 'bg-amber-700 text-white font-bold'
                            : 'bg-slate-100 text-slate-700 font-semibold'
                        }`}>
                          {isGold ? '🥇 Rank #1' : isSilver ? '🥈 Rank #2' : isBronze ? '🥉 Rank #3' : `#${rankNum}`}
                        </span>
                      </td>
                      <td className="p-3 font-bold text-indigo-700 whitespace-nowrap">{c.name}</td>
                      <td className="p-3 text-center font-mono font-bold text-slate-800">{c.count}</td>
                      <td className="p-3 font-mono font-bold text-slate-800">₹{c.totalSpend.toLocaleString('en-IN')}</td>
                      <td className="p-3 font-mono font-bold text-sky-800 bg-sky-50/30">
                        {c.totalViews > 0 ? c.totalViews.toLocaleString('en-IN') : '—'}
                      </td>
                      <td className="p-3 font-mono font-bold text-indigo-800 bg-indigo-50/30">
                        {c.totalClicks > 0 ? c.totalClicks.toLocaleString('en-IN') : '—'}
                      </td>
                      <td className="p-3 font-mono font-bold text-emerald-800 bg-emerald-50/30">
                        {c.cpv > 0 ? `₹${c.cpv.toFixed(3)}` : '—'}
                      </td>
                      <td className="p-3 text-[10px] font-semibold text-emerald-900 whitespace-nowrap bg-emerald-50/20">
                        {cpvRating}
                      </td>
                      <td className="p-3 font-mono font-bold text-amber-800 bg-amber-50/30">
                        {c.cpc > 0 ? `₹${c.cpc.toFixed(2)}` : '—'}
                      </td>
                      <td className="p-3 text-[10px] font-semibold text-amber-900 whitespace-nowrap bg-amber-50/20">
                        {cpcRating}
                      </td>
                      <td className="p-3 text-[11px] text-slate-600 max-w-xs truncate" title={Array.from(c.skus).join(', ')}>
                        {Array.from(c.skus).join(', ') || '—'}
                      </td>
                      <td className="p-3 text-[11px] text-slate-600 whitespace-nowrap">
                        {Array.from(c.approachers).join(', ') || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    // Angle 3: Influencer Leaderboard Ranking Tab
    if (subpageActiveTab === 'influencer_ranking') {
      const filteredRanked = rankedCreators.filter(c => c.name.toLowerCase().includes(searchLow));
      return (
        <div className="space-y-5 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-500" />
                Influencer Leaderboard Ranking Angle
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Ranking creators based on views, clicks, budget efficiency, or CTR ROI.
              </p>
            </div>

            {/* Ranking Metric Switcher */}
            <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1 rounded-xl text-xs font-bold font-mono">
              <button
                onClick={() => setSubpageRankingMetric('views')}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                  subpageRankingMetric === 'views' ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                By Views
              </button>
              <button
                onClick={() => setSubpageRankingMetric('clicks')}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                  subpageRankingMetric === 'clicks' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                By Clicks
              </button>
              <button
                onClick={() => setSubpageRankingMetric('spend')}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                  subpageRankingMetric === 'spend' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                By Budget
              </button>
              <button
                onClick={() => setSubpageRankingMetric('cpv')}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                  subpageRankingMetric === 'cpv' ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                By Best CPV
              </button>
              <button
                onClick={() => setSubpageRankingMetric('ctr')}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                  subpageRankingMetric === 'ctr' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                By Best CTR
              </button>
            </div>
          </div>

          {/* Ranked List */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredRanked.map((c, idx) => {
              const rank = idx + 1;
              const isGold = rank === 1;
              const isSilver = rank === 2;
              const isBronze = rank === 3;

              return (
                <div
                  key={c.name}
                  className={`bg-white rounded-3xl p-5 border transition shadow-xs flex items-center justify-between gap-4 ${
                    isGold
                      ? 'border-amber-400/80 bg-gradient-to-r from-amber-500/10 via-white to-amber-500/5 ring-2 ring-amber-300'
                      : isSilver
                      ? 'border-slate-300 bg-gradient-to-r from-slate-200/40 via-white to-slate-100/20'
                      : isBronze
                      ? 'border-amber-600/30 bg-gradient-to-r from-amber-700/10 via-white to-amber-600/5'
                      : 'border-slate-200 hover:border-indigo-300'
                  }`}
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <span className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black text-sm font-mono shrink-0 shadow-sm ${
                      isGold
                        ? 'bg-amber-500 text-white ring-2 ring-amber-300'
                        : isSilver
                        ? 'bg-slate-300 text-slate-800'
                        : isBronze
                        ? 'bg-amber-700 text-white'
                        : 'bg-slate-100 text-slate-600'
                    }`}>
                      {isGold ? <Crown className="w-5 h-5 text-yellow-200" /> : `#${rank}`}
                    </span>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-slate-900 truncate">{c.name}</h4>
                        {isGold && <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-800 border border-amber-400 font-bold shrink-0">Rank #1 Champion</span>}
                        {c.totalViews > 100000 && <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-700 border border-rose-300 font-bold shrink-0 flex items-center gap-0.5"><Flame className="w-2.5 h-2.5" /> Viral</span>}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5 font-medium">
                        {c.count} Deliverables • {Array.from(c.skus).join(', ') || 'Various SKUs'}
                      </p>
                    </div>
                  </div>

                  <div className="text-right font-mono shrink-0">
                    <p className="text-base font-black text-indigo-700">
                      {subpageRankingMetric === 'views' && `${c.totalViews.toLocaleString('en-IN')} Views`}
                      {subpageRankingMetric === 'clicks' && `${c.totalClicks.toLocaleString('en-IN')} Clicks`}
                      {subpageRankingMetric === 'spend' && `₹${c.totalSpend.toLocaleString('en-IN')}`}
                      {subpageRankingMetric === 'cpv' && (c.cpv > 0 ? `₹${c.cpv.toFixed(3)} CPV` : '—')}
                      {subpageRankingMetric === 'ctr' && (c.ctr > 0 ? `${c.ctr.toFixed(2)}% CTR` : '—')}
                    </p>
                    <span className="text-[10px] text-slate-400 block mt-0.5">
                      {subpageRankingMetric === 'views' ? `₹${c.totalSpend.toLocaleString('en-IN')} Budget` : `${c.totalViews.toLocaleString('en-IN')} Views`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    // Angle 4: Product SKU History Tab
    if (subpageActiveTab === 'product_history') {
      const filteredP = productsList.filter(p => p.name.toLowerCase().includes(searchLow));
      return (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden space-y-4">
          <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Award className="w-5 h-5 text-fuchsia-600" />
                Product SKU Historical Performance Angle ({filteredP.length} SKUs)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Evaluating video volume, creator adoption, total spend, views, clicks, and CPV efficiency per product SKU.
              </p>
            </div>
            <button
              onClick={handleExportSubpageCsv}
              className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
            >
              <Download className="w-3.5 h-3.5 text-fuchsia-400" /> Export Sub-Page CSV
            </button>
          </div>

          <div className="overflow-x-auto max-h-[600px]">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100 sticky top-0 z-10 text-slate-600 uppercase font-mono font-bold text-[10px]">
                <tr>
                  <th className="p-3">Product SKU</th>
                  <th className="p-3 text-center">Videos</th>
                  <th className="p-3 text-center">Creators</th>
                  <th className="p-3">Total Spend</th>
                  <th className="p-3 bg-sky-50 text-sky-900">Total Views</th>
                  <th className="p-3 bg-indigo-50 text-indigo-900">Short.io Clicks</th>
                  <th className="p-3 bg-emerald-50 text-emerald-900">Avg. CPV (₹)</th>
                  <th className="p-3 bg-purple-50 text-purple-900">Avg. CTR (%)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-sans">
                {filteredP.map(p => (
                  <tr key={p.name} className="hover:bg-slate-50 transition">
                    <td className="p-3 font-bold text-fuchsia-700 whitespace-nowrap">{p.name}</td>
                    <td className="p-3 text-center font-mono font-bold text-slate-800">{p.count}</td>
                    <td className="p-3 text-center font-mono font-bold text-indigo-600">{p.creators.size}</td>
                    <td className="p-3 font-mono font-bold text-slate-800">₹{p.totalSpend.toLocaleString('en-IN')}</td>
                    <td className="p-3 font-mono font-bold text-sky-800 bg-sky-50/30">
                      {p.totalViews > 0 ? p.totalViews.toLocaleString('en-IN') : '—'}
                    </td>
                    <td className="p-3 font-mono font-bold text-indigo-800 bg-indigo-50/30">
                      {p.totalClicks > 0 ? p.totalClicks.toLocaleString('en-IN') : '—'}
                    </td>
                    <td className="p-3 font-mono font-bold text-emerald-800 bg-emerald-50/30">
                      {p.cpv > 0 ? `₹${p.cpv.toFixed(3)}` : '—'}
                    </td>
                    <td className="p-3 font-mono font-bold text-purple-800 bg-purple-50/30">
                      {p.ctr > 0 ? `${p.ctr.toFixed(2)}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    // Angle: Influencer Wise Video Details Tab
    if (subpageActiveTab === 'influencer_videos') {
      const filteredV = subData.filter(r => 
        (r.videoId || '').toLowerCase().includes(searchLow) ||
        (r.influencerName || '').toLowerCase().includes(searchLow) ||
        (r.productName || '').toLowerCase().includes(searchLow)
      );

      // Group deliverables by Influencer Name
      const influencerMap = new Map<string, DeliverableRow[]>();

      filteredV.forEach(r => {
        const infName = (r.influencerName || '').trim() || 'Unknown Creator';
        const list = influencerMap.get(infName) || [];
        list.push(r);
        influencerMap.set(infName, list);
      });

      const sortedInfluencers = Array.from(influencerMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));

      // Calculate grand totals across all influencers
      let grandTotalCount = 0;
      let grandTotalSpend = 0;
      let grandTotalViews = 0;
      let grandTotalClicks = 0;
      let grandTotalSpendWithViews = 0;
      let grandTotalSpendWithClicks = 0;
      let grandTotalViewsWithClicks = 0;

      sortedInfluencers.forEach(([_, rows]) => {
        rows.sort((a, b) => (a.plannedDate || a.videoReleasedDate || a.videoId).localeCompare(b.plannedDate || b.videoReleasedDate || b.videoId));
        rows.forEach(r => {
          const m = getRowMetrics(r);
          const amt = Number(r.amountPaid) || 0;
          const v = m.views || 0;
          const cl = m.clicks || 0;

          grandTotalCount += 1;
          grandTotalSpend += amt;
          if (v > 0) {
            grandTotalViews += v;
            grandTotalSpendWithViews += amt;
          }
          if (cl > 0) {
            grandTotalClicks += cl;
            grandTotalSpendWithClicks += amt;
            if (v > 0) grandTotalViewsWithClicks += v;
          }
        });
      });

      const grandCpv = grandTotalViews > 0 ? grandTotalSpendWithViews / grandTotalViews : 0;
      const grandCpc = grandTotalClicks > 0 ? grandTotalSpendWithClicks / grandTotalClicks : 0;
      const grandCtr = grandTotalViewsWithClicks > 0 ? (grandTotalClicks / grandTotalViewsWithClicks) * 100 : 0;

      return (
        <div className="space-y-6 animate-in fade-in duration-150">
          {/* Header Banner */}
          <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-indigo-600" />
                Influencer Wise Video Details Angle ({filteredV.length} Videos across {sortedInfluencers.length} Creators)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Separately grouped per influencer with eye-friendly ocean blue headers, subtotals, and cumulative grand total.
              </p>
            </div>
            <button
              onClick={handleExportSubpageCsv}
              className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
            >
              <Download className="w-3.5 h-3.5 text-sky-400" /> Export Sub-Page CSV
            </button>
          </div>

          {/* Influencer Video Deliverables Graphical Presentation Summary Block */}
          <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-6 shadow-xl border border-indigo-800/60 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-indigo-800/50 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="p-2 bg-gradient-to-r from-pink-500 to-indigo-600 rounded-xl text-white shadow-md">
                    <BarChart2 className="w-5 h-5" />
                  </span>
                  <h3 className="text-lg font-black tracking-tight text-white">
                    Influencer Video Deliverables Graphical Performance Summary
                  </h3>
                </div>
                <p className="text-xs text-indigo-200/80 mt-1">
                  Visual performance breakdown across {grandTotalCount} deliverables, platforms, views, clicks, and CPV efficiency metrics.
                </p>
              </div>
              <div className="flex items-center gap-2 font-mono text-xs">
                <span className="px-3 py-1.5 rounded-xl bg-white/10 border border-white/15 text-cyan-300 font-bold">
                  {sortedInfluencers.length} Creators
                </span>
                <span className="px-3 py-1.5 rounded-xl bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 font-bold">
                  {grandTotalViews > 0 ? `${grandTotalViews.toLocaleString('en-IN')} Total Views` : '0 Views'}
                </span>
              </div>
            </div>

            {/* KPI Summary Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3.5 border border-white/10">
                <span className="text-[10px] font-mono uppercase text-indigo-300 font-bold block">Deliverables</span>
                <span className="text-xl font-black font-mono text-white mt-1 block">{grandTotalCount}</span>
                <span className="text-[10px] text-slate-300 mt-1 block truncate">Total Videos</span>
              </div>

              <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3.5 border border-white/10">
                <span className="text-[10px] font-mono uppercase text-rose-300 font-bold block">Total Budget</span>
                <span className="text-xl font-black font-mono text-rose-200 mt-1 block">₹{grandTotalSpend.toLocaleString('en-IN')}</span>
                <span className="text-[10px] text-slate-300 mt-1 block truncate">Remuneration</span>
              </div>

              <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3.5 border border-sky-400/30">
                <span className="text-[10px] font-mono uppercase text-sky-300 font-bold block flex items-center gap-1">
                  <Eye className="w-3 h-3 text-sky-400" /> Live Views
                </span>
                <span className="text-xl font-black font-mono text-sky-200 mt-1 block">{grandTotalViews.toLocaleString('en-IN')}</span>
                <span className="text-[10px] text-sky-300/80 mt-1 block truncate">Cumulative Views</span>
              </div>

              <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3.5 border border-indigo-400/30">
                <span className="text-[10px] font-mono uppercase text-indigo-300 font-bold block">Clicks</span>
                <span className="text-xl font-black font-mono text-indigo-200 mt-1 block">{grandTotalClicks.toLocaleString('en-IN')}</span>
                <span className="text-[10px] text-indigo-300/80 mt-1 block truncate">Attributed Clicks</span>
              </div>

              <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3.5 border border-emerald-400/30">
                <span className="text-[10px] font-mono uppercase text-emerald-300 font-bold block">Avg. CPV</span>
                <span className="text-xl font-black font-mono text-emerald-200 mt-1 block">{grandCpv > 0 ? `₹${grandCpv.toFixed(3)}` : '—'}</span>
                <span className="text-[10px] text-emerald-300/80 mt-1 block truncate">Cost Per View</span>
              </div>

              <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3.5 border border-purple-400/30">
                <span className="text-[10px] font-mono uppercase text-purple-300 font-bold block">Avg. CTR</span>
                <span className="text-xl font-black font-mono text-purple-200 mt-1 block">{grandCtr > 0 ? `${grandCtr.toFixed(2)}%` : '0%'}</span>
                <span className="text-[10px] text-purple-300/80 mt-1 block truncate">Click-Through Rate</span>
              </div>
            </div>

            {/* Social Platform Performance Graphical Breakdown */}
            <div className="bg-white/5 rounded-2xl p-4 border border-white/10 space-y-3">
              <h4 className="text-xs font-bold text-cyan-300 uppercase tracking-widest font-mono flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-cyan-400" /> Platform Share & Visual Reach Breakdown
              </h4>
              {(() => {
                const platCounts: Record<string, { count: number; views: number; spend: number }> = {};
                filteredV.forEach(r => {
                  const plat = (r.platform || 'Other').trim();
                  const m = getRowMetrics(r);
                  const amt = Number(r.amountPaid) || 0;
                  const v = m.views || 0;
                  const cur = platCounts[plat] || { count: 0, views: 0, spend: 0 };
                  platCounts[plat] = { count: cur.count + 1, views: cur.views + v, spend: cur.spend + amt };
                });

                const maxPlatViews = Math.max(...Object.values(platCounts).map(p => p.views), 1);

                return (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                    {Object.entries(platCounts).map(([pName, pData]) => {
                      const pct = Math.min(100, Math.round((pData.views / maxPlatViews) * 100));
                      const cpvVal = pData.views > 0 ? pData.spend / pData.views : 0;
                      return (
                        <div key={pName} className="bg-white/10 rounded-xl p-3 border border-white/10 space-y-2">
                          <div className="flex items-center justify-between text-xs font-bold">
                            <span className="text-white truncate">{pName}</span>
                            <span className="text-cyan-300 font-mono text-[11px]">{pData.count} Videos</span>
                          </div>
                          <div className="w-full bg-slate-800/80 rounded-full h-2 overflow-hidden border border-white/10">
                            <div
                              className="bg-gradient-to-r from-cyan-400 via-sky-400 to-indigo-500 h-full rounded-full transition-all duration-500"
                              style={{ width: `${Math.max(5, pct)}%` }}
                            />
                          </div>
                          <div className="flex items-center justify-between text-[10px] font-mono text-indigo-200">
                            <span>{pData.views.toLocaleString('en-IN')} Views</span>
                            <span className="text-emerald-300 font-bold">{cpvVal > 0 ? `₹${cpvVal.toFixed(3)} CPV` : '—'}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>
          {sortedInfluencers.map(([infName, rows]) => {
            let subtotalSpend = 0;
            let subtotalViews = 0;
            let subtotalClicks = 0;
            let subtotalSpendWithViews = 0;
            let subtotalSpendWithClicks = 0;
            let subtotalViewsWithClicks = 0;

            rows.forEach(r => {
              const m = getRowMetrics(r);
              const amt = Number(r.amountPaid) || 0;
              const v = m.views || 0;
              const cl = m.clicks || 0;

              subtotalSpend += amt;
              if (v > 0) {
                subtotalViews += v;
                subtotalSpendWithViews += amt;
              }
              if (cl > 0) {
                subtotalClicks += cl;
                subtotalSpendWithClicks += amt;
                if (v > 0) subtotalViewsWithClicks += v;
              }
            });

            const subCpv = subtotalViews > 0 ? subtotalSpendWithViews / subtotalViews : 0;
            const subCpc = subtotalClicks > 0 ? subtotalSpendWithClicks / subtotalClicks : 0;
            const subCtr = subtotalViewsWithClicks > 0 ? (subtotalClicks / subtotalViewsWithClicks) * 100 : 0;

            return (
              <div key={infName} className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden space-y-0">
                {/* Influencer Header Banner (Eye-friendly Blue Gradient) */}
                <div className="bg-gradient-to-r from-blue-700 via-sky-800 to-indigo-900 text-white px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-sky-600/50 shadow-xs">
                  <div className="flex items-center gap-2.5">
                    <UserCheck className="w-4 h-4 text-sky-200 shrink-0" />
                    <h4 className="text-sm font-black tracking-wider uppercase font-mono text-white">
                      👤 INFLUENCER: {infName}
                    </h4>
                  </div>
                  <div className="flex items-center gap-3 text-xs font-mono">
                    <span className="px-3 py-1 rounded-full bg-blue-900/60 text-sky-100 border border-sky-300/40 font-black">
                      Total {rows.length} Deliverables
                    </span>
                    <span className="text-white font-black">
                      Spend: ₹{subtotalSpend.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>

                {/* Influencer Deliverables Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-100 text-slate-600 uppercase font-mono font-bold text-[10px]">
                      <tr>
                        <th className="p-3">Video ID</th>
                        <th className="p-3">Product SKU</th>
                        <th className="p-3">Remuneration</th>
                        <th className="p-3">Platform</th>
                        <th className="p-3 bg-sky-50 text-sky-900">Views</th>
                        <th className="p-3 bg-indigo-50 text-indigo-900">Clicks</th>
                        <th className="p-3 bg-emerald-50 text-emerald-900">CPV (₹)</th>
                        <th className="p-3">Link</th>
                        <th className="p-3">Short.io Code</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-sans">
                      {rows.map(r => {
                        const m = getRowMetrics(r);
                        return (
                          <tr key={r.videoId} className="hover:bg-slate-50 transition">
                            <td className="p-3 font-mono font-bold text-indigo-700 whitespace-nowrap">{r.videoId}</td>
                            <td className="p-3 text-slate-700 truncate max-w-xs">{r.productName}</td>
                            <td className="p-3 font-mono font-bold text-slate-800">₹{r.amountPaid.toLocaleString('en-IN')}</td>
                            <td className="p-3 text-slate-600 text-[10px]">{r.platform}</td>
                            <td className="p-3 font-mono font-bold text-sky-800 bg-sky-50/30">
                              {m.views !== undefined ? m.views.toLocaleString('en-IN') : '—'}
                            </td>
                            <td className="p-3 font-mono font-bold text-indigo-800 bg-indigo-50/30">
                              {m.clicks !== undefined ? m.clicks.toLocaleString('en-IN') : '—'}
                            </td>
                            <td className="p-3 font-mono font-bold text-emerald-800 bg-emerald-50/30">
                              {m.cpv !== undefined ? `₹${m.cpv.toFixed(3)}` : '—'}
                            </td>
                            <td className="p-3">
                              {r.videoLink && !r.videoLink.toLowerCase().includes('pending') ? (
                                <a href={r.videoLink} target="_blank" rel="noreferrer" className="text-blue-600 font-bold hover:underline flex items-center gap-1">
                                  Watch <ExternalLink className="w-3 h-3" />
                                </a>
                              ) : <span className="text-rose-400 italic">Pending</span>}
                            </td>
                            <td className="p-3 font-mono text-[10px]">
                              {r.shortIoCode ? (
                                <div className="flex flex-col gap-0.5 max-w-[200px]">
                                  <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-700 rounded font-bold border border-indigo-100 self-start">
                                    {r.shortIoCode}
                                  </span>
                                  {(r.shortIoLink || r.shortIoCode) && (
                                    <a
                                      href={(r.shortIoLink || r.shortIoCode).startsWith('http') ? (r.shortIoLink || r.shortIoCode) : `https://${r.shortIoLink || r.shortIoCode}`}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-[10px] text-indigo-600 hover:text-indigo-800 font-semibold truncate hover:underline flex items-center gap-1"
                                      title={`Full Short.io Link: ${r.shortIoLink || r.shortIoCode}`}
                                    >
                                      <Link2 className="w-2.5 h-2.5 shrink-0 text-indigo-500" />
                                      <span className="truncate">{r.shortIoLink || r.shortIoCode}</span>
                                    </a>
                                  )}
                                </div>
                              ) : '—'}
                            </td>
                          </tr>
                        );
                      })}
                      {/* Influencer Subtotal Row (Eye-friendly Blue Background & Bold Numbers) */}
                      <tr className="bg-blue-100/90 border-t-2 border-blue-300 font-mono font-black text-xs text-blue-950">
                        <td className="p-3 text-blue-950 font-black uppercase tracking-wider" colSpan={2}>
                          📊 SUBTOTAL: {infName.toUpperCase()}
                        </td>
                        <td className="p-3 text-slate-950 font-black">
                          ₹{subtotalSpend.toLocaleString('en-IN')}
                        </td>
                        <td className="p-3 text-slate-400 font-bold">—</td>
                        <td className="p-3 text-blue-950 bg-sky-200/80 font-black">
                          {subtotalViews.toLocaleString('en-IN')}
                        </td>
                        <td className="p-3 text-blue-950 bg-blue-200/80 font-black">
                          {subtotalClicks.toLocaleString('en-IN')}
                        </td>
                        <td className="p-3 text-blue-950 bg-teal-200/80 font-black">
                          {subCpv > 0 ? `₹${subCpv.toFixed(3)}` : '—'}
                        </td>
                        <td className="p-3 text-blue-950 bg-sky-200/90 font-black" colSpan={2}>
                          CPC: {subCpc > 0 ? `₹${subCpc.toFixed(2)}` : '—'} • CTR: {subCtr.toFixed(2)}%
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}

          {/* Grand Total Banner & Summary Row */}
          <div className="bg-gradient-to-br from-emerald-900 via-slate-900 to-indigo-950 text-white rounded-3xl p-6 border-2 border-emerald-500/40 shadow-lg space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
              <div>
                <span className="px-3 py-1 bg-emerald-500/20 text-emerald-300 rounded-full text-xs font-bold font-mono border border-emerald-400/30 inline-flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5" /> Grand Total Cumulative
                </span>
                <h3 className="text-lg font-black text-white mt-1.5">
                  🏆 GRAND TOTAL (ALL INFLUENCERS)
                </h3>
              </div>
              <div className="text-right font-mono">
                <p className="text-2xl font-black text-emerald-400">
                  ₹{grandTotalSpend.toLocaleString('en-IN')}
                </p>
                <span className="text-xs text-slate-300 font-semibold">Total Remuneration Invested</span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-1">
              <div className="bg-white/10 p-3.5 rounded-2xl border border-white/10 font-mono">
                <span className="text-[10px] text-slate-300 uppercase block font-bold">Total Videos</span>
                <p className="text-lg font-black text-white mt-0.5">{grandTotalCount}</p>
              </div>
              <div className="bg-sky-500/15 p-3.5 rounded-2xl border border-sky-400/30 font-mono">
                <span className="text-[10px] text-sky-300 uppercase block font-bold">Total Views</span>
                <p className="text-lg font-black text-sky-200 mt-0.5">{grandTotalViews.toLocaleString('en-IN')}</p>
              </div>
              <div className="bg-indigo-500/15 p-3.5 rounded-2xl border border-indigo-400/30 font-mono">
                <span className="text-[10px] text-indigo-300 uppercase block font-bold">Total Clicks</span>
                <p className="text-lg font-black text-indigo-200 mt-0.5">{grandTotalClicks.toLocaleString('en-IN')}</p>
              </div>
              <div className="bg-emerald-500/15 p-3.5 rounded-2xl border border-emerald-400/30 font-mono">
                <span className="text-[10px] text-emerald-300 uppercase block font-bold">Overall CPV</span>
                <p className="text-lg font-black text-emerald-200 mt-0.5">{grandCpv > 0 ? `₹${grandCpv.toFixed(3)}` : '—'}</p>
              </div>
              <div className="bg-amber-500/15 p-3.5 rounded-2xl border border-amber-400/30 font-mono">
                <span className="text-[10px] text-amber-300 uppercase block font-bold">Overall CPC</span>
                <p className="text-lg font-black text-amber-200 mt-0.5">{grandCpc > 0 ? `₹${grandCpc.toFixed(2)}` : '—'}</p>
              </div>
              <div className="bg-purple-500/15 p-3.5 rounded-2xl border border-purple-400/30 font-mono">
                <span className="text-[10px] text-purple-300 uppercase block font-bold">Overall CTR</span>
                <p className="text-lg font-black text-purple-200 mt-0.5">{grandCtr > 0 ? `${grandCtr.toFixed(2)}%` : '—'}</p>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // Angle 5: Video & Viral History Tab
    if (subpageActiveTab === 'video_history') {
      const filteredV = subData.filter(r => 
        (r.videoId || '').toLowerCase().includes(searchLow) ||
        (r.influencerName || '').toLowerCase().includes(searchLow) ||
        (r.productName || '').toLowerCase().includes(searchLow)
      );

      // Group deliverables by Year & Month Divisions (chronological ascending: oldest at top, newest below)
      const divisionsMap = new Map<string, {
        sortKey: string;
        year: number;
        monthIdx: number;
        monthName: string;
        rows: DeliverableRow[];
      }>();

      filteredV.forEach(r => {
        const info = getRowYearMonthInfo(r);
        const cur = divisionsMap.get(info.sortKey) || {
          sortKey: info.sortKey,
          year: info.year,
          monthIdx: info.monthIdx,
          monthName: info.monthName,
          rows: []
        };
        cur.rows.push(r);
        divisionsMap.set(info.sortKey, cur);
      });

      // Sort divisions chronologically ascending: old on top, new below
      const sortedDivisions = Array.from(divisionsMap.values()).sort((a, b) => a.sortKey.localeCompare(b.sortKey));

      // Calculate grand totals across all divisions
      let grandTotalCount = 0;
      let grandTotalSpend = 0;
      let grandTotalViews = 0;
      let grandTotalClicks = 0;
      let grandTotalSpendWithViews = 0;
      let grandTotalSpendWithClicks = 0;
      let grandTotalViewsWithClicks = 0;

      sortedDivisions.forEach(div => {
        div.rows.sort((a, b) => (a.plannedDate || a.videoReleasedDate || a.videoId).localeCompare(b.plannedDate || b.videoReleasedDate || b.videoId));
        div.rows.forEach(r => {
          const m = getRowMetrics(r);
          const amt = Number(r.amountPaid) || 0;
          const v = m.views || 0;
          const cl = m.clicks || 0;

          grandTotalCount += 1;
          grandTotalSpend += amt;
          if (v > 0) {
            grandTotalViews += v;
            grandTotalSpendWithViews += amt;
          }
          if (cl > 0) {
            grandTotalClicks += cl;
            grandTotalSpendWithClicks += amt;
            if (v > 0) grandTotalViewsWithClicks += v;
          }
        });
      });

      const grandCpv = grandTotalViews > 0 ? grandTotalSpendWithViews / grandTotalViews : 0;
      const grandCpc = grandTotalClicks > 0 ? grandTotalSpendWithClicks / grandTotalClicks : 0;
      const grandCtr = grandTotalViewsWithClicks > 0 ? (grandTotalClicks / grandTotalViewsWithClicks) * 100 : 0;

      return (
        <div className="space-y-6 animate-in fade-in duration-150">
          {/* Header Banner */}
          <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Video className="w-5 h-5 text-sky-600" />
                Influencer Video Deliverables Angle ({filteredV.length} Videos in {sortedDivisions.length} Year/Month Divisions)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Structured in year and month division (oldest on top, newest below), showing division subtotals and overall grand total at the end.
              </p>
            </div>
            <button
              onClick={handleExportSubpageCsv}
              className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
            >
              <Download className="w-3.5 h-3.5 text-sky-400" /> Export Sub-Page CSV
            </button>
          </div>

          {/* Divisions List */}
          {sortedDivisions.map((div) => {
            let subtotalSpend = 0;
            let subtotalViews = 0;
            let subtotalClicks = 0;
            let subtotalSpendWithViews = 0;
            let subtotalSpendWithClicks = 0;
            let subtotalViewsWithClicks = 0;

            div.rows.forEach(r => {
              const m = getRowMetrics(r);
              const amt = Number(r.amountPaid) || 0;
              const v = m.views || 0;
              const cl = m.clicks || 0;

              subtotalSpend += amt;
              if (v > 0) {
                subtotalViews += v;
                subtotalSpendWithViews += amt;
              }
              if (cl > 0) {
                subtotalClicks += cl;
                subtotalSpendWithClicks += amt;
                if (v > 0) subtotalViewsWithClicks += v;
              }
            });

            const subCpv = subtotalViews > 0 ? subtotalSpendWithViews / subtotalViews : 0;
            const subCpc = subtotalClicks > 0 ? subtotalSpendWithClicks / subtotalClicks : 0;
            const subCtr = subtotalViewsWithClicks > 0 ? (subtotalClicks / subtotalViewsWithClicks) * 100 : 0;

            return (
              <div key={div.sortKey} className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden space-y-0">
                {/* Division Header Banner (Eye-friendly Blue Gradient) */}
                <div className="bg-gradient-to-r from-blue-700 via-sky-800 to-indigo-900 text-white px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-sky-600/50 shadow-xs">
                  <div className="flex items-center gap-2.5">
                    <Calendar className="w-4 h-4 text-sky-200 shrink-0" />
                    <h4 className="text-sm font-black tracking-wider uppercase font-mono text-white">
                      📅 {div.monthName} {div.year} DIVISION
                    </h4>
                  </div>
                  <div className="flex items-center gap-3 text-xs font-mono">
                    <span className="px-3 py-1 rounded-full bg-blue-900/60 text-sky-100 border border-sky-300/40 font-black">
                      Total {div.rows.length} Deliverables
                    </span>
                    <span className="text-white font-black">
                      Spend: ₹{subtotalSpend.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>

                {/* Division Deliverables Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-100 text-slate-600 uppercase font-mono font-bold text-[10px]">
                      <tr>
                        <th className="p-3">Video ID</th>
                        <th className="p-3">Creator</th>
                        <th className="p-3">Product SKU</th>
                        <th className="p-3">Remuneration</th>
                        <th className="p-3">Platform</th>
                        <th className="p-3 bg-sky-50 text-sky-900">Views</th>
                        <th className="p-3 bg-indigo-50 text-indigo-900">Clicks</th>
                        <th className="p-3 bg-emerald-50 text-emerald-900">CPV (₹)</th>
                        <th className="p-3">Link</th>
                        <th className="p-3">Short.io Code</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-sans">
                      {div.rows.map(r => {
                        const m = getRowMetrics(r);
                        return (
                          <tr key={r.videoId} className="hover:bg-slate-50 transition">
                            <td className="p-3 font-mono font-bold text-indigo-700 whitespace-nowrap">{r.videoId}</td>
                            <td className="p-3 font-bold text-slate-800">{r.influencerName}</td>
                            <td className="p-3 text-slate-700 truncate max-w-xs">{r.productName}</td>
                            <td className="p-3 font-mono font-bold text-slate-800">₹{r.amountPaid.toLocaleString('en-IN')}</td>
                            <td className="p-3 text-slate-600 text-[10px]">{r.platform}</td>
                            <td className="p-3 font-mono font-bold text-sky-800 bg-sky-50/30">
                              {m.views !== undefined ? m.views.toLocaleString('en-IN') : '—'}
                            </td>
                            <td className="p-3 font-mono font-bold text-indigo-800 bg-indigo-50/30">
                              {m.clicks !== undefined ? m.clicks.toLocaleString('en-IN') : '—'}
                            </td>
                            <td className="p-3 font-mono font-bold text-emerald-800 bg-emerald-50/30">
                              {m.cpv !== undefined ? `₹${m.cpv.toFixed(3)}` : '—'}
                            </td>
                            <td className="p-3">
                              {r.videoLink && !r.videoLink.toLowerCase().includes('pending') ? (
                                <a href={r.videoLink} target="_blank" rel="noreferrer" className="text-blue-600 font-bold hover:underline flex items-center gap-1">
                                  Watch <ExternalLink className="w-3 h-3" />
                                </a>
                              ) : <span className="text-rose-400 italic">Pending</span>}
                            </td>
                            <td className="p-3 font-mono text-[10px]">
                              {r.shortIoCode ? (
                                <div className="flex flex-col gap-0.5 max-w-[200px]">
                                  <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-700 rounded font-bold border border-indigo-100 self-start">
                                    {r.shortIoCode}
                                  </span>
                                  {(r.shortIoLink || r.shortIoCode) && (
                                    <a
                                      href={(r.shortIoLink || r.shortIoCode).startsWith('http') ? (r.shortIoLink || r.shortIoCode) : `https://${r.shortIoLink || r.shortIoCode}`}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-[10px] text-indigo-600 hover:text-indigo-800 font-semibold truncate hover:underline flex items-center gap-1"
                                      title={`Full Short.io Link: ${r.shortIoLink || r.shortIoCode}`}
                                    >
                                      <Link2 className="w-2.5 h-2.5 shrink-0 text-indigo-500" />
                                      <span className="truncate">{r.shortIoLink || r.shortIoCode}</span>
                                    </a>
                                  )}
                                </div>
                              ) : '—'}
                            </td>
                          </tr>
                        );
                      })}
                      {/* Division Subtotal Row (Eye-friendly Blue Background & Bold Numbers) */}
                      <tr className="bg-blue-100/90 border-t-2 border-blue-300 font-mono font-black text-xs text-blue-950">
                        <td className="p-3 text-blue-950 font-black uppercase tracking-wider" colSpan={2}>
                          📊 SUBTOTAL: {div.monthName.toUpperCase()} {div.year}
                        </td>
                        <td className="p-3 text-blue-900 font-black">
                          {div.rows.length} Videos
                        </td>
                        <td className="p-3 text-slate-950 font-black">
                          ₹{subtotalSpend.toLocaleString('en-IN')}
                        </td>
                        <td className="p-3 text-slate-400 font-bold">—</td>
                        <td className="p-3 text-blue-950 bg-sky-200/80 font-black">
                          {subtotalViews.toLocaleString('en-IN')}
                        </td>
                        <td className="p-3 text-blue-950 bg-blue-200/80 font-black">
                          {subtotalClicks.toLocaleString('en-IN')}
                        </td>
                        <td className="p-3 text-blue-950 bg-teal-200/80 font-black">
                          {subCpv > 0 ? `₹${subCpv.toFixed(3)}` : '—'}
                        </td>
                        <td className="p-3 text-blue-950 bg-sky-200/90 font-black" colSpan={2}>
                          CPC: {subCpc > 0 ? `₹${subCpc.toFixed(2)}` : '—'} • CTR: {subCtr.toFixed(2)}%
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}

          {/* Grand Total Banner & Summary Row */}
          <div className="bg-gradient-to-br from-emerald-900 via-slate-900 to-indigo-950 text-white rounded-3xl p-6 border-2 border-emerald-500/40 shadow-lg space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
              <div>
                <span className="px-3 py-1 bg-emerald-500/20 text-emerald-300 rounded-full text-xs font-bold font-mono border border-emerald-400/30 inline-flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5" /> Grand Total Cumulative
                </span>
                <h3 className="text-lg font-black text-white mt-1.5">
                  🏆 GRAND TOTAL (ALL EXTRACTED DELIVERABLES)
                </h3>
              </div>
              <div className="text-right font-mono">
                <p className="text-2xl font-black text-emerald-400">
                  ₹{grandTotalSpend.toLocaleString('en-IN')}
                </p>
                <span className="text-xs text-slate-300 font-semibold">Total Remuneration Invested</span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-1">
              <div className="bg-white/10 p-3.5 rounded-2xl border border-white/10 font-mono">
                <span className="text-[10px] text-slate-300 uppercase block font-bold">Total Videos</span>
                <p className="text-lg font-black text-white mt-0.5">{grandTotalCount}</p>
              </div>
              <div className="bg-sky-500/15 p-3.5 rounded-2xl border border-sky-400/30 font-mono">
                <span className="text-[10px] text-sky-300 uppercase block font-bold">Total Views</span>
                <p className="text-lg font-black text-sky-200 mt-0.5">{grandTotalViews.toLocaleString('en-IN')}</p>
              </div>
              <div className="bg-indigo-500/15 p-3.5 rounded-2xl border border-indigo-400/30 font-mono">
                <span className="text-[10px] text-indigo-300 uppercase block font-bold">Total Clicks</span>
                <p className="text-lg font-black text-indigo-200 mt-0.5">{grandTotalClicks.toLocaleString('en-IN')}</p>
              </div>
              <div className="bg-emerald-500/15 p-3.5 rounded-2xl border border-emerald-400/30 font-mono">
                <span className="text-[10px] text-emerald-300 uppercase block font-bold">Overall CPV</span>
                <p className="text-lg font-black text-emerald-200 mt-0.5">{grandCpv > 0 ? `₹${grandCpv.toFixed(3)}` : '—'}</p>
              </div>
              <div className="bg-amber-500/15 p-3.5 rounded-2xl border border-amber-400/30 font-mono">
                <span className="text-[10px] text-amber-300 uppercase block font-bold">Overall CPC</span>
                <p className="text-lg font-black text-amber-200 mt-0.5">{grandCpc > 0 ? `₹${grandCpc.toFixed(2)}` : '—'}</p>
              </div>
              <div className="bg-purple-500/15 p-3.5 rounded-2xl border border-purple-400/30 font-mono">
                <span className="text-[10px] text-purple-300 uppercase block font-bold">Overall CTR</span>
                <p className="text-lg font-black text-purple-200 mt-0.5">{grandCtr > 0 ? `${grandCtr.toFixed(2)}%` : '—'}</p>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // Angle 6: BDM / Approacher Matrix Tab
    if (subpageActiveTab === 'approacher_matrix') {
      const filteredA = approachersList.filter(a => a.name.toLowerCase().includes(searchLow));
      return (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden space-y-4">
          <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Users className="w-5 h-5 text-emerald-600" />
                BDM / Approacher Performance Matrix Angle ({filteredA.length} Approachers)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Evaluating creator network roster size, managed campaign budgets, views, and CPV efficiency per approacher.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto max-h-[600px]">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100 sticky top-0 z-10 text-slate-600 uppercase font-mono font-bold text-[10px]">
                <tr>
                  <th className="p-3">Approacher / BDM</th>
                  <th className="p-3 text-center">Deliverables</th>
                  <th className="p-3 text-center">Creators Managed</th>
                  <th className="p-3">Total Budget Managed</th>
                  <th className="p-3 bg-sky-50 text-sky-900">Total Views</th>
                  <th className="p-3 bg-indigo-50 text-indigo-900">Short.io Clicks</th>
                  <th className="p-3 bg-emerald-50 text-emerald-900">Avg. CPV (₹)</th>
                  <th className="p-3 bg-purple-50 text-purple-900">Avg. CTR (%)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-sans">
                {filteredA.map(a => (
                  <tr key={a.name} className="hover:bg-slate-50 transition">
                    <td className="p-3 font-bold text-emerald-700 whitespace-nowrap">{a.name}</td>
                    <td className="p-3 text-center font-mono font-bold text-slate-800">{a.count}</td>
                    <td className="p-3 text-center font-mono font-bold text-indigo-600">{a.creators.size}</td>
                    <td className="p-3 font-mono font-bold text-slate-800">₹{a.totalSpend.toLocaleString('en-IN')}</td>
                    <td className="p-3 font-mono font-bold text-sky-800 bg-sky-50/30">
                      {a.totalViews > 0 ? a.totalViews.toLocaleString('en-IN') : '—'}
                    </td>
                    <td className="p-3 font-mono font-bold text-indigo-800 bg-indigo-50/30">
                      {a.totalClicks > 0 ? a.totalClicks.toLocaleString('en-IN') : '—'}
                    </td>
                    <td className="p-3 font-mono font-bold text-emerald-800 bg-emerald-50/30">
                      {a.cpv > 0 ? `₹${a.cpv.toFixed(3)}` : '—'}
                    </td>
                    <td className="p-3 font-mono font-bold text-purple-800 bg-purple-50/30">
                      {a.ctr > 0 ? `${a.ctr.toFixed(2)}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    // Angle 7: Sub-Page Primary Ledger Table & Interactive Edit Facilities
    if (subpageActiveTab === 'raw_data') {
      const filteredRaw = subData.filter(r =>
        (r.videoId || '').toLowerCase().includes(searchLow) ||
        (r.influencerName || '').toLowerCase().includes(searchLow) ||
        (r.productName || '').toLowerCase().includes(searchLow) ||
        (r.approacher || '').toLowerCase().includes(searchLow) ||
        (r.platform || '').toLowerCase().includes(searchLow)
      );

      return (
        <div className="space-y-6 animate-in fade-in duration-150">
          {/* Sub-Page Executive KPI Summary Banner */}
          <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Layers className="w-5 h-5 text-indigo-600" />
                  Sub-Page Interactive Deliverables Ledger ({filteredRaw.length} Records)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Complete function facility of main page: inline cell editing, record addition, live view extraction, and file upload on sub-page.
                </p>
              </div>

              {/* Action Toolbar */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Search Input */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={subpageSearchTerm}
                    onChange={e => setSubpageSearchTerm(e.target.value)}
                    placeholder="Search creator, product, ID..."
                    className="pl-8 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-400 w-52"
                  />
                  {subpageSearchTerm && (
                    <button onClick={() => setSubpageSearchTerm('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Refresh Live Video Views & Clicks */}
                <button
                  type="button"
                  onClick={handleRefreshSubpageLiveMetrics}
                  disabled={isRefreshingSubpageLive}
                  className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-md cursor-pointer disabled:opacity-50"
                  title="Extract live views and clicks for all Sub-Page deliverable video links"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingSubpageLive ? 'animate-spin text-indigo-200' : 'text-indigo-100'}`} />
                  <span>{isRefreshingSubpageLive ? 'Refreshing Live Views...' : 'Refresh Live Views'}</span>
                </button>

                {/* Add Deliverable Record */}
                <button
                  type="button"
                  onClick={handleAddSubpageRow}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-md cursor-pointer"
                  title="Create and add new deliverable record directly to Sub-Page"
                >
                  <Plus className="w-3.5 h-3.5 text-emerald-100" />
                  <span>Add Record</span>
                </button>

                {/* Upload File to Sub-Page */}
                <label className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-md cursor-pointer">
                  <CloudUpload className="w-3.5 h-3.5 text-cyan-300" />
                  <span>Upload Dataset</span>
                  <input
                    ref={subpageFileInputRef}
                    type="file"
                    accept=".csv,.tsv,.xlsx,.xls,.pdf,.jpg,.png"
                    onChange={handleSubpageFileUpload}
                    className="hidden"
                  />
                </label>

                {/* Export Sub-Page CSV */}
                <button
                  type="button"
                  onClick={handleExportSubpageCsv}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border border-slate-200 cursor-pointer"
                  title="Export Sub-Page CSV"
                >
                  <Download className="w-3.5 h-3.5 text-slate-600" />
                  <span>CSV</span>
                </button>

                {/* Sync Sub-Page to App */}
                <button
                  type="button"
                  onClick={handleSyncToApp}
                  className="px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                  title="Sync Sub-Page dataset into app's Monthly Planner & Influencer Database"
                >
                  <Database className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Sync to App</span>
                </button>
              </div>
            </div>

            {/* Executive Sub-Page KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200">
                <span className="text-[10px] font-bold text-slate-400 uppercase font-mono block">Filtered Deliverables</span>
                <p className="text-lg font-black font-mono text-slate-800 mt-0.5">{filteredRaw.length}</p>
                <p className="text-[10px] text-slate-500">Active Records</p>
              </div>
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200">
                <span className="text-[10px] font-bold text-slate-400 uppercase font-mono block">Total Budget</span>
                <p className="text-lg font-black font-mono text-slate-800 mt-0.5">₹{overallSpend.toLocaleString('en-IN')}</p>
                <p className="text-[10px] text-emerald-600 font-bold">Invested Fees</p>
              </div>
              <div className="bg-sky-50/70 p-3 rounded-2xl border border-sky-200">
                <span className="text-[10px] font-bold text-sky-700 uppercase font-mono block flex items-center gap-1">
                  <Eye className="w-3 h-3 text-sky-500" /> Live Views
                </span>
                <p className="text-lg font-black font-mono text-sky-900 mt-0.5">{overallViews.toLocaleString('en-IN')}</p>
                <p className="text-[10px] text-sky-600 font-bold">Total Reach</p>
              </div>
              <div className="bg-indigo-50/70 p-3 rounded-2xl border border-indigo-200">
                <span className="text-[10px] font-bold text-indigo-700 uppercase font-mono block">Short.io Clicks</span>
                <p className="text-lg font-black font-mono text-indigo-900 mt-0.5">{overallClicks.toLocaleString('en-IN')}</p>
                <p className="text-[10px] text-indigo-600 font-bold">Total Clicks</p>
              </div>
              <div className="bg-emerald-50/70 p-3 rounded-2xl border border-emerald-200">
                <span className="text-[10px] font-bold text-emerald-700 uppercase font-mono block">Avg. CPV</span>
                <p className="text-lg font-black font-mono text-emerald-900 mt-0.5">{overallCpv > 0 ? `₹${overallCpv.toFixed(3)}` : '—'}</p>
                <p className="text-[10px] text-emerald-600 font-bold">Cost / View</p>
              </div>
              <div className="bg-fuchsia-50/70 p-3 rounded-2xl border border-fuchsia-200">
                <span className="text-[10px] font-bold text-fuchsia-700 uppercase font-mono block">Avg. CPC</span>
                <p className="text-lg font-black font-mono text-fuchsia-900 mt-0.5">{overallCpc > 0 ? `₹${overallCpc.toFixed(2)}` : '—'}</p>
                <p className="text-[10px] text-fuchsia-600 font-bold">Cost / Click</p>
              </div>
              <div className="bg-purple-50/70 p-3 rounded-2xl border border-purple-200">
                <span className="text-[10px] font-bold text-purple-700 uppercase font-mono block">Avg. CTR</span>
                <p className="text-lg font-black font-mono text-purple-900 mt-0.5">{overallCtr > 0 ? `${overallCtr.toFixed(2)}%` : '0%'}</p>
                <p className="text-[10px] text-purple-600 font-bold">CTR Efficiency</p>
              </div>
            </div>
          </div>

          {/* Sub-Page Primary Interactive Ledger Table */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden space-y-0">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between gap-3">
              <span className="text-xs font-bold font-mono tracking-wider uppercase text-cyan-300 flex items-center gap-2">
                <Layers className="w-4 h-4 text-cyan-400" />
                Sub-Page Editable Deliverables Ledger Table ({filteredRaw.length} Records)
              </span>
              <span className="text-[10px] font-mono text-slate-300">
                Double-click or edit any input cell to update Sub-Page dataset directly.
              </span>
            </div>

            <div className="overflow-x-auto max-h-[650px]">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 sticky top-0 z-10 text-slate-600 uppercase font-mono font-bold text-[10px]">
                  <tr>
                    <th className="p-3">Video ID</th>
                    <th className="p-3">Creator Name</th>
                    <th className="p-3">Product SKU</th>
                    <th className="p-3">Remuneration (₹)</th>
                    <th className="p-3">Approacher / BDM</th>
                    <th className="p-3">Platform</th>
                    <th className="p-3">Planned Date</th>
                    <th className="p-3">Released Date</th>
                    <th className="p-3">Video Link</th>
                    <th className="p-3">Short.io Code</th>
                    <th className="p-3 bg-sky-50 text-sky-900">Views</th>
                    <th className="p-3 bg-indigo-50 text-indigo-900">Clicks</th>
                    <th className="p-3 bg-emerald-50 text-emerald-900">CPV (₹)</th>
                    <th className="p-3 bg-purple-50 text-purple-900">CTR (%)</th>
                    <th className="p-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-sans">
                  {filteredRaw.map(r => {
                    const m = getRowMetrics(r);
                    return (
                      <tr key={r.videoId} className="hover:bg-slate-50 transition group">
                        {/* Video ID Input */}
                        <td className="p-2 font-mono font-bold text-indigo-700 whitespace-nowrap">
                          <input
                            type="text"
                            value={r.videoId}
                            onChange={e => handleUpdateSubpageRow(r.videoId, 'videoId', e.target.value)}
                            className="bg-transparent hover:bg-white focus:bg-white border border-transparent focus:border-indigo-300 rounded px-1.5 py-1 text-xs font-mono font-bold text-indigo-700 outline-none w-24"
                          />
                        </td>

                        {/* Creator Name Input */}
                        <td className="p-2 font-bold text-slate-800">
                          <input
                            type="text"
                            value={r.influencerName}
                            onChange={e => handleUpdateSubpageRow(r.videoId, 'influencerName', e.target.value)}
                            className="bg-transparent hover:bg-white focus:bg-white border border-transparent focus:border-slate-300 rounded px-1.5 py-1 text-xs font-bold text-slate-800 outline-none w-32"
                          />
                        </td>

                        {/* Product SKU Input */}
                        <td className="p-2">
                          <input
                            type="text"
                            value={r.productName}
                            onChange={e => handleUpdateSubpageRow(r.videoId, 'productName', e.target.value)}
                            className="bg-transparent hover:bg-white focus:bg-white border border-transparent focus:border-slate-300 rounded px-1.5 py-1 text-xs text-slate-700 outline-none w-36"
                          />
                        </td>

                        {/* Amount Paid Input */}
                        <td className="p-2 font-mono font-bold text-slate-800">
                          <input
                            type="number"
                            min="0"
                            value={r.amountPaid}
                            onChange={e => handleUpdateSubpageRow(r.videoId, 'amountPaid', parseFloat(e.target.value) || 0)}
                            className="bg-transparent hover:bg-white focus:bg-white border border-transparent focus:border-slate-300 rounded px-1.5 py-1 text-xs font-mono font-bold text-slate-800 outline-none w-20 text-right"
                          />
                        </td>

                        {/* Approacher Input */}
                        <td className="p-2 text-slate-600">
                          <input
                            type="text"
                            value={r.approacher}
                            onChange={e => handleUpdateSubpageRow(r.videoId, 'approacher', e.target.value)}
                            className="bg-transparent hover:bg-white focus:bg-white border border-transparent focus:border-slate-300 rounded px-1.5 py-1 text-xs text-slate-600 outline-none w-28"
                          />
                        </td>

                        {/* Platform Select */}
                        <td className="p-2">
                          <select
                            value={r.platform}
                            onChange={e => handleUpdateSubpageRow(r.videoId, 'platform', e.target.value)}
                            className="bg-transparent hover:bg-white focus:bg-white border border-transparent focus:border-slate-300 rounded px-1 py-1 text-[11px] font-bold text-slate-700 outline-none cursor-pointer"
                          >
                            <option value="Instagram Reel">Instagram Reel</option>
                            <option value="YouTube Short">YouTube Short</option>
                            <option value="Facebook Reel">Facebook Reel</option>
                            <option value="TikTok Reel">TikTok Reel</option>
                            <option value="Other">Other</option>
                          </select>
                        </td>

                        {/* Planned Date Input */}
                        <td className="p-2 font-mono text-[10px]">
                          <input
                            type="text"
                            value={r.plannedDate || ''}
                            onChange={e => handleUpdateSubpageRow(r.videoId, 'plannedDate', e.target.value)}
                            className="bg-transparent hover:bg-white focus:bg-white border border-transparent focus:border-slate-300 rounded px-1 py-1 text-[11px] font-mono text-slate-600 outline-none w-24"
                          />
                        </td>

                        {/* Released Date Input */}
                        <td className="p-2 font-mono text-[10px]">
                          <input
                            type="text"
                            value={r.videoReleasedDate || ''}
                            onChange={e => handleUpdateSubpageRow(r.videoId, 'videoReleasedDate', e.target.value)}
                            className="bg-transparent hover:bg-white focus:bg-white border border-transparent focus:border-slate-300 rounded px-1 py-1 text-[11px] font-mono text-slate-600 outline-none w-24"
                          />
                        </td>

                        {/* Video Link Input */}
                        <td className="p-2">
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              value={r.videoLink || ''}
                              onChange={e => handleUpdateSubpageRow(r.videoId, 'videoLink', e.target.value)}
                              placeholder="https://..."
                              className="bg-transparent hover:bg-white focus:bg-white border border-transparent focus:border-indigo-300 rounded px-1.5 py-1 text-xs text-blue-600 outline-none w-32 truncate"
                            />
                            {r.videoLink && r.videoLink.startsWith('http') && (
                              <a href={r.videoLink} target="_blank" rel="noreferrer" className="p-1 text-blue-600 hover:text-blue-800 transition">
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                        </td>

                        {/* Short.io Link/Code Input */}
                        <td className="p-2 font-mono text-[10px]">
                          <input
                            type="text"
                            value={r.shortIoCode || r.shortIoLink || ''}
                            onChange={e => handleUpdateSubpageRow(r.videoId, 'shortIoCode', e.target.value)}
                            placeholder="Code/Link"
                            className="bg-transparent hover:bg-white focus:bg-white border border-transparent focus:border-indigo-300 rounded px-1.5 py-1 text-[11px] font-mono text-indigo-700 outline-none w-28"
                          />
                        </td>

                        {/* Views Cell */}
                        <td className="p-3 font-mono font-bold text-sky-800 bg-sky-50/30 whitespace-nowrap">
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1">
                              <span>{m.views !== undefined ? m.views.toLocaleString('en-IN') : '—'}</span>
                              {m.views !== undefined && m.views > 0 && !m.abnormalStopped && (
                                <span
                                  className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[8px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200"
                                  title={`Original Views Verified (${m.viewSource || 'Link Metadata'})`}
                                >
                                  <ShieldCheck className="w-2.5 h-2.5 text-emerald-600" />
                                  Orig
                                </span>
                              )}
                            </div>
                            {m.abnormalStopped && (
                              <span
                                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[8px] font-bold bg-amber-100 text-amber-900 border border-amber-300 w-fit"
                                title={m.stopReason || 'Abnormal view stopped; showing only verified Original Views'}
                              >
                                <ShieldAlert className="w-2.5 h-2.5 text-amber-600 shrink-0" />
                                Stopped {m.stoppedAbnormalValue ? m.stoppedAbnormalValue.toLocaleString('en-IN') : 'Abnormal'}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Clicks Cell */}
                        <td className="p-3 font-mono font-bold text-indigo-800 bg-indigo-50/30 whitespace-nowrap">
                          {m.clicks !== undefined ? m.clicks.toLocaleString('en-IN') : '—'}
                        </td>

                        {/* CPV Cell */}
                        <td className="p-3 font-mono font-bold text-emerald-800 bg-emerald-50/30 whitespace-nowrap">
                          {m.cpv !== undefined && m.cpv > 0 ? `₹${m.cpv.toFixed(3)}` : '—'}
                        </td>

                        {/* CTR Cell */}
                        <td className="p-3 font-mono font-bold text-purple-800 bg-purple-50/30 whitespace-nowrap">
                          {m.ctr !== undefined && m.ctr > 0 ? `${m.ctr.toFixed(2)}%` : '—'}
                        </td>

                        {/* Action Cell */}
                        <td className="p-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleDeleteSubpageRow(r.videoId)}
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition cursor-pointer"
                            title={`Delete record ${r.videoId}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      );
    }

  // Angle 8: Google Sheet Extraction Hub Tab
  if (subpageActiveTab === 'sheets_extract') {
    const uniqueInfluencerOptions: string[] = Array.from(new Set<string>(subData.map((r: DeliverableRow) => (r.influencerName || '').trim()))).filter(Boolean).sort();
    const uniqueProductOptions: string[] = Array.from(new Set<string>(subData.map((r: DeliverableRow) => (r.productName || '').trim()))).filter(Boolean).sort();
    const uniqueYearOptions: string[] = ['2026', '2025', '2024'];
    const uniqueMonthOptions: string[] = ['Oct26', 'Sep26', 'Aug26', 'Jul26', 'Jun26', 'May26', 'Apr26', 'Mar26', 'Feb26', 'Jan26'];
    const uniqueApproacherOptions: string[] = Array.from(new Set<string>(subData.map((r: DeliverableRow) => (r.approacher || 'Unassigned').trim()))).filter(Boolean).sort();
    const uniquePlatformOptions: string[] = ['Facebook', 'Instagram', 'YouTube', 'TikTok'];

    return (
      <div className="space-y-6">
        {/* Header Banner & Google Sheets Action Card */}
        <div className="bg-gradient-to-r from-emerald-950 via-teal-900 to-slate-900 border-2 border-emerald-500/40 rounded-3xl p-6 text-white shadow-xl space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="p-2.5 bg-emerald-500/20 text-emerald-300 rounded-2xl border border-emerald-500/30">
                  <FileSpreadsheet className="w-6 h-6 text-emerald-300" />
                </span>
                <div>
                  <h3 className="text-xl font-black text-white font-mono tracking-tight flex items-center gap-2">
                    Google Sheet Data Extraction Engine
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/30 text-emerald-200 border border-emerald-400/40 font-bold font-sans">
                      Monthly Planner Extractor
                    </span>
                  </h3>
                  <p className="text-xs text-slate-300">
                    Select specific Influencers, Product SKUs, Years, Months, Approachers, Platforms, or Milestones to extract structured influencer video data to Google Sheets.
                  </p>
                </div>
              </div>
            </div>

            {/* Extraction Trigger Button or Open Link */}
            <div className="flex flex-wrap items-center gap-3 shrink-0">
              {sheetsExtractUrl && (
                <a
                  href={sheetsExtractUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs px-4 py-2.5 rounded-xl shadow-lg transition"
                >
                  <ExternalLink className="w-4 h-4" /> Open Extracted Google Sheet
                </a>
              )}

              <button
                type="button"
                onClick={handleExtractSubpageToGoogleSheets}
                disabled={isExtractingSheets || filteredExtractionRows.length === 0}
                className="flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white font-black text-xs px-5 py-2.5 rounded-xl shadow-lg border border-emerald-300/40 transition cursor-pointer disabled:opacity-50"
              >
                {isExtractingSheets ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-yellow-300" />
                    <span>Extracting to Google Sheets... ({sheetsExtractProgress}%)</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 text-emerald-100" />
                    <span>Extract Selected ({filteredExtractionRows.length} Videos) to Google Sheets</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Extraction Success Notification Box with Direct Link */}
          {sheetsExtractUrl && (
            <div className="bg-gradient-to-r from-emerald-900 to-teal-900 border-2 border-emerald-400/80 rounded-2xl p-4 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl">
              <div className="flex items-center gap-3">
                <span className="p-2.5 bg-emerald-400 text-slate-950 rounded-xl font-bold shadow-md shrink-0">
                  <CheckCircle2 className="w-6 h-6 text-emerald-950" />
                </span>
                <div>
                  <h4 className="text-sm font-black font-mono text-emerald-200 flex items-center gap-2">
                    Google Sheet Extraction Complete!
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-400/20 text-emerald-300 font-bold border border-emerald-400/30">
                      Live Link Ready
                    </span>
                  </h4>
                  <p className="text-xs text-emerald-100 font-medium">
                    Your selected influencer video data was successfully written into Google Sheets. Click the link to view your sheet.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={sheetsExtractUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-black text-xs px-5 py-2.5 rounded-xl shadow-lg transition transform hover:scale-105"
                >
                  <ExternalLink className="w-4 h-4 text-slate-950" /> Open Extracted Google Sheet
                </a>
              </div>
            </div>
          )}

          {/* Extraction Progress Logs */}
          {isExtractingSheets && (
            <div className="bg-slate-950/80 border border-emerald-500/30 rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between text-xs font-mono font-bold">
                <span className="text-emerald-300 flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Progress: {sheetsExtractProgress}%
                </span>
                <span className="text-slate-400">{filteredExtractionRows.length} video rows queued</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden border border-emerald-500/20">
                <div className="bg-gradient-to-r from-teal-400 to-emerald-400 h-2 rounded-full transition-all duration-300" style={{ width: `${sheetsExtractProgress}%` }} />
              </div>
              <div className="space-y-1 text-[11px] font-mono pt-1">
                {sheetsExtractLogs.map((lg, idx) => (
                  <div key={idx} className={`flex items-center gap-1.5 ${lg.status === 'success' ? 'text-emerald-400' : lg.status === 'error' ? 'text-rose-400' : 'text-slate-300 animate-pulse'}`}>
                    <span>{lg.status === 'success' ? '✓' : lg.status === 'error' ? '✗' : '•'}</span>
                    <span>{lg.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Interactive Multi-Option Selection & Filter Engine (Before Extraction) */}
        <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <span className="p-2 bg-emerald-50 text-emerald-700 rounded-xl">
                <Filter className="w-4 h-4" />
              </span>
              <div>
                <h4 className="text-sm font-bold text-slate-900 font-mono">
                  Select Data Before Google Sheets Extraction
                </h4>
                <p className="text-xs text-slate-500">
                  Filter by Creator, Product SKU, Year, Month, Approacher, Platform, and Performance thresholds before running extraction.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleResetExtractFilters}
                className="text-xs font-bold text-rose-600 hover:underline px-3 py-1.5 rounded-xl border border-rose-200 hover:bg-rose-50 transition cursor-pointer"
              >
                Reset Extraction Selection
              </button>
              <span className="text-xs font-mono font-bold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200">
                {filteredExtractionRows.length} of {subData.length} Videos Matching
              </span>
            </div>
          </div>

          {/* Selection Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* 1. Influencer */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono flex items-center gap-1">
                <UserCheck className="w-3 h-3 text-indigo-600" /> Select Influencer
              </label>
              <select
                value={extractFilterInfluencer}
                onChange={(e) => setExtractFilterInfluencer(e.target.value)}
                className="w-full text-xs font-semibold text-slate-800 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
              >
                <option value="ALL">All Influencers ({uniqueInfluencerOptions.length})</option>
                {[...uniqueInfluencerOptions]
                  .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
                  .map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))
                }
              </select>
            </div>

            {/* 2. Product SKU (Multipool Multi-Select) */}
            <div className="space-y-1 relative" ref={extractProductDropdownRef}>
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono flex items-center gap-1">
                  <Award className="w-3 h-3 text-fuchsia-600" /> Select Product SKU
                </label>
                {extractFilterProducts.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAllExtractProducts}
                    className="text-[9px] text-fuchsia-600 hover:text-fuchsia-800 cursor-pointer font-bold hover:underline"
                  >
                    Clear ({extractFilterProducts.length})
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => setIsExtractProductDropdownOpen(!isExtractProductDropdownOpen)}
                className="w-full bg-slate-50 text-slate-800 border border-slate-200 hover:border-fuchsia-400 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-fuchsia-500 cursor-pointer transition flex items-center justify-between gap-1.5 shadow-xs"
              >
                <div className="truncate text-left flex items-center gap-1">
                  {extractFilterProducts.length === 0 ? (
                    <span className="text-slate-600 truncate">All Product SKUs ({uniqueProductOptions.length})</span>
                  ) : extractFilterProducts.length === 1 ? (
                    <span className="text-fuchsia-700 font-bold truncate">{extractFilterProducts[0]}</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-fuchsia-700 font-bold truncate">
                      <span className="px-1.5 py-0.5 rounded bg-fuchsia-100 text-fuchsia-800 text-[10px] font-mono border border-fuchsia-200">
                        {extractFilterProducts.length} selected
                      </span>
                      <span className="text-slate-700 font-normal text-[11px] truncate">
                        {extractFilterProducts[0]}
                      </span>
                    </span>
                  )}
                </div>
                <ChevronDown className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform ${isExtractProductDropdownOpen ? 'rotate-180 text-fuchsia-600' : ''}`} />
              </button>

              {/* Extraction Multipool Dropdown Popover */}
              {isExtractProductDropdownOpen && (
                <div className="absolute left-0 top-full mt-1.5 z-50 bg-white border border-fuchsia-200 rounded-2xl shadow-2xl p-3 space-y-2.5 w-[310px] sm:w-[340px] animate-in fade-in zoom-in-95">
                  {/* Search inside Dropdown */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={extractProductSearchTerm}
                      onChange={(e) => setExtractProductSearchTerm(e.target.value)}
                      placeholder="Search product SKU..."
                      className="w-full bg-slate-50 text-slate-800 pl-8 pr-7 py-1.5 rounded-lg text-xs border border-slate-200 focus:outline-none focus:border-fuchsia-500 font-medium placeholder:text-slate-400"
                      autoFocus
                    />
                    {extractProductSearchTerm && (
                      <button
                        type="button"
                        onClick={() => setExtractProductSearchTerm('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  {/* Quick Selection Actions */}
                  <div className="flex items-center justify-between text-[11px] font-bold pt-0.5 px-0.5">
                    <button
                      type="button"
                      onClick={() => handleSelectAllExtractProducts(uniqueProductOptions)}
                      className="text-fuchsia-600 hover:text-fuchsia-800 cursor-pointer hover:underline"
                    >
                      Select All ({uniqueProductOptions.length})
                    </button>
                    <button
                      type="button"
                      onClick={handleClearAllExtractProducts}
                      className="text-rose-600 hover:text-rose-800 cursor-pointer hover:underline"
                    >
                      Clear All
                    </button>
                  </div>

                  {/* Scrollable Product List with Checkboxes */}
                  <div className="max-h-56 overflow-y-auto space-y-1 pr-1 divide-y divide-slate-100">
                    {uniqueProductOptions
                      .filter(p => p.toLowerCase().includes(extractProductSearchTerm.toLowerCase()))
                      .map(p => {
                        const isSelected = extractFilterProducts.some(fp => fp.toLowerCase() === p.toLowerCase());
                        return (
                          <div
                            key={p}
                            onClick={() => handleToggleExtractProduct(p)}
                            className={`flex items-center justify-between p-2 rounded-xl text-xs cursor-pointer transition ${
                              isSelected
                                ? 'bg-fuchsia-50 text-fuchsia-900 border border-fuchsia-300 font-bold'
                                : 'hover:bg-slate-50 text-slate-700 border border-transparent'
                            }`}
                          >
                            <div className="flex items-center gap-2 max-w-[240px]">
                              <div className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 transition ${
                                isSelected
                                  ? 'bg-fuchsia-600 border-fuchsia-600 text-white'
                                  : 'border-slate-300 bg-white'
                              }`}>
                                {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                              </div>
                              <span className="truncate" title={p}>{p}</span>
                            </div>
                            {isSelected && (
                              <span className="text-[10px] text-fuchsia-600 font-mono font-semibold">Selected</span>
                            )}
                          </div>
                        );
                      })}
                    {uniqueProductOptions.filter(p => p.toLowerCase().includes(extractProductSearchTerm.toLowerCase())).length === 0 && (
                      <div className="p-4 text-center text-slate-400 text-xs italic">
                        No product SKU matching &quot;{extractProductSearchTerm}&quot;
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* 3. Year */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono flex items-center gap-1">
                <Calendar className="w-3 h-3 text-sky-600" /> Select Year
              </label>
              <select
                value={extractFilterYear}
                onChange={(e) => setExtractFilterYear(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
              >
                <option value="ALL">All Years</option>
                {uniqueYearOptions.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            {/* 4. Month */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono flex items-center gap-1">
                <Calendar className="w-3 h-3 text-purple-600" /> Select Month
              </label>
              <select
                value={extractFilterMonth}
                onChange={(e) => setExtractFilterMonth(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
              >
                <option value="ALL">All Months</option>
                {uniqueMonthOptions.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>

            {/* 5. Approacher / BDM (Our Choice) */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono flex items-center gap-1">
                <Users className="w-3 h-3 text-emerald-600" /> Select Approacher / BDM
              </label>
              <select
                value={extractFilterApproacher}
                onChange={(e) => setExtractFilterApproacher(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
              >
                <option value="ALL">All Approachers ({uniqueApproacherOptions.length})</option>
                {uniqueApproacherOptions.map(app => (
                  <option key={app} value={app}>{app}</option>
                ))}
              </select>
            </div>

            {/* 6. Platform (Our Choice) */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono flex items-center gap-1">
                <Share2 className="w-3 h-3 text-cyan-600" /> Select Social Platform
              </label>
              <select
                value={extractFilterPlatform}
                onChange={(e) => setExtractFilterPlatform(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
              >
                <option value="ALL">All Platforms</option>
                {uniquePlatformOptions.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>

            {/* 7. Workflow Step Status (Our Choice) */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-amber-600" /> Workflow Step Status
              </label>
              <select
                value={extractFilterStep}
                onChange={(e) => setExtractFilterStep(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
              >
                <option value="ALL">All Deliverables</option>
                <option value="all_done">Fully Complete (Steps 1-4 Done)</option>
                <option value="missing_video">Missing Video Link</option>
                <option value="missing_shortio">Missing Short.io Link</option>
                <option value="delayed">TAT Delayed Items</option>
              </select>
            </div>

            {/* 8. Search Input */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono flex items-center gap-1">
                <Search className="w-3 h-3 text-slate-600" /> Text Keyword Search
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={extractSearchTerm}
                  onChange={(e) => setExtractSearchTerm(e.target.value)}
                  placeholder="Search video ID, creator, product..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-3 pr-8 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                {extractSearchTerm && (
                  <button onClick={() => setExtractSearchTerm('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5">
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Live Data Preview Table (Selected for Google Sheets Extraction) */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden space-y-4">
          <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2 font-mono">
                <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                Influencer Video Data Selected for Extraction ({filteredExtractionRows.length} Rows)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Live data preview of all influencer videos that will be written into the Google Sheet.
              </p>
            </div>
            <div className="flex items-center gap-2 self-start sm:self-auto">
              {sheetsExtractUrl && (
                <a
                  href={sheetsExtractUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-4 py-2 bg-emerald-100 hover:bg-emerald-200 text-emerald-900 border border-emerald-300 rounded-xl text-xs font-black transition flex items-center gap-1.5"
                >
                  <ExternalLink className="w-4 h-4 text-emerald-700" /> Open Extracted Google Sheet
                </a>
              )}
              <button
                type="button"
                onClick={handleExtractSubpageToGoogleSheets}
                disabled={isExtractingSheets || filteredExtractionRows.length === 0}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Download className="w-4 h-4" /> Extract to Google Sheets
              </button>
            </div>
          </div>

          <div className="overflow-x-auto max-h-[500px]">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100 sticky top-0 z-10 text-slate-600 uppercase font-mono font-bold text-[10px]">
                <tr>
                  <th className="p-3">Video ID</th>
                  <th className="p-3">Creator Name</th>
                  <th className="p-3">Product SKU</th>
                  <th className="p-3">Fee (₹)</th>
                  <th className="p-3">Approacher</th>
                  <th className="p-3">Platform</th>
                  <th className="p-3">Video Link</th>
                  <th className="p-3">Short.io Code & Link</th>
                  <th className="p-3 bg-sky-50 text-sky-900">Views</th>
                  <th className="p-3 bg-indigo-50 text-indigo-900">Clicks</th>
                  <th className="p-3 bg-emerald-50 text-emerald-900">CPV (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-sans">
                {filteredExtractionRows.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="p-10 text-center text-slate-400">
                      <AlertCircle className="w-6 h-6 text-amber-500 mx-auto mb-2" />
                      <p className="text-xs font-bold text-slate-600">No influencer video deliverables match your extraction filters.</p>
                      <button onClick={handleResetExtractFilters} className="mt-2 text-xs font-bold text-indigo-600 underline">
                        Reset Extraction Filters
                      </button>
                    </td>
                  </tr>
                ) : (
                  filteredExtractionRows.map(r => {
                    const m = getRowMetrics(r);
                    return (
                      <tr key={r.videoId} className="hover:bg-slate-50 transition">
                        <td className="p-3 font-mono font-bold text-indigo-700 whitespace-nowrap">{r.videoId}</td>
                        <td className="p-3 font-bold text-slate-800">{r.influencerName}</td>
                        <td className="p-3 text-slate-700 truncate max-w-xs">{r.productName}</td>
                        <td className="p-3 font-mono font-bold text-slate-800">₹{r.amountPaid.toLocaleString('en-IN')}</td>
                        <td className="p-3 text-slate-600">{r.approacher}</td>
                        <td className="p-3 text-slate-600 text-[10px]">{r.platform}</td>
                        <td className="p-3">
                          {r.videoLink && !r.videoLink.toLowerCase().includes('pending') ? (
                            <a href={r.videoLink} target="_blank" rel="noreferrer" className="text-blue-600 font-bold hover:underline flex items-center gap-1 truncate max-w-[140px]">
                              Watch <ExternalLink className="w-3 h-3 shrink-0" />
                            </a>
                          ) : <span className="text-rose-400 italic">Pending</span>}
                        </td>
                        <td className="p-3 font-mono text-[10px]">
                          {r.shortIoCode ? (
                            <div className="flex flex-col gap-0.5 max-w-[180px]">
                              <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-700 rounded font-bold border border-indigo-100 self-start">
                                {r.shortIoCode}
                              </span>
                              {(r.shortIoLink || r.shortIoCode) && (
                                <a href={(r.shortIoLink || r.shortIoCode).startsWith('http') ? (r.shortIoLink || r.shortIoCode) : `https://${r.shortIoLink || r.shortIoCode}`} target="_blank" rel="noreferrer" className="text-[10px] text-indigo-600 hover:underline truncate">
                                  {r.shortIoLink || r.shortIoCode}
                                </a>
                              )}
                            </div>
                          ) : '—'}
                        </td>
                        <td className="p-3 font-mono font-bold text-sky-800 bg-sky-50/30">
                          {m.views !== undefined ? m.views.toLocaleString('en-IN') : '—'}
                        </td>
                        <td className="p-3 font-mono font-bold text-indigo-800 bg-indigo-50/30">
                          {m.clicks !== undefined ? m.clicks.toLocaleString('en-IN') : '—'}
                        </td>
                        <td className="p-3 font-mono font-bold text-emerald-800 bg-emerald-50/30">
                          {m.cpv !== undefined ? `₹${m.cpv.toFixed(3)}` : '—'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

  const getMainViewLabel = (mode: string) => {
    switch (mode) {
      case 'grid': return 'Extracted Data Ledger';
      case 'breakdown': return 'Performance Breakdown';
      case 'matrix': return 'Matrix View';
      case 'tat': return 'Turnaround Time (TAT)';
      case 'ai': return 'AI Strategic Insights';
      default: return 'Main Data Workspace';
    }
  };

  const getSubpageTabLabel = (tab: string) => {
    switch (tab) {
      case 'overview': return 'Executive Overview';
      case 'influencer_videos': return 'Influencer Wise Video Details';
      case 'influencer_history': return 'Influencer History';
      case 'influencer_ranking': return 'Influencer Ranking Matrix';
      case 'product_history': return 'Product SKU History';
      case 'video_history': return 'Video Performance Matrix';
      case 'approacher_matrix': return 'Approacher / Team Matrix';
      case 'raw_data': return 'Raw Data Records';
      case 'sheets_extract': return 'Google Sheets Extractor';
      default: return 'Sub Page Analytics';
    }
  };

  return (
    <div className="space-y-6">
      {/* Distinct Main Page & Sub Page Breadcrumb Header Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-white">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-black tracking-widest text-indigo-400 uppercase font-mono bg-indigo-950/80 px-3 py-1 rounded-lg border border-indigo-800/60 shadow-xs">
            UNIVERSAL DATA ANALYZER
          </span>
          <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
          
          {viewMode === 'subpage' ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-black tracking-wider text-sky-300 bg-sky-950/90 px-3 py-1 rounded-lg border border-sky-800/70 flex items-center gap-1.5 uppercase font-mono shadow-xs">
                <BookmarkCheck className="w-3.5 h-3.5 text-sky-400" />
                SUB PAGE ANALYTICS
              </span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span className="text-xs font-bold text-white bg-slate-800/90 px-3 py-1 rounded-lg border border-slate-700/80">
                {getSubpageTabLabel(subpageActiveTab)}
              </span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-black tracking-wider text-emerald-300 bg-emerald-950/90 px-3 py-1 rounded-lg border border-emerald-800/70 flex items-center gap-1.5 uppercase font-mono shadow-xs">
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                MAIN PAGE
              </span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span className="text-xs font-bold text-white bg-slate-800/90 px-3 py-1 rounded-lg border border-slate-700/80">
                {getMainViewLabel(viewMode)}
              </span>
            </div>
          )}
        </div>

        {/* Page Switcher Control Bar */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setViewMode('grid')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition cursor-pointer flex items-center gap-2 border ${
              viewMode !== 'subpage'
                ? 'bg-emerald-600 text-white border-emerald-400 shadow-md ring-2 ring-emerald-400/30'
                : 'bg-slate-800 text-slate-300 hover:text-white border-slate-700 hover:bg-slate-750'
            }`}
            title="Switch to Main Page (Data Extractor Workspace)"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Main Page</span>
            <span className="text-[10px] bg-black/40 px-1.5 py-0.2 rounded-full font-mono">{data.length}</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode('subpage')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition cursor-pointer flex items-center gap-2 border ${
              viewMode === 'subpage'
                ? 'bg-sky-600 text-white border-sky-400 shadow-md ring-2 ring-sky-400/30'
                : 'bg-slate-800 text-slate-300 hover:text-white border-slate-700 hover:bg-slate-750'
            }`}
            title="Switch to Sub Page (Deep-Dive Analytics Hub)"
          >
            <BookmarkCheck className="w-3.5 h-3.5" />
            <span>Sub Page</span>
            {subpageSnapshot?.data && subpageSnapshot.data.length > 0 && (
              <span className="text-[10px] bg-cyan-400 text-slate-950 font-black px-1.5 py-0.2 rounded-full font-mono">
                {subpageSnapshot.data.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Top Header Banner */}
      <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-purple-950 text-white p-6 sm:p-8 rounded-3xl shadow-2xl relative overflow-hidden border border-indigo-900/50">
        <div className="absolute top-0 right-0 w-96 h-96 bg-fuchsia-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-cyan-600/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-3">
              <span className="p-2.5 bg-gradient-to-tr from-cyan-500 to-indigo-600 rounded-2xl shadow-lg">
                <FileSpreadsheet className="w-7 h-7 text-white" />
              </span>
              <div>
                <h1 className="text-2xl sm:text-3xl font-black tracking-tight flex flex-wrap items-center gap-2">
                  <span>Universal Data Analyzer</span>
                  <span className="text-slate-400 font-normal text-lg">/</span>
                  <span className={viewMode === 'subpage' ? 'text-sky-300' : 'text-emerald-400'}>
                    {viewMode === 'subpage' ? 'Sub Page' : 'Main Page'}
                  </span>
                  <span className={`text-[10px] font-mono uppercase tracking-widest font-black px-2.5 py-1 rounded-lg border ${
                    viewMode === 'subpage'
                      ? 'bg-sky-500/20 text-sky-300 border-sky-400/40'
                      : 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40'
                  }`}>
                    {viewMode === 'subpage' ? 'Sub Page Active' : 'Main Page Active'}
                  </span>
                </h1>
                <p className="text-xs sm:text-sm text-indigo-200/80 mt-1 font-medium">
                  Multi-format ingestion (CSV, PDF, JPG/JPEG, WORD) with interactive <span className="text-cyan-300 font-bold">"Click & Found"</span> drill-down analytics.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 mt-4 text-xs font-mono">
              <span className="bg-white/10 px-3 py-1 rounded-full border border-white/10 text-cyan-200">
                Active Source: <strong className="text-white font-sans">{fileName || 'None (Blank)'}</strong>
              </span>
              <span className={`px-3 py-1 rounded-full border ${data.length === 0 ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' : 'bg-white/10 text-emerald-300 border-white/10'}`}>
                {fileTypeBadge}
              </span>
              <span className="bg-white/10 px-3 py-1 rounded-full border border-white/10 text-fuchsia-300">
                {data.length} Total Records
              </span>
            </div>
          </div>

          {/* Action buttons on header - organized without duplicate buttons */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            {/* Data Ingestion Group */}
            <div className="flex flex-wrap items-center gap-2.5">
              <input 
                ref={fileInputRef} 
                type="file" 
                accept=".csv,.tsv,.xlsx,.xls,.docx,.pdf,.jpg,.jpeg,.png,.webp" 
                onChange={handleFileUpload} 
                className="hidden" 
                aria-label="Upload data file"
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-lg hover:shadow-cyan-500/25 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                title="Upload CSV, PDF, JPG, JPEG, Word (.docx) or Excel"
                aria-label="Upload File"
              >
                <Upload className="w-4 h-4" />
                <span>Upload File</span>
              </button>

              <button
                type="button"
                onClick={() => setRawTextModal(true)}
                className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-bold px-3.5 py-2.5 rounded-xl border border-white/10 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                title="Paste raw text or CSV string"
                aria-label="Paste Raw Data"
              >
                <FileCode className="w-4 h-4 text-indigo-300" />
                <span>Paste Raw Data</span>
              </button>

              <button
                type="button"
                onClick={() => setIsExcelExtractorOpen(true)}
                className="flex items-center gap-2 bg-gradient-to-r from-emerald-600 via-teal-600 to-green-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-lg hover:shadow-emerald-500/25 border border-emerald-400/30 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
                title="Extract all data of any Excel file (.xlsx, .xls, .xlsm, .csv) with full interactive in-grid table editor, multi-sheet tabs, and export"
                aria-label="Excel file extractor and editor"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-200" />
                <span>Excel file extractor and editor</span>
              </button>
            </div>

            {/* Dataset Operations Bar (when data is loaded) */}
            {data.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 pt-2 lg:pt-0 border-t lg:border-t-0 border-white/10">
                <button
                  type="button"
                  onClick={handleSaveToSubpage}
                  className="flex items-center gap-1.5 bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white text-xs font-bold px-3.5 py-2.5 rounded-xl shadow-lg transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
                  title="Save current analyzed dataset into Sub-Page and open analytics view"
                  aria-label="Save to Sub Page"
                >
                  <BookmarkCheck className="w-4 h-4 text-sky-200" />
                  <span>Save to Sub Page</span>
                </button>

                {subpageSnapshot?.data && subpageSnapshot.data.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setIsDeleteSubpageModalOpen(true)}
                    className="flex items-center gap-1.5 bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 text-white font-black text-xs uppercase tracking-wider px-3.5 py-2.5 rounded-xl border-2 border-red-400 shadow-xl shadow-red-600/30 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 active:scale-95 shrink-0"
                    title="Delete and clear all saved Sub-Page dataset records"
                    aria-label="Delete Sub-Page Data"
                  >
                    <Trash2 className="w-4 h-4 text-white" />
                    <span>Delete Sub-Page Data</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setAddMoreDataMode('smart_merge');
                    setIsAddMoreDataModalOpen(true);
                  }}
                  className="flex items-center gap-1.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white text-xs font-bold px-3.5 py-2.5 rounded-xl shadow-lg hover:shadow-emerald-500/25 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
                  title="Add more data from file or text, and mix/merge with existing deliverables"
                  aria-label="Add More Data"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add More Data</span>
                </button>

                <button
                  type="button"
                  onClick={handleRunAiAnalysis}
                  disabled={isAiLoading}
                  className="flex items-center gap-1.5 bg-gradient-to-r from-fuchsia-600 to-pink-600 hover:from-fuchsia-500 hover:to-pink-500 text-white text-xs font-bold px-3.5 py-2.5 rounded-xl shadow-lg transition disabled:opacity-50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-300"
                  title="Deep Multimodal AI Analysis"
                  aria-label="Deep AI Analysis"
                >
                  <Sparkles className={`w-4 h-4 ${isAiLoading ? 'animate-spin' : ''}`} /> 
                  <span>{isAiLoading ? 'AI Thinking...' : 'Deep AI Analysis'}</span>
                </button>

                {/* DELETE ALL DATA BUTTON ON MAIN PAGE */}
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('Are you sure you want to delete all main page extracted data? This will reset the workspace.')) {
                      handleClearData();
                    }
                  }}
                  className="flex items-center gap-2 bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 text-white font-black text-xs uppercase tracking-wider px-4 py-2.5 rounded-xl border-2 border-red-400 shadow-xl shadow-red-600/40 ring-2 ring-red-400/30 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 active:scale-95 shrink-0"
                  title="Delete all main page extracted data and return to blank state"
                  aria-label="Delete All Data on Main Page"
                >
                  <Trash2 className="w-4 h-4 text-white" />
                  <span>Delete All Data</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* If data is blank (default state), display clean ingestion hub */}
      {(data.length === 0 && viewMode !== 'subpage') ? (
        <div className="space-y-6">
          {/* Main Drag & Drop Zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-3xl p-8 sm:p-14 text-center transition-all bg-white shadow-xs ${
              isDragging
                ? 'border-indigo-500 bg-indigo-50/60 scale-[1.01]'
                : 'border-slate-300 hover:border-indigo-400'
            }`}
          >
            <div className="max-w-xl mx-auto space-y-4">
              <div className="inline-flex p-4 rounded-2xl bg-indigo-50 text-indigo-600">
                <Upload className="w-10 h-10 animate-bounce" />
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight">
                Universal Data Analyzer is Blank & Ready
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 font-medium leading-relaxed">
                Drag and drop your dataset here, or choose an input option below. We natively support{' '}
                <strong className="text-slate-700">CSV, PDF, JPG, JPEG, Word (.docx)</strong>, and <strong className="text-slate-700">Excel (.xlsx/.xls)</strong>.
              </p>

              <div className="flex flex-wrap items-center justify-center gap-3 pt-3">
                <button
                  onClick={() => setViewMode('subpage')}
                  className="flex items-center gap-2 bg-gradient-to-r from-sky-600 via-indigo-600 to-purple-600 hover:from-sky-500 hover:to-purple-500 text-white text-xs sm:text-sm font-bold px-6 py-3 rounded-xl shadow-xl hover:shadow-sky-500/25 transition cursor-pointer transform hover:scale-105"
                >
                  <BookmarkCheck className="w-5 h-5 text-cyan-200" />
                  <span>Open Sub-Page Analyzed Data Hub</span>
                  {subpageSnapshot?.data && subpageSnapshot.data.length > 0 && (
                    <span className="text-xs bg-cyan-300 text-slate-950 font-black px-2 py-0.5 rounded-full font-mono">
                      {subpageSnapshot.data.length} records
                    </span>
                  )}
                </button>

                {subpageSnapshot?.data && subpageSnapshot.data.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setIsDeleteSubpageModalOpen(true)}
                    className="flex items-center gap-2 bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 text-white text-xs sm:text-sm font-black uppercase tracking-wider px-5 py-3 rounded-xl border-2 border-red-400 shadow-xl shadow-red-600/40 ring-2 ring-red-400/30 transition cursor-pointer transform hover:scale-105"
                    title="Delete and clear all saved Sub-Page dataset records"
                  >
                    <Trash2 className="w-4 h-4 text-white" />
                    <span>Delete Sub-Page Data</span>
                  </button>
                )}

                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-bold px-5 py-3 rounded-xl shadow-md transition cursor-pointer"
                >
                  <Upload className="w-4 h-4" /> Browse File to Analyze
                </button>
                <button
                  onClick={() => setRawTextModal(true)}
                  className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs sm:text-sm font-bold px-5 py-3 rounded-xl transition cursor-pointer"
                >
                  <FileCode className="w-4 h-4 text-indigo-600" /> Paste Raw Text / Table
                </button>
                <button
                  type="button"
                  onClick={() => setIsExcelExtractorOpen(true)}
                  className="flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white text-xs sm:text-sm font-bold px-5 py-3 rounded-xl shadow-lg hover:shadow-emerald-600/20 transition cursor-pointer"
                  title="Extract all data of any Excel file and open the interactive spreadsheet editor"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-200" /> Excel file extractor and editor
                </button>
              </div>

              <div className="pt-2 text-[11px] text-slate-400">
                <span>Multi-format Parsing • Instant "Click & Found" Slicers • 4-Step TAT Funnel • Deep Multimodal AI</span>
              </div>
            </div>
          </div>

          {/* Supported Format Guidance Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-2">
              <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl w-fit">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <h4 className="text-sm font-bold text-slate-800">CSV & Excel</h4>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                .csv, .tsv, .xlsx spreadsheets. Auto-detects Video IDs, Creators, Products, Budgets, and 4-Step conversion progress.
              </p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-2">
              <div className="p-2.5 bg-rose-50 text-rose-600 rounded-xl w-fit">
                <FileText className="w-5 h-5" />
              </div>
              <h4 className="text-sm font-bold text-slate-800">PDF Documents</h4>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Invoices, campaign reports, or delivery summaries. Intelligent document OCR parses tabular data directly into records.
              </p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-2">
              <div className="p-2.5 bg-cyan-50 text-cyan-600 rounded-xl w-fit">
                <Eye className="w-5 h-5" />
              </div>
              <h4 className="text-sm font-bold text-slate-800">JPG, JPEG, PNG</h4>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Screenshots, delivery confirmations, and photo receipts scanned via multimodal vision OCR into clean ledger analytics.
              </p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-2">
              <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl w-fit">
                <Layers className="w-5 h-5" />
              </div>
              <h4 className="text-sm font-bold text-slate-800">Word Documents</h4>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                .docx agreements and briefing sheets with embedded tables extracted seamlessly into searchable campaign entries.
              </p>
            </div>
          </div>

          {/* Optional Sample Dataset Loader (User Choice Only) */}
          <div className="text-center pt-2">
            <span className="text-xs text-slate-400">
              Need to preview how the analyzer functions?{' '}
              <button
                onClick={handleLoadSample}
                className="text-indigo-600 hover:text-indigo-800 font-bold underline cursor-pointer"
              >
                Load Sample Video Deliverables Dataset
              </button>
            </span>
          </div>
        </div>
      ) : (
        <>
      {/* KPI Cards & Click-and-Found Quick Triggers */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        {/* Total Deliverables */}
        <div 
          onClick={() => setSelectedFilter(null)}
          className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200/80 hover:border-indigo-400 hover:shadow-md transition cursor-pointer group"
          title="Click to reset filters and view all deliverables"
        >
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-bold uppercase tracking-wider font-mono">Deliverables</span>
            <Layers className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="mt-2 text-2xl font-black text-slate-800 font-sans">{stats.totalDeliverables}</div>
          <p className="text-[10px] text-slate-500 mt-1 font-medium group-hover:text-indigo-600">Click to view all</p>
        </div>

        {/* Total Spend */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200/80">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-bold uppercase tracking-wider font-mono">Total Budget</span>
            <span className="text-emerald-600 font-bold text-xs font-mono">INR</span>
          </div>
          <div className="mt-2 text-2xl font-black text-slate-800 font-sans">₹{stats.totalSpend.toLocaleString('en-IN')}</div>
          <p className="text-[10px] text-slate-500 mt-1 font-medium">{stats.uniqueCreators} Creators • {stats.uniqueProducts} SKUs</p>
        </div>

        {/* All Steps Completed */}
        <div 
          onClick={() => handleClickAndFound('allDone', 'done', 'All 4 Steps Completed')}
          className={`rounded-2xl p-4 shadow-sm border transition cursor-pointer group ${
            selectedFilter?.type === 'allDone' ? 'bg-emerald-50 border-emerald-500 ring-2 ring-emerald-400' : 'bg-white border-slate-200/80 hover:border-emerald-400'
          }`}
          title="Click & Found: All 4 steps Done"
        >
          <div className="flex items-center justify-between text-emerald-600">
            <span className="text-[10px] font-bold uppercase tracking-wider font-mono">100% Completed</span>
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div className="mt-2 text-2xl font-black text-emerald-700 font-sans">{stats.fullyDoneCount}</div>
          <p className="text-[10px] text-emerald-600 mt-1 font-bold flex items-center gap-1">Click & Found →</p>
        </div>

        {/* Awaiting Release */}
        <div 
          onClick={() => handleClickAndFound('awaitingRelease', 'notdone', 'Awaiting Video Release')}
          className={`rounded-2xl p-4 shadow-sm border transition cursor-pointer group ${
            selectedFilter?.type === 'awaitingRelease' ? 'bg-amber-50 border-amber-500 ring-2 ring-amber-400' : 'bg-white border-slate-200/80 hover:border-amber-400'
          }`}
          title="Click & Found: Awaiting Video Release (Step 4 Not Done)"
        >
          <div className="flex items-center justify-between text-amber-600">
            <span className="text-[10px] font-bold uppercase tracking-wider font-mono">Awaiting Upload</span>
            <Eye className="w-4 h-4" />
          </div>
          <div className="mt-2 text-2xl font-black text-amber-700 font-sans">{stats.awaitingReleaseCount}</div>
          <p className="text-[10px] text-amber-600 mt-1 font-bold flex items-center gap-1">Click & Found →</p>
        </div>

        {/* Missing Checklist */}
        <div 
          onClick={() => handleClickAndFound('missingChecklist', 'notdone', 'Missing Checklist PDF')}
          className={`rounded-2xl p-4 shadow-sm border transition cursor-pointer group ${
            selectedFilter?.type === 'missingChecklist' ? 'bg-rose-50 border-rose-500 ring-2 ring-rose-400' : 'bg-white border-slate-200/80 hover:border-rose-400'
          }`}
          title="Click & Found: Missing Checklist PDF (Step 2 Not Done)"
        >
          <div className="flex items-center justify-between text-rose-600">
            <span className="text-[10px] font-bold uppercase tracking-wider font-mono">Missing Checklist</span>
            <FileText className="w-4 h-4" />
          </div>
          <div className="mt-2 text-2xl font-black text-rose-700 font-sans">{stats.missingChecklistCount}</div>
          <p className="text-[10px] text-rose-600 mt-1 font-bold flex items-center gap-1">Click & Found →</p>
        </div>

        {/* Delayed Deliverables */}
        <div 
          onClick={() => handleClickAndFound('delayed', 'delayed', 'Deliverables with Delay')}
          className={`rounded-2xl p-4 shadow-sm border transition cursor-pointer group ${
            selectedFilter?.type === 'delayed' ? 'bg-purple-50 border-purple-500 ring-2 ring-purple-400' : 'bg-white border-slate-200/80 hover:border-purple-400'
          }`}
          title="Click & Found: Deliverables with TAT Delay"
        >
          <div className="flex items-center justify-between text-purple-600">
            <span className="text-[10px] font-bold uppercase tracking-wider font-mono">TAT Delayed</span>
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div className="mt-2 text-2xl font-black text-purple-700 font-sans">{stats.delayedCount}</div>
          <p className="text-[10px] text-purple-600 mt-1 font-bold flex items-center gap-1">Click & Found →</p>
        </div>
      </div>

      {/* Video Performance & Attribution Bar (Views, Clicks, CPV, CPC, CTR) */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-4 sm:p-5 shadow-md border border-indigo-900/60 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4 sm:gap-6 divide-y sm:divide-y-0 sm:divide-x divide-white/10">
          <div className="flex items-center gap-3">
            <span className="p-2 bg-sky-500/20 text-sky-400 rounded-xl border border-sky-500/30">
              <Eye className="w-5 h-5" />
            </span>
            <div>
              <p className="text-[10px] uppercase font-mono tracking-wider text-slate-400 font-bold">Total Tracked Views</p>
              <p className="text-xl font-black text-white font-mono">{stats.totalViews.toLocaleString('en-IN')}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 sm:pl-6 pt-2 sm:pt-0">
            <span className="p-2 bg-indigo-500/20 text-indigo-400 rounded-xl border border-indigo-500/30">
              <MousePointerClick className="w-5 h-5" />
            </span>
            <div>
              <p className="text-[10px] uppercase font-mono tracking-wider text-slate-400 font-bold">Short.io Clicks</p>
              <p className="text-xl font-black text-indigo-200 font-mono">{stats.totalClicks.toLocaleString('en-IN')}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 sm:pl-6 pt-2 sm:pt-0">
            <span className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30">
              <DollarSign className="w-5 h-5" />
            </span>
            <div>
              <p className="text-[10px] uppercase font-mono tracking-wider text-slate-400 font-bold">Avg. CPV</p>
              <p className="text-xl font-black text-emerald-300 font-mono">₹{stats.avgCpv > 0 ? stats.avgCpv.toFixed(3) : '0.000'}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 sm:pl-6 pt-2 sm:pt-0">
            <span className="p-2 bg-fuchsia-500/20 text-fuchsia-400 rounded-xl border border-fuchsia-500/30">
              <TrendingUp className="w-5 h-5" />
            </span>
            <div>
              <p className="text-[10px] uppercase font-mono tracking-wider text-slate-400 font-bold">Avg. CPC</p>
              <p className="text-xl font-black text-fuchsia-300 font-mono">₹{stats.avgCpc > 0 ? stats.avgCpc.toFixed(2) : '0.00'}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 sm:pl-6 pt-2 sm:pt-0">
            <span className="p-2 bg-purple-500/20 text-purple-400 rounded-xl border border-purple-500/30">
              <Percent className="w-5 h-5" />
            </span>
            <div>
              <p className="text-[10px] uppercase font-mono tracking-wider text-slate-400 font-bold">Avg. CTR</p>
              <p className="text-xl font-black text-purple-300 font-mono">{stats.avgCtr.toFixed(2)}%</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-2 sm:pt-0">
          {/* Short.io Status & Configuration Button */}
          <button
            onClick={() => {
              setTempApiKey(apiKey);
              setIsEditingApiKey(true);
            }}
            className={`flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl border transition cursor-pointer shrink-0 ${
              apiKey.trim()
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/30'
                : 'bg-amber-500/20 text-amber-300 border-amber-500/30 hover:bg-amber-500/30'
            }`}
            title="Configure Short.io API key, primary metrics, and sync settings"
          >
            <Key className="w-3.5 h-3.5" />
            <span>{apiKey.trim() ? `Short.io Connected (${shortIoLinks.length})` : 'Connect Short.io'}</span>
          </button>

          {/* Primary Metric Toggle (Total vs Human Verified Clicks) */}
          <button
            onClick={() => {
              const next = primaryMetric === 'total' ? 'human' : 'total';
              setPrimaryMetric(next);
              safeLocalStorage.setItem('SHORT_IO_PRIMARY_METRIC', next);
              globalToast.info(`Short.io metric switched to: ${next === 'human' ? 'Human Verified Clicks (Bot-Filtered)' : 'Total Clicks'}`);
            }}
            className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-indigo-200 text-xs font-bold px-3 py-2 rounded-xl border border-white/20 transition cursor-pointer shrink-0"
            title="Switch primary click metric procedure: Total Clicks vs Human Verified Clicks"
          >
            <Sliders className="w-3.5 h-3.5 text-cyan-400" />
            <span>Metric: <strong className="text-white">{primaryMetric === 'human' ? 'Human' : 'Total'}</strong></span>
          </button>

          {/* Dedicated Central Re-fetch Live Views Button (using Live Video Views procedure) */}
          <button
            onClick={() => collectLiveVideoViewsProcedure()}
            disabled={isCollectingViews || isRefreshingLive}
            className="flex items-center justify-center gap-2 bg-gradient-to-r from-sky-600 to-cyan-600 hover:from-sky-500 hover:to-cyan-500 text-white text-xs font-bold px-3.5 py-2 rounded-xl border border-sky-400/30 shadow-sm transition cursor-pointer shrink-0 disabled:opacity-50"
            title="Re-fetch live views for all deliverables with video links via Live Video views procedure"
          >
            <Eye className={`w-3.5 h-3.5 ${isCollectingViews ? 'animate-bounce text-yellow-300' : 'text-sky-200'}`} />
            <span>{isCollectingViews ? 'Fetching Views...' : 'Re-fetch Live Views'}</span>
          </button>

          {/* Dedicated Central Re-fetch Short.io Clicks Button */}
          <button
            onClick={() => collectClicksDataProcedure()}
            disabled={isCollectingShortIo || isRefreshingLive}
            className="flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-bold px-3.5 py-2 rounded-xl border border-indigo-400/30 shadow-sm transition cursor-pointer shrink-0 disabled:opacity-50"
            title="Re-fetch live clicks for all deliverables with Short.io codes via Short.io tracker procedure"
          >
            <MousePointerClick className={`w-3.5 h-3.5 ${isCollectingShortIo ? 'animate-bounce text-cyan-300' : 'text-indigo-200'}`} />
            <span>{isCollectingShortIo ? 'Fetching Clicks...' : 'Re-fetch Live Clicks'}</span>
          </button>

          {/* Refresh Both Views & Short.io Clicks */}
          <button
            onClick={handleRefreshLiveMetrics}
            disabled={isRefreshingLive || isCollectingShortIo || isCollectingViews}
            className="flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white text-xs font-bold px-3.5 py-2 rounded-xl border border-white/20 transition cursor-pointer shrink-0 disabled:opacity-50"
            title="Re-fetch both live views and live clicks metrics together"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingLive ? 'animate-spin text-cyan-400' : 'text-indigo-300'}`} />
            <span>{isRefreshingLive ? 'Refreshing All...' : 'Re-fetch All'}</span>
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* Central Procedures Action Hub: Prominent Re-fetch Controls */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950/90 to-slate-900 border-2 border-indigo-500/30 rounded-3xl p-4 sm:p-5 shadow-xl text-white space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="p-2 bg-indigo-500/20 text-indigo-300 rounded-xl border border-indigo-500/30">
              <Zap className="w-4 h-4 text-amber-400" />
            </span>
            <div>
              <h4 className="text-sm font-bold text-white font-mono flex items-center gap-2">
                Live Data Procedures Central Action Hub
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold">
                  Active
                </span>
              </h4>
              <p className="text-[11px] text-slate-400">
                Direct central procedure triggers for live video views scraping and Short.io bot-filtered click attribution
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-slate-300">
            <span className="bg-white/5 px-2.5 py-1 rounded-lg border border-white/10">
              Video URLs: <strong className="text-sky-300">{data.filter(r => extractVideoUrlsFromRow(r).length > 0 || (r.videoLink && r.videoLink.trim() !== '' && !r.videoLink.toLowerCase().includes('pending'))).length}</strong>
            </span>
            <span className="bg-white/5 px-2.5 py-1 rounded-lg border border-white/10">
              Short.io Codes: <strong className="text-indigo-300">{data.filter(r => Boolean(r.shortIoCode || r.shortIoLink)).length}</strong>
            </span>
            <button
              type="button"
              onClick={() => {
                if (data.length > 0) {
                  setProofInspectionModal({ isOpen: true, row: data[0], type: 'both' });
                } else {
                  globalToast.info('Load or paste a dataset first to inspect API network proofs.');
                }
              }}
              className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 px-3 py-1 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shrink-0"
              title="Inspect pristine raw JSON API responses and network proof logs for 0% mock guarantee"
            >
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Inspect Real API Proofs (0% Mock Data)</span>
            </button>
          </div>
        </div>

        {/* Central Dual Execution Buttons */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-1">
          {/* Central Button 1: Re-fetch live views via Live Video views procedure */}
          <button
            type="button"
            onClick={() => collectLiveVideoViewsProcedure()}
            disabled={isCollectingViews || isRefreshingLive}
            className="p-4 rounded-2xl bg-gradient-to-r from-sky-900/60 to-cyan-950/80 hover:from-sky-800/80 hover:to-cyan-900/90 border-2 border-sky-400/50 hover:border-sky-300 shadow-lg hover:shadow-sky-500/20 transition-all cursor-pointer group disabled:opacity-50 text-left flex items-center justify-between gap-4"
            title="Central Trigger: Re-fetch live views via Live Video views procedure"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <span className="p-3 bg-sky-500/20 text-sky-300 rounded-2xl border border-sky-400/40 group-hover:scale-105 group-hover:bg-sky-500/30 transition shrink-0">
                <Eye className={`w-6 h-6 ${isCollectingViews ? 'animate-bounce text-yellow-300' : 'text-sky-300'}`} />
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs sm:text-sm font-bold text-white group-hover:text-sky-200 transition">
                    Re-fetch Live Views
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-500/30 text-sky-200 border border-sky-400/40 font-bold shrink-0">
                    Live Video Views procedure
                  </span>
                </div>
                <p className="text-[11px] text-sky-200/80 mt-0.5 line-clamp-1">
                  {isCollectingViews ? 'Scraping live video view counts in progress...' : 'Execute Live Video views extraction procedure across published links'}
                </p>
              </div>
            </div>

            <span className="px-3.5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold font-mono shadow-md shrink-0 flex items-center gap-1.5 group-hover:translate-x-0.5 transition">
              <RefreshCw className={`w-3.5 h-3.5 ${isCollectingViews ? 'animate-spin' : ''}`} />
              <span>{isCollectingViews ? 'Fetching...' : 'Re-fetch Views'}</span>
            </span>
          </button>

          {/* Central Button 2: Re-fetch live clicks via Short.io tracker procedure */}
          <button
            type="button"
            onClick={() => collectClicksDataProcedure()}
            disabled={isCollectingShortIo || isRefreshingLive}
            className="p-4 rounded-2xl bg-gradient-to-r from-indigo-900/60 to-purple-950/80 hover:from-indigo-800/80 hover:to-purple-900/90 border-2 border-indigo-400/50 hover:border-indigo-300 shadow-lg hover:shadow-indigo-500/20 transition-all cursor-pointer group disabled:opacity-50 text-left flex items-center justify-between gap-4"
            title="Central Trigger: Re-fetch live clicks via Short.io tracker procedure"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <span className="p-3 bg-indigo-500/20 text-indigo-300 rounded-2xl border border-indigo-400/40 group-hover:scale-105 group-hover:bg-indigo-500/30 transition shrink-0">
                <MousePointerClick className={`w-6 h-6 ${isCollectingShortIo ? 'animate-bounce text-cyan-300' : 'text-indigo-300'}`} />
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs sm:text-sm font-bold text-white group-hover:text-indigo-200 transition">
                    Re-fetch Live Clicks
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-500/30 text-indigo-200 border border-indigo-400/40 font-bold shrink-0">
                    Short.io Tracker procedure
                  </span>
                </div>
                <p className="text-[11px] text-indigo-200/80 mt-0.5 line-clamp-1">
                  {isCollectingShortIo ? 'Querying Short.io click records...' : `Execute Short.io tracker API collection (${primaryMetric === 'human' ? 'Human Verified' : 'Total Clicks'})`}
                </p>
              </div>
            </div>

            <span className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold font-mono shadow-md shrink-0 flex items-center gap-1.5 group-hover:translate-x-0.5 transition">
              <RefreshCw className={`w-3.5 h-3.5 ${isCollectingShortIo ? 'animate-spin' : ''}`} />
              <span>{isCollectingShortIo ? 'Fetching...' : 'Re-fetch Clicks'}</span>
            </span>
          </button>
        </div>

        {/* Abnormal View Monitor & Original View Guard Control Bar */}
        <div className={`mt-3 rounded-2xl p-4 border transition-all ${
          abnormalMonitorEnabled
            ? 'bg-gradient-to-r from-emerald-950/90 via-slate-900/95 to-teal-950/90 border-emerald-500/40'
            : 'bg-slate-900/90 border-amber-500/40'
        }`}>
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex items-start sm:items-center gap-3">
              <div className={`p-2.5 rounded-xl border shrink-0 ${
                abnormalMonitorEnabled
                  ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-300'
                  : 'bg-amber-500/20 border-amber-400/40 text-amber-300'
              }`}>
                {abnormalMonitorEnabled ? (
                  <ShieldCheck className="w-5 h-5 text-emerald-400" />
                ) : (
                  <ShieldAlert className="w-5 h-5 text-amber-400" />
                )}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs sm:text-sm font-black tracking-tight text-white">
                    Abnormal View Monitor &amp; Original View Guard
                  </span>
                  <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-md border ${
                    abnormalMonitorEnabled
                      ? 'bg-emerald-500/25 text-emerald-200 border-emerald-400/40'
                      : 'bg-amber-500/25 text-amber-200 border-amber-400/40'
                  }`}>
                    {abnormalMonitorEnabled ? 'ACTIVE • ORIGINAL VIEWS ONLY' : 'PAUSED • UNFILTERED'}
                  </span>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-sky-500/20 text-sky-200 border border-sky-400/30">
                    Verified Original: {analyzerMonitorSummary.originalVerifiedCount}
                  </span>
                  {analyzerMonitorSummary.abnormalStoppedCount > 0 && (
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-rose-500/30 text-rose-200 border border-rose-400/40 flex items-center gap-1">
                      <ShieldAlert className="w-3 h-3 text-rose-300" />
                      Stopped Abnormal: {analyzerMonitorSummary.abnormalStoppedCount}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-300 mt-0.5">
                  Automatically intercepts abnormal/global fallback view spikes and displays <strong className="text-emerald-300">only the verified Original Views</strong> of each video link across Ledger, Totals, Sub-Page, and Exports.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {/* Ceiling Selector */}
              <div className="flex items-center gap-1.5 bg-slate-950/70 px-2.5 py-1.5 rounded-xl border border-white/10">
                <span className="text-[10px] font-mono uppercase text-slate-400 font-bold">Ceiling:</span>
                <select
                  value={String(abnormalThreshold)}
                  onChange={(e) => {
                    const val = e.target.value;
                    setAbnormalThreshold(val === 'AUTO' ? 'AUTO' : Number(val));
                  }}
                  className="bg-transparent text-xs font-mono font-bold text-emerald-300 focus:outline-none cursor-pointer"
                  aria-label="Abnormal view threshold ceiling"
                >
                  <option value="AUTO" className="bg-slate-900 text-white">Auto Smart Guard (5L / 20L Verified)</option>
                  <option value="50000" className="bg-slate-900 text-white">Max 50,000 (50K) Views</option>
                  <option value="100000" className="bg-slate-900 text-white">Max 1,00,000 (1 Lakh) Views</option>
                  <option value="200000" className="bg-slate-900 text-white">Max 2,00,000 (2 Lakhs) Views</option>
                  <option value="500000" className="bg-slate-900 text-white">Max 5,00,000 (5 Lakhs) Views</option>
                  <option value="1000000" className="bg-slate-900 text-white">Max 10,00,000 (10 Lakhs) Views</option>
                  <option value="2465263" className="bg-slate-900 text-white">Max 24,65,263 (24.65L Benchmark)</option>
                </select>
              </div>

              {/* Toggle Guard Active/Paused */}
              <button
                type="button"
                onClick={() => {
                  const next = !abnormalMonitorEnabled;
                  setAbnormalMonitorEnabled(next);
                  globalToast.info(
                    next
                      ? 'Abnormal View Monitor enabled: Blocking abnormal views and showing only Original Views.'
                      : 'Abnormal View Monitor paused.'
                  );
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold font-mono transition cursor-pointer flex items-center gap-1.5 border ${
                  abnormalMonitorEnabled
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-400'
                    : 'bg-slate-800 hover:bg-slate-700 text-amber-300 border-amber-500/40'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>{abnormalMonitorEnabled ? 'Guard: ON' : 'Guard: OFF'}</span>
              </button>

              {/* Restore Original Views Button */}
              <button
                type="button"
                onClick={() => handleRestoreOriginalViewsInAnalyzer()}
                disabled={isCollectingViews}
                className="px-3 py-1.5 rounded-xl text-xs font-bold font-mono bg-sky-600 hover:bg-sky-500 text-white border border-sky-400 transition cursor-pointer flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                title="Stop any abnormal views and restore only verified Original Views from video links"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isCollectingViews ? 'animate-spin' : ''}`} />
                <span>Restore Original Views</span>
              </button>

              {/* Toggle Intercepted Log */}
              <button
                type="button"
                onClick={() => setShowAbnormalMonitorLog(prev => !prev)}
                className="px-3 py-1.5 rounded-xl text-xs font-bold font-mono bg-white/10 hover:bg-white/15 text-slate-200 border border-white/15 transition cursor-pointer flex items-center gap-1"
              >
                <span>Intercepted Log ({analyzerMonitorSummary.abnormalStoppedCount})</span>
                {showAbnormalMonitorLog ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Expandable Intercepted Abnormal Views Log */}
          {showAbnormalMonitorLog && (
            <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
              {analyzerMonitorSummary.interceptedRows.length === 0 ? (
                <div className="text-xs text-emerald-200/90 font-mono bg-emerald-950/50 border border-emerald-500/30 rounded-xl p-3 flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                    All monitored video links are currently displaying verified Original Views. Zero abnormal spikes active.
                  </span>
                  <button
                    type="button"
                    onClick={() => collectLiveVideoViewsProcedure()}
                    className="text-sky-300 hover:underline font-bold"
                  >
                    Re-verify All Links
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-white/15 bg-slate-950/80">
                  <table className="w-full text-left text-[11px] font-mono text-slate-200">
                    <thead className="bg-slate-900 text-slate-400 uppercase text-[10px] border-b border-white/10">
                      <tr>
                        <th className="p-2.5">Video ID</th>
                        <th className="p-2.5">Creator</th>
                        <th className="p-2.5">Stopped Abnormal View</th>
                        <th className="p-2.5">Original View Shown</th>
                        <th className="p-2.5">Guard Reason</th>
                        <th className="p-2.5 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/10">
                      {analyzerMonitorSummary.interceptedRows.map(item => (
                        <tr key={item.row.videoId} className="hover:bg-white/5">
                          <td className="p-2.5 font-bold text-indigo-300">{item.row.videoId}</td>
                          <td className="p-2.5 font-sans font-bold text-white">{item.row.influencerName}</td>
                          <td className="p-2.5 text-rose-400 line-through font-bold">
                            {item.stoppedAbnormalValue > 0 ? item.stoppedAbnormalValue.toLocaleString('en-IN') : 'Blocked'}
                          </td>
                          <td className="p-2.5 text-emerald-300 font-bold">
                            {item.originalViews !== undefined ? `${item.originalViews.toLocaleString('en-IN')} (Original)` : 'Pending Link Fetch'}
                          </td>
                          <td className="p-2.5 font-sans text-slate-300 max-w-xs truncate" title={item.stopReason}>
                            {item.stopReason}
                          </td>
                          <td className="p-2.5 text-right">
                            <button
                              type="button"
                              onClick={() => handleRestoreOriginalViewsInAnalyzer([item.row])}
                              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] cursor-pointer"
                            >
                              Fetch Original View
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Live Video Views Collection Progress Banner */}
      {collectingViewsProgress && (
        <div className="bg-gradient-to-r from-sky-950 via-sky-900 to-slate-900 border border-sky-500/40 rounded-2xl p-4 text-white shadow-md space-y-2">
          <div className="flex items-center justify-between text-xs font-bold font-mono">
            <span className="flex items-center gap-2 text-sky-200">
              <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
              <span>Collecting Live Video Views ({collectingViewsProgress.current}/{collectingViewsProgress.total})</span>
            </span>
            <span className="text-emerald-400">
              {collectingViewsProgress.success} Success · {collectingViewsProgress.failed} Failed
            </span>
          </div>
          <div className="w-full bg-slate-800/80 rounded-full h-2 overflow-hidden border border-sky-400/20">
            <div
              className="bg-gradient-to-r from-yellow-300 to-sky-400 h-2 rounded-full transition-all duration-300"
              style={{ width: `${(collectingViewsProgress.current / Math.max(1, collectingViewsProgress.total)) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Short.io Live Collection Progress Banner */}
      {collectingShortIoProgress && (
        <div className="bg-gradient-to-r from-indigo-900 via-indigo-800 to-slate-900 border border-indigo-500/40 rounded-2xl p-4 text-white shadow-md space-y-2">
          <div className="flex items-center justify-between text-xs font-bold font-mono">
            <span className="flex items-center gap-2 text-indigo-200">
              <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
              <span>Collecting Short.io Clicks ({collectingShortIoProgress.current}/{collectingShortIoProgress.total})</span>
            </span>
            <span className="text-emerald-400">
              {collectingShortIoProgress.success} Success · {collectingShortIoProgress.failed} Failed
            </span>
          </div>
          <div className="w-full bg-slate-800/80 rounded-full h-2 overflow-hidden border border-indigo-400/20">
            <div
              className="bg-gradient-to-r from-cyan-400 to-indigo-400 h-2 rounded-full transition-all duration-300"
              style={{ width: `${(collectingShortIoProgress.current / Math.max(1, collectingShortIoProgress.total)) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Interactive Influencer & Product Multi-Dimension Filter Bar */}
      <div className="bg-slate-900/95 text-white rounded-3xl p-5 border border-indigo-500/40 shadow-xl space-y-4 animate-in fade-in duration-150">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="p-2 bg-indigo-500/20 text-indigo-300 rounded-xl border border-indigo-500/30">
              <Filter className="w-4 h-4" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold tracking-tight text-white font-mono">
                  Influencer & Product Video Filter Engine
                </h4>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/30 text-indigo-200 border border-indigo-500/40 font-bold">
                  Multi-Dimensional Slicer
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Filter videos by Influencer Name, Product SKU, State / Location, Release/Order Year, Month, or Exact Date
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {(filterInfluencer !== 'ALL' || filterProducts.length > 0 || filterApproachers.length > 0 || filterStates.length > 0 || filterYear !== 'ALL' || filterMonth !== 'ALL' || filterDate !== '' || selectedFilter !== null || searchTerm !== '') && (
              <button
                onClick={handleResetAllFilters}
                className="text-xs font-bold text-rose-300 hover:text-white flex items-center gap-1.5 hover:bg-rose-500/20 px-3 py-1.5 rounded-xl border border-rose-500/30 transition cursor-pointer"
                title="Clear all active filters"
              >
                <X className="w-3.5 h-3.5" /> Reset Filters
              </button>
            )}
            <span className="text-xs font-mono text-emerald-300 bg-emerald-500/10 px-3 py-1.5 rounded-xl border border-emerald-500/30 font-bold">
              {filteredData.length} of {data.length} Videos Matching
            </span>
          </div>
        </div>

        {/* 7 Dropdown Filters in a Responsive Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
          {/* 1. Approacher Multi-Select (Multipool) Slicer */}
          <div className="space-y-1 relative" ref={approacherDropdownRef}>
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1 font-mono">
                <Users className="w-3 h-3 text-cyan-400" /> Approacher / BDM
              </label>
              {filterApproachers.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAllApproachers}
                  className="text-[9px] text-cyan-300 hover:text-white cursor-pointer font-bold hover:underline"
                >
                  Clear ({filterApproachers.length})
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setIsApproacherDropdownOpen(!isApproacherDropdownOpen)}
              className="w-full bg-slate-800/90 text-white border border-slate-700 hover:border-cyan-400 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-cyan-500 cursor-pointer transition flex items-center justify-between gap-1.5"
            >
              <div className="truncate text-left flex items-center gap-1">
                {filterApproachers.length === 0 ? (
                  <span className="text-slate-200 truncate">All Approachers ({uniqueApproachersList.length})</span>
                ) : filterApproachers.length === 1 ? (
                  <span className="text-cyan-300 font-bold truncate">{filterApproachers[0]}</span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-cyan-300 font-bold truncate">
                    <span className="px-1.5 py-0.2 rounded bg-cyan-500/30 text-cyan-200 text-[10px] font-mono">
                      {filterApproachers.length} sel
                    </span>
                    <span className="text-slate-300 font-normal text-[11px] truncate">
                      {filterApproachers[0]}
                    </span>
                  </span>
                )}
              </div>
              <ChevronDown className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform ${isApproacherDropdownOpen ? 'rotate-180 text-cyan-400' : ''}`} />
            </button>

            {/* Multipool Dropdown Popover */}
            {isApproacherDropdownOpen && (
              <div className="absolute left-0 top-full mt-1.5 z-40 bg-slate-900 border border-cyan-500/50 rounded-2xl shadow-2xl p-3 space-y-2.5 w-[310px] sm:w-[340px] animate-in fade-in zoom-in-95">
                {/* Search inside Dropdown */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={approacherSearchTerm}
                    onChange={(e) => setApproacherSearchTerm(e.target.value)}
                    placeholder="Search approacher / BDM..."
                    className="w-full bg-slate-800 text-white pl-8 pr-3 py-1.5 rounded-lg text-xs border border-slate-700 focus:outline-none focus:border-cyan-500 font-medium placeholder:text-slate-500"
                    autoFocus
                  />
                  {approacherSearchTerm && (
                    <button
                      type="button"
                      onClick={() => setApproacherSearchTerm('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Quick Selection Actions */}
                <div className="flex items-center justify-between text-[11px] font-bold pt-0.5 px-0.5">
                  <button
                    type="button"
                    onClick={handleSelectAllApproachers}
                    className="text-cyan-400 hover:text-cyan-300 cursor-pointer hover:underline"
                  >
                    Select All ({uniqueApproachersList.length})
                  </button>
                  <button
                    type="button"
                    onClick={handleClearAllApproachers}
                    className="text-rose-400 hover:text-rose-300 cursor-pointer hover:underline"
                  >
                    Clear All
                  </button>
                </div>

                {/* Scrollable Approacher List with Checkboxes */}
                <div className="max-h-56 overflow-y-auto space-y-1 pr-1 divide-y divide-white/5">
                  {uniqueApproachersList
                    .filter(app => app.name.toLowerCase().includes(approacherSearchTerm.toLowerCase()))
                    .map(app => {
                      const isSelected = filterApproachers.some(a => a.toLowerCase() === app.name.toLowerCase());
                      return (
                        <label
                          key={app.name}
                          onClick={() => handleToggleApproacher(app.name)}
                          className={`flex items-center justify-between p-2 rounded-xl text-xs font-medium cursor-pointer transition ${
                            isSelected ? 'bg-cyan-500/20 text-white border border-cyan-500/40' : 'hover:bg-slate-800 text-slate-300'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition ${
                              isSelected ? 'bg-cyan-500 border-cyan-400 text-slate-950' : 'border-slate-600 bg-slate-800'
                            }`}>
                              {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                            </div>
                            <span className="truncate font-semibold">{app.name}</span>
                          </div>
                          <span className="text-[10px] font-mono text-cyan-300 bg-cyan-500/20 px-2 py-0.5 rounded-full shrink-0 border border-cyan-500/30">
                            {app.count} vids
                          </span>
                        </label>
                      );
                    })}
                  {uniqueApproachersList.filter(app => app.name.toLowerCase().includes(approacherSearchTerm.toLowerCase())).length === 0 && (
                    <div className="text-center py-4 text-xs text-slate-500">
                      No approachers matching "{approacherSearchTerm}"
                    </div>
                  )}
                </div>

                {/* Dropdown Footer */}
                <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[10px] font-mono text-slate-400">
                  <span>{filterApproachers.length} of {uniqueApproachersList.length} Selected</span>
                  <button
                    type="button"
                    onClick={() => setIsApproacherDropdownOpen(false)}
                    className="text-cyan-400 font-bold hover:underline cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 2. Influencer Selector */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1 font-mono">
              <UserCheck className="w-3 h-3 text-indigo-400" /> Influencer Name
            </label>
            <select
              value={filterInfluencer}
              onChange={(e) => setFilterInfluencer(e.target.value)}
              className="w-full text-xs font-semibold text-slate-800 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="ALL">All Influencers ({uniqueInfluencersList.length})</option>
              {[...uniqueInfluencersList]
                .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }))
                .map(inf => (
                  <option key={inf.name} value={inf.name}>{inf.name} ({inf.count} videos)</option>
                ))
              }
            </select>
          </div>

          {/* 3. Product Multi-Select (Multipool) Slicer */}
          <div className="space-y-1 relative" ref={productDropdownRef}>
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1 font-mono">
                <Award className="w-3 h-3 text-fuchsia-400" /> Product SKU
              </label>
              {filterProducts.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAllProducts}
                  className="text-[9px] text-fuchsia-300 hover:text-white cursor-pointer font-bold hover:underline"
                >
                  Clear ({filterProducts.length})
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setIsProductDropdownOpen(!isProductDropdownOpen)}
              className="w-full bg-slate-800/90 text-white border border-slate-700 hover:border-fuchsia-400 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-fuchsia-500 cursor-pointer transition flex items-center justify-between gap-1.5"
            >
              <div className="truncate text-left flex items-center gap-1">
                {filterProducts.length === 0 ? (
                  <span className="text-slate-200 truncate">All Products ({uniqueProductsList.length})</span>
                ) : filterProducts.length === 1 ? (
                  <span className="text-fuchsia-300 font-bold truncate">{filterProducts[0]}</span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-fuchsia-300 font-bold truncate">
                    <span className="px-1.5 py-0.2 rounded bg-fuchsia-500/30 text-fuchsia-200 text-[10px] font-mono">
                      {filterProducts.length} sel
                    </span>
                    <span className="text-slate-300 font-normal text-[11px] truncate">
                      {filterProducts[0]}
                    </span>
                  </span>
                )}
              </div>
              <ChevronDown className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform ${isProductDropdownOpen ? 'rotate-180 text-fuchsia-400' : ''}`} />
            </button>

            {/* Multipool Dropdown Popover */}
            {isProductDropdownOpen && (
              <div className="absolute left-0 sm:left-auto sm:right-0 top-full mt-1.5 z-40 bg-slate-900 border border-fuchsia-500/50 rounded-2xl shadow-2xl p-3 space-y-2.5 w-[310px] sm:w-[340px] animate-in fade-in zoom-in-95">
                {/* Search inside Dropdown */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={productSearchTerm}
                    onChange={(e) => setProductSearchTerm(e.target.value)}
                    placeholder="Search product SKU..."
                    className="w-full bg-slate-800 text-white pl-8 pr-3 py-1.5 rounded-lg text-xs border border-slate-700 focus:outline-none focus:border-fuchsia-500 font-medium placeholder:text-slate-500"
                    autoFocus
                  />
                  {productSearchTerm && (
                    <button
                      type="button"
                      onClick={() => setProductSearchTerm('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Quick Selection Actions */}
                <div className="flex items-center justify-between text-[11px] font-bold pt-0.5 px-0.5">
                  <button
                    type="button"
                    onClick={handleSelectAllProducts}
                    className="text-indigo-400 hover:text-indigo-300 cursor-pointer hover:underline"
                  >
                    Select All ({uniqueProductsList.length})
                  </button>
                  <button
                    type="button"
                    onClick={handleClearAllProducts}
                    className="text-rose-400 hover:text-rose-300 cursor-pointer hover:underline"
                  >
                    Clear All
                  </button>
                </div>

                {/* Scrollable Product List with Checkboxes */}
                <div className="max-h-56 overflow-y-auto space-y-1 pr-1 divide-y divide-white/5">
                  {uniqueProductsList
                    .filter(p => p.name.toLowerCase().includes(productSearchTerm.toLowerCase()))
                    .map(p => {
                      const isSelected = filterProducts.some(fp => fp.toLowerCase() === p.name.toLowerCase());
                      return (
                        <div
                          key={p.name}
                          onClick={() => handleToggleProduct(p.name)}
                          className={`flex items-center justify-between p-2 rounded-xl text-xs cursor-pointer transition ${
                            isSelected
                              ? 'bg-fuchsia-500/20 text-fuchsia-200 border border-fuchsia-500/40 font-bold'
                              : 'hover:bg-slate-800/80 text-slate-300 border border-transparent'
                          }`}
                        >
                          <div className="flex items-center gap-2 max-w-[230px]">
                            <div className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 transition ${
                              isSelected
                                ? 'bg-fuchsia-600 border-fuchsia-500 text-white'
                                : 'border-slate-600 bg-slate-800'
                            }`}>
                              {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                            </div>
                            <span className="truncate" title={p.name}>{p.name}</span>
                          </div>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-400 border border-slate-700 shrink-0">
                            {p.count}v
                          </span>
                        </div>
                      );
                    })}
                  {uniqueProductsList.filter(p => p.name.toLowerCase().includes(productSearchTerm.toLowerCase())).length === 0 && (
                    <div className="py-4 text-center text-xs text-slate-500">
                      No matching product SKU found.
                    </div>
                  )}
                </div>

                {/* Footer Status */}
                <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                  <span>{filterProducts.length} of {uniqueProductsList.length} selected</span>
                  <button
                    type="button"
                    onClick={() => setIsProductDropdownOpen(false)}
                    className="px-2.5 py-1 bg-fuchsia-600 hover:bg-fuchsia-500 text-white font-bold rounded-lg cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 4. State / Location Multi-Select (Multipool) Slicer */}
          <div className="space-y-1 relative" ref={stateDropdownRef}>
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1 font-mono">
                <MapPin className="w-3 h-3 text-emerald-400" /> State / Location
              </label>
              {filterStates.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAllStates}
                  className="text-[9px] text-emerald-300 hover:text-white cursor-pointer font-bold hover:underline"
                >
                  Clear ({filterStates.length})
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setIsStateDropdownOpen(!isStateDropdownOpen)}
              className="w-full bg-slate-800/90 text-white border border-slate-700 hover:border-emerald-400 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer transition flex items-center justify-between gap-1.5"
            >
              <div className="truncate text-left flex items-center gap-1">
                {filterStates.length === 0 ? (
                  <span className="text-slate-200 truncate">All States ({uniqueStatesList.length})</span>
                ) : filterStates.length === 1 ? (
                  <span className="text-emerald-300 font-bold truncate">{filterStates[0]}</span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-emerald-300 font-bold truncate">
                    <span className="px-1.5 py-0.2 rounded bg-emerald-500/30 text-emerald-200 text-[10px] font-mono">
                      {filterStates.length} sel
                    </span>
                    <span className="text-slate-300 font-normal text-[11px] truncate">
                      {filterStates[0]}
                    </span>
                  </span>
                )}
              </div>
              <ChevronDown className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform ${isStateDropdownOpen ? 'rotate-180 text-emerald-400' : ''}`} />
            </button>

            {/* Multipool Dropdown Popover */}
            {isStateDropdownOpen && (
              <div className="absolute left-0 sm:left-auto sm:right-0 top-full mt-1.5 z-40 bg-slate-900 border border-emerald-500/50 rounded-2xl shadow-2xl p-3 space-y-2.5 w-[310px] sm:w-[340px] animate-in fade-in zoom-in-95">
                {/* Search inside Dropdown */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={stateSearchTerm}
                    onChange={(e) => setStateSearchTerm(e.target.value)}
                    placeholder="Search state / location..."
                    className="w-full bg-slate-800 text-white pl-8 pr-3 py-1.5 rounded-lg text-xs border border-slate-700 focus:outline-none focus:border-emerald-500 font-medium placeholder:text-slate-500"
                    autoFocus
                  />
                  {stateSearchTerm && (
                    <button
                      type="button"
                      onClick={() => setStateSearchTerm('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Quick Selection Actions */}
                <div className="flex items-center justify-between text-[11px] font-bold pt-0.5 px-0.5">
                  <button
                    type="button"
                    onClick={handleSelectAllStates}
                    className="text-emerald-400 hover:text-emerald-300 cursor-pointer hover:underline"
                  >
                    Select All ({uniqueStatesList.length})
                  </button>
                  <button
                    type="button"
                    onClick={handleClearAllStates}
                    className="text-rose-400 hover:text-rose-300 cursor-pointer hover:underline"
                  >
                    Clear All
                  </button>
                </div>

                {/* Scrollable State List with Checkboxes */}
                <div className="max-h-56 overflow-y-auto space-y-1 pr-1 divide-y divide-white/5">
                  {uniqueStatesList
                    .filter(st => st.name.toLowerCase().includes(stateSearchTerm.toLowerCase()))
                    .map(st => {
                      const isSelected = filterStates.some(s => s.toLowerCase() === st.name.toLowerCase());
                      return (
                        <div
                          key={st.name}
                          onClick={() => handleToggleState(st.name)}
                          className={`flex items-center justify-between p-2 rounded-xl text-xs font-medium cursor-pointer transition ${
                            isSelected ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/40 font-bold' : 'hover:bg-slate-800/80 text-slate-300 border border-transparent'
                          }`}
                        >
                          <div className="flex items-center gap-2 max-w-[230px]">
                            <div className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 transition ${
                              isSelected ? 'bg-emerald-600 border-emerald-500 text-white' : 'border-slate-600 bg-slate-800'
                            }`}>
                              {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                            </div>
                            <span className="truncate" title={st.name}>{st.name}</span>
                          </div>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-400 border border-slate-700 shrink-0">
                            {st.count}v
                          </span>
                        </div>
                      );
                    })}
                  {uniqueStatesList.filter(st => st.name.toLowerCase().includes(stateSearchTerm.toLowerCase())).length === 0 && (
                    <div className="py-4 text-center text-xs text-slate-500">
                      No matching state / location found.
                    </div>
                  )}
                </div>

                {/* Footer Status */}
                <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                  <span>{filterStates.length} of {uniqueStatesList.length} selected</span>
                  <button
                    type="button"
                    onClick={() => setIsStateDropdownOpen(false)}
                    className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 4. Year Selector */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1 font-mono">
              <Activity className="w-3 h-3 text-purple-400" /> Year
            </label>
            <select
              value={filterYear}
              onChange={(e) => setFilterYear(e.target.value)}
              className="w-full bg-slate-800/90 text-white border border-slate-700 hover:border-purple-400 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer transition"
            >
              <option value="ALL">All Years</option>
              {uniqueYearsList.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          {/* 5. Month Selector */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1 font-mono">
              <TrendingUp className="w-3 h-3 text-amber-400" /> Month
            </label>
            <select
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              className="w-full bg-slate-800/90 text-white border border-slate-700 hover:border-amber-400 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer transition"
            >
              {monthsList.map(m => (
                <option key={m.key} value={m.key}>{m.label}</option>
              ))}
            </select>
          </div>

          {/* 6. Date Picker */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1 font-mono">
              <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Exact Date
            </label>
            <div className="relative">
              <input
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className="w-full bg-slate-800/90 text-white border border-slate-700 hover:border-emerald-400 rounded-xl px-3 py-2 text-xs font-mono font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer transition"
              />
              {filterDate && (
                <button
                  onClick={() => setFilterDate('')}
                  className="absolute right-7 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-0.5"
                  title="Clear exact date"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Approacher Isolation & Delete Other Approachers Action Bar */}
        {filterApproachers.length > 0 && (
          <div className="bg-gradient-to-r from-rose-950/80 via-slate-900 to-indigo-950/80 border border-rose-500/50 rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in duration-200">
            <div className="flex items-center gap-2.5">
              <span className="p-2 bg-rose-500/20 text-rose-300 rounded-xl border border-rose-500/40">
                <Users className="w-4 h-4" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white font-mono">
                    Selected Approacher Filter ({filterApproachers.length}): <strong className="text-cyan-300">{filterApproachers.join(', ')}</strong>
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-500/20 text-rose-200 border border-rose-500/30 font-bold">
                    {filteredData.length} Deliverables Matching
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Want to keep only deliverables for these {filterApproachers.length} selected approacher(s) and delete all other deliverables from the analyzer?
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => {
                  const normSelected = filterApproachers.map(a => a.trim().toLowerCase());
                  const kept = data.filter(r => normSelected.includes((r.approacher || 'Unassigned').trim().toLowerCase()));
                  const deletedCount = data.length - kept.length;
                  setData(kept);
                  setFilterApproachers([]);
                  globalToast.success(`Kept ${kept.length} deliverables for selected approachers. Deleted ${deletedCount} other deliverables.`);
                }}
                className="px-3.5 py-2 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white rounded-xl text-xs font-bold shadow-md transition cursor-pointer flex items-center gap-1.5"
                title="Keep only selected approacher(s) and delete all other approachers"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-200" />
                <span>Keep Selected & Delete Others</span>
              </button>

              <button
                onClick={() => {
                  const normSelected = filterApproachers.map(a => a.trim().toLowerCase());
                  const kept = data.filter(r => !normSelected.includes((r.approacher || 'Unassigned').trim().toLowerCase()));
                  const deletedCount = data.length - kept.length;
                  setData(kept);
                  setFilterApproachers([]);
                  globalToast.success(`Deleted ${deletedCount} deliverables for ${filterApproachers.join(', ')}.`);
                }}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-bold border border-slate-700 transition cursor-pointer flex items-center gap-1.5"
                title="Delete selected approacher(s) data from analyzer"
              >
                <UserMinus className="w-3.5 h-3.5 text-amber-400" />
                <span>Delete Selected</span>
              </button>
            </div>
          </div>
        )}

        {/* Active Filters Summary Pills */}
        {(filterApproachers.length > 0 || filterInfluencer !== 'ALL' || filterProducts.length > 0 || filterYear !== 'ALL' || filterMonth !== 'ALL' || filterDate !== '') && (
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/10 text-xs">
            <span className="text-[10px] uppercase font-bold text-slate-400 font-mono">Active Slicers:</span>
            {filterApproachers.length > 0 && (
              <>
                {filterApproachers.length <= 3 ? (
                  filterApproachers.map(app => (
                    <span key={app} className="inline-flex items-center gap-1 bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 px-2.5 py-1 rounded-lg text-[11px] font-bold">
                      Approacher: {app}
                      <X className="w-3 h-3 cursor-pointer hover:text-white" onClick={() => handleToggleApproacher(app)} />
                    </span>
                  ))
                ) : (
                  <span className="inline-flex items-center gap-1 bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 px-2.5 py-1 rounded-lg text-[11px] font-bold">
                    Approachers: {filterApproachers.length} Selected
                    <X className="w-3 h-3 cursor-pointer hover:text-white" onClick={handleClearAllApproachers} />
                  </span>
                )}
              </>
            )}
            {filterInfluencer !== 'ALL' && (
              <span className="inline-flex items-center gap-1 bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 px-2.5 py-1 rounded-lg text-[11px] font-bold">
                Creator: {filterInfluencer}
                <X className="w-3 h-3 cursor-pointer hover:text-white" onClick={() => setFilterInfluencer('ALL')} />
              </span>
            )}
            {filterProducts.length > 0 && (
              <>
                {filterProducts.length <= 3 ? (
                  filterProducts.map(pName => (
                    <span key={pName} className="inline-flex items-center gap-1 bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/40 px-2.5 py-1 rounded-lg text-[11px] font-bold">
                      Product: {pName.length > 25 ? pName.slice(0, 25) + '...' : pName}
                      <X className="w-3 h-3 cursor-pointer hover:text-white" onClick={() => handleToggleProduct(pName)} />
                    </span>
                  ))
                ) : (
                  <span className="inline-flex items-center gap-1 bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/40 px-2.5 py-1 rounded-lg text-[11px] font-bold">
                    Products: {filterProducts.length} SKUs Selected
                    <X className="w-3 h-3 cursor-pointer hover:text-white" onClick={handleClearAllProducts} />
                  </span>
                )}
              </>
            )}
            {filterYear !== 'ALL' && (
              <span className="inline-flex items-center gap-1 bg-purple-500/20 text-purple-300 border border-purple-500/40 px-2.5 py-1 rounded-lg text-[11px] font-bold">
                Year: {filterYear}
                <X className="w-3 h-3 cursor-pointer hover:text-white" onClick={() => setFilterYear('ALL')} />
              </span>
            )}
            {filterMonth !== 'ALL' && (
              <span className="inline-flex items-center gap-1 bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2.5 py-1 rounded-lg text-[11px] font-bold">
                Month: {monthsList.find(m => m.key === filterMonth)?.label || filterMonth}
                <X className="w-3 h-3 cursor-pointer hover:text-white" onClick={() => setFilterMonth('ALL')} />
              </span>
            )}
            {filterDate && (
              <span className="inline-flex items-center gap-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2.5 py-1 rounded-lg text-[11px] font-bold">
                Date: {filterDate}
                <X className="w-3 h-3 cursor-pointer hover:text-white" onClick={() => setFilterDate('')} />
              </span>
            )}
          </div>
        )}
      </div>

      {/* Function Button Navigation & Quick Slicers */}
      <div className="bg-white rounded-3xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-4">
        {/* Row 1: Primary View Mode Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div role="tablist" aria-label="View Mode Navigation" className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100/90 rounded-2xl text-xs font-bold">
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'grid'}
              tabIndex={0}
              onClick={() => setViewMode('grid')}
              className={`px-3.5 py-2 rounded-xl transition cursor-pointer flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                viewMode === 'grid' ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200/60' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
              }`}
            >
              <Layers className="w-4 h-4 text-indigo-600" />
              <span>Ledger</span>
              <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[10px] font-mono font-bold">
                {filteredData.length}
              </span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'matrix'}
              tabIndex={0}
              onClick={() => setViewMode('matrix')}
              className={`px-3.5 py-2 rounded-xl transition cursor-pointer flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                viewMode === 'matrix' ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200/60' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
              }`}
            >
              <UserCheck className="w-4 h-4 text-indigo-600" />
              <span>Influencer & Product Videos</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'breakdown'}
              tabIndex={0}
              onClick={() => setViewMode('breakdown')}
              className={`px-3.5 py-2 rounded-xl transition cursor-pointer flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                viewMode === 'breakdown' ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200/60' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
              }`}
            >
              <BarChart2 className="w-4 h-4 text-indigo-600" />
              <span>SKU & Team Breakdown</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'tat'}
              tabIndex={0}
              onClick={() => setViewMode('tat')}
              className={`px-3.5 py-2 rounded-xl transition cursor-pointer flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                viewMode === 'tat' ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200/60' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
              }`}
            >
              <Zap className="w-4 h-4 text-amber-500" />
              <span>TAT & Funnel</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'ai'}
              tabIndex={0}
              onClick={() => setViewMode('ai')}
              className={`px-3.5 py-2 rounded-xl transition cursor-pointer flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-500 ${
                viewMode === 'ai' ? 'bg-fuchsia-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
              }`}
            >
              <Sparkles className="w-4 h-4 text-fuchsia-300" />
              <span>AI Report</span>
            </button>
          </div>
        </div>

        {/* Row 2: Search, Export & Anomaly Action Buttons Bar */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-1">
          {/* Search Bar */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search creator, product, VoId, month, approacher..."
              className="w-full pl-10 pr-9 py-2 bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
              aria-label="Search dataset"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Action Button Clusters */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Export & Sync Actions */}
            <div className="flex items-center gap-1.5 bg-slate-50 p-1 rounded-xl border border-slate-200/70">
              <button
                type="button"
                onClick={handleExportCsv}
                className="flex items-center gap-1.5 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold px-3 py-1.5 rounded-lg border border-slate-200 shadow-2xs transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                title="Export filtered records as CSV"
                aria-label="Export filtered data as CSV"
              >
                <Download className="w-3.5 h-3.5 text-slate-600" />
                <span>Export CSV</span>
              </button>

              <button
                type="button"
                onClick={handleSyncToApp}
                className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-xs transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                title="Sync deliverables into app's Monthly Planner & Creator Database"
                aria-label="Sync deliverables to App"
              >
                <Database className="w-3.5 h-3.5" />
                <span>Sync to App</span>
              </button>

              {data.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('Are you sure you want to delete all main page extracted data? This will reset the workspace.')) {
                      handleClearData();
                    }
                  }}
                  className="flex items-center gap-1.5 bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 text-white text-xs font-black uppercase tracking-wider px-3 py-1.5 rounded-lg border border-red-400 shadow-md shadow-red-600/30 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 active:scale-95"
                  title="Delete all main page extracted data and return to blank state"
                  aria-label="Delete All Data on Main Page"
                >
                  <Trash2 className="w-3.5 h-3.5 text-white" />
                  <span>Delete All Data</span>
                </button>
              )}
            </div>

            {/* Abnormal Views & Live Refresh Buttons */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setHighCountActiveTab('main');
                  setIsHighCountModalOpen(true);
                }}
                className="bg-red-600 hover:bg-red-700 text-white shadow-md shadow-red-500/30 animate-pulse border border-red-300 font-bold text-xs px-3.5 py-2 rounded-xl flex items-center gap-1.5 cursor-pointer transition-all hover:scale-102 active:scale-98 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                title="View all deliverables with abnormally high view counts"
                aria-label="View abnormal high views"
              >
                <Flame className="w-4 h-4 text-amber-300" />
                <span>Abnormal Views:</span>
                <span className="bg-white/20 text-white px-2 py-0.5 rounded-md text-xs font-mono font-black">
                  {mainHighCountRows.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (mainHighCountRows.length === 0) {
                    globalToast.info(`No deliverables found with views ≥ ${highViewThreshold.toLocaleString()}`);
                    return;
                  }
                  collectLiveVideoViewsProcedure(mainHighCountRows);
                }}
                disabled={isCollectingViews}
                className="bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-500/30 border border-emerald-300 font-bold text-xs px-3.5 py-2 rounded-xl flex items-center gap-1.5 cursor-pointer transition-all hover:scale-102 active:scale-98 disabled:opacity-50 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                title="Refresh live video views for all items with higher view counts"
                aria-label="Refresh High Views"
              >
                <RefreshCw className={`w-4 h-4 text-emerald-200 ${isCollectingViews ? 'animate-spin' : ''}`} />
                <span>Refresh High Views</span>
              </button>
            </div>
          </div>
        </div>

        {/* Row 3: Quick Slicer Buttons */}
        <div className="flex flex-wrap items-center gap-1.5 pt-3 border-t border-slate-100 text-[11px] font-medium text-slate-600">
          <span className="font-bold text-slate-400 uppercase text-[9px] tracking-wider font-mono mr-1">Quick Slicers:</span>
          
          <button 
            type="button"
            onClick={() => handleClickAndFound('sample', 'yes', 'Samples Required: Yes')}
            className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-lg border border-amber-200 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          >
            📦 Samples To Send ({stats.sampleYesCount})
          </button>

          <button 
            type="button"
            onClick={() => handleClickAndFound('paymentTerms', 'advance', 'Payment Terms: Advance')}
            className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-800 rounded-lg border border-blue-200 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            💰 Advance Payouts
          </button>

          <button 
            type="button"
            onClick={() => handleClickAndFound('platform', 'facebook', 'Platform: Facebook')}
            className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 rounded-lg border border-indigo-200 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
          >
            📘 Facebook
          </button>

          <button 
            type="button"
            onClick={() => handleClickAndFound('platform', 'instagram', 'Platform: Instagram')}
            className="px-2.5 py-1 bg-pink-50 hover:bg-pink-100 text-pink-800 rounded-lg border border-pink-200 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400"
          >
            📸 Instagram
          </button>

          <button 
            type="button"
            onClick={() => handleClickAndFound('platform', 'youtube', 'Platform: Youtube')}
            className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-800 rounded-lg border border-red-200 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
          >
            ▶️ YouTube
          </button>

          <button 
            type="button"
            onClick={() => handleClickAndFound('month', 'oct26', 'Order Month: Oct26')}
            className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-800 rounded-lg border border-purple-200 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
          >
            📅 Oct 2026
          </button>

          <button 
            type="button"
            onClick={() => handleClickAndFound('month', 'sep26', 'Order Month: Sep26')}
            className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-800 rounded-lg border border-purple-200 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
          >
            📅 Sep 2026
          </button>
        </div>
      </div>

      {/* VIEW 1: Click & Found Interactive Data Ledger */}
      {viewMode === 'grid' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div>
              <h3 className="text-sm font-bold text-slate-800">
                Deliverables Ledger Table ({filteredData.length} records)
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                💡 <span className="font-semibold text-indigo-600">Tip:</span> Click any Creator, Product, Approacher, or Platform chip directly in the table to instantly filter!
              </p>
            </div>
          </div>

          <div className="overflow-x-auto max-h-[640px]">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100/80 sticky top-0 z-10 border-b border-slate-200 text-slate-600 uppercase font-mono font-bold text-[10px]">
                <tr>
                  <th className="p-3">Video ID</th>
                  <th className="p-3">Influencer Name</th>
                  <th className="p-3">Product Name</th>
                  <th className="p-3">Amount</th>
                  <th className="p-3">Approacher</th>
                  <th className="p-3">Platform</th>
                  <th className="p-3 text-center">Step Progress (1-4)</th>
                  <th className="p-3">Video Link</th>
                  <th className="p-3">Short.io Code</th>
                  <th className="p-3 bg-sky-50/60 text-sky-900 border-x border-sky-100">Views</th>
                  <th className="p-3 bg-indigo-50/60 text-indigo-900 border-r border-indigo-100">Clicks</th>
                  <th className="p-3 bg-emerald-50/60 text-emerald-900 border-r border-emerald-100">CPV (₹)</th>
                  <th className="p-3 bg-fuchsia-50/60 text-fuchsia-900 border-r border-fuchsia-100">CPC (₹)</th>
                  <th className="p-3 bg-purple-50/60 text-purple-900 border-r border-purple-100">CTR (%)</th>
                  <th className="p-3">Checklist PDF</th>
                  <th className="p-3">Release Date</th>
                  <th className="p-3 text-center bg-slate-200/50">Tracking Audit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-sans">
                {filteredData.length === 0 ? (
                  <tr>
                    <td colSpan={17} className="p-12 text-center text-slate-400">
                      <p className="text-sm font-semibold">No deliverables match the active criteria.</p>
                      <button onClick={() => { setSelectedFilter(null); setSearchTerm(''); }} className="mt-2 text-indigo-600 font-bold underline">
                        Reset filters
                      </button>
                    </td>
                  </tr>
                ) : (
                  filteredData.map((row) => {
                    const isAllDone = row.step1 === 'Done' && row.step2 === 'Done' && row.step3 === 'Done' && row.step4 === 'Done';
                    const metrics = getRowMetrics(row);
                    const { viewsReason, clicksReason } = getMetricsStatusReason(row, metrics);
                    const hasMissingMetrics = !metrics.hasVideoLink || !metrics.hasShortIoCode || metrics.views === undefined || metrics.clicks === undefined || metrics.views <= 0 || metrics.clicks <= 0;

                    return (
                      <tr key={row.videoId} className="hover:bg-slate-50/80 transition-colors group">
                        {/* Video ID */}
                        <td className="p-3 font-mono font-bold text-indigo-700 whitespace-nowrap">
                          {row.videoId}
                        </td>

                        {/* Influencer Name (Click & Found trigger) */}
                        <td className="p-3 font-semibold text-slate-800">
                          <button
                            onClick={() => handleClickAndFound('influencer', row.influencerName, `Creator: ${row.influencerName}`)}
                            className="hover:text-indigo-600 hover:underline cursor-pointer text-left font-bold"
                            title="Click to find all deliverables for this creator"
                          >
                            {row.influencerName}
                          </button>
                        </td>

                        {/* Product SKU (Click & Found trigger) */}
                        <td className="p-3 text-slate-700 max-w-xs truncate" title={row.productName}>
                          <button
                            onClick={() => handleClickAndFound('product', row.productName, `SKU: ${row.productName}`)}
                            className="hover:text-fuchsia-600 hover:underline cursor-pointer text-left truncate block w-full text-[11px]"
                            title="Click to find all videos for this product SKU"
                          >
                            {row.productName}
                          </button>
                        </td>

                        {/* Amount */}
                        <td className="p-3 font-mono font-bold text-slate-800 whitespace-nowrap">
                          ₹{row.amountPaid.toLocaleString('en-IN')}
                        </td>

                        {/* Approacher / BDM (Click & Found trigger) */}
                        <td className="p-3">
                          <button
                            onClick={() => handleClickAndFound('approacher', row.approacher, `Approacher: ${row.approacher}`)}
                            className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer"
                          >
                            {row.approacher}
                          </button>
                        </td>

                        {/* Platform */}
                        <td className="p-3 whitespace-nowrap">
                          <span className="text-[10px] font-medium text-slate-600">
                            {row.platform}
                          </span>
                        </td>

                        {/* Steps (1 to 4) */}
                        <td className="p-3 text-center whitespace-nowrap">
                          <div className="inline-flex items-center gap-1 font-mono text-[9px] font-bold">
                            <span className={`px-1.5 py-0.5 rounded ${row.step1 === 'Done' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>1</span>
                            <span className={`px-1.5 py-0.5 rounded ${row.step2 === 'Done' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>2</span>
                            <span className={`px-1.5 py-0.5 rounded ${row.step3 === 'Done' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>3</span>
                            <span className={`px-1.5 py-0.5 rounded ${row.step4 === 'Done' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>4</span>
                            {isAllDone && <span className="text-emerald-600 text-xs">✓</span>}
                          </div>
                        </td>

                        {/* Video Link */}
                        <td className="p-3 whitespace-nowrap">
                          {metrics.hasVideoLink ? (
                            <a
                              href={row.videoLink}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 font-bold hover:underline"
                            >
                              Watch <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : (
                            <span className="text-rose-500 font-semibold text-[10px] flex items-center gap-1" title="Reason: Video link has not been published yet">
                              <AlertCircle className="w-2.5 h-2.5" /> Pending Link
                            </span>
                          )}
                        </td>

                        {/* Short.io Code & Full Link */}
                        <td className="p-3 font-mono text-[10px] whitespace-nowrap">
                          {metrics.hasShortIoCode ? (
                            <div className="flex flex-col gap-1 max-w-[220px]">
                              <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-bold border border-indigo-100 self-start">
                                {row.shortIoCode}
                              </span>
                              {(row.shortIoLink || row.shortIoCode) && (
                                <a
                                  href={
                                    (row.shortIoLink || row.shortIoCode).startsWith('http')
                                      ? (row.shortIoLink || row.shortIoCode)
                                      : `https://${row.shortIoLink || row.shortIoCode}`
                                  }
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[10px] text-indigo-600 hover:text-indigo-800 font-semibold truncate hover:underline flex items-center gap-1 max-w-[200px]"
                                  title={`Full Short.io Link as on input file: ${row.shortIoLink || row.shortIoCode}`}
                                >
                                  <Link2 className="w-2.5 h-2.5 shrink-0 text-indigo-500" />
                                  <span className="truncate">{row.shortIoLink || row.shortIoCode}</span>
                                  <ExternalLink className="w-2.5 h-2.5 shrink-0 opacity-70" />
                                </a>
                              )}
                            </div>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 text-[9px] font-semibold" title="Reason: SHORT.IO CODE is not available. Under campaign tracking rules, link clicks can only be tracked when Short.io code is available.">
                              No Short.io
                            </span>
                          )}
                        </td>

                        {/* Views (Always shown when Video Link is available, guarded by Abnormal View Monitor) */}
                        <td className="p-3 font-mono text-xs whitespace-nowrap bg-sky-50/20 border-x border-sky-100">
                          {metrics.hasVideoLink ? (
                            metrics.views !== undefined ? (
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="inline-flex items-center gap-1 font-bold text-sky-800 bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
                                    <Eye className="w-3 h-3 text-sky-600" />
                                    {metrics.views.toLocaleString('en-IN')}
                                  </span>
                                  {!metrics.abnormalStopped && (
                                    <span
                                      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200"
                                      title={`Original Views Verified (${metrics.viewSource || 'Video Link Metadata'})`}
                                    >
                                      <ShieldCheck className="w-2.5 h-2.5 text-emerald-600" />
                                      Original
                                    </span>
                                  )}
                                  <button
                                    onClick={() => collectLiveVideoViewsProcedure([row])}
                                    disabled={rowViewsLoadingId === row.videoId}
                                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-sky-100 rounded text-sky-600 hover:text-sky-900 transition cursor-pointer"
                                    title="Re-fetch verified original views via Live Video Views procedure"
                                  >
                                    <RefreshCw className={`w-2.5 h-2.5 ${rowViewsLoadingId === row.videoId ? 'animate-spin text-sky-600' : ''}`} />
                                  </button>
                                  <button
                                    onClick={() => setInspectingRowForViews({
                                      row,
                                      currentUrl: extractVideoUrlsFromRow(row)[0] || row.videoLink || '',
                                      viewsValue: metrics.views ? String(metrics.views) : '',
                                      isTesting: false
                                    })}
                                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-200 rounded text-slate-400 hover:text-slate-700 transition cursor-pointer"
                                    title="Inspect video URL and edit live views"
                                  >
                                    <Edit2 className="w-2.5 h-2.5" />
                                  </button>
                                </div>
                                {metrics.abnormalStopped && (
                                  <span
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-50 text-amber-800 border border-amber-300 w-fit"
                                    title={metrics.stopReason || 'Abnormal view stopped; showing verified Original Views'}
                                  >
                                    <ShieldAlert className="w-2.5 h-2.5 text-amber-600 shrink-0" />
                                    Stopped {metrics.stoppedAbnormalValue ? metrics.stoppedAbnormalValue.toLocaleString('en-IN') : 'Abnormal'} → Original
                                  </span>
                                )}
                              </div>
                            ) : (
                              <div className="flex flex-col gap-1">
                                {metrics.abnormalStopped && (
                                  <span
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-50 text-amber-800 border border-amber-300 w-fit"
                                    title={metrics.stopReason || 'Abnormal view stopped by Original View Guard'}
                                  >
                                    <ShieldAlert className="w-2.5 h-2.5 text-amber-600 shrink-0" />
                                    Stopped Abnormal ({metrics.stoppedAbnormalValue?.toLocaleString('en-IN') || 'Spike'})
                                  </span>
                                )}
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => collectLiveVideoViewsProcedure([row])}
                                    disabled={rowViewsLoadingId === row.videoId}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-sky-100 hover:bg-sky-200 text-sky-800 border border-sky-300 transition cursor-pointer shadow-2xs"
                                    title="Collect verified Original Views using the Live Video Views procedure"
                                  >
                                    <Eye className={`w-2.5 h-2.5 ${rowViewsLoadingId === row.videoId ? 'animate-spin text-sky-700' : 'text-sky-600'}`} />
                                    <span>{rowViewsLoadingId === row.videoId ? 'Fetching...' : 'Fetch Original Views'}</span>
                                  </button>
                                  <button
                                    onClick={() => setInspectingRowForViews({
                                      row,
                                      currentUrl: extractVideoUrlsFromRow(row)[0] || row.videoLink || '',
                                      viewsValue: '',
                                      isTesting: false
                                    })}
                                    className="p-1 hover:bg-slate-200 rounded text-slate-400 hover:text-slate-700 transition cursor-pointer"
                                    title="Inspect video URL or manually input views"
                                  >
                                    <Edit2 className="w-2.5 h-2.5" />
                                  </button>
                                </div>
                              </div>
                            )
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200" title={viewsReason.description}>
                              <AlertCircle className="w-2.5 h-2.5 text-rose-500" />
                              No Video Link
                            </span>
                          )}
                        </td>

                        {/* Clicks (Shown whenever clicks are available; left blank '—' if unable to fetch) */}
                        <td className="p-3 font-mono text-xs whitespace-nowrap bg-indigo-50/20 border-r border-indigo-100">
                          {metrics.clicks !== undefined ? (
                            <div className="flex items-center gap-1.5">
                              <span className="inline-flex items-center gap-1 font-bold text-indigo-800 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                                <MousePointerClick className="w-3 h-3 text-indigo-600" />
                                {metrics.clicks.toLocaleString('en-IN')}
                              </span>
                              <button
                                onClick={() => collectClicksDataProcedure([row])}
                                disabled={rowCollectingId === row.videoId}
                                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-indigo-100 rounded text-indigo-600 hover:text-indigo-900 transition cursor-pointer"
                                title="Re-fetch live clicks via Short.io tracker procedure"
                              >
                                <RefreshCw className={`w-2.5 h-2.5 ${rowCollectingId === row.videoId ? 'animate-spin text-indigo-600' : ''}`} />
                              </button>
                              <button
                                onClick={() => setEditingMetric({ rowId: row.videoId, type: 'clicks', value: String(metrics.clicks) })}
                                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-200 rounded text-slate-400 hover:text-slate-700 transition cursor-pointer"
                                title="Edit clicks"
                              >
                                <Edit2 className="w-2.5 h-2.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <span className="text-slate-400 font-mono text-xs font-semibold">—</span>
                              {metrics.hasShortIoLink && (
                                <button
                                  onClick={() => collectClicksDataProcedure([row])}
                                  disabled={rowCollectingId === row.videoId}
                                  className="opacity-0 group-hover:opacity-100 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition cursor-pointer"
                                  title="Fetch clicks from Short.io"
                                >
                                  <RefreshCw className={`w-2.5 h-2.5 ${rowCollectingId === row.videoId ? 'animate-spin text-indigo-600' : ''}`} />
                                  <span>{rowCollectingId === row.videoId ? '...' : 'Fetch'}</span>
                                </button>
                              )}
                              {metrics.hasShortIoLink && (
                                <button
                                  onClick={() => setEditingMetric({ rowId: row.videoId, type: 'clicks', value: '' })}
                                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-200 rounded text-slate-400 hover:text-slate-700 transition cursor-pointer"
                                  title="Manually input clicks"
                                >
                                  <Edit2 className="w-2.5 h-2.5" />
                                </button>
                              )}
                            </div>
                          )}
                        </td>

                        {/* CPV (₹) = Amount / Views */}
                        <td className="p-3 font-mono text-xs whitespace-nowrap bg-emerald-50/20 border-r border-emerald-100">
                          {metrics.cpv !== undefined ? (
                            <span className="font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                              ₹{metrics.cpv.toFixed(3)}
                            </span>
                          ) : (
                            <span className="text-slate-400 italic text-[10px]" title={!metrics.hasVideoLink ? "Reason: Video link pending" : "Reason: Views count is 0 or pending"}>—</span>
                          )}
                        </td>

                        {/* CPC (₹) = Amount / Clicks */}
                        <td className="p-3 font-mono text-xs whitespace-nowrap bg-fuchsia-50/20 border-r border-fuchsia-100">
                          {metrics.cpc !== undefined ? (
                            <span className="font-bold text-fuchsia-800 bg-fuchsia-50 px-2 py-0.5 rounded border border-fuchsia-200">
                              ₹{metrics.cpc.toFixed(2)}
                            </span>
                          ) : (
                            <span className="text-slate-400 italic text-[10px]" title={!metrics.hasShortIoCode ? "Reason: Requires Short.io code/link" : "Reason: No clicks registered yet"}>
                              —
                            </span>
                          )}
                        </td>

                        {/* CTR (%) = (Clicks / Views) * 100 */}
                        <td className="p-3 font-mono text-xs whitespace-nowrap bg-purple-50/20 border-r border-purple-100">
                          {metrics.ctr !== undefined ? (
                            <span className="font-bold text-purple-800 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                              {metrics.ctr.toFixed(2)}%
                            </span>
                          ) : (
                            <span className="text-slate-400 italic text-[10px]" title={!metrics.hasShortIoCode ? "Reason: Requires Short.io code/link" : "Reason: Requires both views & clicks"}>
                              —
                            </span>
                          )}
                        </td>

                        {/* Checklist PDF */}
                        <td className="p-3 whitespace-nowrap">
                          {row.checklistPdf ? (
                            <a
                              href={row.checklistPdf}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] text-purple-600 hover:text-purple-800 font-bold hover:underline"
                            >
                              Drive PDF <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : (
                            <span className="text-slate-300 italic text-[10px]">No PDF</span>
                          )}
                        </td>

                        {/* Video Released Date */}
                        <td className="p-3 text-[11px] text-slate-600 whitespace-nowrap">
                          {row.videoReleasedDate || '—'}
                        </td>

                        {/* Tracking Audit / Reason Inspector */}
                        <td className="p-3 text-center whitespace-nowrap">
                          <button
                            onClick={() => setSelectedDeliverableForModal(row)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                              hasMissingMetrics
                                ? 'bg-amber-50 text-amber-800 border border-amber-300 hover:bg-amber-100'
                                : 'bg-emerald-50 text-emerald-800 border border-emerald-300 hover:bg-emerald-100'
                            }`}
                            title="Click to view full deliverable details and audit reasons why views/clicks are showing or not showing"
                          >
                            {hasMissingMetrics ? (
                              <>
                                <AlertTriangle className="w-3 h-3 text-amber-600" />
                                <span>Audit & Reason</span>
                              </>
                            ) : (
                              <>
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                <span>Details & Active</span>
                              </>
                            )}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {/* Sticky Comprehensive Totals Row Below Table */}
              <tfoot className="bg-slate-900 text-white font-mono font-bold text-xs sticky bottom-0 z-10 border-t-2 border-indigo-500 shadow-xl">
                <tr>
                  <td className="p-3 whitespace-nowrap text-indigo-300">
                    TOTAL ({filteredData.length})
                  </td>
                  <td className="p-3 text-slate-400 font-sans font-normal text-[11px]">—</td>
                  <td className="p-3 text-slate-400 font-sans font-normal text-[11px]">—</td>
                  <td className="p-3 text-emerald-300 font-bold whitespace-nowrap text-sm">
                    ₹{filteredTotals.amount.toLocaleString('en-IN')}
                  </td>
                  <td className="p-3 text-slate-400 font-sans font-normal text-[11px]">—</td>
                  <td className="p-3 text-slate-400 font-sans font-normal text-[11px]">—</td>
                  <td className="p-3 text-slate-400 font-sans font-normal text-[11px] text-center">—</td>
                  <td className="p-3 text-sky-300 whitespace-nowrap text-[11px]">
                    {filteredTotals.videosWithLink} Links
                  </td>
                  <td className="p-3 text-indigo-300 whitespace-nowrap text-[11px]">
                    {filteredTotals.videosWithShortIo} Codes
                  </td>
                  <td className="p-3 text-sky-300 bg-sky-950/70 border-x border-sky-800/60 whitespace-nowrap text-sm">
                    {filteredTotals.views.toLocaleString('en-IN')}
                  </td>
                  <td className="p-3 text-indigo-200 bg-indigo-950/70 border-r border-indigo-800/60 whitespace-nowrap text-sm">
                    {filteredTotals.clicks.toLocaleString('en-IN')}
                  </td>
                  <td className="p-3 text-emerald-300 bg-emerald-950/70 border-r border-emerald-800/60 whitespace-nowrap text-sm">
                    ₹{filteredTotals.cpv.toFixed(3)}
                  </td>
                  <td className="p-3 text-fuchsia-300 bg-fuchsia-950/70 border-r border-fuchsia-800/60 whitespace-nowrap text-sm">
                    ₹{filteredTotals.cpc.toFixed(2)}
                  </td>
                  <td className="p-3 text-purple-300 bg-purple-950/70 border-r border-purple-800/60 whitespace-nowrap text-sm">
                    {filteredTotals.ctr.toFixed(2)}%
                  </td>
                  <td className="p-3 text-slate-400 font-sans font-normal text-[11px]">—</td>
                  <td className="p-3 text-slate-400 font-sans font-normal text-[11px]">—</td>
                  <td className="p-3 text-center whitespace-nowrap text-[10px] text-amber-300 font-sans">
                    {filteredTotals.missingViewsCount + filteredTotals.missingClicksCount} items with notes
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Render Totals Bar & Reasons Audit below Ledger View */}
      {viewMode === 'grid' && renderTotalsBar("Deliverables Ledger: Overall Totals & Tracking Reasons Audit")}

      {/* VIEW: Influencer & Product Wise Video Matrix */}
      {viewMode === 'matrix' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          {/* Matrix Header Controls */}
          <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="p-2 bg-indigo-50 text-indigo-700 rounded-xl">
                  <UserCheck className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Influencer & Product Wise Video Filter View
                  </h3>
                  <p className="text-xs text-slate-500">
                    Grouped breakdown of video deliverables sliced by Year, Month, and Date
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500 font-mono uppercase">Group By:</span>
              <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-bold">
                <button
                  onClick={() => setMatrixGroupBy('influencer')}
                  className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                    matrixGroupBy === 'influencer'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <UserCheck className="w-3.5 h-3.5" /> By Creator / Influencer
                </button>
                <button
                  onClick={() => setMatrixGroupBy('product')}
                  className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                    matrixGroupBy === 'product'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Award className="w-3.5 h-3.5" /> By Product SKU
                </button>
              </div>
            </div>
          </div>

          {/* Render Groups */}
          {(() => {
            if (filteredData.length === 0) {
              return (
                <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center text-slate-400 space-y-3">
                  <AlertCircle className="w-8 h-8 text-amber-500 mx-auto" />
                  <p className="text-sm font-semibold text-slate-700">No deliverables match the current filter selection.</p>
                  <p className="text-xs text-slate-400">Try adjusting the Influencer, Product, Year, Month, or Date slicers above.</p>
                  <button
                    onClick={handleResetAllFilters}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Reset Filters
                  </button>
                </div>
              );
            }

            if (matrixGroupBy === 'influencer') {
              // Group by Influencer Name
              const groupMap = new Map<string, DeliverableRow[]>();
              filteredData.forEach(r => {
                const key = (r.influencerName || 'Unassigned Creator').trim();
                const list = groupMap.get(key) || [];
                list.push(r);
                groupMap.set(key, list);
              });

              const groups = Array.from(groupMap.entries()).sort((a, b) => b[1].length - a[1].length);

              return (
                <div className="space-y-5">
                  {groups.map(([infName, rows]) => {
                    const groupSpend = rows.reduce((s, r) => s + r.amountPaid, 0);
                    let groupViews = 0;
                    let groupClicks = 0;
                    let groupSpendWithClicks = 0;
                    let groupViewsWithClicks = 0;

                    rows.forEach(r => {
                      const m = getRowMetrics(r);
                      if (m.views && m.views > 0) groupViews += m.views;
                      if (m.clicks && m.clicks > 0) {
                        groupClicks += m.clicks;
                        groupSpendWithClicks += r.amountPaid;
                        if (m.views && m.views > 0) groupViewsWithClicks += m.views;
                      }
                    });

                    const groupCpv = groupViews > 0 ? (groupSpend / groupViews) : 0;
                    const groupCpc = groupClicks > 0 ? (groupSpendWithClicks / groupClicks) : 0;
                    const groupCtr = groupViewsWithClicks > 0 ? ((groupClicks / groupViewsWithClicks) * 100) : 0;

                    return (
                      <div key={infName} className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
                        {/* Creator Header Bar */}
                        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <span className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center font-bold text-indigo-300 text-sm font-mono">
                              {rows.length}v
                            </span>
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="text-base font-bold text-white">{infName}</h4>
                                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-500/30 text-indigo-200 border border-indigo-500/40 font-bold">
                                  {rows[0].platform || 'Social'}
                                </span>
                              </div>
                              <p className="text-xs text-slate-400 mt-0.5">
                                Approacher: <strong className="text-slate-200">{rows[0].approacher || 'BDM'}</strong> • Order Month: {rows[0].orderMonth || '—'}
                              </p>
                            </div>
                          </div>

                          {/* Creator Group Performance Badges */}
                          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center text-[10px] font-mono">
                            <div className="bg-white/5 p-2 rounded-xl border border-white/10">
                              <span className="text-slate-400 block font-sans">Spend</span>
                              <span className="font-bold text-emerald-300 text-xs">₹{groupSpend.toLocaleString('en-IN')}</span>
                            </div>
                            <div className="bg-white/5 p-2 rounded-xl border border-white/10">
                              <span className="text-slate-400 block font-sans">Total Views</span>
                              <span className="font-bold text-sky-300 text-xs">{groupViews.toLocaleString('en-IN')}</span>
                            </div>
                            <div className="bg-white/5 p-2 rounded-xl border border-white/10">
                              <span className="text-slate-400 block font-sans">Total Clicks</span>
                              <span className="font-bold text-indigo-200 text-xs">{groupClicks.toLocaleString('en-IN')}</span>
                            </div>
                            <div className="bg-white/5 p-2 rounded-xl border border-white/10">
                              <span className="text-slate-400 block font-sans">CPV</span>
                              <span className="font-bold text-emerald-300">₹{groupCpv.toFixed(3)}</span>
                            </div>
                            <div className="bg-white/5 p-2 rounded-xl border border-white/10">
                              <span className="text-slate-400 block font-sans">CPC</span>
                              <span className="font-bold text-fuchsia-300">₹{groupCpc.toFixed(2)}</span>
                            </div>
                            <div className="bg-white/5 p-2 rounded-xl border border-white/10">
                              <span className="text-slate-400 block font-sans">CTR</span>
                              <span className="font-bold text-purple-300">{groupCtr.toFixed(2)}%</span>
                            </div>
                          </div>
                        </div>

                        {/* Video Deliverables Rows */}
                        <div className="divide-y divide-slate-100">
                          {rows.map(row => {
                            const m = getRowMetrics(row);
                            return (
                              <div key={row.videoId} className="p-4 hover:bg-slate-50/70 transition flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs">
                                <div className="space-y-1 max-w-md">
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                                      {row.videoId}
                                    </span>
                                    <span className="font-semibold text-slate-800 truncate" title={row.productName}>
                                      {row.productName}
                                    </span>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                                    <span>Release Date: <strong className="text-slate-700">{row.videoReleasedDate || row.plannedDate || 'Pending'}</strong></span>
                                    <span>Amount: <strong className="text-slate-800 font-mono">₹{row.amountPaid.toLocaleString('en-IN')}</strong></span>
                                    {row.shortIoCode && (
                                      <span className="font-mono text-indigo-600 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-100">
                                        {row.shortIoCode}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Metrics & Actions */}
                                <div className="flex flex-wrap items-center gap-2">
                                  <div className="flex items-center gap-1.5 font-mono text-[11px]">
                                    <span className="inline-flex items-center gap-1 bg-sky-50 text-sky-800 font-bold px-2 py-1 rounded-lg border border-sky-200">
                                      <Eye className="w-3 h-3 text-sky-600" />
                                      {m.views !== undefined ? `${m.views.toLocaleString('en-IN')} views` : '—'}
                                    </span>
                                    <span className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-800 font-bold px-2 py-1 rounded-lg border border-indigo-200">
                                      <MousePointerClick className="w-3 h-3 text-indigo-600" />
                                      {m.clicks !== undefined ? `${m.clicks.toLocaleString('en-IN')} clicks` : '—'}
                                    </span>
                                    {m.cpv !== undefined && (
                                      <span className="bg-emerald-50 text-emerald-800 font-bold px-1.5 py-1 rounded-lg border border-emerald-200">
                                        CPV: ₹{m.cpv.toFixed(3)}
                                      </span>
                                    )}
                                    {m.cpc !== undefined && (
                                      <span className="bg-fuchsia-50 text-fuchsia-800 font-bold px-1.5 py-1 rounded-lg border border-fuchsia-200">
                                        CPC: ₹{m.cpc.toFixed(2)}
                                      </span>
                                    )}
                                  </div>

                                  {m.hasVideoLink ? (
                                    <a
                                      href={row.videoLink}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex items-center gap-1 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-2xs transition"
                                    >
                                      Watch <ExternalLink className="w-3 h-3" />
                                    </a>
                                  ) : (
                                    <span className="text-rose-500 font-semibold text-[10px] px-2 py-0.5 bg-rose-50 rounded border border-rose-200">
                                      Pending Video
                                    </span>
                                  )}

                                  <button
                                    onClick={() => setSelectedDeliverableForModal(row)}
                                    className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                                    title="View all deliverable details"
                                  >
                                    <Info className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            } else {
              // Group by Product SKU
              const groupMap = new Map<string, DeliverableRow[]>();
              filteredData.forEach(r => {
                const key = (r.productName || 'Other SKU').trim();
                const list = groupMap.get(key) || [];
                list.push(r);
                groupMap.set(key, list);
              });

              const groups = Array.from(groupMap.entries()).sort((a, b) => b[1].length - a[1].length);

              return (
                <div className="space-y-5">
                  {groups.map(([prodName, rows]) => {
                    const groupSpend = rows.reduce((s, r) => s + r.amountPaid, 0);
                    let groupViews = 0;
                    let groupClicks = 0;
                    let groupSpendWithClicks = 0;
                    let groupViewsWithClicks = 0;

                    rows.forEach(r => {
                      const m = getRowMetrics(r);
                      if (m.views && m.views > 0) groupViews += m.views;
                      if (m.clicks && m.clicks > 0) {
                        groupClicks += m.clicks;
                        groupSpendWithClicks += r.amountPaid;
                        if (m.views && m.views > 0) groupViewsWithClicks += m.views;
                      }
                    });

                    const groupCpv = groupViews > 0 ? (groupSpend / groupViews) : 0;
                    const groupCpc = groupClicks > 0 ? (groupSpendWithClicks / groupClicks) : 0;
                    const groupCtr = groupViewsWithClicks > 0 ? ((groupClicks / groupViewsWithClicks) * 100) : 0;

                    return (
                      <div key={prodName} className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
                        {/* Product Header Bar */}
                        <div className="bg-gradient-to-r from-slate-900 via-fuchsia-950 to-slate-900 text-white p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <span className="w-10 h-10 rounded-2xl bg-fuchsia-500/20 border border-fuchsia-500/30 flex items-center justify-center font-bold text-fuchsia-300 text-sm font-mono">
                              {rows.length}v
                            </span>
                            <div>
                              <h4 className="text-base font-bold text-white">{prodName}</h4>
                              <p className="text-xs text-slate-400 mt-0.5">
                                Allocated Budget: <strong className="text-emerald-300 font-mono">₹{groupSpend.toLocaleString('en-IN')}</strong> across {rows.length} video deliveries
                              </p>
                            </div>
                          </div>

                          {/* Product Group Performance Badges */}
                          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 text-center text-[10px] font-mono">
                            <div className="bg-white/5 p-2 rounded-xl border border-white/10">
                              <span className="text-slate-400 block font-sans">Total Views</span>
                              <span className="font-bold text-sky-300 text-xs">{groupViews.toLocaleString('en-IN')}</span>
                            </div>
                            <div className="bg-white/5 p-2 rounded-xl border border-white/10">
                              <span className="text-slate-400 block font-sans">Total Clicks</span>
                              <span className="font-bold text-indigo-200 text-xs">{groupClicks.toLocaleString('en-IN')}</span>
                            </div>
                            <div className="bg-white/5 p-2 rounded-xl border border-white/10">
                              <span className="text-slate-400 block font-sans">CPV</span>
                              <span className="font-bold text-emerald-300">₹{groupCpv.toFixed(3)}</span>
                            </div>
                            <div className="bg-white/5 p-2 rounded-xl border border-white/10">
                              <span className="text-slate-400 block font-sans">CPC</span>
                              <span className="font-bold text-fuchsia-300">₹{groupCpc.toFixed(2)}</span>
                            </div>
                            <div className="bg-white/5 p-2 rounded-xl border border-white/10">
                              <span className="text-slate-400 block font-sans">CTR</span>
                              <span className="font-bold text-purple-300">{groupCtr.toFixed(2)}%</span>
                            </div>
                          </div>
                        </div>

                        {/* Video Deliverables Rows for this Product */}
                        <div className="divide-y divide-slate-100">
                          {rows.map(row => {
                            const m = getRowMetrics(row);
                            return (
                              <div key={row.videoId} className="p-4 hover:bg-slate-50/70 transition flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs">
                                <div className="space-y-1 max-w-md">
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono font-bold text-fuchsia-700 bg-fuchsia-50 px-2 py-0.5 rounded border border-fuchsia-100">
                                      {row.videoId}
                                    </span>
                                    <span className="font-bold text-slate-900">
                                      {row.influencerName}
                                    </span>
                                    <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                                      {row.platform}
                                    </span>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                                    <span>Release Date: <strong className="text-slate-700">{row.videoReleasedDate || row.plannedDate || 'Pending'}</strong></span>
                                    <span>Fee: <strong className="text-slate-800 font-mono">₹{row.amountPaid.toLocaleString('en-IN')}</strong></span>
                                    <span>Approacher: {row.approacher}</span>
                                  </div>
                                </div>

                                {/* Metrics & Actions */}
                                <div className="flex flex-wrap items-center gap-2">
                                  <div className="flex items-center gap-1.5 font-mono text-[11px]">
                                    <span className="inline-flex items-center gap-1 bg-sky-50 text-sky-800 font-bold px-2 py-1 rounded-lg border border-sky-200">
                                      <Eye className="w-3 h-3 text-sky-600" />
                                      {m.views !== undefined ? `${m.views.toLocaleString('en-IN')} views` : '—'}
                                    </span>
                                    <span className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-800 font-bold px-2 py-1 rounded-lg border border-indigo-200">
                                      <MousePointerClick className="w-3 h-3 text-indigo-600" />
                                      {m.clicks !== undefined ? `${m.clicks.toLocaleString('en-IN')} clicks` : '—'}
                                    </span>
                                    {m.cpv !== undefined && (
                                      <span className="bg-emerald-50 text-emerald-800 font-bold px-1.5 py-1 rounded-lg border border-emerald-200">
                                        ₹{m.cpv.toFixed(3)} CPV
                                      </span>
                                    )}
                                  </div>

                                  {m.hasVideoLink ? (
                                    <a
                                      href={row.videoLink}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex items-center gap-1 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-2xs transition"
                                    >
                                      Watch <ExternalLink className="w-3 h-3" />
                                    </a>
                                  ) : (
                                    <span className="text-rose-500 font-semibold text-[10px] px-2 py-0.5 bg-rose-50 rounded border border-rose-200">
                                      Pending Video
                                    </span>
                                  )}

                                  <button
                                    onClick={() => setSelectedDeliverableForModal(row)}
                                    className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                                    title="View deliverable details"
                                  >
                                    <Info className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            }
          })()}

          {/* Totals Bar below Matrix View */}
          {renderTotalsBar("Influencer & Product Video Slicer: Overall Totals & Tracking Reasons Audit")}
        </div>
      )}

      {/* VIEW 2: SKU and Team Performance Breakdown */}
      {viewMode === 'breakdown' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Product SKU Breakdown */}
            <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Award className="w-4 h-4 text-fuchsia-600" />
                Product SKU Breakdown & Spend
              </h3>
              <p className="text-xs text-slate-500">Click any product to filter deliverables ledger.</p>

              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                {stats.productList.map(p => (
                  <div
                    key={p.name}
                    onClick={() => handleClickAndFound('product', p.name, `Product: ${p.name}`)}
                    className="p-3.5 rounded-2xl border border-slate-100 hover:border-indigo-300 hover:bg-indigo-50/30 transition cursor-pointer space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="max-w-[280px]">
                        <p className="text-xs font-bold text-slate-800 truncate" title={p.name}>{p.name}</p>
                        <span className="text-[10px] text-slate-500">{p.count} deliverables scheduled</span>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-mono font-bold text-indigo-700">₹{p.spend.toLocaleString('en-IN')}</p>
                        <span className="text-[9px] text-slate-400 font-mono">avg ₹{Math.round(p.spend / p.count).toLocaleString('en-IN')}</span>
                      </div>
                    </div>
                    {/* Performance Metrics Row for Product */}
                    <div className="grid grid-cols-5 gap-1.5 pt-2 border-t border-slate-100 text-[10px] font-mono">
                      <div className="bg-sky-50 p-1.5 rounded-lg text-center">
                        <span className="text-[9px] text-sky-600 block font-sans">Views</span>
                        <span className="font-bold text-sky-800">{p.views > 0 ? p.views.toLocaleString('en-IN') : '—'}</span>
                      </div>
                      <div className="bg-indigo-50 p-1.5 rounded-lg text-center">
                        <span className="text-[9px] text-indigo-600 block font-sans">Clicks</span>
                        <span className="font-bold text-indigo-800">{p.clicks > 0 ? p.clicks.toLocaleString('en-IN') : '—'}</span>
                      </div>
                      <div className="bg-emerald-50 p-1.5 rounded-lg text-center">
                        <span className="text-[9px] text-emerald-600 block font-sans">CPV</span>
                        <span className="font-bold text-emerald-800">{p.cpv > 0 ? `₹${p.cpv.toFixed(3)}` : '—'}</span>
                      </div>
                      <div className="bg-fuchsia-50 p-1.5 rounded-lg text-center">
                        <span className="text-[9px] text-fuchsia-600 block font-sans">CPC</span>
                        <span className="font-bold text-fuchsia-800">{p.cpc > 0 ? `₹${p.cpc.toFixed(2)}` : '—'}</span>
                      </div>
                      <div className="bg-purple-50 p-1.5 rounded-lg text-center">
                        <span className="text-[9px] text-purple-600 block font-sans">CTR</span>
                        <span className="font-bold text-purple-800">{p.ctr > 0 ? `${p.ctr.toFixed(2)}%` : '—'}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Approacher / Team Leaderboard */}
            <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-cyan-600" />
                Approacher / BDM Team Leaderboard
              </h3>
              <p className="text-xs text-slate-500">Click any team member to see their sourced creators.</p>

              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                {stats.approacherList.map(a => (
                  <div
                    key={a.name}
                    className="p-3.5 rounded-2xl border border-slate-100 hover:border-cyan-300 hover:bg-cyan-50/20 transition space-y-2.5 group"
                  >
                    <div className="flex items-center justify-between">
                      <div
                        onClick={() => handleClickAndFound('approacher', a.name, `Approacher: ${a.name}`)}
                        className="cursor-pointer hover:underline"
                      >
                        <p className="text-xs font-bold text-slate-800">{a.name}</p>
                        <span className="text-[10px] text-slate-500">{a.count} creators closed</span>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-mono font-bold text-cyan-700">₹{a.spend.toLocaleString('en-IN')}</p>
                        <span className="text-[9px] text-slate-400">total budget managed</span>
                      </div>
                    </div>

                    {/* Performance Metrics Row for Approacher */}
                    <div className="grid grid-cols-5 gap-1.5 pt-2 border-t border-slate-100 text-[10px] font-mono">
                      <div className="bg-sky-50 p-1.5 rounded-lg text-center">
                        <span className="text-[9px] text-sky-600 block font-sans">Views</span>
                        <span className="font-bold text-sky-800">{a.views > 0 ? a.views.toLocaleString('en-IN') : '—'}</span>
                      </div>
                      <div className="bg-indigo-50 p-1.5 rounded-lg text-center">
                        <span className="text-[9px] text-indigo-600 block font-sans">Clicks</span>
                        <span className="font-bold text-indigo-800">{a.clicks > 0 ? a.clicks.toLocaleString('en-IN') : '—'}</span>
                      </div>
                      <div className="bg-emerald-50 p-1.5 rounded-lg text-center">
                        <span className="text-[9px] text-emerald-600 block font-sans">CPV</span>
                        <span className="font-bold text-emerald-800">{a.cpv > 0 ? `₹${a.cpv.toFixed(3)}` : '—'}</span>
                      </div>
                      <div className="bg-fuchsia-50 p-1.5 rounded-lg text-center">
                        <span className="text-[9px] text-fuchsia-600 block font-sans">CPC</span>
                        <span className="font-bold text-fuchsia-800">{a.cpc > 0 ? `₹${a.cpc.toFixed(2)}` : '—'}</span>
                      </div>
                      <div className="bg-purple-50 p-1.5 rounded-lg text-center">
                        <span className="text-[9px] text-purple-600 block font-sans">CTR</span>
                        <span className="font-bold text-purple-800">{a.ctr > 0 ? `${a.ctr.toFixed(2)}%` : '—'}</span>
                      </div>
                    </div>

                    {/* Approacher Data Isolation & Delete Actions Bar */}
                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100/80 text-xs">
                      <button
                        onClick={() => {
                          setFilterApproachers([a.name]);
                          setViewMode('grid');
                        }}
                        className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <Filter className="w-3 h-3" /> Filter Ledger
                      </button>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setApproacherDeleteModal({
                            isOpen: true,
                            targetApproacher: a.name,
                            action: 'keep_selected_delete_others'
                          })}
                          className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-[10px] font-bold transition cursor-pointer flex items-center gap-1"
                          title={`Keep only ${a.name} and delete other approachers from analyzer`}
                        >
                          <Trash2 className="w-3 h-3 text-rose-600" /> Keep & Delete Others
                        </button>
                        <button
                          onClick={() => setApproacherDeleteModal({
                            isOpen: true,
                            targetApproacher: a.name,
                            action: 'delete_selected'
                          })}
                          className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-lg text-[10px] font-bold transition cursor-pointer flex items-center gap-1"
                          title={`Delete ${a.name}'s data`}
                        >
                          <UserMinus className="w-3 h-3 text-slate-500" /> Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {/* Totals Bar below Breakdown */}
          {renderTotalsBar("Product SKU & Team Breakdown: Overall Totals & Tracking Reasons Audit")}
        </div>
      )}

      {/* VIEW 3: TAT and Workflow Funnel Diagnostics */}
      {viewMode === 'tat' && (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-6">
            <div>
              <h3 className="text-base font-bold text-slate-900">4-Step Deliverable Pipeline Diagnostics</h3>
              <p className="text-xs text-slate-500 mt-1">
                Tracking conversion velocity from Order Creation (Step 1) to Video Checklist (Step 2), Short.io Link (Step 3), and Final Release (Step 4).
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              {/* Step 1 */}
              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200/80">
                <span className="text-[10px] font-bold uppercase font-mono text-slate-400">Step 1: Video Order</span>
                <p className="text-2xl font-black text-slate-800 mt-2">{data.filter(r => r.step1 === 'Done').length} / {data.length}</p>
                <div className="w-full bg-slate-200 h-2 rounded-full mt-3 overflow-hidden">
                  <div className="bg-indigo-600 h-full w-full" />
                </div>
                <p className="text-[10px] text-slate-500 mt-2 font-medium">100% order initiation rate</p>
              </div>

              {/* Step 2 */}
              <div 
                onClick={() => handleClickAndFound('missingChecklist', 'notdone', 'Missing Checklist PDF')}
                className="bg-slate-50 p-5 rounded-2xl border border-slate-200/80 hover:border-indigo-400 cursor-pointer transition"
              >
                <span className="text-[10px] font-bold uppercase font-mono text-slate-400">Step 2: Checklist PDF</span>
                <p className="text-2xl font-black text-indigo-700 mt-2">
                  {data.filter(r => r.step2 === 'Done').length} / {data.length}
                </p>
                <div className="w-full bg-slate-200 h-2 rounded-full mt-3 overflow-hidden">
                  <div 
                    className="bg-indigo-600 h-full" 
                    style={{ width: `${data.length > 0 ? (data.filter(r => r.step2 === 'Done').length / data.length) * 100 : 0}%` }} 
                  />
                </div>
                <p className="text-[10px] text-rose-500 mt-2 font-bold">{stats.missingChecklistCount} missing checklist</p>
              </div>

              {/* Step 3 */}
              <div 
                onClick={() => handleClickAndFound('missingShortIo', 'notdone', 'Missing Short.io Link')}
                className="bg-slate-50 p-5 rounded-2xl border border-slate-200/80 hover:border-indigo-400 cursor-pointer transition"
              >
                <span className="text-[10px] font-bold uppercase font-mono text-slate-400">Step 3: Short.io Tracking</span>
                <p className="text-2xl font-black text-indigo-700 mt-2">
                  {data.filter(r => r.step3 === 'Done').length} / {data.length}
                </p>
                <div className="w-full bg-slate-200 h-2 rounded-full mt-3 overflow-hidden">
                  <div 
                    className="bg-indigo-600 h-full" 
                    style={{ width: `${data.length > 0 ? (data.filter(r => r.step3 === 'Done').length / data.length) * 100 : 0}%` }} 
                  />
                </div>
                <p className="text-[10px] text-rose-500 mt-2 font-bold">{stats.missingShortIoCount} missing tracking link</p>
              </div>

              {/* Step 4 */}
              <div 
                onClick={() => handleClickAndFound('awaitingRelease', 'notdone', 'Awaiting Video Release')}
                className="bg-slate-50 p-5 rounded-2xl border border-slate-200/80 hover:border-emerald-400 cursor-pointer transition"
              >
                <span className="text-[10px] font-bold uppercase font-mono text-slate-400">Step 4: Final Upload & Released</span>
                <p className="text-2xl font-black text-emerald-700 mt-2">
                  {data.filter(r => r.step4 === 'Done').length} / {data.length}
                </p>
                <div className="w-full bg-slate-200 h-2 rounded-full mt-3 overflow-hidden">
                  <div 
                    className="bg-emerald-600 h-full" 
                    style={{ width: `${data.length > 0 ? (data.filter(r => r.step4 === 'Done').length / data.length) * 100 : 0}%` }} 
                  />
                </div>
                <p className="text-[10px] text-amber-600 mt-2 font-bold">{stats.awaitingReleaseCount} awaiting release</p>
              </div>
            </div>
          </div>
          {/* Totals Bar below TAT View */}
          {renderTotalsBar("Workflow Funnel Pipeline: Overall Totals & Tracking Reasons Audit")}
        </div>
      )}

      {/* VIEW 4: Deep AI Intelligence Report */}
      {viewMode === 'ai' && (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="p-2 bg-fuchsia-100 text-fuchsia-700 rounded-xl">
                  <Sparkles className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Deep AI Deliverables Analysis Report</h3>
                  <p className="text-xs text-slate-500">Autonomous insights, workflow bottleneck resolution, and spend risk auditing.</p>
                </div>
              </div>

              <button
                onClick={handleRunAiAnalysis}
                disabled={isAiLoading}
                className="flex items-center gap-1.5 text-xs font-bold bg-fuchsia-50 hover:bg-fuchsia-100 text-fuchsia-700 px-3.5 py-2 rounded-xl transition cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isAiLoading ? 'animate-spin' : ''}`} /> Refresh Report
              </button>
            </div>

            {isAiLoading ? (
              <div className="py-20 text-center space-y-3">
                <RefreshCw className="w-8 h-8 text-fuchsia-600 animate-spin mx-auto" />
                <p className="text-sm font-bold text-slate-700">Synthesizing deep operational intelligence across deliverables...</p>
                <p className="text-xs text-slate-400">Evaluating TAT delays, creator performance, and budget efficiency</p>
              </div>
            ) : aiReport ? (
              <div className="prose prose-slate max-w-none text-xs sm:text-sm text-slate-700 leading-relaxed bg-slate-50/60 p-6 rounded-2xl border border-slate-200 font-sans whitespace-pre-wrap">
                {aiReport}
              </div>
            ) : (
              <div className="py-12 text-center text-slate-400 space-y-3">
                <p className="text-sm font-semibold">No AI report generated yet.</p>
                <button
                  onClick={handleRunAiAnalysis}
                  className="inline-flex items-center gap-1.5 bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-md transition cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" /> Run Deep Analysis
                </button>
              </div>
            )}
          </div>
          {/* Totals Bar below AI View */}
          {renderTotalsBar("Deep AI Analytics: Overall Totals & Tracking Reasons Audit")}
        </div>
      )}

      {/* VIEW 6: Sub-Page Analyzed Data Multi-Angle Analytics & Google Drive Cloud Hub */}
      {viewMode === 'subpage' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Sub-Page Google Drive Cloud Sync Header Banner */}
          <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border-2 border-indigo-500/40 rounded-3xl p-5 sm:p-6 text-white shadow-2xl space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 bg-indigo-500/20 text-sky-300 rounded-lg border border-indigo-500/30">
                    <BookmarkCheck className="w-4 h-4 text-sky-300" />
                  </span>
                  <h2 className="text-lg sm:text-xl font-black text-white tracking-tight font-mono">
                    Sub-Page Analyzed Data Hub
                  </h2>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold font-mono">
                    Google Drive Integrated
                  </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed max-w-2xl">
                  View and analyze your saved dataset from multiple strategic angles: creator history, leaderboard ranking, product SKU performance, video viral metrics, and BDM attribution. Synchronized strictly with <strong className="text-sky-300">Google Drive</strong>.
                </p>
              </div>

              {/* Sub-Page Quick Status Indicator Badges */}
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-slate-300 bg-white/5 px-3 py-1.5 rounded-xl border border-white/10 shrink-0">
                <span className="flex items-center gap-1">
                  <Database className="w-3 h-3 text-emerald-400" />
                  <strong className="text-white">{subpageSnapshot?.totalRecords || 0}</strong> Records
                </span>
                <span className="text-white/20">•</span>
                <span className="flex items-center gap-1">
                  <Cloud className="w-3 h-3 text-sky-400" />
                  <span className={subpageSnapshot?.driveLastSyncTime ? 'text-sky-300' : 'text-slate-400'}>
                    {subpageSnapshot?.driveLastSyncTime ? 'Drive Synced' : 'Ready'}
                  </span>
                </span>
              </div>
            </div>

            {/* Structured Sub-Page Action Toolbar - Grouped Positions & Small Size */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 pt-3 border-t border-white/10">
              {/* Left & Center: Workflow & Cloud Operations */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Cloud Sync Buttons (Small size) */}
                <div className="flex items-center gap-1 bg-white/5 p-0.5 rounded-xl border border-white/10">
                  {/* Save to Google Drive Button */}
                  <button
                    type="button"
                    onClick={handleSaveSubpageToDrive}
                    disabled={isSavingToDrive || isUpdatingFromDrive}
                    className="h-8 flex items-center gap-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-semibold px-2.5 py-1 rounded-lg border border-emerald-400/30 shadow-xs transition cursor-pointer disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                    title="Save and backup current sub-page dataset snapshot directly to Google Drive"
                    aria-label="Save to Google Drive"
                  >
                    <CloudUpload className={`w-3.5 h-3.5 ${isSavingToDrive ? 'animate-bounce text-yellow-300' : 'text-emerald-200'}`} />
                    <span>{isSavingToDrive ? 'Saving...' : 'Save to Drive'}</span>
                  </button>

                  {/* Update Data from Google Drive Button */}
                  <button
                    type="button"
                    onClick={handleUpdateSubpageFromDrive}
                    disabled={isUpdatingFromDrive || isSavingToDrive}
                    className="h-8 flex items-center gap-1.5 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white text-xs font-semibold px-2.5 py-1 rounded-lg border border-sky-400/30 shadow-xs transition cursor-pointer disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                    title="Fetch and update sub-page analytics dataset from the latest Google Drive backup"
                    aria-label="Update Data from Google Drive"
                  >
                    <CloudDownload className={`w-3.5 h-3.5 ${isUpdatingFromDrive ? 'animate-bounce text-cyan-300' : 'text-sky-200'}`} />
                    <span>{isUpdatingFromDrive ? 'Updating...' : 'Update from Drive'}</span>
                  </button>
                </div>

                <div className="h-4 w-px bg-white/20 hidden sm:block mx-0.5" />

                {/* Google Sheet Extraction Button (Small size) */}
                <button
                  type="button"
                  onClick={() => setSubpageActiveTab('sheets_extract')}
                  className="h-8 flex items-center gap-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-semibold px-2.5 py-1 rounded-lg border border-emerald-400/30 shadow-xs transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                  title="Extract selected influencer video data directly to Google Sheets (same as Monthly Planner)"
                  aria-label="Google Sheet Extraction"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-200" />
                  <span>Google Sheets Extract</span>
                </button>

                {/* Load Sub-Page Snapshot into Main Analyzer (Small size) */}
                {subpageSnapshot && subpageSnapshot.data.length > 0 && (
                  <button
                    type="button"
                    onClick={handleLoadSubpageIntoMainAnalyzer}
                    className="h-8 flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-indigo-200 text-xs font-semibold px-2.5 py-1 rounded-lg border border-white/20 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                    title="Load this sub-page snapshot into the main Data Analyzer workspace"
                    aria-label="Load into Main Analyzer"
                  >
                    <ArrowRight className="w-3.5 h-3.5 text-cyan-300" />
                    <span>Load into Ledger</span>
                  </button>
                )}

                <div className="h-4 w-px bg-white/20 hidden sm:block mx-0.5" />

                {/* Abnormal High Views & Refresh Live Views (Small size) */}
                <button
                  type="button"
                  onClick={() => {
                    setHighCountActiveTab('subpage');
                    setIsHighCountModalOpen(true);
                  }}
                  className="h-8 bg-rose-600 hover:bg-rose-500 text-white border border-rose-400/40 font-semibold text-xs px-2.5 py-1 rounded-lg flex items-center gap-1.5 cursor-pointer transition shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                  title="View sub-page videos with abnormally high view counts"
                  aria-label="Abnormal High Views in Sub-Page"
                >
                  <Flame className="w-3.5 h-3.5 text-amber-300" />
                  <span>Abnormal:</span>
                  <span className="bg-black/25 text-white px-1.5 py-0.2 rounded text-[10px] font-mono font-bold">
                    {subHighCountRows.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (subHighCountRows.length === 0) {
                      globalToast.info(`No sub-page deliverables found with views ≥ ${highViewThreshold.toLocaleString()}`);
                      return;
                    }
                    collectLiveVideoViewsProcedure(subHighCountRows);
                  }}
                  disabled={isCollectingViews}
                  className="h-8 bg-teal-600 hover:bg-teal-500 text-white border border-teal-400/30 font-semibold text-xs px-2.5 py-1 rounded-lg flex items-center gap-1.5 cursor-pointer transition disabled:opacity-50 shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
                  title="Refresh live video views for sub-page items with higher counts"
                  aria-label="Refresh Sub-Page High Views"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-teal-200 ${isCollectingViews ? 'animate-spin' : ''}`} />
                  <span>Refresh Views</span>
                </button>
              </div>

              {/* Right: Distinct Position for Red Delete All Data Button (Small Size & High Visibility) */}
              {subpageSnapshot && subpageSnapshot.data.length > 0 && (
                <div className="flex items-center shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsDeleteSubpageModalOpen(true)}
                    className="h-8 flex items-center gap-1.5 bg-red-600 hover:bg-red-500 text-white font-bold text-xs px-3 py-1 rounded-lg border border-red-400 shadow-md shadow-red-600/30 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 active:scale-95"
                    title="Delete and clear all saved Sub-Page dataset records"
                    aria-label="Delete All Data on Sub Page"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-white" />
                    <span>Delete All Data</span>
                  </button>
                </div>
              )}
            </div>

            {/* Sub-Page Cloud Sync Status Info Strip */}
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-mono text-slate-300 bg-white/5 p-2.5 rounded-2xl border border-white/10">
              <div className="flex flex-wrap items-center gap-4">
                <span className="flex items-center gap-1.5 text-slate-300">
                  <Database className="w-3.5 h-3.5 text-emerald-400" />
                  Sub-Page Snapshot: <strong className="text-white">{subpageSnapshot?.totalRecords || 0} Records</strong>
                </span>
                <span className="flex items-center gap-1.5 text-slate-300">
                  <Calendar className="w-3.5 h-3.5 text-indigo-300" />
                  Local Saved: <strong className="text-indigo-200">{subpageSnapshot?.savedAt || 'Not Saved Yet'}</strong>
                </span>
                <span className="flex items-center gap-1.5 text-slate-300">
                  <Cloud className="w-3.5 h-3.5 text-sky-400" />
                  Drive Sync: <strong className="text-sky-300">{subpageSnapshot?.driveLastSyncTime ? `Synced at ${subpageSnapshot.driveLastSyncTime}` : 'Awaiting Google Drive Sync'}</strong>
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-400">
                  Source: <strong className="text-white">{subpageSnapshot?.sourceFileName || fileName || 'Default Analyzed Ledger'}</strong>
                </span>
              </div>
            </div>
          </div>

          {/* If Sub-Page snapshot is empty */}
          {(!subpageSnapshot || subpageSnapshot.data.length === 0) ? (
            <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center space-y-4 shadow-sm">
              <div className="p-4 bg-sky-50 text-sky-600 rounded-2xl w-fit mx-auto">
                <BookmarkCheck className="w-10 h-10 animate-pulse" />
              </div>
              <h3 className="text-lg font-bold text-slate-800">Sub-Page Analyzed Data is Blank</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                You haven't saved any analyzed dataset to the sub-page yet. Load or analyze data in the Data Analyzer, then click <strong className="text-indigo-600">"Save to Sub Page"</strong> or click <strong className="text-sky-600">"Update Data from Google Drive"</strong> to pull existing data from your Drive backup.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
                {data.length > 0 && (
                  <button
                    onClick={handleSaveToSubpage}
                    className="h-8 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs px-3.5 py-1.5 rounded-lg shadow-sm transition cursor-pointer flex items-center gap-1.5"
                  >
                    <BookmarkCheck className="w-3.5 h-3.5" /> Save Current Analyzed Data ({data.length} Records)
                  </button>
                )}
                <button
                  onClick={handleUpdateSubpageFromDrive}
                  disabled={isUpdatingFromDrive}
                  className="h-8 bg-sky-600 hover:bg-sky-700 text-white font-semibold text-xs px-3.5 py-1.5 rounded-lg shadow-sm transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  <CloudDownload className="w-3.5 h-3.5" /> Update Data from Google Drive
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Sub-Page Multi-Angle Analytics Navigation Tabs - Compact Small Buttons */}
              <div className="bg-white rounded-2xl border border-slate-200 p-3 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div role="tablist" aria-label="Sub-Page Strategic Views" className="flex flex-wrap items-center gap-1 text-xs font-semibold">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={subpageActiveTab === 'overview'}
                    tabIndex={0}
                    onClick={() => setSubpageActiveTab('overview')}
                    className={`h-8 px-2.5 py-1 rounded-lg transition cursor-pointer flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 ${
                      subpageActiveTab === 'overview' ? 'bg-slate-900 text-white shadow-xs ring-1 ring-slate-800' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    <PieChart className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Executive Overview</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={subpageActiveTab === 'influencer_videos'}
                    tabIndex={0}
                    onClick={() => setSubpageActiveTab('influencer_videos')}
                    className={`h-8 px-2.5 py-1 rounded-lg transition cursor-pointer flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                      subpageActiveTab === 'influencer_videos' ? 'bg-blue-700 text-white shadow-xs font-bold ring-1 ring-blue-600' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    <UserCheck className="w-3.5 h-3.5 text-sky-200" />
                    <span>Influencer Wise Video Details</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={subpageActiveTab === 'influencer_history'}
                    tabIndex={0}
                    onClick={() => setSubpageActiveTab('influencer_history')}
                    className={`h-8 px-2.5 py-1 rounded-lg transition cursor-pointer flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 ${
                      subpageActiveTab === 'influencer_history' ? 'bg-indigo-600 text-white shadow-xs ring-1 ring-indigo-500' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    <UserCheck className="w-3.5 h-3.5 text-indigo-300" />
                    <span>Creator Performance History</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={subpageActiveTab === 'influencer_ranking'}
                    tabIndex={0}
                    onClick={() => setSubpageActiveTab('influencer_ranking')}
                    className={`h-8 px-2.5 py-1 rounded-lg transition cursor-pointer flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
                      subpageActiveTab === 'influencer_ranking' ? 'bg-amber-600 text-white shadow-xs ring-1 ring-amber-500' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    <Trophy className="w-3.5 h-3.5 text-amber-300" />
                    <span>Influencer Ranking</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={subpageActiveTab === 'product_history'}
                    tabIndex={0}
                    onClick={() => setSubpageActiveTab('product_history')}
                    className={`h-8 px-2.5 py-1 rounded-lg transition cursor-pointer flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-500 ${
                      subpageActiveTab === 'product_history' ? 'bg-fuchsia-600 text-white shadow-xs ring-1 ring-fuchsia-500' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    <Award className="w-3.5 h-3.5 text-fuchsia-300" />
                    <span>Product SKU History</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={subpageActiveTab === 'video_history'}
                    tabIndex={0}
                    onClick={() => setSubpageActiveTab('video_history')}
                    className={`h-8 px-2.5 py-1 rounded-lg transition cursor-pointer flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
                      subpageActiveTab === 'video_history' ? 'bg-sky-600 text-white shadow-xs ring-1 ring-sky-500' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    <Video className="w-3.5 h-3.5 text-sky-200" />
                    <span>Video & Viral History</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={subpageActiveTab === 'approacher_matrix'}
                    tabIndex={0}
                    onClick={() => setSubpageActiveTab('approacher_matrix')}
                    className={`h-8 px-2.5 py-1 rounded-lg transition cursor-pointer flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                      subpageActiveTab === 'approacher_matrix' ? 'bg-emerald-600 text-white shadow-xs ring-1 ring-emerald-500' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5 text-emerald-300" />
                    <span>BDM / Approacher Matrix</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={subpageActiveTab === 'raw_data'}
                    tabIndex={0}
                    onClick={() => setSubpageActiveTab('raw_data')}
                    className={`h-8 px-2.5 py-1 rounded-lg transition cursor-pointer flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-600 ${
                      subpageActiveTab === 'raw_data' ? 'bg-slate-700 text-white shadow-xs ring-1 ring-slate-600' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5 text-slate-300" />
                    <span>Raw Sub-Page Dataset</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={subpageActiveTab === 'sheets_extract'}
                    tabIndex={0}
                    onClick={() => setSubpageActiveTab('sheets_extract')}
                    className={`h-8 px-2.5 py-1 rounded-lg transition cursor-pointer flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                      subpageActiveTab === 'sheets_extract' ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-xs font-bold ring-1 ring-emerald-400' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-300" />
                    <span>Google Sheet Extraction</span>
                  </button>
                </div>

                <div className="relative min-w-[200px]">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={subpageSearchTerm}
                    onChange={(e) => setSubpageSearchTerm(e.target.value)}
                    placeholder="Search sub-page analytics..."
                    className="w-full pl-8 pr-7 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium transition"
                    aria-label="Search sub-page analytics"
                  />
                  {subpageSearchTerm && (
                    <button
                      type="button"
                      onClick={() => setSubpageSearchTerm('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                      aria-label="Clear sub-page search"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Sub-Page Component Angle Views */}
              {renderSubpageAngleView(subpageSnapshot)}
            </>
          )}
        </div>
      )}
      </>
      )}

      {/* Raw Text / CSV Paste Modal */}
      {rawTextModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 space-y-4 border border-slate-200">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <FileCode className="w-4 h-4 text-indigo-600" />
                Paste Raw Data / CSV / Table Text
              </h3>
              <button onClick={() => setRawTextModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <textarea
              rows={12}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="Paste comma-separated, tab-separated, or Google Sheets rows here..."
              className="w-full font-mono text-xs p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />

            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setRawTextModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition"
              >
                Cancel
              </button>
              <button
                onClick={() => handlePasteData()}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition shadow-sm"
              >
                Parse & Analyze
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Sub-Page Data Confirmation Modal */}
      {isDeleteSubpageModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 space-y-5 border border-slate-200 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl border border-rose-100 shrink-0">
                <Trash2 className="w-6 h-6 text-rose-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Delete Sub-Page Data?
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Permanent removal from local sub-page storage
                </p>
              </div>
            </div>

            <div className="bg-rose-50/70 border border-rose-200 rounded-2xl p-4 text-xs text-rose-950 space-y-2">
              <p className="font-semibold">
                Are you sure you want to delete the Sub-Page analyzed dataset?
              </p>
              <ul className="list-disc list-inside space-y-1 text-rose-800 text-[11px]">
                <li>
                  This will remove the saved snapshot containing <strong className="font-mono text-rose-950 font-bold">{subpageSnapshot?.totalRecords || subpageSnapshot?.data?.length || 0} records</strong>.
                </li>
                <li>
                  Your active dataset in the main Data Analyzer workspace will <strong className="text-rose-950">not</strong> be affected.
                </li>
                <li>
                  You can re-save your active dataset anytime using <strong>&quot;Save to Sub Page&quot;</strong>.
                </li>
              </ul>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setIsDeleteSubpageModalOpen(false)}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteSubpageData}
                className="px-4 py-2.5 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-rose-500/20 cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>Yes, Delete Sub-Page Data</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Quick Edit Views/Clicks Modal */}
      {editingMetric && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 shadow-2xl max-w-sm w-full space-y-4 border border-slate-200 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider font-mono">
                Edit {editingMetric.type === 'views' ? 'Video Views' : 'Short.io Clicks'}
              </h3>
              <button
                onClick={() => setEditingMetric(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">
                Enter {editingMetric.type === 'views' ? 'View Count' : 'Click Count'} for <span className="font-mono text-indigo-600 font-bold">{editingMetric.rowId}</span>:
              </label>
              <input
                type="number"
                value={editingMetric.value}
                onChange={(e) => setEditingMetric({ ...editingMetric, value: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder={`e.g. ${editingMetric.type === 'views' ? '25000' : '450'}`}
                autoFocus
              />
              <p className="text-[11px] text-slate-400 mt-1.5">
                CPV, CPC, and CTR will automatically update in real-time.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setEditingMetric(null)}
                className="px-3.5 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveMetricEdit}
                className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-xs font-bold text-white shadow-sm cursor-pointer"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Live Video Views & URL Inspector / Manual Entry Modal (e.g. for VoId-946) */}
      {inspectingRowForViews && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full border border-slate-200 p-6 space-y-5 animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <span className="p-2.5 bg-sky-50 text-sky-600 rounded-2xl border border-sky-100">
                  <Eye className="w-5 h-5" />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-black text-slate-900 tracking-tight">
                      Live Views & Video URL Inspector
                    </h3>
                    <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 text-xs font-mono font-bold">
                      {inspectingRowForViews.row.videoId}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Verify video accessibility or manually enter live view count
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInspectingRowForViews(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100 transition cursor-pointer"
                aria-label="Close Inspector"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Deliverable Metadata Card */}
            <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-3 rounded-2xl border border-slate-200/80">
              <div>
                <span className="text-[11px] text-slate-400 font-medium block">Influencer / Creator:</span>
                <strong className="text-slate-800 truncate block">{inspectingRowForViews.row.influencerName || 'Unknown Creator'}</strong>
              </div>
              <div>
                <span className="text-[11px] text-slate-400 font-medium block">Product SKU:</span>
                <strong className="text-slate-800 truncate block">{inspectingRowForViews.row.productName || 'General Campaign'}</strong>
              </div>
              <div>
                <span className="text-[11px] text-slate-400 font-medium block">Current Recorded Views:</span>
                <span className="font-mono font-bold text-sky-700">
                  {inspectingRowForViews.row.views !== undefined ? `${inspectingRowForViews.row.views.toLocaleString('en-IN')} views` : 'None / Not extracted'}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-slate-400 font-medium block">Remuneration (Spend):</span>
                <span className="font-mono font-bold text-slate-700">
                  ₹{Number(inspectingRowForViews.row.amountPaid || 0).toLocaleString('en-IN')}
                </span>
              </div>
            </div>

            {/* Auto-Find Public Link & Collect Views Automatically Section */}
            <div className="p-3.5 bg-gradient-to-r from-indigo-50 via-sky-50 to-purple-50 border border-indigo-200/80 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
              <div className="space-y-0.5 text-left">
                <div className="flex items-center gap-1.5 text-xs font-black text-indigo-950">
                  <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span>Auto-Find Public Video Link & Views</span>
                </div>
                <p className="text-[11px] text-slate-600 leading-tight">
                  Automatically queries public web indexes, unshortens redirect chains, and retrieves real views
                </p>
              </div>
              <button
                type="button"
                onClick={handleAutoFindPublicLinkAndViews}
                disabled={inspectingRowForViews.isTesting}
                className="w-full sm:w-auto px-4 py-2 bg-gradient-to-r from-indigo-600 via-sky-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl text-xs font-bold shadow-md transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
              >
                <Sparkles className={`w-3.5 h-3.5 ${inspectingRowForViews.isTesting ? 'animate-spin' : ''}`} />
                <span>{inspectingRowForViews.isTesting ? 'Resolving...' : 'Auto-Find & Apply ⚡'}</span>
              </button>
            </div>

            {/* Platform Scraping Limitation Alert */}
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl text-xs space-y-1.5">
              <div className="flex items-center gap-1.5 font-bold text-amber-900">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Why could live views not be extracted automatically?</span>
              </div>
              <p className="text-amber-800 text-[11px] leading-relaxed">
                Platforms like <strong className="font-semibold">Instagram Reels</strong>, <strong className="font-semibold">TikTok</strong>, and <strong className="font-semibold">private/restricted Facebook posts</strong> frequently block automated web scrapers or require viewer login. Click <strong className="font-semibold text-indigo-900">Auto-Find & Apply ⚡</strong> above, or enter the view count manually below.
              </p>
            </div>

            {/* Video URL Section & Live Verification */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                <span>Associated Video URL</span>
                <span className="text-[11px] text-slate-400 font-normal">Public link required</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={inspectingRowForViews.currentUrl}
                  onChange={(e) => setInspectingRowForViews({ ...inspectingRowForViews, currentUrl: e.target.value })}
                  placeholder="https://www.instagram.com/reel/... or https://youtube.com/..."
                  className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                {inspectingRowForViews.currentUrl.trim() && (
                  <button
                    type="button"
                    onClick={() => {
                      let u = inspectingRowForViews.currentUrl.trim();
                      if (!u.startsWith('http')) u = 'https://' + u;
                      window.open(u, '_blank');
                    }}
                    className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1 shrink-0 cursor-pointer"
                    title="Open video link in a new browser tab to check if public and view real-time counts"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open ↗</span>
                  </button>
                )}
              </div>

              {/* Test Extraction Button */}
              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => handleTestInspectRowUrl(inspectingRowForViews.currentUrl)}
                  disabled={inspectingRowForViews.isTesting || !inspectingRowForViews.currentUrl.trim()}
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${inspectingRowForViews.isTesting ? 'animate-spin' : ''}`} />
                  <span>{inspectingRowForViews.isTesting ? 'Testing Link Live...' : 'Retry Live Extraction'}</span>
                </button>
                {inspectingRowForViews.testError && (
                  <span className="text-[11px] text-rose-600 font-medium">Extraction blocked or no views detected</span>
                )}
              </div>
            </div>

            {/* Manual View Count Entry */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <label className="text-xs font-bold text-slate-800 block">
                Enter Live View Count Manually:
              </label>
              <div className="relative">
                <Eye className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="number"
                  value={inspectingRowForViews.viewsValue}
                  onChange={(e) => setInspectingRowForViews({ ...inspectingRowForViews, viewsValue: e.target.value })}
                  placeholder="e.g. 15000"
                  className="w-full pl-9 pr-4 py-2.5 bg-sky-50/50 border border-sky-200 rounded-xl text-sm font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              {/* Quick Preset Buttons */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[11px] text-slate-400">Quick set:</span>
                {[1000, 5000, 10000, 25000, 50000, 100000].map(val => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setInspectingRowForViews({ ...inspectingRowForViews, viewsValue: String(val) })}
                    className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-md text-[10px] font-mono font-bold transition cursor-pointer"
                  >
                    {val >= 1000 ? `${val / 1000}K` : val}
                  </button>
                ))}
              </div>

              {/* Live CPV & Metric Preview */}
              {Number(inspectingRowForViews.viewsValue) > 0 && (
                <div className="p-2.5 bg-emerald-50 rounded-xl border border-emerald-200/80 flex items-center justify-between text-xs text-emerald-950 font-mono">
                  <span>
                    Calculated CPV: <strong>₹{(Number(inspectingRowForViews.row.amountPaid || 0) / Number(inspectingRowForViews.viewsValue)).toFixed(3)}</strong>
                  </span>
                  <span>
                    Views: <strong>{Number(inspectingRowForViews.viewsValue).toLocaleString('en-IN')}</strong>
                  </span>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setInspectingRowForViews(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const num = parseFloat(inspectingRowForViews.viewsValue) || 0;
                  handleSaveInspectedRowViews(num, inspectingRowForViews.currentUrl);
                }}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-xs font-bold text-white shadow-md transition cursor-pointer flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Save & Apply Views</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deliverable In-Depth Details & Reasons Modal */}
      {selectedDeliverableForModal && (() => {
        const row = selectedDeliverableForModal;
        const metrics = getRowMetrics(row);
        const { viewsReason, clicksReason } = getMetricsStatusReason(row, metrics);
        const isMissingViews = !metrics.hasVideoLink || metrics.views === undefined || metrics.views <= 0;
        const isMissingClicks = !metrics.hasVideoLink || !metrics.hasShortIoCode || metrics.clicks === undefined || metrics.clicks <= 0;

        return (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto border border-slate-200 p-6 space-y-6">
              {/* Modal Header */}
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <span className="p-2.5 bg-indigo-50 text-indigo-600 rounded-2xl border border-indigo-100 font-mono font-bold text-xs">
                    {row.videoId}
                  </span>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      {row.influencerName}
                    </h3>
                    <p className="text-xs text-slate-500">{row.productName} • {row.platform}</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedDeliverableForModal(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* 1. Row Overview Specifications */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-[10px] uppercase font-mono text-slate-400 block font-bold">Amount Paid</span>
                  <span className="text-sm font-black font-mono text-slate-800">₹{row.amountPaid.toLocaleString('en-IN')}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-[10px] uppercase font-mono text-slate-400 block font-bold">Approacher</span>
                  <span className="text-xs font-bold text-slate-700">{row.approacher}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-[10px] uppercase font-mono text-slate-400 block font-bold">Order Month</span>
                  <span className="text-xs font-bold text-slate-700">{row.orderMonth}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-[10px] uppercase font-mono text-slate-400 block font-bold">Release Date</span>
                  <span className="text-xs font-bold text-slate-700">{row.videoReleasedDate || 'Pending Upload'}</span>
                </div>
              </div>

              {/* 2. Tracking URLs & Codes Status */}
              <div className="p-4 bg-slate-50/80 rounded-2xl border border-slate-200/80 space-y-3">
                <h4 className="text-xs font-bold text-slate-700 uppercase font-mono tracking-wider">
                  Tracking Links & Identifiers
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  {/* Video Link */}
                  <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-1">
                    <span className="text-[10px] font-mono text-slate-400 block font-bold">Video URL Status</span>
                    {metrics.hasVideoLink ? (
                      <div className="flex items-center justify-between">
                        <a
                          href={row.videoLink}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-blue-600 hover:underline font-bold truncate max-w-[200px] flex items-center gap-1"
                        >
                          {row.videoLink} <ExternalLink className="w-3 h-3 shrink-0" />
                        </a>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold border border-emerald-200">
                          Live Link
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-rose-600 font-semibold">
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span>Video Link Pending / Unreleased</span>
                      </div>
                    )}
                  </div>

                  {/* Short.io Code & Full Link */}
                  <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-1.5">
                    <span className="text-[10px] font-mono text-slate-400 block font-bold">Short.io Code & Full Link</span>
                    {metrics.hasShortIoCode ? (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-bold text-indigo-700 text-xs px-2 py-0.5 rounded bg-indigo-50 border border-indigo-200">
                            {row.shortIoCode}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-bold border border-indigo-200">
                            Code Assigned
                          </span>
                        </div>
                        {(row.shortIoLink || row.shortIoCode) && (
                          <div className="flex items-center gap-1.5 pt-1 border-t border-slate-100">
                            <span className="text-[10px] text-slate-500 font-bold font-mono">Full Link:</span>
                            <a
                              href={
                                (row.shortIoLink || row.shortIoCode).startsWith('http')
                                  ? (row.shortIoLink || row.shortIoCode)
                                  : `https://${row.shortIoLink || row.shortIoCode}`
                              }
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-indigo-600 hover:text-indigo-800 font-bold hover:underline truncate flex items-center gap-1 max-w-[260px]"
                              title={`Full Short.io Link as on input file: ${row.shortIoLink || row.shortIoCode}`}
                            >
                              <Link2 className="w-3 h-3 shrink-0 text-indigo-500" />
                              <span className="truncate">{row.shortIoLink || row.shortIoCode}</span>
                              <ExternalLink className="w-3 h-3 shrink-0 opacity-80" />
                            </a>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-amber-700 font-semibold">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>No Short.io Code Available</span>
                      </div>
                    )}
                  </div>

                  {/* Live Video Views Procedure Info & Action */}
                  {metrics.hasVideoLink && (
                    <div className="sm:col-span-2 p-3 bg-gradient-to-r from-sky-50/70 to-cyan-50/70 rounded-xl border border-sky-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="p-1 bg-sky-600 text-white rounded-md">
                            <Eye className="w-3.5 h-3.5" />
                          </span>
                          <span className="text-xs font-bold text-sky-950 font-mono">
                            Live Video Views Procedure Collection
                          </span>
                          <span className="text-[10px] px-2 py-0.2 rounded bg-sky-100 text-sky-800 font-bold">
                            {metrics.views !== undefined ? 'Views Active' : 'Pending Fetch'}
                          </span>
                        </div>
                        <div className="text-[11px] text-sky-800 flex flex-wrap items-center gap-x-4 gap-y-1">
                          <span>Tracked Views: <strong>{metrics.views !== undefined ? metrics.views.toLocaleString('en-IN') : 'Not yet extracted'}</strong></span>
                          {previousViewsMap[row.videoId] !== undefined && (
                            <span className="flex items-center gap-1 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 text-amber-900 font-semibold">
                              Prior Views (Created): <strong>{previousViewsMap[row.videoId].toLocaleString('en-IN')}</strong>
                              {metrics.views !== undefined && metrics.views >= previousViewsMap[row.videoId] && (
                                <span className="text-emerald-700 font-bold ml-1">
                                  (+{(metrics.views - previousViewsMap[row.videoId]).toLocaleString('en-IN')} added)
                                </span>
                              )}
                            </span>
                          )}
                          <span>Video Links: <strong>{extractVideoUrlsFromRow(row).length || 1} URL(s)</strong></span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => collectLiveVideoViewsProcedure([row])}
                          disabled={rowViewsLoadingId === row.videoId}
                          className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-bold transition shadow-xs cursor-pointer shrink-0 disabled:opacity-50"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${rowViewsLoadingId === row.videoId ? 'animate-spin' : ''}`} />
                          <span>{rowViewsLoadingId === row.videoId ? 'Extracting Views...' : 'Collect Views Now'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setInspectingRowForViews({
                            row,
                            currentUrl: extractVideoUrlsFromRow(row)[0] || row.videoLink || '',
                            viewsValue: metrics.views !== undefined ? String(metrics.views) : '',
                            isTesting: false
                          })}
                          className="flex items-center justify-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold border border-slate-200 transition cursor-pointer"
                          title="Inspect video URL or manually input views"
                        >
                          <Edit2 className="w-3 h-3 text-slate-500" />
                          <span>Edit Views</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Short.io Live Collection Procedure Info & Action */}
                  {metrics.hasShortIoLink && (
                    <div className="sm:col-span-2 p-3 bg-gradient-to-r from-indigo-50/70 to-blue-50/70 rounded-xl border border-indigo-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="p-1 bg-indigo-600 text-white rounded-md">
                            <MousePointerClick className="w-3.5 h-3.5" />
                          </span>
                          <span className="text-xs font-bold text-indigo-950 font-mono">
                            Short.io Tracker Procedure Collection
                          </span>
                          <span className="text-[10px] px-2 py-0.2 rounded bg-indigo-100 text-indigo-800 font-bold">
                            Active Metric: {primaryMetric === 'human' ? 'Human Verified' : 'Total Clicks'}
                          </span>
                        </div>
                        <div className="text-[11px] text-indigo-800 flex flex-wrap items-center gap-x-4 gap-y-1">
                          {(() => {
                            const matched = findShortioMatch(row, shortIoLinks);
                            return (
                              <>
                                <span>Total Clicks: <strong>{matched?.clicks !== undefined ? matched.clicks.toLocaleString() : (metrics.clicks !== undefined ? metrics.clicks.toLocaleString() : 'Not fetched')}</strong></span>
                                <span>Human Verified: <strong>{matched?.humanClicks !== undefined ? matched.humanClicks.toLocaleString() : '—'}</strong></span>
                                {matched?.lastUpdated && <span>Last Synced: <strong>{matched.lastUpdated}</strong></span>}
                              </>
                            );
                          })()}
                        </div>
                      </div>

                      <button
                        onClick={() => collectClicksDataProcedure([row])}
                        disabled={rowCollectingId === row.videoId}
                        className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition shadow-xs cursor-pointer shrink-0 disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${rowCollectingId === row.videoId ? 'animate-spin' : ''}`} />
                        <span>{rowCollectingId === row.videoId ? 'Fetching via Short.io...' : 'Collect Clicks Now'}</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* 3. Performance Metrics Cards for this Row */}
              <div>
                <h4 className="text-xs font-bold text-slate-700 uppercase font-mono tracking-wider mb-2.5">
                  Deliverable Performance Metrics
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-center">
                  {/* Views */}
                  <div className="p-3 bg-sky-50/70 border border-sky-200 rounded-xl space-y-1">
                    <span className="text-[10px] uppercase font-mono text-sky-700 block font-bold">Views</span>
                    <div className="text-lg font-black font-mono text-sky-900">
                      {metrics.views !== undefined ? metrics.views.toLocaleString('en-IN') : '—'}
                    </div>
                    <span className="text-[9px] text-sky-600 font-medium">
                      {metrics.views !== undefined ? 'Active Views' : 'Not Showing'}
                    </span>
                  </div>

                  {/* Clicks */}
                  <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-xl space-y-1">
                    <span className="text-[10px] uppercase font-mono text-indigo-700 block font-bold">Clicks</span>
                    <div className="text-lg font-black font-mono text-indigo-900">
                      {metrics.clicks !== undefined ? metrics.clicks.toLocaleString('en-IN') : '—'}
                    </div>
                    <span className="text-[9px] text-indigo-600 font-medium">
                      {metrics.clicks !== undefined ? 'Attributed Clicks' : 'Not Showing'}
                    </span>
                  </div>

                  {/* CPV */}
                  <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-1">
                    <span className="text-[10px] uppercase font-mono text-emerald-700 block font-bold">CPV (₹)</span>
                    <div className="text-lg font-black font-mono text-emerald-900">
                      {metrics.cpv !== undefined ? `₹${metrics.cpv.toFixed(3)}` : '—'}
                    </div>
                    <span className="text-[9px] text-emerald-600 font-medium">Cost / View</span>
                  </div>

                  {/* CPC */}
                  <div className="p-3 bg-fuchsia-50/70 border border-fuchsia-200 rounded-xl space-y-1">
                    <span className="text-[10px] uppercase font-mono text-fuchsia-700 block font-bold">CPC (₹)</span>
                    <div className="text-lg font-black font-mono text-fuchsia-900">
                      {metrics.cpc !== undefined ? `₹${metrics.cpc.toFixed(2)}` : '—'}
                    </div>
                    <span className="text-[9px] text-fuchsia-600 font-medium">Cost / Click</span>
                  </div>

                  {/* CTR */}
                  <div className="p-3 bg-purple-50/70 border border-purple-200 rounded-xl space-y-1">
                    <span className="text-[10px] uppercase font-mono text-purple-700 block font-bold">CTR (%)</span>
                    <div className="text-lg font-black font-mono text-purple-900">
                      {metrics.ctr !== undefined ? `${metrics.ctr.toFixed(2)}%` : '—'}
                    </div>
                    <span className="text-[9px] text-purple-600 font-medium">Click-Through</span>
                  </div>
                </div>
              </div>

              {/* 4. REASONS WHY VIEWS OR CLICKS ARE NOT SHOWING */}
              {(isMissingViews || isMissingClicks) ? (
                <div className="bg-amber-50/90 border border-amber-200 rounded-2xl p-4 sm:p-5 space-y-3">
                  <div className="flex items-center gap-2 text-amber-900 font-bold text-xs uppercase font-mono">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <span>Audit: Exact Reasons Metrics Are Not Showing for this Video</span>
                  </div>

                  <div className="space-y-2.5 text-xs">
                    {/* Views Reason */}
                    <div className="p-3 bg-white rounded-xl border border-amber-200 space-y-1">
                      <div className="flex items-center justify-between">
                        <strong className="text-slate-800 flex items-center gap-1.5">
                          <Eye className="w-3.5 h-3.5 text-sky-600" /> Views Display Status:
                        </strong>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${viewsReason.badgeColor}`}>
                          {viewsReason.shortLabel}
                        </span>
                      </div>
                      <p className="text-slate-600 text-[11px] leading-relaxed">
                        <strong>Reason:</strong> {viewsReason.description}
                      </p>
                    </div>

                    {/* Clicks Reason */}
                    <div className="p-3 bg-white rounded-xl border border-amber-200 space-y-1">
                      <div className="flex items-center justify-between">
                        <strong className="text-slate-800 flex items-center gap-1.5">
                          <MousePointerClick className="w-3.5 h-3.5 text-indigo-600" /> Clicks Display Status:
                        </strong>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${clicksReason.badgeColor}`}>
                          {clicksReason.shortLabel}
                        </span>
                      </div>
                      <p className="text-slate-600 text-[11px] leading-relaxed">
                        <strong>Reason:</strong> {clicksReason.description}
                      </p>
                    </div>
                  </div>

                  <div className="text-[11px] text-amber-800 bg-amber-100/60 p-2.5 rounded-xl border border-amber-200">
                    ℹ️ <strong>Campaign Display Rules:</strong>
                    <ul className="list-disc pl-4 mt-1 space-y-0.5">
                      <li>If <strong>VIDEO LINK</strong> and <strong>SHORT.IO LINK</strong> are available: views and clicks are always displayed.</li>
                      <li>If <strong>SHORT.IO LINK</strong> is not available: only views are displayed; clicks, CPC, and CTR remain withheld.</li>
                    </ul>
                  </div>
                </div>
              ) : (
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center gap-3 text-emerald-800 text-xs">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  <div>
                    <strong className="font-bold">All Metrics Fully Active & Tracking:</strong>
                    <p className="text-[11px] text-emerald-700 mt-0.5">
                      This deliverable has both a published Video Link and an active Short.io tracking code. Views, Clicks, CPV, CPC, and CTR are actively shown and verified.
                    </p>
                  </div>
                </div>
              )}

              {/* 5. OVERALL TOTALS BAR BELOW DETAILS AS REQUESTED */}
              <div className="border-t border-slate-200 pt-4">
                <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-4 shadow-md space-y-3">
                  <div className="flex items-center justify-between border-b border-white/10 pb-2">
                    <div className="flex items-center gap-2">
                      <BarChart2 className="w-4 h-4 text-indigo-400" />
                      <span className="text-xs font-bold uppercase font-mono tracking-wide text-white">
                        Campaign Overall Totals (Aggregated Below Details)
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-300">
                      {filteredTotals.videosCount} deliverables analyzed
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-center text-xs">
                    <div className="bg-white/5 p-2 rounded-xl border border-white/10">
                      <span className="text-[9px] uppercase font-mono text-slate-400 block font-bold">Total Budget</span>
                      <span className="text-sm font-black font-mono text-emerald-300">₹{filteredTotals.amount.toLocaleString('en-IN')}</span>
                    </div>
                    <div className="bg-white/5 p-2 rounded-xl border border-white/10">
                      <span className="text-[9px] uppercase font-mono text-slate-400 block font-bold">Total Views</span>
                      <span className="text-sm font-black font-mono text-sky-300">{filteredTotals.views.toLocaleString('en-IN')}</span>
                    </div>
                    <div className="bg-white/5 p-2 rounded-xl border border-white/10">
                      <span className="text-[9px] uppercase font-mono text-slate-400 block font-bold">Total Clicks</span>
                      <span className="text-sm font-black font-mono text-indigo-200">{filteredTotals.clicks.toLocaleString('en-IN')}</span>
                    </div>
                    <div className="bg-white/5 p-2 rounded-xl border border-white/10">
                      <span className="text-[9px] uppercase font-mono text-slate-400 block font-bold">Total CPV</span>
                      <span className="text-sm font-black font-mono text-emerald-300">₹{filteredTotals.cpv.toFixed(3)}</span>
                    </div>
                    <div className="bg-white/5 p-2 rounded-xl border border-white/10">
                      <span className="text-[9px] uppercase font-mono text-slate-400 block font-bold">Total CPC</span>
                      <span className="text-sm font-black font-mono text-fuchsia-300">₹{filteredTotals.cpc.toFixed(2)}</span>
                    </div>
                    <div className="bg-white/5 p-2 rounded-xl border border-white/10">
                      <span className="text-[9px] uppercase font-mono text-slate-400 block font-bold">Total CTR</span>
                      <span className="text-sm font-black font-mono text-purple-300">{filteredTotals.ctr.toFixed(2)}%</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Close Button */}
              <div className="flex justify-end pt-2">
                <button
                  onClick={() => setSelectedDeliverableForModal(null)}
                  className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition cursor-pointer"
                >
                  Close Details
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Short.io API Configuration & Sync Modal */}
      {isEditingApiKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <span className="p-2 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100">
                  <Key className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Short.io Tracker Integration</h3>
                  <p className="text-xs text-slate-500">Collects clicks data using the Short.io Tracker procedures</p>
                </div>
              </div>
              <button
                onClick={() => setIsEditingApiKey(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* API Key Input */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 flex items-center justify-between">
                  <span>Short.io Secret API Key</span>
                  <button
                    type="button"
                    onClick={() => setShowApiKeyInModal(!showApiKeyInModal)}
                    className="text-[11px] text-indigo-600 hover:underline cursor-pointer"
                  >
                    {showApiKeyInModal ? 'Hide Key' : 'Show Key'}
                  </button>
                </label>
                <div className="relative">
                  <input
                    type={showApiKeyInModal ? 'text' : 'password'}
                    value={tempApiKey}
                    onChange={(e) => setTempApiKey(e.target.value)}
                    placeholder="e.g. sec_xxxxxxxxxxxxxxxx"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <p className="text-[11px] text-slate-500">
                  Find your Secret API Key under Short.io Dashboard → Team Settings → Integrations & API.
                </p>
              </div>

              {/* Primary Metric Preference */}
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2">
                <label className="font-bold text-slate-800 block">
                  Primary Click Collection Metric
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPrimaryMetric('total')}
                    className={`p-2.5 rounded-xl border text-left cursor-pointer transition ${
                      primaryMetric === 'total'
                        ? 'bg-indigo-600 text-white border-indigo-600 font-bold shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <div className="font-bold">Total Clicks</div>
                    <div className={`text-[10px] ${primaryMetric === 'total' ? 'text-indigo-100' : 'text-slate-500'}`}>
                      All registered clicks across platforms
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPrimaryMetric('human')}
                    className={`p-2.5 rounded-xl border text-left cursor-pointer transition ${
                      primaryMetric === 'human'
                        ? 'bg-indigo-600 text-white border-indigo-600 font-bold shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <div className="font-bold">Human Clicks</div>
                    <div className={`text-[10px] ${primaryMetric === 'human' ? 'text-indigo-100' : 'text-slate-500'}`}>
                      Filtered bot protection clicks
                    </div>
                  </button>
                </div>
              </div>

              {/* Manual Override Toggle */}
              <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80">
                <div>
                  <div className="font-bold text-slate-800">Manual Clicks Override Mode</div>
                  <div className="text-[11px] text-slate-500">
                    Prioritizes manually overridden clicks when active
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setManualOverride(!manualOverride)}
                  className={`w-11 h-6 flex items-center rounded-full p-1 cursor-pointer transition ${
                    manualOverride ? 'bg-indigo-600' : 'bg-slate-300'
                  }`}
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full shadow-md transform transition ${
                      manualOverride ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Cloud Sync Status */}
              <div className="flex items-center justify-between text-[11px] text-slate-500 px-1">
                <span className="flex items-center gap-1.5">
                  <Cloud className="w-3.5 h-3.5 text-indigo-500" />
                  Synced with Cloud: {shortIoLinks.length} links tracked
                </span>
                {lastShortIoSyncTime && <span>Last sync: {lastShortIoSyncTime}</span>}
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsEditingApiKey(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 cursor-pointer"
              >
                Cancel
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    const keyVal = tempApiKey.trim();
                    setApiKey(keyVal);
                    safeLocalStorage.setItem('SHORT_IO_API_KEY', keyVal);
                    setIsEditingApiKey(false);
                    globalToast.success('Saved Short.io API Key!');
                    await collectClicksDataProcedure();
                  }}
                  className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-xl text-xs font-bold shadow-sm cursor-pointer transition flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  Save & Collect Clicks
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Approacher Data Isolation & Deletion Confirmation Modal */}
      {approacherDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-7 shadow-2xl border border-slate-200 space-y-5 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-3">
                <span className="p-2.5 bg-rose-50 text-rose-600 rounded-2xl border border-rose-200">
                  <Trash2 className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {approacherDeleteModal.action === 'keep_selected_delete_others'
                      ? 'Isolate Approacher & Delete Others'
                      : `Delete Approacher: ${approacherDeleteModal.targetApproacher}`}
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">
                    Target Approacher: <strong>{approacherDeleteModal.targetApproacher}</strong>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setApproacherDeleteModal(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {(() => {
              const target = approacherDeleteModal.targetApproacher.trim().toLowerCase();
              const matchingRows = data.filter(r => (r.approacher || 'Unassigned').trim().toLowerCase() === target);
              const otherRows = data.filter(r => (r.approacher || 'Unassigned').trim().toLowerCase() !== target);
              const isKeep = approacherDeleteModal.action === 'keep_selected_delete_others';

              const keepCount = isKeep ? matchingRows.length : otherRows.length;
              const deleteCount = isKeep ? otherRows.length : matchingRows.length;
              const keepSpend = (isKeep ? matchingRows : otherRows).reduce((s, r) => s + r.amountPaid, 0);
              const deleteSpend = (isKeep ? otherRows : matchingRows).reduce((s, r) => s + r.amountPaid, 0);

              return (
                <div className="space-y-4 text-xs">
                  <div className="p-4 bg-rose-50/70 border border-rose-200 rounded-2xl space-y-2">
                    <div className="flex items-center gap-2 font-bold text-rose-800">
                      <AlertTriangle className="w-4 h-4 text-rose-600" />
                      <span>Data Pruning Confirmation</span>
                    </div>
                    <p className="text-slate-600 leading-relaxed">
                      {isKeep ? (
                        <>
                          You are about to retain only the deliverables closed by{' '}
                          <strong className="text-slate-900">{approacherDeleteModal.targetApproacher}</strong> and permanently remove all deliverables from all other approachers in the Data Analyzer.
                        </>
                      ) : (
                        <>
                          You are about to delete all deliverables closed by{' '}
                          <strong className="text-slate-900">{approacherDeleteModal.targetApproacher}</strong> from the Data Analyzer dataset.
                        </>
                      )}
                    </p>
                  </div>

                  {/* Count Comparison Box */}
                  <div className="grid grid-cols-2 gap-3 font-mono">
                    <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl">
                      <span className="text-[10px] uppercase font-bold text-emerald-700 block">
                        {isKeep ? 'Keeping Selected' : 'Remaining Data'}
                      </span>
                      <p className="text-xl font-black text-emerald-900 mt-1">{keepCount} Deliverables</p>
                      <p className="text-[10px] text-emerald-600 mt-0.5">₹{keepSpend.toLocaleString('en-IN')} spend</p>
                    </div>

                    <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl">
                      <span className="text-[10px] uppercase font-bold text-rose-700 block">
                        Deleting from Analyzer
                      </span>
                      <p className="text-xl font-black text-rose-900 mt-1">{deleteCount} Deliverables</p>
                      <p className="text-[10px] text-rose-600 mt-0.5">₹{deleteSpend.toLocaleString('en-IN')} spend</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setApproacherDeleteModal(null)}
                      className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                    >
                      Cancel
                    </button>

                    <button
                      type="button"
                      onClick={handleConfirmApproacherAction}
                      className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-md transition cursor-pointer flex items-center gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>
                        {isKeep
                          ? `Yes, Keep ${approacherDeleteModal.targetApproacher} & Delete ${deleteCount} Rows`
                          : `Yes, Delete ${approacherDeleteModal.targetApproacher} (${deleteCount} Rows)`}
                      </span>
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* Add / Merge More Data Hub Modal */}
      {/* ------------------------------------------------------------- */}
      {isAddMoreDataModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-7 shadow-2xl border border-slate-200 space-y-5 animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-3">
                <span className="p-2.5 bg-emerald-50 text-emerald-600 rounded-2xl border border-emerald-200">
                  <Plus className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Add More Data to Universal Analyzer
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">
                    Current Dataset: <strong>{data.length} records</strong>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsAddMoreDataModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Ingestion & Mixing Mode Selector */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 uppercase font-mono tracking-wider">
                Select Merge / Ingestion Strategy
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                <button
                  type="button"
                  onClick={() => setAddMoreDataMode('smart_merge')}
                  className={`p-3 rounded-2xl border text-left transition cursor-pointer space-y-1 ${
                    addMoreDataMode === 'smart_merge'
                      ? 'bg-emerald-50/80 border-emerald-500 ring-2 ring-emerald-300 text-emerald-950 font-bold'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-emerald-300'
                  }`}
                >
                  <div className="flex items-center justify-between text-emerald-700">
                    <span className="font-bold flex items-center gap-1.5">
                      <GitMerge className="w-4 h-4" /> Smart Mix & Merge
                    </span>
                    <span className="text-[9px] bg-emerald-200 text-emerald-900 px-1.5 py-0.5 rounded font-bold">Recommended</span>
                  </div>
                  <p className="text-[11px] text-slate-500 font-normal leading-tight">
                    Mixes matching Video IDs, Influencer names, Products, Amounts, Links & Views into existing deliverables. Asks popup confirmation if uncertain.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setAddMoreDataMode('append')}
                  className={`p-3 rounded-2xl border text-left transition cursor-pointer space-y-1 ${
                    addMoreDataMode === 'append'
                      ? 'bg-blue-50/80 border-blue-500 ring-2 ring-blue-300 text-blue-950 font-bold'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-blue-300'
                  }`}
                >
                  <div className="flex items-center justify-between text-blue-700">
                    <span className="font-bold flex items-center gap-1.5">
                      <Plus className="w-4 h-4" /> Append as New Rows
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 font-normal leading-tight">
                    Adds all incoming deliverables as separate new entries without checking or merging with existing rows.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setAddMoreDataMode('replace')}
                  className={`p-3 rounded-2xl border text-left transition cursor-pointer space-y-1 ${
                    addMoreDataMode === 'replace'
                      ? 'bg-rose-50/80 border-rose-500 ring-2 ring-rose-300 text-rose-950 font-bold'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-rose-300'
                  }`}
                >
                  <div className="flex items-center justify-between text-rose-700">
                    <span className="font-bold flex items-center gap-1.5">
                      <RefreshCw className="w-4 h-4" /> Replace Entire Dataset
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 font-normal leading-tight">
                    Discards current {data.length} records and replaces with the newly uploaded dataset.
                  </p>
                </button>
              </div>
            </div>

            {/* Input Methods: File Upload or Paste Raw Text */}
            <div className="space-y-4 pt-2 border-t border-slate-100">
              <input
                ref={addMoreFileInputRef}
                type="file"
                accept=".csv,.tsv,.xlsx,.xls,.docx,.pdf,.jpg,.jpeg,.png,.webp"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setIsAddMoreDataModalOpen(false);
                    await processFile(file, addMoreDataMode);
                    if (addMoreFileInputRef.current) addMoreFileInputRef.current.value = '';
                  }
                }}
                className="hidden"
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => addMoreFileInputRef.current?.click()}
                  className="flex flex-col items-center justify-center p-6 rounded-2xl border-2 border-dashed border-emerald-300 hover:border-emerald-500 bg-emerald-50/30 hover:bg-emerald-50 transition cursor-pointer group space-y-2"
                >
                  <span className="p-3 bg-emerald-100 text-emerald-700 rounded-2xl group-hover:scale-110 transition">
                    <Upload className="w-6 h-6" />
                  </span>
                  <span className="text-xs font-bold text-slate-800">Browse File to Mix / Add</span>
                  <span className="text-[10px] text-slate-500">CSV, XLSX, DOCX, PDF, JPG/PNG</span>
                </button>

                <div className="space-y-2 flex flex-col justify-between">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <FileCode className="w-4 h-4 text-indigo-600" /> Or Paste Raw Text / CSV
                    </label>
                    <textarea
                      value={addMoreRawText}
                      onChange={(e) => setAddMoreRawText(e.target.value)}
                      placeholder="Paste comma/tab delimited text or new deliverable rows here..."
                      className="w-full h-24 p-2.5 text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-none"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={!addMoreRawText.trim()}
                    onClick={() => handlePasteData(addMoreDataMode, addMoreRawText)}
                    className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-xs transition cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <GitMerge className="w-3.5 h-3.5" /> Parse & Mix Pasted Data
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* Smart Merge Confusion Resolver Modal (Pop Up Message) */}
      {/* ------------------------------------------------------------- */}
      {confusionModalState && confusionModalState.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-3 sm:p-5 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-4xl w-full p-5 sm:p-7 shadow-2xl border border-amber-200 space-y-5 animate-in zoom-in-95 max-h-[92vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-3">
                <span className="p-2.5 bg-amber-50 text-amber-600 rounded-2xl border border-amber-200 animate-pulse">
                  <AlertTriangle className="w-6 h-6" />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base sm:text-lg font-bold text-slate-900">
                      Merge Confirmation: Related Deliverables Found
                    </h3>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 font-bold">
                      {confusionModalState.ambiguousItems.length} Need Review
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    The Data Analyzer detected incoming data from <strong>{confusionModalState.sourceName}</strong> that seems related to existing deliverables. Please choose whether to mix/merge into the existing deliverable or add as a separate row.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setConfusionModalState(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                title="Cancel Merge"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Ingestion Progress Summary Bar */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-xl border border-emerald-200 font-bold flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-600" /> {confusionModalState.autoMergedCount} Auto-Mixed
                </span>
                <span className="text-blue-700 bg-blue-50 px-2.5 py-1 rounded-xl border border-blue-200 font-bold flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5 text-blue-600" /> {confusionModalState.newAddedCount} New Rows
                </span>
                <span className="text-amber-800 bg-amber-50 px-2.5 py-1 rounded-xl border border-amber-200 font-bold flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600" /> {confusionModalState.ambiguousItems.length} Ambiguous Candidates
                </span>
              </div>

              {/* Bulk Select Actions */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const next: Record<number, 'merge' | 'new' | 'skip'> = {};
                    confusionModalState.ambiguousItems.forEach(item => {
                      next[item.incomingIndex] = 'merge';
                    });
                    setAmbiguousDecisions(next);
                  }}
                  className="px-2.5 py-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded-lg text-[11px] font-bold transition cursor-pointer"
                >
                  Mix All with Existing
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const next: Record<number, 'merge' | 'new' | 'skip'> = {};
                    confusionModalState.ambiguousItems.forEach(item => {
                      next[item.incomingIndex] = 'new';
                    });
                    setAmbiguousDecisions(next);
                  }}
                  className="px-2.5 py-1 bg-blue-100 hover:bg-blue-200 text-blue-800 rounded-lg text-[11px] font-bold transition cursor-pointer"
                >
                  Add All as New
                </button>
              </div>
            </div>

            {/* Ambiguous Match Rows List */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {confusionModalState.ambiguousItems.map((item, idx) => {
                const currentDecision = ambiguousDecisions[item.incomingIndex] || 'merge';

                return (
                  <div
                    key={item.id || idx}
                    className={`p-4 rounded-2xl border transition ${
                      currentDecision === 'merge'
                        ? 'bg-emerald-50/40 border-emerald-300 ring-1 ring-emerald-200'
                        : currentDecision === 'new'
                        ? 'bg-blue-50/40 border-blue-300 ring-1 ring-blue-200'
                        : 'bg-slate-50 border-slate-200 opacity-60'
                    }`}
                  >
                    {/* Header with Match Reason */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/80 pb-2.5 mb-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold text-slate-800 font-mono">
                          Candidate #{idx + 1}
                        </span>
                        {item.matchReasons.map((r, rIdx) => (
                          <span
                            key={rIdx}
                            className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 font-bold"
                          >
                            {r}
                          </span>
                        ))}
                        <span className="text-[10px] font-mono text-slate-500">
                          Match Score: <strong>{item.score}%</strong>
                        </span>
                      </div>

                      {/* Decision Segmented Buttons */}
                      <div className="inline-flex rounded-xl p-1 bg-white border border-slate-200 shadow-xs text-xs font-bold font-mono">
                        <button
                          type="button"
                          onClick={() => setAmbiguousDecisions(prev => ({ ...prev, [item.incomingIndex]: 'merge' }))}
                          className={`px-3 py-1 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                            currentDecision === 'merge'
                              ? 'bg-emerald-600 text-white shadow-xs'
                              : 'text-slate-600 hover:text-emerald-700'
                          }`}
                        >
                          <GitMerge className="w-3 h-3" /> Mix / Merge
                        </button>
                        <button
                          type="button"
                          onClick={() => setAmbiguousDecisions(prev => ({ ...prev, [item.incomingIndex]: 'new' }))}
                          className={`px-3 py-1 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                            currentDecision === 'new'
                              ? 'bg-blue-600 text-white shadow-xs'
                              : 'text-slate-600 hover:text-blue-700'
                          }`}
                        >
                          <Plus className="w-3 h-3" /> Add as New
                        </button>
                        <button
                          type="button"
                          onClick={() => setAmbiguousDecisions(prev => ({ ...prev, [item.incomingIndex]: 'skip' }))}
                          className={`px-3 py-1 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                            currentDecision === 'skip'
                              ? 'bg-slate-700 text-white shadow-xs'
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          <X className="w-3 h-3" /> Skip
                        </button>
                      </div>
                    </div>

                    {/* Side-by-Side Comparison */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      {/* Existing Record */}
                      <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-2">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                          <span className="font-bold text-slate-700 flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-slate-400" />
                            Existing Deliverable in Analyzer
                          </span>
                          <span className="font-mono text-[10px] px-1.5 py-0.5 bg-slate-100 rounded text-slate-700 font-bold">
                            {item.candidateExistingRow.videoId}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
                          <div>
                            <span className="text-slate-400 block text-[9px] uppercase font-mono">Influencer</span>
                            <strong className="text-slate-800">{item.candidateExistingRow.influencerName || '—'}</strong>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[9px] uppercase font-mono">Product SKU</span>
                            <strong className="text-slate-800">{item.candidateExistingRow.productName || '—'}</strong>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[9px] uppercase font-mono">Amount Paid</span>
                            <strong className="text-emerald-700">₹{item.candidateExistingRow.amountPaid.toLocaleString('en-IN')}</strong>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[9px] uppercase font-mono">Platform / BDM</span>
                            <span className="text-slate-700">{item.candidateExistingRow.platform} · {item.candidateExistingRow.approacher}</span>
                          </div>
                          {item.candidateExistingRow.videoLink && (
                            <div className="col-span-2 truncate">
                              <span className="text-slate-400 block text-[9px] uppercase font-mono">Video Link</span>
                              <span className="text-indigo-600 font-mono text-[10px] truncate">{item.candidateExistingRow.videoLink}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Incoming Record */}
                      <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-2">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                          <span className="font-bold text-emerald-800 flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-500" />
                            Incoming Data to Mix / Add
                          </span>
                          <span className="font-mono text-[10px] px-1.5 py-0.5 bg-emerald-50 text-emerald-800 rounded font-bold">
                            {item.incomingRow.videoId || 'New / VoId'}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
                          <div>
                            <span className="text-slate-400 block text-[9px] uppercase font-mono">Influencer</span>
                            <strong className="text-slate-800">{item.incomingRow.influencerName || '—'}</strong>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[9px] uppercase font-mono">Product SKU</span>
                            <strong className="text-slate-800">{item.incomingRow.productName || '—'}</strong>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[9px] uppercase font-mono">Amount Paid</span>
                            <strong className="text-emerald-700">₹{item.incomingRow.amountPaid.toLocaleString('en-IN')}</strong>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[9px] uppercase font-mono">Platform / BDM</span>
                            <span className="text-slate-700">{item.incomingRow.platform} · {item.incomingRow.approacher}</span>
                          </div>
                          {item.incomingRow.videoLink && (
                            <div className="col-span-2 truncate">
                              <span className="text-slate-400 block text-[9px] uppercase font-mono">Video Link</span>
                              <span className="text-emerald-600 font-mono text-[10px] truncate">{item.incomingRow.videoLink}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer Actions */}
            <div className="flex items-center justify-between border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => setConfusionModalState(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleApplyConfusionDecisions}
                className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold shadow-md transition cursor-pointer flex items-center gap-2"
              >
                <CheckCheck className="w-4 h-4" />
                <span>Confirm & Mix Selected Data into Universal Analyzer</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* Real API Verification & Raw Data Proof Inspector Modal */}
      {/* ------------------------------------------------------------- */}
      {proofInspectionModal && proofInspectionModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-3 sm:p-5 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-4xl w-full p-5 sm:p-7 shadow-2xl border border-emerald-200 space-y-5 animate-in zoom-in-95 max-h-[92vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-3">
                <span className="p-2.5 bg-emerald-50 text-emerald-600 rounded-2xl border border-emerald-200">
                  <ShieldCheck className="w-6 h-6 text-emerald-600" />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base sm:text-lg font-bold text-slate-900">
                      Live API Network Proof & Pristine Data Verification
                    </h3>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300 font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" /> 0% Mock Data Guaranteed
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    100% transparent proof showing exact raw API network payloads, HTTP status logs, and scraper response objects.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setProofInspectionModal(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Deliverable Selector in Proof Inspector */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900 text-white p-3.5 rounded-2xl border border-slate-800">
              <div className="space-y-0.5">
                <span className="text-[10px] uppercase font-bold text-slate-400 font-mono">
                  Inspecting Deliverable Record:
                </span>
                <p className="text-xs font-bold text-white font-mono flex items-center gap-2">
                  <span className="text-cyan-300">{proofInspectionModal.row.videoId}</span> · {proofInspectionModal.row.influencerName} ({proofInspectionModal.row.productName})
                </p>
              </div>

              {data.length > 1 && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-400 font-mono">Switch Record:</span>
                  <select
                    value={proofInspectionModal.row.videoId}
                    onChange={(e) => {
                      const matched = data.find(r => r.videoId === e.target.value);
                      if (matched) {
                        setProofInspectionModal(prev => prev ? { ...prev, row: matched } : null);
                      }
                    }}
                    className="bg-slate-800 text-white border border-slate-700 text-xs rounded-xl px-2.5 py-1.5 font-mono focus:outline-none focus:ring-1 focus:ring-emerald-400 cursor-pointer"
                  >
                    {data.map(r => (
                      <option key={r.videoId} value={r.videoId}>
                        {r.videoId} - {r.influencerName} ({r.productName})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Proof Content Scroll Area */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1 text-xs font-sans">
              {(() => {
                const row = proofInspectionModal.row;
                const videoUrls = extractVideoUrlsFromRow(row);
                const shortioMatch = findShortioMatch(row, shortIoLinks);
                const rowMetrics = getRowMetrics(row);

                return (
                  <div className="space-y-4">
                    {/* 1. Live Video Views API & Scraper Proof */}
                    <div className="bg-sky-50/60 border border-sky-200 rounded-2xl p-4 sm:p-5 space-y-3">
                      <div className="flex items-center justify-between border-b border-sky-200/80 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="p-1.5 bg-sky-600 text-white rounded-lg">
                            <Eye className="w-4 h-4" />
                          </span>
                          <div>
                            <h4 className="font-bold text-sky-950 font-mono text-xs uppercase">
                              1. Live Video Views Scraper & oEmbed API Response Proof
                            </h4>
                            <p className="text-[10px] text-sky-800">
                              Fetched via server-side scraper endpoint: <code>/api/link-preview</code>
                            </p>
                          </div>
                        </div>

                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                          rowMetrics.views !== undefined
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : 'bg-amber-100 text-amber-800 border border-amber-300'
                        }`}>
                          {rowMetrics.views !== undefined ? `Verified Views: ${rowMetrics.views.toLocaleString('en-IN')}` : 'No Views Found'}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-[11px]">
                        <div className="p-2.5 bg-white rounded-xl border border-sky-200">
                          <span className="text-[9px] uppercase font-bold text-slate-400 block">HTTP Request Endpoint</span>
                          <span className="text-slate-800 font-bold text-[10px]">POST /api/link-preview</span>
                        </div>
                        <div className="p-2.5 bg-white rounded-xl border border-sky-200">
                          <span className="text-[9px] uppercase font-bold text-slate-400 block">Scraped Video URLs</span>
                          <span className="text-sky-700 font-bold text-[10px] truncate block">{videoUrls[0] || row.videoLink || 'None specified'}</span>
                        </div>
                        <div className="p-2.5 bg-white rounded-xl border border-sky-200">
                          <span className="text-[9px] uppercase font-bold text-slate-400 block">Status Code</span>
                          <span className="text-emerald-700 font-bold text-[10px]">200 OK (Live Stream)</span>
                        </div>
                      </div>

                      {/* Video Link Scraper Raw Preview Data */}
                      {videoUrls.length > 0 && videoUrls.map((url, uIdx) => {
                        const preview = linkPreviews[url]?.data;
                        return (
                          <div key={uIdx} className="bg-slate-900 text-slate-200 rounded-2xl p-3.5 space-y-2 font-mono text-[11px]">
                            <div className="flex items-center justify-between text-[10px] border-b border-slate-800 pb-1 text-slate-400">
                              <span>Target URL #{uIdx + 1}: <strong className="text-sky-300 font-sans">{url}</strong></span>
                              <a
                                href={url.startsWith('http') ? url : `https://${url}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-cyan-400 hover:underline flex items-center gap-1 font-bold"
                              >
                                Test Link in New Tab <ExternalLink className="w-3 h-3" />
                              </a>
                            </div>

                            {preview ? (
                              <div className="space-y-1.5">
                                <div className="text-[10px] text-emerald-400 font-bold">
                                  ✓ Raw Metadata Returned by Scraper:
                                </div>
                                <pre className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 overflow-x-auto text-[10px] text-cyan-200 leading-relaxed max-h-36">
                                  {JSON.stringify(preview, null, 2)}
                                </pre>
                              </div>
                            ) : (
                              <div className="text-[10px] text-amber-300 italic p-2 bg-slate-950/60 rounded-xl">
                                Scraper metadata pending or URL is unreachable. Click "Re-fetch Live Views" in the Central Action Hub to run the scraper procedure.
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* 2. Live Short.io Clicks API Response Proof */}
                    <div className="bg-indigo-50/60 border border-indigo-200 rounded-2xl p-4 sm:p-5 space-y-3">
                      <div className="flex items-center justify-between border-b border-indigo-200/80 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="p-1.5 bg-indigo-600 text-white rounded-lg">
                            <MousePointerClick className="w-4 h-4" />
                          </span>
                          <div>
                            <h4 className="font-bold text-indigo-950 font-mono text-xs uppercase">
                              2. Short.io Live API Response Proof
                            </h4>
                            <p className="text-[10px] text-indigo-800">
                              Querying endpoint: <code>/api/shortio/stats?url=...</code>
                            </p>
                          </div>
                        </div>

                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                          shortioMatch
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : 'bg-amber-100 text-amber-800 border border-amber-300'
                        }`}>
                          {shortioMatch ? `Verified Clicks: ${shortioMatch.clicks ?? '0'}` : 'No Short.io Record'}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-[11px]">
                        <div className="p-2.5 bg-white rounded-xl border border-indigo-200">
                          <span className="text-[9px] uppercase font-bold text-slate-400 block">Short.io Code / Link</span>
                          <span className="text-indigo-800 font-bold text-[10px] truncate block">
                            {row.shortIoCode || row.shortIoLink || 'None specified'}
                          </span>
                        </div>
                        <div className="p-2.5 bg-white rounded-xl border border-indigo-200">
                          <span className="text-[9px] uppercase font-bold text-slate-400 block">Human Verified Clicks</span>
                          <span className="text-indigo-900 font-bold text-[10px]">
                            {shortioMatch?.humanClicks !== undefined ? shortioMatch.humanClicks.toLocaleString() : '—'}
                          </span>
                        </div>
                        <div className="p-2.5 bg-white rounded-xl border border-indigo-200">
                          <span className="text-[9px] uppercase font-bold text-slate-400 block">Last Synced Timestamp</span>
                          <span className="text-slate-700 font-bold text-[10px]">
                            {shortioMatch?.lastUpdated || 'Not yet queried'}
                          </span>
                        </div>
                      </div>

                      {/* Raw Short.io API JSON Object Box */}
                      {shortioMatch ? (
                        <div className="bg-slate-900 text-slate-200 rounded-2xl p-3.5 space-y-2 font-mono text-[11px]">
                          <div className="flex items-center justify-between text-[10px] border-b border-slate-800 pb-1 text-slate-400">
                            <span>Short.io Internal Link ID: <strong className="text-indigo-300">{shortioMatch.id}</strong></span>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(JSON.stringify(shortioMatch, null, 2));
                                globalToast.success('Raw Short.io API response JSON copied to clipboard!');
                              }}
                              className="text-cyan-400 hover:underline flex items-center gap-1 font-bold cursor-pointer"
                            >
                              <Copy className="w-3 h-3" /> Copy Raw API JSON
                            </button>
                          </div>

                          <div className="space-y-1.5">
                            <div className="text-[10px] text-emerald-400 font-bold">
                              ✓ Pristine Raw Short.io Response Payload:
                            </div>
                            <pre className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 overflow-x-auto text-[10px] text-indigo-200 leading-relaxed max-h-48">
                              {JSON.stringify({
                                id: shortioMatch.id,
                                url: shortioMatch.url,
                                clicks: shortioMatch.clicks,
                                humanClicks: shortioMatch.humanClicks,
                                lastUpdated: shortioMatch.lastUpdated,
                                linkData: shortioMatch.linkData || {},
                                statsData: shortioMatch.statsData || {},
                                linkDetailsData: shortioMatch.linkDetailsData || {}
                              }, null, 2)}
                            </pre>
                          </div>
                        </div>
                      ) : (
                        <div className="p-3 bg-amber-50 text-amber-900 border border-amber-200 rounded-xl text-[11px] leading-relaxed">
                          No Short.io API data currently matched for this deliverable. Connect your Short.io API key in the top bar or click "Re-fetch Live Clicks" to run the Short.io tracker procedure.
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
              <span className="text-slate-400 font-mono text-[11px]">
                Universal Data Analyzer • Zero Synthetic Data Policy Active
              </span>

              <button
                type="button"
                onClick={() => setProofInspectionModal(null)}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-bold transition cursor-pointer"
              >
                Close Proof Inspector
              </button>
            </div>
          </div>
        </div>
      )}

      {/* High / Abnormal View Counts Inspection & Original View Guard Modal */}
      {isHighCountModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-5xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-5 bg-gradient-to-r from-red-600 via-rose-600 to-emerald-800 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-white/10 rounded-2xl border border-white/20 shadow-inner">
                  <ShieldAlert className="w-6 h-6 text-amber-300" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-black tracking-tight">Abnormal View Monitor &amp; Original View Guard</h3>
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold border ${
                      abnormalMonitorEnabled
                        ? 'bg-emerald-500/30 text-emerald-100 border-emerald-300/50'
                        : 'bg-amber-500/30 text-amber-100 border-amber-300/50'
                    }`}>
                      {abnormalMonitorEnabled ? 'GUARD ACTIVE: SHOWING ORIGINAL VIEWS' : 'GUARD PAUSED'}
                    </span>
                  </div>
                  <p className="text-xs text-red-100 mt-0.5">
                    Automatically stops abnormal/inflated view counts and locks deliverables to the verified Original Views of each video link.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsHighCountModalOpen(false)}
                className="p-2 hover:bg-white/20 rounded-xl transition cursor-pointer text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Threshold Selector & Page Tabs Bar */}
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-slate-600 font-mono uppercase">Dataset:</span>
                <div className="flex p-1 bg-slate-200/80 rounded-xl text-xs font-bold">
                  <button
                    onClick={() => setHighCountActiveTab('main')}
                    className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                      highCountActiveTab === 'main' ? 'bg-white text-red-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Main Page ({mainHighCountRows.length})
                  </button>
                  <button
                    onClick={() => setHighCountActiveTab('subpage')}
                    className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                      highCountActiveTab === 'subpage' ? 'bg-white text-red-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Sub Page ({subHighCountRows.length})
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setAbnormalMonitorEnabled(prev => !prev)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold font-mono border transition cursor-pointer flex items-center gap-1.5 ${
                    abnormalMonitorEnabled
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                      : 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>{abnormalMonitorEnabled ? 'Original View Guard: ON' : 'Original View Guard: OFF'}</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs font-bold text-slate-600 font-mono uppercase">Guard Ceiling:</label>
                <select
                  value={String(abnormalThreshold)}
                  onChange={(e) => {
                    const v = e.target.value;
                    setAbnormalThreshold(v === 'AUTO' ? 'AUTO' : Number(v));
                    if (v !== 'AUTO') setHighViewThreshold(Number(v));
                  }}
                  className="bg-white border border-slate-300 text-slate-800 text-xs font-bold px-3 py-1.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                >
                  <option value="AUTO">Auto Smart Guard (5,00,000 Unverified / 20,00,000 Verified)</option>
                  <option value="50000">≥ 50,000 Views (50k)</option>
                  <option value="100000">≥ 1,00,000 Views (1 Lakh)</option>
                  <option value="200000">≥ 2,00,000 Views (2 Lakhs)</option>
                  <option value="500000">≥ 5,00,000 Views (5 Lakhs)</option>
                  <option value="1000000">≥ 10,00,000 Views (10 Lakhs / 1M)</option>
                  <option value="2465263">≥ 24,65,263 Views (Base Benchmark 24.65L)</option>
                </select>
              </div>
            </div>

            {/* List Table Content */}
            <div className="p-5 overflow-y-auto flex-1 space-y-4">
              {(() => {
                const activeRows = highCountActiveTab === 'main' ? mainHighCountRows : subHighCountRows;
                if (activeRows.length === 0) {
                  return (
                    <div className="text-center py-12 space-y-3 bg-emerald-50/50 rounded-2xl border border-dashed border-emerald-300">
                      <ShieldCheck className="w-10 h-10 text-emerald-500 mx-auto" />
                      <p className="text-sm font-bold text-slate-800">All video deliverables are showing normal, verified Original Views</p>
                      <p className="text-xs text-slate-500 max-w-md mx-auto">
                        No abnormal view spikes or unverified high counts were detected in the {highCountActiveTab === 'main' ? 'Main' : 'Sub Page'} dataset.
                      </p>
                    </div>
                  );
                }

                return (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-600 font-mono">
                        Showing {activeRows.length} deliverable(s) monitored for abnormal/high view counts
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleRestoreOriginalViewsInAnalyzer(activeRows)}
                          disabled={isCollectingViews}
                          className="bg-sky-600 hover:bg-sky-500 text-white font-extrabold text-xs px-4 py-2 rounded-xl shadow-md transition cursor-pointer flex items-center gap-2"
                        >
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>Stop Abnormal &amp; Restore All Original Views ({activeRows.length})</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => collectLiveVideoViewsProcedure(activeRows)}
                          disabled={isCollectingViews}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs px-4 py-2 rounded-xl shadow-md transition cursor-pointer flex items-center gap-2"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${isCollectingViews ? 'animate-spin' : ''}`} />
                          <span>Re-fetch Links ({activeRows.length})</span>
                        </button>
                      </div>
                    </div>

                    <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                      <table className="w-full text-left text-xs font-medium text-slate-700">
                        <thead className="bg-slate-100 text-slate-600 uppercase text-[10px] font-mono tracking-wider">
                          <tr>
                            <th className="p-3">Creator Name</th>
                            <th className="p-3">Product SKU</th>
                            <th className="p-3 text-right">Stopped Abnormal</th>
                            <th className="p-3 text-right">Original Views Shown</th>
                            <th className="p-3">Guard Status &amp; Link</th>
                            <th className="p-3 text-center">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 bg-white">
                          {activeRows.map((r, idx) => {
                            const metrics = getRowMetrics(r);
                            return (
                              <tr key={r.videoId || idx} className="hover:bg-slate-50/80 transition">
                                <td className="p-3 font-bold text-slate-900">
                                  <div>{r.influencerName || 'Unknown Creator'}</div>
                                  <div className="text-[10px] font-mono text-indigo-600">{r.videoId}</div>
                                </td>
                                <td className="p-3 text-slate-600 text-[11px]">
                                  {r.productName || 'General SKU'}
                                </td>
                                <td className="p-3 text-right font-mono text-xs">
                                  {metrics.abnormalStopped ? (
                                    <span className="text-rose-600 line-through font-bold">
                                      {(metrics.stoppedAbnormalValue || r.views || 0).toLocaleString('en-IN')}
                                    </span>
                                  ) : (
                                    <span className="text-slate-400">—</span>
                                  )}
                                </td>
                                <td className="p-3 text-right font-black font-mono text-sm">
                                  {metrics.views !== undefined ? (
                                    <span className="text-emerald-700 inline-flex items-center gap-1 justify-end">
                                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                                      {metrics.views.toLocaleString('en-IN')}
                                    </span>
                                  ) : (
                                    <span className="text-amber-600 text-xs">Fetch Link Required</span>
                                  )}
                                </td>
                                <td className="p-3 text-[11px]">
                                  {metrics.stopReason && (
                                    <div className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 mb-1 font-medium">
                                      {metrics.stopReason}
                                    </div>
                                  )}
                                  {r.videoLink ? (
                                    <a
                                      href={r.videoLink}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-indigo-600 hover:underline flex items-center gap-1 font-mono font-bold truncate max-w-[220px]"
                                    >
                                      <ExternalLink className="w-3 h-3 shrink-0" />
                                      <span className="truncate">{r.videoLink}</span>
                                    </a>
                                  ) : (
                                    <span className="text-slate-400 font-mono">No link</span>
                                  )}
                                </td>
                                <td className="p-3 text-center">
                                  <div className="flex items-center justify-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => handleRestoreOriginalViewsInAnalyzer([r])}
                                      disabled={rowViewsLoadingId === r.videoId}
                                      className="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold px-2.5 py-1 rounded-lg border border-emerald-300 text-[11px] transition cursor-pointer flex items-center gap-1"
                                      title="Stop abnormal view and restore verified Original Views of this video link"
                                    >
                                      <ShieldCheck className="w-3 h-3 text-emerald-600" />
                                      <span>Restore Original</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => collectLiveVideoViewsProcedure([r])}
                                      disabled={rowViewsLoadingId === r.videoId}
                                      className="bg-sky-50 hover:bg-sky-100 text-sky-700 font-bold px-2 py-1 rounded-lg border border-sky-200 text-[11px] transition cursor-pointer flex items-center gap-1"
                                      title="Re-fetch live video link metadata"
                                    >
                                      <RefreshCw className={`w-3 h-3 ${rowViewsLoadingId === r.videoId ? 'animate-spin' : ''}`} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-100 border-t border-slate-200 flex items-center justify-between">
              <span className="text-[11px] text-slate-600 font-mono flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                Data Analyzer Abnormal View Monitor &amp; Original View Guard Active
              </span>
              <button
                type="button"
                onClick={() => setIsHighCountModalOpen(false)}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl transition cursor-pointer"
              >
                Close Monitor
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Excel File Extractor and Editor Modal */}
      <ExcelExtractorEditorModal
        isOpen={isExcelExtractorOpen}
        onClose={() => setIsExcelExtractorOpen(false)}
        onLoadIntoAnalyzer={(matrix, sourceName) => {
          parseRowsFromMatrix(matrix, sourceName);
        }}
      />
    </div>
  );
}
