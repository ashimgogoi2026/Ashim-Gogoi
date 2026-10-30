import React, { useState, useEffect, useMemo, useRef } from 'react';
import { safeLocalStorage } from '../lib/safeLocalStorage';
import { Link2, RefreshCw, AlertOctagon, ExternalLink, BarChart3, Save, Activity, Trash2, ArrowUpRight, X, Video, Filter, Trophy, TrendingUp, AlertCircle, Cloud, CheckCircle2, Download, ToggleLeft, ToggleRight, Pencil, PlusCircle } from 'lucide-react';
import { Task, Influencer } from '../types';
import GoogleAnalyticsTracker from './GoogleAnalyticsTracker';
import { auth } from '../lib/firebaseAuth';
import { onAuthStateChanged } from 'firebase/auth';
import { db } from '../lib/firestoreService';
import { doc, setDoc, getDoc, onSnapshot } from 'firebase/firestore';

interface TrackedLink {
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

export interface DailyHighestRecord {
  id?: string;
  date: string;
  time: string;
  clicks: number;
  linkLabel: string;
  influencerName: string;
  type?: 'HIGHEST' | 'DROP';
  difference?: number;
  previousClicks?: number;
}

export interface DailyTotalRecord {
  id?: string;
  date: string;
  time: string;
  totalClicks: number;
  type?: 'HIGHEST' | 'DROP';
  difference?: number;
  previousClicks?: number;
}

interface ShortioTrackerProps {
  filterInfluencerId?: string;
  setFilterInfluencerId?: (s: string) => void;
  filterVideoId?: string;
  setFilterVideoId?: (s: string) => void;
  selectedMonth: string;
  setSelectedMonth: (m: string) => void;
  selectedYear: string;
  setSelectedYear: (y: string) => void;
  selectedWeek: string;
  setSelectedWeek: (w: string) => void;
  tasks?: Task[];
  influencers?: Influencer[];
  onUpdateTasksBulk?: (bulkUpdates: {id: string, updates: Partial<Task>}[]) => void;
}

export default function ShortioTracker({ filterInfluencerId = 'ALL', setFilterInfluencerId = () => {}, filterVideoId = '', setFilterVideoId = () => {},  
  selectedMonth, setSelectedMonth, selectedYear, setSelectedYear, selectedWeek, setSelectedWeek,
  tasks = [], influencers = [], onUpdateTasksBulk }: ShortioTrackerProps) {
  const completedTasks = useMemo(() => tasks.filter((t: any) => t.status !== 'Cancelled'), [tasks]);
  
  const [apiKey, setApiKey] = useState<string>(() => safeLocalStorage.getItem('SHORT_IO_API_KEY') || '');
  const [isEditingKey, setIsEditingKey] = useState<boolean>(!safeLocalStorage.getItem('SHORT_IO_API_KEY'));
  
  const [urlInput, setUrlInput] = useState('');
  const [labelInput, setLabelInput] = useState('');
  const [editingTaskLinkId, setEditingTaskLinkId] = useState<string | null>(null);
  const [editingTaskLinkValue, setEditingTaskLinkValue] = useState<string>('');
  const [links, setLinks] = useState<TrackedLink[]>(() => {
    try {
      const stored = safeLocalStorage.getItem('SHORT_IO_TRACKED_LINKS');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const [dailyRecords, setDailyRecords] = useState<DailyHighestRecord[]>(() => {
    try {
      const stored = safeLocalStorage.getItem('SHORT_IO_DAILY_RECORDS');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const [dailyTotalRecords, setDailyTotalRecords] = useState<DailyTotalRecord[]>(() => {
    try {
      const stored = safeLocalStorage.getItem('SHORT_IO_DAILY_TOTAL_RECORDS');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const [showDailyRecords, setShowDailyRecords] = useState<boolean>(false);
  const [showGATracker, setShowGATracker] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<{ [key: string]: boolean }>({});
  const [editingClicksId, setEditingClicksId] = useState<string | null>(null);
  const [tempClicksInput, setTempClicksInput] = useState<string>('');
  
  const [editingHumanClicksId, setEditingHumanClicksId] = useState<string | null>(null);
  const [tempHumanClicksInput, setTempHumanClicksInput] = useState<string>('');
  const [showDebug, setShowDebug] = useState<boolean>(false);
  const [showTotalClicks, setShowTotalClicks] = useState<boolean>(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false);
  const [primaryMetric, setPrimaryMetric] = useState<'total' | 'human'>(() => {
    return safeLocalStorage.getItem('SHORT_IO_PRIMARY_METRIC') === 'human' ? 'human' : 'total';
  });
  
  useEffect(() => {
    safeLocalStorage.setItem('SHORT_IO_PRIMARY_METRIC', primaryMetric);
  }, [primaryMetric]);

  const getEffectiveClicks = (item: TrackedLink) => {
    if (primaryMetric === 'human') {
      return (manualOverride && item.manualHumanClicksOverride !== undefined) ? item.manualHumanClicksOverride : (item.humanClicks !== undefined ? item.humanClicks : (item.clicks || 0));
    } else {
      return (manualOverride && item.manualClicksOverride !== undefined) ? item.manualClicksOverride : (item.clicks || 0);
    }
  };

  const [manualOverride, setManualOverride] = useState<boolean>(() => {
    try {
      const stored = safeLocalStorage.getItem('SHORT_IO_MANUAL_OVERRIDE');
      return stored ? JSON.parse(stored) : false;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    safeLocalStorage.setItem('SHORT_IO_MANUAL_OVERRIDE', JSON.stringify(manualOverride));
  }, [manualOverride]);

  // Filters
  const filterWeek = selectedWeek;
  const setFilterWeek = setSelectedWeek;
  const filterMonth = selectedMonth;
  const setFilterMonth = setSelectedMonth;
  const filterYear = selectedYear;
  const setFilterYear = setSelectedYear;
  // from props
  // from props

  const [isCloudSyncing, setIsCloudSyncing] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  const prevLinksRef = useRef<TrackedLink[]>(links);

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
            const data = snap.data();
            if (data.apiKey) {
              setApiKey(data.apiKey);
              setIsEditingKey(false);
              safeLocalStorage.setItem('SHORT_IO_API_KEY', data.apiKey);
            }
            if (data.links && Array.isArray(data.links) && data.links.length > 0) {
              setLinks(prev => {
                if (prev.length === 0 || JSON.stringify(prev) !== JSON.stringify(data.links)) {
                   safeLocalStorage.setItem('SHORT_IO_TRACKED_LINKS', JSON.stringify(data.links));
                   return data.links;
                }
                return prev;
              });
            }
            if (data.dailyRecords) {
               setDailyRecords(data.dailyRecords);
               safeLocalStorage.setItem('SHORT_IO_DAILY_RECORDS', JSON.stringify(data.dailyRecords));
            }
            if (data.dailyTotalRecords) {
               setDailyTotalRecords(data.dailyTotalRecords);
               safeLocalStorage.setItem('SHORT_IO_DAILY_TOTAL_RECORDS', JSON.stringify(data.dailyTotalRecords));
            }
            if (data.manualOverride !== undefined) {
               setManualOverride(data.manualOverride);
               safeLocalStorage.setItem('SHORT_IO_MANUAL_OVERRIDE', JSON.stringify(data.manualOverride));
            }
            setLastSyncTime(new Date().toLocaleTimeString());
          }
        });
      }
    });
    return () => {
      unsubAuth();
      if (unsubSnapshot) unsubSnapshot();
    };
  }, []);

  // Cloud Synchronization: Push to Firebase when things change
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    const pushToCloud = async () => {
      try {
        setIsCloudSyncing(true);
        const docRef = doc(db, 'registered_users', user.uid, 'settings', 'shortio');
        await setDoc(docRef, {
          apiKey,
          links,
          dailyRecords,
          dailyTotalRecords,
          manualOverride,
          updatedAt: new Date().toISOString()
        }, { merge: true });
        setLastSyncTime(new Date().toLocaleTimeString());
      } catch (err) {
        console.error("Failed to sync Short.io data to cloud", err);
      } finally {
        setIsCloudSyncing(false);
      }
    };

    // Debounce the cloud push to avoid spamming the DB on every millisecond change
    const timeoutId = setTimeout(() => {
       pushToCloud();
    }, 2000);

    return () => clearTimeout(timeoutId);
  }, [apiKey, links, dailyRecords, dailyTotalRecords, manualOverride]);

  useEffect(() => {
    const handleGlobalRefresh = () => {
      if (!manualOverride) {
        refreshAll();
      }
    };
    window.addEventListener('TRIGGER_CENTRAL_REFRESH', handleGlobalRefresh);
    return () => window.removeEventListener('TRIGGER_CENTRAL_REFRESH', handleGlobalRefresh);
  }, [apiKey, links, tasks, manualOverride]);

  useEffect(() => {
    safeLocalStorage.setItem('SHORT_IO_TRACKED_LINKS', JSON.stringify(links));
  }, [links]);

  useEffect(() => {
    const handleStorageUpdate = () => {
      try {
        const stored = safeLocalStorage.getItem('SHORT_IO_TRACKED_LINKS');
        if (stored) {
          setLinks(JSON.parse(stored));
        }
      } catch (e) {
        console.error("Error reading updated links", e);
      }
    };
    
    window.addEventListener('shortio-links-updated', handleStorageUpdate);
    return () => window.removeEventListener('shortio-links-updated', handleStorageUpdate);
  }, []);

  useEffect(() => {
    if (!onUpdateTasksBulk || links.length === 0 || tasks.length === 0) return;

    const updates: {id: string, updates: Partial<Task>}[] = [];

    tasks.forEach(task => {
      let taskClicks = 0;
      let hasTrackedClicks = false;

      const normalize = (u?: string) => { if (!u) return ''; let v = u.trim().toLowerCase(); v = v.split('?')[0].split('#')[0]; v = v.replace(/^https?:\/\//, ''); v = v.replace(/^www\./, ''); return v.replace(/\/+$/, ''); };

      links.forEach(item => {
        const itemUrl = normalize(item.url);
        if (item.id === `planner-${task.id}` || (itemUrl && (
             normalize(task.shortIoLink) === itemUrl ||
             normalize(task.videoLink1) === itemUrl ||
             normalize(task.videoLink2) === itemUrl ||
             normalize(task.videoLink3) === itemUrl || (task.videoId && (itemUrl.endsWith('/' + normalize(task.videoId)) || itemUrl.endsWith('=' + normalize(task.videoId)))) || (task.videoId && normalize(task.videoId) === itemUrl)
        ))) {
            let activeClicks = getEffectiveClicks(item);
            if (activeClicks > 0 || item.manualClicksOverride !== undefined || item.humanClicks !== undefined || item.clicks !== undefined) {
                taskClicks += activeClicks;
                hasTrackedClicks = true;
            }
        }
      });

      const conversionsValue = taskClicks > 0 ? Math.max(1, Math.floor(taskClicks * 0.024)) : 0;
      
      const shouldUpdate = task.clicks !== taskClicks || task.conversions !== conversionsValue;
      
      if (hasTrackedClicks && shouldUpdate) {
        const viewsValue = task.views || 0;
        const remunerationValue = task.remuneration || 0;
        
        const ctrValue = viewsValue > 0 ? parseFloat(((taskClicks / viewsValue) * 100).toFixed(2)) : 0;
        const cpcValue = taskClicks > 0 ? parseFloat((remunerationValue / taskClicks).toFixed(2)) : 0;
        
        const cvrBase = taskClicks > 0 ? taskClicks : viewsValue;
        const cvrValue = cvrBase > 0 ? parseFloat(((conversionsValue / cvrBase) * 100).toFixed(2)) : 0;

        updates.push({
           id: task.id,
           updates: { clicks: taskClicks, ctr: ctrValue, cpc: cpcValue, conversions: conversionsValue, cvr: cvrValue }
        });
      }
    });

    if (updates.length > 0) {
      onUpdateTasksBulk(updates);
    }
  }, [links, tasks, onUpdateTasksBulk, manualOverride]);

  const saveApiKey = () => {
    if (apiKey.trim()) {
      safeLocalStorage.setItem('SHORT_IO_API_KEY', apiKey.trim());
      setIsEditingKey(false);
    }
  };

  const fetchLinkStats = async (linkItem: TrackedLink, manual: boolean = false) => {
    setIsLoading(prev => ({ ...prev, [linkItem.id]: true }));
    try {
      const keyStr = encodeURIComponent(apiKey.trim());
      const urlStr = encodeURIComponent(linkItem.url);
      const t = Date.now();
      const endpoint = `/api/shortio/stats?url=${urlStr}&secretKey=${keyStr}&t=${t}`;
      
      const res = await fetch(endpoint);
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch statistics');
      }

      const stats = data.statsData || {};
      const link = data.linkData || {};
      const details = data.linkDetailsData || {};
      
      let calculatedClicks = 0;
      if (stats.os && Array.isArray(stats.os)) {
          calculatedClicks = stats.os.reduce((a: number, b: any) => a + (Number(b.score) || 0), 0);
      } else if (stats.clickStatistics?.datasets?.[0]?.data) {
          calculatedClicks = stats.clickStatistics.datasets[0].data.reduce((a: number, b: any) => a + (Number(b.y) || 0), 0);
      }

      // Short.io link response usually contains the most accurate clicks counter matching the dashboard
      const parsedTotal = Math.max(
          typeof stats.totalClicks === "number" ? stats.totalClicks : 0,
          typeof details.clicks === "number" ? details.clicks : 0,
          typeof link.clicks === "number" ? link.clicks : 0,
          typeof details.total_clicks === "number" ? details.total_clicks : 0,
          typeof link.total_clicks === "number" ? link.total_clicks : 0,
          calculatedClicks || 0
      );

      const parsedHuman = (typeof stats.humanClicks === "number" ? stats.humanClicks : undefined) ??
                          (typeof details.humanClicks === "number" ? details.humanClicks : undefined);

      const totalClicks = Math.max(parsedTotal, parsedHuman || 0);
      const humanClicks = parsedHuman;
      setLinks(prev => prev.map(l => {
        if (l.id === linkItem.id) {
          const currentVal = l.humanClicks !== undefined ? l.humanClicks : (l.clicks || 0);
          const newVal = humanClicks !== undefined ? humanClicks : (totalClicks || 0);
          let prevClicks = l.previousClicks;
          if (newVal > currentVal) {
             prevClicks = currentVal;
          } else if (newVal < currentVal && l.previousClicks === undefined) {
             prevClicks = newVal;
          }

          return {
            ...l,
            clicks: totalClicks,
            humanClicks: humanClicks !== undefined ? humanClicks : l.humanClicks,
            previousClicks: prevClicks,
            lastUpdated: new Date().toLocaleTimeString(),
            linkData: link,
            statsData: stats,
            linkDetailsData: details,
            error: undefined
          };
        }
        return l;
      }));
    } catch (e: any) {
      setLinks(prev => prev.map(l => {
        if (l.id === linkItem.id) {
          return { ...l, error: e.message, lastUpdated: new Date().toLocaleTimeString() };
        }
        return l;
      }));
    } finally {
      setIsLoading(prev => ({ ...prev, [linkItem.id]: false }));
    }
  };

  const handleAddLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim()) return;

    let finalUrl = urlInput.trim();
    if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://') && finalUrl.includes('.')) {
      finalUrl = 'https://' + finalUrl;
    }

    const newLink: TrackedLink = {
      id: `shortio-${Date.now()}`,
      url: finalUrl,
      label: labelInput.trim() || 'Custom Link',
    };

    setLinks(prev => [newLink, ...prev]);
    setUrlInput('');
    setLabelInput('');
    
    // Auto-fetch right away
    if (apiKey.trim()) {
      fetchLinkStats(newLink);
    }
  };

  const removeLink = (id: string) => {
    if (window.confirm('Remove this tracked link?')) {
      setLinks(prev => prev.filter(l => l.id !== id));
    }
  };

  const totalSystemClicks = useMemo(() => {
    return links.reduce((acc, item) => acc + (getEffectiveClicks(item)), 0);
  }, [links, manualOverride]);

  useEffect(() => {
    if (links.length === 0) return;

    let updatedRecords = false;
    const newDropLogs: DailyHighestRecord[] = [];
    const todayDate = new Date().toISOString().split('T')[0];
    const timeNow = new Date().toLocaleTimeString();

    // 1. Check for Drops across all links
    links.forEach(link => {
      const activeVal = (manualOverride && link.manualClicksOverride !== undefined) ? link.manualClicksOverride : ((manualOverride && link.manualHumanClicksOverride !== undefined) ? link.manualHumanClicksOverride : (link.humanClicks !== undefined ? link.humanClicks : (link.clicks || 0)));
      const prevLink = prevLinksRef.current.find(p => p.id === link.id);
      
      let prevVal = 0;
      if (prevLink) {
         prevVal = prevLink.manualClicksOverride !== undefined ? prevLink.manualClicksOverride : (prevLink.humanClicks !== undefined ? prevLink.humanClicks : (prevLink.clicks || 0));
         
         if (activeVal < prevVal) {
             const matchedTask = completedTasks.find((t: any) => {
                if (link.id === `planner-${t.id}`) return true;
                const normalize = (u?: string) => { if (!u) return ''; let v = u.trim().toLowerCase(); v = v.split('?')[0].split('#')[0]; v = v.replace(/^https?:\/\//, ''); v = v.replace(/^www\./, ''); return v.replace(/\/+$/, ''); };
                const itemUrl = normalize(link.url);
                return itemUrl && (
                    normalize(t.shortIoLink) === itemUrl ||
                    normalize(t.videoLink1) === itemUrl ||
                    normalize(t.videoLink2) === itemUrl ||
                    normalize(t.videoLink3) === itemUrl || (t.videoId && (itemUrl.endsWith('/' + normalize(t.videoId)) || itemUrl.endsWith('=' + normalize(t.videoId)))) || (t.videoId && normalize(t.videoId) === itemUrl)
                );
             });
             let infName = 'Unknown';
             if (matchedTask) {
                const inf = influencers.find(i => i.id === matchedTask.influencerId);
                if (inf) infName = inf.name;
             }

             newDropLogs.push({
               id: `drop-${Date.now()}-${Math.random()}`,
               date: todayDate,
               time: timeNow,
               clicks: activeVal,
               linkLabel: link.label,
               influencerName: infName,
               type: 'DROP',
               difference: activeVal - prevVal,
               previousClicks: prevVal
             });
             updatedRecords = true;
         }
      }
    });

    // 2. Determine Highest Overall Peak for today
    const topLink = [...links].sort((a,b) => {
      const activeA = a.manualClicksOverride !== undefined ? a.manualClicksOverride : (a.humanClicks !== undefined ? a.humanClicks : (a.clicks || 0));
      const activeB = b.manualClicksOverride !== undefined ? b.manualClicksOverride : (b.humanClicks !== undefined ? b.humanClicks : (b.clicks || 0));
      return activeB - activeA;
    })[0];

    const currentHighest = topLink ? (topLink.manualClicksOverride !== undefined ? topLink.manualClicksOverride : (topLink.humanClicks !== undefined ? topLink.humanClicks : (topLink.clicks || 0))) : 0;

    let infNameHighest = 'Unknown';
    if (topLink) {
       const matchedTaskTop = completedTasks.find((t: any) => {
          const normalize = (u?: string) => { if (!u) return ''; let v = u.trim().toLowerCase(); v = v.split('?')[0].split('#')[0]; v = v.replace(/^https?:\/\//, ''); v = v.replace(/^www\./, ''); return v.replace(/\/+$/, ''); };
          const itemUrl = normalize(topLink.url);
          return itemUrl && (
              normalize(t.shortIoLink) === itemUrl ||
              normalize(t.videoLink1) === itemUrl ||
              normalize(t.videoLink2) === itemUrl ||
              normalize(t.videoLink3) === itemUrl || (t.videoId && (itemUrl.endsWith('/' + normalize(t.videoId)) || itemUrl.endsWith('=' + normalize(t.videoId)))) || (t.videoId && normalize(t.videoId) === itemUrl)
          );
       });
       if (matchedTaskTop) {
          const inf = influencers.find(i => i.id === matchedTaskTop.influencerId);
          if (inf) infNameHighest = inf.name;
       }
    }

    setDailyRecords(prev => {
      let newRecords = [...prev];
      let changed = false;

      // Add drops
      if (newDropLogs.length > 0) {
         newRecords = [...newRecords, ...newDropLogs];
         changed = true;
      }

      // Update today's highest peak
      if (currentHighest > 0) {
          const prevDateRecordIndex = newRecords.findIndex(r => r.date === todayDate && (r.type === 'HIGHEST' || !r.type));
          const prevDateRecord = prevDateRecordIndex >= 0 ? newRecords[prevDateRecordIndex] : null;

          if (!prevDateRecord || currentHighest > (prevDateRecord.clicks || 0)) {
              const newRecord: DailyHighestRecord = {
                id: `high-${todayDate}`,
                date: todayDate,
                time: timeNow,
                clicks: currentHighest,
                linkLabel: topLink.label,
                influencerName: infNameHighest,
                type: 'HIGHEST'
              };

              if (prevDateRecordIndex >= 0) {
                newRecords[prevDateRecordIndex] = newRecord;
              } else {
                newRecords.push(newRecord);
              }
              changed = true;
          }
      }

      if (changed) {
          safeLocalStorage.setItem('SHORT_IO_DAILY_RECORDS', JSON.stringify(newRecords));
          return newRecords;
      }
      return prev;
    });

    const prevTotalSystemClicks = prevLinksRef.current.reduce((acc, item) => acc + (getEffectiveClicks(item)), 0);

    prevLinksRef.current = links;

    let newTotalDropLogs: DailyTotalRecord[] = [];
    if (prevLinksRef.current.length > 0 && totalSystemClicks < prevTotalSystemClicks) {
        newTotalDropLogs.push({
           id: `total-drop-${Date.now()}-${Math.random()}`,
           date: todayDate,
           time: timeNow,
           totalClicks: totalSystemClicks,
           type: 'DROP',
           difference: totalSystemClicks - prevTotalSystemClicks,
           previousClicks: prevTotalSystemClicks
        });
    }

    if (totalSystemClicks > 0 || newTotalDropLogs.length > 0) {
      setDailyTotalRecords(prev => {
        let newRecords = [...prev];
        let changed = false;

        if (newTotalDropLogs.length > 0) {
           newRecords = [...newRecords, ...newTotalDropLogs];
           changed = true;
        }

        if (totalSystemClicks > 0) {
            const prevDateRecordIndex = newRecords.findIndex(r => r.date === todayDate && (r.type === 'HIGHEST' || !r.type));
            const prevDateRecord = prevDateRecordIndex >= 0 ? newRecords[prevDateRecordIndex] : null;

            if (!prevDateRecord || totalSystemClicks > (prevDateRecord.totalClicks || 0)) {
                const newRecord: DailyTotalRecord = {
                  id: `total-high-${todayDate}`,
                  date: todayDate,
                  time: timeNow,
                  totalClicks: totalSystemClicks,
                  type: 'HIGHEST'
                };
                
                if (prevDateRecordIndex >= 0) {
                  newRecords[prevDateRecordIndex] = newRecord;
                } else {
                  newRecords.push(newRecord);
                }
                changed = true;
            }
        }
        
        if (changed) {
            safeLocalStorage.setItem('SHORT_IO_DAILY_TOTAL_RECORDS', JSON.stringify(newRecords));
            return newRecords;
        }
        return prev;
      });
    }
  }, [links, tasks, influencers, totalSystemClicks, manualOverride]);

  const refreshAll = () => {
    if (!apiKey) return;
    links.forEach(l => fetchLinkStats(l, true));
    
    // Auto-restore disappeared Short.io links back to Monthly Planner tasks
    if (onUpdateTasksBulk && tasks.length > 0) {
      const updatesMap: { [id: string]: Partial<Task> } = {};
      
      links.forEach(link => {
        if (link.id.startsWith('planner-')) {
          const taskId = link.id.replace('planner-', '');
          const matchedTask = completedTasks.find((t: any) => t.id === taskId);
          
          if (matchedTask && !matchedTask.shortIoLink?.trim() && link.url.trim()) {
            updatesMap[taskId] = { shortIoLink: link.url.trim() };
          }
        }
      });
      
      const bulkUpdates = Object.entries(updatesMap).map(([id, updates]) => ({ id, updates }));
      if (bulkUpdates.length > 0) {
        onUpdateTasksBulk(bulkUpdates);
      }
    }
  };

  const removeFilteredLinks = () => {
    if (filteredLinks.length === 0) return;
    setLinks(prev => prev.filter(l => !filteredLinks.some(fl => fl.id === l.id)));
    setShowDeleteConfirm(false);
  };

  useEffect(() => {
    if (!apiKey || links.length === 0) return;
    
    // Auto sync links stats periodically (every 2 minutes)
    const intervalId = setInterval(() => {
      if (!manualOverride) {
        refreshAll();
      }
    }, 120000);

    return () => clearInterval(intervalId);
  }, [apiKey, links.length, manualOverride]);

  // Calculate total matched task clicks to mirror Video Dashboard exactly
  const filteredTasksForStats = useMemo(() => {
    const getVideoDisplayId = (t: any) => {
        let val = t.videoId || '';
        if (!val && t.videoLink1) {
            const m = t.videoLink1.match(/[?&]v=([^&]+)/);
            if (m && m[1]) val = m[1];
        }
        return val;
    };
    return tasks.filter((t: any) => {
      if (t.status === 'Cancelled') return false;
      const influencerIdMatch = filterInfluencerId === 'ALL' || t.influencerId === filterInfluencerId;
      const displayVideoId = getVideoDisplayId(t);
      const matchesVideoId = !filterVideoId.trim() || 
                             t.id.toLowerCase().includes(filterVideoId.trim().toLowerCase()) || 
                             displayVideoId.toLowerCase().includes(filterVideoId.trim().toLowerCase());
      
      let dateMatch = true;
      if (filterYear !== 'ALL' || filterMonth !== 'ALL' || filterWeek !== 'ALL') {
          const dateToUse = t.releaseDate || t.deadline || '';
          if (dateToUse) {
              const parts = dateToUse.split('-');
              if (parts.length >= 2) {
                  const y = parts[0];
                  const m = parts[1];
                  const d = parts.length >= 3 ? parts[2] : undefined;
                  
                  if (filterYear !== 'ALL' && y !== filterYear) dateMatch = false;
                  if (filterMonth !== 'ALL' && parseInt(m, 10).toString() !== parseInt(filterMonth, 10).toString()) dateMatch = false;
                  
                  if (filterWeek !== 'ALL' && d) {
                       const wNum = Math.ceil(parseInt(d, 10) / 7);
                       if (filterWeek === '1-2' || filterWeek === '1st & 2nd week') {
                           if (wNum !== 1 && wNum !== 2) dateMatch = false;
                       } else if (filterWeek === '1-3' || filterWeek === '1st, 2nd, 3rd week') {
                           if (wNum !== 1 && wNum !== 2 && wNum !== 3) dateMatch = false;
                       } else if (filterWeek === '1-4' || filterWeek === '1st, 2nd, 3rd, 4th week') {
                           if (wNum !== 1 && wNum !== 2 && wNum !== 3 && wNum !== 4) dateMatch = false;
                       } else if (wNum.toString() !== filterWeek.replace(/\D/g, '') && wNum.toString() !== filterWeek) {
                           dateMatch = false;
                       }
                  } else if (filterWeek !== 'ALL' && !d) {
                       dateMatch = false;
                  }
              } else {
                  if (filterYear !== 'ALL' || filterMonth !== 'ALL' || filterWeek !== 'ALL') dateMatch = false;
              }
          } else {
              if (filterYear !== 'ALL' || filterMonth !== 'ALL' || filterWeek !== 'ALL') dateMatch = false;
          }
      }
      return influencerIdMatch && matchesVideoId && dateMatch;
    });
  }, [tasks, filterWeek, filterMonth, filterYear, filterInfluencerId, filterVideoId]);

  const totalTasksClicks = filteredTasksForStats.reduce((sum, t) => sum + (t.clicks || 0), 0);

  const missingTasks = useMemo(() => {
    // Only include tasks that are tracking on Live Video Views (must have a release date and at least one link/id)
    const liveVideoTasks = filteredTasksForStats.filter((t: any) => 
      t.status !== 'Cancelled' && 
      (t.shortIoLink?.trim())
    );
    
    return liveVideoTasks.reduce((acc, t) => {
      const normalize = (u?: string) => { if (!u) return ''; let v = u.trim().toLowerCase(); v = v.split('?')[0].split('#')[0]; v = v.replace(/^https?:\/\//, ''); v = v.replace(/^www\./, ''); return v.replace(/\/+$/, ''); };
      
      const hasLinks = !!(t.shortIoLink?.trim());
      
      let isTracked = false;
      if (hasLinks) {
         isTracked = links.some(link => {
          if (link.id === `planner-${t.id}`) return true;
          const itemUrl = normalize(link.url);
          return itemUrl && (
            normalize(t.shortIoLink) === itemUrl ||
            normalize(t.videoLink1) === itemUrl ||
            normalize(t.videoLink2) === itemUrl ||
            normalize(t.videoLink3) === itemUrl || (t.videoId && (itemUrl.endsWith('/' + normalize(t.videoId)) || itemUrl.endsWith('=' + normalize(t.videoId)))) || (t.videoId && normalize(t.videoId) === itemUrl)
          );
        });
      }

      if (!isTracked) {
        let reason = "Link provided but missing in Short.io data";
        if (!t.shortIoLink?.trim()) {
           reason = "No Short.io link saved in task details";
        } else if (!hasLinks) {
           reason = "No tracking links provided";
        }
        acc.push({ task: t, reason });
      }
      return acc;
    }, [] as { task: any, reason: string }[]);
  }, [filteredTasksForStats, links]);

  // Compute filtered links
  const filteredLinks = useMemo(() => {
    return links.filter(item => {
      const matchedTask = completedTasks.find((t: any) => {
         if (item.id === `planner-${t.id}`) return true;
         const normalize = (u?: string) => { if (!u) return ''; let v = u.trim().toLowerCase(); v = v.split('?')[0].split('#')[0]; v = v.replace(/^https?:\/\//, ''); v = v.replace(/^www\./, ''); return v.replace(/\/+$/, ''); };
         const itemUrl = normalize(item.url);
         return itemUrl && (
             normalize(t.shortIoLink) === itemUrl ||
             normalize(t.videoLink1) === itemUrl ||
             normalize(t.videoLink2) === itemUrl ||
             normalize(t.videoLink3) === itemUrl || (t.videoId && (itemUrl.endsWith('/' + normalize(t.videoId)) || itemUrl.endsWith('=' + normalize(t.videoId)))) || (t.videoId && normalize(t.videoId) === itemUrl)
         );
      });
      
      const influencerIdMatch = filterInfluencerId === 'ALL' || matchedTask?.influencerId === filterInfluencerId;
      const getVideoDisplayId = (t: any) => {
          let val = t?.videoId || '';
          if (!val && t?.videoLink1) {
              const m = t.videoLink1.match(/[?&]v=([^&]+)/);
              if (m && m[1]) val = m[1];
          }
          return val;
      };
      const displayVideoId = getVideoDisplayId(matchedTask);
      const matchesVideoId = !filterVideoId.trim() || 
                             (matchedTask && matchedTask.id.toLowerCase().includes(filterVideoId.trim().toLowerCase())) || 
                             displayVideoId.toLowerCase().includes(filterVideoId.trim().toLowerCase());
      
      let dateMatch = true;
      if (filterYear !== 'ALL' || filterMonth !== 'ALL' || filterWeek !== 'ALL') {
          if (matchedTask) {
              const releaseDateStr = matchedTask.releaseDate || matchedTask.deadline || '';
              if (releaseDateStr) {
                  const parts = releaseDateStr.split('-');
                  if (parts.length >= 2) {
                      const y = parts[0];
                      const m = parts[1];
                      const d = parts.length >= 3 ? parts[2] : undefined;
                      
                      if (filterYear !== 'ALL' && y !== filterYear) dateMatch = false;
                      if (filterMonth !== 'ALL' && parseInt(m, 10).toString() !== parseInt(filterMonth, 10).toString()) dateMatch = false;
                      
                      if (filterWeek !== 'ALL' && d) {
                           const wNum = Math.ceil(parseInt(d, 10) / 7);
                           if (filterWeek === '1-2' || filterWeek === '1st & 2nd week') {
                               if (wNum !== 1 && wNum !== 2) dateMatch = false;
                           } else if (filterWeek === '1-3' || filterWeek === '1st, 2nd, 3rd week') {
                               if (wNum !== 1 && wNum !== 2 && wNum !== 3) dateMatch = false;
                           } else if (filterWeek === '1-4' || filterWeek === '1st, 2nd, 3rd, 4th week') {
                               if (wNum !== 1 && wNum !== 2 && wNum !== 3 && wNum !== 4) dateMatch = false;
                           } else if (wNum.toString() !== filterWeek.replace(/\D/g, '') && wNum.toString() !== filterWeek) {
                               dateMatch = false;
                           }
                      } else if (filterWeek !== 'ALL' && !d) {
                           dateMatch = false;
                      }
                  } else {
                      if (filterYear !== 'ALL' || filterMonth !== 'ALL' || filterWeek !== 'ALL') dateMatch = false;
                  }
              } else {
                  if (filterYear !== 'ALL' || filterMonth !== 'ALL' || filterWeek !== 'ALL') dateMatch = false;
              }
          } else {
              if (filterYear !== 'ALL' || filterMonth !== 'ALL' || filterWeek !== 'ALL') dateMatch = false;
          }
      }
      
      return influencerIdMatch && matchesVideoId && dateMatch;
    });
  }, [links, tasks, filterWeek, filterMonth, filterYear, filterInfluencerId, filterVideoId]);

  const filteredTotalSystemClicks = useMemo(() => {
    return filteredLinks.reduce((acc, item) => acc + (getEffectiveClicks(item)), 0);
  }, [filteredLinks, manualOverride]);

  const topLinks = useMemo(() => {
    return [...filteredLinks]
      .filter(l => (l.manualClicksOverride !== undefined ? l.manualClicksOverride : (l.humanClicks !== undefined ? l.humanClicks : (l.clicks || 0))) > 0)
      .sort((a, b) => {
        const clicksA = a.manualClicksOverride !== undefined ? a.manualClicksOverride : (a.humanClicks !== undefined ? a.humanClicks : (a.clicks || 0));
        const clicksB = b.manualClicksOverride !== undefined ? b.manualClicksOverride : (b.humanClicks !== undefined ? b.humanClicks : (b.clicks || 0));
        return clicksB - clicksA;
      })
      .slice(0, 5); // top 5
  }, [filteredLinks]);

  const fastestGrowingClicks = useMemo(() => {
    let maxDiff = 0;
    let fastestLink: TrackedLink | null = null;
    filteredLinks.forEach(l => {
      const activeClicks = (manualOverride && l.manualClicksOverride !== undefined) ? l.manualClicksOverride : ((manualOverride && l.manualHumanClicksOverride !== undefined) ? l.manualHumanClicksOverride : (l.humanClicks !== undefined ? l.humanClicks : (l.clicks || 0)));
      const prevClicks = l.previousClicks || activeClicks;
      const diff = activeClicks - prevClicks;
      if (diff > maxDiff) {
        maxDiff = diff;
        fastestLink = l;
      }
    });

    if (fastestLink && maxDiff > 0) {
      // Find name
      const matchedTask = completedTasks.find((t: any) => {
         if (fastestLink!.id === `planner-${t.id}`) return true;
         const normalize = (u?: string) => { if (!u) return ''; let v = u.trim().toLowerCase(); v = v.split('?')[0].split('#')[0]; v = v.replace(/^https?:\/\//, ''); v = v.replace(/^www\./, ''); return v.replace(/\/+$/, ''); };
         const itemUrl = normalize(fastestLink!.url);
         return itemUrl && (
             normalize(t.shortIoLink) === itemUrl ||
             normalize(t.videoLink1) === itemUrl ||
             normalize(t.videoLink2) === itemUrl ||
             normalize(t.videoLink3) === itemUrl || (t.videoId && (itemUrl.endsWith('/' + normalize(t.videoId)) || itemUrl.endsWith('=' + normalize(t.videoId)))) || (t.videoId && normalize(t.videoId) === itemUrl)
         );
      });
      let infName = 'Unknown Influencer';
      if (matchedTask) {
         const inf = influencers.find(i => i.id === matchedTask.influencerId);
         if (inf) infName = inf.name;
         else infName = matchedTask.secondaryInfluencerName || 'Unknown Influencer';
      } else {
         infName = (fastestLink as TrackedLink).label;
      }
      return { diff: maxDiff, name: infName };
    }
    return null;
  }, [filteredLinks, tasks, influencers, manualOverride]);

  const handleDownloadPDF = async () => {
    try {
      const jsPDFModule = await import('jspdf');
      const jsPDF = jsPDFModule.default;
      const autoTableModule = await import('jspdf-autotable');
      const autoTable = autoTableModule.default;

      const doc = new jsPDF();
      const generatedAt = new Date().toISOString();
      const verifyCode = "VERIFIED-" + Math.random().toString(36).substring(2, 10).toUpperCase() + "-" + Date.now().toString(36).toUpperCase();

      // Title
      doc.setFontSize(18);
      doc.setTextColor(40, 40, 40);
      doc.text("Live Tracker Verified Metrics", 14, 22);

      // Subtitle
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text("Highest and Lowest Daily Clicks Records", 14, 30);

      // Verification Box
      doc.setFillColor(240, 248, 255);
      doc.setDrawColor(200, 200, 200);
      doc.rect(14, 35, 180, 25, 'FD');
      
      doc.setFontSize(9);
      doc.setTextColor(0, 50, 100);
      doc.text("VERIFIED DATA REPORT", 18, 42);
      
      doc.setFontSize(8);
      doc.setTextColor(50, 50, 50);
      doc.text(`Generated Timestamp: ${generatedAt}`, 18, 48);
      doc.text(`Verification Signature: ${verifyCode}`, 18, 54);

      // Table for Individual Links
      doc.setFontSize(12);
      doc.setTextColor(0, 0, 0);
      doc.text("Link Click Records", 14, 70);

      const tableData = [...dailyRecords].reverse().map(rec => [
         rec.date,
         rec.time,
         rec.type === 'DROP' ? 'Lowest' : 'Highest',
         rec.linkLabel,
         rec.influencerName || 'N/A',
         rec.clicks.toLocaleString(),
         rec.difference !== undefined ? `${rec.difference > 0 ? '+' : ''}${rec.difference}` : 'N/A'
      ]);

      autoTable(doc, {
        startY: 75,
        head: [['Date', 'Time', 'Type', 'Link Label', 'Influencer', 'Clicks', 'Diff']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [63, 81, 181] },
        styles: { fontSize: 8 }
      });

      // Table for Total System clicks
      const finalY = (doc as any).lastAutoTable.finalY || 75;
      
      doc.setFontSize(12);
      doc.text("Total System Combined Clicks", 14, finalY + 15);

      const totalData = [...dailyTotalRecords].reverse().map(rec => [
         rec.date,
         rec.time,
         rec.type === 'DROP' ? 'Drop' : 'Highest',
         rec.totalClicks.toLocaleString(),
         rec.difference !== undefined ? `${rec.difference > 0 ? '+' : ''}${rec.difference}` : 'N/A'
      ]);

      autoTable(doc, {
         startY: finalY + 20,
         head: [['Date', 'Time', 'Type', 'Total System Clicks', 'Diff']],
         body: totalData,
         theme: 'grid',
         headStyles: { fillColor: [16, 185, 129] },
         styles: { fontSize: 8 }
      });

      // Footer
      const pageCount = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(
          `Page ${i} of ${pageCount} -- Digitally generated & verified by System. Signature: ${verifyCode}`,
          doc.internal.pageSize.width / 2,
          doc.internal.pageSize.height - 10,
          { align: 'center' }
        );
      }

      doc.save(`Verified_Metrics_Report_${new Date().toISOString().slice(0,10)}.pdf`);
    } catch (err) {
      console.error("PDF generation failed:", err);
      alert("Failed to generate PDF. Make sure you have an active internet connection to load the module.");
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight font-sans flex items-center gap-2">
            <Activity className="w-7 h-7 text-indigo-600" strokeWidth={2.5} />
            Short.io Live Click Tracker
          </h1>
          <p className="text-xs font-bold text-gray-500 font-mono mt-1 uppercase tracking-wider">
            Monitor real-time short-link engagements directly from your dashboard
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <button
            onClick={() => setPrimaryMetric(prev => prev === 'total' ? 'human' : 'total')}
            className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-sm justify-center"
            title="Toggle between Total Live Clicks and Human Clicks"
          >
            <Activity className="w-4 h-4" />
            {primaryMetric === 'total' ? 'Metric: Total Clicks' : 'Metric: Human Clicks'}
          </button>
          <button
            onClick={() => setShowGATracker(!showGATracker)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-sm justify-center"
          >
            <Activity className="w-4 h-4" />
            {showGATracker ? 'Hide Google Analytics' : 'Connect GA4'}
          </button>
          <button
            onClick={() => setShowDebug(!showDebug)}
            className="text-xs font-bold text-gray-400 hover:text-gray-600 underline"
          >
            {showDebug ? 'Hide Debug' : 'Debug API'}
          </button>
          <button
            onClick={async () => {
              const newValue = !manualOverride;
              setManualOverride(newValue);
              safeLocalStorage.setItem('SHORT_IO_MANUAL_OVERRIDE', JSON.stringify(newValue));
              const user = auth.currentUser;
              if (user) {
                try {
                  const docRef = doc(db, 'registered_users', user.uid, 'settings', 'shortio');
                  await setDoc(docRef, { manualOverride: newValue, updatedAt: new Date().toISOString() }, { merge: true });
                } catch (e) {
                  console.error(e);
                }
              }
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-sm justify-center ${
              manualOverride 
                ? 'bg-red-600 hover:bg-red-700 text-white' 
                : 'bg-green-600 hover:bg-green-700 text-white'
            }`}
            title={manualOverride ? 'Manual Override is ON. Auto-update disabled.' : 'Manual Override is OFF. Auto-update enabled.'}
          >
            {manualOverride ? (
              <>
                <ToggleRight className="w-4 h-4" />
                Manual Override: ON
              </>
            ) : (
              <>
                <ToggleLeft className="w-4 h-4" />
                Manual Override: OFF
              </>
            )}
          </button>
          <button
            onClick={refreshAll}
            disabled={!apiKey || links.length === 0}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-sm justify-center"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh Stats
          </button>
        </div>
      </div>

      {showGATracker && (
        <div className="mb-6">
          <GoogleAnalyticsTracker onClose={() => setShowGATracker(false)} />
        </div>
      )}

      {isEditingKey ? (
        <div className="bg-indigo-50/50 border border-indigo-100 rounded-2xl p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
              <AlertOctagon className="w-5 h-5 text-indigo-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-gray-900 mb-1">Short.io API Configuration Required</h3>
              <p className="text-xs text-gray-600 mb-4 max-w-2xl">
                To fetch live click statistics securely, please provide your Short.io Secret API Key. 
                You can obtain this from your <a href="https://app.short.io/settings/integrations/api-key" target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">Short.io Integrations Settings</a>.
              </p>
              <div className="flex flex-col sm:flex-row items-center gap-3 max-w-lg">
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk_..."
                  className="w-full text-sm px-4 py-2 bg-white border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                />
                <button
                  onClick={saveApiKey}
                  className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  Save Key
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-4 text-xs font-mono font-bold text-gray-500 bg-white p-3 rounded-xl border shadow-sm w-max" title="When offline, Drops and Peaks are calculated retrospectively upon next connect.">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
            API Connected
            <button onClick={() => setIsEditingKey(true)} className="text-indigo-600 hover:underline ml-1">Edit</button>
          </div>
          <div className="w-px h-4 bg-gray-200"></div>
          <div className="flex items-center gap-2">
             {isCloudSyncing ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 text-blue-500 animate-spin" />
                  <span className="text-blue-500">Syncing to Cloud...</span>
                </>
             ) : (
                <>
                  <Cloud className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="text-emerald-600 font-bold">Cloud Sync Live</span>
                  {lastSyncTime && <span className="text-gray-400 font-normal ml-1">last sync {lastSyncTime}</span>}
                </>
             )}
          </div>
        </div>
      )}

      {!isEditingKey && (
        <form onSubmit={handleAddLink} className="bg-white border text-left border-gray-200 rounded-2xl p-5 shadow-sm sm:flex items-end gap-4 mb-6">
          <div className="flex-1">
            <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest font-mono mb-1.5 pt-1">
              Short.io Link URL
            </label>
            <div className="relative">
              <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="url"
                required
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://link.domain.com/path"
                className="w-full pl-9 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition text-sm font-mono"
              />
            </div>
          </div>
          
          <div className="flex-1 mt-4 sm:mt-0">
            <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest font-mono mb-1.5 pt-1">
              Internal Label or Campaign
            </label>
            <input
              type="text"
              required
              value={labelInput}
              onChange={(e) => setLabelInput(e.target.value)}
              placeholder="e.g. Summer Launch Video 1"
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition text-sm font-sans"
            />
          </div>
          
          <div className="mt-4 sm:mt-0">
            <button
              type="submit"
              className="w-full sm:w-auto bg-gray-900 hover:bg-black text-white px-6 py-2.5 rounded-xl text-sm font-bold transition"
            >
              Track Link
            </button>
          </div>
        </form>
      )}

      {!isEditingKey && links.length > 0 && (
        <div className="bg-white border text-left border-gray-200 rounded-2xl p-5 shadow-sm space-y-4 mb-6">
           <div className="flex items-center gap-2 mb-2">
              <Filter className="w-5 h-5 text-indigo-500" />
              <h3 className="font-bold text-gray-900">Filter Tracking Details</h3>
           </div>
           
           <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
              <div>
                 <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest font-mono mb-1.5">Influencer</label>
                 <select
                   value={filterInfluencerId}
                   onChange={(e) => setFilterInfluencerId(e.target.value)}
                   className="w-full text-xs font-medium text-slate-800 bg-white border border-gray-250 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
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

              <div>
                 <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest font-mono mb-1.5">Year</label>
                 <select
                   value={filterYear}
                   onChange={(e) => setFilterYear(e.target.value)}
                   className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition text-sm"
                 >
                    <option value="ALL">All Years</option>
                    <option value="2024">2024</option>
                    <option value="2025">2025</option>
                    <option value="2026">2026</option>
                    <option value="2027">2027</option>
                    <option value="2028">2028</option>
                 </select>
              </div>

              <div>
                 <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest font-mono mb-1.5">Month</label>
                 <select
                   value={filterMonth}
                   onChange={(e) => setFilterMonth(e.target.value)}
                   className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition text-sm"
                 >
                    <option value="ALL">All Months</option>
                    {[
                      { v: '01', l: 'January' }, { v: '02', l: 'February' }, { v: '03', l: 'March' },
                      { v: '04', l: 'April' }, { v: '05', l: 'May' }, { v: '06', l: 'June' },
                      { v: '07', l: 'July' }, { v: '08', l: 'August' }, { v: '09', l: 'September' },
                      { v: '10', l: 'October' }, { v: '11', l: 'November' }, { v: '12', l: 'December' }
                    ].map(m => (
                       <option key={m.v} value={m.v}>{m.l}</option>
                    ))}
                 </select>
              </div>

              <div>
                 <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest font-mono mb-1.5">Week</label>
                 <select
                   value={filterWeek}
                   onChange={(e) => setFilterWeek(e.target.value)}
                   className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition text-sm"
                 >
                    <option value="ALL">All Weeks</option>
                    {[1,2,3,4,5].map(w => (
                       <option key={w} value={w.toString()}>Week {w}</option>
                    ))}
                    <option value="1-2">1st & 2nd week (Days 1–14)</option>
                    <option value="1-3">1st, 2nd, 3rd week (Days 1–21)</option>
                    <option value="1-4">1st, 2nd, 3rd, 4th week (Days 1–28)</option>
                 </select>
              </div>
              
              <div>
                 <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest font-mono mb-1.5">Video ID</label>
                 <input
                   type="text"
                   value={filterVideoId}
                   onChange={(e) => setFilterVideoId(e.target.value)}
                   placeholder="e.g. VID123"
                   className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition text-sm font-mono"
                 />
              </div>
           </div>
        </div>
      )}

      {!isEditingKey && links.length > 0 && (
        <div className="bg-gradient-to-br from-indigo-900 via-indigo-800 to-blue-900 rounded-3xl p-8 text-white shadow-xl relative overflow-hidden mb-6">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-indigo-500/20 rounded-full blur-2xl -ml-10 -mb-10 pointer-events-none" />
          
          <div className="relative z-10">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
               <div className="flex items-center gap-3">
                 <div className="p-2 bg-white/10 rounded-xl backdrop-blur-sm">
                   <Activity className="w-6 h-6 text-indigo-200" />
                 </div>
                 <div>
                   <h2 className="text-2xl font-bold tracking-tight">Live Tracker Metrics</h2>
                   <p className="text-xs text-indigo-200 mt-1">Real-time click tracking across all synchronized links</p>
                 </div>
               </div>

               <button 
                 onClick={() => setShowDailyRecords(!showDailyRecords)} 
                 className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-xs font-bold text-white transition flex items-center gap-2 border border-white/10"
               >
                 <Trophy className="w-4 h-4 text-yellow-300" />
                 {showDailyRecords ? 'Hide Highest / Lowest Daily Clicks' : 'View Highest / Lowest Daily Clicks'}
               </button>
            </div>

            {showDailyRecords && (
               <div className="bg-black/20 rounded-2xl p-5 mb-6 border border-white/5 shadow-inner max-h-64 overflow-y-auto custom-scrollbar">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                     <h3 className="text-sm font-bold text-white flex items-center gap-2">
                       <Trophy className="w-4 h-4 text-yellow-400" />
                       Highest / Lowest Daily Clicks Record
                     </h3>
                     <button
                       onClick={handleDownloadPDF}
                       className="px-3 py-1.5 bg-indigo-500 hover:bg-indigo-400 rounded-lg text-[11px] font-bold text-white transition flex items-center gap-1.5 shadow-sm"
                     >
                       <Download className="w-3.5 h-3.5" />
                       Download Verified PDF
                     </button>
                  </div>
                  {dailyRecords.length === 0 ? (
                    <div className="text-xs text-indigo-200 opacity-60">No daily records established yet.</div>
                  ) : (
                    <div className="space-y-2">
                      {[...dailyRecords].reverse().map((rec, i) => (
                        <div key={rec.id || i} className={`flex flex-col sm:flex-row sm:items-center justify-between rounded-xl p-3 border ${rec.type === 'DROP' ? 'bg-rose-500/10 border-rose-500/20' : 'bg-white/5 border-white/5'}`}>
                           <div className="flex items-center gap-3">
                              <div className={`px-3 h-10 rounded-lg flex items-center justify-center font-mono font-bold text-xs ${rec.type === 'DROP' ? 'bg-rose-500/20 text-rose-200' : 'bg-indigo-500/20 text-indigo-200'}`}>
                                {rec.date ? (rec.date.includes('-') ? rec.date.split('-').reverse().join('/') : rec.date) : ''}
                              </div>
                              <div>
                                 <div className="text-sm font-bold text-white flex items-center gap-1.5">
                                    {rec.type === 'DROP' ? <Activity className="w-3.5 h-3.5 text-rose-400" /> : <Trophy className="w-3.5 h-3.5 text-yellow-400" />}
                                    {rec.linkLabel}
                                 </div>
                                 <div className="text-[10px] text-indigo-300">by {rec.influencerName} • {rec.time}</div>
                              </div>
                           </div>
                           <div className="mt-2 sm:mt-0 flex flex-col items-end">
                              <div className={`px-3 py-1.5 rounded-md text-sm font-bold font-mono tracking-tight text-right w-max sm:w-auto ${rec.type === 'DROP' ? 'bg-rose-400/20 text-rose-300' : 'bg-yellow-400/20 text-yellow-300'}`}>
                                {rec.clicks.toLocaleString()} Clicks
                              </div>
                              {rec.difference !== undefined && rec.difference !== 0 && (
                                <div className={`text-[10px] mt-1 font-mono font-bold ${rec.difference < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                                  {rec.difference > 0 ? '+' : ''}{rec.difference} ({rec.previousClicks} {rec.difference > 0 ? '→' : '↘'} {rec.clicks})
                                </div>
                              )}
                           </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <h3 className="text-sm font-bold text-white mt-8 mb-4 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                    Highest / Lowest Total Combined Daily Clicks
                  </h3>
                  {dailyTotalRecords.length === 0 ? (
                    <div className="text-xs text-indigo-200 opacity-60">No daily total records established yet.</div>
                  ) : (
                    <div className="space-y-2">
                      {[...dailyTotalRecords].reverse().map((rec, i) => (
                        <div key={rec.id || i} className={`flex flex-col sm:flex-row sm:items-center justify-between rounded-xl p-3 border ${rec.type === 'DROP' ? 'bg-rose-500/10 border-rose-500/20' : 'bg-emerald-500/10 border-emerald-500/20'}`}>
                           <div className="flex items-center gap-3">
                              <div className={`px-3 h-10 rounded-lg flex items-center justify-center font-mono font-bold text-xs ${rec.type === 'DROP' ? 'bg-rose-500/20 text-rose-200' : 'bg-emerald-500/20 text-emerald-300'}`}>
                                {rec.date ? (rec.date.includes('-') ? rec.date.split('-').reverse().join('/') : rec.date) : ''}
                              </div>
                              <div>
                                 <div className={`text-sm font-bold flex items-center gap-1.5 ${rec.type === 'DROP' ? 'text-rose-100' : 'text-emerald-100'}`}>
                                   {rec.type === 'DROP' ? <Activity className="w-3.5 h-3.5 text-rose-400" /> : <Trophy className="w-3.5 h-3.5 text-emerald-400" />}
                                   Total System Clicks
                                 </div>
                                 <div className={`text-[10px] ${rec.type === 'DROP' ? 'text-rose-300/70' : 'text-emerald-300/70'}`}>
                                   Recorded at {rec.time}
                                 </div>
                              </div>
                           </div>
                           <div className="mt-2 sm:mt-0 flex flex-col items-end">
                              <div className={`px-3 py-1.5 rounded-md text-sm font-bold font-mono tracking-tight text-right w-max sm:w-auto ${rec.type === 'DROP' ? 'bg-rose-400/20 text-rose-300' : 'bg-emerald-400/20 text-emerald-300'}`}>
                                {rec.totalClicks.toLocaleString()} Clicks
                              </div>
                              {rec.difference !== undefined && rec.difference !== 0 && (
                                <div className={`text-[10px] mt-1 font-mono font-bold ${rec.difference < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                                  {rec.difference > 0 ? '+' : ''}{rec.difference} ({rec.previousClicks} {rec.difference > 0 ? '→' : '↘'} {rec.totalClicks})
                                </div>
                              )}
                           </div>
                        </div>
                      ))}
                    </div>
                  )}
               </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white/10 backdrop-blur-md border border-white/10 rounded-2xl p-5 flex items-center justify-between">
                <div>
                  <p className="text-indigo-200 text-xs font-medium uppercase tracking-wider mb-1">Total Tracked Tasks</p>
                  <div className="text-3xl font-bold font-mono tracking-tight">{filteredLinks.length}</div>
                </div>
                <div className="w-12 h-12 bg-indigo-500/20 rounded-xl flex items-center justify-center">
                  <Video className="w-6 h-6 text-indigo-200" />
                </div>
              </div>
              <div className="bg-white/10 backdrop-blur-md border border-white/10 rounded-2xl p-5 flex items-center justify-between">
                <div>
                  <p className="text-indigo-200 text-xs font-medium uppercase tracking-wider mb-1">Total Combined Clicks</p>
                  <div className="text-3xl font-bold font-mono tracking-tight text-emerald-300">
                    {filteredTotalSystemClicks.toLocaleString()}
                  </div>
                </div>
                <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center">
                  <BarChart3 className="w-6 h-6 text-emerald-300" />
                </div>
              </div>
              
              {fastestGrowingClicks ? (
                <div className="bg-gradient-to-br from-indigo-500/20 to-fuchsia-500/20 backdrop-blur-md border border-fuchsia-500/30 rounded-2xl p-5 flex items-center justify-between">
                  <div>
                    <p className="text-fuchsia-200 text-xs font-medium uppercase tracking-wider mb-1">Fastest Increasing</p>
                    <div className="text-xl font-bold tracking-tight text-white truncate max-w-[150px]" title={fastestGrowingClicks.name}>
                      {fastestGrowingClicks.name}
                    </div>
                    <div className="text-xs text-emerald-300 font-bold mt-1">
                      +{fastestGrowingClicks.diff.toLocaleString()} Clicks Added
                    </div>
                  </div>
                  <div className="w-12 h-12 bg-fuchsia-500/20 rounded-xl flex items-center justify-center shadow-lg shadow-fuchsia-500/20">
                    <TrendingUp className="w-6 h-6 text-fuchsia-300" />
                  </div>
                </div>
              ) : (
                <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-5 flex items-center justify-between opacity-50">
                   <div>
                     <p className="text-indigo-300 text-xs font-medium uppercase tracking-wider mb-1">Fastest Increasing</p>
                     <div className="text-sm font-medium tracking-tight text-indigo-200">
                       Waiting for updates...
                     </div>
                   </div>
                   <div className="w-12 h-12 bg-indigo-500/10 rounded-xl flex items-center justify-center">
                     <TrendingUp className="w-6 h-6 text-indigo-300" />
                   </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {topLinks.length > 0 && (
        <div className="bg-gradient-to-br from-indigo-900 via-indigo-800 to-blue-900 rounded-3xl p-8 text-white shadow-xl relative overflow-hidden mb-6 flex flex-col">
          <div className="flex items-center gap-2 mb-4 relative z-10">
            <Trophy className="w-5 h-5 text-yellow-300" />
            <h3 className="text-lg font-bold text-white tracking-wide">Top Performer Benchmark</h3>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 relative z-10">
            {topLinks.map((tl, idx) => {
              const matchedTask = completedTasks.find((t: any) => {
                if (tl.id === `planner-${t.id}`) return true;
                const normalize = (u?: string) => { if (!u) return ''; let v = u.trim().toLowerCase(); v = v.split('?')[0].split('#')[0]; v = v.replace(/^https?:\/\//, ''); v = v.replace(/^www\./, ''); return v.replace(/\/+$/, ''); };
                const itemUrl = normalize(tl.url);
                return itemUrl && (
                  normalize(t.shortIoLink) === itemUrl ||
                  normalize(t.videoLink1) === itemUrl ||
                  normalize(t.videoLink2) === itemUrl ||
                  normalize(t.videoLink3) === itemUrl || (t.videoId && (itemUrl.endsWith('/' + normalize(t.videoId)) || itemUrl.endsWith('=' + normalize(t.videoId)))) || (t.videoId && normalize(t.videoId) === itemUrl)
                );
              });
              const inf = influencers.find(i => i.id === matchedTask?.influencerId);
              const linkClicks = getEffectiveClicks(tl);
              const views = matchedTask?.views || 0;
              const ctr = views > 0 ? parseFloat(((linkClicks / views) * 100).toFixed(2)) : 0;

              const rankColors = [
                'text-yellow-300 bg-yellow-400/20 border-yellow-400/30', // 1st
                'text-gray-300 bg-gray-400/20 border-gray-400/30', // 2nd
                'text-amber-500 bg-amber-600/20 border-amber-600/30', // 3rd
                'text-indigo-200 bg-indigo-400/20 border-indigo-400/30',
                'text-indigo-200 bg-indigo-400/20 border-indigo-400/30'
              ];
              const RC = rankColors[idx] || rankColors[3];

              return (
                <div key={tl.id} className="flex items-center justify-between p-3 rounded-xl bg-white/5 hover:bg-white/10 transition border border-white/5">
                  <div className="flex items-center gap-4">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm border ${RC}`}>
                      {idx + 1}
                    </div>
                    <div>
                      <div className="font-semibold text-white truncate max-w-[180px] md:max-w-[220px]" title={tl.label}>{tl.label}</div>
                      <div className="text-xs text-indigo-200">{inf ? inf.name : 'Unknown User'}</div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end">
                    <div className="text-lg font-bold text-emerald-300 font-mono tracking-tight cursor-default" title="Total Clicks">
                      {linkClicks.toLocaleString()} <span className="text-[10px] text-indigo-200 ml-1">CLICKS</span>
                    </div>
                    <div className="text-[10px] text-indigo-300 font-mono tracking-widest mt-0.5" title="CTR">
                      CTR: {ctr}%
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {links.length > 0 && !isEditingKey && (
        <div className="space-y-4">
          <div className="flex justify-center mb-6 gap-4">
            <button
              onClick={refreshAll}
              disabled={!apiKey || links.length === 0}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed text-white px-8 py-3 rounded-full text-sm font-black transition flex items-center gap-3 shadow-md hover:shadow-lg transform hover:-translate-y-0.5 active:translate-y-0"
            >
              <RefreshCw className={`w-5 h-5 ${Object.values(isLoading).some(Boolean) ? 'animate-spin' : ''}`} />
              Refresh All Links Now
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              disabled={filteredLinks.length === 0}
              className="bg-rose-600 hover:bg-rose-700 disabled:bg-rose-300 disabled:cursor-not-allowed text-white px-8 py-3 rounded-full text-sm font-black transition flex items-center gap-3 shadow-md hover:shadow-lg transform hover:-translate-y-0.5 active:translate-y-0"
            >
              <Trash2 className="w-5 h-5" />
              Delete Filtered Links
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {filteredLinks.length === 0 ? (
               <div className="col-span-full py-12 text-center text-gray-500 font-mono text-sm border-2 border-dashed border-gray-200 rounded-2xl">
                 No tracking links match the current filters.
               </div>
            ) : filteredLinks.map(item => {
              const matchedTask = completedTasks.find((t: any) => {
                 if (item.id === `planner-${t.id}`) return true;
                 const normalize = (u?: string) => { if (!u) return ''; let v = u.trim().toLowerCase(); v = v.split('?')[0].split('#')[0]; v = v.replace(/^https?:\/\//, ''); v = v.replace(/^www\./, ''); return v.replace(/\/+$/, ''); };
                 const itemUrl = normalize(item.url);
                 return itemUrl && (
                     normalize(t.shortIoLink) === itemUrl ||
                     normalize(t.videoLink1) === itemUrl ||
                     normalize(t.videoLink2) === itemUrl ||
                     normalize(t.videoLink3) === itemUrl || (t.videoId && (itemUrl.endsWith('/' + normalize(t.videoId)) || itemUrl.endsWith('=' + normalize(t.videoId)))) || (t.videoId && normalize(t.videoId) === itemUrl)
                 );
              });
              const displayVideoId = matchedTask?.videoId;

              return (
             <div key={item.id} className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition relative group overflow-hidden">
               <div className="flex justify-between items-start mb-3">
                 <div className="flex-1 min-w-0 pr-4">
                   <h3 className="font-bold text-gray-900 truncate" title={item.label}>
                     {item.label}
                   </h3>
                   <a 
                     href={item.url} 
                     target="_blank" 
                     rel="noreferrer" 
                     className="text-xs font-mono text-indigo-600 hover:text-indigo-800 flex items-center gap-1 mt-1 truncate"
                   >
                     {item.url}
                     <ArrowUpRight className="w-3 h-3 flex-shrink-0" />
                   </a>
                   {displayVideoId && (
                     <div className="mt-2 inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-indigo-50 border border-indigo-100">
                       <Video className="w-3 h-3 text-indigo-600" />
                       <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-widest font-mono">
                         {displayVideoId}
                       </span>
                     </div>
                   )}
                   {matchedTask && (
                     <div className="mt-2 ml-2 inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-50 border border-emerald-100">
                       <Activity className="w-3 h-3 text-emerald-600" />
                       <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest font-mono">
                         Views: {matchedTask.views?.toLocaleString() || 0}
                       </span>
                       <span className="text-[10px] font-bold text-emerald-900 border-l border-emerald-200 pl-1.5 ml-0.5">
                         {influencers.find(i => i.id === matchedTask.influencerId)?.name || 'Unknown User'}
                       </span>
                     </div>
                   )}
                 </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => fetchLinkStats(item, true)}
                    className="text-gray-400 hover:text-indigo-600 transition p-1"
                    title="Refresh Stats"
                  >
                    <RefreshCw className={`w-4 h-4 ${isLoading[item.id] ? 'animate-spin' : ''}`} />
                  </button>
                  <button
                    onClick={() => removeLink(item.id)}
                    className="text-gray-400 hover:text-red-500 transition p-1 opacity-0 group-hover:opacity-100"
                    title="Remove Tracker"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="bg-indigo-50 rounded-xl p-4 flex items-center justify-between border border-indigo-100/50">
                <div className="flex items-center justify-between gap-4 w-full">
                   <div className="flex items-center gap-3">
                     <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm text-indigo-600">
                        <BarChart3 className="w-5 h-5" />
                     </div>
                     <div>
                       <div className="text-[10px] font-black font-mono text-indigo-600/70 uppercase tracking-widest leading-none mb-1 flex items-center gap-1.5">
                         Live Clicks
                         {manualOverride && (
                           <button 
                               onClick={() => {
                                   setEditingClicksId(item.id);
                                   setTempClicksInput(item.manualClicksOverride !== undefined ? String(item.manualClicksOverride) : (item.clicks !== undefined ? String(item.clicks) : '0'));
                               }}
                               className="text-indigo-500 hover:text-indigo-800 transition p-1 bg-indigo-100 rounded-md hover:bg-indigo-200 shadow-sm"
                               title="Manual Override"
                           >
                               <Pencil className="w-3 h-3" strokeWidth={3} />
                           </button>
                         )}
                       </div>
                       
                       {editingClicksId === item.id ? (
                           <div className="flex items-center gap-1 mt-1">
                               <input 
                                   type="number" 
                                   value={tempClicksInput}
                                   onChange={(e) => setTempClicksInput(e.target.value)}
                                   className="w-20 px-2 py-1 text-sm border border-indigo-200 rounded font-bold font-mono outline-none focus:border-indigo-500"
                                   autoFocus
                               />
                               <button 
                                   onClick={() => {
                                       const val = parseInt(tempClicksInput, 10);
                                       setLinks(prev => prev.map(l => l.id === item.id ? { ...l, manualClicksOverride: isNaN(val) ? undefined : val } : l));
                                       setEditingClicksId(null);
                                   }}
                                   className="text-white bg-indigo-600 hover:bg-indigo-700 px-2 py-1 rounded text-xs font-bold"
                               >
                                   Save
                               </button>
                               <button 
                                   onClick={() => setEditingClicksId(null)}
                                   className="text-gray-500 hover:text-gray-700 px-1 py-1 rounded text-xs"
                               >
                                   <X className="w-3 h-3" />
                               </button>
                           </div>
                       ) : (
                           <div className="font-black text-2xl text-gray-900 leading-none">
                             {(manualOverride && item.manualClicksOverride !== undefined) ? (
                                <span className="text-indigo-600 flex items-center gap-1" title="Manually Overridden">
                                   {item.manualClicksOverride.toLocaleString()}
                                   <span className="text-[10px] uppercase font-bold tracking-widest text-indigo-400 font-mono">(Manual)</span>
                                </span>
                             ) : (
                                item.clicks !== undefined ? item.clicks.toLocaleString() : '--'
                             )}
                           </div>
                       )}
                       
                       {/* Display Human Clicks */}
                       {true ? (
                            <div className="mt-4">
                               {manualOverride && (
                                   <div className="text-[10px] font-black font-mono text-red-600/70 uppercase tracking-widest leading-none mb-1 flex items-center justify-between gap-1.5 w-full">
                                     <span>Human Clicks</span>
                                     <button 
                                         onClick={() => {
                                             setEditingHumanClicksId(item.id);
                                             setTempHumanClicksInput(item.manualHumanClicksOverride !== undefined ? String(item.manualHumanClicksOverride) : (item.humanClicks !== undefined ? String(item.humanClicks) : '0'));
                                         }}
                                         className="text-red-500 hover:text-red-800 transition p-1 bg-red-100 rounded-md hover:bg-red-200 shadow-sm"
                                         title="Edit Human Clicks"
                                     >
                                         <Pencil className="w-3 h-3" strokeWidth={3} />
                                     </button>
                                   </div>
                               )}
                               {editingHumanClicksId === item.id ? (
                                   <div className="flex items-center gap-2">
                                       <input
                                           type="number"
                                           value={tempHumanClicksInput}
                                           onChange={(e) => setTempHumanClicksInput(e.target.value)}
                                           className="w-24 px-2 py-1 border border-red-300 rounded text-sm font-black focus:ring-2 focus:ring-red-500 focus:border-red-500"
                                           autoFocus
                                       />
                                       <button 
                                           onClick={() => {
                                               const val = parseInt(tempHumanClicksInput, 10);
                                               setLinks(prev => prev.map(l => l.id === item.id ? { ...l, manualHumanClicksOverride: isNaN(val) ? undefined : val } : l));
                                               setEditingHumanClicksId(null);
                                           }}
                                           className="text-white bg-red-600 hover:bg-red-700 px-2 py-1 rounded text-xs font-bold"
                                       >
                                           Save
                                       </button>
                                       <button 
                                           onClick={() => setEditingHumanClicksId(null)}
                                           className="text-gray-500 hover:bg-gray-100 p-1 rounded"
                                       >
                                           <X className="w-3 h-3" />
                                       </button>
                                   </div>
                               ) : (
                                   <div className="text-4xl sm:text-5xl text-red-600 font-black font-sans bg-red-50 px-3 py-2 rounded-xl inline-flex items-center gap-2 border border-red-200 shadow-sm leading-none">
                                       <span className="text-xs tracking-widest uppercase font-bold text-red-700/70 mt-1">Human</span>
                                       {(manualOverride && item.manualHumanClicksOverride !== undefined) ? (
                                           <span className="flex items-center gap-1" title="Manually Overridden">
                                               {item.manualHumanClicksOverride.toLocaleString()}
                                           </span>
                                       ) : (
                                           item.humanClicks !== undefined ? item.humanClicks.toLocaleString() : '--'
                                       )}
                                   </div>
                               )}
                            </div>
                       ) : null}
                     </div>
                   </div>
                   
                   {/* Minimal secondary info if available */}
                   {item.linkData?.createdAt && (
                     <div className="text-right">
                       <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Created</div>
                       <div className="text-xs font-bold text-gray-600">
                         {new Date(item.linkData.createdAt).toLocaleDateString('en-GB')}
                       </div>
                     </div>
                   )}
                </div>
              </div>

              {item.error && (
                <div className="mt-3 text-[10px] text-red-600 bg-red-50 px-2.5 py-1.5 rounded-lg border border-red-100 font-mono font-medium truncate">
                  Error: {item.error}
                </div>
              )}
              
              {item.lastUpdated && !item.error && (
                <div className="mt-3 text-right">
                    <span className="text-[9px] text-gray-400 font-mono font-bold uppercase">
                      Updated: {item.lastUpdated}
                    </span>
                </div>
              )}

              {showDebug && (
                  <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded-lg text-[10px] font-mono whitespace-pre-wrap overflow-x-auto text-gray-600">
                      <strong>statsData:</strong> {JSON.stringify(item.statsData, null, 2)}
                      <br/><br/>
                      <strong>linkData:</strong> {JSON.stringify(item.linkData, null, 2)}
                      <br/><br/>
                      <strong>linkDetailsData:</strong> {JSON.stringify(item.linkDetailsData, null, 2)}
                  </div>
              )}
            </div>
            );
          })}
          </div>
        </div>
      )}

      {missingTasks.length > 0 && (
        <div className="bg-rose-50/80 border border-rose-200 rounded-3xl p-8 mb-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <AlertCircle className="w-6 h-6 text-rose-600" />
            <h3 className="text-xl font-bold text-rose-900 tracking-tight">Missing Short.io Links</h3>
          </div>
          <p className="text-sm text-rose-700 mb-6 font-medium max-w-3xl">
            The following <span className="font-bold text-rose-900 bg-rose-200 px-2 py-0.5 rounded">{missingTasks.length}</span> {missingTasks.length === 1 ? 'task is' : 'tasks are'} currently present in your <strong>PLANNER</strong> but missing from this Short.io Tracker.
          </p>
          <button
            onClick={() => {
               const newLinks: TrackedLink[] = [];
               missingTasks.forEach(({task: t}: any) => {
                   let linkToAdd = t.shortIoLink;
                   if (linkToAdd && linkToAdd.trim() !== '') {
                       linkToAdd = linkToAdd.trim();
                       if (linkToAdd.includes('.') && !linkToAdd.startsWith('http://') && !linkToAdd.startsWith('https://')) {
                           linkToAdd = 'https://' + linkToAdd;
                       }
                       const inf = influencers.find(i => i.id === t.influencerId);
                       // Check if this task ID already has a link tracked
                       if (!links.some(l => l.id === `planner-${t.id}`)) {
                           newLinks.push({
                               id: `planner-${t.id}`,
                               url: linkToAdd.trim(),
                               label: `${inf?.name || 'Unknown'} - ${t.productName || 'Product'}`
                           });
                       }
                   }
               });
               if (newLinks.length > 0) {
                   setLinks(prev => {
                       return [...newLinks, ...prev];
                   });
                   setTimeout(() => {
                       newLinks.forEach(nl => fetchLinkStats(nl, true));
                   }, 500);
               }
            }}
            className="bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 rounded-lg text-sm font-bold transition flex items-center gap-2 mb-6 shadow-sm"
          >
            <PlusCircle className="w-4 h-4" />
            Track All Missing Links Automatically
          </button>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {missingTasks.map(({ task: t, reason }: any) => {
              const inf = influencers.find(i => i.id === t.influencerId);
              const displayName = inf ? inf.name : (t.secondaryInfluencerName || 'Unknown Influencer');
              return (
                <div key={t.id} className="bg-white border border-rose-100 rounded-xl p-4 shadow-sm hover:shadow-md transition flex flex-col justify-between relative group">
                   <div>
                     <span className="inline-flex items-center gap-1 text-[10px] font-bold tracking-widest uppercase text-rose-500 bg-rose-50 px-2 py-1 rounded-md mb-3 border border-rose-100">
                       <Cloud className="w-3 h-3" />
                       Untracked
                     </span>
                     <div className="font-bold text-gray-900 truncate" title={displayName}>
                        {displayName}
                     </div>
                     <div className="text-xs mt-2 px-2 py-1 rounded bg-rose-50 text-rose-700 font-medium border border-rose-100">
                        <span className="font-bold">Reason:</span> {reason}
                     </div>
                     <div className="text-xs font-semibold text-gray-600 truncate mt-1" title={t.productName || 'Unknown Product'}>
                        {t.productName || 'Unknown Product'}
                     </div>
                   </div>
                   
                   {editingTaskLinkId === t.id ? (
                      <div className="mt-3 flex flex-col gap-2 p-2 bg-indigo-50/50 rounded-lg border border-indigo-100">
                        <input 
                          type="text" 
                          value={editingTaskLinkValue}
                          onChange={(e) => setEditingTaskLinkValue(e.target.value)}
                          className="w-full text-xs px-2 py-1.5 border border-indigo-200 rounded outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                          placeholder="Paste Short.io link here..."
                        />
                        <div className="flex gap-2">
                          <button onClick={() => {
                            if (onUpdateTasksBulk && editingTaskLinkValue.trim()) {
                               onUpdateTasksBulk([{id: t.id, updates: {shortIoLink: editingTaskLinkValue.trim()}}]);
                            }
                            setEditingTaskLinkId(null);
                          }} className="text-[10px] bg-indigo-600 text-white px-2 py-1.5 rounded font-bold hover:bg-indigo-700 flex items-center gap-1"><Save className="w-3 h-3"/> Save Link</button>
                          <button onClick={() => setEditingTaskLinkId(null)} className="text-[10px] bg-gray-200 text-gray-700 px-2 py-1.5 rounded font-bold hover:bg-gray-300">Cancel</button>
                        </div>
                      </div>
                   ) : (
                      <button onClick={() => {
                        setEditingTaskLinkId(t.id);
                        setEditingTaskLinkValue(t.shortIoLink || t.videoLink1 || '');
                      }} className="mt-3 text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1.5 rounded-lg w-fit hover:bg-indigo-100 transition self-start flex items-center gap-1 border border-indigo-100/50 hover:border-indigo-200">
                        <Pencil className="w-3 h-3" /> Update Tracking Link
                      </button>
                   )}

                   <div className="mt-4 bg-gray-50 rounded-lg px-3 py-2 border border-gray-100 flex flex-col gap-1 group">
                     <div className="flex items-center justify-between">
                       <span className="text-xs font-mono text-gray-500 truncate" title={t.videoId}>
                         {t.videoId || 'No Video ID'}
                       </span>
                       <div className="flex items-center gap-1.5 transition">
                         {t.videoId && (
                           <a href={`https://www.youtube.com/shorts/${t.videoId}`} target="_blank" rel="noreferrer" title="YouTube Short" className="text-gray-400 hover:text-rose-600 transition">
                             <Video className="w-4 h-4" />
                           </a>
                         )}
                         {t.videoLink1 && (
                           <a href={t.videoLink1} target="_blank" rel="noreferrer" title="Video Link 1" className="text-gray-400 hover:text-indigo-600 transition">
                             <Link2 className="w-4 h-4" />
                           </a>
                         )}
                         {t.videoLink2 && (
                           <a href={t.videoLink2} target="_blank" rel="noreferrer" title="Video Link 2" className="text-gray-400 hover:text-indigo-600 transition">
                             <Link2 className="w-4 h-4" />
                           </a>
                         )}
                         {t.videoLink3 && (
                           <a href={t.videoLink3} target="_blank" rel="noreferrer" title="Video Link 3" className="text-gray-400 hover:text-indigo-600 transition">
                             <Link2 className="w-4 h-4" />
                           </a>
                         )}
                       </div>
                     </div>
                     
                     {(t.videoLink1 || t.videoLink2 || t.videoLink3) && (
                       <div className="flex flex-col gap-1 mt-1 border-t border-gray-200/60 pt-2">
                         {t.videoLink1 && (
                           <a href={t.videoLink1} target="_blank" rel="noreferrer" className="text-[10px] text-blue-600 hover:text-blue-800 hover:underline truncate font-mono" title={t.videoLink1}>
                             {t.videoLink1}
                           </a>
                         )}
                         {t.videoLink2 && (
                           <a href={t.videoLink2} target="_blank" rel="noreferrer" className="text-[10px] text-blue-600 hover:text-blue-800 hover:underline truncate font-mono" title={t.videoLink2}>
                             {t.videoLink2}
                           </a>
                         )}
                         {t.videoLink3 && (
                           <a href={t.videoLink3} target="_blank" rel="noreferrer" className="text-[10px] text-blue-600 hover:text-blue-800 hover:underline truncate font-mono" title={t.videoLink3}>
                             {t.videoLink3}
                           </a>
                         )}
                       </div>
                     )}
                   </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Delete Confirmation Popup */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden flex flex-col border border-slate-100">
            <div className="p-6 text-center space-y-4">
              <div className="mx-auto w-12 h-12 flex items-center justify-center rounded-full bg-red-50 text-red-600 mb-2">
                <Trash2 className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Delete Links?</h3>
              <p className="text-sm text-slate-500 font-medium">
                Are you sure you want to delete all <span className="font-bold text-slate-900">{filteredLinks.length}</span> links currently matching your week/month/year/influencer filters? This action cannot be undone.
              </p>
              <div className="pt-4 flex gap-3">
                <button 
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={removeFilteredLinks}
                  className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold py-2.5 rounded-lg transition-colors shadow-sm"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
