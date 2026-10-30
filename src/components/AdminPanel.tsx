import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  Users, ShieldCheck, Activity, AlertOctagon, UserPlus, Slash, ShieldAlert, 
  Trash2, Search, Volume2, Shield, Calendar, RefreshCw, Layers, CheckCircle2, 
  X, Info, Laptop, HelpCircle, Download, FileSpreadsheet, FileDown, Database
} from 'lucide-react';
import { db, saveDoc } from '../lib/firestoreService';
import { safeLocalStorage } from '../lib/safeLocalStorage';
import { collection, onSnapshot, doc, setDoc, updateDoc, deleteDoc, query, orderBy, limit, where, getDocs } from 'firebase/firestore';
import { RegisteredUser, UserActivityLog, GlobalSettings } from '../types';

interface AdminPanelProps {
  currentAdminEmail: string;
}

export default function AdminPanel({ currentAdminEmail }: AdminPanelProps) {
  const [activeSubTab, setActiveSubTab] = useState<'users' | 'activity' | 'announcements'>('users');
  
  // Real-time Collections Data
  const [usersList, setUsersList] = useState<RegisteredUser[]>([]);
  const [activityLogs, setActivityLogs] = useState<UserActivityLog[]>([]);
  const [announcementSettings, setAnnouncementSettings] = useState<GlobalSettings | null>(null);

  // Loading indicator states
  const [isUsersLoading, setIsUsersLoading] = useState<boolean>(true);
  const [isLogsLoading, setIsLogsLoading] = useState<boolean>(true);

  // Search & Filter state variables
  const [userQuery, setUserQuery] = useState<string>('');
  const [logQuery, setLogQuery] = useState<string>('');
  const [logFilterAction, setLogFilterAction] = useState<string>('All');

  // Interactive Form Inputs
  const [newEmail, setNewEmail] = useState<string>('');
  const [newDisplayName, setNewDisplayName] = useState<string>('');
  const [newRole, setNewRole] = useState<'Admin' | 'User'>('User');
  const [newStatus, setNewStatus] = useState<'Active' | 'Restricted' | 'Blocked' | 'Pending'>('Active');
  const [isAddingUser, setIsAddingUser] = useState<boolean>(false);

  // Announcement Form State
  const [bannerText, setBannerText] = useState<string>('');
  const [bannerActive, setBannerActive] = useState<boolean>(false);
  const [hiddenPages, setHiddenPages] = useState<string[]>([]);
  const [adminHiddenPages, setAdminHiddenPages] = useState<string[]>([]);
  const [isSettingAnnounce, setIsSettingAnnounce] = useState<boolean>(false);

  // Custom block modal setup
  const [userToBlock, setUserToBlock] = useState<RegisteredUser | null>(null);
  const [customBannedMessage, setCustomBannedMessage] = useState<string>('');

  // Export Control states
  const [exportingUser, setExportingUser] = useState<RegisteredUser | null>(null);
  const [isExportLoading, setIsExportLoading] = useState<boolean>(false);
  const [exportedData, setExportedData] = useState<Record<string, any[]> | null>(null);

  // Trigger real-time compilation fetch of selected user entries from all tables 
  useEffect(() => {
    if (!exportingUser) {
      setExportedData(null);
      return;
    }
    
    const loadUserData = async () => {
      setIsExportLoading(true);
      try {
        const uidToUse = exportingUser.uid || exportingUser.id;
        const colList = [
          'influencers',
          'campaigns',
          'tasks',
          'messages',
          'contracts',
          'billingEntries',
          'monthlyTargets',
          'aovEntries'
        ];
        
        const results: Record<string, any[]> = {};
        
        for (const col of colList) {
          try {
            const q = query(collection(db, col), where('ownerId', '==', uidToUse));
            const snap = await getDocs(q);
            const items: any[] = [];
            snap.forEach(d => {
              items.push({ id: d.id, ...d.data() });
            });
            results[col] = items;
          } catch (e2) {
            console.error(`Admin portfolio fetch error on collection ${col}:`, e2);
            results[col] = [];
          }
        }
        
        setExportedData(results);
      } catch (err: any) {
        alert(`Error compiling registry fetch: ${err?.message || err}`);
      } finally {
        setIsExportLoading(false);
      }
    };
    
    loadUserData();
  }, [exportingUser]);

  // Safe escape and quote converter for CSV records
  const convertToCSV = (headers: string[], rows: any[][]): string => {
    const escapeField = (val: any) => {
      if (val === null || val === undefined) return '';
      let strValue = String(val);
      // Clean up inline newlines and escape literal quotes
      strValue = strValue.replace(/"/g, '""');
      if (/[",\n\r]/.test(strValue)) {
        return `"${strValue}"`;
      }
      return strValue;
    };

    const csvLines = [headers.map(escapeField).join(',')];
    for (const row of rows) {
      csvLines.push(row.map(escapeField).join(','));
    }
    return csvLines.join('\r\n');
  };

  const triggerCSVDownload = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadJSON = () => {
    if (!exportedData || !exportingUser) return;
    
    // Exact structural app-compatible JSON backup matches App.tsx handleRestoreData structure
    const payload = {
      influencers: exportedData.influencers || [],
      campaigns: exportedData.campaigns || [],
      tasks: exportedData.tasks || [],
      messages: exportedData.messages || [],
      contracts: exportedData.contracts || [],
      billingEntries: exportedData.billingEntries || [],
      monthlyTargets: exportedData.monthlyTargets || [],
      aovEntries: exportedData.aovEntries || [],
      backupGeneratedAt: new Date().toISOString(),
      backupGeneratedBy: currentAdminEmail,
      ownerEmail: exportingUser.email
    };
    
    const dataStr = JSON.stringify(payload, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `app-backup-${exportingUser.email}-${new Date().toLocaleString('en-GB').replace(/[\/:]/g, '-').replace(', ', '_')}.json`;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadEntityCSV = (colName: string) => {
    if (!exportedData || !exportingUser) return;
    const list = exportedData[colName] || [];
    let csvContent = '';
    
    if (colName === 'influencers') {
      const headers = ['ID', 'Name', 'Handle', 'Niche', 'Followers', 'Engagement Rate %', 'Location', 'Cost Per Post ($)', 'ROI Multiplier', 'Rating', 'Status'];
      const rows = list.map(item => [
        item.id || '',
        item.name || '',
        item.handle || '',
        item.niche || '',
        item.followers || 0,
        item.engagementRate || 0,
        item.location || '',
        item.costPerPost || 0,
        item.averageROI || 0,
        item.rating || 0,
        item.status || ''
      ]);
      csvContent = convertToCSV(headers, rows);
    } else if (colName === 'campaigns') {
      const headers = ['ID', 'Name', 'Description', 'Niche', 'Budget ($)', 'Spent ($)', 'Status', 'Start Date', 'End Date'];
      const rows = list.map(item => [
        item.id || '',
        item.name || '',
        item.description || '',
        item.niche || '',
        item.budget || 0,
        item.spent || 0,
        item.status || '',
        item.startDate || '',
        item.endDate || ''
      ]);
      csvContent = convertToCSV(headers, rows);
    } else if (colName === 'tasks') {
      const headers = ['ID', 'Campaign ID', 'Influencer ID', 'Title', 'Type', 'Deadline', 'Status', 'Remuneration ($)', 'Platform', 'Views', 'Clicks', 'CTR %'];
      const rows = list.map(item => [
        item.id || '',
        item.campaignId || '',
        item.influencerId || '',
        item.title || '',
        item.type || '',
        item.deadline || '',
        item.status || '',
        item.remuneration || 0,
        item.platform || '',
        item.views || 0,
        item.clicks || 0,
        item.ctr || 0
      ]);
      csvContent = convertToCSV(headers, rows);
    } else if (colName === 'billingEntries') {
      const headers = ['ID', 'Campaign ID', 'Campaign Name', 'Influencer ID', 'Influencer Name', 'Type', 'Amount ($)', 'Status', 'Date', 'Invoice Number'];
      const rows = list.map(item => [
        item.id || '',
        item.campaignId || '',
        item.campaignName || '',
        item.influencerId || '',
        item.influencerName || '',
        item.type || '',
        item.amount || 0,
        item.status || '',
        item.date || '',
        item.invoiceNumber || ''
      ]);
      csvContent = convertToCSV(headers, rows);
    } else if (colName === 'aovEntries') {
      const headers = ['ID', 'Month', 'Year', 'Product Name', 'Revenue ($)', 'Orders', 'Calculated AOV ($)', 'Target AOV ($)', 'Notes'];
      const rows = list.map(item => [
        item.id || '',
        item.month || '',
        item.year || '',
        item.productName || '',
        item.revenue || 0,
        item.orders || 0,
        item.calculatedAov || 0,
        item.targetAov || 0,
        item.notes || ''
      ]);
      csvContent = convertToCSV(headers, rows);
    } else if (colName === 'monthlyTargets') {
      const headers = ['ID', 'Product Name', 'Target Amount ($)', 'Month', 'Year', 'Video Target', 'Sales Amount ($)'];
      const rows = list.map(item => [
        item.id || '',
        item.productName || '',
        item.target || 0,
        item.month || '',
        item.year || '',
        item.videoTarget || 0,
        item.salesAmount || 0
      ]);
      csvContent = convertToCSV(headers, rows);
    } else {
      if (list.length === 0) {
        csvContent = 'No data available';
      } else {
        const headers = Object.keys(list[0]).filter(k => k !== 'ownerId');
        const rows = list.map(item => headers.map(h => item[h]));
        csvContent = convertToCSV(headers, rows);
      }
    }
    
    triggerCSVDownload(csvContent, `export-${colName}-${exportingUser.email}-${new Date().toISOString().split('T')[0]}.csv`);
  };

  const handleDownloadCombinedCSV = () => {
    if (!exportedData || !exportingUser) return;
    
    let combined = '';
    
    const addSection = (title: string, headers: string[], colKey: string, rowMapper: (item: any) => any[]) => {
      combined += `=== ${title.toUpperCase()} DATABASE ===\r\n`;
      const list = exportedData[colKey] || [];
      if (list.length === 0) {
        combined += 'No records found for this user\r\n';
      } else {
        const rows = list.map(rowMapper);
        combined += convertToCSV(headers, rows);
      }
      combined += '\r\n\r\n';
    };
    
    combined += `=== USER REGISTRATION PROFILE OVERVIEW ===\r\n`;
    combined += convertToCSV(
      ['ID', 'Email', 'Display Name', 'Role', 'Status', 'Created At', 'Last Login At'],
      [[
        exportingUser.id,
        exportingUser.email,
        exportingUser.displayName,
        exportingUser.role,
        exportingUser.status,
        exportingUser.createdAt,
        exportingUser.lastLoginAt
      ]]
    );
    combined += '\r\n\r\n';

    addSection(
      'Influencer Directory',
      ['ID', 'Name', 'Handle', 'Niche', 'Followers', 'Engagement Rate %', 'Location', 'Cost Per Post ($)', 'ROI Multiplier', 'Rating', 'Status'],
      'influencers',
      item => [
        item.id || '',
        item.name || '',
        item.handle || '',
        item.niche || '',
        item.followers || 0,
        item.engagementRate || 0,
        item.location || '',
        item.costPerPost || 0,
        item.averageROI || 0,
        item.rating || 0,
        item.status || ''
      ]
    );

    addSection(
      'Sponsorship Campaigns',
      ['ID', 'Name', 'Description', 'Niche', 'Budget ($)', 'Spent ($)', 'Status', 'Start Date', 'End Date'],
      'campaigns',
      item => [
        item.id || '',
        item.name || '',
        item.description || '',
        item.niche || '',
        item.budget || 0,
        item.spent || 0,
        item.status || '',
        item.startDate || '',
        item.endDate || ''
      ]
    );

    addSection(
      'Deliverables & Schedule Tasks',
      ['ID', 'Campaign ID', 'Influencer ID', 'Title', 'Type', 'Deadline', 'Status', 'Remuneration ($)', 'Platform', 'Views', 'Clicks', 'CTR %'],
      'tasks',
      item => [
        item.id || '',
        item.campaignId || '',
        item.influencerId || '',
        item.title || '',
        item.type || '',
        item.deadline || '',
        item.status || '',
        item.remuneration || 0,
        item.platform || '',
        item.views || 0,
        item.clicks || 0,
        item.ctr || 0
      ]
    );

    addSection(
      'Financial Ledger Billing entries',
      ['ID', 'Campaign ID', 'Campaign Name', 'Influencer ID', 'Influencer Name', 'Type', 'Amount ($)', 'Status', 'Date', 'Invoice Number'],
      'billingEntries',
      item => [
        item.id || '',
        item.campaignId || '',
        item.campaignName || '',
        item.influencerId || '',
        item.influencerName || '',
        item.type || '',
        item.amount || 0,
        item.status || '',
        item.date || '',
        item.invoiceNumber || ''
      ]
    );

    addSection(
      'Product Monthly targets',
      ['ID', 'Product Name', 'Target Amount ($)', 'Month', 'Year', 'Video Target', 'Sales Amount ($)'],
      'monthlyTargets',
      item => [
        item.id || '',
        item.productName || '',
        item.target || 0,
        item.month || '',
        item.year || '',
        item.videoTarget || 0,
        item.salesAmount || 0
      ]
    );

    addSection(
      'AOV Analytical Calculator entries',
      ['ID', 'Month', 'Year', 'Product Name', 'Revenue ($)', 'Orders', 'Calculated AOV ($)', 'Target AOV ($)'],
      'aovEntries',
      item => [
        item.id || '',
        item.month || '',
        item.year || '',
        item.productName || '',
        item.revenue || 0,
        item.orders || 0,
        item.calculatedAov || 0,
        item.targetAov || 0
      ]
    );

    triggerCSVDownload(combined, `full-records-${exportingUser.email}-${new Date().toISOString().split('T')[0]}.csv`);
  };

  // 1. Subscribe to users collection list
  useEffect(() => {
    try {
      const cached = safeLocalStorage.getItem('ptg_registered_users_list');
      if (cached) {
        setUsersList(JSON.parse(cached));
        setIsUsersLoading(false);
      } else {
        // Provide the admin user as default
        setUsersList([{
          id: 'admin_primary',
          uid: 'admin_primary',
          email: currentAdminEmail || 'ashimgogoi2008@gmail.com',
          displayName: 'Ashim Gogoi',
          photoURL: '',
          status: 'Active',
          role: 'Admin',
          createdAt: new Date().toISOString(),
          lastLoginAt: new Date().toISOString()
        }]);
        setIsUsersLoading(false);
      }
    } catch (e) {
      setIsUsersLoading(false);
    }

    let unsubscribe = () => {};
    try {
      const q = collection(db, 'registered_users');
      unsubscribe = onSnapshot(q, (snapshot) => {
        const fetched: RegisteredUser[] = [];
        snapshot.forEach((doc) => {
          fetched.push(doc.data() as RegisteredUser);
        });
        fetched.sort((a, b) => {
          if (a.role === 'Admin' && b.role !== 'Admin') return -1;
          if (a.role !== 'Admin' && b.role === 'Admin') return 1;
          return a.email.localeCompare(b.email);
        });
        if (fetched.length > 0) {
          setUsersList(fetched);
        }
        setIsUsersLoading(false);
      }, (err) => {
        console.warn("Admin user list offline fallback active:", err?.message);
        setIsUsersLoading(false);
      });
    } catch (err) {
      setIsUsersLoading(false);
    }
    return () => unsubscribe();
  }, [currentAdminEmail]);

  // 2. Subscribe to user activity logs (last 200 items sorted descending)
  useEffect(() => {
    try {
      const cached = safeLocalStorage.getItem('ptg_user_activity_logs_list');
      if (cached) {
        setActivityLogs(JSON.parse(cached));
        setIsLogsLoading(false);
      } else {
        setIsLogsLoading(false);
      }
    } catch (e) {
      setIsLogsLoading(false);
    }

    let unsubscribe = () => {};
    try {
      const q = query(
        collection(db, 'user_activity_logs'),
        orderBy('timestamp', 'desc'),
        limit(200)
      );
      unsubscribe = onSnapshot(q, (snapshot) => {
        const fetched: UserActivityLog[] = [];
        snapshot.forEach((doc) => {
          fetched.push(doc.data() as UserActivityLog);
        });
        if (fetched.length > 0) {
          setActivityLogs(fetched);
        }
        setIsLogsLoading(false);
      }, (err) => {
        console.warn("Admin activity log offline fallback active:", err?.message);
        setIsLogsLoading(false);
      });
    } catch (err) {
      setIsLogsLoading(false);
    }
    return () => unsubscribe();
  }, []);

  // 3. Subscribe to global announcements settings configuration
  useEffect(() => {
    const ref = doc(db, 'global_settings', 'announcement');
    const unsubscribe = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        const data = snap.data() as GlobalSettings;
        setAnnouncementSettings(data);
        setBannerText(data.announcementBanner || '');
        setBannerActive(!!data.announcementActive);
        setHiddenPages(data.hiddenPages || []);
        setAdminHiddenPages(data.adminHiddenPages || []);
      } else {
        // Doc doesn't exist, seed local state defaults
        setBannerText('');
        setBannerActive(false);
        setHiddenPages([]);
        setAdminHiddenPages([]);
      }
    }, (err) => {
      console.error("Announcement load setting error:", err);
    });
    return () => unsubscribe();
  }, []);

  // Handlers for user management actions
  const handleAddNewUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      alert("Please specify a valid, correct email format.");
      return;
    }

    setIsAddingUser(true);
    const cleanEmail = newEmail.trim().toLowerCase();
    const mockUid = `PRE-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const now = new Date().toISOString();

    const newUserProfile: RegisteredUser = {
      id: mockUid,
      uid: '', // unauthenticated yet
      email: cleanEmail,
      displayName: newDisplayName.trim() || cleanEmail.split('@')[0],
      photoURL: '',
      role: newRole,
      status: newStatus,
      createdAt: now,
      lastLoginAt: '',
      bannedMessage: newStatus === 'Blocked' ? 'Admin blocked this pre-registered account.' : ''
    };

    try {
      await saveDoc('registered_users', mockUid, newUserProfile);
      setNewEmail('');
      setNewDisplayName('');
      setNewRole('User');
      setNewStatus('Active');
      alert(`User ${cleanEmail} of type ${newRole} has been pre-authorized successfully on the environment.`);
    } catch (err: any) {
      alert(`Could not save pre-authorized user: ${err?.message || err}`);
    } finally {
      setIsAddingUser(false);
    }
  };

  const handleUpdateStatus = async (userProfile: RegisteredUser, nextStatus: 'Active' | 'Restricted' | 'Blocked' | 'Pending', banMessage: string = '') => {
    if (userProfile.email === currentAdminEmail) {
      alert("Operations Error: You cannot modify or restrict your own administrative profile!");
      return;
    }

    try {
      const ref = doc(db, 'registered_users', userProfile.id);
      await updateDoc(ref, { 
        status: nextStatus,
        bannedMessage: banMessage || (nextStatus === 'Blocked' ? 'Your access has been blocked. Please contact Ashim Gogoi.' : '')
      });
      setUserToBlock(null);
      setCustomBannedMessage('');
    } catch (err: any) {
      alert(`Status update error: ${err?.message || err}`);
    }
  };

  const handleToggleRole = async (userProfile: RegisteredUser) => {
    if (userProfile.email === currentAdminEmail) {
      alert("Operations Error: You cannot demote your own administrator role!");
      return;
    }

    const nextRole = userProfile.role === 'Admin' ? 'User' : 'Admin';
    const confirmChange = window.confirm(`Are you sure you want to promote/demote ${userProfile.email} to role: ${nextRole}?`);
    if (!confirmChange) return;

    try {
      const ref = doc(db, 'registered_users', userProfile.id);
      await updateDoc(ref, { role: nextRole });
    } catch (err: any) {
      alert(`Role transition error: ${err?.message || err}`);
    }
  };

  const handleRemoveUser = async (userProfile: RegisteredUser) => {
    if (userProfile.email === currentAdminEmail) {
      alert("Operations Error: You cannot delete your own administrative session!");
      return;
    }

    const confirmDel = window.confirm(`CRITICAL WARNING: This permanently deletes ${userProfile.email} from the authorization registry. The user will be requested to re-register on sign-in. Proceed?`);
    if (!confirmDel) return;

    try {
      await deleteDoc(doc(db, 'registered_users', userProfile.id));
      alert("User removed successfully.");
    } catch (err: any) {
      alert(`Deletion error: ${err?.message || err}`);
    }
  };

  // Broadcast settings handler
  const handleSaveAnnouncement = async () => {
    setIsSettingAnnounce(true);
    const id = 'announcement';
    const ref = doc(db, 'global_settings', id);

    try {
      await setDoc(ref, {
        id,
        announcementBanner: bannerText.trim(),
        announcementActive: bannerActive,
        hiddenPages: hiddenPages,
        adminHiddenPages: adminHiddenPages,
        updatedAt: new Date().toISOString(),
        updatedBy: currentAdminEmail
      });
      alert("System broadcast announcement updated successfully!");
    } catch (err: any) {
      alert(`Announcement update failed: ${err?.message || err}`);
    } finally {
      setIsSettingAnnounce(false);
    }
  };

  // Clean filters for listings
  const filteredUsers = usersList.filter(u => {
    const q = userQuery.toLowerCase();
    return u.email.toLowerCase().includes(q) || u.displayName.toLowerCase().includes(q) || u.role.toLowerCase().includes(q) || u.status.toLowerCase().includes(q);
  });

  const filteredLogs = activityLogs.filter(log => {
    const q = logQuery.toLowerCase();
    const matchesKeyword = log.userEmail.toLowerCase().includes(q) || 
                           log.action.toLowerCase().includes(q) || 
                           log.details.toLowerCase().includes(q);
    if (logFilterAction === 'All') return matchesKeyword;
    return matchesKeyword && log.action.includes(logFilterAction);
  });

  // Extract unique action prefixes for log filter dropdown
  const uniqueActionPrefixes = Array.from(new Set(activityLogs.map(l => {
    if (l.action.includes(':')) {
      return l.action.split(':')[0];
    }
    return l.action;
  }))).slice(0, 15);

  return (
    <div id="admin_control_panel_view" className="space-y-6">
      
      {/* Visual Welcome Board */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-md border border-slate-800 relative overflow-hidden">
        <div id="ambient_background_decoration" className="absolute right-0 top-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                MASTER ADMIN ACCESS
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Security Command & Control Panel</h1>
            <p className="text-slate-400 text-sm max-w-2xl">
              Control authorization boundaries on the platform. Pre-approve team members, manage activity blockades, monitor full details audits in real-time, and publish diagnostic system messages.
            </p>
          </div>
          <div className="p-3 bg-slate-800 rounded-xl border border-slate-700 hidden sm:block">
            <ShieldCheck className="w-10 h-10 text-emerald-400" />
          </div>
        </div>

        {/* Dynamic Metric Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-slate-800">
          <div className="space-y-1">
            <span className="text-slate-400 text-xs font-medium uppercase tracking-wider">Total Users</span>
            <div className="text-2xl font-bold text-white">{usersList.length}</div>
          </div>
          <div className="space-y-1">
            <span className="text-slate-400 text-xs font-medium uppercase tracking-wider">Active</span>
            <div className="text-2xl font-bold text-emerald-400">
              {usersList.filter(u => u.status === 'Active').length}
            </div>
          </div>
          <div className="space-y-1">
            <span className="text-slate-400 text-xs font-medium uppercase tracking-wider">Pending</span>
            <div className="text-2xl font-bold text-blue-400">
              {usersList.filter(u => u.status === 'Pending').length}
            </div>
          </div>
          <div className="space-y-1">
            <span className="text-slate-400 text-xs font-medium uppercase tracking-wider">Restricted</span>
            <div className="text-2xl font-bold text-amber-400">
              {usersList.filter(u => u.status === 'Restricted').length}
            </div>
          </div>
          <div className="space-y-1">
            <span className="text-slate-400 text-xs font-medium uppercase tracking-wider">Blocked</span>
            <div className="text-2xl font-bold text-red-400">
              {usersList.filter(u => u.status === 'Blocked').length}
            </div>
          </div>
        </div>
      </div>

      {/* Nav Sub-Tabs Selection */}
      <div className="border-b border-gray-200 flex items-center justify-between pb-1">
        <div className="flex gap-4">
          <button
            onClick={() => setActiveSubTab('users')}
            className={`py-3 px-1 border-b-2 font-medium text-sm transition-all flex items-center gap-2 ${
              activeSubTab === 'users' 
                ? 'border-red-600 text-red-600' 
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Users className="w-4 h-4" />
            Authorization Control Registry
          </button>
          <button
            onClick={() => setActiveSubTab('activity')}
            className={`py-3 px-1 border-b-2 font-medium text-sm transition-all flex items-center gap-2 ${
              activeSubTab === 'activity' 
                ? 'border-red-600 text-red-600' 
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Activity className="w-4 h-4" />
            Audit Logs Audit Trail
          </button>
          <button
            onClick={() => setActiveSubTab('announcements')}
            className={`py-3 px-1 border-b-2 font-medium text-sm transition-all flex items-center gap-2 ${
              activeSubTab === 'announcements' 
                ? 'border-red-600 text-red-600' 
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Volume2 className="w-4 h-4" />
            Global Broadcast System
          </button>
        </div>
        <div id="refresh_timestamp_tag" className="hidden sm:flex items-center gap-2 text-xs text-gray-400 font-mono">
          <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-500" />
          REALTIME DB SYNC ACTIVE
        </div>
      </div>

      {/* RENDER ACTIVE SCREEN */}
      {activeSubTab === 'users' && (
        <div className="space-y-6">
          
          {/* Quick Pre-authorization Addition Box */}
          <div className="bg-white rounded-xl shadow-xs border border-gray-200 p-5">
            <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2 mb-4">
              <UserPlus className="w-5 h-5 text-red-600" />
              Pre-Authorize team Email Address / Register Member
            </h2>
            <form onSubmit={handleAddNewUser} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Gmail Address</label>
                <input
                  type="email"
                  required
                  placeholder="name@gmail.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full text-sm rounded-lg border border-gray-300 bg-gray-50 px-3.5 py-2 text-gray-900 focus:bg-white focus:ring-1 focus:ring-red-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Preferred Label Name (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Joy Goswami"
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                  className="w-full text-sm rounded-lg border border-gray-300 bg-gray-50 px-3.5 py-2 text-gray-900 focus:bg-white focus:ring-1 focus:ring-red-600 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Access Role</label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as 'Admin' | 'User')}
                    className="w-full text-sm rounded-lg border border-gray-300 bg-gray-50 px-2 py-2 text-gray-900 focus:bg-white focus:outline-none"
                  >
                    <option value="User">Regular User</option>
                    <option value="Admin">Administrator</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Permission</label>
                  <select
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value as any)}
                    className="w-full text-sm rounded-lg border border-gray-300 bg-gray-50 px-2 py-2 text-gray-900 focus:bg-white focus:outline-none"
                  >
                    <option value="Active">Active (Full)</option>
                    <option value="Pending">Pending (Awaiting Auth)</option>
                    <option value="Restricted">Restricted (Read-Only)</option>
                    <option value="Blocked">Blocked (Lockout)</option>
                  </select>
                </div>
              </div>
              <div>
                <button
                  type="submit"
                  disabled={isAddingUser}
                  className="w-full bg-red-600 hover:bg-red-700 text-white text-sm font-semibold py-2 px-4 rounded-lg shadow-xs hover:shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <UserPlus className="w-4 h-4" />
                  {isAddingUser ? 'Adding...' : 'Authorize login'}
                </button>
              </div>
            </form>
          </div>

          {/* User List Table view */}
          <div className="bg-white rounded-xl shadow-xs border border-gray-200 overflow-hidden">
            <div className="p-4 bg-gray-50 border-b border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-3">
              <h3 className="font-semibold text-gray-900 text-sm">Security Registry list ({filteredUsers.length} matched)</h3>
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search email, name or role..."
                  value={userQuery}
                  onChange={(e) => setUserQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-gray-300 bg-white text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-red-600"
                />
              </div>
            </div>

            {isUsersLoading ? (
              <div className="py-12 flex flex-col items-center justify-center text-gray-400 font-mono text-xs gap-3">
                <RefreshCw className="w-8 h-8 animate-spin text-red-600" />
                LOADING CLOUD REGISTRY...
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="py-12 text-center text-gray-500 text-sm">
                No registered search users found matching '{userQuery}'.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="bg-gray-150 border-b border-gray-200 text-xs font-semibold text-gray-600 uppercase">
                      <th className="px-6 py-3.5">User Identity Details</th>
                      <th className="px-6 py-3.5">Security Role</th>
                      <th className="px-6 py-3.5">Status Controls</th>
                      <th className="px-6 py-3.5">Registration Info</th>
                      <th className="px-6 py-3.5 text-right">Administrative Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredUsers.map((item) => (
                      <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-xs font-semibold text-slate-700 border border-slate-200 overflow-hidden">
                              {item.photoURL ? (
                                <img src={item.photoURL} alt={item.displayName} className="w-full h-full object-cover" />
                              ) : (
                                (item.displayName || item.email)[0].toUpperCase()
                              )}
                            </div>
                            <div>
                              <div className="font-semibold text-gray-900 flex items-center gap-1.5">
                                {item.displayName}
                                {item.email === currentAdminEmail && (
                                  <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.2 rounded font-medium">YOU</span>
                                )}
                              </div>
                              <div className="text-xs text-gray-500 font-mono">{item.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <button
                            onClick={() => handleToggleRole(item)}
                            title="Click to toggle Role"
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${
                              item.role === 'Admin'
                                ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                                : 'bg-slate-50 border-slate-200 text-slate-700'
                            }`}
                          >
                            <Shield className="w-3 h-3" />
                            {item.role === 'Admin' ? 'Administrator' : 'Regular User'}
                          </button>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            {/* Toggle options */}
                            <select
                              value={item.status}
                              onChange={(e) => {
                                const nextVal = e.target.value as any;
                                if (nextVal === 'Blocked') {
                                  setUserToBlock(item);
                                } else {
                                  handleUpdateStatus(item, nextVal);
                                }
                              }}
                              disabled={item.email === currentAdminEmail}
                              className={`text-xs rounded-lg border font-semibold px-2.5 py-1 focus:outline-none ${
                                item.status === 'Active'
                                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                  : item.status === 'Pending'
                                  ? 'bg-blue-50 border-blue-200 text-blue-700'
                                  : item.status === 'Restricted'
                                  ? 'bg-amber-50 border-amber-200 text-amber-700'
                                  : 'bg-red-50 border-red-200 text-red-700'
                              }`}
                            >
                              <option value="Active">Active (Full)</option>
                              <option value="Pending">Pending (Awaiting Auth)</option>
                              <option value="Restricted">Restricted (Read-Only)</option>
                              <option value="Blocked">Blocked (Dead-Lock)</option>
                            </select>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-xs text-gray-600 font-mono">
                            <div>Created: {item.createdAt ? new Date(item.createdAt).toLocaleDateString('en-GB') : 'N/A'}</div>
                            <div>Last Auth: {item.lastLoginAt ? new Date(item.lastLoginAt).toLocaleString('en-GB') : 'N/A'}</div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => setExportingUser(item)}
                              className="p-1.5 text-slate-500 hover:text-indigo-600 rounded-lg hover:bg-slate-100 transition-colors"
                              title="Download & Export User Portfolio (JSON or Excel)"
                            >
                              <Download className="w-4 h-4 animate-pulse text-indigo-505" />
                            </button>
                            <button
                              onClick={() => handleRemoveUser(item)}
                              disabled={item.email === currentAdminEmail}
                              className="p-1.5 text-gray-400 hover:text-red-600 disabled:opacity-30 rounded-lg hover:bg-gray-100 transition-colors"
                              title="Purge authorizations record"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {activeSubTab === 'activity' && (
        <div className="bg-white rounded-xl shadow-xs border border-gray-200 overflow-hidden">
          <div className="p-4 bg-gray-50 border-b border-gray-200 flex flex-col md:flex-row items-center justify-between gap-4">
            <div>
              <h3 className="font-semibold text-gray-900 text-base flex items-center gap-2">
                <Activity className="w-5 h-5 text-red-600" />
                Session Audit Trails logs (Last 200 Actions)
              </h3>
              <p className="text-xs text-gray-500">Searchable and categorized audit trail of user actions, synchronizations, and permissions.</p>
            </div>
            
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
              {/* Category Filter */}
              <select
                value={logFilterAction}
                onChange={(e) => setLogFilterAction(e.target.value)}
                className="w-full sm:w-44 text-xs rounded-lg border border-gray-300 px-3 py-1.5 text-gray-750 focus:outline-none"
              >
                <option value="All">All Operations Types</option>
                <option value="Create">Create operations (Add)</option>
                <option value="Update">Update operations (Save)</option>
                <option value="Delete">Delete operations (Remove)</option>
                <option value="Access">Session Heartbeats</option>
                {uniqueActionPrefixes.map(prefix => (
                  <option key={prefix} value={prefix}>{prefix}</option>
                ))}
              </select>

              {/* Keyword text search */}
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Filter logs by User or keyword..."
                  value={logQuery}
                  onChange={(e) => setLogQuery(e.target.value)}
                  className="w-full pl-8.5 pr-3 py-1.5 rounded-lg border border-gray-300 text-xs text-gray-900 bg-white focus:outline-none"
                />
              </div>
            </div>
          </div>

          {isLogsLoading ? (
            <div className="py-24 text-center text-gray-400 font-mono text-xs gap-3 flex flex-col items-center justify-center">
              <RefreshCw className="w-8 h-8 animate-spin text-red-600" />
              RETRIEVING AUDIT LOGS TRAIL FROM FIRESTORE...
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="py-24 text-center text-gray-500">
              No activity audit files matching these filters found.
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="sticky top-0 bg-gray-50 border-b border-gray-200 z-10 text-gray-600 uppercase font-semibold">
                  <tr>
                    <th className="px-6 py-3">Timestamp</th>
                    <th className="px-6 py-3">Subject User</th>
                    <th className="px-6 py-3">Action Description</th>
                    <th className="px-6 py-3">Payload Details</th>
                    <th className="px-6 py-3"><div className="flex items-center gap-1.5"><Laptop className="w-4 h-4 text-gray-400" /> Environment User-Agent</div></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-mono">
                  {filteredLogs.map((log) => {
                    const isDangerous = log.action.includes('Delete') || log.action.includes('Blocked');
                    const isWarning = log.action.includes('Update') || log.action.includes('Restricted');
                    const isSuccess = log.action.includes('Create') || log.action.includes('Authorized');
                    
                    return (
                      <tr key={log.id} className="hover:bg-gray-50">
                        <td className="px-6 py-3 text-slate-500 whitespace-nowrap">
                          {new Date(log.timestamp).toLocaleString('en-GB')}
                        </td>
                        <td className="px-6 py-3 font-semibold text-gray-800">
                          {log.userEmail}
                        </td>
                        <td className="px-6 py-3">
                          <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${
                            isDangerous 
                              ? 'bg-red-50 text-red-600' 
                              : isWarning 
                              ? 'bg-amber-50 text-amber-600'
                              : isSuccess 
                              ? 'bg-emerald-50 text-emerald-600'
                              : 'bg-slate-100 text-slate-600'
                          }`}>
                            {log.action}
                          </span>
                        </td>
                        <td className="px-6 py-3 font-sans text-gray-700 font-mono text-xs break-all max-w border-r border-dotted">
                          {log.details || <span className="text-gray-300">-</span>}
                        </td>
                        <td className="px-6 py-3 text-[10px] text-gray-400 truncate max-w-[200px]" title={log.userAgent}>
                          {log.userAgent}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeSubTab === 'announcements' && (
        <div className="bg-white rounded-xl shadow-xs border border-gray-200 p-6 space-y-6">
          
          <div>
            <h3 className="font-semibold text-gray-900 text-base flex items-center gap-2">
              <Volume2 className="w-5 h-5 text-red-600" />
              Global Broadcast Message & Warning announcement Banner
            </h3>
            <p className="text-xs text-gray-500 mt-1">Configures a global message banner visible on top of all sheets and screens for active workspace team members.</p>
          </div>

          <div className="space-y-4 max-w-2xl border-t pt-4">
            <div className="flex items-center justify-between bg-gray-50 border p-4 rounded-lg">
              <div className="space-y-0.5">
                <div className="text-sm font-semibold text-gray-900">Broadcast banner Status</div>
                <div className="text-xs text-gray-500">Toggle whether non-admin users should see this banner on login instantly.</div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={bannerActive} 
                  onChange={(e) => setBannerActive(e.target.checked)} 
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600"></div>
              </label>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-gray-600 uppercase">Announcement banner markup / text</label>
              <textarea
                rows={3}
                placeholder="⚠️ MAINTENANCE ADVISORY: Server will be restricted for scheduled updates today at 5:00 PM IST."
                value={bannerText}
                onChange={(e) => setBannerText(e.target.value)}
                className="w-full text-sm rounded-lg border border-gray-300 p-3 bg-gray-50 text-gray-900 focus:bg-white focus:ring-1 focus:ring-red-600 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={handleSaveAnnouncement}
                disabled={isSettingAnnounce}
                className="px-5 py-2 text-sm font-semibold rounded-lg text-white bg-red-600 hover:bg-red-700 shadow-xs focus:outline-none transition-all disabled:opacity-50 flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                {isSettingAnnounce ? 'Saving Settings...' : 'Save Settings'}
              </button>
            </div>
          </div>

          {/* Page Visibility Settings */}
          <div className="border-t pt-6 mt-6 max-w-4xl grid grid-cols-1 xl:grid-cols-2 gap-8">
            <div>
              <h3 className="font-semibold text-gray-900 text-base flex items-center gap-2 mb-1">
                <ShieldAlert className="w-5 h-5 text-red-600" />
                Page Visibility (Normal Users)
              </h3>
              <p className="text-xs text-gray-500 mb-4">Select pages to hide them from normal system users.</p>
              
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 grid grid-cols-1 gap-3 max-h-64 overflow-y-auto custom-scrollbar">
                {[
                  { id: 'video-dashboard', label: 'Video Dashboard' },
                  { id: 'database', label: 'Creator Database' },
                  { id: 'planner', label: 'Monthly Planner' },
                  { id: 'monthly-targets', label: 'Monthly Targets' },
                  { id: 'aov-calculator', label: 'AOV Controller' },
                  { id: 'notebook', label: 'Calendar Notebook' },
                  { id: 'image-slides', label: 'LIVE SLIDES' },
                  { id: 'secure-billing', label: 'BILL & CHECKLIST' },
                  { id: 'leaderboard', label: 'Leaderboard & Benchmarks' },
                  { id: 'shortio-tracker', label: 'Short.io Live Tracker' },
                  { id: 'live-video-views', label: 'Live Video Views' },
                  { id: 'mobile-apk', label: 'Android APK / PWA' },
                  { id: 'sheets-extractor', label: 'Central Sheets Backup' }
                ].map(page => {
                  const isHidden = hiddenPages.includes(page.id);
                  return (
                    <label key={page.id} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition ${isHidden ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200 hover:border-gray-300'}`}>
                      <input 
                        type="checkbox"
                        className="w-4 h-4 text-red-600 rounded focus:ring-red-500"
                        checked={isHidden}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setHiddenPages([...hiddenPages, page.id]);
                          } else {
                            setHiddenPages(hiddenPages.filter(pId => pId !== page.id));
                          }
                        }}
                      />
                      <span className={`text-sm font-medium ${isHidden ? 'text-red-700' : 'text-gray-700'}`}>
                        {page.label}
                      </span>
                      {isHidden && <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-red-500 bg-red-100 px-1.5 py-0.5 rounded">Hidden</span>}
                    </label>
                  )
                })}
              </div>
            </div>

            <div>
              <h3 className="font-semibold text-gray-900 text-base flex items-center gap-2 mb-1">
                <ShieldAlert className="w-5 h-5 text-amber-600" />
                Page Visibility (Admins)
              </h3>
              <p className="text-xs text-gray-500 mb-4">Select pages to hide them from Admin users (including you).</p>
              
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 grid grid-cols-1 gap-3 max-h-64 overflow-y-auto custom-scrollbar">
                {[
                  { id: 'video-dashboard', label: 'Video Dashboard' },
                  { id: 'database', label: 'Creator Database' },
                  { id: 'planner', label: 'Monthly Planner' },
                  { id: 'monthly-targets', label: 'Monthly Targets' },
                  { id: 'aov-calculator', label: 'AOV Controller' },
                  { id: 'notebook', label: 'Calendar Notebook' },
                  { id: 'image-slides', label: 'LIVE SLIDES' },
                  { id: 'secure-billing', label: 'BILL & CHECKLIST' },
                  { id: 'leaderboard', label: 'Leaderboard & Benchmarks' },
                  { id: 'shortio-tracker', label: 'Short.io Live Tracker' },
                  { id: 'live-video-views', label: 'Live Video Views' },
                  { id: 'mobile-apk', label: 'Android APK / PWA' },
                  { id: 'sheets-extractor', label: 'Central Sheets Backup' }
                ].map(page => {
                  const isHidden = adminHiddenPages.includes(page.id);
                  return (
                    <label key={page.id} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition ${isHidden ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200 hover:border-gray-300'}`}>
                      <input 
                        type="checkbox"
                        className="w-4 h-4 text-amber-600 rounded focus:ring-amber-500"
                        checked={isHidden}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setAdminHiddenPages([...adminHiddenPages, page.id]);
                          } else {
                            setAdminHiddenPages(adminHiddenPages.filter(pId => pId !== page.id));
                          }
                        }}
                      />
                      <span className={`text-sm font-medium ${isHidden ? 'text-amber-700' : 'text-gray-700'}`}>
                        {page.label}
                      </span>
                      {isHidden && <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded">Hidden</span>}
                    </label>
                  )
                })}
              </div>
            </div>
            
            <div className="col-span-1 xl:col-span-2 flex items-center justify-end gap-3 pt-4">
               <span className="text-xs text-gray-500">Changes will be verified on next 'Save Settings' submission.</span>
            </div>
          </div>

          {/* Emergency System locks notice bar */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 max-w-2xl">
            <h4 className="text-amber-800 text-sm font-semibold flex items-center gap-2 mb-2">
              <AlertOctagon className="w-4 h-4" />
              Emergency Global Lockout notice guidelines
            </h4>
            <p className="text-amber-700 text-xs leading-relaxed">
              If security overrides are needed, utilize the 'Status Controls' in the user registry list to change permissions to <strong>Restricted</strong> (which disables all save, update, delete functionality in real-time) or <strong>Blocked</strong> (which completely denies workspace views). The rules utilize secure Firestore Rules mapping so writes are securely blocked.
            </p>
          </div>
        </div>
      )}

      {/* Block Custom modal Dialog */}
      {userToBlock && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-xl shadow-xl max-w-md w-full border border-gray-200 overflow-hidden"
          >
            <div className="bg-red-600 text-white p-4 flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold">
                <ShieldAlert className="w-5 h-5 text-red-100" />
                Block Login Session Authorization
              </div>
              <button 
                onClick={() => setUserToBlock(null)}
                className="text-white hover:text-red-150 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-5 space-y-4">
              <p className="text-gray-600 text-xs">
                You are about to block <strong>{userToBlock.email}</strong>. This user will immediately get booted out and lose all visual platform operations.
              </p>
              
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-gray-500">Provide Custom Block Reason / Lock message</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Your session has been locked for background security checks."
                  value={customBannedMessage}
                  onChange={(e) => setCustomBannedMessage(e.target.value)}
                  className="w-full text-sm rounded-lg border border-gray-300 px-3 py-2 text-gray-905 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setUserToBlock(null)}
                  className="px-4 py-1.5 text-xs text-gray-500 font-semibold hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleUpdateStatus(userToBlock, 'Blocked', customBannedMessage)}
                  className="px-4 py-1.5 text-xs bg-red-600 hover:bg-red-700 font-semibold text-white rounded-lg shadow-sm transition-all"
                >
                  Confirm Blockade
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Portability / Export Data Hub Modal */}
      {exportingUser && (
        <div id="user_data_export_modal" className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full border border-gray-150 overflow-hidden flex flex-col my-8"
          >
            {/* Header banner */}
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-500/10 rounded-lg border border-indigo-500/20 text-indigo-400">
                  <Database className="w-5 h-5 animate-spin" style={{ animationDuration: '3s' }} />
                </div>
                <div>
                  <h3 className="font-bold text-base">User Portfolio Portability Hub</h3>
                  <p className="text-xs text-slate-400 font-sans">Compile, audit and download database entries safely</p>
                </div>
              </div>
              <button 
                onClick={() => setExportingUser(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
                title="Close Portal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Profile Overview segment */}
            <div className="p-5 bg-slate-50 border-b border-gray-150 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-indigo-50 flex items-center justify-center text-sm font-semibold text-indigo-750 border border-indigo-150 overflow-hidden shrink-0">
                  {exportingUser.photoURL ? (
                    <img src={exportingUser.photoURL} alt={exportingUser.displayName} className="w-full h-full object-cover" />
                  ) : (
                    (exportingUser.displayName || exportingUser.email)[0].toUpperCase()
                  )}
                </div>
                <div>
                  <div className="font-bold text-gray-955 flex items-center gap-2 text-sm sm:text-base">
                    {exportingUser.displayName} 
                    <span className="text-[10px] bg-slate-200 py-0.5 px-2 rounded-full font-bold text-slate-600 border border-slate-300">
                      {exportingUser.role}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 font-mono">{exportingUser.email}</div>
                </div>
              </div>

              <div className="font-mono text-[10px] text-slate-500 self-stretch sm:self-auto flex flex-col justify-center bg-white p-2.5 rounded-lg border border-gray-200 shadow-3xs">
                <div>PROFILE REGISTER ID: {exportingUser.id}</div>
                <div>LAST LOGIN STATE: {exportingUser.lastLoginAt ? new Date(exportingUser.lastLoginAt).toLocaleString('en-GB') : 'Never logged in'}</div>
              </div>
            </div>

            {/* Main export controls content */}
            <div className="p-6 space-y-6 flex-1 overflow-y-auto max-h-[55vh]">
              {isExportLoading ? (
                <div className="py-12 flex flex-col items-center justify-center text-slate-400 font-mono text-xs gap-3">
                  <RefreshCw className="w-9 h-9 animate-spin text-indigo-600" />
                  COMPILING PORTFOLIO REAL-TIME FROM FIRESTORE COLLECTIONS...
                </div>
              ) : !exportedData ? (
                <div className="py-12 text-center text-gray-500 text-sm flex flex-col items-center gap-2">
                  <Info className="w-8 h-8 text-slate-400" />
                  No database entries loaded yet.
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Compilation summary table */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest leading-none">Database Compilation Summary</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      {[
                        { label: 'Influencers', key: 'influencers', colorStyle: 'bg-indigo-50 text-indigo-700 border-indigo-100' },
                        { label: 'Campaigns', key: 'campaigns', colorStyle: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
                        { label: 'Tasks', key: 'tasks', colorStyle: 'bg-sky-50 text-sky-700 border-sky-100' },
                        { label: 'Ledger Bills', key: 'billingEntries', colorStyle: 'bg-rose-50 text-rose-700 border-rose-100' },
                        { label: 'AOV Tracker', key: 'aovEntries', colorStyle: 'bg-amber-50 text-amber-700 border-amber-100' },
                        { label: 'Sales Targets', key: 'monthlyTargets', colorStyle: 'bg-teal-50 text-teal-700 border-teal-100' },
                        { label: 'Messages', key: 'messages', colorStyle: 'bg-violet-50 text-violet-700 border-violet-100' },
                        { label: 'Contracts', key: 'contracts', colorStyle: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-100' }
                      ].map((dbCol) => {
                        const count = (exportedData[dbCol.key] || []).length;
                        return (
                          <div 
                            key={dbCol.key}
                            className="bg-white border border-gray-200 p-3 rounded-xl flex items-center justify-between shadow-xs hover:shadow-sm transition-shadow"
                          >
                            <span className="text-xs font-medium text-slate-600">{dbCol.label}</span>
                            <span className={`px-2 py-0.5 rounded-md text-xs font-black border ${dbCol.colorStyle}`}>
                              {count}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Primary actions downloads */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                    
                    {/* App Readable format */}
                    <div className="border border-slate-200 rounded-xl p-4 space-y-3 shadow-xs flex flex-col justify-between bg-white">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2 text-indigo-700 font-bold text-sm">
                          <FileDown className="w-5 h-5 shrink-0" />
                          App-Readable Format (.json)
                        </div>
                        <p className="text-xs text-slate-500 leading-relaxed">
                          Download a native JSON file containing all user items. This structure is 100% compatible with the platform's standard <strong>Restore / Sync</strong> engine.
                        </p>
                      </div>
                      <button
                        onClick={handleDownloadJSON}
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-xl text-xs shadow-xs hover:shadow-sm transition-all flex items-center justify-center gap-2"
                      >
                        <Download className="w-4 h-4" />
                        Download JSON Package
                      </button>
                    </div>

                    {/* Excel spreadsheet format */}
                    <div className="border border-emerald-200 rounded-xl p-4 space-y-3 shadow-xs flex flex-col justify-between bg-emerald-50/10">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2 text-emerald-850 font-bold text-sm">
                          <FileSpreadsheet className="w-5 h-5 shrink-0 text-emerald-600" />
                          Unified Excel Workbook (.csv)
                        </div>
                        <p className="text-xs text-slate-500 leading-relaxed">
                          Compile all tables (Influencers, Campaigns, Tasks, Bills, AOVs, Monthly Targets) into a single, structured workbook separated by clean section tags.
                        </p>
                      </div>
                      <button
                        onClick={handleDownloadCombinedCSV}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 px-4 rounded-xl text-xs shadow-xs hover:shadow-sm transition-all flex items-center justify-center gap-2"
                      >
                        <FileSpreadsheet className="w-4 h-4" />
                        Export Unified Excel Sheet
                      </button>
                    </div>

                  </div>

                  {/* Individual Table Exporters */}
                  <div className="space-y-2.5 pt-2 border-t border-gray-150">
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest leading-none">Individual Table Exports (Excel CSVs)</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {[
                        { label: 'Influencers List', col: 'influencers' },
                        { label: 'Sponsorship Campaigns', col: 'campaigns' },
                        { label: 'Tasks Deliverables', col: 'tasks' },
                        { label: 'Billing & Ledger', col: 'billingEntries' },
                        { label: 'AOV Calculator Data', col: 'aovEntries' },
                        { label: 'Monthly Sales Targets', col: 'monthlyTargets' }
                      ].map((item) => {
                        const count = (exportedData[item.col] || []).length;
                        return (
                          <button
                            key={item.col}
                            onClick={() => handleDownloadEntityCSV(item.col)}
                            disabled={count === 0}
                            className="bg-slate-50 hover:bg-slate-100 text-slate-755 border border-slate-200 py-1.5 px-3 rounded-lg text-xs leading-tight transition-all font-medium flex items-center justify-between gap-1 disabled:opacity-40"
                          >
                            <span className="truncate">{item.label}</span>
                            <span className="font-mono text-[10px] font-bold text-slate-500 bg-slate-200/60 pb-0.5 px-1.5 rounded shrink-0">
                              CSV ({count})
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                </div>
              )}
            </div>

            {/* Footer buttons */}
            <div className="px-6 py-4 bg-slate-50 border-t border-gray-150 rounded-b-2xl flex items-center justify-between text-[11px] text-slate-400 font-mono">
              <span>🔒 SECURED EXPORT PROTOCOL ACTIVE</span>
              <button
                onClick={() => setExportingUser(null)}
                className="bg-slate-800 hover:bg-slate-950 text-white px-4 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-xs hover:shadow-sm"
              >
                Dismiss Hub
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
