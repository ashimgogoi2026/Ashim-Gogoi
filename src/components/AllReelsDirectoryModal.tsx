import React, { useState, useEffect } from 'react';
import { X, Film, Eye, ExternalLink, RefreshCw, Filter, Sparkles, CheckCircle2, TrendingUp, DollarSign, MousePointerClick, Calendar } from 'lucide-react';
import { Task, Influencer } from '../types';
import { SAMPLE_DELIVERABLES } from '../data/sampleVideoDeliverables';

export interface ReelItem {
  id: string;
  sourceType: 'task' | 'deliverable';
  taskId?: string;
  videoId?: string;
  influencerName: string;
  productName: string;
  reelUrl: string;
  platform: 'Facebook Reel' | 'YouTube Short' | 'Instagram Reel' | 'TikTok Reel' | 'Other Reel';
  views: number;
  clicks?: number;
  cpv?: number;
  ctr?: number;
  cpc?: number;
  releaseDate?: string;
}

export function detectReelPlatform(url: string): 'Facebook Reel' | 'YouTube Short' | 'Instagram Reel' | 'TikTok Reel' | 'Other Reel' | null {
  if (!url || typeof url !== 'string') return null;
  const lower = url.toLowerCase().trim();
  if (
    lower.includes('facebook.com/reel') ||
    lower.includes('facebook.com/share/r/') ||
    lower.includes('facebook.com/share/v/') ||
    lower.includes('fb.watch') ||
    lower.includes('facebook.com/watch') ||
    (lower.includes('facebook.com') && (lower.includes('/videos/') || lower.includes('/posts/')))
  ) {
    return 'Facebook Reel';
  }
  if (
    lower.includes('youtube.com/shorts') ||
    lower.includes('youtu.be/') ||
    lower.includes('youtube.com/watch') ||
    lower.includes('youtube.com/reel')
  ) {
    return 'YouTube Short';
  }
  if (
    lower.includes('instagram.com/reel') ||
    lower.includes('instagram.com/reels') ||
    lower.includes('instagram.com/p/')
  ) {
    return 'Instagram Reel';
  }
  if (lower.includes('tiktok.com')) {
    return 'TikTok Reel';
  }
  if (lower.includes('/reel') || lower.includes('/shorts') || lower.includes('/video/')) {
    return 'Other Reel';
  }
  return null;
}

export interface AllReelsDirectoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  tasks?: Task[];
  influencers?: Influencer[];
  deliverables?: any[];
  initialMonth?: string;
  initialYear?: string;
  onUpdateTask?: (taskId: string, updates: Partial<Task>) => void;
  onUpdateTasksBulk?: (bulkUpdates: { id: string; updates: Partial<Task> }[]) => void;
}

function matchYearMonth(dateStr: string | undefined, selYear: string, selMonth: string): boolean {
  if (selYear === 'ALL' && selMonth === 'ALL') return true;
  if (!dateStr || typeof dateStr !== 'string') return true;

  const trimmed = dateStr.trim();
  if (!trimmed) return true;

  let year: string | null = null;
  let month: string | null = null;

  // 1. Check YYYY-MM-DD
  const isoMatch = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    year = isoMatch[1];
    month = isoMatch[2].padStart(2, '0');
  } else {
    // 2. Check MM/DD/YYYY or DD/MM/YYYY
    const slashMatch = trimmed.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if (slashMatch) {
      year = slashMatch[3];
      const p1 = parseInt(slashMatch[1], 10);
      const p2 = parseInt(slashMatch[2], 10);
      if (p1 <= 12) month = String(p1).padStart(2, '0');
      else if (p2 <= 12) month = String(p2).padStart(2, '0');
    } else {
      // 3. Month string codes like Oct26, Oct2026, Oct 2026
      const monthMap: Record<string, string> = {
        jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
        jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
      };
      const lower = trimmed.toLowerCase();
      for (const [mName, mNum] of Object.entries(monthMap)) {
        if (lower.includes(mName)) {
          month = mNum;
          break;
        }
      }
      const yearMatch = trimmed.match(/\b(202[4-9])\b/) || trimmed.match(/\b(2[4-9])\b/);
      if (yearMatch) {
        year = yearMatch[1].length === 2 ? `20${yearMatch[1]}` : yearMatch[1];
      }
    }
  }

  const matchesYear = selYear === 'ALL' || (year ? parseInt(year, 10) === parseInt(selYear, 10) : true);
  const matchesMonth = selMonth === 'ALL' || (month ? parseInt(month, 10) === parseInt(selMonth, 10) : true);

  return matchesYear && matchesMonth;
}

function getMonthLabel(mNum: string): string {
  const months: Record<string, string> = {
    '01': 'Jan', '02': 'Feb', '03': 'Mar', '04': 'Apr',
    '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Aug',
    '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dec'
  };
  return months[mNum] || `Month ${mNum}`;
}

export default function AllReelsDirectoryModal({
  isOpen,
  onClose,
  tasks = [],
  influencers = [],
  deliverables = [],
  initialMonth = 'ALL',
  initialYear = 'ALL',
  onUpdateTask,
  onUpdateTasksBulk
}: AllReelsDirectoryModalProps) {
  const [platformFilter, setPlatformFilter] = useState<'ALL' | 'Facebook' | 'YouTube' | 'Instagram' | 'TikTok'>('ALL');
  const [selectedMonth, setSelectedMonth] = useState<string>(initialMonth || 'ALL');
  const [selectedYear, setSelectedYear] = useState<string>(initialYear || 'ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshingUrls, setRefreshingUrls] = useState<Record<string, boolean>>({});
  const [isRefreshingAll, setIsRefreshingAll] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (initialMonth) setSelectedMonth(initialMonth);
      if (initialYear) setSelectedYear(initialYear);
    }
  }, [isOpen, initialMonth, initialYear]);
  // Persistent local cache for reel views
  const [localViewsMap, setLocalViewsMap] = useState<Record<string, number>>(() => {
    try {
      return JSON.parse(localStorage.getItem('REELS_DIRECTORY_VIEWS_CACHE') || '{}');
    } catch {
      return {};
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('REELS_DIRECTORY_VIEWS_CACHE', JSON.stringify(localViewsMap));
    } catch (e) {}
  }, [localViewsMap]);

  // Aggregate all reel links from tasks and deliverables
  const reelItems: ReelItem[] = [];
  const seenUrls = new Set<string>();

  // 1. From completed tasks only
  tasks.filter(t => t.status === 'Completed').forEach((t, idx) => {
    const inf = influencers.find(i => i.id === t.influencerId);
    const creatorName = inf?.name || t.secondaryInfluencerName || 'Creator';
    const videoId = t.videoId || `VID${String(idx + 1).padStart(3, '0')}`;

    const checkAndAdd = (link?: string, linkIdx?: number) => {
      if (!link || typeof link !== 'string' || !link.trim()) return;
      const trimmed = link.trim();
      const detected = detectReelPlatform(trimmed);
      if (detected && !seenUrls.has(trimmed)) {
        seenUrls.add(trimmed);
        const manualViews = (t as any)[`videoLink${linkIdx}Views`] as number | undefined;
        const taskViews = localViewsMap[trimmed] ?? manualViews ?? (t.views || 0);
        const remuneration = t.remuneration || 0;
        const clicks = t.clicks !== undefined ? t.clicks : 0;
        const ctr = taskViews > 0 ? parseFloat(((clicks / taskViews) * 100).toFixed(2)) : 0;
        const cpv = taskViews > 0 ? parseFloat((remuneration / taskViews).toFixed(3)) : 0;
        const cpc = clicks > 0 ? parseFloat((remuneration / clicks).toFixed(2)) : 0;

        reelItems.push({
          id: `task-${t.id}-${linkIdx || 1}`,
          sourceType: 'task',
          taskId: t.id,
          videoId,
          influencerName: creatorName,
          productName: t.title || 'Campaign Deliverable',
          reelUrl: trimmed,
          platform: detected,
          views: taskViews,
          clicks,
          cpv,
          ctr,
          cpc,
          releaseDate: t.releaseDate || t.deadline
        });
      }
    };

    checkAndAdd(t.videoLink1, 1);
    checkAndAdd(t.videoLink2, 2);
    checkAndAdd(t.videoLink3, 3);
  });

  // 2. From actual deliverables (if provided; no fallback to sample mock deliverables)
  const sourceDeliverables = deliverables && deliverables.length > 0 ? deliverables : [];
  sourceDeliverables.forEach((d, idx) => {
    if (!d.videoLink) return;
    const parts = String(d.videoLink).split(/[\s,;\n]+/);
    parts.forEach(p => {
      const trimmed = p.trim();
      const detected = detectReelPlatform(trimmed);
      if (detected && !seenUrls.has(trimmed)) {
        seenUrls.add(trimmed);
        const dViews = localViewsMap[trimmed] ?? (d.views || 0);
        const amount = Number(d.amountPaid) || 0;
        const clicks = d.clicks !== undefined ? Number(d.clicks) : 0;
        const ctr = dViews > 0 ? parseFloat(((clicks / dViews) * 100).toFixed(2)) : 0;
        const cpv = dViews > 0 ? parseFloat((amount / dViews).toFixed(3)) : 0;
        const cpc = clicks > 0 ? parseFloat((amount / clicks).toFixed(2)) : 0;

        reelItems.push({
          id: `deliv-${d.videoId || idx}`,
          sourceType: 'deliverable',
          videoId: d.videoId || `VID-${idx}`,
          influencerName: d.influencerName || 'Creator',
          productName: d.productName || 'Product SKU',
          reelUrl: trimmed,
          platform: detected,
          views: dViews,
          clicks,
          cpv,
          ctr,
          cpc,
          releaseDate: d.videoReleasedDate || d.orderMonth
        });
      }
    });
  });

  // Auto-fetch views on modal open for any reels that have 0 views or are not cached yet
  useEffect(() => {
    if (!isOpen || reelItems.length === 0) return;
    const unCachedItems = reelItems.filter(r => (!localViewsMap[r.reelUrl] || localViewsMap[r.reelUrl] === 0));
    if (unCachedItems.length === 0) return;

    let isCancelled = false;
    const autoFetch = async () => {
      const newMap: Record<string, number> = {};
      const updates: { id: string; updates: Partial<Task> }[] = [];

      for (const item of unCachedItems.slice(0, 15)) {
        if (isCancelled) break;
        try {
          const res = await fetch('/api/link-preview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: item.reelUrl })
          });
          const json = await res.json();
          if (json.success && json.views !== undefined && json.views !== null) {
            const safeVal = Math.max(0, Math.round(Number(json.views) || 0));
            if (safeVal > 0) {
              newMap[item.reelUrl] = safeVal;
              if (item.taskId) {
                updates.push({ id: item.taskId, updates: { views: safeVal } });
              }
            }
          }
        } catch (e) {}
      }

      if (!isCancelled && Object.keys(newMap).length > 0) {
        setLocalViewsMap(prev => ({ ...prev, ...newMap }));
        if (updates.length > 0 && onUpdateTasksBulk) {
          onUpdateTasksBulk(updates);
        }
      }
    };

    autoFetch();
    return () => { isCancelled = true; };
  }, [isOpen]);

  if (!isOpen) return null;

  // Filter reel items
  const filteredReels = reelItems.filter(item => {
    let matchesPlatform = true;
    if (platformFilter === 'Facebook') matchesPlatform = item.platform === 'Facebook Reel';
    else if (platformFilter === 'YouTube') matchesPlatform = item.platform === 'YouTube Short';
    else if (platformFilter === 'Instagram') matchesPlatform = item.platform === 'Instagram Reel';
    else if (platformFilter === 'TikTok') matchesPlatform = item.platform === 'TikTok Reel';

    const matchesDate = matchYearMonth(item.releaseDate, selectedYear, selectedMonth);

    const q = searchQuery.toLowerCase().trim();
    const matchesSearch = !q ||
      item.influencerName.toLowerCase().includes(q) ||
      item.productName.toLowerCase().includes(q) ||
      item.reelUrl.toLowerCase().includes(q) ||
      (item.videoId && item.videoId.toLowerCase().includes(q));

    return matchesPlatform && matchesDate && matchesSearch;
  });

  // Totals
  const totalReelsCount = filteredReels.length;
  const totalReelsViews = filteredReels.reduce((sum, r) => sum + (r.views || 0), 0);
  const avgReelsViews = totalReelsCount > 0 ? Math.round(totalReelsViews / totalReelsCount) : 0;

  // Single Reel Refresh
  const handleRefreshSingleReel = async (item: ReelItem) => {
    setRefreshingUrls(prev => ({ ...prev, [item.reelUrl]: true }));
    try {
      const res = await fetch('/api/link-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: item.reelUrl })
      });
      const json = await res.json();
      if (json.success && json.views !== undefined) {
        const newViews = Number(json.views);
        setLocalViewsMap(prev => ({ ...prev, [item.reelUrl]: newViews }));
        if (item.taskId && onUpdateTask) {
          onUpdateTask(item.taskId, { views: newViews });
        }
      }
    } catch (err) {
      console.error('Failed to refresh reel views:', err);
    } finally {
      setRefreshingUrls(prev => {
        const next = { ...prev };
        delete next[item.reelUrl];
        return next;
      });
    }
  };

  // Bulk Refresh All Reels
  const handleRefreshAllReels = async () => {
    setIsRefreshingAll(true);
    const updates: { id: string; updates: Partial<Task> }[] = [];
    const newViews: Record<string, number> = {};

    await Promise.all(
      filteredReels.map(async item => {
        try {
          const res = await fetch('/api/link-preview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: item.reelUrl })
          });
          const json = await res.json();
          if (json.success && json.views !== undefined) {
            const viewsCount = Number(json.views);
            newViews[item.reelUrl] = viewsCount;
            if (item.taskId) {
              updates.push({ id: item.taskId, updates: { views: viewsCount } });
            }
          }
        } catch (e) {
          console.warn('Reel view fetch skipped:', item.reelUrl);
        }
      })
    );

    setLocalViewsMap(prev => ({ ...prev, ...newViews }));
    if (updates.length > 0 && onUpdateTasksBulk) {
      onUpdateTasksBulk(updates);
    }
    setIsRefreshingAll(false);
  };

  const getPlatformStyle = (platform: ReelItem['platform']) => {
    switch (platform) {
      case 'Facebook Reel':
        return { badge: 'bg-blue-600 text-white border-blue-700', label: 'FB Reel' };
      case 'YouTube Short':
        return { badge: 'bg-red-600 text-white border-red-700', label: 'YT Short' };
      case 'Instagram Reel':
        return { badge: 'bg-gradient-to-r from-purple-600 to-pink-600 text-white border-purple-700', label: 'IG Reel' };
      case 'TikTok Reel':
        return { badge: 'bg-black text-white border-gray-800', label: 'TikTok' };
      default:
        return { badge: 'bg-indigo-600 text-white border-indigo-700', label: 'Reel' };
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl max-w-5xl w-full max-h-[92vh] flex flex-col border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-indigo-900/60">
          <div className="flex items-center gap-3">
            <span className="p-2.5 bg-gradient-to-br from-pink-500 to-indigo-600 text-white rounded-2xl shadow-md border border-white/20">
              <Film className="w-6 h-6" />
            </span>
            <div>
              <h2 className="text-xl font-black tracking-tight flex items-center gap-2">
                All Reels Links Directory
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-white/20 font-mono text-cyan-300 font-bold">
                  {totalReelsCount} Reels
                </span>
              </h2>
              <p className="text-xs text-indigo-200/80 mt-0.5">
                Centralized live view counter & performance audit for all Facebook Reels, YouTube Shorts, and Instagram Reels.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-end sm:self-center">
            {/* Quick Year & Month Refresh Selectors */}
            <div className="flex items-center gap-1.5 bg-white/10 p-1 rounded-xl border border-white/15 text-xs text-white">
              <span className="text-[10px] uppercase font-mono font-bold text-cyan-300 px-1 flex items-center gap-1">
                <Calendar className="w-3 h-3 text-pink-400" /> Filter:
              </span>
              <select
                value={selectedMonth}
                onChange={e => setSelectedMonth(e.target.value)}
                className="bg-slate-800 text-white text-xs font-bold border border-slate-600 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-pink-500 cursor-pointer"
              >
                <option value="ALL">All Months</option>
                <option value="01">Jan (01)</option>
                <option value="02">Feb (02)</option>
                <option value="03">Mar (03)</option>
                <option value="04">Apr (04)</option>
                <option value="05">May (05)</option>
                <option value="06">Jun (06)</option>
                <option value="07">Jul (07)</option>
                <option value="08">Aug (08)</option>
                <option value="09">Sep (09)</option>
                <option value="10">Oct (10)</option>
                <option value="11">Nov (11)</option>
                <option value="12">Dec (12)</option>
              </select>
              <select
                value={selectedYear}
                onChange={e => setSelectedYear(e.target.value)}
                className="bg-slate-800 text-white text-xs font-bold border border-slate-600 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-pink-500 cursor-pointer"
              >
                <option value="ALL">All Years</option>
                <option value="2024">2024</option>
                <option value="2025">2025</option>
                <option value="2026">2026</option>
                <option value="2027">2027</option>
              </select>
            </div>

            <button
              onClick={handleRefreshAllReels}
              disabled={isRefreshingAll || filteredReels.length === 0}
              className="flex items-center gap-2 bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white text-xs font-bold px-4 py-2 rounded-xl transition shadow-md cursor-pointer disabled:opacity-50"
              title={`Collect live views for all ${filteredReels.length} reel links in current selection`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingAll ? 'animate-spin' : ''}`} />
              <span>
                {isRefreshingAll
                  ? 'Extracting Views...'
                  : (selectedMonth !== 'ALL' || selectedYear !== 'ALL')
                  ? `Refresh ${selectedMonth !== 'ALL' ? getMonthLabel(selectedMonth) : ''} ${selectedYear !== 'ALL' ? selectedYear : ''} Reels (${filteredReels.length})`
                  : `Refresh All Reel Views (${filteredReels.length})`}
              </span>
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-xl transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* KPI Summary Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-slate-50 border-b border-slate-200 text-xs">
          <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-[10px] uppercase font-mono text-slate-400 font-bold block">Total Reels Tracked</span>
            <span className="text-lg font-black font-mono text-slate-800">{totalReelsCount}</span>
          </div>
          <div className="p-3 bg-white rounded-xl border border-sky-200 shadow-2xs">
            <span className="text-[10px] uppercase font-mono text-sky-600 font-bold block flex items-center gap-1">
              <Eye className="w-3 h-3 text-sky-500" /> Total Reel Views
            </span>
            <span className="text-lg font-black font-mono text-sky-900">{totalReelsViews.toLocaleString('en-IN')}</span>
          </div>
          <div className="p-3 bg-white rounded-xl border border-emerald-200 shadow-2xs">
            <span className="text-[10px] uppercase font-mono text-emerald-600 font-bold block">Avg. Views / Reel</span>
            <span className="text-lg font-black font-mono text-emerald-900">{avgReelsViews.toLocaleString('en-IN')}</span>
          </div>
          <div className="p-3 bg-white rounded-xl border border-fuchsia-200 shadow-2xs">
            <span className="text-[10px] uppercase font-mono text-fuchsia-600 font-bold block">Active Selection</span>
            <span className="text-xs font-bold text-fuchsia-900 mt-1 block truncate">
              {selectedMonth !== 'ALL' ? getMonthLabel(selectedMonth) : 'All Months'} {selectedYear !== 'ALL' ? selectedYear : 'All Years'}
            </span>
          </div>
        </div>

        {/* Filter Controls (Platform, Month, Year, Search) */}
        <div className="p-4 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white">
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
            {/* Platform Filter */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
              {(['ALL', 'Facebook', 'YouTube', 'Instagram', 'TikTok'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setPlatformFilter(p)}
                  className={`px-2.5 py-1 rounded-lg border transition cursor-pointer text-xs font-bold ${
                    platformFilter === p
                      ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {p === 'ALL' ? 'All Platforms' : p}
                </button>
              ))}
            </div>

            {/* Date Filters: Month & Year */}
            <div className="flex items-center gap-1.5 bg-indigo-50/70 p-1 rounded-xl border border-indigo-200/80">
              <span className="text-[10px] uppercase font-mono font-bold text-indigo-800 px-1.5 flex items-center gap-1">
                <Calendar className="w-3 h-3 text-indigo-600" /> Date:
              </span>
              
              <select
                value={selectedMonth}
                onChange={e => setSelectedMonth(e.target.value)}
                className="bg-white text-slate-800 text-xs font-bold border border-indigo-200 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-2xs"
              >
                <option value="ALL">All Months</option>
                <option value="01">Jan (01)</option>
                <option value="02">Feb (02)</option>
                <option value="03">Mar (03)</option>
                <option value="04">Apr (04)</option>
                <option value="05">May (05)</option>
                <option value="06">Jun (06)</option>
                <option value="07">Jul (07)</option>
                <option value="08">Aug (08)</option>
                <option value="09">Sep (09)</option>
                <option value="10">Oct (10)</option>
                <option value="11">Nov (11)</option>
                <option value="12">Dec (12)</option>
              </select>

              <select
                value={selectedYear}
                onChange={e => setSelectedYear(e.target.value)}
                className="bg-white text-slate-800 text-xs font-bold border border-indigo-200 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-2xs"
              >
                <option value="ALL">All Years</option>
                <option value="2024">2024</option>
                <option value="2025">2025</option>
                <option value="2026">2026</option>
                <option value="2027">2027</option>
              </select>
            </div>
          </div>

          <div className="relative w-full sm:w-64">
            <input
              type="text"
              placeholder="Search creator, product, link..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
            />
          </div>
        </div>

        {/* Reels Table / Grid */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {filteredReels.length === 0 ? (
            <div className="p-12 text-center text-slate-400 space-y-2">
              <Film className="w-10 h-10 mx-auto text-slate-300 animate-pulse" />
              <p className="text-sm font-bold text-slate-600">No Reel links match the active filter.</p>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Paste Facebook Reel links (facebook.com/reel or fb.watch) or YouTube Shorts (youtube.com/shorts) into your deliverables or planner tasks to track them here automatically.
              </p>
            </div>
          ) : (
            filteredReels.map(item => {
              const style = getPlatformStyle(item.platform);
              const isLoading = refreshingUrls[item.reelUrl];

              return (
                <div
                  key={item.id}
                  className="bg-white hover:bg-slate-50/80 border border-slate-200 rounded-2xl p-4 transition-all duration-150 shadow-2xs hover:shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
                >
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-lg border font-mono uppercase tracking-wider shrink-0 mt-0.5 shadow-2xs ${style.badge}`}>
                      🎬 {style.label}
                    </span>

                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <strong className="text-xs font-bold text-slate-900">{item.influencerName}</strong>
                        {item.videoId && (
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 font-bold border border-indigo-100">
                            {item.videoId}
                          </span>
                        )}
                        <span className="text-xs text-slate-500">• {item.productName}</span>
                      </div>

                      <div className="flex items-center gap-1.5 text-xs text-blue-600">
                        <a
                          href={item.reelUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-[11px] truncate max-w-xs sm:max-w-md hover:underline font-bold flex items-center gap-1 text-blue-600 hover:text-blue-800"
                          title={item.reelUrl}
                        >
                          {item.reelUrl} <ExternalLink className="w-3 h-3 shrink-0" />
                        </a>
                      </div>
                    </div>
                  </div>

                  {/* Views & Metrics */}
                  <div className="flex items-center gap-3 sm:gap-4 shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 justify-between sm:justify-end">
                    {/* Live Views Badge */}
                    <div className="text-right">
                      <span className="text-[10px] font-mono text-slate-400 block font-bold">Live Views</span>
                      <div className="inline-flex items-center gap-1 font-mono font-black text-sm text-sky-900 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-lg">
                        <Eye className="w-3.5 h-3.5 text-sky-600" />
                        <span>{item.views > 0 ? item.views.toLocaleString('en-IN') : 'Pending'}</span>
                      </div>
                    </div>

                    {/* Attribution stats if available */}
                    {item.clicks !== undefined && item.clicks > 0 && (
                      <div className="text-right hidden sm:block">
                        <span className="text-[10px] font-mono text-slate-400 block font-bold">Clicks</span>
                        <span className="text-xs font-mono font-bold text-indigo-700">{item.clicks.toLocaleString('en-IN')}</span>
                      </div>
                    )}

                    {item.cpv !== undefined && item.cpv > 0 && (
                      <div className="text-right hidden sm:block">
                        <span className="text-[10px] font-mono text-slate-400 block font-bold">CPV</span>
                        <span className="text-xs font-mono font-bold text-emerald-700">₹{item.cpv.toFixed(3)}</span>
                      </div>
                    )}

                    {/* Single Reel Refresh Button */}
                    <button
                      onClick={() => handleRefreshSingleReel(item)}
                      disabled={isLoading}
                      className="p-2 hover:bg-sky-50 text-sky-600 hover:text-sky-800 rounded-xl border border-slate-200 hover:border-sky-300 transition cursor-pointer disabled:opacity-50"
                      title="Fetch live views for this reel link"
                    >
                      <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-sky-600' : ''}`} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span>
            Showing {filteredReels.length} of {reelItems.length} total reel deliverables detected.
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
