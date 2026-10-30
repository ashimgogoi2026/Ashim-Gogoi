import React, { useState } from 'react';
import { 
  FileSpreadsheet, Sparkles, CheckCircle2, UserCheck, LogOut, ArrowUpRight, 
  Database, RefreshCw, Loader2, Play, DownloadCloud, AlertOctagon, HelpCircle 
} from 'lucide-react';
import { Influencer, Campaign, Task, Message, Contract, BillingEntry, AovEntry, ProductConfig } from '../types';
import { googleSignIn, logout, getAccessToken, getGoogleAccessToken } from '../lib/firebaseAuth';
import { User } from 'firebase/auth';
import { MonthlyProductTarget } from './MonthlyTargets';
import { safeLocalStorage } from '../lib/safeLocalStorage';

interface GoogleSheetsExtractorProps {
  influencers: Influencer[];
  campaigns: Campaign[];
  tasks: Task[];
  messages: Message[];
  contracts: Contract[];
  billingEntries: BillingEntry[];
  aovEntries?: AovEntry[];
  dashboardProducts?: ProductConfig[];
  monthlyTargets?: MonthlyProductTarget[];
  salesData?: any[];
  salesFileName?: string | null;
  user: User | null;
  accessToken: string | null;
  onLoginSuccess: (currentUser: User, token: string) => void;
  onLogoutSuccess: () => void;
  onRestoreData?: (restoredData: any) => void;
  isActiveTab?: boolean;
  autoBackupIntervalSeconds?: number;
  onAutoBackupStatus?: (status: { state: 'idle' | 'running' | 'success' | 'error', message?: string }) => void;
}

interface ExportLog {
  status: 'pending' | 'active' | 'success' | 'error';
  message: string;
}

export default function GoogleSheetsExtractor({
  influencers,
  campaigns,
  tasks,
  messages,
  contracts,
  billingEntries,
  aovEntries = [],
  dashboardProducts = [],
  monthlyTargets = [],
  salesData = [],
  salesFileName = null,
  user,
  accessToken,
  onLoginSuccess,
  onLogoutSuccess,
  onRestoreData,
  isActiveTab = true,
  autoBackupIntervalSeconds,
  onAutoBackupStatus
}: GoogleSheetsExtractorProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [exportProgress, setExportProgress] = useState<number>(0);
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [logs, setLogs] = useState<ExportLog[]>([]);
  const [driveFiles, setDriveFiles] = useState<{id: string, name: string, time?: string}[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);

  // Background Auto-backup
  const [autoBackupError, setAutoBackupError] = useState<string | null>(null);

  React.useEffect(() => {
    if (!autoBackupIntervalSeconds || !user || !accessToken) return;

    const intervalId = setInterval(() => {
      if (isExporting || isRestoring) return; // don't overlap

      // Silently run backup
      onAutoBackupStatus?.({ state: 'running' });
      handleExportToSheets(true).then(() => {
         onAutoBackupStatus?.({ state: 'success' });
      }).catch(e => {
        console.error("Auto Backup Failed:", e);
        setAutoBackupError(`Auto Backup Sync Warning: ${e.message || 'Network failure'}`);
        onAutoBackupStatus?.({ state: 'error', message: e.message });
      });
    }, autoBackupIntervalSeconds * 1000);

    return () => clearInterval(intervalId);
  }, [autoBackupIntervalSeconds, user, accessToken, isExporting, isRestoring, onAutoBackupStatus]);

  const loadDriveBackupFiles = async (tokenToUse: string) => {
    setIsLoadingFiles(true);
    try {
      const query = encodeURIComponent("name contains 'ProToGrow Sandbox Data Hub' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false");
      const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,mimeType,createdTime,modifiedTime)&orderBy=modifiedTime desc`;
      const response = await fetch(url, { headers: { 'Authorization': `Bearer ${tokenToUse}` } });
      if (response.ok) {
        const data = await response.json();
        setDriveFiles(data.files || []);
      }
    } catch (e: any) {
      console.error('Error fetching file list:', e);
    } finally {
      setIsLoadingFiles(false);
    }
  };

  const handleRestoreFromSheet = async (spreadsheetId: string, fileName: string) => {
    const confirmed = window.confirm(`Restore Workspace? This will overwrite your active database with the contents of "${fileName}" downloaded from Google Sheets.`);
    if (!confirmed) return;

    const token = getGoogleAccessToken() || accessToken || (await getAccessToken());
    if (!token) {
      setErrorMessage('Authentication is required to download workspace files.');
      return;
    }

    setIsRestoring(true);
    setErrorMessage(null);
    try {
      const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/SYSTEM_BACKUP_DO_NOT_EDIT!A:A`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) {
        throw new Error('Could not find SYSTEM_BACKUP_DO_NOT_EDIT tab or access was denied. Is this a valid backup sheet?');
      }
      const data = await response.json();
      const rows = data.values || [];
      const rawJson = rows.map((r: string[]) => r[0] || '').join('');
      if (!rawJson) {
        throw new Error('No JSON payload found in SYSTEM_BACKUP_DO_NOT_EDIT');
      }
      const parsed = JSON.parse(rawJson);
      if (onRestoreData) {
        await onRestoreData(parsed);
        alert('Workspace successfully restored from Google Sheets backup!');
      }
    } catch (err: any) {
      console.error('Restore error:', err);
      alert('Restoration Failed: ' + (err.message || 'Unknown error'));
    } finally {
      setIsRestoring(false);
    }
  };

  // Authenticate user with Google provider
  const handleGoogleLogin = async () => {
    try {
      setErrorMessage(null);
      const result = await googleSignIn();
      if (result) {
        onLoginSuccess(result.user, result.accessToken);
        loadDriveBackupFiles(result.accessToken);
      }
    } catch (err: any) {
      console.error('[Google-Login-Error]:', err);
      setErrorMessage(err.message || 'Authentication with Google failed.');
    }
  };

  const handleDisconnect = async () => {
    if (window.confirm('Are you sure you want to disconnect your Google session?')) {
      await logout();
      onLogoutSuccess();
      setExportUrl(null);
      setErrorMessage(null);
      setLogs([]);
    }
  };

  const handleExportToSheets = async (isSilent: boolean = false) => {
    const token = getGoogleAccessToken() || accessToken || (await getAccessToken());
    if (!token) {
      if (!isSilent) setErrorMessage('Google authorization is required. Please sign in above.');
      throw new Error('Google authorization is required.');
    }

    setIsExporting(true);
    if (!isSilent) {
      setExportProgress(5);
      setExportUrl(null);
      setErrorMessage(null);
    }
    
    // Clear auto backup error if it starts running successfully
    if (isSilent) setAutoBackupError(null);
    
    const newLogs: ExportLog[] = [
      { status: 'active', message: 'Initializing Google Sheets exporter schema...' }
    ];
    if (!isSilent) setLogs(newLogs);

    try {
      // 1. Check for existing Spreadsheet or Create new
      const suffix = user ? user.uid : 'guest';
      const today = new Date();
      const todayIsoStr = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().split('T')[0];
      const storageKey = `INFLUENCER_MANAGER_GOOGLE_SHEETS_STATIC_BACKUP_ID_${suffix}_${todayIsoStr}`;
      
      const dailyBackupTabName = `Daily_Backup_${todayIsoStr}`;

      let spreadsheetId = safeLocalStorage.getItem(storageKey);
      let spreadsheetUrl = '';
      let isExisting = false;

      if (!spreadsheetId) {
        newLogs.push({ status: 'active', message: `No stored backup ID found for today (${todayIsoStr}), scanning Google Drive...` });
        setLogs([...newLogs]);
        
        try {
          const expectedName = `ProToGrow Sandbox Data Hub - ${todayIsoStr}`;
          const query = encodeURIComponent(`name = '${expectedName}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`);
          const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)&orderBy=modifiedTime desc`;
          const driveRes = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
          if (driveRes.ok) {
            const data = await driveRes.json();
            if (data.files && data.files.length > 0) {
              spreadsheetId = data.files[0].id;
              safeLocalStorage.setItem(storageKey, spreadsheetId || '');
              newLogs[newLogs.length - 1].status = 'success';
              newLogs[newLogs.length - 1].message = `Found existing Backup Spreadsheet in Drive!`;
            } else {
              newLogs[newLogs.length - 1].status = 'active';
              newLogs[newLogs.length - 1].message = `No backups found in Drive for today.`;
            }
          }
        } catch (e: any) {
           console.warn('Could not scan drive, will create new', e);
        }
      }

      if (spreadsheetId) {
        newLogs.push({ status: 'active', message: `Verifying existing Backup Spreadsheet (ID: ${spreadsheetId})...` });
        setLogs([...newLogs]);
        
        const checkRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (checkRes.ok) {
          const info = await checkRes.json();
          spreadsheetUrl = info.spreadsheetUrl;
          isExisting = true;
          newLogs[newLogs.length - 1].status = 'success';
          newLogs[newLogs.length - 1].message = `Spreadsheet verified intact.`;
          setLogs([...newLogs]);

          const existingSheets = info.sheets || [];
          const existingSheetTitles = existingSheets.map((s: any) => s.properties.title);
          const requiredSheets = [
            'Overview Dashboard', 'Influencers Database', 'Campaigns Ledger',
            'Deliverables & Tasks', 'Financial Ledger', 'Average Order Value (AOV)',
            'Video Release & Fin Breakdown', 'Sales Dashboard Data', 'SYSTEM_BACKUP_DO_NOT_EDIT',
            dailyBackupTabName
          ];
          
          const missingSheets = requiredSheets.filter(t => !existingSheetTitles.includes(t));

          if (missingSheets.length > 0) {
            newLogs.push({ status: 'active', message: `Restoring missing worksheet tabs...` });
            setLogs([...newLogs]);

            const batchUpdateResp = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                requests: missingSheets.map(title => ({
                  addSheet: {
                    properties: {
                      title,
                      hidden: title === 'SYSTEM_BACKUP_DO_NOT_EDIT'
                    }
                  }
                }))
              })
            });

            if (!batchUpdateResp.ok) {
               console.error("Failed to add missing sheets");
            } else {
               newLogs[newLogs.length - 1].status = 'success';
               newLogs[newLogs.length - 1].message = 'Missing worksheet tabs restored.';
               setLogs([...newLogs]);
            }
          }

        } else {
          spreadsheetId = null;
          newLogs[newLogs.length - 1].status = 'error';
          newLogs[newLogs.length - 1].message = `Existing Backup Spreadsheet not found or inaccessible.`;
          setLogs([...newLogs]);
        }
      }

      setExportProgress(15);

      if (isExisting) {
        newLogs.push({ status: 'active', message: 'Clearing old data from worksheet tabs...' });
        setLogs([...newLogs]);
        
        const clearResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchClear`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            ranges: [
              "'Overview Dashboard'", 
              "'Influencers Database'", 
              "'Campaigns Ledger'", 
              "'Deliverables & Tasks'", 
              "'Financial Ledger'",
              "'Average Order Value (AOV)'",
              "'Video Release & Fin Breakdown'",
              "'Sales Dashboard Data'",
              "'SYSTEM_BACKUP_DO_NOT_EDIT'",
              `'${dailyBackupTabName}'`
            ]
          })
        });

        if (!clearResponse.ok) {
          const errorText = await clearResponse.text();
          // If clearing fails, just warn logs but do not crash completely.
          console.warn('Clear partial fail:', errorText);
          newLogs[newLogs.length - 1].status = 'error';
          newLogs[newLogs.length - 1].message = 'Could not clear old data clearly. Proceeding with overwrite...';
          setLogs([...newLogs]);
        } else {
          newLogs[newLogs.length - 1].status = 'success';
          newLogs[newLogs.length - 1].message = 'Successfully cleared old data.';
          setLogs([...newLogs]);
        }
      } else {
        const spreadsheetTitle = `ProToGrow Sandbox Data Hub - ${todayIsoStr}`;

        newLogs.push({ status: 'active', message: `Contacting Sheets API v4 to create new spreadsheet: "${spreadsheetTitle}"...` });
        setLogs([...newLogs]);

        const createResponse = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            properties: {
              title: spreadsheetTitle
            },
            sheets: [
              { properties: { title: 'Overview Dashboard' } },
              { properties: { title: 'Influencers Database' } },
              { properties: { title: 'Campaigns Ledger' } },
              { properties: { title: 'Deliverables & Tasks' } },
              { properties: { title: 'Financial Ledger' } },
              { properties: { title: 'Average Order Value (AOV)' } },
              { properties: { title: 'Video Release & Fin Breakdown' } },
              { properties: { title: 'Sales Dashboard Data' } },
              { 
                properties: { 
                  title: 'SYSTEM_BACKUP_DO_NOT_EDIT',
                  hidden: true
                } 
              },
              { 
                properties: { 
                  title: dailyBackupTabName,
                  hidden: false
                } 
              }
            ]
          })
        });

        if (!createResponse.ok) {
          const errTxt = await createResponse.text();
          throw new Error(`Google Sheets initialization failed (HTTP ${createResponse.status}): ${errTxt}`);
        }

        const spreadsheetInfo = await createResponse.json();
        spreadsheetId = spreadsheetInfo.spreadsheetId;
        spreadsheetUrl = spreadsheetInfo.spreadsheetUrl;
        
        safeLocalStorage.setItem(storageKey, spreadsheetId || '');

        newLogs[newLogs.length - 1].status = 'success';
        newLogs[newLogs.length - 1].message = `Created Spreadsheet file successfully! ID: ${spreadsheetId}`;
        setLogs([...newLogs]);
      }

      newLogs.push({ status: 'active', message: 'Aggregating local data packets into batch matrices...' });
      setLogs([...newLogs]);
      setExportProgress(35);

      // 2. Prepare structured data values
      // A. Overview tab data
      const overviewValues = [
        ['PROTOGROW ADVERTISING METRICS EXPORT REPORT'],
        ['AUTOMATED BUSINESS ENGINE PERSISTENCE SYSTEM'],
        [],
        ['Metric Category', 'Metric Summary / Value', 'Metric Units / Description'],
        ['Report Compiled DateTime', new Date().toLocaleString('en-GB'), 'User System Local Time'],
        ['Active Creators Registered', influencers.length.toLocaleString('en-IN'), 'Total registered channels/profiles'],
        ['Campaign Programs Initiated', campaigns.length.toLocaleString('en-IN'), 'Total cross-platform media campaigns'],
        ['Tasks Deliverables Tracked', tasks.length.toLocaleString('en-IN'), 'Count of video integrations & reels items'],
        ['Active SLA Agreements', contracts.length.toLocaleString('en-IN'), 'Legally binding signed creators campaigns agreements'],
        ['Finance Ledger Receipts', billingEntries.length.toLocaleString('en-IN'), 'Payout & invoice files captured'],
        ['Total Budget Pool Allocated', `₹${campaigns.reduce((sum, c) => sum + (c.budget || 0), 0).toLocaleString('en-IN')}`, 'Total INR budget invested'],
        ['Actual Budget Spent', `₹${campaigns.reduce((sum, c) => sum + (c.spent || 0), 0).toLocaleString('en-IN')}`, 'Current campaigns expenditures'],
        ['Accumulated Ledger Dues', `₹${billingEntries.reduce((sum, b) => sum + (b.amount || 0), 0).toLocaleString('en-IN')}`, 'Cumulative payments processing/invoice dues'],
        ['Total Client Video Clicks Earned', tasks.reduce((sum, t) => sum + (t.clicks || 0), 0).toLocaleString('en-IN'), 'Clicks received across integrations'],
        ['Avg Follower Reach Matrix', (influencers.length > 0 ? Math.round(influencers.reduce((sum, i) => sum + (i.followers || 0), 0) / influencers.length) : 0).toLocaleString('en-IN'), 'Average reach per connected brand ambassador']
      ];

      // B. Influencers tab data
      const influencerValues = [
        ['ID', 'Profile Name', 'Handle / Alias', 'Niche Category', 'Followers Count', 'Engagement Rate (%)', 'Primary Location', 'Cost Per Post (₹)', 'Average ROI Rating', 'Performance Rank', 'Star Level', 'Status State'],
        ...influencers.map(inf => [
          inf.id,
          inf.name || '',
          inf.handle || '',
          inf.niche || '',
          inf.followers || 0,
          inf.engagementRate || 0,
          inf.location || '',
          inf.costPerPost || 0,
          inf.averageROI || 0,
          inf.perfRanking || 0,
          inf.rating || 0,
          inf.status || ''
        ])
      ];

      // C. Campaigns tab data
      const campaignValues = [
        ['ID', 'Campaign Name', 'Campaign Description', 'Niche Focus', 'Budget Goal (₹)', 'Spent Amount (₹)', 'Current Status', 'Start Date', 'End Date', 'Total Impressions', 'Total Clicks', 'Total Conversions'],
        ...campaigns.map(c => [
          c.id,
          c.name || '',
          c.description || '',
          c.niche || '',
          c.budget || 0,
          c.spent || 0,
          c.status || '',
          c.startDate || '',
          c.endDate || '',
          c.metrics?.impressions || 0,
          c.metrics?.clicks || 0,
          c.metrics?.conversions || 0
        ])
      ];

      // D. Deliverables & Tasks
      const sortedTasks = [...tasks].sort((a, b) => {
        const dateA = a.deadline || a.releaseDate || '9999-99-99';
        const dateB = b.deadline || b.releaseDate || '9999-99-99';
        return new Date(dateA).getTime() - new Date(dateB).getTime();
      });
      const taskValues = [
        ['ID', 'Campaign ID', 'Creator ID', 'Deliverable Title', 'Deliverable Type', 'Social Platform', 'Deadline', 'Proposed Release Date', 'Remuneration (₹)', 'Status State', 'Clicks Received', 'Views Registered', 'Billed Amount (₹)', 'Payment Status Code'],
        ...sortedTasks.map(t => [
          t.id,
          t.campaignId || '',
          t.influencerId || '',
          t.title || '',
          t.type || '',
          t.platform || '',
          t.deadline || '',
          t.releaseDate || '',
          t.remuneration || 0,
          t.status || '',
          t.clicks || 0,
          t.views || 0,
          t.billedAmount || 0,
          t.paymentStatus || ''
        ])
      ];

      // E. Financial Ledger
      const billingValues = [
        ['ID', 'Associated Campaign', 'Beneficiary / Payee', 'Payment Class', 'Transfer Amount (₹)', 'Ledger cleared state', 'Filing Date', 'Invoice / Code Number'],
        ...billingEntries.map(b => [
          b.id,
          b.campaignName || '',
          b.influencerName || '',
          b.type || '',
          b.amount || 0,
          b.status || '',
          b.date || '',
          b.invoiceNumber || ''
        ])
      ];

      // F. Average Order Value (AOV)
      const aovValues = [
        ['ID', 'Target Month', 'Calendar Year', 'Product Identity', 'Gross Revenue (₹)', 'Order Volumes', 'Calculated AOV (₹)', 'Target AOV Goal (₹)', 'Ledger Audit Notes'],
        ...(aovEntries || []).map(a => [
          a.id,
          a.month || '',
          a.year || '',
          a.productName || '',
          a.revenue || 0,
          a.orders || 0,
          a.calculatedAov || 0,
          a.targetAov || 0,
          a.notes || ''
        ])
      ];

      // G. Video Release Tracking & Financial Breakdown
      const productNames = new Set<string>();
      dashboardProducts.forEach(p => p.name && productNames.add(p.name.trim()));
      tasks.forEach(t => t.title && productNames.add(t.title.trim()));
      monthlyTargets.forEach(t => t.productName && productNames.add(t.productName.trim()));
      
      const uniqueProductNames = Array.from(productNames).sort((a, b) => a.localeCompare(b));
      
      const breakdownValues = [
        ['Product Name', 'Target Goal', 'Released Status / Achievement', 'Spent on Product (₹)', 'SAMPLE COST (₹) of RELEASED VIDEO', 'Media Right (₹)', 'Revenue Target (₹)', 'Estimated Sales (₹)', 'Est ROAS'],
        ...uniqueProductNames.map(productName => {
          const productTasks = tasks.filter(t => t.title && t.title.trim().toLowerCase() === productName.trim().toLowerCase());
          const releasedTasks = productTasks.filter(t => !!(t.videoLink1?.trim() || t.videoLink2?.trim() || t.videoLink3?.trim()));
          const completedTasks = productTasks.filter(t => t.status !== 'Cancelled' && (t.videoLink1 || t.videoLink2 || t.videoLink3 || t.releaseDate));
          
          const totalSpent = releasedTasks.reduce((sum, t) => sum + (t.remuneration || 0), 0);
          const totalSampleCost = completedTasks.reduce((sum, t) => sum + (t.sampleCost || 0), 0);
          const totalMediaRight = productTasks.reduce((sum, t) => sum + (t.mediaRightAmount || 0), 0);
          const achievementCount = releasedTasks.length;
          
          const targets = monthlyTargets.filter(t => t.productName.trim().toLowerCase() === productName.trim().toLowerCase());
          const resolvedVideoTarget = targets.length > 0 ? targets.reduce((sum, m) => sum + (m.videoTarget || 0), 0) : 5;
          const resolvedRevenueTarget = targets.length > 0 ? targets.reduce((sum, m) => sum + (m.target || 0), 0) : 0;
          const resolvedSalesAmount = targets.length > 0 ? targets.reduce((sum, m) => sum + (m.salesAmount || 0), 0) : 0;
          
          const totalCostForROAS = totalSpent + totalSampleCost;
          const roas = totalCostForROAS > 0 ? (resolvedSalesAmount / totalCostForROAS) : 0;
          
          return [
            productName,
            resolvedVideoTarget,
            achievementCount,
            totalSpent,
            totalSampleCost,
            totalMediaRight,
            resolvedRevenueTarget,
            resolvedSalesAmount,
            roas > 0 ? `${roas.toFixed(2)}x` : 'N/A'
          ];
        })
      ];

      const salesValues = [
        ['ID', 'Year', 'Month', 'Week', 'Location', 'Product Name', 'Quantity', 'Gross Sales', 'Net Revenue'],
        ...salesData.map(r => [
          r.id || '',
          r.year || '',
          r.month || '',
          r.week || '',
          r.state || '',
          r.productName || '',
          r.quantity || 0,
          r.grossSales || 0,
          r.netRevenue || 0
        ])
      ];

      // H. System JSON Backup
      const systemPayload = {
        influencers,
        campaigns,
        tasks,
        messages,
        contracts,
        billingEntries,
        aovEntries,
        dashboardProducts,
        monthlyTargets,
        salesData
      };
      const systemPayloadStr = JSON.stringify(systemPayload);
      const chunkSize = 40000;
      const systemValues = [];
      for (let i = 0; i < systemPayloadStr.length; i += chunkSize) {
        systemValues.push([systemPayloadStr.substring(i, i + chunkSize)]);
      }

      const dailyBackupValues = [
        ['DAILY BACKUP SNAPSHOT FOR RECOVERY'],
        ['Date:', new Date().toLocaleDateString('en-GB')],
        ['Time:', new Date().toLocaleTimeString()],
        [],
        ['RAW JSON PAYLOAD BELOW:'],
        ['Copy the content of the cells below to restore from this specific backup date.'],
        ...systemValues
      ];

      newLogs[newLogs.length - 1].status = 'success';
      newLogs[newLogs.length - 1].message = `Successfully structured ${influencers.length} influencers, ${campaigns.length} campaigns, ${tasks.length} deliverables, and finance sheets.`;
      newLogs.push({ status: 'active', message: 'Publishing batch arrays using spreadsheets:batchUpdate endpoint...' });
      setLogs([...newLogs]);
      setExportProgress(65);

      // 3. BatchUpdate API Request
      const writeResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          valueInputOption: 'USER_ENTERED',
          data: [
            { range: "'Overview Dashboard'!A1", values: overviewValues },
            { range: "'Influencers Database'!A1", values: influencerValues },
            { range: "'Campaigns Ledger'!A1", values: campaignValues },
            { range: "'Deliverables & Tasks'!A1", values: taskValues },
            { range: "'Financial Ledger'!A1", values: billingValues },
            { range: "'Average Order Value (AOV)'!A1", values: aovValues },
            { range: "'Video Release & Fin Breakdown'!A1", values: breakdownValues },
            { range: "'Sales Dashboard Data'!A1", values: salesValues },
            { range: "'SYSTEM_BACKUP_DO_NOT_EDIT'!A1", values: systemValues },
            { range: `'${dailyBackupTabName}'!A1`, values: dailyBackupValues }
          ]
        })
      });

      if (!writeResponse.ok) {
        const errorText = await writeResponse.text();
        throw new Error(`Google Sheets bulk writing failed (HTTP ${writeResponse.status}): ${errorText}`);
      }

      await writeResponse.json();

      newLogs[newLogs.length - 1].status = 'success';
      newLogs[newLogs.length - 1].message = 'All worksheet structures populated and formatted in your active cloud drive!';
      setLogs([...newLogs]);
      setExportProgress(100);
      setExportUrl(spreadsheetUrl);
      loadDriveBackupFiles(token);

    } catch (err: any) {
      console.error('[Sheets-Export-Runtime-Error]:', err);
      setErrorMessage(err.message || 'Error executing transactional Google Sheets sync.');
      newLogs.push({ status: 'error', message: `Sync Interrupted: ${err.message}` });
      setLogs([...newLogs]);
    } finally {
      setIsExporting(false);
    }
  };

  if (!isActiveTab) {
    if (autoBackupError) {
      return (
        <div className="fixed bottom-4 right-4 z-[9999] bg-red-600 text-white px-4 py-3 rounded-lg shadow-xl animate-pulse font-sans flex items-center justify-between gap-3 border border-red-400">
          <div className="flex items-center gap-2">
            <AlertOctagon className="w-5 h-5 flex-shrink-0" />
            <div className="flex flex-col">
              <span className="font-bold text-sm">Background Backup Failed</span>
              <span className="text-xs text-red-200">{autoBackupError}</span>
            </div>
          </div>
          <button 
            type="button" 
            onClick={() => setAutoBackupError(null)} 
            className="text-red-200 hover:text-white"
          >
            &times;
          </button>
        </div>
      );
    }
    return null;
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto selection:bg-red-500/10">
      
      {/* CARD BODY WITH SHINY HEADER */}
      {autoBackupError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-start gap-3 relative">
          <AlertOctagon className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="space-y-1">
             <h4 className="font-bold text-sm">Auto Backup Error</h4>
             <p className="text-xs max-w-2xl">{autoBackupError}</p>
          </div>
          <button onClick={() => setAutoBackupError(null)} className="absolute top-2 right-2 text-red-400 hover:text-red-600">
             &times;
          </button>
        </div>
      )}
      <div className="bg-white border border-gray-150 rounded-2xl shadow-xs overflow-hidden">
        <div className="bg-gradient-to-r from-red-650 to-red-600 p-6 text-white flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="p-2.5 bg-white/10 rounded-xl backdrop-blur-xs shrink-0">
              <FileSpreadsheet className="w-7 h-7 text-white stroke-[2]" />
            </div>
            <div>
              <h2 className="text-base font-bold font-sans tracking-tight">Central Google Sheets Backup & Recovery</h2>
              <p className="text-[10px] text-red-105 tracking-wider font-mono uppercase mt-0.5">Manual Workspace Export & Data Restoration</p>
            </div>
          </div>

          {user && (
            <div className="flex items-center gap-1.5 self-start md:self-auto bg-green-550/30 px-3.5 py-1.5 rounded-full border border-green-500/20 text-emerald-100 font-mono text-[9px] font-black uppercase">
              <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Google Connected: {user.email?.substring(0, 16)}...</span>
            </div>
          )}
        </div>

        <div className="p-6 md:p-8">
          {!user ? (
            /* DISCONNECTED STATE */
            <div className="max-w-md mx-auto text-center py-8 space-y-6 select-none">
              <div className="flex justify-center">
                <div className="p-5 bg-gray-50 rounded-full border border-gray-150 text-gray-400">
                  <FileSpreadsheet className="w-14 h-14" />
                </div>
              </div>
              <div className="space-y-2">
                <h3 className="text-sm font-bold text-gray-900 font-sans">Spreadsheet Synchronizer Locked</h3>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Authorize your Google account to instantly transform your live campaign, influencer rosters, milestones, ledger accounts, and AOV registers into categorized sheets inside a spreadsheet.
                </p>
              </div>

              <div className="flex justify-center pt-2">
                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  className="gsi-material-button shadow-xs border border-gray-150 hover:border-gray-250 transition-all cursor-pointer rounded-lg bg-white"
                >
                  <div className="gsi-material-button-state"></div>
                  <div className="gsi-material-button-content-wrapper">
                    <div className="gsi-material-button-icon">
                      <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" style={{ display: 'block' }}>
                        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                      </svg>
                    </div>
                    <span className="gsi-material-button-contents font-sans font-bold text-gray-700 text-xs tracking-tight">
                      Authorize Google Sheets Exporter
                    </span>
                  </div>
                </button>
              </div>

              <div className="bg-amber-50/50 border border-amber-200/55 rounded-xl p-3 text-left max-w-sm mx-auto flex gap-2">
                <AlertOctagon className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-[10px] text-amber-800 leading-relaxed font-sans">
                  <strong>Permission SLA:</strong> The applet requests Google Spreadsheet scope access. No external or unrelated drive contents are accessed, protecting user private data.
                </p>
              </div>
            </div>
          ) : (
            /* CONNECTED OPERATOR BOARD */
            <div className="space-y-6">
              
              {/* STATUS CARD SUMMARY OF COHORT SIZES */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-gray-50 border border-gray-150 p-3 rounded-xl text-left select-none">
                  <span className="block text-[8px] font-black uppercase tracking-wider text-gray-400 font-mono">Creators Dataset</span>
                  <span className="text-lg font-extrabold text-red-650 block mt-1">{influencers.length} profiles</span>
                </div>
                <div className="bg-gray-50 border border-gray-150 p-3 rounded-xl text-left select-none">
                  <span className="block text-[8px] font-black uppercase tracking-wider text-gray-400 font-mono">Campaigns Deck</span>
                  <span className="text-lg font-extrabold text-red-650 block mt-1">{campaigns.length} campaigns</span>
                </div>
                <div className="bg-gray-50 border border-gray-150 p-3 rounded-xl text-left select-none">
                  <span className="block text-[8px] font-black uppercase tracking-wider text-gray-400 font-mono">Workflow deliverables</span>
                  <span className="text-lg font-extrabold text-red-650 block mt-1">{tasks.length} items</span>
                </div>
                <div className="bg-gray-50 border border-gray-150 p-3 rounded-xl text-left select-none">
                  <span className="block text-[8px] font-black uppercase tracking-wider text-gray-400 font-mono">Financial Ledger</span>
                  <span className="text-lg font-extrabold text-red-650 block mt-1">{billingEntries.length} bills</span>
                </div>
              </div>

              {/* ACTION CENTER */}
              <div className="p-5 border border-red-150 bg-red-50/20 rounded-2xl flex flex-col items-center justify-center text-center space-y-4">
                <div className="p-3 bg-red-50 text-red-700 rounded-full">
                  <Database className="w-7 h-7 text-red-600" />
                </div>
                <div className="space-y-1 max-w-md">
                  <h4 className="text-xs font-black uppercase tracking-wider text-red-700 font-sans">Manual Backup Actions</h4>
                  <p className="text-xs text-gray-500 leading-normal">
                    Manually generate a full backup of all pages in your app to a Google Sheet. Restore this exact state later using the recovery panel below.
                  </p>
                </div>

                {!isExporting ? (
                  <button
                    type="button"
                    onClick={() => handleExportToSheets()}
                    className="px-6 py-2.5 bg-red-650 hover:bg-red-700 font-extrabold text-white rounded-xl shadow-md transition flex items-center gap-2 text-xs cursor-pointer focus:ring-2 focus:ring-red-400 outline-none w-full max-w-xs justify-center"
                  >
                    <DownloadCloud className="w-5 h-5 text-red-200" />
                    <span>Central Backup (Export All Data)</span>
                  </button>
                ) : (
                  <div className="space-y-2.5 w-full max-w-xs">
                    <div className="flex items-center justify-between text-[11px] font-bold text-gray-700">
                      <span className="flex items-center gap-1">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-red-600" /> Connecting to Google...
                      </span>
                      <span className="font-mono text-red-700">{exportProgress}%</span>
                    </div>
                    {/* Progress slider bar */}
                    <div className="w-full h-1.5 bg-gray-150 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-red-650 transition-all duration-300"
                        style={{ width: `${exportProgress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* ACTION OUTCOME / EXPORT LINK */}
              {exportUrl && (
                <div className="p-4 border border-emerald-250 bg-emerald-50/40 rounded-xl flex flex-col md:flex-row items-center justify-between gap-3 animate-fade-in select-none">
                  <div className="flex items-center gap-2.5 text-left">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-gray-900">Sandbox Database Successfully Exported!</p>
                      <p className="text-[11px] text-gray-550 leading-none mt-0.5">Spreadsheet is live in your Google Drive. Tap button to view or share.</p>
                    </div>
                  </div>

                  <a
                    href={exportUrl}
                    target="_blank"
                    rel="referrer noopener"
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-lg text-xs flex items-center gap-1 transition shadow-2xs cursor-pointer hover:shadow-xs"
                  >
                    <span>Open Sheet ↗</span>
                  </a>
                </div>
              )}

              {/* HISTORICAL SPREADSHEETS ROW */}
              {(driveFiles.length > 0 || isLoadingFiles) && (
                <div className="border border-gray-150 rounded-xl overflow-hidden bg-white text-left">
                  <div className="bg-gray-50 px-4 py-3 border-b border-gray-150 flex items-center justify-between select-none">
                    <span className="text-[10px] font-extrabold text-gray-500 uppercase tracking-widest font-mono">Previous Google Sheet Backups</span>
                    <button onClick={() => accessToken && loadDriveBackupFiles(accessToken)} className="text-[10px] text-red-650 hover:underline font-bold flex items-center gap-1">
                      <RefreshCw className="w-3 h-3" /> Refresh
                    </button>
                  </div>
                  <div className="p-4 bg-gray-50/30">
                    {isLoadingFiles ? (
                      <div className="py-4 flex items-center justify-center gap-2 text-gray-400">
                        <Loader2 className="w-4 h-4 animate-spin text-red-600" />
                        <span className="text-xs font-bold">Scanning Drive...</span>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-[220px] overflow-y-auto">
                        {driveFiles.map((file) => (
                          <div key={file.id} className="bg-white border border-gray-155 hover:border-gray-250 p-3 rounded-lg text-xs flex items-center justify-between transition-all shadow-2xs hover:shadow-xs">
                            <div className="truncate pr-4 flex items-center gap-2">
                              <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                              <div className="space-y-0.5 truncate">
                                <p className="font-bold text-gray-800 truncate" title={file.name}>{file.name}</p>
                                <p className="text-[10px] font-mono text-gray-500">
                                  {file.time ? new Date(file.time).toLocaleString('en-GB') : 'Date unknown'}
                                </p>
                              </div>
                            </div>
                            <div className="flex gap-2 shrink-0">
                               <a
                                href={`https://docs.google.com/spreadsheets/d/${file.id}`}
                                target="_blank"
                                rel="noreferrer"
                                className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 px-2.5 py-1.5 rounded-md transition flex items-center gap-1 active:scale-95 font-bold text-[10px]"
                               >
                                View Sheet
                               </a>
                               {onRestoreData && (
                                <button
                                  type="button"
                                  onClick={() => handleRestoreFromSheet(file.id, file.name)}
                                  disabled={isRestoring}
                                  className="bg-neutral-900 hover:bg-black text-white px-2.5 py-1.5 rounded-md transition flex items-center gap-1 active:scale-95 font-bold text-[10px] disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {isRestoring ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                                  Central Restore (Import All Data)
                                </button>
                               )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* REAL-TIME PROCESS LOGS */}
              {logs.length > 0 && (
                <div className="border border-gray-150 rounded-xl overflow-hidden bg-white text-left">
                  <div className="bg-gray-50 px-4 py-2 border-b border-gray-150 flex items-center justify-between select-none">
                    <span className="text-[10px] font-extrabold text-gray-500 uppercase tracking-widest font-mono">Transmission Process Logs</span>
                    <span className="text-[8px] font-mono text-gray-400">Step telemetry logs</span>
                  </div>
                  <div className="p-3 md:p-4 font-mono text-[10px] space-y-1.5 max-h-[140px] overflow-y-auto bg-gray-55/40 text-gray-700">
                    {logs.map((log, idx) => (
                      <div key={idx} className="flex gap-2 items-start leading-normal">
                        {log.status === 'active' && <span className="text-amber-500 font-bold">➜ [BUSY]</span>}
                        {log.status === 'success' && <span className="text-emerald-600 font-bold">✔ [DONE]</span>}
                        {log.status === 'error' && <span className="text-red-600 font-bold">✘ [FAIL]</span>}
                        <span className="text-gray-650">{log.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* SYSTEM DISCONNECT LOGOUT ROW */}
              <div className="pt-2 border-t border-gray-150 flex justify-between items-center select-none">
                <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
                  <HelpCircle className="w-3.5 h-3.5" />
                  <span>Need help? Spreadsheet saves to the top folder.</span>
                </div>
                <button
                  type="button"
                  onClick={handleDisconnect}
                  className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-red-650 font-bold transition cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Disconnect Account</span>
                </button>
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  );
}
