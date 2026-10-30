import React, { useState, useEffect } from 'react';
import { BarChart2, Activity, Settings, RefreshCw, X } from 'lucide-react';
import { getAccessToken } from '../lib/firebaseAuth';

interface GoogleAnalyticsTrackerProps {
  onClose?: () => void;
}

export default function GoogleAnalyticsTracker({ onClose }: GoogleAnalyticsTrackerProps) {
  const [propertyId, setPropertyId] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [reportData, setReportData] = useState<any[]>([]);
  const [startDate, setStartDate] = useState<string>('30daysAgo');
  const [isConfiguring, setIsConfiguring] = useState<boolean>(true);

  useEffect(() => {
    const saved = localStorage.getItem('GA4_PROPERTY_ID');
    if (saved) {
      setPropertyId(saved);
      setIsConfiguring(false);
    }
  }, []);

  const handleSaveConfig = () => {
    if (!propertyId.trim()) {
      setError('Please enter a valid GA4 Property ID (e.g., 123456789)');
      return;
    }
    localStorage.setItem('GA4_PROPERTY_ID', propertyId.trim());
    setIsConfiguring(false);
    fetchAnalytics();
  };

  const fetchAnalytics = async () => {
    const pId = propertyId.trim() || localStorage.getItem('GA4_PROPERTY_ID');
    if (!pId) {
      setIsConfiguring(true);
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      const token = await getAccessToken();
      if (!token) {
        throw new Error('No Google access token found. Please sign in via the main menu to authorize Google Analytics.');
      }
      
      const response = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${pId}:runReport`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          dateRanges: [{ startDate, endDate: 'today' }],
          dimensions: [{ name: 'sessionCampaignName' }, { name: 'sessionSource' }],
          metrics: [{ name: 'conversions' }, { name: 'totalUsers' }, { name: 'sessions' }]
        })
      });
      
      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(errData?.error?.message || `Analytics API error: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      const parsed = (data.rows || []).map((row: any) => ({
        campaign: row.dimensionValues[0]?.value || '(none)',
        source: row.dimensionValues[1]?.value || '(none)',
        conversions: parseInt(row.metricValues[0]?.value || '0', 10),
        users: parseInt(row.metricValues[1]?.value || '0', 10),
        sessions: parseInt(row.metricValues[2]?.value || '0', 10),
      })).filter((r: any) => r.conversions > 0 || r.users > 0)
        .sort((a: any, b: any) => b.conversions - a.conversions || b.users - a.users);
      
      setReportData(parsed);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch Google Analytics data');
      setReportData([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!isConfiguring && propertyId) {
      fetchAnalytics();
    }
  }, [startDate, isConfiguring]);

  return (
    <div className="bg-[#111] border border-gray-800 rounded-2xl p-6 shadow-xl text-gray-200">
      <div className="flex items-center justify-between mb-6">
         <div className="flex items-center gap-3">
           <div className="w-10 h-10 bg-indigo-500/20 rounded-xl flex items-center justify-center border border-indigo-500/30 text-indigo-400">
              <Activity className="w-5 h-5" />
           </div>
           <div>
             <h2 className="text-xl font-bold text-white tracking-tight">Google Analytics Conversions</h2>
             <p className="text-xs text-gray-400">Track real conversions by traffic source and campaigns directly from GA4.</p>
           </div>
         </div>
         <div className="flex items-center gap-2">
            {!isConfiguring && (
              <button title="Settings" onClick={() => setIsConfiguring(true)} className="p-2 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white transition">
                <Settings className="w-4 h-4" />
              </button>
            )}
            <button title="Refresh Data" onClick={() => fetchAnalytics()} disabled={isLoading} className="p-2 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white transition disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            {onClose && (
              <button title="Close" onClick={onClose} className="p-2 hover:bg-rose-500/10 rounded-lg text-gray-400 hover:text-rose-400 transition">
                <X className="w-4 h-4" />
              </button>
            )}
         </div>
      </div>

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-300 px-4 py-3 rounded-xl text-sm mb-6 flex justify-between items-center break-words">
           <span className="flex-1 mr-4">{error}</span>
           <button onClick={() => setError(null)} className="text-rose-400 hover:text-white shrink-0"><X className="w-4 h-4" /></button>
        </div>
      )}

      {isConfiguring ? (
        <div className="bg-black/40 p-6 rounded-xl border border-gray-800/50">
           <h3 className="text-sm font-bold text-white mb-2">Connect Your GA4 Property</h3>
           <p className="text-xs text-gray-400 mb-4 leading-relaxed">
             Go to Google Analytics &gt; Admin &gt; Property Settings. Look for your numeric <strong>Property ID</strong> (e.g., 3456789).
             Make sure your Google account authorized in this app has read access to that property.
           </p>
           
           <div className="flex flex-col sm:flex-row gap-3">
             <input
               type="text"
               value={propertyId}
               onChange={(e) => setPropertyId(e.target.value)}
               placeholder="GA4 Property ID"
               className="flex-1 bg-[#222] border border-gray-700 text-white text-sm rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 outline-none placeholder:text-gray-600"
             />
             <button
               onClick={handleSaveConfig}
               className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2.5 rounded-lg text-sm font-bold transition whitespace-nowrap"
             >
               Save & Connect
             </button>
           </div>
        </div>
      ) : (
        <div>
           <div className="flex items-center gap-2 mb-4 bg-black/40 p-1.5 rounded-lg w-max border border-gray-800/50">
              <button onClick={() => setStartDate('7daysAgo')} className={`px-4 py-1.5 text-xs font-bold rounded-md transition ${startDate === '7daysAgo' ? 'bg-indigo-500 text-white shadow-sm' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}>Last 7 Days</button>
              <button onClick={() => setStartDate('30daysAgo')} className={`px-4 py-1.5 text-xs font-bold rounded-md transition ${startDate === '30daysAgo' ? 'bg-indigo-500 text-white shadow-sm' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}>Last 30 Days</button>
              <button onClick={() => setStartDate('90daysAgo')} className={`px-4 py-1.5 text-xs font-bold rounded-md transition ${startDate === '90daysAgo' ? 'bg-indigo-500 text-white shadow-sm' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}>Last 90 Days</button>
           </div>
           
           {isLoading ? (
             <div className="py-16 flex flex-col items-center justify-center gap-4 border border-gray-800 bg-black/20 rounded-xl">
               <RefreshCw className="w-8 h-8 animate-spin text-indigo-500" />
               <p className="text-sm font-medium text-gray-400 animate-pulse">Running Custom GA4 Queries...</p>
             </div>
           ) : reportData.length === 0 ? (
             <div className="py-16 flex flex-col items-center justify-center gap-3 border border-gray-800 bg-black/20 rounded-xl">
               <BarChart2 className="w-10 h-10 text-gray-700" />
               <p className="text-sm font-medium text-gray-400">No conversions or traffic data matched for this period.</p>
             </div>
           ) : (
             <div className="overflow-x-auto border border-gray-800 rounded-xl">
               <table className="w-full text-left border-collapse">
                 <thead>
                   <tr className="bg-gray-800/30 border-b border-gray-800">
                     <th className="px-5 py-3 text-[10px] uppercase tracking-wider text-gray-400 font-bold">Campaign</th>
                     <th className="px-5 py-3 text-[10px] uppercase tracking-wider text-gray-400 font-bold">Source</th>
                     <th className="px-5 py-3 text-[10px] uppercase tracking-wider text-gray-400 font-bold text-right">Users</th>
                     <th className="px-5 py-3 text-[10px] uppercase tracking-wider text-gray-400 font-bold text-right">Sessions</th>
                     <th className="px-5 py-3 text-[10px] uppercase tracking-wider text-emerald-400 font-bold text-right border-l border-gray-800 bg-emerald-900/10">Conversions</th>
                   </tr>
                 </thead>
                 <tbody>
                   {reportData.map((row, i) => (
                     <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition">
                       <td className="px-5 py-3.5 text-sm font-medium text-white">{row.campaign}</td>
                       <td className="px-5 py-3.5 text-xs text-gray-400">{row.source}</td>
                       <td className="px-5 py-3.5 text-sm text-gray-300 font-mono text-right">{row.users.toLocaleString()}</td>
                       <td className="px-5 py-3.5 text-sm text-gray-300 font-mono text-right">{row.sessions.toLocaleString()}</td>
                       <td className="px-5 py-3.5 text-sm text-white font-mono font-black text-right border-l border-gray-800 bg-emerald-900/5 text-emerald-400">
                         {row.conversions.toLocaleString()}
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
  );
}
