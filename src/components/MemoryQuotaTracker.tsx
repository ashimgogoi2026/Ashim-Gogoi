import React, { useState, useEffect } from 'react';
import { HardDrive, Activity, Database, Server } from 'lucide-react';
import { safeLocalStorage } from '../lib/safeLocalStorage';

export default function MemoryQuotaTracker() {
  const [browserQuota, setBrowserQuota] = useState<{ usage: number, quota: number } | null>(null);
  const [lsUsage, setLsUsage] = useState<number>(0);
  
  useEffect(() => {
    // 1. Calculate localStorage rough memory usage
    let _lsTotal = 0;
    for (const key in localStorage) {
      if (localStorage.hasOwnProperty(key)) {
        _lsTotal += ((localStorage[key]?.length || 0) + key.length) * 2;
      }
    }
    setLsUsage(_lsTotal);

    // 2. Fetch origin storage quota
    if (navigator.storage && navigator.storage.estimate) {
      navigator.storage.estimate().then((estimate) => {
        setBrowserQuota({
          usage: estimate.usage || 0,
          quota: estimate.quota || 0,
        });
      }).catch(console.error);
    }
  }, []);

  const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  const lsLimitBytes = 5 * 1024 * 1024; // typical 5MB limit
  const lsUsagePerc = Math.min((lsUsage / lsLimitBytes) * 100, 100).toFixed(1);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
      {/* Firebase / Cloud Quota Panel */}
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-2xl p-5 shadow-sm text-white">
        <div className="flex items-center gap-3 border-b border-slate-700 pb-3 mb-3">
          <div className="p-2 bg-blue-500/20 text-blue-400 rounded-lg">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-slate-100 uppercase tracking-widest">Firebase Cloud Quota</h3>
            <p className="text-[10px] text-slate-400 font-mono mt-0.5">Today's Read & Write Limits (Free Tier)</p>
          </div>
        </div>
        
        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-xs mb-1 font-mono">
              <span className="text-slate-300">Document Reads</span>
              <span className="text-emerald-400 font-bold">50,000 / day</span>
            </div>
            <div className="w-full bg-slate-700 rounded-full h-1.5 overflow-hidden">
              <div className="bg-emerald-400 h-1.5 rounded-full" style={{ width: '10%' }}></div>
            </div>
            <p className="text-[9px] text-slate-400 mt-1 text-right">Reset daily at midnight Pacific Time</p>
          </div>
          
          <div>
            <div className="flex justify-between text-xs mb-1 font-mono">
              <span className="text-slate-300">Document Writes</span>
              <span className="text-amber-400 font-bold">20,000 / day</span>
            </div>
            <div className="w-full bg-slate-700 rounded-full h-1.5 overflow-hidden">
              <div className="bg-amber-400 h-1.5 rounded-full" style={{ width: '5%' }}></div>
            </div>
          </div>
        </div>
      </div>

      {/* Local Browser Storage Memory Panel */}
      <div className="bg-white border border-gray-150 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center gap-3 border-b border-gray-100 pb-3 mb-3">
          <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg border border-emerald-100">
            <HardDrive className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-gray-800 uppercase tracking-widest">Local System Memory</h3>
            <p className="text-[10px] text-gray-500 font-mono mt-0.5">Read/Write Local Storage Capacity</p>
          </div>
        </div>
        
        <div className="space-y-4">
          {/* localStorage usage */}
          <div>
            <div className="flex justify-between text-xs mb-1 font-mono">
              <span className="text-gray-600 font-bold">Session State (localStorage)</span>
              <span className="text-indigo-600 font-black">{formatBytes(lsUsage)} / ~5 MB</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
              <div className={`h-1.5 rounded-full transition-all ${parseFloat(lsUsagePerc) > 80 ? 'bg-red-500' : 'bg-indigo-500'}`} style={{ width: `${lsUsagePerc}%` }}></div>
            </div>
            <p className="text-[9px] text-gray-400 mt-1 text-right">{lsUsagePerc}% Utilized</p>
          </div>

          {/* IndexedDB/Origin Quota */}
          {browserQuota && (
            <div>
              <div className="flex justify-between text-xs mb-1 font-mono">
                <span className="text-gray-600 font-bold">Browser Cache & Assets</span>
                <span className="text-teal-600 font-black">{formatBytes(browserQuota.usage)} / {formatBytes(browserQuota.quota)}</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                <div className="bg-teal-500 h-1.5 rounded-full transition-all" style={{ width: `${Math.min((browserQuota.usage / browserQuota.quota) * 100, 100)}%` }}></div>
              </div>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
