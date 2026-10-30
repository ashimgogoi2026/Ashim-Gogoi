import React, { useState, useMemo, useRef, useEffect } from 'react';
import Papa from 'papaparse';
import { AlertCircle, AlertTriangle, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, BarChart3, TrendingUp, Package, Plus, Pencil, Check, X, Trash2, Download, FileSpreadsheet, Cloud, ExternalLink, Archive, ArchiveRestore, Percent, Save, RefreshCw, CloudUpload, PieChart, CheckSquare, Square, Eye, Moon, Filter, Calendar, Search, RotateCcw, SlidersHorizontal } from 'lucide-react';
import * as XLSX from 'xlsx';
import { auth, ensureGoogleAccessToken } from '../lib/firebaseAuth';
import { globalToast } from '../lib/toast';
import { safeLocalStorage } from '../lib/safeLocalStorage';
import { offlineStore } from '../lib/offlineStore';
import { updateDocBatchInDb } from '../lib/firestoreService';
import { useTheme, EyeComfortTheme, ThemeStyles } from '../context/ThemeContext';
import SalesSummaryModal from './SalesSummaryModal';

export type { EyeComfortTheme, ThemeStyles };

interface SalesRow {
  id: string;
  year: string;
  month: string;
  week: string;
  zone: string;
  state: string;
  district: string;
  productName: string;
  skuName: string;
  quantity: number;
  grossSales: number;
  netRevenue: number;
  manualEntryDate?: string;
  [key: string]: any; // Catch-all for original row data
}

export default function SalesDashboard({ 
  dashboardProducts = [], 
  savedProducts = [],
  data: dataProp = [],
  setData: setDataProp,
  fileName: fileNameProp = null,
  setFileName: setFileNameProp,
  onNavigate,
  accessToken,
  selectedMonth: selectedMonthProp,
  setSelectedMonth: setSelectedMonthProp,
  selectedYear: selectedYearProp,
  setSelectedYear: setSelectedYearProp,
  selectedWeek: selectedWeekProp,
  setSelectedWeek: setSelectedWeekProp
}: { 
  dashboardProducts?: any[]; 
  savedProducts?: string[]; 
  data?: SalesRow[];
  setData?: React.Dispatch<React.SetStateAction<SalesRow[]>>;
  fileName?: string | null;
  setFileName?: React.Dispatch<React.SetStateAction<string | null>>;
  onNavigate?: (tab: string) => void;
  accessToken?: string | null;
  selectedMonth?: string;
  setSelectedMonth?: (m: string) => void;
  selectedYear?: string;
  setSelectedYear?: (y: string) => void;
  selectedWeek?: string;
  setSelectedWeek?: (w: string) => void;
}) {
  const [localData, setLocalData] = useState<SalesRow[]>(dataProp);
  const [localFileName, setLocalFileName] = useState<string | null>(fileNameProp);

  const data = setDataProp ? dataProp : localData;
  const setData = setDataProp || setLocalData;

  const fileName = setFileNameProp ? fileNameProp : localFileName;
  const setFileName = setFileNameProp || setLocalFileName;

  const { theme: eyeTheme, setTheme: handleSelectTheme, themeStyles } = useTheme();
  
  const [masterData, setMasterData] = useState<SalesRow[]>(() => {
    try {
      const safeStored = safeLocalStorage.getItem('SALES_MASTER_RECORDS');
      if (safeStored) {
        const parsed = JSON.parse(safeStored);
        if (Array.isArray(parsed)) return parsed;
      }
      if (typeof window !== 'undefined' && window.localStorage) {
        const stored = localStorage.getItem('SALES_MASTER_RECORDS');
        if (stored) {
          const parsed = JSON.parse(stored);
          try {
            localStorage.removeItem('SALES_MASTER_RECORDS');
          } catch (_) {}
          if (Array.isArray(parsed)) return parsed;
        }
      }
      return [];
    } catch {
      return [];
    }
  });
  const [viewingMaster, setViewingMaster] = useState(false);

  // Asynchronously hydrate masterData from IndexedDB (offlineStore)
  useEffect(() => {
    let isMounted = true;
    offlineStore.getItem<SalesRow[]>('SALES_MASTER_RECORDS').then(idbData => {
      if (!isMounted) return;
      if (idbData && Array.isArray(idbData) && idbData.length > 0) {
        setMasterData(prev => prev.length === 0 ? idbData : prev);
      }
    }).catch(err => console.warn('Could not load masterData from IndexedDB:', err));

    // Ensure raw localStorage does not hold bulky SALES_MASTER_RECORDS to prevent QuotaExceededError
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.removeItem('SALES_MASTER_RECORDS');
      }
    } catch (_) {}

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    try {
      offlineStore.setItem('SALES_MASTER_RECORDS', masterData);
      safeLocalStorage.setItem('SALES_MASTER_RECORDS', JSON.stringify(masterData));
    } catch (err) {
      console.warn('Failed to save masterData to offlineStore/safeLocalStorage:', err);
    }
    // Clean up from localStorage to guarantee no quota issues
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.removeItem('SALES_MASTER_RECORDS');
      }
    } catch (_) {}
  }, [masterData]);

  useEffect(() => {
    setEditingRowId(null);
    setEditRowData({});
    setAdjustingRowId(null);
  }, [viewingMaster]);

  const handleSendToMaster = (row: SalesRow) => {
    setData(prev => prev.filter(r => r.id !== row.id));
    setMasterData(prev => [row, ...prev]);
  };

  const handleRevertFromMaster = (row: SalesRow) => {
    // Track 100% revert on the 2nd sheet
    setMasterData(prev => prev.map(r => 
      r.id === row.id 
        ? { ...r, revertHistory: [...(r.revertHistory || []), 100] }
        : r
    ));
    setData(prev => [{ ...row, id: crypto.randomUUID() }, ...prev]);
  };

  const handleRevert50Percent = (row: SalesRow) => {
    const pct = 50;
    const multiplier = 0.5;
    const adjustedRow: SalesRow = {
      ...row,
      id: crypto.randomUUID(),
      originalQuantity: row.originalQuantity !== undefined ? row.originalQuantity : row.quantity,
      originalNetRevenue: row.originalNetRevenue !== undefined ? row.originalNetRevenue : (row.netRevenue || row.grossSales),
      originalGrossSales: row.originalGrossSales !== undefined ? row.originalGrossSales : row.grossSales,
      quantity: Math.round(row.quantity * multiplier),
      netRevenue: Number(((row.netRevenue || row.grossSales) * multiplier).toFixed(2)),
      grossSales: Number((row.grossSales * multiplier).toFixed(2)),
      adjustmentPercentage: pct
    };
    
    // Track 50% revert on the 2nd sheet
    setMasterData(prev => prev.map(r => 
      r.id === row.id 
        ? { ...r, revertHistory: [...(r.revertHistory || []), pct] }
        : r
    ));

    setData(prev => [adjustedRow, ...prev]);
    globalToast.success(`Reverted 50% of ${row.productName || 'item'} to Main Sheet`);
  };

  const handleDeleteMasterRow = (id: string) => {
    if (confirm('Are you sure you want to permanently delete this 2nd sheet?')) {
      setMasterData(prev => prev.filter(r => r.id !== id));
    }
  };

  
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const performSecureSave = React.useCallback(async () => {
    setIsSaving(true);
    try {
      safeLocalStorage.setItem('SALES_DASHBOARD_SECURE_BACKUP', JSON.stringify({ data, masterData }));
      
      if (auth.currentUser) {
        const batchUpdates = data.map(t => ({
          id: t.id,
          data: { ...t, ownerId: auth.currentUser!.uid }
        }));
        await updateDocBatchInDb('sales', batchUpdates).catch(err => console.warn('Bulk sync skipped:', err));
        
        const masterBatch = masterData.map(t => ({
          id: t.id,
          data: { ...t, ownerId: auth.currentUser!.uid, isMaster: true }
        }));
        await updateDocBatchInDb('sales_master', masterBatch).catch(err => console.warn('Bulk master sync skipped:', err));
      }
      
      window.dispatchEvent(new CustomEvent('TRIGGER_CENTRAL_REFRESH'));
      
      setLastSaved(new Date());
    } catch (e) {
      console.error("Auto-save failed", e);
    } finally {
      setIsSaving(false);
    }
  }, [data, masterData]);

  const [isLoading, setIsLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const dataRows = results.data as any[];
        let addedCount = 0;
        
        const getVal = (row: any, keys: string[]) => {
          const lowerKeys = keys.map(k => k.toLowerCase());
          for (const key of Object.keys(row)) {
              if (lowerKeys.includes(key.toLowerCase())) {
                  return row[key];
              }
          }
          return '';
        };

        const parseSafeFloat = (val: any) => {
          if (!val) return 0;
          const clean = String(val).replace(/,/g, '');
          const num = parseFloat(clean);
          return isNaN(num) ? 0 : num;
        };

        const newRows = dataRows.map(row => {
          addedCount++;
          const dateVal = getVal(row, ['date', 'Date', 'entryDate', 'manualEntryDate', 'created_at', 'timestamp', 'order_date', 'orderDate', 'Order Date', 'Date & Time']);
          return {
            id: row.id || `sales-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            year: getVal(row, ['year']),
            month: getVal(row, ['month']),
            week: getVal(row, ['week']),
            date: dateVal,
            manualEntryDate: dateVal || getVal(row, ['manualEntryDate']) || '',
            zone: getVal(row, ['zone']),
            state: getVal(row, ['state', 'location']),
            district: getVal(row, ['district']),
            productName: getVal(row, ['productName', 'Product Name', 'Product', 'Item']),
            skuName: getVal(row, ['skuName', 'SKU', 'SKU Name']),
            quantity: parseInt(String(parseSafeFloat(getVal(row, ['quantity', 'qty']))), 10) || 0,
            grossSales: parseSafeFloat(getVal(row, ['grossSales', 'Gross Sales', 'Gross'])),
            netRevenue: parseSafeFloat(getVal(row, ['netRevenue', 'Net Revenue', 'Net', 'Sales']))
          };
        });

        if (newRows.length > 0) {
          setData(prev => [...prev, ...newRows]);
        }

        setFileName(file.name);
        if (fileInputRef.current) fileInputRef.current.value = '';
        setIsLoading(false);
        alert(`Successfully imported ${addedCount} sales records from CSV!`);
      },
      error: (error: any) => {
        console.error("Error parsing CSV:", error);
        setError("Failed to parse CSV file.");
        setIsLoading(false);
      }
    });
  };

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 15;

  // Sorting
  const [sortConfig, setSortConfig] = useState<{ key: keyof SalesRow | ''; direction: 'asc' | 'desc' }>({ key: '', direction: 'asc' });

  // Editing
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editRowData, setEditRowData] = useState<Partial<SalesRow>>({});

  const [adjustingRowId, setAdjustingRowId] = useState<string | null>(null);
  const [adjustPercentage, setAdjustPercentage] = useState<number>(100);

  const handleStartAdjust = (row: SalesRow) => {
    setAdjustingRowId(row.id);
    setAdjustPercentage(100);
  };

  const handleAdjustAndRevert = (row: SalesRow) => {
    const multiplier = adjustPercentage / 100;
    const adjustedRow = {
      ...row,
      id: crypto.randomUUID(),
      originalQuantity: row.originalQuantity !== undefined ? row.originalQuantity : row.quantity,
      originalNetRevenue: row.originalNetRevenue !== undefined ? row.originalNetRevenue : (row.netRevenue || row.grossSales),
      originalGrossSales: row.originalGrossSales !== undefined ? row.originalGrossSales : row.grossSales,
      quantity: Math.round(row.quantity * multiplier),
      netRevenue: Number((row.netRevenue * multiplier).toFixed(2)),
      grossSales: Number((row.grossSales * multiplier).toFixed(2)),
      adjustmentPercentage: adjustPercentage
    };
    
    // Update the 2nd sheet to track its revert history
    setMasterData(prev => prev.map(r => 
      r.id === row.id 
        ? { ...r, revertHistory: [...(r.revertHistory || []), adjustPercentage] }
        : r
    ));

    setData(prev => [adjustedRow, ...prev]);
    setAdjustingRowId(null);
  };


  // Extract to Google Sheets
  const [isExtractingSheets, setIsExtractingSheets] = useState(false);
  const [extractionMessage, setExtractionMessage] = useState<{ type: 'success' | 'error'; text: string; url?: string } | null>(null);
  const [isDriveSyncing, setIsDriveSyncing] = useState(false);

  const handleUploadToDrive = async () => {
    setIsDriveSyncing(true);
    try {
      let activeToken = accessToken;
      if (!activeToken) {
        globalToast.info('Connecting to Google Drive...');
        activeToken = await ensureGoogleAccessToken(accessToken);
      }
      if (!activeToken) {
        throw new Error('Google Drive authentication is required.');
      }

      globalToast.info('Uploading Sales data to Google Drive...');
      
      const fileData = {
        type: 'SalesDashboardData',
        version: '1.0',
        timestamp: new Date().toISOString(),
        data: data,
        masterData: masterData
      };

      const query = encodeURIComponent("name = 'sales-dashboard-data.json' and trashed = false");
      const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)`;
      
      const searchRes = await fetch(url, {
        headers: { 'Authorization': `Bearer ${activeToken}` },
      });
      
      const searchData = await searchRes.json();
      let fileId = searchData.files && searchData.files.length > 0 ? searchData.files[0].id : null;

      const fileContent = JSON.stringify(fileData);
      const metadata = {
        name: 'sales-dashboard-data.json',
        mimeType: 'application/json'
      };

      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      form.append('file', new Blob([fileContent], { type: 'application/json' }));

      let uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
      let method = 'POST';

      if (fileId) {
        uploadUrl = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`;
        method = 'PATCH';
      }

      const uploadRes = await fetch(uploadUrl, {
        method,
        headers: {
          'Authorization': `Bearer ${activeToken}`
        },
        body: form
      });

      if (!uploadRes.ok) {
        throw new Error('Upload failed.');
      }

      globalToast.success('Successfully uploaded Sales data to Google Drive.');
    } catch (err: any) {
      console.error(err);
      globalToast.error(`Upload failed: ${err.message}`);
    } finally {
      setIsDriveSyncing(false);
    }
  };

  const handleSyncFromDrive = async () => {
    setIsDriveSyncing(true);
    try {
      let activeToken = accessToken;
      if (!activeToken) {
        globalToast.info('Connecting to Google Drive...');
        activeToken = await ensureGoogleAccessToken(accessToken);
      }
      if (!activeToken) {
        throw new Error('Google Drive authentication is required.');
      }

      globalToast.info('Syncing Sales data from Google Drive...');
      const query = encodeURIComponent("name = 'sales-dashboard-data.json' and trashed = false");
      const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)`;
      
      const searchRes = await fetch(url, {
        headers: { 'Authorization': `Bearer ${activeToken}` },
      });
      
      const searchData = await searchRes.json();
      const fileId = searchData.files && searchData.files.length > 0 ? searchData.files[0].id : null;

      if (!fileId) {
        globalToast.error('No synced Sales data found in Google Drive.');
        setIsDriveSyncing(false);
        return;
      }

      const downloadRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: { 'Authorization': `Bearer ${activeToken}` }
      });

      if (!downloadRes.ok) throw new Error('Failed to download file.');

      const fileData = await downloadRes.json();
      if (fileData.type !== 'SalesDashboardData') {
        throw new Error('Invalid file format.');
      }

      if (Array.isArray(fileData.data)) {
         setData(fileData.data);
      }
      if (Array.isArray(fileData.masterData)) {
         setMasterData(fileData.masterData);
      }
      
      globalToast.success(`Successfully synchronized Sales data from Google Drive.`);
    } catch (err: any) {
      console.error(err);
      globalToast.error(`Sync failed: ${err.message}`);
    } finally {
      setIsDriveSyncing(false);
    }
  };


  const handleExtractToGoogleSheets = async () => {
    if (!accessToken) {
      alert("Please sign in with Google first using the 'Central Sheets Backup' tab to enable Google Sheet extraction!");
      return;
    }

    setIsExtractingSheets(true);
    setExtractionMessage(null);

    try {
      const createSpreadsheetResponse = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          properties: {
            title: `Sales Dashboard Data - ${new Date().toISOString().split('T')[0]}`
          }
        })
      });

      if (!createSpreadsheetResponse.ok) {
        const errorText = await createSpreadsheetResponse.text();
        throw new Error(`Failed to create spreadsheet: ${createSpreadsheetResponse.statusText}. Details: ${errorText}`);
      }

      const spreadsheet = await createSpreadsheetResponse.json();
      const spreadsheetId = spreadsheet.spreadsheetId;
      const spreadsheetUrl = spreadsheet.spreadsheetUrl;
      const firstSheetName = spreadsheet.sheets && spreadsheet.sheets.length > 0 
        ? spreadsheet.sheets[0].properties.title 
        : 'Sheet1';

      // Prepare headers and rows
      const sheetData = [
        ['ID', 'Year', 'Month', 'Week', 'Platform', 'Product Name', 'Quantity', 'Gross Sales', 'Net Revenue'],
        ...filteredData.map(r => [
          r.id || '',
          r.year || '',
          r.month || '',
          r.week || '',
          r.state || '',
          r.productName || '',
          (r.quantity || 0).toString(),
          (r.grossSales || 0).toString(),
          (r.netRevenue || 0).toString()
        ])
      ];

      const writeResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          valueInputOption: 'USER_ENTERED',
          data: [
            {
              range: `'${firstSheetName}'!A1`,
              majorDimension: 'ROWS',
              values: sheetData
            }
          ]
        })
      });

      if (!writeResponse.ok) {
        const errorText = await writeResponse.text();
        throw new Error(`Failed to write values: ${writeResponse.statusText}. Details: ${errorText}`);
      }

      setExtractionMessage({
        type: 'success',
        text: 'Successfully extracted to Google Sheets!',
        url: spreadsheetUrl
      });
    } catch (err: any) {
      console.error(err);
      alert(`Extraction error: ${err.message || err}`);
      setExtractionMessage({
        type: 'error',
        text: `Extraction error: ${err.message || err}`
      });
    } finally {
      setIsExtractingSheets(false);
    }
  };

  // Manual Entry
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualEntry, setManualEntry] = useState({
    date: new Date().toISOString().split('T')[0],
    state: '',
    year: new Date().getFullYear().toString(),
    month: String(new Date().getMonth() + 1).padStart(2, '0'),
    week: '1',
    productName: '',
    quantity: '',
    netRevenue: '',
    percentage: 100
  });

  // Sales Summary Modal State
  const [showSalesSummaryModal, setShowSalesSummaryModal] = useState(false);

  // Clear Data Modal State
  const [showClearModal, setShowClearModal] = useState(false);
  const [clearDateMode, setClearDateMode] = useState<'single' | 'multiple' | 'all'>('single');
  const [clearSingleDate, setClearSingleDate] = useState<string>('');
  const [clearMultiType, setClearMultiType] = useState<'range' | 'specific'>('range');
  const [clearStartDate, setClearStartDate] = useState<string>('');
  const [clearEndDate, setClearEndDate] = useState<string>('');
  const [clearSelectedDates, setClearSelectedDates] = useState<string[]>([]);
  const [clearStep, setClearStep] = useState<'select' | 'confirm'>('select');

  // Close modals with Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showSalesSummaryModal) {
          setShowSalesSummaryModal(false);
        }
        if (showClearModal) {
          setShowClearModal(false);
          setClearStep('select');
        }
        if (showManualForm) {
          setShowManualForm(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showSalesSummaryModal, showClearModal, showManualForm]);

  const allAppProducts = useMemo(() => {
    const set = new Set<string>();
    dashboardProducts.filter(p => p.name !== 'CENTRAL_BUDGET').forEach(p => {
      if (p && p.name) set.add(p.name);
    });
    savedProducts.filter(p => p !== 'CENTRAL_BUDGET').forEach(p => {
      if (p) set.add(p);
    });
    return Array.from(set).sort();
  }, [dashboardProducts, savedProducts]);

  const handleEditClick = (row: SalesRow) => {
    setEditingRowId(row.id);
    setEditRowData(row);
  };

  const handleSaveEdit = () => {
    if (!editingRowId) return;
    setData(prev => prev.map(r => r.id === editingRowId ? { ...r, ...editRowData } as SalesRow : r));
    setEditingRowId(null);
    setEditRowData({});
  };

  const handleCancelEdit = () => {
    setEditingRowId(null);
    setEditRowData({});
  };

  const handleDeleteRow = (id: string) => {
    if (confirm('Are you sure you want to delete this record?')) {
      setData(prev => prev.filter(r => r.id !== id));
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualEntry.productName) {
      setError("Product Name is required for manual entry.");
      return;
    }
    
    const multiplier = manualEntry.percentage / 100;
    const finalQuantity = Math.round((Number(manualEntry.quantity) || 0) * multiplier);
    const finalRevenue = Number(((Number(manualEntry.netRevenue) || 0) * multiplier).toFixed(2));

    const newRow: SalesRow = {
      id: crypto.randomUUID(),
      year: manualEntry.year,
      month: manualEntry.month,
      week: manualEntry.week,
      date: manualEntry.date,
      zone: 'Manual Entry',
      state: manualEntry.state,
      district: 'Manual Entry',
      productName: manualEntry.productName,
      skuName: '',
      quantity: finalQuantity,
      originalQuantity: Number(manualEntry.quantity) || 0,
      grossSales: finalRevenue,
      originalGrossSales: Number(manualEntry.netRevenue) || 0,
      netRevenue: finalRevenue,
      originalNetRevenue: Number(manualEntry.netRevenue) || 0,
      adjustmentPercentage: manualEntry.percentage !== 100 ? manualEntry.percentage : undefined,
      manualEntryDate: manualEntry.date
        ? `${manualEntry.date.split('-').reverse().join('/')}, ${new Date().toLocaleTimeString('en-GB')}`
        : new Date().toLocaleString('en-GB'),
    };

    setData(prev => [newRow, ...prev]);
    setShowManualForm(false);
    setError(null);
    setManualEntry({
      ...manualEntry,
      quantity: '',
      netRevenue: '',
      percentage: 100
    });
  };

  // Month, Year, Week, Date Filter State
  const [internalMonth, setInternalMonth] = useState<string>('ALL');
  const [internalYear, setInternalYear] = useState<string>('ALL');
  const [internalWeek, setInternalWeek] = useState<string>('ALL');

  const filterMonth = selectedMonthProp !== undefined ? selectedMonthProp : internalMonth;
  const setFilterMonth = setSelectedMonthProp || setInternalMonth;

  const filterYear = selectedYearProp !== undefined ? selectedYearProp : internalYear;
  const setFilterYear = setSelectedYearProp || setInternalYear;

  const filterWeek = selectedWeekProp !== undefined ? selectedWeekProp : internalWeek;
  const setFilterWeek = setSelectedWeekProp || setInternalWeek;

  // Specific Date and Date Range Filter State
  const [filterDate, setFilterDate] = useState<string>('');
  const [filterEndDate, setFilterEndDate] = useState<string>('');
  const [dateFilterMode, setDateFilterMode] = useState<'single' | 'range'>('single');

  const [selectedProduct, setSelectedProduct] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Reset pagination whenever filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filterMonth, filterYear, filterWeek, filterDate, filterEndDate, selectedProduct, searchQuery, viewingMaster]);

  const MONTH_OPTIONS = [
    { value: 'ALL', label: 'All Months' },
    { value: '01', label: '01 - January' },
    { value: '02', label: '02 - February' },
    { value: '03', label: '03 - March' },
    { value: '04', label: '04 - April' },
    { value: '05', label: '05 - May' },
    { value: '06', label: '06 - June' },
    { value: '07', label: '07 - July' },
    { value: '08', label: '08 - August' },
    { value: '09', label: '09 - September' },
    { value: '10', label: '10 - October' },
    { value: '11', label: '11 - November' },
    { value: '12', label: '12 - December' },
  ];

  const WEEK_OPTIONS = [
    { value: 'ALL', label: 'All Weeks' },
    { value: '1', label: 'Week 1 (Days 1–7)' },
    { value: '2', label: 'Week 2 (Days 8–14)' },
    { value: '3', label: 'Week 3 (Days 15–21)' },
    { value: '4', label: 'Week 4 (Days 22–28)' },
    { value: '5', label: 'Week 5 (Days 29–31)' },
    { value: '1-2', label: '1st & 2nd week (Days 1–14)' },
    { value: '1-3', label: '1st, 2nd, 3rd week (Days 1–21)' },
    { value: '1-4', label: '1st, 2nd, 3rd, 4th week (Days 1–28)' },
  ];

  const MONTH_NAME_MAP: Record<string, string> = {
    jan: '01', january: '01',
    feb: '02', february: '02',
    mar: '03', march: '03',
    apr: '04', april: '04',
    may: '05',
    jun: '06', june: '06',
    jul: '07', july: '07',
    aug: '08', august: '08',
    sep: '09', sept: '09', september: '09',
    oct: '10', october: '10',
    nov: '11', november: '11',
    dec: '12', december: '12'
  };

  const normalizeYear = (val: any): string => {
    if (!val) return '';
    const str = String(val).trim();
    const match = str.match(/\b(20\d\d)\b/);
    if (match) return match[1];
    if (/^\d{2}$/.test(str)) return `20${str}`;
    return str;
  };

  const normalizeMonth = (val: any): string => {
    if (!val) return '';
    const str = String(val).trim().toLowerCase();
    if (!str) return '';
    const num = parseInt(str, 10);
    if (!isNaN(num) && num >= 1 && num <= 12) {
      return num.toString().padStart(2, '0');
    }
    for (const [prefix, mStr] of Object.entries(MONTH_NAME_MAP)) {
      if (str.startsWith(prefix)) return mStr;
    }
    return '';
  };

  const normalizeWeek = (val: any): string => {
    if (!val) return '';
    const str = String(val).trim().toLowerCase();
    if (!str) return '';
    const match = str.match(/\d+/);
    if (match) return match[0];
    return str;
  };

  // Robust date parser from any sales row into YYYY-MM-DD format
  const extractRowDateToYMD = (row: SalesRow): string | null => {
    const raw = row.manualEntryDate || row.date || row.Date || row['Date & Time'] || row.orderDate || row['Order Date'] || row.timestamp || '';
    if (raw) {
      const str = String(raw).trim();
      // 1. ISO format: YYYY-MM-DD or YYYY/MM/DD
      const isoMatch = str.match(/\b(20\d\d)[/-](\d{1,2})[/-](\d{1,2})\b/);
      if (isoMatch) {
        return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
      }

      // 2. DD/MM/YYYY or DD-MM-YYYY (e.g. UK / Indian locale format 24/09/2026)
      const dmyMatch = str.match(/\b(\d{1,2})[/-](\d{1,2})[/-](20\d\d)\b/);
      if (dmyMatch) {
        return `${dmyMatch[3]}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[1].padStart(2, '0')}`;
      }

      // 3. Fallback to standard JS date parsing
      const parsed = new Date(str);
      if (!isNaN(parsed.getTime()) && parsed.getFullYear() >= 2000 && parsed.getFullYear() <= 2099) {
        const y = parsed.getFullYear().toString();
        const m = (parsed.getMonth() + 1).toString().padStart(2, '0');
        const d = parsed.getDate().toString().padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
    }

    // 4. Fallback if day is provided alongside row.year and row.month
    const y = normalizeYear(row.year);
    const m = normalizeMonth(row.month);
    const day = row.day || row.Day;
    if (y && m && day) {
      const dNum = parseInt(String(day), 10);
      if (!isNaN(dNum) && dNum >= 1 && dNum <= 31) {
        return `${y}-${m}-${dNum.toString().padStart(2, '0')}`;
      }
    }

    return null;
  };

  const formatDateDisplay = (dateStr: string): string => {
    if (!dateStr) return '';
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        const d = parseInt(parts[2], 10);
        const dObj = new Date(y, m, d);
        if (!isNaN(dObj.getTime())) {
          return dObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        }
      }
    } catch {
      // fallback
    }
    return dateStr;
  };

  const isRowMatchingDateFilters = (
    row: SalesRow,
    targetMonth: string,
    targetYear: string,
    targetWeek: string,
    targetDate: string,
    targetEndDate: string
  ): boolean => {
    // 0. Date Selection check (Specific Date or Date Range)
    if (targetDate) {
      const rowYMD = extractRowDateToYMD(row);
      if (rowYMD) {
        if (targetEndDate) {
          const start = targetDate <= targetEndDate ? targetDate : targetEndDate;
          const end = targetDate <= targetEndDate ? targetEndDate : targetDate;
          if (rowYMD < start || rowYMD > end) return false;
        } else {
          if (rowYMD !== targetDate) return false;
        }
      } else {
        // If row doesn't have an exact day date recorded:
        const [tYear, tMonth, tDay] = targetDate.split('-');
        const tWeek = tDay ? Math.ceil(parseInt(tDay, 10) / 7).toString() : '';

        if (targetEndDate) {
          const start = targetDate <= targetEndDate ? targetDate : targetEndDate;
          const end = targetDate <= targetEndDate ? targetEndDate : targetDate;
          const rowY = normalizeYear(row.year);
          const rowM = normalizeMonth(row.month);
          if (rowY && rowM) {
            const rowYM = `${rowY}-${rowM}`;
            const startYM = start.slice(0, 7);
            const endYM = end.slice(0, 7);
            if (rowYM < startYM || rowYM > endYM) return false;
          } else {
            return false;
          }
        } else {
          const rowY = normalizeYear(row.year);
          const rowM = normalizeMonth(row.month);
          const rowW = normalizeWeek(row.week);

          if (rowY && rowY !== tYear) return false;
          if (rowM && rowM !== tMonth) return false;
          if (rowW && tWeek && rowW !== tWeek) return false;
          if (!rowY && !rowM) return false;
        }
      }
    }

    if (targetMonth === 'ALL' && targetYear === 'ALL' && targetWeek === 'ALL') {
      return true;
    }

    let fallbackYear = '';
    let fallbackMonth = '';
    let fallbackWeek = '';

    const rowYMD = extractRowDateToYMD(row);
    if (rowYMD) {
      const parts = rowYMD.split('-');
      fallbackYear = parts[0];
      fallbackMonth = parts[1];
      const dNum = parseInt(parts[2], 10);
      if (!isNaN(dNum) && dNum > 0) fallbackWeek = Math.ceil(dNum / 7).toString();
    }

    // 1. Year check
    if (targetYear !== 'ALL') {
      const rowYear = normalizeYear(row.year) || fallbackYear;
      if (rowYear && rowYear !== targetYear) return false;
      if (!rowYear) return false;
    }

    // 2. Month check
    if (targetMonth !== 'ALL') {
      const normTargetMonth = normalizeMonth(targetMonth);
      const rowMonth = normalizeMonth(row.month) || fallbackMonth;
      if (rowMonth && rowMonth !== normTargetMonth) return false;
      if (!rowMonth) return false;
    }

    // 3. Week check
    if (targetWeek !== 'ALL') {
      const rowWeek = normalizeWeek(row.week) || fallbackWeek;
      if (!rowWeek) return false;
      if (targetWeek === '1-2' || targetWeek === '1st & 2nd week') {
        if (rowWeek !== '1' && rowWeek !== '2') return false;
      } else if (targetWeek === '1-3' || targetWeek === '1st, 2nd, 3rd week') {
        if (rowWeek !== '1' && rowWeek !== '2' && rowWeek !== '3') return false;
      } else if (targetWeek === '1-4' || targetWeek === '1st, 2nd, 3rd, 4th week') {
        if (rowWeek !== '1' && rowWeek !== '2' && rowWeek !== '3' && rowWeek !== '4') return false;
      } else {
        const normTargetWeek = normalizeWeek(targetWeek);
        if (rowWeek !== normTargetWeek) return false;
      }
    }

    return true;
  };

  const baseData = viewingMaster ? masterData : data;

  const filteredData = useMemo(() => {
    return baseData.filter(row => {
      // 1. Date filter (Month, Year, Week, Date, Date Range)
      if (!isRowMatchingDateFilters(row, filterMonth, filterYear, filterWeek, filterDate, filterEndDate)) {
        return false;
      }

      // 2. Product filter
      if (selectedProduct !== 'ALL') {
        const prod = (row.productName || '').trim().toLowerCase();
        if (prod !== selectedProduct.trim().toLowerCase()) {
          return false;
        }
      }

      // 3. Search query
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const rowStr = `${row.productName || ''} ${row.skuName || ''} ${row.state || ''} ${row.district || ''} ${row.zone || ''} ${row.year || ''} ${row.month || ''} ${row.week || ''} ${row.manualEntryDate || ''} ${row.date || ''} ${row.id || ''}`.toLowerCase();
        if (!rowStr.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [baseData, filterMonth, filterYear, filterWeek, filterDate, filterEndDate, selectedProduct, searchQuery]);

  // List of unique entry dates present in current sheet (baseData), sorted latest to oldest
  const availableEntryDates = useMemo(() => {
    const map = new Map<string, number>();
    baseData.forEach(row => {
      const d = extractRowDateToYMD(row);
      if (d) {
        map.set(d, (map.get(d) || 0) + 1);
      }
    });
    return Array.from(map.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [baseData]);

  // Determine if a row matches the deletion criteria based on its entry date
  const isRowTargetedForDeletion = (row: SalesRow): boolean => {
    if (clearDateMode === 'all') {
      return true;
    }
    const rowYMD = extractRowDateToYMD(row);
    if (!rowYMD) return false;

    if (clearDateMode === 'single') {
      return Boolean(clearSingleDate && rowYMD === clearSingleDate);
    }

    if (clearDateMode === 'multiple') {
      if (clearMultiType === 'range') {
        if (!clearStartDate && !clearEndDate) return false;
        const start = clearStartDate || '0000-00-00';
        const end = clearEndDate || '9999-99-99';
        const minD = start <= end ? start : end;
        const maxD = start <= end ? end : start;
        return rowYMD >= minD && rowYMD <= maxD;
      } else {
        return clearSelectedDates.includes(rowYMD);
      }
    }

    return false;
  };

  const recordsToDelete = useMemo(() => {
    if (!showClearModal) return [];
    return baseData.filter(isRowTargetedForDeletion);
  }, [showClearModal, baseData, clearDateMode, clearSingleDate, clearMultiType, clearStartDate, clearEndDate, clearSelectedDates]);

  const handleExecuteClear = () => {
    const countToDelete = recordsToDelete.length;
    if (countToDelete === 0) return;

    if (clearDateMode === 'all') {
      if (viewingMaster) {
        setMasterData([]);
      } else {
        setData([]);
        setFileName(null);
      }
    } else {
      const targetIds = new Set(recordsToDelete.map(r => r.id));
      if (viewingMaster) {
        setMasterData(prev => prev.filter(r => !targetIds.has(r.id)));
      } else {
        setData(prev => {
          const remaining = prev.filter(r => !targetIds.has(r.id));
          if (remaining.length === 0) setFileName(null);
          return remaining;
        });
      }
    }

    globalToast.success(`Successfully deleted ${countToDelete} record(s) from ${viewingMaster ? '2nd Sheet' : 'Main Sheet'}!`);
    setShowClearModal(false);
    setClearStep('select');
  };

  const availableYears = useMemo(() => {
    const yearsSet = new Set<string>();
    const currentYear = new Date().getFullYear();
    yearsSet.add((currentYear - 2).toString());
    yearsSet.add((currentYear - 1).toString());
    yearsSet.add(currentYear.toString());
    yearsSet.add((currentYear + 1).toString());

    [...data, ...masterData].forEach(r => {
      const y = normalizeYear(r.year);
      if (y && y.length === 4) yearsSet.add(y);
      if (r.manualEntryDate) {
        const m = r.manualEntryDate.match(/\b(20\d\d)\b/);
        if (m) yearsSet.add(m[1]);
      }
    });

    return Array.from(yearsSet).sort((a, b) => b.localeCompare(a));
  }, [data, masterData]);

  const availableProducts = useMemo(() => {
    const set = new Set<string>();
    const sourceList = viewingMaster ? masterData : data;
    sourceList.forEach(r => {
      if (r.productName && r.productName.trim()) {
        set.add(r.productName.trim());
      }
    });
    allAppProducts.forEach(p => {
      if (p && p.trim()) set.add(p.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [data, masterData, viewingMaster, allAppProducts]);

  const resetFilters = () => {
    setFilterMonth('ALL');
    setFilterYear('ALL');
    setFilterWeek('ALL');
    setFilterDate('');
    setFilterEndDate('');
    setDateFilterMode('single');
    setSelectedProduct('ALL');
    setSearchQuery('');
  };

  const setFilterToCurrentPeriod = () => {
    const now = new Date();
    const curMonthStr = (now.getMonth() + 1).toString().padStart(2, '0');
    const curYearStr = now.getFullYear().toString();
    setFilterMonth(curMonthStr);
    setFilterYear(curYearStr);
    setFilterWeek('ALL');
    setFilterDate('');
    setFilterEndDate('');
  };

  const setFilterToToday = () => {
    const todayStr = new Date().toISOString().split('T')[0];
    setFilterDate(todayStr);
    setFilterEndDate('');
    setDateFilterMode('single');
    const now = new Date();
    const curMonthStr = (now.getMonth() + 1).toString().padStart(2, '0');
    const curYearStr = now.getFullYear().toString();
    const curDay = now.getDate();
    const curWeek = Math.ceil(curDay / 7).toString();
    setFilterYear(curYearStr);
    setFilterMonth(curMonthStr);
    setFilterWeek(curWeek);
  };

  const setFilterToYesterday = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const yestStr = d.toISOString().split('T')[0];
    setFilterDate(yestStr);
    setFilterEndDate('');
    setDateFilterMode('single');
    const curMonthStr = (d.getMonth() + 1).toString().padStart(2, '0');
    const curYearStr = d.getFullYear().toString();
    const curDay = d.getDate();
    const curWeek = Math.ceil(curDay / 7).toString();
    setFilterYear(curYearStr);
    setFilterMonth(curMonthStr);
    setFilterWeek(curWeek);
  };

  const hasActiveFilters = filterMonth !== 'ALL' || filterYear !== 'ALL' || filterWeek !== 'ALL' || filterDate !== '' || filterEndDate !== '' || selectedProduct !== 'ALL' || searchQuery.trim() !== '';

  const sortedData = useMemo(() => {
    if (!sortConfig.key) return filteredData;
    return [...filteredData].sort((a, b) => {
      let aVal = a[sortConfig.key];
      let bVal = b[sortConfig.key];
      
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        const cmp = aVal.localeCompare(bVal, undefined, { numeric: true, sensitivity: 'base' });
        return sortConfig.direction === 'asc' ? cmp : -cmp;
      }
      
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredData, sortConfig]);

  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return sortedData.slice(start, start + rowsPerPage);
  }, [sortedData, currentPage]);

  const totalPages = Math.ceil(sortedData.length / rowsPerPage);

  const kpis = useMemo(() => {
    let totalQty = 0;
    let totalRev = 0;
    filteredData.forEach(d => {
      totalQty += d.quantity || 0;
      totalRev += d.netRevenue || 0;
    });
    return { totalQty, totalRev };
  }, [filteredData]);

  // Multi-Selection State & Handlers
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const headerCheckboxRef = useRef<HTMLInputElement>(null);

  // Clear selections when switching between Main Sheet and 2nd Sheet
  useEffect(() => {
    setSelectedRowIds(new Set());
  }, [viewingMaster]);

  const isAllSelected = filteredData.length > 0 && filteredData.every(r => selectedRowIds.has(r.id));
  const isSomeSelected = selectedRowIds.size > 0 && !isAllSelected;

  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = isSomeSelected;
    }
  }, [isSomeSelected]);

  const toggleSelectAll = () => {
    if (isAllSelected || selectedRowIds.size > 0) {
      setSelectedRowIds(new Set());
    } else {
      setSelectedRowIds(new Set(filteredData.map(r => r.id)));
    }
  };

  const handleSelectAllExplicit = () => {
    setSelectedRowIds(new Set(filteredData.map(r => r.id)));
  };

  const handleDeselectAll = () => {
    setSelectedRowIds(new Set());
  };

  const toggleRowSelection = (id: string) => {
    setSelectedRowIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Central 40% Adjustment: Applies 40% adjustment to all selected entries in Detailed Sales Report
  const handleCentral40Adjustment = () => {
    if (selectedRowIds.size === 0) {
      globalToast.error("Please select entries in the Detailed Sales Report first (or click 'Select All').");
      return;
    }

    const count = selectedRowIds.size;
    const multiplier = 0.4;
    setData(prev => prev.map(row => {
      if (!selectedRowIds.has(row.id)) return row;
      const origQty = row.originalQuantity !== undefined ? row.originalQuantity : row.quantity;
      const origNet = row.originalNetRevenue !== undefined ? row.originalNetRevenue : (row.netRevenue || row.grossSales);
      const origGross = row.originalGrossSales !== undefined ? row.originalGrossSales : row.grossSales;
      return {
        ...row,
        originalQuantity: origQty,
        originalNetRevenue: origNet,
        originalGrossSales: origGross,
        quantity: Math.round(origQty * multiplier),
        netRevenue: Number((origNet * multiplier).toFixed(2)),
        grossSales: Number((origGross * multiplier).toFixed(2)),
        adjustmentPercentage: 40
      };
    }));

    setSelectedRowIds(new Set());
    globalToast.success(`Adjusted ${count} selected ${count === 1 ? 'entry' : 'entries'} by 40%!`);
  };

  // Central Send to 2nd Sheet: Sends all selected entries from Detailed Sales Report to 2nd Sheet in one click
  const handleCentralSendTo2ndSheet = () => {
    if (selectedRowIds.size === 0) {
      globalToast.error("Please select entries in the Detailed Sales Report first (or click 'Select All').");
      return;
    }

    const count = selectedRowIds.size;
    const rowsToSend = data.filter(row => selectedRowIds.has(row.id));

    setData(prev => prev.filter(row => !selectedRowIds.has(row.id)));
    setMasterData(prev => [...rowsToSend, ...prev]);

    setSelectedRowIds(new Set());
    globalToast.success(`Sent ${count} selected ${count === 1 ? 'entry' : 'entries'} to 2nd Sheet!`);
  };

  // Central 50% Revert to Main Sheet: Reverts 50% of all selected entries on 2nd Sheet to Main Sheet in one click
  const handleCentral50RevertToMainSheet = () => {
    if (selectedRowIds.size === 0) {
      globalToast.error("Please select entries on the 2nd Sheet first (or click 'Select All').");
      return;
    }

    const count = selectedRowIds.size;
    const pct = 50;
    const multiplier = 0.5;
    const rowsToRevert = masterData.filter(row => selectedRowIds.has(row.id));

    const adjustedRows: SalesRow[] = rowsToRevert.map(row => {
      const origQty = row.originalQuantity !== undefined ? row.originalQuantity : row.quantity;
      const origNet = row.originalNetRevenue !== undefined ? row.originalNetRevenue : (row.netRevenue || row.grossSales);
      const origGross = row.originalGrossSales !== undefined ? row.originalGrossSales : row.grossSales;
      return {
        ...row,
        id: crypto.randomUUID(),
        originalQuantity: origQty,
        originalNetRevenue: origNet,
        originalGrossSales: origGross,
        quantity: Math.round(row.quantity * multiplier),
        netRevenue: Number(((row.netRevenue || row.grossSales) * multiplier).toFixed(2)),
        grossSales: Number((row.grossSales * multiplier).toFixed(2)),
        adjustmentPercentage: pct
      };
    });

    // Update 2nd sheet records revert history
    setMasterData(prev => prev.map(r => 
      selectedRowIds.has(r.id)
        ? { ...r, revertHistory: [...(r.revertHistory || []), pct] }
        : r
    ));

    setData(prev => [...adjustedRows, ...prev]);
    setSelectedRowIds(new Set());
    globalToast.success(`Successfully reverted 50% of ${count} selected ${count === 1 ? 'entry' : 'entries'} to Main Sheet!`);
  };

  // Central 100% Revert to Main Sheet: Reverts all selected entries on 2nd Sheet to Main Sheet
  const handleCentralRevert100Percent = () => {
    if (selectedRowIds.size === 0) {
      globalToast.error("Please select entries on the 2nd Sheet first (or click 'Select All').");
      return;
    }

    const count = selectedRowIds.size;
    const rowsToRevert = masterData.filter(row => selectedRowIds.has(row.id));
    const revertedRows = rowsToRevert.map(r => ({ ...r, id: crypto.randomUUID() }));

    setMasterData(prev => prev.map(r => 
      selectedRowIds.has(r.id)
        ? { ...r, revertHistory: [...(r.revertHistory || []), 100] }
        : r
    ));

    setData(prev => [...revertedRows, ...prev]);
    setSelectedRowIds(new Set());
    globalToast.success(`Successfully reverted 100% of ${count} selected ${count === 1 ? 'entry' : 'entries'} to Main Sheet!`);
  };

  const handleSort = (key: keyof SalesRow) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val);
  };

  const formatNumber = (val: number) => {
    return new Intl.NumberFormat('en-IN').format(val);
  };

  const handleExportExcel = () => {
    if (data.length === 0 && masterData.length === 0) {
      setError("No data to export.");
      return;
    }
    try {
      const allRecordsToExport = hasActiveFilters ? filteredData : (viewingMaster ? masterData : [...data, ...masterData]);
      const exportData = allRecordsToExport.map(r => ({
        'Sheet': data.some(d => d.id === r.id) ? 'Main Sheet' : '2nd Sheet',
        'Year': r.year,
        'Month': r.month,
        'Week': r.week,
        'Platform': r.state,
        'Product Name': r.productName,
        'Original Quantity': r.originalQuantity !== undefined ? r.originalQuantity : (r.adjustmentPercentage !== undefined ? Math.round(r.quantity / (r.adjustmentPercentage / 100)) : r.quantity),
        'Adjusted Quantity': r.quantity,
        'Original Net Revenue': r.originalNetRevenue !== undefined ? r.originalNetRevenue : (r.adjustmentPercentage !== undefined ? ((r.netRevenue || r.grossSales) / (r.adjustmentPercentage / 100)) : (r.netRevenue || r.grossSales)),
        'Adjusted Net Revenue': r.netRevenue || r.grossSales,
        'Adjustment %': r.adjustmentPercentage !== undefined ? r.adjustmentPercentage + '%' : '100%',
        'Revert History': r.revertHistory && r.revertHistory.length > 0 ? r.revertHistory.map((p: any) => p + '%').join(', ') : '',
        'Total Reverted Quantity': r.revertHistory && r.revertHistory.length > 0 ? r.revertHistory.reduce((acc: any, pct: any) => acc + Math.round(r.quantity * (pct / 100)), 0) : 0,
        'Total Reverted Net Revenue': r.revertHistory && r.revertHistory.length > 0 ? r.revertHistory.reduce((acc: any, pct: any) => acc + ((r.netRevenue || r.grossSales) * (pct / 100)), 0) : 0,
        'Manual Entry Date': r.manualEntryDate || ''
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Sales Data");
      XLSX.writeFile(wb, `Sales_Dashboard_Export_${new Date().toLocaleString('en-GB').replace(/[\/:]/g, '-').replace(', ', '_')}.xlsx`);
    } catch (err) {
      console.error("Export error:", err);
      setError("Failed to export Excel file.");
    }
  };

  const handleExportCSV = () => {
    if (data.length === 0 && masterData.length === 0) {
      setError("No data to export.");
      return;
    }
    try {
      const allRecordsToExport = hasActiveFilters ? filteredData : (viewingMaster ? masterData : [...data, ...masterData]);
      const exportData = allRecordsToExport.map(r => ({
        'Sheet': data.some(d => d.id === r.id) ? 'Main Sheet' : '2nd Sheet',
        'Year': r.year,
        'Month': r.month,
        'Week': r.week,
        'Platform': r.state,
        'Product Name': r.productName,
        'Original Quantity': r.originalQuantity !== undefined ? r.originalQuantity : (r.adjustmentPercentage !== undefined ? Math.round(r.quantity / (r.adjustmentPercentage / 100)) : r.quantity),
        'Adjusted Quantity': r.quantity,
        'Original Net Revenue': r.originalNetRevenue !== undefined ? r.originalNetRevenue : (r.adjustmentPercentage !== undefined ? ((r.netRevenue || r.grossSales) / (r.adjustmentPercentage / 100)) : (r.netRevenue || r.grossSales)),
        'Adjusted Net Revenue': r.netRevenue || r.grossSales,
        'Adjustment %': r.adjustmentPercentage !== undefined ? r.adjustmentPercentage + '%' : '100%',
        'Revert History': r.revertHistory && r.revertHistory.length > 0 ? r.revertHistory.map((p: any) => p + '%').join(', ') : '',
        'Total Reverted Quantity': r.revertHistory && r.revertHistory.length > 0 ? r.revertHistory.reduce((acc: any, pct: any) => acc + Math.round(r.quantity * (pct / 100)), 0) : 0,
        'Total Reverted Net Revenue': r.revertHistory && r.revertHistory.length > 0 ? r.revertHistory.reduce((acc: any, pct: any) => acc + ((r.netRevenue || r.grossSales) * (pct / 100)), 0) : 0,
        'Manual Entry Date': r.manualEntryDate || ''
      }));
      const csv = Papa.unparse(exportData);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `Sales_Dashboard_Export_${new Date().toLocaleString('en-GB').replace(/[\/:]/g, '-').replace(', ', '_')}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error("Export error:", err);
      setError("Failed to export CSV file.");
    }
  };

  return (
    <div className={`max-w-[1600px] mx-auto h-full flex flex-col gap-6 p-4 md:p-6 ${themeStyles.containerBg} transition-colors duration-200 min-h-[calc(100vh-4rem)]`}>
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col gap-6">
        {/* Header & Controls */}
        <div className={`flex flex-col gap-4 ${themeStyles.cardBg} p-5 rounded-2xl shadow-sm border ${themeStyles.cardBorder} transition-colors duration-200`}>
          {/* Top Row: Title & Status Badges */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className={`text-2xl font-black tracking-tight ${themeStyles.textHeading}`}>
                  E-Commerce Sales Dashboard
                </h1>
                <span className={`inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-black uppercase tracking-wider ${
                  viewingMaster 
                    ? 'bg-amber-100 text-amber-900 border border-amber-300' 
                    : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${viewingMaster ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} />
                  {viewingMaster ? '2nd Sheet Active' : 'Main Sheet Active'}
                </span>
                {lastSaved && (
                  <span className={`text-xs ${themeStyles.textMuted} font-mono hidden sm:inline-flex items-center gap-1 bg-black/5 dark:bg-white/5 px-2 py-0.5 rounded-md`}>
                    <Save className="w-3 h-3 text-emerald-600" />
                    Saved: {lastSaved.toLocaleTimeString()}
                  </span>
                )}
              </div>
              <p className={`text-xs sm:text-sm font-medium ${themeStyles.textMuted} mt-1`}>
                {data.length > 0 ? `${formatNumber(data.length)} records loaded` : 'Sales data viewer'}
                {fileName && <span className="font-semibold text-emerald-700 ml-1.5 font-mono">({fileName})</span>}
              </p>
            </div>
          </div>

          {/* Bottom Row: Unified Command Bar & Action Toolbar */}
          <div className={`pt-3.5 border-t ${themeStyles.cardBorder} flex flex-wrap items-center justify-between gap-3`}>
            {/* Left Cluster: Storage, Cloud & Data I/O */}
            <div className="flex flex-wrap items-center gap-2">
              <input 
                type="file" 
                accept=".csv" 
                ref={fileInputRef} 
                onChange={handleImportCSV} 
                className="hidden" 
                id="sales-dashboard-csv-upload" 
              />
              <label 
                htmlFor="sales-dashboard-csv-upload"
                className="bg-[#275f45] hover:bg-[#1e4d37] text-white px-3.5 py-2 rounded-xl font-bold text-xs sm:text-sm transition-all shadow-xs inline-flex items-center gap-1.5 cursor-pointer active:scale-95"
                title="Import CSV into dashboard"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-200" />
                <span>Import CSV</span>
              </label>

              <button 
                onClick={handleExportCSV}
                className="bg-[#2b4c6f] hover:bg-[#203b57] text-white px-3.5 py-2 rounded-xl font-bold text-xs sm:text-sm transition-all shadow-xs inline-flex items-center gap-1.5 cursor-pointer active:scale-95"
                title={viewingMaster ? "Download 2nd Sheet CSV" : "Download Sales CSV"}
              >
                <Download className="w-4 h-4 text-sky-200" />
                <span>Download CSV</span>
              </button>

              <button
                onClick={performSecureSave}
                disabled={isSaving}
                className="inline-flex items-center gap-1.5 bg-[#2d3e52] hover:bg-[#202d3c] text-white px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition shadow-xs cursor-pointer disabled:opacity-75 active:scale-95"
                title="Securely save dashboard data"
              >
                {isSaving ? <RefreshCw className="w-4 h-4 animate-spin text-amber-300" /> : <Save className="w-4 h-4 text-emerald-300" />} 
                <span>{isSaving ? 'Saving...' : 'Secure Save'}</span>
              </button>

              {/* Cloud Sync & Google Sheets Pill Group */}
              <div className={`inline-flex items-center gap-0.5 p-0.5 rounded-xl border ${themeStyles.cardBorder} ${themeStyles.subSurface}`}>
                <button
                  disabled={isDriveSyncing}
                  onClick={handleSyncFromDrive}
                  className={`flex items-center gap-1 ${isDriveSyncing ? 'bg-[#3f5773]/60 cursor-wait' : 'hover:bg-black/10 dark:hover:bg-white/10'} text-xs font-bold px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap cursor-pointer ${themeStyles.textHeading}`}
                  title="Sync Sales data from Google Drive"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-sky-500 ${isDriveSyncing ? 'animate-spin' : ''}`} />
                  <span>Sync</span>
                </button>

                <button
                  disabled={isDriveSyncing}
                  onClick={handleUploadToDrive}
                  className={`flex items-center gap-1 ${isDriveSyncing ? 'bg-[#3b597c]/60 cursor-wait' : 'hover:bg-black/10 dark:hover:bg-white/10'} text-xs font-bold px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap cursor-pointer ${themeStyles.textHeading}`}
                  title="Upload Sales data to Google Drive"
                >
                  <CloudUpload className="w-3.5 h-3.5 text-blue-500" />
                  <span>Upload Drive</span>
                </button>

                <button 
                  type="button"
                  onClick={handleExtractToGoogleSheets}
                  disabled={isExtractingSheets}
                  className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50 hover:bg-black/10 dark:hover:bg-white/10 ${themeStyles.textHeading}`}
                  title="Extract data to Google Sheets via Cloud Integration"
                  id="extract-google-sheets-btn"
                >
                  <Cloud className="w-3.5 h-3.5 text-teal-500" />
                  <span>{isExtractingSheets ? 'Extracting...' : 'Sheets Export'}</span>
                </button>
              </div>
            </div>

            {/* Right Cluster: Workflow Adjustments & Action Controls */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Central Action Buttons for Detailed Sales Report */}
              {!viewingMaster && data.length > 0 && (
                <>
                  <button 
                    type="button"
                    id="top-central-40-adjustment-btn"
                    onClick={handleCentral40Adjustment}
                    className={`px-3 py-2 rounded-xl font-bold text-xs sm:text-sm transition-all shadow-xs inline-flex items-center gap-1.5 cursor-pointer active:scale-95 ${
                      selectedRowIds.size > 0 
                        ? 'bg-[#c46823] hover:bg-[#ab581b] text-white ring-2 ring-[#e8a36e] ring-offset-1' 
                        : 'bg-[#edd5bd] hover:bg-[#e2c6a9] text-[#733c14] border border-[#d6b492]'
                    }`}
                    title="Make 40% adjustment to selected entries in Detailed Sales Report with one click"
                  >
                    <Percent className="w-3.5 h-3.5" />
                    <span>Central 40% Adj</span>
                    {selectedRowIds.size > 0 && (
                      <span className="bg-black/25 text-white text-[10px] px-1.5 py-0.2 rounded-full font-black">
                        {selectedRowIds.size}
                      </span>
                    )}
                  </button>

                  <button 
                    type="button"
                    id="top-central-send-to-2nd-sheet-btn"
                    onClick={handleCentralSendTo2ndSheet}
                    className={`px-3 py-2 rounded-xl font-bold text-xs sm:text-sm transition-all shadow-xs inline-flex items-center gap-1.5 cursor-pointer active:scale-95 ${
                      selectedRowIds.size > 0 
                        ? 'bg-[#554677] hover:bg-[#453662] text-white ring-2 ring-[#9987be] ring-offset-1' 
                        : 'bg-[#ded4ec] hover:bg-[#cec0e0] text-[#3e2c5d] border border-[#c4b3dc]'
                    }`}
                    title="Send selected Detailed Sales Report entries to 2nd Sheet with one click"
                  >
                    <Archive className="w-3.5 h-3.5" />
                    <span>Send to 2nd Sheet</span>
                    {selectedRowIds.size > 0 && (
                      <span className="bg-black/25 text-white text-[10px] px-1.5 py-0.2 rounded-full font-black">
                        {selectedRowIds.size}
                      </span>
                    )}
                  </button>
                </>
              )}

              {/* Central Action Buttons for 2nd Sheet */}
              {viewingMaster && masterData.length > 0 && (
                <>
                  <button 
                    type="button"
                    id="top-central-50-revert-btn"
                    onClick={handleCentral50RevertToMainSheet}
                    className={`px-3 py-2 rounded-xl font-bold text-xs sm:text-sm transition-all shadow-xs inline-flex items-center gap-1.5 cursor-pointer active:scale-95 ${
                      selectedRowIds.size > 0 
                        ? 'bg-[#37568a] hover:bg-[#2b4470] text-white ring-2 ring-[#7a9bd0] ring-offset-1' 
                        : 'bg-[#d0ddf2] hover:bg-[#bdceeb] text-[#1e345b] border border-[#a8bee0]'
                    }`}
                    title="Revert 50% of selected 2nd Sheet entries to Main Sheet with one click"
                  >
                    <PieChart className="w-3.5 h-3.5" />
                    <span>50% Revert</span>
                    {selectedRowIds.size > 0 && (
                      <span className="bg-black/25 text-white text-[10px] px-1.5 py-0.2 rounded-full font-black">
                        {selectedRowIds.size}
                      </span>
                    )}
                  </button>

                  <button 
                    type="button"
                    id="top-central-100-revert-btn"
                    onClick={handleCentralRevert100Percent}
                    className={`px-3 py-2 rounded-xl font-bold text-xs sm:text-sm transition-all shadow-xs inline-flex items-center gap-1.5 cursor-pointer active:scale-95 ${
                      selectedRowIds.size > 0 
                        ? 'bg-[#2b6851] hover:bg-[#205240] text-white ring-2 ring-[#64a98d] ring-offset-1' 
                        : 'bg-[#cee3d7] hover:bg-[#bad8c6] text-[#194534] border border-[#a3c9b4]'
                    }`}
                    title="Revert 100% of selected 2nd Sheet entries to Main Sheet with one click"
                  >
                    <ArchiveRestore className="w-3.5 h-3.5" />
                    <span>100% Revert</span>
                    {selectedRowIds.size > 0 && (
                      <span className="bg-black/25 text-white text-[10px] px-1.5 py-0.2 rounded-full font-black">
                        {selectedRowIds.size}
                      </span>
                    )}
                  </button>
                </>
              )}
              
              {/* Sheet Toggle Button */}
              <button 
                onClick={() => setViewingMaster(!viewingMaster)}
                className={`px-3.5 py-2 rounded-xl font-bold text-xs sm:text-sm transition-all shadow-xs inline-flex items-center gap-1.5 cursor-pointer active:scale-95 ${
                  viewingMaster 
                    ? 'bg-[#ba6a1c] hover:bg-[#9f5712] text-white ring-2 ring-amber-300' 
                    : 'bg-[#edd5bd] hover:bg-[#dec1a3] text-[#703b13] border border-[#d4b08d]'
                }`}
                title={viewingMaster ? "Switch to Main Sheet" : "Switch to 2nd Sheet"}
              >
                {viewingMaster ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                <span>{viewingMaster ? "View Main Sheet" : "View 2nd Sheet"}</span>
              </button>

              {/* Sales Summary Button */}
              <button 
                type="button"
                onClick={() => setShowSalesSummaryModal(true)}
                id="sales-dashboard-summary-btn"
                className="bg-[#1e3a8a] hover:bg-[#172554] text-white px-3.5 py-2 rounded-xl font-bold text-xs sm:text-sm transition-all shadow-xs inline-flex items-center gap-1.5 cursor-pointer active:scale-95"
                title="View Sales Summary and Growth/Degrowth Graphical Analytics"
              >
                <BarChart3 className="w-3.5 h-3.5 text-blue-200" />
                <span>SALES SUMMARY</span>
              </button>

              {/* Clear Data Button */}
              {baseData.length > 0 && (
                <button 
                  type="button"
                  onClick={() => {
                    // Pre-fill with the first available entry date or today
                    if (availableEntryDates.length > 0) {
                      setClearSingleDate(availableEntryDates[0].date);
                    } else {
                      setClearSingleDate(new Date().toISOString().split('T')[0]);
                    }
                    setClearDateMode('single');
                    setClearMultiType('range');
                    setClearStartDate('');
                    setClearEndDate('');
                    setClearSelectedDates([]);
                    setClearStep('select');
                    setShowClearModal(true);
                  }}
                  id="sales-dashboard-clear-btn"
                  className="bg-[#8f3939] hover:bg-[#782e2e] text-white px-3 py-2 rounded-xl font-bold text-xs sm:text-sm transition-all shadow-xs inline-flex items-center gap-1.5 cursor-pointer active:scale-95"
                  title={viewingMaster ? "Clear 2nd sheet data by entry date" : "Clear sales data by entry date"}
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-200" />
                  <span>Clear</span>
                </button>
              )}

              {/* Primary CTA: Add Record */}
              <button 
                onClick={() => setShowManualForm(true)}
                className="bg-gradient-to-r from-red-600 via-rose-600 to-red-700 hover:from-red-500 hover:via-rose-500 hover:to-red-600 text-white px-4 py-2 rounded-xl font-black text-xs sm:text-sm transition-all shadow-md shadow-red-600/25 inline-flex items-center gap-1.5 cursor-pointer active:scale-95"
                title="Add new sales record"
              >
                <Plus className="w-4 h-4 text-red-100" />
                <span>Add Record</span>
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-rose-50 text-rose-700 p-4 rounded-xl border border-rose-200 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div className="text-sm font-medium">{error}</div>
          </div>
        )}

        {/* Google Sheets extraction alert message */}
        {extractionMessage && (
          <div className={`p-4 mx-4 mt-2 rounded-lg border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 ${
            extractionMessage.type === 'success' 
              ? 'bg-emerald-50 border-emerald-250 text-emerald-800' 
              : 'bg-red-50 border-red-200 text-red-800'
          }`}>
            <div className="flex items-center gap-2">
              <span className="text-lg">{extractionMessage.type === 'success' ? '✅' : '❌'}</span>
              <div>
                <p className="text-xs font-bold leading-normal">{extractionMessage.text}</p>
                {extractionMessage.type === 'success' && (
                  <p className="text-[10px] text-emerald-600 font-medium">Your sales data has been saved as a spreadsheet in your Google Drive.</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {extractionMessage.url && (
                <a
                  href={extractionMessage.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase px-3 py-2 rounded shadow-xs transition"
                >
                  <span>Open Spreadsheet</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
              <button
                onClick={() => setExtractionMessage(null)}
                className="text-[10px] font-black uppercase text-gray-400 hover:text-gray-600 px-2 py-1"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {showManualForm && (
          <div 
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200"
            onClick={() => setShowManualForm(false)}
          >
            <div 
              className={`relative w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-3xl border ${themeStyles.cardBorder} shadow-2xl p-6 sm:p-7 ${themeStyles.cardBg} transition-all space-y-4`}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between pb-4 border-b border-gray-200 dark:border-zinc-800">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-gradient-to-br from-red-600 to-rose-700 text-white rounded-2xl shadow-md shadow-red-600/25">
                    <Plus className="w-5 h-5 stroke-[2.5]" />
                  </div>
                  <div>
                    <h3 className={`font-black text-lg sm:text-xl ${themeStyles.textHeading}`}>
                      Add Sales Record
                    </h3>
                    <p className={`text-xs ${themeStyles.textMuted}`}>
                      Enter order volume, revenue, and platform attribution for tracking
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowManualForm(false)}
                  className="p-2 rounded-xl text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-800 transition cursor-pointer"
                  title="Close (Esc)"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Form Content */}
              <form onSubmit={handleManualSubmit} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className={`block text-xs font-bold ${themeStyles.textMuted} uppercase tracking-wider mb-1`}>Record Date</label>
                  <input 
                    type="date"
                    value={manualEntry.date || ''}
                    onChange={e => {
                      const newDate = e.target.value;
                      if (newDate) {
                        const [y, m, d] = newDate.split('-');
                        const dayNum = parseInt(d, 10);
                        const w = !isNaN(dayNum) && dayNum > 0 ? Math.ceil(dayNum / 7).toString() : '1';
                        setManualEntry({
                          ...manualEntry,
                          date: newDate,
                          year: y,
                          month: m,
                          week: w
                        });
                      } else {
                        setManualEntry({ ...manualEntry, date: '' });
                      }
                    }}
                    className={`w-full ${themeStyles.inputBg} border ${themeStyles.inputBorder} rounded-lg px-3 py-2 text-sm font-medium ${themeStyles.textBody} outline-none focus:ring-2 focus:ring-red-500`}
                  />
                </div>
                <div>
                  <label className={`block text-xs font-bold ${themeStyles.textMuted} uppercase tracking-wider mb-1`}>Action Year</label>
                  <select 
                    required
                    value={manualEntry.year} 
                    onChange={e => setManualEntry({...manualEntry, year: e.target.value})}
                    className={`w-full ${themeStyles.inputBg} border ${themeStyles.inputBorder} rounded-lg px-3 py-2 text-sm font-medium ${themeStyles.textBody} outline-none focus:ring-2 focus:ring-red-500`}
                  >
                    <option value="">Select Year</option>
                    {Array.from({length: 11}, (_, i) => 2020 + i).map(y => (
                      <option key={y} value={y.toString()}>{y}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={`block text-xs font-bold ${themeStyles.textMuted} uppercase tracking-wider mb-1`}>Action Month</label>
                  <select 
                    required
                    value={manualEntry.month} 
                    onChange={e => setManualEntry({...manualEntry, month: e.target.value})}
                    className={`w-full ${themeStyles.inputBg} border ${themeStyles.inputBorder} rounded-lg px-3 py-2 text-sm font-medium ${themeStyles.textBody} outline-none focus:ring-2 focus:ring-red-500`}
                  >
                    <option value="">Select Month</option>
                    {Array.from({length: 12}, (_, i) => String(i + 1).padStart(2, '0')).map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={`block text-xs font-bold ${themeStyles.textMuted} uppercase tracking-wider mb-1`}>Platform</label>
                  <select 
                    required
                    value={manualEntry.state} 
                    onChange={e => setManualEntry({...manualEntry, state: e.target.value})}
                    className={`w-full ${themeStyles.inputBg} border ${themeStyles.inputBorder} rounded-lg px-3 py-2 text-sm font-medium ${themeStyles.textBody} outline-none focus:ring-2 focus:ring-red-500`}
                  >
                    <option value="">Select Platform</option>
                    <option value="E-Commerce">E-Commerce</option>
                    <option value="Website">Website</option>
                  </select>
                </div>
                <div>
                  <label className={`block text-xs font-bold ${themeStyles.textMuted} uppercase tracking-wider mb-1`}>Action Week</label>
                  <select 
                    required
                    value={manualEntry.week} 
                    onChange={e => setManualEntry({...manualEntry, week: e.target.value})}
                    className={`w-full ${themeStyles.inputBg} border ${themeStyles.inputBorder} rounded-lg px-3 py-2 text-sm font-medium ${themeStyles.textBody} outline-none focus:ring-2 focus:ring-red-500`}
                  >
                    <option value="">Select Week</option>
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                    <option value="4">4</option>
                    <option value="5">5</option>
                  </select>
                </div>
                <div>
                  <label className={`block text-xs font-bold ${themeStyles.textMuted} uppercase tracking-wider mb-1`}>Target Product</label>
                  <select 
                    required
                    value={manualEntry.productName} 
                    onChange={e => setManualEntry({...manualEntry, productName: e.target.value})}
                    className={`w-full ${themeStyles.inputBg} border ${themeStyles.inputBorder} rounded-lg px-3 py-2 text-sm font-medium ${themeStyles.textBody} outline-none focus:ring-2 focus:ring-red-500`}
                  >
                    <option value="">-- Select Product --</option>
                    {allAppProducts.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={`block text-xs font-bold ${themeStyles.textMuted} uppercase tracking-wider mb-1`}>Total Completed Orders</label>
                  <input 
                    type="number" 
                    required
                    min="0"
                    value={manualEntry.quantity} 
                    onChange={e => setManualEntry({...manualEntry, quantity: e.target.value})}
                    className={`w-full ${themeStyles.inputBg} border ${themeStyles.inputBorder} rounded-lg px-3 py-2 text-sm font-medium ${themeStyles.textBody} outline-none focus:ring-2 focus:ring-red-500`}
                  />
                </div>
                <div>
                  <label className={`block text-xs font-bold ${themeStyles.textMuted} uppercase tracking-wider mb-1`}>Total Revenue (₹)</label>
                  <input 
                    type="number" 
                    required
                    min="0"
                    step="0.01"
                    value={manualEntry.netRevenue} 
                    onChange={e => setManualEntry({...manualEntry, netRevenue: e.target.value})}
                    className={`w-full ${themeStyles.inputBg} border ${themeStyles.inputBorder} rounded-lg px-3 py-2 text-sm font-medium ${themeStyles.textBody} outline-none focus:ring-2 focus:ring-red-500`}
                  />
                </div>

                <div className={`col-span-1 md:col-span-2 lg:col-span-3 ${themeStyles.subSurface} p-4 rounded-xl border ${themeStyles.cardBorder} mt-2`}>
                  <div className="flex flex-wrap justify-between items-center mb-2 gap-2">
                    <label className={`block text-xs font-bold ${themeStyles.textMuted} uppercase tracking-wider`}>Adjustment Percentage</label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        id="manual-entry-adjust-40-btn"
                        onClick={() => setManualEntry(prev => ({ ...prev, percentage: 40 }))}
                        className={`px-3 py-1 text-xs font-bold rounded-lg transition-all border flex items-center gap-1.5 shadow-xs cursor-pointer ${
                          manualEntry.percentage === 40
                            ? 'bg-[#c46823] text-white border-[#ab581b] ring-2 ring-[#e8a36e]'
                            : 'bg-[#edd5bd] text-[#733c14] border-[#d6b492] hover:bg-[#e2c6a9]'
                        }`}
                        title="Direct adjustment of 40%"
                      >
                        <Percent className="w-3.5 h-3.5" />
                        40% Adjustment
                      </button>
                      <button
                        type="button"
                        id="manual-entry-adjust-100-btn"
                        onClick={() => setManualEntry(prev => ({ ...prev, percentage: 100 }))}
                        className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all border cursor-pointer ${
                          manualEntry.percentage === 100
                            ? `${themeStyles.inputBg} ${themeStyles.textHeading} border ${themeStyles.cardBorder} font-bold`
                            : `${themeStyles.subSurface} ${themeStyles.textMuted} border ${themeStyles.inputBorder} hover:brightness-95`
                        }`}
                        title="Reset adjustment to 100%"
                      >
                        100%
                      </button>
                      <span className="font-bold text-red-600 dark:text-red-400 min-w-[3rem] text-right">{manualEntry.percentage}%</span>
                    </div>
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max="100" 
                    value={manualEntry.percentage} 
                    onChange={e => setManualEntry({...manualEntry, percentage: Number(e.target.value)})}
                    className="w-full h-2 bg-black/10 rounded-lg appearance-none cursor-pointer accent-red-600"
                  />
                  
                  <div className={`mt-4 pt-4 border-t ${themeStyles.cardBorder} grid grid-cols-2 gap-4`}>
                    <div>
                      <span className={`block text-xs font-bold ${themeStyles.textMuted} uppercase tracking-wider mb-1`}>Final Orders</span>
                      <span className={`text-xl font-black ${themeStyles.textHeading}`}>
                        {Math.round((Number(manualEntry.quantity) || 0) * (manualEntry.percentage / 100)).toLocaleString()}
                      </span>
                    </div>
                    <div>
                      <span className={`block text-xs font-bold ${themeStyles.textMuted} uppercase tracking-wider mb-1`}>Final Revenue</span>
                      <span className="text-xl font-black text-red-600 dark:text-red-400">
                        ₹{((Number(manualEntry.netRevenue) || 0) * (manualEntry.percentage / 100)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="col-span-full flex justify-end gap-3 mt-2 pt-3 border-t border-gray-150 dark:border-zinc-800">
                  <button 
                    type="button"
                    onClick={() => setShowManualForm(false)}
                    className={`px-4 py-2 font-bold text-sm ${themeStyles.textMuted} hover:${themeStyles.textHeading} rounded-lg transition-colors cursor-pointer`}
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="px-5 py-2.5 font-black text-sm text-white bg-gradient-to-r from-red-600 via-rose-600 to-red-700 hover:from-red-500 hover:to-rose-600 rounded-xl transition-all shadow-md shadow-red-600/30 active:scale-95 cursor-pointer inline-flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4 stroke-[2.5]" />
                    <span>Save Record</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Date-Based Clear Data Modal with Red Confirmation */}
        {showClearModal && (
          <div 
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200 print:hidden"
            onClick={() => {
              setShowClearModal(false);
              setClearStep('select');
            }}
          >
            <div 
              className={`relative w-full max-w-xl max-h-[92vh] overflow-y-auto rounded-3xl border ${
                clearStep === 'confirm' ? 'border-red-400 dark:border-red-800' : themeStyles.cardBorder
              } shadow-2xl p-6 sm:p-7 ${themeStyles.cardBg} transition-all space-y-5`}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between pb-4 border-b border-gray-200 dark:border-zinc-800">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-2xl ${
                    clearStep === 'confirm'
                      ? 'bg-red-600 text-white shadow-lg shadow-red-600/35 ring-2 ring-red-400'
                      : 'bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400'
                  }`}>
                    {clearStep === 'confirm' ? (
                      <AlertTriangle className="w-5 h-5 stroke-[2.5]" />
                    ) : (
                      <Trash2 className="w-5 h-5" />
                    )}
                  </div>
                  <div>
                    <h3 className={`font-black text-lg sm:text-xl ${
                      clearStep === 'confirm' ? 'text-red-600 dark:text-red-400' : themeStyles.textHeading
                    }`}>
                      {clearStep === 'confirm' ? 'Confirm Deletion' : 'Clear Sales Data'}
                    </h3>
                    <p className={`text-xs ${
                      clearStep === 'confirm' ? 'text-red-700/80 dark:text-red-300/80 font-medium' : themeStyles.textMuted
                    }`}>
                      {clearStep === 'confirm' 
                        ? 'Please verify the records before permanent removal' 
                        : `Select entry date(s) to remove records from ${viewingMaster ? '2nd Sheet' : 'Main Sheet'}`}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowClearModal(false);
                    setClearStep('select');
                  }}
                  className="p-2 rounded-xl text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-800 transition cursor-pointer"
                  title="Close (Esc)"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* STEP 1: Date Selection */}
              {clearStep === 'select' && (
                <div className="space-y-4">
                  {/* Mode Selector Tabs */}
                  <div>
                    <label className={`block text-xs font-bold ${themeStyles.textMuted} uppercase tracking-wider mb-2`}>
                      Select Date Option:
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setClearDateMode('single')}
                        className={`p-3 rounded-xl border text-xs font-black transition-all flex flex-col items-center gap-1.5 cursor-pointer ${
                          clearDateMode === 'single'
                            ? 'bg-red-50 dark:bg-red-950/40 border-red-500 text-red-700 dark:text-red-300 ring-2 ring-red-400/40 shadow-xs'
                            : `${themeStyles.inputBg} ${themeStyles.inputBorder} ${themeStyles.textMuted} hover:${themeStyles.textHeading}`
                        }`}
                      >
                        <Calendar className="w-4 h-4 text-red-600 dark:text-red-400" />
                        <span>Single Date</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setClearDateMode('multiple')}
                        className={`p-3 rounded-xl border text-xs font-black transition-all flex flex-col items-center gap-1.5 cursor-pointer ${
                          clearDateMode === 'multiple'
                            ? 'bg-red-50 dark:bg-red-950/40 border-red-500 text-red-700 dark:text-red-300 ring-2 ring-red-400/40 shadow-xs'
                            : `${themeStyles.inputBg} ${themeStyles.inputBorder} ${themeStyles.textMuted} hover:${themeStyles.textHeading}`
                        }`}
                      >
                        <SlidersHorizontal className="w-4 h-4 text-red-600 dark:text-red-400" />
                        <span>Multiple Dates</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setClearDateMode('all')}
                        className={`p-3 rounded-xl border text-xs font-black transition-all flex flex-col items-center gap-1.5 cursor-pointer ${
                          clearDateMode === 'all'
                            ? 'bg-red-50 dark:bg-red-950/40 border-red-500 text-red-700 dark:text-red-300 ring-2 ring-red-400/40 shadow-xs'
                            : `${themeStyles.inputBg} ${themeStyles.inputBorder} ${themeStyles.textMuted} hover:${themeStyles.textHeading}`
                        }`}
                      >
                        <Trash2 className="w-4 h-4 text-red-600 dark:text-red-400" />
                        <span>All Dates</span>
                      </button>
                    </div>
                  </div>

                  {/* Mode 1: Single Date */}
                  {clearDateMode === 'single' && (
                    <div className="space-y-3 p-4 rounded-2xl bg-black/[0.02] dark:bg-white/[0.02] border border-gray-200/80 dark:border-zinc-800">
                      <div>
                        <label className={`block text-xs font-bold ${themeStyles.textHeading} mb-1.5`}>
                          Entry Date (Date of Data)
                        </label>
                        <input
                          type="date"
                          value={clearSingleDate}
                          onChange={(e) => setClearSingleDate(e.target.value)}
                          className={`w-full ${themeStyles.inputBg} border ${themeStyles.inputBorder} rounded-xl px-3.5 py-2.5 text-sm font-semibold ${themeStyles.textBody} outline-none focus:ring-2 focus:ring-red-500 shadow-2xs`}
                        />
                      </div>

                      {/* Quick Chips of Available Dates */}
                      {availableEntryDates.length > 0 && (
                        <div>
                          <span className={`block text-[11px] font-bold ${themeStyles.textMuted} uppercase tracking-wider mb-2`}>
                            Or select from detected entry dates in sheet:
                          </span>
                          <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
                            {availableEntryDates.map(({ date, count }) => (
                              <button
                                key={date}
                                type="button"
                                onClick={() => setClearSingleDate(date)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all border cursor-pointer inline-flex items-center gap-1.5 ${
                                  clearSingleDate === date
                                    ? 'bg-red-600 text-white border-red-600 shadow-xs'
                                    : 'bg-white dark:bg-zinc-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-zinc-700 hover:bg-gray-50'
                                }`}
                              >
                                <span>{formatDateDisplay(date)}</span>
                                <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                                  clearSingleDate === date ? 'bg-white/20 text-white' : 'bg-gray-100 dark:bg-zinc-700 text-gray-600 dark:text-gray-300'
                                }`}>
                                  {count}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Mode 2: Multiple Dates */}
                  {clearDateMode === 'multiple' && (
                    <div className="space-y-3 p-4 rounded-2xl bg-black/[0.02] dark:bg-white/[0.02] border border-gray-200/80 dark:border-zinc-800">
                      {/* Sub-selector: Range vs Specific */}
                      <div className="flex items-center gap-2 pb-2 border-b border-gray-200/60 dark:border-zinc-800 text-xs">
                        <button
                          type="button"
                          onClick={() => setClearMultiType('range')}
                          className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                            clearMultiType === 'range'
                              ? 'bg-red-600 text-white shadow-xs'
                              : 'text-gray-600 dark:text-gray-300 hover:bg-black/5 dark:hover:bg-white/5'
                          }`}
                        >
                          Date Range (Start → End)
                        </button>
                        <button
                          type="button"
                          onClick={() => setClearMultiType('specific')}
                          className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                            clearMultiType === 'specific'
                              ? 'bg-red-600 text-white shadow-xs'
                              : 'text-gray-600 dark:text-gray-300 hover:bg-black/5 dark:hover:bg-white/5'
                          }`}
                        >
                          Select Specific Dates
                        </button>
                      </div>

                      {clearMultiType === 'range' ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                          <div>
                            <label className={`block text-xs font-bold ${themeStyles.textHeading} mb-1`}>
                              From Entry Date:
                            </label>
                            <input
                              type="date"
                              value={clearStartDate}
                              onChange={(e) => setClearStartDate(e.target.value)}
                              className={`w-full ${themeStyles.inputBg} border ${themeStyles.inputBorder} rounded-xl px-3 py-2 text-sm font-semibold ${themeStyles.textBody} outline-none focus:ring-2 focus:ring-red-500`}
                            />
                          </div>
                          <div>
                            <label className={`block text-xs font-bold ${themeStyles.textHeading} mb-1`}>
                              To Entry Date:
                            </label>
                            <input
                              type="date"
                              value={clearEndDate}
                              onChange={(e) => setClearEndDate(e.target.value)}
                              className={`w-full ${themeStyles.inputBg} border ${themeStyles.inputBorder} rounded-xl px-3 py-2 text-sm font-semibold ${themeStyles.textBody} outline-none focus:ring-2 focus:ring-red-500`}
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2 pt-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-gray-500">Pick Dates to Remove:</span>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setClearSelectedDates(availableEntryDates.map(x => x.date))}
                                className="text-red-600 hover:underline font-bold text-xs cursor-pointer"
                              >
                                Select All
                              </button>
                              <span className="text-gray-300">|</span>
                              <button
                                type="button"
                                onClick={() => setClearSelectedDates([])}
                                className="text-gray-500 hover:underline font-bold text-xs cursor-pointer"
                              >
                                Clear Selection
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto p-1">
                            {availableEntryDates.map(({ date, count }) => {
                              const isChecked = clearSelectedDates.includes(date);
                              return (
                                <label
                                  key={date}
                                  className={`flex items-center gap-2 p-2 rounded-xl border text-xs font-medium cursor-pointer transition ${
                                    isChecked
                                      ? 'bg-red-50 dark:bg-red-950/40 border-red-400 text-red-800 dark:text-red-200 font-bold'
                                      : 'bg-white dark:bg-zinc-800 border-gray-200 dark:border-zinc-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => {
                                      setClearSelectedDates(prev =>
                                        prev.includes(date) ? prev.filter(x => x !== date) : [...prev, date]
                                      );
                                    }}
                                    className="rounded text-red-600 focus:ring-red-500"
                                  />
                                  <span className="truncate">{formatDateDisplay(date)}</span>
                                  <span className="text-[10px] text-gray-400 font-bold ml-auto">({count})</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Mode 3: All Dates */}
                  {clearDateMode === 'all' && (
                    <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs space-y-1">
                      <p className="font-bold">⚠️ Clear Entire Current Sheet</p>
                      <p>
                        All <strong>{baseData.length}</strong> records in the {viewingMaster ? '2nd Sheet' : 'Main Sheet'} will be selected for removal.
                      </p>
                    </div>
                  )}

                  {/* Live Selection Indicator Badge */}
                  <div className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-between ${
                    recordsToDelete.length > 0
                      ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 text-emerald-800 dark:text-emerald-300'
                      : 'bg-gray-50 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700 text-gray-500'
                  }`}>
                    <span>Target Records Found:</span>
                    <span className="font-black text-sm">
                      {recordsToDelete.length} record(s)
                    </span>
                  </div>

                  {/* Actions for Step 1 */}
                  <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-200 dark:border-zinc-800">
                    <button
                      type="button"
                      onClick={() => {
                        setShowClearModal(false);
                        setClearStep('select');
                      }}
                      className={`px-4 py-2 font-bold text-sm ${themeStyles.textMuted} hover:${themeStyles.textHeading} rounded-xl transition cursor-pointer`}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={recordsToDelete.length === 0}
                      onClick={() => setClearStep('confirm')}
                      className={`px-5 py-2.5 rounded-xl font-black text-sm text-white transition-all shadow-md inline-flex items-center gap-2 ${
                        recordsToDelete.length > 0
                          ? 'bg-gradient-to-r from-red-600 via-rose-600 to-red-700 hover:from-red-500 hover:to-rose-600 shadow-red-600/30 cursor-pointer active:scale-95'
                          : 'bg-gray-400 cursor-not-allowed opacity-60'
                      }`}
                    >
                      <span>Proceed to Confirmation ({recordsToDelete.length})</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 2: RED COLOR CONFIRMATION ("after selecting date it will confirm that If I really want to delete this, in red color") */}
              {clearStep === 'confirm' && (
                <div className="space-y-4 animate-in fade-in zoom-in-95 duration-150">
                  {/* Big Red Warning Box */}
                  <div className="p-5 rounded-2xl bg-red-50 dark:bg-red-950/50 border-2 border-red-500 dark:border-red-600 text-red-900 dark:text-red-100 space-y-3 shadow-lg shadow-red-500/10">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-xl bg-red-600 text-white shrink-0 mt-0.5 shadow-md shadow-red-600/30">
                        <AlertTriangle className="w-5 h-5 stroke-[2.5]" />
                      </div>
                      <div className="space-y-1">
                        <h4 className="text-base sm:text-lg font-black text-red-600 dark:text-red-400 leading-tight">
                          Are you sure you really want to delete this?
                        </h4>
                        <p className="text-xs text-red-700 dark:text-red-300 font-semibold">
                          You are about to permanently remove sales records from the <strong className="underline">{viewingMaster ? '2nd Sheet' : 'Main Sheet'}</strong>.
                        </p>
                      </div>
                    </div>

                    {/* Breakdown of Deletion in Red */}
                    <div className="pt-3 border-t border-red-200 dark:border-red-800/80 grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                      <div className="p-2.5 rounded-xl bg-white/80 dark:bg-zinc-900/80 border border-red-200 dark:border-red-900/50">
                        <span className="block text-[10px] uppercase font-bold text-red-500 dark:text-red-400">Records to Delete</span>
                        <span className="text-lg font-black text-red-600 dark:text-red-400">{recordsToDelete.length}</span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-white/80 dark:bg-zinc-900/80 border border-red-200 dark:border-red-900/50">
                        <span className="block text-[10px] uppercase font-bold text-red-500 dark:text-red-400">Total Units</span>
                        <span className="text-lg font-black text-red-600 dark:text-red-400">
                          {recordsToDelete.reduce((sum, r) => sum + (Number(r.quantity) || 0), 0).toLocaleString()}
                        </span>
                      </div>
                      <div className="col-span-2 sm:col-span-1 p-2.5 rounded-xl bg-white/80 dark:bg-zinc-900/80 border border-red-200 dark:border-red-900/50">
                        <span className="block text-[10px] uppercase font-bold text-red-500 dark:text-red-400">Total Revenue</span>
                        <span className="text-lg font-black text-red-600 dark:text-red-400">
                          ₹{recordsToDelete.reduce((sum, r) => sum + (Number(r.netRevenue) || Number(r.grossSales) || 0), 0).toLocaleString('en-IN')}
                        </span>
                      </div>
                    </div>

                    {/* Target Scope Details */}
                    <div className="p-3 rounded-xl bg-red-100/70 dark:bg-red-900/30 border border-red-300 dark:border-red-800 text-xs space-y-1">
                      <span className="font-bold text-red-800 dark:text-red-200 block">Date Target Scope:</span>
                      <p className="font-medium text-red-700 dark:text-red-300">
                        {clearDateMode === 'single' && (
                          <>Single Entry Date: <strong>{formatDateDisplay(clearSingleDate)}</strong></>
                        )}
                        {clearDateMode === 'multiple' && clearMultiType === 'range' && (
                          <>Date Range: <strong>{formatDateDisplay(clearStartDate) || 'Beginning'}</strong> to <strong>{formatDateDisplay(clearEndDate) || 'Latest'}</strong></>
                        )}
                        {clearDateMode === 'multiple' && clearMultiType === 'specific' && (
                          <>{clearSelectedDates.length} Specific Entry Date(s): <strong>{clearSelectedDates.map(formatDateDisplay).slice(0, 4).join(', ')}{clearSelectedDates.length > 4 ? ` and ${clearSelectedDates.length - 4} more` : ''}</strong></>
                        )}
                        {clearDateMode === 'all' && (
                          <>Entire Sheet: <strong>All {baseData.length} records</strong></>
                        )}
                      </p>
                    </div>

                    <p className="text-[11px] font-extrabold text-red-600 dark:text-red-400 flex items-center gap-1.5 pt-1">
                      <span>⚠️ Note: This action is permanent and cannot be undone.</span>
                    </p>
                  </div>

                  {/* Actions for Step 2 */}
                  <div className="flex items-center justify-between gap-3 pt-3 border-t border-gray-200 dark:border-zinc-800">
                    <button
                      type="button"
                      onClick={() => setClearStep('select')}
                      className="px-4 py-2 text-xs sm:text-sm font-bold text-gray-600 dark:text-gray-300 hover:text-gray-900 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-xl transition cursor-pointer"
                    >
                      ← Change Date Selection
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setShowClearModal(false);
                          setClearStep('select');
                        }}
                        className={`px-4 py-2 font-bold text-xs sm:text-sm ${themeStyles.textMuted} hover:${themeStyles.textHeading} rounded-xl transition cursor-pointer`}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleExecuteClear}
                        id="confirm-delete-sales-records-btn"
                        className="px-6 py-2.5 rounded-xl font-black text-xs sm:text-sm text-white bg-gradient-to-r from-red-600 via-rose-600 to-red-700 hover:from-red-700 hover:via-rose-700 hover:to-red-800 active:scale-95 transition-all shadow-lg shadow-red-600/40 border border-red-500 cursor-pointer inline-flex items-center gap-2"
                      >
                        <Trash2 className="w-4 h-4 text-white" />
                        <span>Yes, Delete {recordsToDelete.length} Record(s)</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Sales Summary & Growth Analytics Modal */}
        <SalesSummaryModal
          isOpen={showSalesSummaryModal}
          onClose={() => setShowSalesSummaryModal(false)}
          data={data}
          masterData={masterData}
          themeStyles={themeStyles}
          formatCurrency={formatCurrency}
          formatNumber={formatNumber}
          availableProducts={availableProducts}
          availableYears={availableYears}
          initialViewingMaster={viewingMaster}
        />

        {isLoading && (
          <div className={`flex-1 ${themeStyles.cardBg} rounded-2xl border ${themeStyles.cardBorder} shadow-sm flex flex-col items-center justify-center p-12 transition-colors`}>
            <div className="w-10 h-10 border-4 border-[#375577] border-t-transparent rounded-full animate-spin mb-4"></div>
            <p className={`text-lg font-bold ${themeStyles.textHeading}`}>Parsing Data...</p>
          </div>
        )}

        {!isLoading && (viewingMaster ? masterData.length === 0 : data.length === 0) && !error && (
          <div className={`flex-1 ${themeStyles.cardBg} rounded-2xl border border-dashed ${themeStyles.cardBorder} shadow-sm flex flex-col items-center justify-center p-16 text-center transition-colors`}>
            <Package className={`w-16 h-16 ${themeStyles.textMuted} mb-4 opacity-50`} />
            <h3 className={`text-xl font-bold ${themeStyles.textHeading} mb-2`}>No Records Found</h3>
            <p className={`${themeStyles.textMuted} max-w-md`}>
              Add your sales records using the "Add Record" button above or import a CSV file.
            </p>
          </div>
        )}

        {!isLoading && (viewingMaster ? masterData.length > 0 : data.length > 0) && (
          <>
            {/* Filter Bar for Month, Year, Week, Product, Search */}
            <div className={`${themeStyles.cardBg} p-4 sm:p-5 rounded-2xl shadow-sm border ${themeStyles.cardBorder} flex flex-col gap-4 transition-colors`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                    <SlidersHorizontal className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className={`text-sm font-black ${themeStyles.textHeading} tracking-tight flex items-center gap-2`}>
                      <span>Filter Sales Data</span>
                      {hasActiveFilters && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300">
                          Active Filters
                        </span>
                      )}
                    </h2>
                    <p className={`text-xs ${themeStyles.textMuted}`}>
                      Showing <strong className={themeStyles.textHeading}>{formatNumber(filteredData.length)}</strong> of{' '}
                      <strong>{formatNumber((viewingMaster ? masterData : data).length)}</strong> {viewingMaster ? '2nd sheet' : 'sales'} records
                    </p>
                  </div>
                </div>

                {/* Quick Presets & Reset */}
                <div className="flex items-center flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setFilterMonth('ALL');
                      setFilterYear('ALL');
                      setFilterWeek('ALL');
                      setFilterDate('');
                      setFilterEndDate('');
                    }}
                    className={`text-xs font-bold px-2.5 py-1.5 rounded-lg border transition-all cursor-pointer ${
                      filterMonth === 'ALL' && filterYear === 'ALL' && filterWeek === 'ALL' && !filterDate
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                        : `${themeStyles.inputBg} ${themeStyles.textBody} ${themeStyles.cardBorder} hover:brightness-95`
                    }`}
                    title="View records across all years and months"
                  >
                    All Time
                  </button>

                  <button
                    type="button"
                    onClick={setFilterToCurrentPeriod}
                    className={`text-xs font-bold px-2.5 py-1.5 rounded-lg border transition-all cursor-pointer ${
                      filterMonth === (new Date().getMonth() + 1).toString().padStart(2, '0') && filterYear === new Date().getFullYear().toString() && filterWeek === 'ALL' && !filterDate
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                        : `${themeStyles.inputBg} ${themeStyles.textBody} ${themeStyles.cardBorder} hover:brightness-95`
                    }`}
                    title="Filter to current Month and Year"
                  >
                    Current Month
                  </button>

                  <button
                    type="button"
                    onClick={setFilterToToday}
                    className={`text-xs font-bold px-2.5 py-1.5 rounded-lg border transition-all cursor-pointer ${
                      filterDate === new Date().toISOString().split('T')[0] && !filterEndDate
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                        : `${themeStyles.inputBg} ${themeStyles.textBody} ${themeStyles.cardBorder} hover:brightness-95`
                    }`}
                    title="Filter to today's date"
                  >
                    Today
                  </button>

                  {hasActiveFilters && (
                    <button
                      type="button"
                      onClick={resetFilters}
                      className="text-xs font-bold px-2.5 py-1.5 rounded-lg text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/40 border border-rose-200 dark:border-rose-900/50 transition-all cursor-pointer flex items-center gap-1"
                      title="Clear all active filters"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Reset</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Filter Controls Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 pt-1 border-t border-dashed border-gray-200 dark:border-gray-800">
                {/* Date Selection Filter */}
                <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-2">
                  <div className="flex items-center justify-between">
                    <label htmlFor="sales-filter-date" className={`text-[11px] font-bold ${themeStyles.textMuted} uppercase tracking-wider flex items-center gap-1`}>
                      <Calendar className="w-3 h-3 text-cyan-500" />
                      <span>Date Selection</span>
                    </label>
                    <div className="flex items-center gap-0.5 bg-gray-100 dark:bg-gray-800 p-0.5 rounded-lg border border-gray-200 dark:border-gray-700">
                      <button
                        type="button"
                        onClick={() => {
                          setDateFilterMode('single');
                          setFilterEndDate('');
                        }}
                        className={`text-[10px] px-2 py-0.5 rounded font-bold transition-all cursor-pointer ${
                          dateFilterMode === 'single'
                            ? 'bg-indigo-600 text-white shadow-2xs'
                            : `${themeStyles.textMuted} hover:${themeStyles.textHeading}`
                        }`}
                      >
                        Single Date
                      </button>
                      <button
                        type="button"
                        onClick={() => setDateFilterMode('range')}
                        className={`text-[10px] px-2 py-0.5 rounded font-bold transition-all cursor-pointer ${
                          dateFilterMode === 'range'
                            ? 'bg-indigo-600 text-white shadow-2xs'
                            : `${themeStyles.textMuted} hover:${themeStyles.textHeading}`
                        }`}
                      >
                        Range
                      </button>
                    </div>
                  </div>

                  {dateFilterMode === 'single' ? (
                    <div className="flex items-center gap-1.5">
                      <div className="relative flex-1">
                        <input
                          id="sales-filter-date"
                          type="date"
                          value={filterDate}
                          onChange={(e) => {
                            const val = e.target.value;
                            setFilterDate(val);
                            if (val) {
                              const [y, m, d] = val.split('-');
                              const dayNum = parseInt(d, 10);
                              const w = !isNaN(dayNum) && dayNum > 0 ? Math.ceil(dayNum / 7).toString() : '1';
                              setFilterYear(y);
                              setFilterMonth(m);
                              setFilterWeek(w);
                            }
                          }}
                          className={`w-full text-xs font-semibold px-2.5 py-2 rounded-xl border ${themeStyles.inputBorder} ${themeStyles.inputBg} ${themeStyles.textHeading} focus:outline-none focus:ring-2 focus:ring-indigo-500 transition shadow-2xs cursor-pointer`}
                        />
                        {filterDate && (
                          <button
                            type="button"
                            onClick={() => setFilterDate('')}
                            className="absolute right-7 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer p-0.5"
                            title="Clear date"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={setFilterToToday}
                        className={`text-[11px] font-bold px-2.5 py-2 rounded-xl border ${themeStyles.inputBorder} ${themeStyles.inputBg} ${themeStyles.textHeading} hover:brightness-95 transition shadow-2xs cursor-pointer shrink-0`}
                        title="Filter to Today"
                      >
                        Today
                      </button>
                      <button
                        type="button"
                        onClick={setFilterToYesterday}
                        className={`text-[11px] font-bold px-2.5 py-2 rounded-xl border ${themeStyles.inputBorder} ${themeStyles.inputBg} ${themeStyles.textHeading} hover:brightness-95 transition shadow-2xs cursor-pointer shrink-0 hidden sm:block`}
                        title="Filter to Yesterday"
                      >
                        Yest
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <div className="relative flex-1">
                        <input
                          id="sales-filter-start-date"
                          type="date"
                          placeholder="From"
                          value={filterDate}
                          onChange={(e) => setFilterDate(e.target.value)}
                          className={`w-full text-xs font-semibold px-2 py-2 rounded-xl border ${themeStyles.inputBorder} ${themeStyles.inputBg} ${themeStyles.textHeading} focus:outline-none focus:ring-2 focus:ring-indigo-500 transition shadow-2xs cursor-pointer`}
                          title="Start Date"
                        />
                      </div>
                      <span className={`text-xs font-bold ${themeStyles.textMuted}`}>–</span>
                      <div className="relative flex-1">
                        <input
                          id="sales-filter-end-date"
                          type="date"
                          placeholder="To"
                          value={filterEndDate}
                          onChange={(e) => setFilterEndDate(e.target.value)}
                          className={`w-full text-xs font-semibold px-2 py-2 rounded-xl border ${themeStyles.inputBorder} ${themeStyles.inputBg} ${themeStyles.textHeading} focus:outline-none focus:ring-2 focus:ring-indigo-500 transition shadow-2xs cursor-pointer`}
                          title="End Date"
                        />
                      </div>
                      {(filterDate || filterEndDate) && (
                        <button
                          type="button"
                          onClick={() => { setFilterDate(''); setFilterEndDate(''); }}
                          className={`p-2 rounded-xl border ${themeStyles.inputBorder} ${themeStyles.inputBg} text-rose-500 hover:text-rose-700 hover:brightness-95 transition cursor-pointer shrink-0`}
                          title="Clear date range"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Month Filter */}
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="sales-filter-month" className={`text-[11px] font-bold ${themeStyles.textMuted} uppercase tracking-wider flex items-center gap-1`}>
                    <Calendar className="w-3 h-3 text-indigo-500" />
                    <span>Month</span>
                  </label>
                  <select
                    id="sales-filter-month"
                    value={filterMonth}
                    onChange={(e) => setFilterMonth(e.target.value)}
                    className={`w-full text-xs font-semibold px-3 py-2 rounded-xl border ${themeStyles.inputBorder} ${themeStyles.inputBg} ${themeStyles.textHeading} focus:outline-none focus:ring-2 focus:ring-indigo-500 transition shadow-2xs cursor-pointer`}
                  >
                    {MONTH_OPTIONS.map(m => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Year Filter */}
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="sales-filter-year" className={`text-[11px] font-bold ${themeStyles.textMuted} uppercase tracking-wider flex items-center gap-1`}>
                    <Calendar className="w-3 h-3 text-fuchsia-500" />
                    <span>Year</span>
                  </label>
                  <select
                    id="sales-filter-year"
                    value={filterYear}
                    onChange={(e) => setFilterYear(e.target.value)}
                    className={`w-full text-xs font-semibold px-3 py-2 rounded-xl border ${themeStyles.inputBorder} ${themeStyles.inputBg} ${themeStyles.textHeading} focus:outline-none focus:ring-2 focus:ring-indigo-500 transition shadow-2xs cursor-pointer`}
                  >
                    <option value="ALL">All Years</option>
                    {availableYears.map(yr => (
                      <option key={yr} value={yr}>
                        {yr}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Week Filter */}
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="sales-filter-week" className={`text-[11px] font-bold ${themeStyles.textMuted} uppercase tracking-wider flex items-center gap-1`}>
                    <Calendar className="w-3 h-3 text-emerald-500" />
                    <span>Week</span>
                  </label>
                  <select
                    id="sales-filter-week"
                    value={filterWeek}
                    onChange={(e) => setFilterWeek(e.target.value)}
                    className={`w-full text-xs font-semibold px-3 py-2 rounded-xl border ${themeStyles.inputBorder} ${themeStyles.inputBg} ${themeStyles.textHeading} focus:outline-none focus:ring-2 focus:ring-indigo-500 transition shadow-2xs cursor-pointer`}
                  >
                    {WEEK_OPTIONS.map(w => (
                      <option key={w.value} value={w.value}>
                        {w.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Product Filter */}
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="sales-filter-product" className={`text-[11px] font-bold ${themeStyles.textMuted} uppercase tracking-wider flex items-center gap-1`}>
                    <Package className="w-3 h-3 text-amber-500" />
                    <span>Product</span>
                  </label>
                  <select
                    id="sales-filter-product"
                    value={selectedProduct}
                    onChange={(e) => setSelectedProduct(e.target.value)}
                    className={`w-full text-xs font-semibold px-3 py-2 rounded-xl border ${themeStyles.inputBorder} ${themeStyles.inputBg} ${themeStyles.textHeading} focus:outline-none focus:ring-2 focus:ring-indigo-500 transition shadow-2xs cursor-pointer truncate`}
                  >
                    <option value="ALL">All Products ({availableProducts.length})</option>
                    {availableProducts.map(p => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Search Box */}
                <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-6">
                  <label htmlFor="sales-search-input" className={`text-[11px] font-bold ${themeStyles.textMuted} uppercase tracking-wider flex items-center gap-1`}>
                    <Search className="w-3 h-3 text-sky-500" />
                    <span>Search Records</span>
                  </label>
                  <div className="relative">
                    <input
                      id="sales-search-input"
                      type="text"
                      placeholder="Product, SKU, State, Platform, Date..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className={`w-full text-xs font-medium pl-8 pr-7 py-2 rounded-xl border ${themeStyles.inputBorder} ${themeStyles.inputBg} ${themeStyles.textHeading} focus:outline-none focus:ring-2 focus:ring-indigo-500 transition shadow-2xs`}
                    />
                    <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer p-0.5 rounded"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Active Filter Chips */}
              {hasActiveFilters && (
                <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                  <span className={`text-[11px] font-bold ${themeStyles.textMuted} uppercase font-mono`}>Filtered By:</span>
                  
                  {filterDate && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800 font-bold text-[11px]">
                      <Calendar className="w-3 h-3 text-cyan-600 dark:text-cyan-400" />
                      <span>
                        Date: {formatDateDisplay(filterDate)}
                        {filterEndDate && ` – ${formatDateDisplay(filterEndDate)}`}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setFilterDate('');
                          setFilterEndDate('');
                        }}
                        className="hover:text-cyan-900 dark:hover:text-cyan-100 cursor-pointer ml-0.5"
                        title="Clear Date Filter"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}

                  {filterMonth !== 'ALL' && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 font-bold text-[11px]">
                      <span>Month: {MONTH_OPTIONS.find(m => m.value === filterMonth)?.label || filterMonth}</span>
                      <button type="button" onClick={() => setFilterMonth('ALL')} className="hover:text-indigo-900 cursor-pointer">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}

                  {filterYear !== 'ALL' && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-fuchsia-50 dark:bg-fuchsia-950/40 text-fuchsia-700 dark:text-fuchsia-300 border border-fuchsia-200 dark:border-fuchsia-800 font-bold text-[11px]">
                      <span>Year: {filterYear}</span>
                      <button type="button" onClick={() => setFilterYear('ALL')} className="hover:text-fuchsia-900 cursor-pointer">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}

                  {filterWeek !== 'ALL' && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-bold text-[11px]">
                      <span>Week: {WEEK_OPTIONS.find(w => w.value === filterWeek)?.label || filterWeek}</span>
                      <button type="button" onClick={() => setFilterWeek('ALL')} className="hover:text-emerald-900 cursor-pointer">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}

                  {selectedProduct !== 'ALL' && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 font-bold text-[11px]">
                      <span>Product: {selectedProduct}</span>
                      <button type="button" onClick={() => setSelectedProduct('ALL')} className="hover:text-amber-900 cursor-pointer">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}

                  {searchQuery.trim() && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 font-bold text-[11px]">
                      <span>Search: "{searchQuery}"</span>
                      <button type="button" onClick={() => setSearchQuery('')} className="hover:text-sky-900 cursor-pointer">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={resetFilters}
                    className={`ml-auto text-[11px] font-bold ${themeStyles.textMuted} hover:${themeStyles.textHeading} underline cursor-pointer`}
                  >
                    Clear All Filters
                  </button>
                </div>
              )}
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className={`${themeStyles.cardBg} rounded-2xl shadow-sm border ${themeStyles.cardBorder} p-6 flex items-center gap-5 transition-colors`}>
                <div className={`w-14 h-14 rounded-full ${themeStyles.kpiQtyBg} flex items-center justify-center flex-shrink-0 shadow-2xs`}>
                  <Package className="w-7 h-7 text-emerald-800" />
                </div>
                <div>
                  <p className={`text-sm font-bold ${themeStyles.textMuted} uppercase tracking-wide`}>Total Quantity Sold</p>
                  <p className={`text-3xl font-black ${themeStyles.textHeading} mt-1`}>{formatNumber(kpis.totalQty)}</p>
                </div>
              </div>
              <div className={`${themeStyles.cardBg} rounded-2xl shadow-sm border ${themeStyles.cardBorder} p-6 flex items-center gap-5 transition-colors`}>
                <div className={`w-14 h-14 rounded-full ${themeStyles.kpiRevBg} flex items-center justify-center flex-shrink-0 shadow-2xs`}>
                  <TrendingUp className="w-7 h-7 text-indigo-800" />
                </div>
                <div>
                  <p className={`text-sm font-bold ${themeStyles.textMuted} uppercase tracking-wide`}>Total Sales Revenue</p>
                  <p className={`text-3xl font-black ${themeStyles.textHeading} mt-1`}>{formatCurrency(kpis.totalRev)}</p>
                </div>
              </div>
            </div>

            {/* Data Grid */}
            <div className={`${themeStyles.cardBg} rounded-2xl shadow-sm border ${themeStyles.cardBorder} flex flex-col flex-1 overflow-hidden min-h-[500px] transition-colors`}>
              <div className={`px-5 py-4 border-b ${themeStyles.cardBorder} flex flex-wrap justify-between items-center gap-3 ${themeStyles.subSurface}`}>
                <div className="flex items-center flex-wrap gap-2.5">
                  <h3 className={`font-bold ${themeStyles.textHeading} flex items-center gap-2`}>
                    <BarChart3 className="w-5 h-5 text-[#375577]" />
                    {viewingMaster ? "2nd Sheet" : "Detailed Sales Report"}
                  </h3>
                  <span className={`${themeStyles.inputBg} ${themeStyles.textBody} border ${themeStyles.cardBorder} px-3 py-1 rounded-lg text-xs font-bold shadow-2xs`}>
                    {formatNumber(filteredData.length)} Records
                  </span>
                  {selectedRowIds.size > 0 && (
                    <span className="bg-[#ded4ec] text-[#3e2c5d] px-2.5 py-1 rounded-lg text-xs font-extrabold flex items-center gap-1 border border-[#c4b3dc]">
                      <CheckSquare className="w-3.5 h-3.5 text-[#554677]" />
                      {selectedRowIds.size} Selected
                    </span>
                  )}
                </div>

                {/* Central Action & Selection Controls */}
                <div className="flex items-center flex-wrap gap-2">
                  <button
                    type="button"
                    id="central-select-all-btn"
                    onClick={toggleSelectAll}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border inline-flex items-center gap-1.5 shadow-xs cursor-pointer ${
                      isAllSelected 
                        ? 'bg-[#333e4d] text-white border-[#333e4d]'
                        : selectedRowIds.size > 0
                        ? 'bg-[#ded4ec] text-[#3e2c5d] border-[#c4b3dc] hover:brightness-95'
                        : `${themeStyles.inputBg} ${themeStyles.textBody} border ${themeStyles.inputBorder} hover:brightness-95`
                    }`}
                    title={isAllSelected ? "Deselect All entries" : "Select All entries"}
                  >
                    <CheckSquare className="w-3.5 h-3.5" />
                    <span>{isAllSelected ? 'Deselect All' : `Select All (${filteredData.length})`}</span>
                  </button>

                  {viewingMaster ? (
                    <>
                      <button
                        type="button"
                        id="table-central-50-revert-btn"
                        onClick={handleCentral50RevertToMainSheet}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all border inline-flex items-center gap-1.5 shadow-xs cursor-pointer ${
                          selectedRowIds.size > 0
                            ? 'bg-[#37568a] hover:bg-[#2b4470] text-white border-[#2b4470] ring-2 ring-[#7a9bd0]'
                            : 'bg-[#d0ddf2] hover:bg-[#bdceeb] text-[#1e345b] border-[#a8bee0]'
                        }`}
                        title="Revert 50% of selected 2nd Sheet entries to Main Sheet with one click"
                      >
                        <PieChart className="w-3.5 h-3.5" />
                        <span>Central 50% Revert to Main Sheet</span>
                        {selectedRowIds.size > 0 && (
                          <span className="bg-black/25 text-white text-[10px] px-1.5 py-0.2 rounded-full font-black">
                            {selectedRowIds.size}
                          </span>
                        )}
                      </button>

                      <button
                        type="button"
                        id="table-central-100-revert-btn"
                        onClick={handleCentralRevert100Percent}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border inline-flex items-center gap-1.5 shadow-xs cursor-pointer ${
                          selectedRowIds.size > 0
                            ? 'bg-[#2b6851] hover:bg-[#205240] text-white border-[#205240] ring-2 ring-[#64a98d]'
                            : 'bg-[#cee3d7] hover:bg-[#bad8c6] text-[#194534] border-[#a3c9b4]'
                        }`}
                        title="Revert 100% of selected 2nd Sheet entries to Main Sheet with one click"
                      >
                        <ArchiveRestore className="w-3.5 h-3.5" />
                        <span>Central 100% Revert</span>
                        {selectedRowIds.size > 0 && (
                          <span className="bg-black/25 text-white text-[10px] px-1.5 py-0.2 rounded-full font-black">
                            {selectedRowIds.size}
                          </span>
                        )}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        id="table-central-40-adjustment-btn"
                        onClick={handleCentral40Adjustment}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border inline-flex items-center gap-1.5 shadow-xs cursor-pointer ${
                          selectedRowIds.size > 0
                            ? 'bg-[#c46823] hover:bg-[#ab581b] text-white border-[#ab581b] ring-2 ring-[#e8a36e]'
                            : 'bg-[#edd5bd] hover:bg-[#e2c6a9] text-[#733c14] border-[#d6b492]'
                        }`}
                        title="Adjust selected Detailed Sales Report entries by 40% in just one click"
                      >
                        <Percent className="w-3.5 h-3.5" />
                        <span>Central 40% Adjustment</span>
                        {selectedRowIds.size > 0 && (
                          <span className="bg-black/25 text-white text-[10px] px-1.5 py-0.2 rounded-full font-black">
                            {selectedRowIds.size}
                          </span>
                        )}
                      </button>

                      <button
                        type="button"
                        id="table-central-send-to-2nd-sheet-btn"
                        onClick={handleCentralSendTo2ndSheet}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border inline-flex items-center gap-1.5 shadow-xs cursor-pointer ${
                          selectedRowIds.size > 0
                            ? 'bg-[#554677] hover:bg-[#453662] text-white border-[#453662] ring-2 ring-[#9987be]'
                            : 'bg-[#ded4ec] hover:bg-[#cec0e0] text-[#3e2c5d] border-[#c4b3dc]'
                        }`}
                        title="Send selected Detailed Sales Report entries to 2nd Sheet in just one click"
                      >
                        <Archive className="w-3.5 h-3.5" />
                        <span>Central Send to 2nd Sheet</span>
                        {selectedRowIds.size > 0 && (
                          <span className="bg-black/25 text-white text-[10px] px-1.5 py-0.2 rounded-full font-black">
                            {selectedRowIds.size}
                          </span>
                        )}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Selection Notification & Action Banner */}
              {selectedRowIds.size > 0 && (
                <div className={`${themeStyles.subSurface} border-b ${themeStyles.cardBorder} px-5 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs`}>
                  <div className="flex items-center flex-wrap gap-2.5">
                    <span className={`font-extrabold ${themeStyles.textHeading} flex items-center gap-1.5`}>
                      <CheckSquare className="w-4 h-4 text-emerald-700" />
                      {selectedRowIds.size} of {filteredData.length} records selected
                    </span>
                    {selectedRowIds.size < filteredData.length ? (
                      <button
                        type="button"
                        onClick={handleSelectAllExplicit}
                        className={`${themeStyles.inputBg} ${themeStyles.textHeading} hover:brightness-95 font-bold underline cursor-pointer px-2 py-0.5 rounded border ${themeStyles.cardBorder} shadow-2xs`}
                      >
                        Select all {filteredData.length} records
                      </button>
                    ) : (
                      <span className="text-emerald-800 font-bold bg-emerald-100/80 px-2 py-0.5 rounded border border-emerald-300">
                        All records selected
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={handleDeselectAll}
                      className={`${themeStyles.textMuted} hover:${themeStyles.textHeading} font-medium underline cursor-pointer ml-1`}
                    >
                      Clear selection
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    {viewingMaster ? (
                      <>
                        <button
                          type="button"
                          onClick={handleCentral50RevertToMainSheet}
                          className="px-3 py-1 bg-[#37568a] hover:bg-[#2b4470] text-white font-bold rounded-lg transition-colors shadow-xs flex items-center gap-1 cursor-pointer"
                        >
                          <PieChart className="w-3.5 h-3.5" />
                          Revert 50% to Main Sheet ({selectedRowIds.size})
                        </button>
                        <button
                          type="button"
                          onClick={handleCentralRevert100Percent}
                          className="px-3 py-1 bg-[#2b6851] hover:bg-[#205240] text-white font-bold rounded-lg transition-colors shadow-xs flex items-center gap-1 cursor-pointer"
                        >
                          <ArchiveRestore className="w-3.5 h-3.5" />
                          Revert 100% ({selectedRowIds.size})
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={handleCentral40Adjustment}
                          className="px-3 py-1 bg-[#c46823] hover:bg-[#ab581b] text-white font-bold rounded-lg transition-colors shadow-xs flex items-center gap-1 cursor-pointer"
                        >
                          <Percent className="w-3.5 h-3.5" />
                          Apply 40% ({selectedRowIds.size})
                        </button>
                        <button
                          type="button"
                          onClick={handleCentralSendTo2ndSheet}
                          className="px-3 py-1 bg-[#554677] hover:bg-[#453662] text-white font-bold rounded-lg transition-colors shadow-xs flex items-center gap-1 cursor-pointer"
                        >
                          <Archive className="w-3.5 h-3.5" />
                          Send to 2nd Sheet ({selectedRowIds.size})
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
              
              <div className="flex-1 overflow-x-auto">
                <table className="w-full text-left border-collapse whitespace-nowrap min-w-[850px]">
                  <thead className={`${themeStyles.tableHeader} border-b ${themeStyles.tableBorder} transition-colors`}>
                    <tr>
                      <th className="py-3 px-3 text-center w-12">
                        <div className="flex items-center justify-center">
                          <input 
                            type="checkbox"
                            ref={headerCheckboxRef}
                            checked={isAllSelected}
                            onChange={toggleSelectAll}
                            className="w-4 h-4 text-[#375577] rounded border-black/20 focus:ring-[#375577] cursor-pointer accent-[#375577]"
                            title={isAllSelected ? "Deselect All" : "Select All"}
                            id="table-header-select-all-checkbox"
                          />
                        </div>
                      </th>
                      <th className={`py-3 px-5 text-xs font-bold ${themeStyles.textMuted} uppercase tracking-wider cursor-pointer hover:${themeStyles.subSurface}`} onClick={() => handleSort('productName')}>
                        <div className="flex items-center gap-1">
                          Product Name
                          {sortConfig.key === 'productName' && (sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                        </div>
                      </th>
                      <th className={`py-3 px-5 text-xs font-bold ${themeStyles.textMuted} uppercase tracking-wider cursor-pointer hover:${themeStyles.subSurface}`} onClick={() => handleSort('state')}>
                        <div className="flex items-center gap-1">
                          Platform
                          {sortConfig.key === 'state' && (sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                        </div>
                      </th>
                      <th className={`py-3 px-5 text-xs font-bold ${themeStyles.textMuted} uppercase tracking-wider cursor-pointer hover:${themeStyles.subSurface}`} onClick={() => handleSort('week')}>
                        <div className="flex items-center gap-1">
                          Week
                          {sortConfig.key === 'week' && (sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                        </div>
                      </th>
                      <th className={`py-3 px-5 text-xs font-bold ${themeStyles.textMuted} uppercase tracking-wider text-right cursor-pointer hover:${themeStyles.subSurface}`} onClick={() => handleSort('quantity')}>
                        <div className="flex items-center justify-end gap-1">
                          Quantity Sold
                          {sortConfig.key === 'quantity' && (sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                        </div>
                      </th>
                      <th className={`py-3 px-5 text-xs font-bold ${themeStyles.textMuted} uppercase tracking-wider text-right cursor-pointer hover:${themeStyles.subSurface}`} onClick={() => handleSort('netRevenue')}>
                        <div className="flex items-center justify-end gap-1">
                          Sale Amount
                          {sortConfig.key === 'netRevenue' && (sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                        </div>
                      </th>
                      <th className={`py-3 px-5 text-xs font-bold ${themeStyles.textMuted} uppercase tracking-wider text-center`}>
                        Entry Date
                      </th>
                      <th className={`py-3 px-5 text-xs font-bold ${themeStyles.textMuted} uppercase tracking-wider text-center`}>
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${themeStyles.tableDivide} transition-colors`}>
                    {paginatedData.map((row, i) => {
                      const isSelected = selectedRowIds.has(row.id);
                      const selectedBgClass = eyeTheme === 'dimmed' ? 'bg-[#293547] font-medium' : 'bg-[#e5ddd0] font-medium';
                      return (
                      <tr 
                        key={row.id || i} 
                        className={`transition-colors ${isSelected ? selectedBgClass : themeStyles.tableRowHover}`}
                      >
                        <td className="py-3 px-3 text-center w-12" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-center">
                            <input 
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleRowSelection(row.id)}
                              className="w-4 h-4 text-[#375577] rounded border-black/20 focus:ring-[#375577] cursor-pointer accent-[#375577]"
                              title={`Select ${row.productName || 'entry'}`}
                              id={`checkbox-row-${row.id}`}
                            />
                          </div>
                        </td>
                        <td className="py-3 px-5">
                          <p className={`text-sm font-bold ${themeStyles.textHeading}`}>{row.productName || 'Unknown Product'}</p>
                          <p className={`text-xs ${themeStyles.textMuted} mt-0.5`}>{row.skuName}</p>
                          {viewingMaster && row.revertHistory && row.revertHistory.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {row.revertHistory.map((pct: any, idx: any) => (
                                <span key={idx} className="text-[10px] text-[#2d4d7a] font-bold bg-[#d0ddf2] border border-[#a8bee0] px-1.5 py-0.5 rounded-md">
                                  Reverted: {pct}%
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-5">
                          {editingRowId === row.id ? (
                            <select 
                              className={`w-full min-w-[120px] px-2 py-1 text-sm border ${themeStyles.inputBorder} rounded focus:outline-none focus:ring-1 focus:ring-emerald-600 ${themeStyles.inputBg} ${themeStyles.textBody}`}
                              value={editRowData.state !== undefined ? editRowData.state : (row.state || '')}
                              onChange={e => setEditRowData({ ...editRowData, state: e.target.value })}
                            >
                              <option value="">Select Platform</option>
                              <option value="E-Commerce">E-Commerce</option>
                              <option value="Website">Website</option>
                            </select>
                          ) : (
                            <>
                              <p className={`text-sm font-medium ${themeStyles.textBody}`}>{row.state || row.zone || '-'}</p>
                              {row.district && <p className={`text-xs ${themeStyles.textMuted} mt-0.5`}>{row.district}</p>}
                            </>
                          )}
                        </td>
                        <td className="py-3 px-5">
                          {editingRowId === row.id ? (
                            <input 
                              type="text"
                              className={`w-full min-w-[80px] px-2 py-1 text-sm border ${themeStyles.inputBorder} rounded focus:outline-none focus:ring-1 focus:ring-emerald-600 ${themeStyles.inputBg} ${themeStyles.textBody}`}
                              value={editRowData.week !== undefined ? editRowData.week : (row.week || '')}
                              onChange={e => setEditRowData({ ...editRowData, week: e.target.value })}
                            />
                          ) : (
                            <>
                              <p className={`text-sm font-medium ${themeStyles.textBody}`}>{row.week || '-'}</p>
                              <p className={`text-xs ${themeStyles.textMuted} mt-0.5`}>{row.month} {row.year}</p>
                            </>
                          )}
                        </td>
                        <td className={`py-3 px-5 text-right text-sm font-bold ${themeStyles.textBody}`}>
                          {editingRowId === row.id ? (
                            <input 
                              type="number"
                              className={`w-24 px-2 py-1 text-right text-sm border ${themeStyles.inputBorder} rounded focus:outline-none focus:ring-1 focus:ring-emerald-600 ${themeStyles.inputBg} ${themeStyles.textBody}`}
                              value={editRowData.quantity !== undefined ? editRowData.quantity : row.quantity}
                              onChange={e => setEditRowData({ ...editRowData, quantity: Number(e.target.value) })}
                            />
                          ) : adjustingRowId === row.id ? (
                            <div className="flex flex-col items-end">
                              <span className={`line-through ${themeStyles.textMuted} text-xs`}>{formatNumber(row.quantity)}</span>
                              <span className="text-[#2b588a] font-bold">{formatNumber(Math.round(row.quantity * (adjustPercentage / 100)))}</span>
                            </div>
                          ) : (
                            <div className="flex flex-col items-end">
                              {row.adjustmentPercentage !== undefined && row.adjustmentPercentage !== 100 ? (
                                <>
                                  <span className={`line-through ${themeStyles.textMuted} text-xs`}>{formatNumber(row.originalQuantity !== undefined ? row.originalQuantity : Math.round(row.quantity / (row.adjustmentPercentage / 100)))}</span>
                                  <div className="flex items-center gap-1.5 mt-0.5">
                                    <span className="text-[#2b588a] font-bold">{formatNumber(row.quantity)}</span>
                                    <span className="text-[10px] text-[#733c14] font-bold bg-[#edd5bd] px-1.5 py-0.5 rounded-md border border-[#d6b492]">{row.adjustmentPercentage}% Adj.</span>
                                  </div>
                                </>
                              ) : (
                                <>
                                  <span>{formatNumber(row.quantity)}</span>
                                  {viewingMaster && row.revertHistory && row.revertHistory.length > 0 && (
                                    <span className="text-[10px] text-[#2d4d7a] font-bold bg-[#d0ddf2] border border-[#a8bee0] px-1.5 py-0.5 rounded-md mt-0.5">
                                      {formatNumber(row.revertHistory.reduce((acc: any, pct: any) => acc + Math.round(row.quantity * (pct / 100)), 0))} Reverted
                                    </span>
                                  )}
                                </>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-5 text-right text-sm font-bold text-emerald-700">
                          {editingRowId === row.id ? (
                            <div className="flex justify-end items-center gap-1">
                              <span className={themeStyles.textMuted}>₹</span>
                              <input 
                                type="number"
                                step="0.01"
                                className={`w-28 px-2 py-1 text-right text-sm border ${themeStyles.inputBorder} rounded focus:outline-none focus:ring-1 focus:ring-emerald-600 ${themeStyles.inputBg} ${themeStyles.textBody}`}
                                value={editRowData.netRevenue !== undefined ? editRowData.netRevenue : (row.netRevenue || row.grossSales)}
                                onChange={e => {
                                  const netRevenue = Number(e.target.value);
                                  setEditRowData({ ...editRowData, netRevenue, grossSales: netRevenue });
                                }}
                              />
                            </div>
                          ) : adjustingRowId === row.id ? (
                            <div className="flex flex-col items-end">
                              <span className={`line-through ${themeStyles.textMuted} text-xs`}>{formatCurrency(row.netRevenue || row.grossSales)}</span>
                              <span className="text-[#2b588a] font-bold">{formatCurrency((row.netRevenue || row.grossSales) * (adjustPercentage / 100))}</span>
                            </div>
                          ) : (
                            <div className="flex flex-col items-end">
                              {row.adjustmentPercentage !== undefined && row.adjustmentPercentage !== 100 ? (
                                <>
                                  <span className={`line-through ${themeStyles.textMuted} text-xs`}>{formatCurrency(row.originalNetRevenue !== undefined ? row.originalNetRevenue : ((row.netRevenue || row.grossSales) / (row.adjustmentPercentage / 100)))}</span>
                                  <div className="flex items-center gap-1.5 mt-0.5">
                                    <span className="text-emerald-700 font-bold">{formatCurrency(row.netRevenue || row.grossSales)}</span>
                                    <span className="text-[10px] text-[#194534] font-bold bg-[#cee3d7] border border-[#a3c9b4] px-1.5 py-0.5 rounded-md">{row.adjustmentPercentage}% Adj.</span>
                                  </div>
                                </>
                              ) : (
                                <>
                                  <span>{formatCurrency(row.netRevenue || row.grossSales)}</span>
                                  {viewingMaster && row.revertHistory && row.revertHistory.length > 0 && (
                                    <span className="text-[10px] text-[#2d4d7a] font-bold bg-[#d0ddf2] border border-[#a8bee0] px-1.5 py-0.5 rounded-md mt-0.5">
                                      {formatCurrency(row.revertHistory.reduce((acc: any, pct: any) => acc + ((row.netRevenue || row.grossSales) * (pct / 100)), 0))} Reverted
                                    </span>
                                  )}
                                </>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-5 text-center text-xs font-mono">
                          {row.manualEntryDate ? (
                            <div className="flex flex-col items-center justify-center leading-tight">
                              <span className="text-red-700">{row.manualEntryDate.includes(',') ? row.manualEntryDate.split(',')[0].trim() : row.manualEntryDate.split(' ')[0]}</span>
                              <span className="text-emerald-800 mt-0.5">{(() => {
                                const timeStr = row.manualEntryDate.includes(',') ? row.manualEntryDate.split(',').slice(1).join(',').trim() : row.manualEntryDate.split(' ').slice(1).join(' ');
                                if (!timeStr) return '';
                                if (timeStr.toLowerCase().includes('am') || timeStr.toLowerCase().includes('pm')) return timeStr;
                                const parts = timeStr.split(':');
                                if (parts.length >= 2) {
                                  let h = parseInt(parts[0], 10);
                                  const m = parts[1];
                                  const s = parts[2] ? ':' + parts[2].split(' ')[0] : '';
                                  const ampm = h >= 12 ? 'PM' : 'AM';
                                  h = h % 12;
                                  h = h ? h : 12;
                                  return `${h}:${m}${s} ${ampm}`;
                                }
                                return timeStr;
                              })()}</span>
                            </div>
                          ) : (
                            <span className={themeStyles.textMuted}>-</span>
                          )}
                        </td>
                        <td className="py-3 px-5 text-center">
                          {editingRowId === row.id ? (
                            <div className="flex justify-center gap-2">
                              <button onClick={handleSaveEdit} className="p-1.5 bg-[#cee3d7] text-[#194534] rounded-lg hover:brightness-95 transition-colors cursor-pointer" title="Save">
                                <Check className="w-4 h-4" />
                              </button>
                              <button onClick={handleCancelEdit} className="p-1.5 bg-[#edd5bd] text-[#733c14] rounded-lg hover:brightness-95 transition-colors cursor-pointer" title="Cancel">
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            adjustingRowId === row.id ? (
                            <div className="flex flex-col gap-2">
                              <div className="flex items-center gap-2">
                                <input type="range" min="0" max="100" value={adjustPercentage} onChange={e => setAdjustPercentage(Number(e.target.value))} className="w-24 accent-[#2f634b]" />
                                <span className={`text-xs font-bold w-8 ${themeStyles.textHeading}`}>{adjustPercentage}%</span>
                              </div>
                              <div className="flex justify-center items-center gap-1">
                                <button type="button" onClick={() => setAdjustPercentage(50)} className="px-1.5 py-0.5 text-[10px] font-bold bg-[#d0ddf2] text-[#1e345b] hover:brightness-95 rounded border border-[#a8bee0] cursor-pointer" title="Set to 50%">50%</button>
                                <button type="button" onClick={() => setAdjustPercentage(40)} className="px-1.5 py-0.5 text-[10px] font-bold bg-[#edd5bd] text-[#733c14] hover:brightness-95 rounded border border-[#d6b492] cursor-pointer" title="Set to 40%">40%</button>
                                <button onClick={() => handleAdjustAndRevert(row)} className="p-1.5 bg-[#cee3d7] text-[#194534] rounded-lg hover:brightness-95 transition-colors cursor-pointer" title="Confirm Adjust & Revert">
                                  <Check className="w-4 h-4" />
                                </button>
                                <button onClick={() => setAdjustingRowId(null)} className="p-1.5 bg-[#edd5bd] text-[#733c14] rounded-lg hover:brightness-95 transition-colors cursor-pointer" title="Cancel">
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex justify-center items-center gap-1">
                              {!viewingMaster ? (
                                <>
                                  <button onClick={() => handleEditClick(row)} className={`p-1.5 ${themeStyles.textMuted} hover:${themeStyles.textHeading} hover:bg-black/5 rounded-lg transition-colors cursor-pointer`} title="Edit row">
                                    <Pencil className="w-4 h-4" />
                                  </button>
                                  <button onClick={() => handleSendToMaster(row)} className={`p-1.5 ${themeStyles.textMuted} hover:${themeStyles.textHeading} hover:bg-black/5 rounded-lg transition-colors cursor-pointer`} title="Send to 2nd Sheet">
                                    <Archive className="w-4 h-4" />
                                  </button>
                                  <button onClick={() => handleDeleteRow(row.id)} className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer" title="Delete row">
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button 
                                    id={`revert-50-btn-${row.id}`}
                                    onClick={() => handleRevert50Percent(row)} 
                                    className={`p-1.5 ${themeStyles.textMuted} hover:${themeStyles.textHeading} hover:bg-black/5 rounded-lg transition-colors cursor-pointer`} 
                                    title="50% Revert to Main Sheet"
                                    aria-label="50% Revert to Main Sheet"
                                  >
                                    <PieChart className="w-4 h-4" />
                                  </button>
                                  <button onClick={() => handleStartAdjust(row)} className={`p-1.5 ${themeStyles.textMuted} hover:${themeStyles.textHeading} hover:bg-black/5 rounded-lg transition-colors cursor-pointer`} title="Adjust Percentage and Revert">
                                    <Percent className="w-4 h-4" />
                                  </button>
                                  <button onClick={() => handleRevertFromMaster(row)} className={`p-1.5 ${themeStyles.textMuted} hover:${themeStyles.textHeading} hover:bg-black/5 rounded-lg transition-colors cursor-pointer`} title="Revert to Main Sheet">
                                    <ArchiveRestore className="w-4 h-4" />
                                  </button>
                                  <button onClick={() => handleDeleteMasterRow(row.id)} className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer" title="Delete 2nd Sheet permanently">
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </>
                              )}
                            </div>
                          )
                          )}
                        </td>
                      </tr>
                    );
                    })}
                    {paginatedData.length === 0 && (
                      <tr>
                        <td colSpan={8} className={`py-12 text-center ${themeStyles.textMuted} font-medium ${themeStyles.subSurface}`}>
                          <div className="flex flex-col items-center justify-center gap-3">
                            <p className="text-sm">No matching records found for the selected filters.</p>
                            {hasActiveFilters && (
                              <button
                                type="button"
                                onClick={resetFilters}
                                className="text-xs font-bold px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition cursor-pointer flex items-center gap-1.5 shadow-xs"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                <span>Reset All Filters</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className={`border-t ${themeStyles.cardBorder} px-5 py-3 flex items-center justify-between ${themeStyles.subSurface}`}>
                  <div className={`text-sm ${themeStyles.textMuted} font-medium`}>
                    Showing <span className={`font-bold ${themeStyles.textHeading}`}>{(currentPage - 1) * rowsPerPage + 1}</span> to <span className={`font-bold ${themeStyles.textHeading}`}>{Math.min(currentPage * rowsPerPage, filteredData.length)}</span> of <span className={`font-bold ${themeStyles.textHeading}`}>{filteredData.length}</span> results
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className={`p-1.5 rounded-lg border ${themeStyles.cardBorder} ${themeStyles.textBody} ${themeStyles.inputBg} hover:brightness-95 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer`}
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className={`p-1.5 rounded-lg border ${themeStyles.cardBorder} ${themeStyles.textBody} ${themeStyles.inputBg} hover:brightness-95 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer`}
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Floating ADD RECORD Button in good looking red color */}
        <div className="fixed bottom-6 right-6 z-40 sm:bottom-8 sm:right-8 print:hidden">
          <button
            type="button"
            onClick={() => setShowManualForm(true)}
            id="floating-add-record-btn"
            className="group relative inline-flex items-center gap-2.5 px-5 py-3.5 sm:px-6 sm:py-4 rounded-full bg-gradient-to-r from-red-600 via-rose-600 to-red-700 hover:from-red-500 hover:via-rose-500 hover:to-red-600 active:from-red-700 active:to-rose-800 text-white font-black text-xs sm:text-sm tracking-wider uppercase shadow-xl shadow-red-600/35 hover:shadow-2xl hover:shadow-red-600/50 ring-1 ring-white/30 border border-red-400/40 transition-all duration-200 transform hover:-translate-y-1 active:scale-95 cursor-pointer"
            title="Add New Sales Record"
            aria-label="Add Record"
          >
            {/* Subtle animated ambient indicator */}
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white"></span>
            </span>

            <Plus className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2.75] transition-transform duration-300 group-hover:rotate-90" />
            <span>ADD RECORD</span>
          </button>
        </div>
      </div>
    </div>
  );
}
