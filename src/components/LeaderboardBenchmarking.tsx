import React, { useState } from 'react';
import { 
  Award, 
  Calendar, 
  ExternalLink, 
  Play, 
  ChevronUp, 
  ChevronDown, 
  Info, 
  User, 
  Frown, 
  Crown,
  TrendingDown,
  TrendingUp
} from 'lucide-react';
import { Influencer, Task } from '../types';

interface LeaderboardBenchmarkingProps {
  selectedMonth: string;
  setSelectedMonth: (m: string) => void;
  selectedYear: string;
  setSelectedYear: (y: string) => void;
  selectedWeek: string;
  setSelectedWeek: (w: string) => void;
  influencers: Influencer[];
  tasks: Task[];
}

export default function LeaderboardBenchmarking({ 
  selectedMonth, setSelectedMonth, selectedYear, setSelectedYear, selectedWeek, setSelectedWeek,
  influencers, tasks }: LeaderboardBenchmarkingProps) {
  // Filters state
  // Using selectedMonth from props
  // Using selectedYear from props

  // Sorting state
  const [sortBy, setSortBy] = useState<'name' | 'views' | 'clicks' | 'ctr' | 'cpc' | 'cpv'>('clicks');
  const [sortAsc, setSortAsc] = useState<boolean>(false); // default highest to lowest

  // Options for filters
  const monthsList = [
    { value: 'All', label: 'All Months' },
    { value: '01', label: 'January' },
    { value: '02', label: 'February' },
    { value: '03', label: 'March' },
    { value: '04', label: 'April' },
    { value: '05', label: 'May' },
    { value: '06', label: 'June' },
    { value: '07', label: 'July' },
    { value: '08', label: 'August' },
    { value: '09', label: 'September' },
    { value: '10', label: 'October' },
    { value: '11', label: 'November' },
    { value: '12', label: 'December' }
  ];

  const yearsList = [
    { value: 'All', label: 'All Years' },
    { value: '2025', label: '2025' },
    { value: '2026', label: '2026' },
    { value: '2027', label: '2027' }
  ];

  // Process data reactively based on influencers & tasks
  const influencerMetrics = influencers.map(inf => {
    // Collect all tasks for this creator
    const infTasks = tasks.filter(t => t.influencerId === inf.id);

    // Apply month and year filters
    const filteredTasks = infTasks.filter(t => {
      if (t.status === 'Cancelled') return false;
      
      const dateToUse = t.deadline || t.releaseDate;
      if (!dateToUse) {
         // If a specific month/year is selected, hide tasks without a date
         if (selectedYear !== 'All' || selectedMonth !== 'All') return false;
         return true;
      }
      
      const parts = dateToUse.split('-'); // [YYYY, MM, DD]
      if (parts.length >= 2) {
        const taskYear = parts[0];
        const taskMonth = parts[1];
        if (selectedYear !== 'All' && taskYear !== selectedYear) return false;
        if (selectedMonth !== 'All' && taskMonth !== selectedMonth) return false;
      }
      return true;
    });

    const totalViews = filteredTasks.reduce((sum, t) => sum + (t.views || 0), 0);
    const totalClicks = filteredTasks.reduce((sum, t) => sum + (t.clicks || 0), 0);
    const totalAmount = filteredTasks.reduce((sum, t) => sum + (t.remuneration || 0), 0);

    const ctr = totalViews > 0 ? (totalClicks / totalViews) * 100 : 0;
    const cpc = totalClicks > 0 ? totalAmount / totalClicks : 0;
    const cpv = totalViews > 0 ? totalAmount / totalViews : 0;

    // Retrieve active link
    let matchedVideoLink = '';
    // Look first in filtered tasks
    for (const t of filteredTasks) {
      if (t.videoLink1?.trim()) { matchedVideoLink = t.videoLink1.trim(); break; }
      if (t.videoLink2?.trim()) { matchedVideoLink = t.videoLink2.trim(); break; }
      if (t.videoLink3?.trim()) { matchedVideoLink = t.videoLink3.trim(); break; }
    }
    // Fallback to any lifetime tasks
    if (!matchedVideoLink) {
      for (const t of infTasks) {
        if (t.videoLink1?.trim()) { matchedVideoLink = t.videoLink1.trim(); break; }
        if (t.videoLink2?.trim()) { matchedVideoLink = t.videoLink2.trim(); break; }
      }
    }
    // Final generic fallback
    const videoLink = matchedVideoLink || inf.instagramLink || inf.youtubeLink || 'https://www.youtube.com';

    const productNames = Array.from(new Set(filteredTasks.map(t => t.title).filter(Boolean))).join(', ') || 'N/A';

    return {
      influencer: inf,
      productNames,
      views: totalViews,
      clicks: totalClicks,
      ctr,
      cpc,
      cpv,
      videoLink,
      hasRealVideo: !!matchedVideoLink,
      tasksCount: filteredTasks.length,
      rawSpent: totalAmount
    };
  });

  // Calculate sorted rankings for highlights and table
  // Top / bottom performer is evaluated based on Clicks (the standard high-intent conversion metric), falling back to Views if clicks are equal
  const sortedByClicks = [...influencerMetrics].sort((a, b) => {
    if (b.clicks !== a.clicks) {
      return b.clicks - a.clicks;
    }
    return b.views - a.views;
  });

  // Safely find Top & Bottom based on Clicks
  // Top performer: first in sorted (highest clicks)
  const topPerformer = sortedByClicks[0];
  // Bottom performer: last in sorted (lowest clicks)
  const bottomPerformer = sortedByClicks[sortedByClicks.length - 1];

  // Dynamically sort metrics for table display
  const sortedMetricsForTable = [...influencerMetrics].sort((a, b) => {
    if (sortBy === 'name') {
      const valA = a.influencer.name.toLowerCase();
      const valB = b.influencer.name.toLowerCase();
      return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
    }

    let valA = a[sortBy] as number;
    let valB = b[sortBy] as number;

    // Safety fallback for CPC or CPV where 0 would skew descending sorts
    if (sortBy === 'cpc' || sortBy === 'cpv') {
      const isZeroA = valA === 0;
      const isZeroB = valB === 0;
      // If sorting descending, non-zero should beat zero cost (which simply lacks details)
      if (!sortAsc) {
        if (isZeroA && !isZeroB) return 1;
        if (!isZeroA && isZeroB) return -1;
      } else {
        // If sorting ascending, non-zero should appear first
        if (isZeroA && !isZeroB) return 1;
        if (!isZeroA && isZeroB) return -1;
      }
    }

    if (valA === valB) return 0;
    return sortAsc ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1);
  });

  const handleSort = (field: 'name' | 'views' | 'clicks' | 'ctr' | 'cpc' | 'cpv') => {
    if (sortBy === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortBy(field);
      // default descending (highest to lowest) for numeric metrics, ascending for name
      setSortAsc(field === 'name' ? true : false);
    }
  };

  const getSortIcon = (field: typeof sortBy) => {
    if (sortBy !== field) return null;
    return sortAsc ? <ChevronUp className="w-3.5 h-3.5 ml-1 inline text-red-600" /> : <ChevronDown className="w-3.5 h-3.5 ml-1 inline text-red-600" />;
  };

  return (
    <div id="leaderboard-workspace-container" className="space-y-6">
      
      {/* HEADER & FILTERS BAR */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between pb-4 border-b border-rose-100 gap-4 relative">
        <div className="absolute -top-10 -right-10 w-64 h-64 bg-fuchsia-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob"></div>
        <div className="absolute top-10 -left-10 w-48 h-48 bg-amber-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-2000"></div>

        <div className="relative z-10">
          <h1 className="text-2xl font-black font-sans text-rose-950 tracking-tight flex items-center gap-2">
            <span className="p-1.5 px-3 bg-gradient-to-br from-rose-400 to-fuchsia-500 rounded-lg text-white shadow-sm"><Award className="w-5 h-5" /></span> Leaderboard & Benchmarks
          </h1>
          <p className="text-sm text-rose-700 mt-1 drop-shadow-sm font-medium">
            Track and compare real-time effectiveness across all influencer placements registered in the Planner.
          </p>
        </div>

        {/* Dynamic Filters Bar */}
        <div className="flex flex-wrap items-center gap-3 relative z-10">
          <div className="flex items-center gap-1.5 bg-white/60 backdrop-blur-sm border border-rose-200 rounded-lg px-2.5 py-1.5 shadow-sm">
            <Calendar className="w-4 h-4 text-rose-500" />
            <span className="text-xs font-mono font-black text-rose-800 uppercase">Filter Period:</span>
          </div>

          {/* Month Selector */}
          <select
            id="leaderboard-month-filter"
            title="Filter Leaderboard by Month"
            className="px-3 py-1.5 border border-rose-200 bg-white/80 backdrop-blur-sm text-xs font-bold rounded-lg text-rose-900 shadow-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-400 transition cursor-pointer"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
          >
            {monthsList.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>

          {/* Year Selector */}
          <select
            id="leaderboard-year-filter"
            title="Filter Leaderboard by Year"
            className="px-3 py-1.5 border border-rose-200 bg-white/80 backdrop-blur-sm text-xs font-bold rounded-lg text-rose-900 shadow-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-400 transition cursor-pointer"
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
          >
            {yearsList.map(y => (
              <option key={y.value} value={y.value}>{y.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* TOP & BOTTOM HIGHLIGHTS CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Top Performer Card */}
        {topPerformer && (
          <div id="highlight-top-performer" className="bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl p-5 shadow-lg text-white relative overflow-hidden transition hover:shadow-xl hover:-translate-y-1">
            <div className="absolute -top-10 -right-10 w-32 h-32 bg-yellow-300 rounded-full mix-blend-multiply filter blur-2xl opacity-50 pointer-events-none animate-blob" />
            
            <div className="flex items-center justify-between pb-3.5 border-b border-white/20">
              <span className="inline-flex items-center gap-1.5 bg-white/20 backdrop-blur-sm border border-white/30 text-white text-[10px] font-black tracking-wider uppercase px-2.5 py-1 rounded-full font-mono shadow-sm">
                <Crown className="w-3.5 h-3.5 text-yellow-300 fill-yellow-300 animate-pulse" /> Top Performer
              </span>
              <span className="text-xs font-mono font-bold text-amber-50">Clicks-Driven Lead</span>
            </div>

            <div className="flex items-center gap-4 py-4 relative z-10">
              <img
                src={topPerformer.influencer.avatar}
                alt={topPerformer.influencer.name}
                className="w-14 h-14 rounded-full object-cover border-2 border-white shadow-md bg-white/50"
                referrerPolicy="no-referrer"
              />
              <div className="min-w-0">
                <h4 className="font-bold text-white text-base tracking-tight leading-tight flex items-center gap-1 drop-shadow-sm">
                  {topPerformer.influencer.name}
                </h4>
                <p className="text-xs text-amber-100 font-mono font-bold mt-0.5 drop-shadow-sm">{topPerformer.influencer.handle}</p>
                <p className="text-[11px] text-amber-50/80 truncate mt-0.5 font-medium">{topPerformer.influencer.niche}</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center bg-white/20 backdrop-blur-md p-3 rounded-xl border border-white/20 shadow-inner relative z-10">
              <div>
                <span className="text-[9px] text-amber-50 uppercase font-mono block font-bold">Views</span>
                <span className="text-sm font-black font-mono text-white drop-shadow-sm">{topPerformer.views.toLocaleString()}</span>
              </div>
              <div>
                <span className="text-[9px] text-amber-50 uppercase font-mono block font-bold">Clicks</span>
                <span className="text-sm font-black font-mono text-white drop-shadow-sm">{topPerformer.clicks.toLocaleString()}</span>
              </div>
              <div>
                <span className="text-[9px] text-amber-50 uppercase font-mono block font-bold">CTR (%)</span>
                <span className="text-sm font-black font-mono text-white drop-shadow-sm">{topPerformer.ctr.toFixed(2)}%</span>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between relative z-10">
              <p className="text-[10px] text-amber-100 font-mono font-medium">
                Source: {topPerformer.tasksCount} integrated placement{topPerformer.tasksCount !== 1 ? 's' : ''}
              </p>
              <a
                href={topPerformer.videoLink}
                target="_blank"
                rel="noopener noreferrer"
                id={`watch-top-video-btn`}
                className="inline-flex items-center gap-1.5 bg-white text-amber-700 hover:bg-amber-50 text-xs font-black px-4 py-2 rounded-xl shadow-md transition active:scale-95"
              >
                <Play className="w-3.5 h-3.5 fill-amber-700" /> Watch Top Video <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        )}

        {/* Bottom Performer Card */}
        {bottomPerformer && (
          <div id="highlight-bottom-performer" className="bg-gradient-to-br from-rose-400 to-rose-600 rounded-2xl p-5 shadow-lg text-white relative overflow-hidden transition hover:shadow-xl hover:-translate-y-1">
            <div className="absolute -top-10 -left-10 w-32 h-32 bg-rose-300 rounded-full mix-blend-multiply filter blur-2xl opacity-40 pointer-events-none animate-blob" />
            
            <div className="flex items-center justify-between pb-3.5 border-b border-white/20">
              <span className="inline-flex items-center gap-1.5 bg-white/20 backdrop-blur-sm border border-white/30 text-white text-[10px] font-black tracking-wider uppercase px-2.5 py-1 rounded-full font-mono shadow-sm">
                <Frown className="w-3.5 h-3.5 text-rose-200" /> Bottom Performer
              </span>
              <span className="text-xs font-mono font-bold text-rose-100">Needs Optimization</span>
            </div>

            <div className="flex items-center gap-4 py-4 relative z-10">
              <img
                src={bottomPerformer.influencer.avatar}
                alt={bottomPerformer.influencer.name}
                className="w-14 h-14 rounded-full object-cover border-2 border-white shadow-md bg-white/50 grayscale opacity-90"
                referrerPolicy="no-referrer"
              />
              <div className="min-w-0">
                <h4 className="font-bold text-white text-base tracking-tight leading-tight flex items-center gap-1 drop-shadow-sm">
                  {bottomPerformer.influencer.name}
                </h4>
                <p className="text-xs text-rose-200 font-mono font-bold mt-0.5 drop-shadow-sm">{bottomPerformer.influencer.handle}</p>
                <p className="text-[11px] text-rose-100/80 truncate mt-0.5 font-medium">{bottomPerformer.influencer.niche}</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center bg-white/20 backdrop-blur-md p-3 rounded-xl border border-white/20 shadow-inner relative z-10">
              <div>
                <span className="text-[9px] text-rose-100 uppercase font-mono block font-bold">Views</span>
                <span className="text-sm font-black font-mono text-white drop-shadow-sm">{bottomPerformer.views.toLocaleString()}</span>
              </div>
              <div>
                <span className="text-[9px] text-rose-100 uppercase font-mono block font-bold">Clicks</span>
                <span className="text-sm font-black font-mono text-white drop-shadow-sm">{bottomPerformer.clicks.toLocaleString()}</span>
              </div>
              <div>
                <span className="text-[9px] text-rose-100 uppercase font-mono block font-bold">CTR (%)</span>
                <span className="text-sm font-black font-mono text-white drop-shadow-sm">{bottomPerformer.ctr.toFixed(2)}%</span>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between relative z-10">
              <p className="text-[10px] text-rose-100 font-mono font-medium">
                Source: {bottomPerformer.tasksCount} integrated placement{bottomPerformer.tasksCount !== 1 ? 's' : ''}
              </p>
              <a
                href={bottomPerformer.videoLink}
                target="_blank"
                rel="noopener noreferrer"
                id={`watch-bottom-video-btn`}
                className="inline-flex items-center gap-1.5 bg-white text-rose-700 hover:bg-rose-50 text-xs font-black px-4 py-2 rounded-xl shadow-md transition active:scale-95"
              >
                <Play className="w-3.5 h-3.5 fill-rose-700" /> Watch Placement Video <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        )}

      </div>

      {/* DETAILED LEADERBOARD TABLE */}
      <div className="bg-white rounded-xl border border-indigo-100 overflow-hidden shadow-md relative z-10">
        
        <div className="p-4 border-b border-indigo-100 bg-gradient-to-r from-indigo-50 to-fuchsia-50/50 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-bold text-sm text-indigo-900 font-sans flex items-center gap-1.5">
            <span className="p-1 bg-white shadow-sm rounded-md"><Award className="w-4 h-4 text-fuchsia-600" /></span> Sourced Creator Placement Leaderboard
          </h3>
          <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-indigo-400">
            <Info className="w-3.5 h-3.5 text-indigo-300 shrink-0" />
            <span>Click any column header to toggle descending/ascending order.</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse" id="leaderboard-data-table">
            <thead>
              <tr className="border-b border-indigo-100/50">
                <th 
                  scope="col" 
                  onClick={() => handleSort('name')}
                  className="px-5 py-3 text-left text-[10px] font-black font-mono text-indigo-800 uppercase tracking-widest bg-indigo-50/30 cursor-pointer select-none hover:bg-indigo-100/50 transition border-r border-indigo-50"
                >
                  <div className="flex items-center">
                    Influencer Name {getSortIcon('name')}
                  </div>
                </th>
                
                <th 
                  scope="col" 
                  className="px-5 py-3 text-left text-[10px] font-black font-mono text-indigo-800 uppercase tracking-widest bg-indigo-50/30 select-none border-r border-indigo-50"
                >
                  <div className="flex items-center">
                    Product Name
                  </div>
                </th>
                
                <th 
                  scope="col" 
                  onClick={() => handleSort('views')}
                  className="px-5 py-3 text-right text-[10px] font-black font-mono text-indigo-800 uppercase tracking-widest bg-indigo-50/30 cursor-pointer select-none hover:bg-indigo-100/50 transition w-32 border-r border-indigo-50"
                >
                  <div className="flex items-center justify-end">
                    Views {getSortIcon('views')}
                  </div>
                </th>

                <th 
                  scope="col" 
                  onClick={() => handleSort('clicks')}
                  className="px-5 py-3 text-right text-[10px] font-black font-mono text-indigo-800 uppercase tracking-widest bg-indigo-50/30 cursor-pointer select-none hover:bg-indigo-100/50 transition w-32 border-r border-indigo-50"
                >
                  <div className="flex items-center justify-end">
                    Clicks {getSortIcon('clicks')}
                  </div>
                </th>

                <th 
                  scope="col" 
                  onClick={() => handleSort('ctr')}
                  className="px-5 py-3 text-right text-[10px] font-black font-mono text-indigo-800 uppercase tracking-widest bg-indigo-50/30 cursor-pointer select-none hover:bg-indigo-100/50 transition w-32 border-r border-indigo-50"
                >
                  <div className="flex items-center justify-end">
                    CTR (%) {getSortIcon('ctr')}
                  </div>
                </th>

                <th 
                  scope="col" 
                  onClick={() => handleSort('cpc')}
                  className="px-5 py-3 text-right text-[10px] font-black font-mono text-indigo-800 uppercase tracking-widest bg-indigo-50/30 cursor-pointer select-none hover:bg-indigo-100/50 transition w-32 border-r border-indigo-50"
                >
                  <div className="flex items-center justify-end">
                    CPC (₹) {getSortIcon('cpc')}
                  </div>
                </th>

                <th 
                  scope="col" 
                  onClick={() => handleSort('cpv')}
                  className="px-5 py-3 text-right text-[10px] font-black font-mono text-indigo-800 uppercase tracking-widest bg-indigo-50/30 cursor-pointer select-none hover:bg-indigo-100/50 transition w-32 border-r border-indigo-50"
                >
                  <div className="flex items-center justify-end">
                    CPV (₹) {getSortIcon('cpv')}
                  </div>
                </th>
                
                <th 
                  scope="col" 
                  className="px-5 py-3 text-center text-[10px] font-black font-mono text-indigo-800 uppercase tracking-widest bg-indigo-50/30 select-none w-24"
                >
                  <div className="flex items-center justify-center">
                    Video
                  </div>
                </th>
              </tr>
            </thead>
            
            <tbody className="divide-y divide-indigo-50">
              {sortedMetricsForTable.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-sm text-indigo-400">
                    <Info className="w-5 h-5 mx-auto text-indigo-300 mb-1" />
                    No active performance data found matching the selected month and year filters.
                  </td>
                </tr>
              ) : (
                sortedMetricsForTable.map((row, index) => {
                  const isTop = topPerformer && row.influencer.id === topPerformer.influencer.id;
                  const isBottom = bottomPerformer && row.influencer.id === bottomPerformer.influencer.id;

                  return (
                    <tr 
                      key={row.influencer.id} 
                      className={`hover:bg-fuchsia-50/30 transition-colors ${
                        isTop ? 'bg-amber-50/50' : isBottom ? 'bg-rose-50/50' : ''
                      }`}
                    >
                      {/* INFLUENCER NAME */}
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <img
                            src={row.influencer.avatar}
                            alt={row.influencer.name}
                            className={`w-9 h-9 rounded-full object-cover shrink-0 shadow-sm ${
                              isTop ? 'ring-2 ring-amber-400' : isBottom ? 'ring-2 ring-rose-300' : 'border border-indigo-200'
                            }`}
                            referrerPolicy="no-referrer"
                          />
                          <div className="min-w-0">
                            <div className="font-bold text-indigo-950 text-xs leading-tight flex items-center gap-1">
                              {row.influencer.name}
                              {isTop && (
                                <span className="text-[8px] bg-amber-100 text-amber-800 font-bold px-1 py-0.5 rounded flex items-center gap-0.5">
                                  <Crown className="w-2.5 h-2.5" /> TOP
                                </span>
                              )}
                              {isBottom && (
                                <span className="text-[8px] bg-rose-100 text-rose-800 font-bold px-1 py-0.5 rounded">
                                  REG
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-indigo-600/70 font-mono mt-0.5 block">{row.influencer.handle}</span>
                          </div>
                        </div>
                      </td>

                      {/* PRODUCT NAME */}
                      <td className="px-5 py-3.5 whitespace-nowrap text-left text-[11px] font-sans font-semibold text-indigo-800">
                        {row.productNames}
                      </td>

                      {/* VIEWS */}
                      <td className={`px-5 py-3.5 whitespace-nowrap text-right font-mono text-xs ${
                        sortBy === 'views' ? 'font-bold text-indigo-950 bg-fuchsia-50/50' : 'text-indigo-800/80'
                      }`}>
                        {row.views.toLocaleString()}
                      </td>

                      {/* CLICKS */}
                      <td className={`px-5 py-3.5 whitespace-nowrap text-right font-mono text-xs ${
                        sortBy === 'clicks' ? 'font-black text-fuchsia-700 bg-fuchsia-50/50' : 'text-indigo-900 font-semibold'
                      }`}>
                        {row.clicks.toLocaleString()}
                      </td>

                      {/* CTR (%) */}
                      <td className="px-5 py-3.5 whitespace-nowrap text-right font-mono text-xs font-bold text-emerald-600">
                        {row.ctr.toFixed(2)}%
                      </td>

                      {/* CPC (₹) */}
                      <td className="px-5 py-3.5 whitespace-nowrap text-right font-mono text-xs text-indigo-800">
                        {row.clicks > 0 ? `₹${row.cpc.toFixed(2)}` : '₹0.00'}
                      </td>

                      {/* CPV (₹) */}
                      <td className="px-5 py-3.5 whitespace-nowrap text-right font-mono text-xs text-indigo-800">
                        {row.views > 0 ? `₹${row.cpv.toFixed(3)}` : '₹0.000'}
                      </td>

                      {/* VIDEO LINK */}
                      <td className="px-5 py-3.5 whitespace-nowrap text-center">
                        <a
                          href={row.videoLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`inline-flex items-center justify-center p-1.5 rounded-lg transition ${
                            row.hasRealVideo 
                              ? 'bg-rose-100/50 text-rose-600 hover:bg-rose-100 hover:text-rose-700' 
                              : 'bg-indigo-50 text-indigo-400 hover:bg-indigo-100 hover:text-indigo-600'
                          }`}
                          title={row.hasRealVideo ? "Watch placement video" : "View profile"}
                        >
                          <Play className={`w-3.5 h-3.5 ${row.hasRealVideo ? 'fill-current' : ''}`} />
                        </a>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

      </div>

      {/* METRICS INFO BOX */}
      <div className="p-4 bg-gradient-to-r from-fuchsia-50 to-indigo-50 border border-fuchsia-100 rounded-xl flex items-start gap-3 shadow-sm relative overflow-hidden z-10">
        <Info className="w-5 h-5 text-fuchsia-600 shrink-0 mt-0.5" />
        <div className="space-y-1 relative z-10">
          <h4 className="font-bold text-xs text-indigo-950 font-sans">Formula Definition Rules</h4>
          <p className="text-[11px] text-indigo-900/80 leading-relaxed font-sans">
            <strong>CTR (%)</strong> is computed as <code className="bg-white/60 px-1 py-0.5 rounded text-fuchsia-800 font-bold border border-fuchsia-200">(Clicks / Views) × 100</code>.
            <strong> CPC (₹)</strong> is computed as <code className="bg-white/60 px-1 py-0.5 rounded text-fuchsia-800 font-bold border border-fuchsia-200">Spent Amount / Clicks</code>.
            <strong> CPV (₹)</strong> is computed as <code className="bg-white/60 px-1 py-0.5 rounded text-fuchsia-800 font-bold border border-fuchsia-200">Spent Amount / Views</code>.
            Sample Cost is excluded from all cost metrics to remain aligned with base campaign allocation budgets.
          </p>
        </div>
      </div>

    </div>
  );
}
