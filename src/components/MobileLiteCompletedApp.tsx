import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Eye,
  MousePointerClick,
  Search,
  ExternalLink,
  Download,
  Video,
  TrendingUp,
  Calendar,
  ArrowLeft,
  Link2,
  Award,
  Clock,
  Package,
  User as UserIcon
} from 'lucide-react';
import { Influencer, Task } from '../types';
import {
  buildMobileLiteSnapshot,
  downloadSignedAndroidApk
} from '../lib/apkGenerator';
import { globalToast } from '../lib/toast';

interface MobileLiteCompletedAppProps {
  tasks: Task[];
  influencers: Influencer[];
  agencyName?: string;
  isStandaloneMode?: boolean;
  onExitStandalone?: () => void;
  embeddedPreview?: boolean;
}

type LiteBottomTab = 'completed-tasks' | 'awaiting-uploads' | 'video-views' | 'link-clicks';

export default function MobileLiteCompletedApp({
  tasks,
  influencers,
  agencyName = 'PRO-TO-GROW',
  isStandaloneMode = false,
  onExitStandalone,
  embeddedPreview = false
}: MobileLiteCompletedAppProps) {
  const [activeTab, setActiveTab] = useState<LiteBottomTab>('completed-tasks');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlatform, setSelectedPlatform] = useState<'ALL' | 'Instagram' | 'Facebook' | 'YouTube'>('ALL');
  const [selectedProductFilter, setSelectedProductFilter] = useState<string>('ALL');
  const [selectedMonth, setSelectedMonth] = useState<string>('ALL');
  const [selectedYear, setSelectedYear] = useState<string>('ALL');
  const [isDownloadingApk, setIsDownloadingApk] = useState(false);

  const snapshot = useMemo(
    () => buildMobileLiteSnapshot(tasks, influencers, agencyName),
    [tasks, influencers, agencyName]
  );

  const availableYears = useMemo(() => {
    const years = new Set<string>();
    snapshot.items.forEach((item) => {
      const dateStr = item.uploadDate || item.dueDate;
      if (dateStr && /^\d{4}/.test(dateStr)) {
        years.add(dateStr.substring(0, 4));
      }
    });
    snapshot.awaitingItems.forEach((item) => {
      const dateStr = item.scheduledDate || item.dueDate;
      if (dateStr && /^\d{4}/.test(dateStr)) {
        years.add(dateStr.substring(0, 4));
      }
    });
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [snapshot.items, snapshot.awaitingItems]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return snapshot.items.filter((item) => {
      if (selectedPlatform !== 'ALL' && item.platform !== selectedPlatform && item.platform !== 'Multi') {
        return false;
      }

      if (selectedProductFilter !== 'ALL' && item.product.toLowerCase() !== selectedProductFilter.toLowerCase()) {
        return false;
      }

      if (selectedYear !== 'ALL' || selectedMonth !== 'ALL') {
        const dStr = item.uploadDate || item.dueDate || '';
        const parts = dStr.split('-');
        const yr = parts[0] || '';
        const mo = parts[1] || '';
        if (selectedYear !== 'ALL' && yr !== selectedYear) return false;
        if (selectedMonth !== 'ALL' && mo !== selectedMonth) return false;
      }

      if (!q) return true;
      return (
        item.influencerName.toLowerCase().includes(q) ||
        item.product.toLowerCase().includes(q) ||
        item.title.toLowerCase().includes(q) ||
        item.videoId.toLowerCase().includes(q)
      );
    });
  }, [snapshot.items, searchQuery, selectedPlatform, selectedProductFilter, selectedMonth, selectedYear]);

  const filteredAwaitingItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return snapshot.awaitingItems.filter((item) => {
      if (selectedProductFilter !== 'ALL' && item.product.toLowerCase() !== selectedProductFilter.toLowerCase()) {
        return false;
      }

      if (selectedYear !== 'ALL' || selectedMonth !== 'ALL') {
        const dStr = item.scheduledDate || item.dueDate || '';
        const parts = dStr.split('-');
        const yr = parts[0] || '';
        const mo = parts[1] || '';
        if (selectedYear !== 'ALL' && yr !== selectedYear) return false;
        if (selectedMonth !== 'ALL' && mo !== selectedMonth) return false;
      }

      if (!q) return true;
      return (
        item.influencerName.toLowerCase().includes(q) ||
        item.product.toLowerCase().includes(q) ||
        item.videoId.toLowerCase().includes(q)
      );
    });
  }, [snapshot.awaitingItems, searchQuery, selectedProductFilter, selectedMonth, selectedYear]);

  // Product-wise awaiting upload counts
  const awaitingByProduct = useMemo(() => {
    const map = new Map<string, number>();
    filteredAwaitingItems.forEach((item) => {
      const prod = item.product || 'Unspecified Product';
      map.set(prod, (map.get(prod) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([product, count]) => ({ product, count }))
      .sort((a, b) => b.count - a.count);
  }, [filteredAwaitingItems]);

  const summary = useMemo(() => {
    let totalViews = 0;
    let totalClicks = 0;
    let totalHumanClicks = 0;
    let totalLinks = 0;

    filteredItems.forEach((item) => {
      totalViews += item.views || 0;
      totalClicks += item.clicks || 0;
      totalHumanClicks += item.humanClicks || 0;
      totalLinks += item.videoLinks.length;
    });

    const ctr = totalViews > 0 ? Number(((totalClicks / totalViews) * 100).toFixed(2)) : 0;
    const avgViews = filteredItems.length > 0 ? Math.round(totalViews / filteredItems.length) : 0;

    return {
      completedCount: filteredItems.length,
      awaitingCount: filteredAwaitingItems.length,
      totalLinks,
      totalViews,
      totalClicks,
      totalHumanClicks,
      ctr,
      avgViews
    };
  }, [filteredItems, filteredAwaitingItems]);

  const creatorRankings = useMemo(() => {
    const map = new Map<
      string,
      {
        name: string;
        completedTasks: number;
        videoCount: number;
        views: number;
        clicks: number;
        humanClicks: number;
      }
    >();

    filteredItems.forEach((item) => {
      const key = item.influencerName.trim().toLowerCase() || 'creator';
      const existing = map.get(key) || {
        name: item.influencerName,
        completedTasks: 0,
        videoCount: 0,
        views: 0,
        clicks: 0,
        humanClicks: 0
      };
      existing.completedTasks += 1;
      existing.videoCount += item.videoLinks.length;
      existing.views += item.views;
      existing.clicks += item.clicks;
      existing.humanClicks += item.humanClicks;
      map.set(key, existing);
    });

    const list = Array.from(map.values());
    return {
      byViews: [...list].sort((a, b) => b.views - a.views),
      byClicks: [...list].sort((a, b) => b.clicks - a.clicks)
    };
  }, [filteredItems]);

  const platformBreakdown = useMemo(() => {
    const stats = {
      Instagram: { count: 0, views: 0, clicks: 0 },
      Facebook: { count: 0, views: 0, clicks: 0 },
      YouTube: { count: 0, views: 0, clicks: 0 }
    };
    filteredItems.forEach((item) => {
      item.videoLinks.forEach((link) => {
        const lower = link.toLowerCase();
        if (lower.includes('instagram.com') || lower.includes('instagr.am')) {
          stats.Instagram.count += 1;
          stats.Instagram.views += item.views;
          stats.Instagram.clicks += item.clicks;
        } else if (lower.includes('facebook.com') || lower.includes('fb.watch') || lower.includes('fb.com')) {
          stats.Facebook.count += 1;
          stats.Facebook.views += item.views;
          stats.Facebook.clicks += item.clicks;
        } else if (lower.includes('youtube.com') || lower.includes('youtu.be')) {
          stats.YouTube.count += 1;
          stats.YouTube.views += item.views;
          stats.YouTube.clicks += item.clicks;
        }
      });
    });
    return stats;
  }, [filteredItems]);

  const handleDownloadApk = async () => {
    try {
      setIsDownloadingApk(true);
      globalToast.info('Building signed Android APK (Completed Tasks, Awaiting Uploads, Views & Clicks)...');
      const result = await downloadSignedAndroidApk(snapshot);
      globalToast.success(
        `Downloaded ${result.filename} (${Math.max(1, Math.round(result.sizeBytes / 1024))} KB)`
      );
    } catch (err: any) {
      globalToast.error('APK generation failed: ' + (err?.message || 'Unknown error'));
    } finally {
      setIsDownloadingApk(false);
    }
  };

  return (
    <div
      className={`bg-slate-950 text-slate-100 flex flex-col font-sans select-none ${
        isStandaloneMode
          ? 'min-h-screen w-full max-w-lg mx-auto border-x border-slate-800/80 shadow-2xl pb-24'
          : embeddedPreview
          ? 'rounded-3xl border-4 border-slate-800 overflow-hidden shadow-2xl max-w-md mx-auto'
          : 'rounded-2xl border border-slate-800 overflow-hidden shadow-xl'
      }`}
    >
      {/* Top Mobile Status + App Bar */}
      <header className="sticky top-0 z-30 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 px-4 py-3.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            {isStandaloneMode && onExitStandalone && (
              <button
                onClick={onExitStandalone}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition cursor-pointer shrink-0"
                title="Back to Full Desktop Workspace"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center text-slate-950 font-black text-xs shadow-md shadow-emerald-500/20 shrink-0">
              APK
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h2 className="text-sm font-black tracking-tight text-white truncate">
                  {agencyName} LITE
                </h2>
                <span className="px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-md">
                  Viewer App
                </span>
              </div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate">
                Completed • Awaiting Uploads • Views • Clicks
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={handleDownloadApk}
              disabled={isDownloadingApk}
              className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-[11px] flex items-center gap-1.5 shadow-lg shadow-emerald-500/20 transition cursor-pointer disabled:opacity-50"
              title="Download Android APK (.apk)"
            >
              <Download className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>{isDownloadingApk ? 'Building...' : 'Download .APK'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* 4 Core KPI Cards: Completed Tasks, Awaiting Uploads, Video Views, Link Clicks */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-4 pt-3.5 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('completed-tasks')}
          className={`text-left p-2.5 rounded-2xl border transition cursor-pointer ${
            activeTab === 'completed-tasks'
              ? 'bg-emerald-950/50 border-emerald-500/50 shadow-lg shadow-emerald-500/10'
              : 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between text-emerald-400 mb-1">
            <span className="text-[9px] font-black uppercase tracking-wider">Completed</span>
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          </div>
          <div className="text-lg font-black text-white leading-none">
            {summary.completedCount.toLocaleString('en-IN')}
          </div>
          <div className="text-[9px] text-emerald-300/80 font-semibold mt-1 truncate">
            {summary.totalLinks.toLocaleString('en-IN')} Video Links
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('awaiting-uploads')}
          className={`text-left p-2.5 rounded-2xl border transition cursor-pointer ${
            activeTab === 'awaiting-uploads'
              ? 'bg-rose-950/50 border-rose-500/50 shadow-lg shadow-rose-500/10'
              : 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between text-rose-400 mb-1">
            <span className="text-[9px] font-black uppercase tracking-wider">Awaiting Upload</span>
            <Clock className="w-3.5 h-3.5 shrink-0" />
          </div>
          <div className="text-lg font-black text-white leading-none">
            {summary.awaitingCount.toLocaleString('en-IN')}
          </div>
          <div className="text-[9px] text-rose-300/80 font-semibold mt-1 truncate">
            Pending Videos
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('video-views')}
          className={`text-left p-2.5 rounded-2xl border transition cursor-pointer ${
            activeTab === 'video-views'
              ? 'bg-cyan-950/50 border-cyan-500/50 shadow-lg shadow-cyan-500/10'
              : 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between text-cyan-400 mb-1">
            <span className="text-[9px] font-black uppercase tracking-wider">Video Views</span>
            <Eye className="w-3.5 h-3.5 shrink-0" />
          </div>
          <div className="text-lg font-black text-white leading-none">
            {summary.totalViews.toLocaleString('en-IN')}
          </div>
          <div className="text-[9px] text-cyan-300/80 font-semibold mt-1 truncate">
            ~{summary.avgViews.toLocaleString('en-IN')} / task
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('link-clicks')}
          className={`text-left p-2.5 rounded-2xl border transition cursor-pointer ${
            activeTab === 'link-clicks'
              ? 'bg-amber-950/50 border-amber-500/50 shadow-lg shadow-amber-500/10'
              : 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between text-amber-400 mb-1">
            <span className="text-[9px] font-black uppercase tracking-wider">Link Clicks</span>
            <MousePointerClick className="w-3.5 h-3.5 shrink-0" />
          </div>
          <div className="text-lg font-black text-white leading-none">
            {summary.totalClicks.toLocaleString('en-IN')}
          </div>
          <div className="text-[9px] text-amber-300/80 font-semibold mt-1 truncate">
            {summary.ctr}% CTR
          </div>
        </button>
      </section>

      {/* Search & Compact Period/Platform Filters */}
      <section className="px-4 py-2 space-y-2">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search influencer name, product, video ID..."
            className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-800 focus:border-emerald-500/60 rounded-xl text-xs text-white placeholder-slate-500 outline-none transition"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {activeTab !== 'awaiting-uploads' &&
            (['ALL', 'Instagram', 'Facebook', 'YouTube'] as const).map((plat) => (
              <button
                key={plat}
                type="button"
                onClick={() => setSelectedPlatform(plat)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider whitespace-nowrap border transition cursor-pointer ${
                  selectedPlatform === plat
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                }`}
              >
                {plat === 'ALL' ? 'All Platforms' : plat}
              </button>
            ))}

          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="bg-slate-900 border border-slate-800 text-slate-300 text-[10px] font-bold rounded-lg px-2 py-1 outline-none"
          >
            <option value="ALL">All Months</option>
            <option value="01">Jan</option>
            <option value="02">Feb</option>
            <option value="03">Mar</option>
            <option value="04">Apr</option>
            <option value="05">May</option>
            <option value="06">Jun</option>
            <option value="07">Jul</option>
            <option value="08">Aug</option>
            <option value="09">Sep</option>
            <option value="10">Oct</option>
            <option value="11">Nov</option>
            <option value="12">Dec</option>
          </select>

          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
            className="bg-slate-900 border border-slate-800 text-slate-300 text-[10px] font-bold rounded-lg px-2 py-1 outline-none"
          >
            <option value="ALL">All Years</option>
            {availableYears.map((yr) => (
              <option key={yr} value={yr}>
                {yr}
              </option>
            ))}
          </select>

          {selectedProductFilter !== 'ALL' && (
            <button
              type="button"
              onClick={() => setSelectedProductFilter('ALL')}
              className="px-2.5 py-1 rounded-lg text-[10px] font-black bg-rose-500/20 text-rose-300 border border-rose-500/40 whitespace-nowrap cursor-pointer"
            >
              Product: {selectedProductFilter} ✕
            </button>
          )}
        </div>
      </section>

      {/* Main Scrollable View Area */}
      <div
        className={`px-4 py-2 space-y-2.5 flex-1 ${
          embeddedPreview ? 'max-h-[500px] overflow-y-auto' : ''
        }`}
      >
        {activeTab === 'awaiting-uploads' ? (
          /* TAB: AWAITING UPLOADS (Number of Awaiting Uploads, Influencer Name & Product) */
          <div className="space-y-3">
            {/* Prominent Banner: Number of Awaiting Uploads */}
            <div className="bg-gradient-to-r from-rose-950/80 via-slate-900 to-slate-900 border border-rose-500/40 rounded-2xl p-3.5 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-rose-300 block">
                  Number of Awaiting Uploads
                </span>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Showing Influencer Name & Assigned Product
                </p>
              </div>
              <div className="px-3.5 py-1.5 rounded-xl bg-rose-500/20 border border-rose-500/40 text-right">
                <span className="text-xl font-black text-rose-400 leading-none block">
                  {filteredAwaitingItems.length.toLocaleString('en-IN')}
                </span>
                <span className="text-[9px] font-bold uppercase text-rose-200">
                  Awaiting
                </span>
              </div>
            </div>

            {/* Product-wise Awaiting Upload Count Pills */}
            {awaitingByProduct.length > 0 && (
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3 space-y-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-rose-400" />
                  Awaiting Uploads by Product (Tap to Filter)
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {awaitingByProduct.map((entry) => {
                    const isSelected =
                      selectedProductFilter.toLowerCase() === entry.product.toLowerCase();
                    return (
                      <button
                        key={entry.product}
                        type="button"
                        onClick={() =>
                          setSelectedProductFilter(isSelected ? 'ALL' : entry.product)
                        }
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition flex items-center gap-1.5 cursor-pointer ${
                          isSelected
                            ? 'bg-rose-500 text-slate-950 border-rose-400 font-black'
                            : 'bg-slate-950 text-slate-200 border-slate-800 hover:border-rose-500/40'
                        }`}
                      >
                        <span className="truncate max-w-[160px]">{entry.product}</span>
                        <span
                          className={`px-1.5 py-0.2 rounded text-[9px] font-black ${
                            isSelected
                              ? 'bg-slate-950 text-rose-300'
                              : 'bg-rose-500/20 text-rose-300'
                          }`}
                        >
                          {entry.count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* List of Awaiting Uploads showing Influencer Name & Product */}
            {filteredAwaitingItems.length === 0 ? (
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-8 text-center my-4">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                <p className="text-xs font-bold text-slate-300">No Awaiting Uploads Found</p>
                <p className="text-[11px] text-slate-500 mt-1">
                  All scheduled tasks for this filter have been uploaded!
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredAwaitingItems.map((item, idx) => (
                  <div
                    key={item.id}
                    className="bg-slate-900/90 border border-slate-800/90 hover:border-rose-500/40 rounded-2xl p-3.5 space-y-2 transition"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 space-y-1.5">
                        <div>
                          <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1">
                            <UserIcon className="w-3 h-3 text-rose-400" />
                            Influencer Name
                          </span>
                          <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                            <span className="text-[10px] font-mono font-black text-rose-400 bg-rose-500/10 border border-rose-500/30 px-1.5 py-0.5 rounded">
                              #{idx + 1}
                            </span>
                            <h3 className="text-xs sm:text-sm font-black text-white">
                              {item.influencerName}
                            </h3>
                            {item.videoId && (
                              <span className="px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[9px] font-mono font-bold">
                                #{item.videoId}
                              </span>
                            )}
                          </div>
                        </div>

                        <div>
                          <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1">
                            <Package className="w-3 h-3 text-cyan-400" />
                            Product
                          </span>
                          <p className="text-xs font-black text-cyan-300 mt-0.5">
                            {item.product}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <span
                          className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider border flex items-center gap-1 ${
                            item.readyToUpload
                              ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                              : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                          }`}
                        >
                          <Clock className="w-3 h-3" />
                          {item.readyToUpload ? 'Ready to Upload' : 'Awaiting Upload'}
                        </span>

                        {(item.scheduledDate || item.dueDate) && (
                          <span className="text-[10px] font-mono text-slate-400 flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-slate-500" />
                            {item.scheduledDate || item.dueDate}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-8 text-center my-4">
            <Video className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className="text-xs font-bold text-slate-300">No Completed Video Tasks Found</p>
            <p className="text-[11px] text-slate-500 mt-1">
              Try clearing your search or selecting "All Months / All Platforms".
            </p>
          </div>
        ) : activeTab === 'completed-tasks' ? (
          /* TAB 1: COMPLETED VIDEO TASKS LIST */
          filteredItems.map((item) => (
            <div
              key={item.id}
              className="bg-slate-900/90 border border-slate-800/90 hover:border-slate-700 rounded-2xl p-3.5 space-y-2.5 transition"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <h3 className="text-xs sm:text-sm font-black text-white truncate">
                      {item.influencerName}
                    </h3>
                    {item.videoId && (
                      <span className="px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[9px] font-mono font-bold">
                        #{item.videoId}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] font-bold text-cyan-400 truncate mt-0.5">
                    {item.product}
                  </p>
                </div>

                <span className="px-2 py-0.5 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[9px] font-black uppercase tracking-wider shrink-0 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  Completed
                </span>
              </div>

              {/* Views, Clicks, CTR Bar */}
              <div className="grid grid-cols-3 gap-2 bg-slate-950/80 border border-slate-800/80 rounded-xl p-2.5">
                <div>
                  <span className="text-[9px] font-bold uppercase text-slate-400 block">
                    Video Views
                  </span>
                  <span className="text-xs sm:text-sm font-black text-cyan-400">
                    {item.views.toLocaleString('en-IN')}
                  </span>
                </div>
                <div>
                  <span className="text-[9px] font-bold uppercase text-slate-400 block">
                    Link Clicks
                  </span>
                  <span className="text-xs sm:text-sm font-black text-amber-400">
                    {item.clicks.toLocaleString('en-IN')}
                  </span>
                </div>
                <div>
                  <span className="text-[9px] font-bold uppercase text-slate-400 block">
                    Click CTR
                  </span>
                  <span className="text-xs sm:text-sm font-black text-emerald-400">
                    {item.ctrPercent}%
                  </span>
                </div>
              </div>

              {/* Actionable Video & Tracking Links + Upload Date */}
              <div className="flex items-center justify-between gap-2 flex-wrap pt-0.5">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {item.videoLinks.map((url, idx) => (
                    <a
                      key={idx}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 text-[10px] font-bold transition"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>Video {item.videoLinks.length > 1 ? idx + 1 : ''}</span>
                    </a>
                  ))}
                  {item.shortIoLink && (
                    <a
                      href={item.shortIoLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-[10px] font-bold transition"
                    >
                      <Link2 className="w-3 h-3" />
                      <span>Short Link</span>
                    </a>
                  )}
                </div>

                {(item.uploadDate || item.dueDate) && (
                  <span className="text-[10px] font-mono text-slate-400 flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-slate-500" />
                    {item.uploadDate || item.dueDate}
                  </span>
                )}
              </div>
            </div>
          ))
        ) : activeTab === 'video-views' ? (
          /* TAB 2: VIDEO VIEWS BREAKDOWN */
          <div className="space-y-3">
            {/* Platform Views Summary */}
            <div className="grid grid-cols-3 gap-2">
              {(['Instagram', 'Facebook', 'YouTube'] as const).map((plat) => (
                <div
                  key={plat}
                  className="bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-center"
                >
                  <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block">
                    {plat}
                  </span>
                  <strong className="text-xs sm:text-sm font-black text-cyan-400 block mt-0.5">
                    {platformBreakdown[plat].views.toLocaleString('en-IN')}
                  </strong>
                  <span className="text-[9px] text-slate-500 font-semibold">
                    {platformBreakdown[plat].count} videos
                  </span>
                </div>
              ))}
            </div>

            {/* Top Creators by Video Views */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5 space-y-2.5">
              <h4 className="text-xs font-black uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
                <Award className="w-4 h-4" /> Top Creators by Video Views
              </h4>
              <div className="space-y-2">
                {creatorRankings.byViews.slice(0, 15).map((creator, idx) => {
                  const maxViews = Math.max(1, creatorRankings.byViews[0]?.views || 1);
                  const pct = Math.min(100, Math.round((creator.views / maxViews) * 100));
                  return (
                    <div
                      key={creator.name + idx}
                      className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-2.5"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-white truncate">
                          #{idx + 1} {creator.name}
                        </span>
                        <span className="font-black text-cyan-400 shrink-0">
                          {creator.views.toLocaleString('en-IN')} views
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-slate-400 mt-0.5">
                        <span>
                          {creator.completedTasks} completed task{creator.completedTasks === 1 ? '' : 's'}
                        </span>
                        <span>{creator.clicks.toLocaleString('en-IN')} clicks</span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden mt-1.5">
                        <div
                          className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          /* TAB 3: LINK CLICKS BREAKDOWN */
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
                <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block">
                  Verified Human Clicks
                </span>
                <strong className="text-base font-black text-amber-400 mt-0.5 block">
                  {summary.totalHumanClicks.toLocaleString('en-IN')}
                </strong>
                <span className="text-[10px] text-slate-500">
                  Across {summary.completedCount} completed tasks
                </span>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
                <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block">
                  Conversion Click Rate
                </span>
                <strong className="text-base font-black text-emerald-400 mt-0.5 block">
                  {summary.ctr}% CTR
                </strong>
                <span className="text-[10px] text-slate-500">
                  Clicks-to-Views Ratio
                </span>
              </div>
            </div>

            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5 space-y-2.5">
              <h4 className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4" /> Top Completed Tasks & Creators by Clicks
              </h4>
              <div className="space-y-2">
                {[...filteredItems]
                  .sort((a, b) => b.clicks - a.clicks)
                  .slice(0, 20)
                  .map((item, idx) => {
                    const topClicks = Math.max(
                      1,
                      Math.max(...filteredItems.map((i) => i.clicks || 0))
                    );
                    const pct = Math.min(100, Math.round((item.clicks / topClicks) * 100));
                    return (
                      <div
                        key={item.id}
                        className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-2.5 space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-white truncate">
                              #{idx + 1} • {item.influencerName}
                            </p>
                            <p className="text-[10px] text-slate-400 truncate">
                              {item.product} • {item.views.toLocaleString('en-IN')} views
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="text-xs font-black text-amber-400 block">
                              {item.clicks.toLocaleString('en-IN')} clicks
                            </span>
                            <span className="text-[10px] font-bold text-emerald-400">
                              {item.ctrPercent}% CTR
                            </span>
                          </div>
                        </div>
                        <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-amber-500 to-emerald-500 rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Mobile Navigation Bar */}
      <nav
        className={`${
          isStandaloneMode ? 'fixed bottom-0 left-0 right-0 max-w-lg mx-auto' : 'sticky bottom-0'
        } z-30 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 px-2.5 py-2 grid grid-cols-4 gap-1.5`}
      >
        <button
          type="button"
          onClick={() => setActiveTab('completed-tasks')}
          className={`py-2 px-1.5 rounded-xl flex flex-col items-center justify-center gap-1 text-[9px] font-black transition cursor-pointer ${
            activeTab === 'completed-tasks'
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
              : 'text-slate-400 hover:text-slate-200 border border-transparent'
          }`}
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>Completed</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('awaiting-uploads')}
          className={`py-2 px-1.5 rounded-xl flex flex-col items-center justify-center gap-1 text-[9px] font-black transition cursor-pointer ${
            activeTab === 'awaiting-uploads'
              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
              : 'text-slate-400 hover:text-slate-200 border border-transparent'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Awaiting ({summary.awaitingCount})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('video-views')}
          className={`py-2 px-1.5 rounded-xl flex flex-col items-center justify-center gap-1 text-[9px] font-black transition cursor-pointer ${
            activeTab === 'video-views'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
              : 'text-slate-400 hover:text-slate-200 border border-transparent'
          }`}
        >
          <Eye className="w-4 h-4" />
          <span>Views</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('link-clicks')}
          className={`py-2 px-1.5 rounded-xl flex flex-col items-center justify-center gap-1 text-[9px] font-black transition cursor-pointer ${
            activeTab === 'link-clicks'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
              : 'text-slate-400 hover:text-slate-200 border border-transparent'
          }`}
        >
          <MousePointerClick className="w-4 h-4" />
          <span>Clicks</span>
        </button>
      </nav>
    </div>
  );
}
