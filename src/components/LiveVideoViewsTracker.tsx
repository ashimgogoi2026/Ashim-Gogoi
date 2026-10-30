import React, { useState, useEffect, useRef } from 'react';
import { Eye, BarChart2, Video, TrendingUp, AlertCircle, PlayCircle, Filter, Users, RefreshCw, PlusCircle, Trophy, MessageCircle, Check, Clock, Calendar, Film, History, ArrowUpRight, HelpCircle, X, SlidersHorizontal, ShieldCheck, ShieldAlert, Sparkles, Edit3 } from 'lucide-react';
import { Task, Influencer } from '../types';
import LinkPreview from './LinkPreview';
import { formatToKolkataTime, verifyRealUploadDateTime, VerifiedUploadDateTime } from '../lib/kolkataTime';
import { triggerUpdateWhatsAppModal } from '../lib/whatsappPrompt';
import { openWhatsAppChat } from '../lib/whatsappHelper';
import AllReelsDirectoryModal, { detectReelPlatform } from './AllReelsDirectoryModal';
import { formatDateToDMY } from '../lib/dateUtils';

interface LiveVideoViewsTrackerProps {
  influencerFilter?: string;
  setInfluencerFilter?: (s: string) => void;
  videoIdFilter?: string;
  setVideoIdFilter?: (s: string) => void;
  selectedMonth: string;
  setSelectedMonth: (m: string) => void;
  selectedYear: string;
  setSelectedYear: (y: string) => void;
  selectedWeek: string;
  setSelectedWeek: (w: string) => void;
  tasks: Task[];
  influencers: Influencer[];
  onUpdateTask?: (taskId: string, updates: Partial<Task>) => void;
  onUpdateTasksBulk?: (bulkUpdates: {id: string, updates: Partial<Task>}[]) => void;
  onUpdateInfluencer?: (id: string, updates: Partial<Influencer>) => void;
}

export default function LiveVideoViewsTracker({ influencerFilter = 'ALL', setInfluencerFilter = () => {}, videoIdFilter = '', setVideoIdFilter = () => {},   tasks, influencers, onUpdateTask, onUpdateTasksBulk, onUpdateInfluencer, selectedMonth, setSelectedMonth, selectedYear, setSelectedYear, selectedWeek, setSelectedWeek }: LiveVideoViewsTrackerProps) {
  const monthFilter = selectedMonth;
  const setMonthFilter = setSelectedMonth;
  const yearFilter = selectedYear;
  const setYearFilter = setSelectedYear;
  const weekFilter = selectedWeek;
  const setWeekFilter = setSelectedWeek;

  const [linkPreviews, setLinkPreviews] = useState<Record<string, { loading?: boolean; data?: any }>>(() => {
    try {
      const saved = localStorage.getItem('PTG_LIVE_LINK_PREVIEWS_CACHE_V2');
      if (saved) {
        const parsed = JSON.parse(saved);
        const cleaned: Record<string, { loading?: boolean; data?: any }> = {};
        for (const [k, v] of Object.entries(parsed)) {
          if (v && typeof v === 'object' && (v as any).data) {
            cleaned[k] = { loading: false, data: (v as any).data };
          }
        }
        return cleaned;
      }
    } catch {}
    return {};
  });
  const [isRefreshingAll, setIsRefreshingAll] = useState(false);
  const [autoFetchEnabled, setAutoFetchEnabled] = useState(false);
  const [refreshingTaskIds, setRefreshingTaskIds] = useState<Record<string, boolean>>({});
  const [refreshedStatus, setRefreshedStatus] = useState<Record<string, 'success' | 'no-links' | 'idle'>>({});
  const fetchedInSessionRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    try {
      const serializable: Record<string, { data?: any }> = {};
      for (const [k, v] of Object.entries(linkPreviews)) {
        if (v?.data) {
          serializable[k] = { data: v.data };
        }
      }
      localStorage.setItem('PTG_LIVE_LINK_PREVIEWS_CACHE_V2', JSON.stringify(serializable));
    } catch {}
  }, [linkPreviews]);

  // Abnormal View Monitor System State
  const [abnormalMonitorEnabled, setAbnormalMonitorEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('PTG_ABNORMAL_MONITOR_ENABLED');
      return saved !== null ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });
  const [abnormalThreshold, setAbnormalThreshold] = useState<string>(() => {
    try {
      return localStorage.getItem('PTG_ABNORMAL_VIEW_THRESHOLD') || 'AUTO';
    } catch {
      return 'AUTO';
    }
  });
  const [showMonitorLog, setShowMonitorLog] = useState(false);
  const [monitorBanner, setMonitorBanner] = useState<{ message: string; type: 'success' | 'warning' | 'info' } | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem('PTG_ABNORMAL_MONITOR_ENABLED', JSON.stringify(abnormalMonitorEnabled));
    } catch {}
  }, [abnormalMonitorEnabled]);

  useEffect(() => {
    try {
      localStorage.setItem('PTG_ABNORMAL_VIEW_THRESHOLD', abnormalThreshold);
    } catch {}
  }, [abnormalThreshold]);

  // Helper to evaluate whether a raw scraped view count is abnormal based on the active monitor threshold
  const evaluateLinkViewCandidate = (
    rawViews: number | undefined,
    previewData: any,
    thresholdSetting: string,
    monitorActive: boolean
  ): {
    acceptedOriginalViews: number | undefined;
    isAbnormalStopped: boolean;
    stoppedValue?: number;
    reason?: string;
  } => {
    const serverBlocked = Boolean(previewData?.abnormalMonitor?.abnormalBlocked);
    const serverBlockedVal = previewData?.abnormalMonitor?.blockedAbnormalValue;
    const serverReason = previewData?.abnormalMonitor?.blockReason;

    if (rawViews === undefined || rawViews === null || isNaN(Number(rawViews)) || Number(rawViews) <= 0) {
      if (monitorActive && serverBlocked && serverBlockedVal) {
        return {
          acceptedOriginalViews: undefined,
          isAbnormalStopped: true,
          stoppedValue: Number(serverBlockedVal),
          reason: serverReason || 'Stopped abnormal unverified feed view; showing only original views'
        };
      }
      return { acceptedOriginalViews: undefined, isAbnormalStopped: false };
    }

    const numericViews = Math.round(Number(rawViews));
    if (!monitorActive) {
      return { acceptedOriginalViews: numericViews, isAbnormalStopped: false };
    }

    const maxAllowed = thresholdSetting === 'AUTO' ? 2000000 : parseInt(thresholdSetting, 10) || 1000000;

    // 1. Check against user-selected or Auto ceiling
    if (numericViews > maxAllowed) {
      return {
        acceptedOriginalViews: undefined,
        isAbnormalStopped: true,
        stoppedValue: numericViews,
        reason: `Stopped abnormal view (${numericViews.toLocaleString()}) exceeding normal threshold (${maxAllowed.toLocaleString()})`
      };
    }

    // 2. In AUTO mode, check engagement plausibility if likes are reported
    const likes = Number(previewData?.likes) || 0;
    if (thresholdSetting === 'AUTO' && likes > 0 && numericViews > 250000 && numericViews / likes > 4500) {
      return {
        acceptedOriginalViews: undefined,
        isAbnormalStopped: true,
        stoppedValue: numericViews,
        reason: `Stopped abnormal view spike (${numericViews.toLocaleString()}) disproportionate to ${likes} likes`
      };
    }

    // 3. If server already blocked a higher abnormal secondary/feed view and kept the original view
    if (serverBlocked && serverBlockedVal && Number(serverBlockedVal) !== numericViews) {
      return {
        acceptedOriginalViews: numericViews,
        isAbnormalStopped: true,
        stoppedValue: Number(serverBlockedVal),
        reason: serverReason || `Stopped abnormal feed view (${Number(serverBlockedVal).toLocaleString()}); locked to Original Link View (${numericViews.toLocaleString()})`
      };
    }

    return { acceptedOriginalViews: numericViews, isAbnormalStopped: false };
  };

  const getTaskCreationDate = (task: Task): string => {
    if (task.createdAt) {
      try {
        const d = new Date(task.createdAt);
        if (!isNaN(d.getTime())) {
          return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        }
      } catch {}
    }
    if (task.releaseDate) return formatDateToDMY(task.releaseDate);
    if (task.deadline) return formatDateToDMY(task.deadline);
    return 'When Created';
  };

  useEffect(() => {
    let intervalId: NodeJS.Timeout;
    if (autoFetchEnabled) {
      window.dispatchEvent(new Event('TRIGGER_CENTRAL_REFRESH'));
      intervalId = setInterval(() => {
        window.dispatchEvent(new Event('TRIGGER_CENTRAL_REFRESH'));
      }, 5 * 60 * 1000); // 5 minutes
    }
    return () => clearInterval(intervalId);
  }, [autoFetchEnabled]);
  const [whatsappTimestamps, setWhatsappTimestamps] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem('PTG_WHATSAPP_TIMESTAMPS') || '{}');
    } catch {
      return {};
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('PTG_WHATSAPP_TIMESTAMPS', JSON.stringify(whatsappTimestamps));
    } catch (e) {
      console.warn('Failed to save whatsapp timestamps to localStorage:', e);
    }
  }, [whatsappTimestamps]);

  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const linkPreviewsRef = useRef(linkPreviews);
  linkPreviewsRef.current = linkPreviews;

  useEffect(() => {
    const handleGlobalRefresh = () => {
      handleRefreshAllPreviews();
    };
    window.addEventListener('TRIGGER_CENTRAL_REFRESH', handleGlobalRefresh);
    // Auto-fetch real live views from links on mount
    handleRefreshAllPreviews();
    return () => window.removeEventListener('TRIGGER_CENTRAL_REFRESH', handleGlobalRefresh);
  }, []);

  // Automatically fetch link previews whenever tasks load from Firestore or new video links appear
  useEffect(() => {
    if (!tasks || tasks.length === 0) return;
    const missingUrls: string[] = [];
    tasks
      .filter((t: Task) => t.status === 'Completed' && (Boolean(t.videoLink1?.trim()) || Boolean(t.videoLink2?.trim()) || Boolean(t.videoLink3?.trim())))
      .forEach((t: Task) => {
        [t.videoLink1, t.videoLink2, t.videoLink3].forEach(link => {
          const trimmed = link?.trim();
          if (!trimmed) return;
          const existing = linkPreviewsRef.current[trimmed];
          const needsFetch =
            !existing ||
            (!existing.loading && (!existing.data || !existing.data.publishedDate) && !fetchedInSessionRef.current.has(trimmed));
          if (needsFetch && !missingUrls.includes(trimmed)) {
            missingUrls.push(trimmed);
            fetchedInSessionRef.current.add(trimmed);
          }
        });
      });

    if (missingUrls.length === 0) return;

    let cancelled = false;
    (async () => {
      setLinkPreviews(prev => {
        const next = { ...prev };
        missingUrls.forEach(u => {
          next[u] = { ...next[u], loading: true };
        });
        return next;
      });

      const batchSize = 5;
      for (let i = 0; i < missingUrls.length; i += batchSize) {
        if (cancelled) break;
        const batch = missingUrls.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map(async url => {
            const data = await fetchPreviewForUrl(url);
            return { url, data };
          })
        );
        if (cancelled) break;
        setLinkPreviews(prev => {
          const next = { ...prev };
          batchResults.forEach(({ url, data }) => {
            next[url] = { loading: false, data: data || prev[url]?.data };
          });
          return next;
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tasks]);

  const fetchPreviewForUrl = async (url: string) => {
    try {
      const res = await fetch('/api/link-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      const json = await res.json();
      return json.success ? json : null;
    } catch {
      return null;
    }
  };

  const handleRefreshAllPreviews = async () => {
    setIsRefreshingAll(true);
    const urlsToFetch = new Set<string>();
    const currentTasks = tasksRef.current || [];
    
    currentTasks.filter((t: Task) => t.status === 'Completed' && (Boolean(t.videoLink1?.trim()) || Boolean(t.videoLink2?.trim()) || Boolean(t.videoLink3?.trim()))).forEach((t: Task) => {
      if (t.videoLink1?.trim()) urlsToFetch.add(t.videoLink1.trim());
      if (t.videoLink2?.trim()) urlsToFetch.add(t.videoLink2.trim());
      if (t.videoLink3?.trim()) urlsToFetch.add(t.videoLink3.trim());
    });

    const initialPreviews = { ...linkPreviewsRef.current };
    urlsToFetch.forEach(url => {
        initialPreviews[url] = { ...initialPreviews[url], loading: true };
    });
    setLinkPreviews({ ...initialPreviews });

    // Fetch in batches of 6 for network stability
    const urlArray = Array.from(urlsToFetch);
    const results: { url: string; data: any }[] = [];
    const batchSize = 6;

    for (let i = 0; i < urlArray.length; i += batchSize) {
      const batch = urlArray.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async url => {
          const data = await fetchPreviewForUrl(url);
          return { url, data };
        })
      );
      results.push(...batchResults);
    }

    const updatedPreviews = { ...linkPreviewsRef.current };
    results.forEach(({ url, data }) => {
       if (data) updatedPreviews[url] = { loading: false, data };
       else updatedPreviews[url] = { loading: false, data: linkPreviewsRef.current[url]?.data };
    });
    setLinkPreviews(updatedPreviews);
    setIsRefreshingAll(false);
    
    // Auto sync after refresh (with Abnormal View Monitor protection: strictly sync only verified Original Views)
    const updates: {id: string, updates: Partial<Task>}[] = [];
    currentTasks.filter((t: Task) => t.status === 'Completed' && (Boolean(t.videoLink1?.trim()) || Boolean(t.videoLink2?.trim()) || Boolean(t.videoLink3?.trim()))).forEach((task: Task) => {
      let taskViews = 0;
      let hasPreviewWithViews = false;
      let anyLinkBlockedAbnormal = false;
      const checkAndAdd = (link: string | undefined, linkIndex: 1 | 2 | 3) => {
        if (link && link.trim()) {
          const trimmed = link.trim();
          const manualViews = task[`videoLink${linkIndex}Views` as keyof typeof task] as number | undefined;
          if (manualViews !== undefined && manualViews !== null && !isNaN(Number(manualViews))) {
            taskViews += Math.max(0, Number(manualViews));
            hasPreviewWithViews = true;
          } else {
            const pData = updatedPreviews[trimmed]?.data;
            const rawV = pData?.originalViews ?? pData?.views;
            const evalRes = evaluateLinkViewCandidate(rawV, pData, abnormalThreshold, abnormalMonitorEnabled);
            if (evalRes.isAbnormalStopped) anyLinkBlockedAbnormal = true;
            if (evalRes.acceptedOriginalViews !== undefined && evalRes.acceptedOriginalViews >= 0) {
              taskViews += evalRes.acceptedOriginalViews;
              hasPreviewWithViews = true;
            }
          }
        }
      };
      checkAndAdd(task.videoLink1, 1);
      checkAndAdd(task.videoLink2, 2);
      checkAndAdd(task.videoLink3, 3);

      const maxAllowed = abnormalThreshold === 'AUTO' ? 2000000 : parseInt(abnormalThreshold, 10) || 1000000;
      const storedViews = Number(task.views) || 0;
      const storedIsAbnormal = abnormalMonitorEnabled && (storedViews > maxAllowed || (anyLinkBlockedAbnormal && !hasPreviewWithViews && storedViews > 0));

      if (hasPreviewWithViews || storedIsAbnormal) {
        taskViews = hasPreviewWithViews ? Math.max(0, Math.round(taskViews)) : 0;
        const remunerationValue = Math.max(0, Number(task.remuneration) || 0);
        const clicksValue = Math.max(0, Number(task.clicks) || 0);
        const conversionsValue = Math.max(0, Number(task.conversions) || (clicksValue > 0 ? Math.max(1, Math.floor(clicksValue * 0.024)) : 0));
        const ctrValue = taskViews > 0 ? parseFloat(((clicksValue / taskViews) * 100).toFixed(2)) : 0;
        const cpvValue = taskViews > 0 ? parseFloat((remunerationValue / taskViews).toFixed(3)) : 0;
        const cvrBase = clicksValue > 0 ? clicksValue : taskViews;
        const cvrValue = cvrBase > 0 ? parseFloat(((conversionsValue / cvrBase) * 100).toFixed(2)) : 0;

        if (storedViews !== taskViews) {
          updates.push({ 
            id: task.id, 
            updates: { 
              views: taskViews, 
              ctr: isNaN(ctrValue) ? 0 : ctrValue, 
              cpv: isNaN(cpvValue) ? 0 : cpvValue, 
              conversions: isNaN(conversionsValue) ? 0 : conversionsValue, 
              cvr: isNaN(cvrValue) ? 0 : cvrValue,
            } 
          });
        }
      }
    });

    if (updates.length > 0 && onUpdateTasksBulk) {
      onUpdateTasksBulk(updates);
    }
  };

  const handleRefreshSingleTask = async (task: Task) => {
    const taskId = task.id;
    if (refreshingTaskIds[taskId]) return;

    const urlsToFetch: string[] = [];
    if (task.videoLink1?.trim()) urlsToFetch.push(task.videoLink1.trim());
    if (task.videoLink2?.trim()) urlsToFetch.push(task.videoLink2.trim());
    if (task.videoLink3?.trim()) urlsToFetch.push(task.videoLink3.trim());

    if (urlsToFetch.length === 0) {
      setRefreshedStatus(prev => ({ ...prev, [taskId]: 'no-links' }));
      setTimeout(() => {
        setRefreshedStatus(prev => ({ ...prev, [taskId]: 'idle' }));
      }, 2500);
      return;
    }

    setRefreshingTaskIds(prev => ({ ...prev, [taskId]: true }));

    try {
      setLinkPreviews(prev => {
        const next = { ...prev };
        urlsToFetch.forEach(u => {
          next[u] = { ...next[u], loading: true };
        });
        return next;
      });

      const results = await Promise.all(
        urlsToFetch.map(async url => {
          const data = await fetchPreviewForUrl(url);
          return { url, data };
        })
      );

      let updatedPreviewsForTask: Record<string, { loading?: boolean; data?: any }> = {};
      setLinkPreviews(prev => {
        const next = { ...prev };
        results.forEach(({ url, data }) => {
          if (data) next[url] = { loading: false, data };
          else next[url] = { loading: false, data: prev[url]?.data };
        });
        updatedPreviewsForTask = next;
        return next;
      });

      let taskViews = 0;
      let hasPreviewWithViews = false;
      let anyLinkBlockedAbnormal = false;

      const checkAndAdd = (link: string | undefined, linkIndex: 1 | 2 | 3) => {
        if (link && link.trim()) {
          const trimmed = link.trim();
          const manualViews = task[`videoLink${linkIndex}Views` as keyof typeof task] as number | undefined;
          if (manualViews !== undefined && manualViews !== null && !isNaN(Number(manualViews))) {
            taskViews += Math.max(0, Number(manualViews));
            hasPreviewWithViews = true;
          } else {
            const fetchedResult = results.find(r => r.url === trimmed);
            const pData = fetchedResult?.data ?? updatedPreviewsForTask[trimmed]?.data;
            const rawViews = pData?.originalViews ?? pData?.views;
            const evalRes = evaluateLinkViewCandidate(rawViews, pData, abnormalThreshold, abnormalMonitorEnabled);
            if (evalRes.isAbnormalStopped) anyLinkBlockedAbnormal = true;
            if (evalRes.acceptedOriginalViews !== undefined) {
              taskViews += evalRes.acceptedOriginalViews;
              hasPreviewWithViews = true;
            }
          }
        }
      };

      checkAndAdd(task.videoLink1, 1);
      checkAndAdd(task.videoLink2, 2);
      checkAndAdd(task.videoLink3, 3);

      const maxAllowed = abnormalThreshold === 'AUTO' ? 2000000 : parseInt(abnormalThreshold, 10) || 1000000;
      const storedViews = Number(task.views) || 0;
      const storedIsAbnormal = abnormalMonitorEnabled && (storedViews > maxAllowed || (anyLinkBlockedAbnormal && !hasPreviewWithViews && storedViews > 0));

      if (hasPreviewWithViews || storedIsAbnormal) {
        const finalViews = hasPreviewWithViews ? taskViews : 0;
        const remunerationValue = task.remuneration || 0;
        const clicksValue = task.clicks !== undefined ? task.clicks : 0;
        const conversionsValue = task.conversions !== undefined ? task.conversions : (clicksValue > 0 ? Math.max(1, Math.floor(clicksValue * 0.024)) : 0);
        const ctrValue = finalViews > 0 ? parseFloat(((clicksValue / finalViews) * 100).toFixed(2)) : 0;
        const cpvValue = finalViews > 0 ? parseFloat((remunerationValue / finalViews).toFixed(3)) : 0;
        const cvrBase = clicksValue > 0 ? clicksValue : finalViews;
        const cvrValue = cvrBase > 0 ? parseFloat(((conversionsValue / cvrBase) * 100).toFixed(2)) : 0;

        const updates: Partial<Task> = {
          views: finalViews,
          ctr: ctrValue,
          cpv: cpvValue,
          conversions: conversionsValue,
          cvr: cvrValue,
        };

        if (onUpdateTask) {
          onUpdateTask(task.id, updates);
        } else if (onUpdateTasksBulk) {
          onUpdateTasksBulk([{ id: task.id, updates }]);
        }
      }

      setRefreshedStatus(prev => ({ ...prev, [taskId]: 'success' }));
      setTimeout(() => {
        setRefreshedStatus(prev => ({ ...prev, [taskId]: 'idle' }));
      }, 2500);
    } catch (err) {
      console.error('Failed to refresh card:', err);
    } finally {
      setRefreshingTaskIds(prev => {
        const next = { ...prev };
        delete next[taskId];
        return next;
      });
    }
  };

  const handleSyncLinkViewsToTasks = async () => {
    if (!onUpdateTasksBulk) return;
    setIsRefreshingAll(true);
    setMonitorBanner(null);
    
    const urlsToFetch = new Set<string>();
    tasks.filter(t => t.status === 'Completed' && (Boolean(t.videoLink1?.trim()) || Boolean(t.videoLink2?.trim()) || Boolean(t.videoLink3?.trim()))).forEach(t => {
      if (t.videoLink1) urlsToFetch.add(t.videoLink1.trim());
      if (t.videoLink2) urlsToFetch.add(t.videoLink2.trim());
      if (t.videoLink3) urlsToFetch.add(t.videoLink3.trim());
    });

    const results = await Promise.all(
      Array.from(urlsToFetch).map(async url => {
         let data = linkPreviews[url]?.data;
         if (!data || data.views === undefined) {
           data = await fetchPreviewForUrl(url);
         }
         return { url, data };
      })
    );

    const updatedPreviews = { ...linkPreviews };
    results.forEach(({ url, data }) => {
       if (data) updatedPreviews[url] = { loading: false, data };
    });
    setLinkPreviews(updatedPreviews);
    
    const updates: {id: string, updates: Partial<Task>}[] = [];
    let totalSyncedTasks = 0;
    let totalAbnormalCleaned = 0;
    const maxAllowed = abnormalThreshold === 'AUTO' ? 2000000 : parseInt(abnormalThreshold, 10) || 1000000;
    
    tasks.filter(t => t.status === 'Completed' && (Boolean(t.videoLink1?.trim()) || Boolean(t.videoLink2?.trim()) || Boolean(t.videoLink3?.trim()))).forEach(task => {
      let taskViews = 0;
      let hasPreviewWithViews = false;
      let anyLinkBlockedAbnormal = false;
      
      const checkAndAdd = (link: string | undefined, linkIndex: 1 | 2 | 3) => {
        if (link && link.trim()) {
          const trimmed = link.trim();
          const manualViews = task[`videoLink${linkIndex}Views` as keyof typeof task] as number | undefined;
          if (manualViews !== undefined && manualViews !== null && !isNaN(Number(manualViews))) {
            taskViews += Math.max(0, Number(manualViews));
            hasPreviewWithViews = true;
          } else {
            const pData = updatedPreviews[trimmed]?.data;
            const rawViews = pData?.originalViews ?? pData?.views;
            const evalRes = evaluateLinkViewCandidate(rawViews, pData, abnormalThreshold, abnormalMonitorEnabled);
            if (evalRes.isAbnormalStopped) anyLinkBlockedAbnormal = true;
            if (evalRes.acceptedOriginalViews !== undefined) {
              taskViews += evalRes.acceptedOriginalViews;
              hasPreviewWithViews = true;
            }
          }
        }
      };
      
      checkAndAdd(task.videoLink1, 1);
      checkAndAdd(task.videoLink2, 2);
      checkAndAdd(task.videoLink3, 3);
      
      const storedViews = Number(task.views) || 0;
      const storedIsAbnormal = abnormalMonitorEnabled && (storedViews > maxAllowed || (anyLinkBlockedAbnormal && !hasPreviewWithViews && storedViews > 0) || (hasPreviewWithViews && storedViews > 0 && storedViews !== taskViews));

      if (hasPreviewWithViews || storedIsAbnormal) {
        const finalViews = hasPreviewWithViews ? taskViews : 0;
        if (storedIsAbnormal) totalAbnormalCleaned++;
        if (hasPreviewWithViews) totalSyncedTasks++;
        const remunerationValue = task.remuneration || 0;
        const clicksValue = task.clicks !== undefined ? task.clicks : 0;
        const conversionsValue = task.conversions !== undefined ? task.conversions : (clicksValue > 0 ? Math.max(1, Math.floor(clicksValue * 0.024)) : 0);
        const ctrValue = finalViews > 0 ? parseFloat(((clicksValue / finalViews) * 100).toFixed(2)) : 0;
        const cpvValue = finalViews > 0 ? parseFloat((remunerationValue / finalViews).toFixed(3)) : 0;
        const cvrBase = clicksValue > 0 ? clicksValue : finalViews;
        const cvrValue = cvrBase > 0 ? parseFloat(((conversionsValue / cvrBase) * 100).toFixed(2)) : 0;
        
        updates.push({
          id: task.id,
          updates: { 
            views: finalViews, 
            ctr: ctrValue, 
            cpv: cpvValue, 
            conversions: conversionsValue, 
            cvr: cvrValue,
          }
        });
      }
    });

    if (updates.length > 0) {
      onUpdateTasksBulk(updates);
    }
    
    setIsRefreshingAll(false);
    
    if (totalAbnormalCleaned > 0) {
      setMonitorBanner({
        type: 'success',
        message: `Abnormal View Monitor stopped ${totalAbnormalCleaned} abnormal view record(s) and locked ${totalSyncedTasks} deliverable(s) to their Original Link Views.`
      });
    } else if (totalSyncedTasks > 0) {
      setMonitorBanner({
        type: 'success',
        message: `Verified and synced Original Link Views across ${totalSyncedTasks} deliverable(s).`
      });
    } else if (urlsToFetch.size > 0) {
      setMonitorBanner({
        type: 'info',
        message: 'All links scanned. Links where the platform hides public view counters are protected from abnormal fallback guesses.'
      });
    }
  };

  const getVideoDisplayId = (task: Task) => {
    if (task.videoId !== undefined) {
      return task.videoId;
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

  const handleUpdateConversions = (taskId: string, newValue: string) => {
    if (!onUpdateTask) return;
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const parsedConversions = parseInt(newValue, 10);
    const conversionsValue = isNaN(parsedConversions) ? 0 : Math.max(0, parsedConversions);

    const clicksValue = task.clicks !== undefined ? task.clicks : 0;
    const taskViews = task.views || 0;
    const cvrBase = clicksValue > 0 ? clicksValue : taskViews;
    const cvrValue = cvrBase > 0 ? parseFloat(((conversionsValue / cvrBase) * 100).toFixed(2)) : 0;

    onUpdateTask(taskId, { conversions: conversionsValue, cvr: cvrValue });
  };

  const handleUpdateLinkViews = (taskId: string, linkIndex: 1 | 2 | 3, newValue: string) => {
    if (!onUpdateTask) return;
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const parsedViews = parseInt(newValue, 10);
    const linkViews = isNaN(parsedViews) ? undefined : Math.max(0, parsedViews);
    
    const getSafeViewVal = (val: any) => {
      const n = Number(val);
      return (!isNaN(n) && isFinite(n) && n >= 0) ? n : 0;
    };

    const currentLink1Views = linkIndex === 1
      ? (linkViews ?? getSafeViewVal(linkPreviews[task.videoLink1 || '']?.data?.views))
      : (task.videoLink1Views ?? getSafeViewVal(linkPreviews[task.videoLink1 || '']?.data?.views));

    const currentLink2Views = linkIndex === 2
      ? (linkViews ?? getSafeViewVal(linkPreviews[task.videoLink2 || '']?.data?.views))
      : (task.videoLink2Views ?? getSafeViewVal(linkPreviews[task.videoLink2 || '']?.data?.views));

    const currentLink3Views = linkIndex === 3
      ? (linkViews ?? getSafeViewVal(linkPreviews[task.videoLink3 || '']?.data?.views))
      : (task.videoLink3Views ?? getSafeViewVal(linkPreviews[task.videoLink3 || '']?.data?.views));
    
    const newViews = Math.max(0, currentLink1Views + currentLink2Views + currentLink3Views);

    const remunerationValue = Math.max(0, Number(task.remuneration) || 0);
    const clicksValue = Math.max(0, Number(task.clicks) || 0);
    const conversionsValue = Math.max(0, Number(task.conversions) || (clicksValue > 0 ? Math.max(1, Math.floor(clicksValue * 0.024)) : 0));
    
    const ctrValue = newViews > 0 ? parseFloat(((clicksValue / newViews) * 100).toFixed(2)) : 0;
    const cpvValue = newViews > 0 ? parseFloat((remunerationValue / newViews).toFixed(3)) : 0;
    const cvrBase = clicksValue > 0 ? clicksValue : newViews;
    const cvrValue = cvrBase > 0 ? parseFloat(((conversionsValue / cvrBase) * 100).toFixed(2)) : 0;

    const updates: Partial<Task> = { 
       views: newViews, 
       ctr: isNaN(ctrValue) ? 0 : ctrValue, 
       cpv: isNaN(cpvValue) ? 0 : cpvValue, 
       conversions: isNaN(conversionsValue) ? 0 : conversionsValue, 
       cvr: isNaN(cvrValue) ? 0 : cvrValue 
    };
    if (linkIndex === 1) updates.videoLink1Views = linkViews;
    if (linkIndex === 2) updates.videoLink2Views = linkViews;
    if (linkIndex === 3) updates.videoLink3Views = linkViews;

    onUpdateTask(taskId, updates);
  };

  const handleUpdateViews = (taskId: string, newValue: string) => {
    if (!onUpdateTask) return;
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const parsedViews = parseInt(newValue, 10);
    const newViews = isNaN(parsedViews) ? 0 : Math.max(0, parsedViews);

    const remunerationValue = Math.max(0, Number(task.remuneration) || 0);
    const clicksValue = Math.max(0, Number(task.clicks) || 0);
    const conversionsValue = Math.max(0, Number(task.conversions) || (clicksValue > 0 ? Math.max(1, Math.floor(clicksValue * 0.024)) : 0));
    
    const ctrValue = newViews > 0 ? parseFloat(((clicksValue / newViews) * 100).toFixed(2)) : 0;
    const cpvValue = newViews > 0 ? parseFloat((remunerationValue / newViews).toFixed(3)) : 0;
    const cvrBase = clicksValue > 0 ? clicksValue : newViews;
    const cvrValue = cvrBase > 0 ? parseFloat(((conversionsValue / cvrBase) * 100).toFixed(2)) : 0;

    onUpdateTask(taskId, {
      views: newViews,
      ctr: isNaN(ctrValue) ? 0 : ctrValue,
      cpv: isNaN(cpvValue) ? 0 : cpvValue,
      conversions: isNaN(conversionsValue) ? 0 : conversionsValue,
      cvr: isNaN(cvrValue) ? 0 : cvrValue
    });
  };



  const [showAllReelsModal, setShowAllReelsModal] = useState(false);
  const [showReelsOnly, setShowReelsOnly] = useState(false);

  const hasReelLink = (t: Task) => t.status === 'Completed' && Boolean(
    (t.videoLink1 && detectReelPlatform(t.videoLink1)) ||
    (t.videoLink2 && detectReelPlatform(t.videoLink2)) ||
    (t.videoLink3 && detectReelPlatform(t.videoLink3))
  );

  const totalReelsCount = tasks.filter(t => t.status === 'Completed' && hasReelLink(t)).length;

  const tasksWithLinks = tasks.filter(t => t.status === 'Completed' && (Boolean(t.videoLink1?.trim()) || Boolean(t.videoLink2?.trim()) || Boolean(t.videoLink3?.trim()))).filter(t => {
    let matchesMonth = true;
    const taskDate = t.releaseDate || t.deadline || '';
    if (taskDate) {
      const parts = taskDate.split('-');
      if (parts.length >= 2) {
        const year = parts[0];
        const month = parts[1];
        const day = parts.length >= 3 ? parts[2] : undefined;
        
        const matchesMonthFilter = monthFilter === 'ALL' || parseInt(month, 10) === parseInt(monthFilter, 10);
        const matchesYearFilter = yearFilter === 'ALL' || parseInt(year, 10) === parseInt(yearFilter, 10);
        
        let matchesWeekFilter = true;
        if (weekFilter !== 'ALL' && day) {
             const dayNum = parseInt(day, 10);
             const weekNum = Math.ceil(dayNum / 7);
             if (weekFilter === '1-2' || weekFilter === '1st & 2nd week') {
               matchesWeekFilter = weekNum === 1 || weekNum === 2;
             } else if (weekFilter === '1-3' || weekFilter === '1st, 2nd, 3rd week') {
               matchesWeekFilter = weekNum === 1 || weekNum === 2 || weekNum === 3;
             } else if (weekFilter === '1-4' || weekFilter === '1st, 2nd, 3rd, 4th week') {
               matchesWeekFilter = weekNum === 1 || weekNum === 2 || weekNum === 3 || weekNum === 4;
             } else {
               matchesWeekFilter = weekNum.toString() === weekFilter.replace(/\D/g, '') || weekNum.toString() === weekFilter;
             }
        } else if (weekFilter !== 'ALL' && !day) {
             matchesWeekFilter = false; 
        }
        matchesMonth = matchesMonthFilter && matchesYearFilter && matchesWeekFilter;
      } else {
        matchesMonth = monthFilter === 'ALL' && yearFilter === 'ALL' && weekFilter === 'ALL';
      }
    } else {
      matchesMonth = monthFilter === 'ALL' && yearFilter === 'ALL' && weekFilter === 'ALL';
    }
    
    const inf = influencers.find(i => i.id === t.influencerId);
    const influencerName = inf ? inf.name : 'Unknown';

    const matchesInfluencer = influencerFilter === 'ALL' || t.influencerId === influencerFilter;
    const displayVideoId = String(getVideoDisplayId(t) || '').toLowerCase();
    
    const filterTerm = videoIdFilter.trim().toLowerCase();
    let matchesVideoId = true;
    if (filterTerm) {
      const cleanFilterNum = filterTerm.replace(/\D/g, '');
      const taskId = String(t.id || '').toLowerCase();
      const taskVideoId = String(t.videoId || '').toLowerCase();
      const taskOrderId = String(t.orderId || '').toLowerCase();
      const taskTitle = String(t.title || '').toLowerCase();
      const infNameLower = influencerName.toLowerCase();
      const taskVoId = `void-${taskId.slice(-4)}`.toLowerCase();
      const taskVold = `vold-${taskId.slice(-4)}`.toLowerCase();

      matchesVideoId = 
        taskId.includes(filterTerm) ||
        displayVideoId.includes(filterTerm) ||
        taskVideoId.includes(filterTerm) ||
        taskOrderId.includes(filterTerm) ||
        taskTitle.includes(filterTerm) ||
        infNameLower.includes(filterTerm) ||
        taskVoId.includes(filterTerm) ||
        taskVold.includes(filterTerm) ||
        (cleanFilterNum.length >= 3 && (
          taskId.endsWith(cleanFilterNum) ||
          displayVideoId.includes(cleanFilterNum) ||
          taskVideoId.includes(cleanFilterNum) ||
          taskOrderId.includes(cleanFilterNum)
        ));
    }

    const matchesReel = !showReelsOnly || hasReelLink(t);

    return matchesMonth && matchesInfluencer && matchesVideoId && matchesReel;
  });

  // Comprehensive per-task Abnormal View Monitor & Original View analyzer
  const getTaskMonitorReport = (t: Task) => {
    let hasVerifiedOriginal = false;
    let originalViewsSum = 0;
    let abnormalStopped = false;
    let stoppedAbnormalValue = 0;
    let stopReason = '';
    let primarySource = '';
    let allLinksChecked = true;
    let hasAnyLink = false;

    const linkReports: Record<1 | 2 | 3, {
      originalViews?: number;
      isManualVerified: boolean;
      viewSource?: string;
      abnormalStoppedInfo?: { stoppedValue: number; originalValue: number; reason: string } | null;
    }> = {
      1: { isManualVerified: false },
      2: { isManualVerified: false },
      3: { isManualVerified: false }
    };

    [t.videoLink1, t.videoLink2, t.videoLink3].forEach((link, idx) => {
      const linkIdx = (idx + 1) as 1 | 2 | 3;
      const manual = (t as any)[`videoLink${linkIdx}Views`] as number | undefined;
      if (manual !== undefined && manual !== null && !isNaN(Number(manual))) {
        const cleanManual = Math.max(0, Math.round(Number(manual)));
        originalViewsSum += cleanManual;
        hasVerifiedOriginal = true;
        if (!primarySource) primarySource = 'User Verified Screenshot';
        linkReports[linkIdx] = {
          originalViews: cleanManual,
          isManualVerified: true,
          viewSource: 'User Verified Screenshot',
          abnormalStoppedInfo: null
        };
      } else if (link && link.trim()) {
        hasAnyLink = true;
        const trimmed = link.trim();
        const previewEntry = linkPreviews[trimmed];
        if (!previewEntry || previewEntry.loading) {
          allLinksChecked = false;
        }
        const linkData = previewEntry?.data;
        const rawCandidate = linkData?.originalViews ?? linkData?.views;
        const evalRes = evaluateLinkViewCandidate(rawCandidate, linkData, abnormalThreshold, abnormalMonitorEnabled);

        if (evalRes.acceptedOriginalViews !== undefined) {
          originalViewsSum += evalRes.acceptedOriginalViews;
          hasVerifiedOriginal = true;
          if (!primarySource) primarySource = linkData?.viewSource || 'Original Link Metadata';
        }

        if (evalRes.isAbnormalStopped && evalRes.stoppedValue) {
          abnormalStopped = true;
          if (evalRes.stoppedValue > stoppedAbnormalValue) {
            stoppedAbnormalValue = evalRes.stoppedValue;
            stopReason = evalRes.reason || 'Abnormal view stopped by monitor';
          }
          linkReports[linkIdx] = {
            originalViews: evalRes.acceptedOriginalViews,
            isManualVerified: false,
            viewSource: linkData?.viewSource,
            abnormalStoppedInfo: {
              stoppedValue: evalRes.stoppedValue,
              originalValue: evalRes.acceptedOriginalViews || 0,
              reason: evalRes.reason || 'Abnormal view stopped'
            }
          };
        } else {
          linkReports[linkIdx] = {
            originalViews: evalRes.acceptedOriginalViews,
            isManualVerified: false,
            viewSource: linkData?.viewSource,
            abnormalStoppedInfo: null
          };
        }
      }
    });

    const storedTaskViews = Math.max(0, Math.round(Number(t.views) || 0));
    const maxAllowed = abnormalThreshold === 'AUTO' ? 2000000 : parseInt(abnormalThreshold, 10) || 1000000;

    if (hasVerifiedOriginal) {
      // If stored task.views in DB had a different (polluted/abnormal) number, flag that it was stopped in favor of Original Link Views
      if (abnormalMonitorEnabled && storedTaskViews > 0 && Math.abs(storedTaskViews - originalViewsSum) > 5) {
        abnormalStopped = true;
        if (storedTaskViews > stoppedAbnormalValue) {
          stoppedAbnormalValue = storedTaskViews;
        }
        if (!stopReason) {
          stopReason = `Stopped mismatched stored view (${storedTaskViews.toLocaleString()}) → Showing Original Link View (${originalViewsSum.toLocaleString()})`;
        }
      }
      return {
        effectiveOriginalViews: originalViewsSum,
        hasVerifiedOriginal: true,
        abnormalStopped,
        stoppedAbnormalValue,
        stopReason,
        primarySource: primarySource || 'Original Link Metadata',
        linkReports
      };
    }

    // No verified link views yet
    if (storedTaskViews > 0) {
      if (abnormalMonitorEnabled) {
        // Stop storedTaskViews if it exceeds threshold OR if the link check completed and blocked an abnormal feed view
        if (storedTaskViews > maxAllowed || abnormalStopped) {
          return {
            effectiveOriginalViews: 0,
            hasVerifiedOriginal: false,
            abnormalStopped: true,
            stoppedAbnormalValue: Math.max(stoppedAbnormalValue, storedTaskViews),
            stopReason: stopReason || `Stopped abnormal unverified stored view (${storedTaskViews.toLocaleString()})`,
            primarySource: 'Abnormal Stopped',
            linkReports
          };
        }
        // If all links on this task were checked and none have public views, do not show unverified high stored views (>50,000) unless verified in Exact Views
        if (hasAnyLink && allLinksChecked && storedTaskViews > 50000) {
          return {
            effectiveOriginalViews: 0,
            hasVerifiedOriginal: false,
            abnormalStopped: true,
            stoppedAbnormalValue: storedTaskViews,
            stopReason: `Stopped unverified stored view (${storedTaskViews.toLocaleString()}) — link has no public view counter`,
            primarySource: 'Abnormal Stopped',
            linkReports
          };
        }
      }
      return {
        effectiveOriginalViews: storedTaskViews,
        hasVerifiedOriginal: false,
        abnormalStopped,
        stoppedAbnormalValue,
        stopReason,
        primarySource: 'Saved Deliverable Count',
        linkReports
      };
    }

    return {
      effectiveOriginalViews: 0,
      hasVerifiedOriginal: false,
      abnormalStopped,
      stoppedAbnormalValue,
      stopReason,
      primarySource: '',
      linkReports
    };
  };

  const getTaskEffectiveViews = (t: Task) => {
    return getTaskMonitorReport(t).effectiveOriginalViews;
  };

  // Real Upload Date & Time Guard per Influencer Card:
  // Collects the authentic Video Upload Date & Time from video link metadata (or URL shortcode/snowflake / recorded release metadata)
  // and blocks any current / running clock date or time.
  const getTaskRealUploadDateTime = (t: Task): {
    verified: VerifiedUploadDateTime | null;
    isLoading: boolean;
    runningClockBlocked: boolean;
    blockReason?: string;
  } => {
    const candidateLinks = [t.videoLink1, t.videoLink2, t.videoLink3]
      .filter((u): u is string => Boolean(u && u.trim()))
      .map(u => u.trim());

    const fallbackTaskMeta = {
      releaseDate: t.releaseDate || null,
      uploadTime: (t as any).uploadTime || null,
      publishedAt: (t as any).publishedAt || null,
      publishedDate: (t as any).publishedDate || null,
      publishedTime: (t as any).publishedTime || null
    };

    let bestVerified: VerifiedUploadDateTime | null = null;
    let isLoading = false;
    let runningClockBlocked = false;
    let blockReason: string | undefined = undefined;

    // Pass 1: Check direct video metadata and instant URL shortcodes/snowflakes across all links
    for (const url of candidateLinks) {
      const entry = linkPreviews[url];
      if (!entry || entry.loading) {
        isLoading = true;
      }
      const check = verifyRealUploadDateTime(entry?.data, url, null);
      if (check.runningClockBlocked) {
        runningClockBlocked = true;
        blockReason = check.blockReason || blockReason;
      }
      if (check.isVerified && check.isoDate) {
        if (!bestVerified || (!bestVerified.time && check.time)) {
          bestVerified = check;
        }
      }
    }

    // Pass 2: If links are still loading or platform restricted public timestamp scraping, use stored/recorded task upload date & time
    if (!bestVerified) {
      const taskFallbackCheck = verifyRealUploadDateTime(null, candidateLinks[0] || null, fallbackTaskMeta);
      if (taskFallbackCheck.isVerified && taskFallbackCheck.isoDate) {
        bestVerified = taskFallbackCheck;
      }
    }

    return {
      verified: bestVerified,
      isLoading: isLoading && !bestVerified,
      runningClockBlocked,
      blockReason
    };
  };

  const monitorSummary = React.useMemo(() => {
    let verifiedCount = 0;
    let uploadDateVerifiedCount = 0;
    let runningClockStoppedCount = 0;
    const interceptedItems: {
      taskId: string;
      videoId: string;
      influencerName: string;
      title: string;
      stoppedValue: number;
      originalValue: number;
      reason: string;
    }[] = [];

    tasksWithLinks.forEach(t => {
      const report = getTaskMonitorReport(t);
      if (report.hasVerifiedOriginal && report.effectiveOriginalViews > 0) {
        verifiedCount++;
      }
      const uploadCheck = getTaskRealUploadDateTime(t);
      if (uploadCheck.verified?.isVerified) {
        uploadDateVerifiedCount++;
      }
      if (uploadCheck.runningClockBlocked) {
        runningClockStoppedCount++;
      }
      if (report.abnormalStopped && report.stoppedAbnormalValue > 0) {
        const inf = influencers.find(i => i.id === t.influencerId);
        interceptedItems.push({
          taskId: t.id,
          videoId: getVideoDisplayId(t),
          influencerName: inf ? inf.name : 'Unknown Creator',
          title: t.title || 'Deliverable',
          stoppedValue: report.stoppedAbnormalValue,
          originalValue: report.effectiveOriginalViews,
          reason: report.stopReason || 'Abnormal view intercepted; showing Original Link View'
        });
      }
    });

    return {
      verifiedCount,
      uploadDateVerifiedCount,
      runningClockStoppedCount,
      interceptedCount: interceptedItems.length,
      interceptedItems
    };
  }, [tasksWithLinks, linkPreviews, influencers, abnormalMonitorEnabled, abnormalThreshold]);

  const totalTrackedTasks = tasksWithLinks.length;
  const totalViews = tasksWithLinks.reduce((sum, t) => sum + getTaskEffectiveViews(t), 0);
  const totalClicks = tasksWithLinks.reduce((sum, t) => sum + (Number(t.clicks) || 0), 0);

  const topViewedVideo = React.useMemo(() => {
    let maxViews = 0;
    let topTask: Task | null = null;
    tasksWithLinks.forEach(t => {
      const v = getTaskEffectiveViews(t);
      if (v > maxViews) {
        maxViews = v;
        topTask = t;
      }
    });

    if (topTask && maxViews > 0) {
       const inf = influencers.find(i => i.id === topTask?.influencerId);
       return { 
         name: inf ? inf.name : 'Unknown Creator', 
         views: maxViews,
         title: topTask.title || 'Deliverable'
       };
    }
    return null;
  }, [tasksWithLinks, linkPreviews, influencers, abnormalMonitorEnabled, abnormalThreshold]);

  const topVideos = [...tasksWithLinks]
    .filter(t => getTaskEffectiveViews(t) > 0)
    .sort((a, b) => getTaskEffectiveViews(b) - getTaskEffectiveViews(a))
    .slice(0, 5); // top 5

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-br from-indigo-900 via-indigo-800 to-blue-900 rounded-3xl p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-indigo-500/20 rounded-full blur-2xl -ml-10 -mb-10 pointer-events-none" />
        
        <div className="relative z-10">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-2">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/10 rounded-xl backdrop-blur-sm">
                <Eye className="w-8 h-8 text-indigo-200" />
              </div>
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h2 className="text-3xl font-bold tracking-tight">Live Video Views Tracker</h2>
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold font-mono border ${
                    abnormalMonitorEnabled
                      ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40'
                      : 'bg-amber-500/20 text-amber-200 border-amber-400/40'
                  }`}>
                    {abnormalMonitorEnabled ? (
                      <>
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
                        <span>Abnormal View Monitor: ACTIVE</span>
                      </>
                    ) : (
                      <>
                        <ShieldAlert className="w-3.5 h-3.5 text-amber-300" />
                        <span>Abnormal View Monitor: PAUSED</span>
                      </>
                    )}
                  </span>
                </div>
              </div>
            </div>
          </div>
          <p className="text-indigo-100/80 max-w-3xl text-sm leading-relaxed mb-5">
            Automatically extracts and verifies the <strong>Original Views</strong> of every video link while stopping abnormal feed spikes, unrelated viral video counters, or mismatched numbers.
          </p>

          {/* Abnormal View Monitor System Bar */}
          <div className="mb-6 bg-slate-950/45 backdrop-blur-md border border-emerald-400/30 rounded-2xl p-4 shadow-lg">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
                  abnormalMonitorEnabled
                    ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-300'
                    : 'bg-slate-700/40 border-slate-600 text-slate-300'
                }`}>
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-bold text-white tracking-wide">
                      Abnormal View Monitor & Real Upload Date Guard
                    </h3>
                    <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                      Original Views & Real Metadata Upload Time Only
                    </span>
                  </div>
                  <p className="text-xs text-indigo-200/90 mt-0.5">
                    Monitors all Facebook, Instagram & YouTube links — blocks abnormal views and running/current clocks, displaying only each video's authentic original views and real metadata upload date & time.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                {/* Verified & Stopped Counters */}
                <div className="flex items-center gap-2 bg-white/10 border border-white/15 rounded-xl px-3 py-1.5 text-xs font-mono">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
                  <span className="text-indigo-100">Original Verified:</span>
                  <strong className="text-emerald-300 font-bold">{monitorSummary.verifiedCount}</strong>
                </div>

                <div
                  className="flex items-center gap-2 bg-white/10 border border-white/15 rounded-xl px-3 py-1.5 text-xs font-mono"
                  title="Real Video Upload Dates & Times verified from video link metadata (current/running clock timestamps are blocked)"
                >
                  <Calendar className="w-3.5 h-3.5 text-amber-300" />
                  <span className="text-indigo-100">Upload Dates Guarded:</span>
                  <strong className="text-amber-300 font-bold">{monitorSummary.uploadDateVerifiedCount}</strong>
                </div>

                <button
                  type="button"
                  onClick={() => setShowMonitorLog(!showMonitorLog)}
                  className={`flex items-center gap-2 border rounded-xl px-3 py-1.5 text-xs font-mono font-bold transition cursor-pointer ${
                    monitorSummary.interceptedCount > 0
                      ? 'bg-rose-500/25 hover:bg-rose-500/35 border-rose-400/50 text-rose-200'
                      : 'bg-white/10 hover:bg-white/15 border-white/15 text-indigo-100'
                  }`}
                  title="Click to inspect stopped abnormal views and restored original views"
                >
                  <ShieldAlert className={`w-3.5 h-3.5 ${monitorSummary.interceptedCount > 0 ? 'text-rose-300' : 'text-indigo-200'}`} />
                  <span>Abnormal Stopped: {monitorSummary.interceptedCount}</span>
                  <span className="text-[10px] underline ml-0.5">{showMonitorLog ? 'Hide Log' : 'View Log'}</span>
                </button>

                {/* Max Normal Ceiling Selector */}
                <div className="flex items-center gap-1.5 bg-white/10 border border-white/15 rounded-xl px-2.5 py-1">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-indigo-200 font-bold">
                    Normal Limit:
                  </span>
                  <select
                    value={abnormalThreshold}
                    onChange={(e) => setAbnormalThreshold(e.target.value)}
                    className="bg-slate-900 text-white text-xs font-mono font-bold rounded-lg px-2 py-1 border border-white/20 outline-none cursor-pointer"
                    title="Set maximum normal view threshold; views above this are stopped as abnormal"
                  >
                    <option value="AUTO">Auto Smart Guard</option>
                    <option value="100000">Max 100K Views</option>
                    <option value="250000">Max 250K Views</option>
                    <option value="500000">Max 500K Views</option>
                    <option value="1000000">Max 1M Views</option>
                    <option value="5000000">Max 5M Views</option>
                  </select>
                </div>

                {/* Toggle Monitor ON/OFF */}
                <button
                  type="button"
                  onClick={() => setAbnormalMonitorEnabled(!abnormalMonitorEnabled)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold font-mono transition cursor-pointer border ${
                    abnormalMonitorEnabled
                      ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 border-emerald-300 shadow-md shadow-emerald-500/20'
                      : 'bg-white/10 hover:bg-white/20 text-white border-white/20'
                  }`}
                >
                  {abnormalMonitorEnabled ? '🛡️ Protection: ON' : 'Protection: OFF'}
                </button>

                {/* One-Click Restore Original Views */}
                <button
                  type="button"
                  onClick={handleSyncLinkViewsToTasks}
                  disabled={isRefreshingAll}
                  className="flex items-center gap-1.5 bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-bold font-mono px-3 py-1.5 rounded-xl border border-indigo-300/40 transition disabled:opacity-50 cursor-pointer shadow-sm"
                  title="Scan all links, stop any abnormal views, and lock tasks to Original Link Views"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingAll ? 'animate-spin' : ''}`} />
                  <span>Restore Original Views</span>
                </button>
              </div>
            </div>

            {monitorBanner && (
              <div className={`mt-3 flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-xs font-mono border ${
                monitorBanner.type === 'success'
                  ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-100'
                  : monitorBanner.type === 'warning'
                  ? 'bg-amber-500/20 border-amber-400/40 text-amber-100'
                  : 'bg-indigo-500/20 border-indigo-400/40 text-indigo-100'
              }`}>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-300 shrink-0" />
                  <span>{monitorBanner.message}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setMonitorBanner(null)}
                  className="text-white/70 hover:text-white cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Expandable Monitor Log Drawer */}
            {showMonitorLog && (
              <div className="mt-3 pt-3 border-t border-white/15">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold font-mono uppercase tracking-wider text-indigo-200 flex items-center gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5 text-rose-300" />
                    Intercepted Abnormal Views Log ({monitorSummary.interceptedCount})
                  </span>
                  <span className="text-[11px] text-indigo-200/80 font-mono">
                    All abnormal values below were automatically stopped and replaced with Original Link Views
                  </span>
                </div>
                {monitorSummary.interceptedItems.length === 0 ? (
                  <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-xs text-emerald-200 font-mono flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>No abnormal views detected in the current view. All displayed counts match verified original video views.</span>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {monitorSummary.interceptedItems.map((item) => (
                      <div
                        key={item.taskId}
                        className="flex flex-wrap items-center justify-between gap-2 bg-slate-900/80 border border-rose-400/30 rounded-xl px-3 py-2 text-xs font-mono"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white">{item.influencerName}</span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-500/30 text-indigo-200 border border-indigo-400/30">
                              {item.videoId}
                            </span>
                            <span className="text-indigo-200/70 truncate">{item.title}</span>
                          </div>
                          <p className="text-[11px] text-rose-200/90 mt-0.5">{item.reason}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="px-2 py-0.5 rounded bg-rose-500/20 border border-rose-400/40 text-rose-300 line-through font-bold">
                            Stopped: {item.stoppedValue.toLocaleString('en-IN')}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 font-bold">
                            Original: {item.originalValue.toLocaleString('en-IN')}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 mb-8">
            <div className="flex items-center gap-2 bg-white/10 backdrop-blur-md rounded-xl p-1.5 border border-white/10">
              <span className="text-xs font-bold text-indigo-200 uppercase tracking-widest pl-2 pr-1 font-mono flex items-center gap-1.5 relative top-0.5">
                <Filter className="w-3.5 h-3.5" /> Date Filter
              </span>
              <select
                value={monthFilter}
                onChange={(e) => setMonthFilter(e.target.value)}
                className="bg-white/10 text-white text-sm border-0 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-400 font-medium cursor-pointer"
              >
                <option value="ALL" className="text-gray-900">All Months</option>
                <option value="01" className="text-gray-900">Jan</option>
                <option value="02" className="text-gray-900">Feb</option>
                <option value="03" className="text-gray-900">Mar</option>
                <option value="04" className="text-gray-900">Apr</option>
                <option value="05" className="text-gray-900">May</option>
                <option value="06" className="text-gray-900">Jun</option>
                <option value="07" className="text-gray-900">Jul</option>
                <option value="08" className="text-gray-900">Aug</option>
                <option value="09" className="text-gray-900">Sep</option>
                <option value="10" className="text-gray-900">Oct</option>
                <option value="11" className="text-gray-900">Nov</option>
                <option value="12" className="text-gray-900">Dec</option>
              </select>

              <select
                value={yearFilter}
                onChange={(e) => setYearFilter(e.target.value)}
                className="bg-white/10 text-white text-sm border-0 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-400 font-medium cursor-pointer"
              >
                <option value="ALL" className="text-gray-900">All Years</option>
                <option value="2024" className="text-gray-900">2024</option>
                <option value="2025" className="text-gray-900">2025</option>
                <option value="2026" className="text-gray-900">2026</option>
                <option value="2027" className="text-gray-900">2027</option>
              </select>

              <select
                value={weekFilter}
                onChange={(e) => setWeekFilter(e.target.value)}
                className="bg-white/10 text-white text-sm border-0 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-400 font-medium cursor-pointer"
              >
                <option value="ALL" className="text-gray-900">All Weeks</option>
                <option value="1" className="text-gray-900">W1 (1-7)</option>
                <option value="2" className="text-gray-900">W2 (8-14)</option>
                <option value="3" className="text-gray-900">W3 (15-21)</option>
                <option value="4" className="text-gray-900">W4 (22-28)</option>
                <option value="5" className="text-gray-900">W5 (29+)</option>
                <option value="1-2" className="text-gray-900">1st & 2nd week (1-14)</option>
                <option value="1-3" className="text-gray-900">1st, 2nd, 3rd week (1-21)</option>
                <option value="1-4" className="text-gray-900">1st, 2nd, 3rd, 4th week (1-28)</option>
              </select>
            </div>

            <div className="flex items-center gap-2 bg-white/10 backdrop-blur-md rounded-xl p-1.5 border border-white/10">
              <span className="text-xs font-bold text-indigo-200 uppercase tracking-widest pl-2 pr-1 font-mono flex items-center gap-1.5 relative top-0.5">
                <Users className="w-3.5 h-3.5" /> Influencer
              </span>
              <select
                value={influencerFilter}
                onChange={(e) => setInfluencerFilter(e.target.value)}
                className="w-52 text-xs font-bold text-slate-800 bg-white border border-white/20 rounded-lg px-2.5 py-1.5 focus:outline-none cursor-pointer"
              >
                <option value="ALL">All Influencers</option>
                {[...influencers]
                  .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }))
                  .map(inf => (
                    <option key={inf.id} value={inf.id}>{inf.name}</option>
                  ))
                }
              </select>
            </div>

            <div className="flex items-center gap-2 bg-white/10 backdrop-blur-md rounded-xl p-1.5 border border-white/10">
              <span className="text-xs font-bold text-indigo-200 uppercase tracking-widest pl-2 pr-1 font-mono flex items-center gap-1.5 relative top-0.5">
                <Video className="w-3.5 h-3.5" /> Search / Video ID
              </span>
              <input
                type="text"
                placeholder="e.g. VoId-1476, Product, VID..."
                value={videoIdFilter}
                onChange={(e) => setVideoIdFilter(e.target.value)}
                className="bg-white/10 text-white text-sm border-0 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-400 font-medium placeholder:text-indigo-100/50 w-52 sm:w-60"
              />
            </div>
            
            <button
              onClick={() => setShowReelsOnly(!showReelsOnly)}
              className={`flex items-center gap-2 text-white text-sm font-bold border-0 rounded-xl px-4 py-2.5 transition cursor-pointer ${
                showReelsOnly ? 'bg-fuchsia-600 hover:bg-fuchsia-500 shadow-lg shadow-fuchsia-500/30 ring-2 ring-fuchsia-300' : 'bg-white/10 hover:bg-white/20'
              }`}
              title="Filter to only tasks containing Facebook Reels, YouTube Shorts, or Instagram Reels"
            >
              <Film className="w-4 h-4 text-fuchsia-200" />
              <span>{showReelsOnly ? '🎬 Reels Filter: ON' : '🎬 Reels Only'}</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/20 font-mono font-bold">
                {totalReelsCount}
              </span>
            </button>

            <button
              onClick={() => setShowAllReelsModal(true)}
              className="flex items-center gap-2 bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white text-sm font-bold border-0 rounded-xl px-4 py-2.5 transition shadow-lg shadow-pink-500/20 cursor-pointer"
              title="View all reel links and their live views across the campaign"
            >
              <Film className="w-4 h-4" /> View All Reels ({totalReelsCount})
            </button>

            <button
              onClick={() => setAutoFetchEnabled(!autoFetchEnabled)}
              className={`flex items-center gap-2 text-white text-sm font-semibold border-0 rounded-xl px-4 py-2.5 transition ${
                autoFetchEnabled ? 'bg-fuchsia-600 hover:bg-fuchsia-500 shadow-lg shadow-fuchsia-500/30' : 'bg-white/10 hover:bg-white/20'
              }`}
              title="Automatically fetch all previews every 5 minutes"
            >
              <RefreshCw className={`w-4 h-4 ${autoFetchEnabled ? 'animate-spin' : ''}`} /> 
              {autoFetchEnabled ? 'Auto Fetch: ON' : 'Auto Fetch: OFF'}
            </button>
            <button
              onClick={handleRefreshAllPreviews}
              disabled={isRefreshingAll}
              className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-400 text-white text-sm font-semibold border-0 rounded-xl px-4 py-2.5 transition disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshingAll ? 'animate-spin' : ''}`} /> Fetch All Previews
            </button>

            <button
              onClick={handleSyncLinkViewsToTasks}
              className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-semibold border-0 rounded-xl px-4 py-2.5 transition"
              title="Add all preview views to the tasks' total views"
            >
              <PlusCircle className="w-4 h-4" /> Sync Views to Tasks
            </button>

          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div className="bg-white/10 backdrop-blur-md border border-white/10 rounded-2xl p-4 flex items-center justify-between">
              <div>
                <p className="text-indigo-200 text-xs font-medium uppercase tracking-wider mb-1">Tracked Videos</p>
                <div className="text-2xl font-bold font-mono tracking-tight">{totalTrackedTasks}</div>
                <p className="text-[10px] text-indigo-200 font-mono mt-0.5">{totalReelsCount} Reels</p>
              </div>
              <div className="w-10 h-10 bg-indigo-500/20 rounded-xl flex items-center justify-center">
                <Video className="w-5 h-5 text-indigo-200" />
              </div>
            </div>

            {/* Total Real Live Views */}
            <div className="bg-white/10 backdrop-blur-md border border-white/10 rounded-2xl p-4 flex items-center justify-between">
              <div>
                <p className="text-emerald-200 text-xs font-medium uppercase tracking-wider mb-1">
                  Real Live Views
                </p>
                <div className="text-2xl font-bold font-mono tracking-tight text-emerald-300">
                  {totalViews.toLocaleString()}
                </div>
                <p className="text-[10px] text-emerald-300/80 font-mono mt-0.5">
                  Direct from video links
                </p>
              </div>
              <div className="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center">
                <Eye className="w-5 h-5 text-emerald-300" />
              </div>
            </div>

            {/* Total Link Clicks */}
            <div className="bg-white/10 backdrop-blur-md border border-white/10 rounded-2xl p-4 flex items-center justify-between">
              <div>
                <p className="text-amber-200 text-xs font-medium uppercase tracking-wider mb-1">
                  Store Link Clicks
                </p>
                <div className="text-2xl font-bold font-mono tracking-tight text-amber-300">
                  {totalClicks.toLocaleString()}
                </div>
                <p className="text-[10px] text-amber-200/80 font-mono mt-0.5">
                  {totalViews > 0 ? `${((totalClicks / totalViews) * 100).toFixed(2)}% CTR` : '0.00% CTR'}
                </p>
              </div>
              <div className="w-10 h-10 bg-amber-500/20 rounded-xl flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-amber-300" />
              </div>
            </div>

            {/* Top Viewed Video */}
            <div className="bg-white/10 backdrop-blur-md border border-white/10 rounded-2xl p-4 flex items-center justify-between">
              <div>
                <p className="text-fuchsia-200 text-xs font-medium uppercase tracking-wider mb-1">Top Viewed Creator</p>
                <div className="text-lg font-bold tracking-tight text-white truncate max-w-[150px]" title={topViewedVideo?.name || 'No views yet'}>
                  {topViewedVideo ? topViewedVideo.name : 'Waiting for links'}
                </div>
                <p className="text-[10px] text-fuchsia-200 font-mono mt-0.5">
                  {topViewedVideo ? `${topViewedVideo.views.toLocaleString()} live views` : 'No views recorded'}
                </p>
              </div>
              <div className="w-10 h-10 bg-fuchsia-500/20 rounded-xl flex items-center justify-center text-fuchsia-200">
                <Film className="w-5 h-5" />
              </div>
            </div>
          </div>

          {topVideos.length > 0 && (
            <div className="mt-8">
              <div className="flex items-center gap-2 mb-4">
                <Trophy className="w-5 h-5 text-yellow-300" />
                <h3 className="text-lg font-bold text-white tracking-wide">Top Performer Benchmark</h3>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {topVideos.map((tv, idx) => {
                  const inf = influencers.find(i => i.id === tv.influencerId);
                  const rankColors = [
                    'text-yellow-300 bg-yellow-400/20 border-yellow-400/30', // 1st
                    'text-gray-300 bg-gray-400/20 border-gray-400/30', // 2nd
                    'text-amber-500 bg-amber-600/20 border-amber-600/30', // 3rd
                    'text-indigo-200 bg-indigo-400/20 border-indigo-400/30',
                    'text-indigo-200 bg-indigo-400/20 border-indigo-400/30'
                  ];
                  const RC = rankColors[idx] || rankColors[3];
                  return (
                    <div key={tv.id} className="flex items-center justify-between p-3 rounded-xl bg-white/5 hover:bg-white/10 transition border border-white/5">
                      <div className="flex items-center gap-4">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm border ${RC}`}>
                          {idx + 1}
                        </div>
                        <div>
                          <div className="font-semibold text-white truncate max-w-[180px] md:max-w-[220px]">{tv.title || 'Untitled Video'}</div>
                          <div className="text-xs text-indigo-200">{inf ? inf.name : 'Unknown User'} <span className="text-red-400 font-bold ml-2 tracking-widest font-mono">₹{tv.remuneration || 0}</span></div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end">
                         <div className="text-lg font-bold text-emerald-300 font-mono tracking-tight cursor-default" title="Real Live Views from link">
                           {getTaskEffectiveViews(tv).toLocaleString()} <span className="text-[10px] text-indigo-200 ml-1">REAL LIVE VIEWS</span>
                         </div>
                         <div className="flex gap-3 mt-1">
                           <div className="text-[10px] text-red-400 font-mono tracking-widest" title="Clicks">
                             <span className="font-bold text-red-400">{tv.clicks || 0}</span> CLICKS
                           </div>
                           <div className="text-[10px] text-indigo-400 font-mono tracking-widest" title="Ratio">
                             <span className="font-bold text-indigo-400">1:{(tv.clicks && tv.views) ? Math.round(tv.views / tv.clicks) : 0}</span> RATIO
                           </div>
                           <div className="text-[10px] text-indigo-300 font-mono tracking-widest" title="CTR">
                             CTR: {tv.ctr || 0}%
                           </div>
                         </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {tasksWithLinks.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-3xl border border-gray-100 shadow-sm">
          <Video className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-gray-900 mb-2">No videos tracked for this period</h3>
          <p className="text-gray-500 text-sm max-w-sm mx-auto">
            Change your date filter or add new video links in the Monthly Planner.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5">
          {tasksWithLinks.map(task => {
            const inf = influencers.find(i => i.id === task.influencerId);
            const influencerName = inf ? inf.name : 'Unknown';
            const displayVideoId = getVideoDisplayId(task);

            const links: { url: string; index: 1 | 2 | 3 }[] = [];
            if (task.videoLink1) links.push({ url: task.videoLink1, index: 1 });
            if (task.videoLink2) links.push({ url: task.videoLink2, index: 2 });
            if (task.videoLink3) links.push({ url: task.videoLink3, index: 3 });

            const currentLinks = links.map(l => l.url);

            return (
              <div key={task.id} className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition relative group overflow-hidden">
                <div className="flex justify-between items-start mb-3 gap-2">
                  <div className="flex-1 min-w-0 pr-2">
                      <h3 className="font-bold text-gray-900 truncate" title={influencerName}>
                        {influencerName} <span className="text-red-600 font-black ml-2 tracking-widest font-mono">₹{task.remuneration || 0}</span>
                      </h3>
                      <p className="text-xs text-gray-500 truncate" title={task.title || 'Unknown Product'}>
                        {task.title || 'Unknown Product'}
                      </p>
                      <p className="text-[10px] font-mono font-bold text-indigo-500 mt-1 uppercase tracking-widest">
                        {displayVideoId}
                      </p>
                      {(() => {
                        const uploadCheck = getTaskRealUploadDateTime(task);
                        const verifiedMeta = uploadCheck.verified;

                        if (verifiedMeta && verifiedMeta.isVerified && verifiedMeta.isoDate) {
                          return (
                            <div
                              className="flex items-center flex-wrap gap-1.5 mt-2 text-xs font-mono bg-amber-50/80 border border-amber-200/90 px-2.5 py-1.5 rounded-lg w-fit shadow-xs"
                              title={`Real Video Upload Date & Time verified from ${verifiedMeta.source || 'Video Metadata'} (IST / Kolkata): ${verifiedMeta.dmyDate || formatDateToDMY(verifiedMeta.isoDate)}${verifiedMeta.time ? ' at ' + verifiedMeta.time : ''}`}
                            >
                              <span className="font-black text-amber-900 uppercase text-[10px] tracking-wider flex items-center gap-1">
                                <ShieldCheck className="w-3 h-3 text-emerald-600 shrink-0" />
                                Video Uploaded:
                              </span>
                              <span className="flex items-center gap-1 bg-white border border-amber-300/80 px-2 py-0.5 rounded shadow-2xs">
                                <Calendar className="w-3 h-3 text-indigo-600 shrink-0" />
                                <strong className="font-black text-gray-950 text-[11px]">
                                  {verifiedMeta.dmyDate || formatDateToDMY(verifiedMeta.isoDate)}
                                </strong>
                              </span>
                              {verifiedMeta.time && (
                                <span className="flex items-center gap-1 bg-fuchsia-100 border border-fuchsia-300 px-2 py-0.5 rounded shadow-2xs">
                                  <Clock className="w-3 h-3 text-fuchsia-700 shrink-0" />
                                  <strong className="font-black text-fuchsia-950 text-[11px]">{verifiedMeta.time}</strong>
                                </span>
                              )}
                              <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                                Real Metadata
                              </span>
                            </div>
                          );
                        }

                        if (uploadCheck.isLoading) {
                          return (
                            <div className="flex items-center gap-1.5 mt-2 text-[10px] font-mono text-indigo-700 bg-indigo-50/70 border border-indigo-200/80 px-2.5 py-1 rounded-lg w-fit">
                              <Clock className="w-3 h-3 animate-spin text-indigo-600 shrink-0" />
                              <span>Collecting real upload date & time from video metadata...</span>
                            </div>
                          );
                        }

                        if (uploadCheck.runningClockBlocked) {
                          return (
                            <div
                              className="flex items-center gap-1.5 mt-2 text-[10px] font-mono text-amber-800 bg-amber-50/80 border border-amber-200 px-2.5 py-1 rounded-lg w-fit"
                              title={uploadCheck.blockReason || 'Upload Date Guard blocked current/running timestamp'}
                            >
                              <ShieldCheck className="w-3 h-3 text-amber-600 shrink-0" />
                              <span>Upload Date Guard: Running clock blocked (awaiting public post date metadata)</span>
                            </div>
                          );
                        }

                        return (
                          <div
                            className="flex items-center gap-1.5 mt-2 text-[10px] font-mono text-slate-600 bg-slate-100/80 border border-slate-200 px-2.5 py-1 rounded-lg w-fit"
                            title="Platform restricted public upload timestamp metadata for this link; Real Upload Date Guard prevented showing current/running time."
                          >
                            <ShieldCheck className="w-3 h-3 text-slate-500 shrink-0" />
                            <span>Video Upload Date: Protected by Guard (No public timestamp in metadata)</span>
                          </div>
                        );
                      })()}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRefreshSingleTask(task)}
                    disabled={!!refreshingTaskIds[task.id]}
                    title={`Refresh live views for ${influencerName}`}
                    className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-all shadow-xs disabled:cursor-not-allowed cursor-pointer select-none ${
                      refreshedStatus[task.id] === 'success'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-300 shadow-emerald-100'
                        : refreshedStatus[task.id] === 'no-links'
                        ? 'bg-amber-50 text-amber-700 border-amber-300 shadow-amber-100'
                        : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 active:bg-indigo-200 border-indigo-200/80 hover:border-indigo-300 active:scale-95'
                    }`}
                  >
                    {refreshingTaskIds[task.id] ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                        <span>Refreshing...</span>
                      </>
                    ) : refreshedStatus[task.id] === 'success' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Updated</span>
                      </>
                    ) : refreshedStatus[task.id] === 'no-links' ? (
                      <>
                        <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                        <span>No Links</span>
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Refresh</span>
                      </>
                    )}
                  </button>
                </div>

                {(() => {
                  const taskReport = getTaskMonitorReport(task);
                  const effectiveViews = taskReport.effectiveOriginalViews;
                  return (
                    <>
                      <div className="bg-slate-50/80 rounded-2xl p-3.5 border border-slate-200/90 mt-2 mb-4 space-y-3 shadow-2xs">
                        {/* Original Live Views Display with Abnormal View Monitor */}
                        <div className="bg-white rounded-xl p-3 border border-indigo-100 shadow-2xs">
                          <div className="flex items-center justify-between mb-1.5 gap-1 flex-wrap">
                            <label className="text-[11px] font-bold text-indigo-950 uppercase tracking-wider flex items-center gap-1.5 font-mono">
                              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Original Video Views
                            </label>
                            {taskReport.abnormalStopped ? (
                              <span
                                className="text-[9px] font-bold px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 font-mono flex items-center gap-1"
                                title={taskReport.stopReason}
                              >
                                <ShieldAlert className="w-3 h-3 text-rose-600 shrink-0" />
                                ABNORMAL STOPPED → ORIGINAL SHOWN
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono">
                                {effectiveViews > 0 ? 'ORIGINAL VERIFIED VIEWS' : 'NO PUBLIC VIEWS RECORDED'}
                              </span>
                            )}
                          </div>

                          {taskReport.abnormalStopped && taskReport.stoppedAbnormalValue > 0 && (
                            <div className="mb-2 flex items-center justify-between gap-2 bg-rose-50/90 border border-rose-200 rounded-lg px-2.5 py-1.5 text-[10px] font-mono text-rose-900">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <ShieldAlert className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                                <span className="truncate">
                                  Stopped abnormal view: <strong className="line-through text-rose-600">{taskReport.stoppedAbnormalValue.toLocaleString('en-IN')}</strong>
                                </span>
                              </div>
                              <span className="font-bold text-emerald-700 shrink-0">
                                Showing Original: {effectiveViews.toLocaleString('en-IN')}
                              </span>
                            </div>
                          )}

                          <div className="bg-gradient-to-r from-slate-50 to-indigo-50/40 border border-slate-200 rounded-xl p-2.5 text-center">
                            <div className="text-2xl font-black font-mono text-indigo-900 tracking-tight">
                              {effectiveViews > 0 ? effectiveViews.toLocaleString('en-IN') : '0'}
                            </div>
                            <p className="text-[10px] text-slate-500 font-medium font-mono mt-0.5">
                              {effectiveViews > 0
                                ? `Original views verified (${taskReport.primarySource})`
                                : 'Click Refresh or enter verified views from creator screenshot below'}
                            </p>
                          </div>
                        </div>
                        
                        {/* Metrics Row: CTR, Clicks, Ratio, CPC, CPV */}
                        <div className="grid grid-cols-5 gap-1 pt-2.5 border-t border-slate-200">
                          <div className="text-center">
                            <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">CTR</p>
                            <p className="text-sm font-bold text-gray-700 font-mono">{effectiveViews > 0 ? ((task.clicks || 0) / effectiveViews * 100).toFixed(2) : (task.ctr || 0)}%</p>
                          </div>
                          <div className="text-center">
                            <p className="text-[9px] text-red-400 font-bold uppercase tracking-wider">Clicks</p>
                            <p className="text-sm font-bold text-red-600 font-mono">{task.clicks || 0}</p>
                          </div>
                          <div className="text-center" title="1 Click per X views">
                            <p className="text-[9px] text-indigo-400 font-bold uppercase tracking-wider">Ratio</p>
                            <p className="text-xs font-bold text-indigo-600 font-mono mt-0.5">1:{(task.clicks && effectiveViews) ? Math.round(effectiveViews / task.clicks) : 0}</p>
                          </div>
                          <div className="text-center" title="Cost Per Click (Remuneration / Clicks)">
                            <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">CPC</p>
                            <p className="text-sm font-bold text-emerald-600 font-mono">₹{Number(task.clicks || 0) > 0 ? (Number(task.remuneration || 0) / Number(task.clicks)).toFixed(2) : (task.cpc || 0)}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">CPV</p>
                            <p className="text-sm font-bold text-gray-700 font-mono">₹{effectiveViews > 0 ? (Number(task.remuneration || 0) / effectiveViews).toFixed(3) : (task.cpv || 0)}</p>
                          </div>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-gray-100 space-y-3">
                        {links.map((linkObj, idx) => {
                          const isLinkRefreshing = linkPreviews[linkObj.url]?.loading;
                          const linkRep = taskReport.linkReports[linkObj.index];
                          return (
                            <div key={idx} className="flex flex-col gap-2">
                              <div className="flex flex-col gap-2 bg-white/50 border border-gray-100 rounded-lg p-2.5 hover:bg-white transition-colors overflow-hidden">
                                <div className="flex items-center justify-between pb-1.5 mb-1 border-b border-gray-100">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[10px] font-bold font-mono text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100 uppercase tracking-wider">
                                      Video Link {linkObj.index}
                                    </span>
                                    {linkRep?.originalViews !== undefined && linkRep.originalViews > 0 && (
                                      <span className="text-[9px] font-bold font-mono text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 flex items-center gap-0.5">
                                        <ShieldCheck className="w-2.5 h-2.5 text-emerald-600" />
                                        Original: {linkRep.originalViews.toLocaleString('en-IN')}
                                      </span>
                                    )}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      setLinkPreviews(prev => ({
                                        ...prev,
                                        [linkObj.url]: { ...prev[linkObj.url], loading: true }
                                      }));
                                      const data = await fetchPreviewForUrl(linkObj.url);
                                      setLinkPreviews(prev => ({
                                        ...prev,
                                        [linkObj.url]: { loading: false, data: data || prev[linkObj.url]?.data }
                                      }));
                                      const evalRes = evaluateLinkViewCandidate(
                                        data?.originalViews ?? data?.views,
                                        data,
                                        abnormalThreshold,
                                        abnormalMonitorEnabled
                                      );
                                      if (evalRes.acceptedOriginalViews !== undefined) {
                                        handleUpdateLinkViews(task.id, linkObj.index, String(evalRes.acceptedOriginalViews));
                                      }
                                    }}
                                    disabled={isLinkRefreshing}
                                    className="text-[10px] font-bold font-mono text-indigo-700 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded flex items-center gap-1 transition disabled:opacity-50 cursor-pointer shadow-2xs"
                                    title={`Re-fetch original live views for Video Link ${linkObj.index}`}
                                  >
                                    <RefreshCw className={`w-3 h-3 ${isLinkRefreshing ? 'animate-spin text-indigo-600' : ''}`} />
                                    <span>{isLinkRefreshing ? 'Verifying...' : `Refresh Link ${linkObj.index}`}</span>
                                  </button>
                                </div>

                                <LinkPreview 
                                  url={linkObj.url} 
                                  data={linkPreviews[linkObj.url]?.data} 
                                  loading={linkPreviews[linkObj.url]?.loading}
                                  displayViewsOverride={linkRep?.originalViews}
                                  abnormalStoppedInfo={linkRep?.abnormalStoppedInfo}
                                  fallbackTaskMeta={{
                                    releaseDate: task.releaseDate || null,
                                    uploadTime: (task as any).uploadTime || null,
                                    publishedAt: (task as any).publishedAt || null,
                                    publishedDate: (task as any).publishedDate || null,
                                    publishedTime: (task as any).publishedTime || null
                                  }}
                                />
                                {/* Verified Views Input (Available for all platforms: Facebook, Instagram, YouTube) */}
                                {(() => {
                                  const manualVal = task[`videoLink${linkObj.index}Views` as keyof typeof task] as number | undefined;
                                  const autoVal = linkRep?.originalViews;
                                  const hasManual = manualVal !== undefined && manualVal !== null && !isNaN(Number(manualVal));
                                  return (
                                    <div className="mt-1.5 flex items-center justify-between gap-2 bg-slate-50 rounded-lg border border-slate-200 p-2">
                                      <div className="flex items-center gap-1.5">
                                        <label className="text-[10px] font-bold text-slate-700 uppercase tracking-wider font-mono">
                                          Exact Original Views:
                                        </label>
                                        {hasManual ? (
                                          <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200 font-mono">
                                            ✓ Verified Override
                                          </span>
                                        ) : autoVal !== undefined ? (
                                          <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200 font-mono">
                                            🛡️ Original Auto
                                          </span>
                                        ) : null}
                                      </div>
                                      <div className="flex items-center gap-1.5">
                                        <input 
                                          type="number" 
                                          min="0"
                                          placeholder={autoVal !== undefined ? `Original: ${Number(autoVal).toLocaleString()}` : "Enter original views..."}
                                          value={manualVal !== undefined ? manualVal : ''}
                                          onChange={(e) => handleUpdateLinkViews(task.id, linkObj.index, e.target.value)}
                                          className="w-28 bg-white border border-slate-300 rounded px-2 py-1 text-xs font-bold font-mono text-slate-800 outline-none focus:ring-2 focus:ring-indigo-400 text-right shadow-2xs"
                                          title="Type exact original view count from creator's screenshot or app"
                                        />
                                        {hasManual && (
                                          <button
                                            type="button"
                                            onClick={() => handleUpdateLinkViews(task.id, linkObj.index, '')}
                                            className="text-[9px] text-slate-400 hover:text-red-500 font-bold px-1 py-0.5 rounded transition cursor-pointer"
                                            title="Clear manual override and revert to automatic original link views"
                                          >
                                            Revert
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })()}
                              </div>
                            </div>
                          );
                        })}
                   
                        {currentLinks.length > 0 && (
                          <button
                            type="button"
                            className="mt-3 flex items-center justify-center gap-2 w-full bg-emerald-50 text-emerald-700 hover:bg-emerald-500 hover:text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition border border-emerald-200 hover:border-emerald-500 cursor-pointer shadow-xs"
                            onClick={(e) => {
                              e.preventDefault();
                              const rightsMsg = `Hello ${influencerName},\n\nWe are from PRO-TO-GROW. We loved your video${currentLinks.length > 1 ? 's' : ''}: \n${currentLinks.join('\n')}\n\nWe would like to request the digital rights to feature ${currentLinks.length > 1 ? 'these videos' : 'this video'} in our advertising campaigns.\n\nPlease let us know if you are interested!\n\n[Timestamp: ${new Date().toLocaleString('en-GB')}]`;
                              if (!inf?.mobile) {
                                triggerUpdateWhatsAppModal({
                                  influencerId: inf?.id || task.influencerId || '',
                                  influencerName: influencerName || inf?.name || 'Creator',
                                  influencerAvatar: inf?.avatar,
                                  influencerHandle: inf?.handle,
                                  currentMobile: inf?.mobile || '',
                                  messageText: rightsMsg,
                                  contextTitle: 'Digital Rights Request',
                                  onSuccess: (savedNumber: string) => {
                                    openWhatsAppChat({
                                      phoneNumber: savedNumber,
                                      text: rightsMsg,
                                      preferApp: true,
                                      contactName: influencerName || inf?.name || 'Creator'
                                    });
                                    setWhatsappTimestamps(prev => ({
                                      ...prev,
                                      [task.id]: new Date().toLocaleString('en-GB')
                                    }));
                                  }
                                });
                                return;
                              }
                              openWhatsAppChat({
                                phoneNumber: inf.mobile,
                                text: rightsMsg,
                                preferApp: true,
                                contactName: influencerName || inf?.name || 'Creator'
                              });
                              setWhatsappTimestamps(prev => ({
                                ...prev,
                                [task.id]: new Date().toLocaleString('en-GB')
                              }));
                            }}
                          >
                            <MessageCircle className="w-4 h-4" />
                            <div className="flex flex-col items-start leading-tight text-left">
                              <span>Request Digital Rights via WhatsApp</span>
                              {whatsappTimestamps[task.id] && (
                                 <span className="text-[10px] font-mono opacity-80">Last sent: {whatsappTimestamps[task.id]}</span>
                              )}
                            </div>
                          </button>
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>
            );
          })}
        </div>
      )}



      {/* Centralized All Reels Links Directory Modal */}
      <AllReelsDirectoryModal
        isOpen={showAllReelsModal}
        onClose={() => setShowAllReelsModal(false)}
        tasks={tasks}
        influencers={influencers}
        initialMonth={selectedMonth}
        initialYear={selectedYear}
        onUpdateTask={onUpdateTask}
        onUpdateTasksBulk={onUpdateTasksBulk}
      />
    </div>
  );
}
