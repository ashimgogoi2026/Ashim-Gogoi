import React, { useState, useMemo, useEffect } from 'react';
import { 
  X, BarChart3, TrendingUp, TrendingDown, Calendar, Filter, 
  Package, DollarSign, Layers, ArrowUpRight, ArrowDownRight, 
  Minus, RefreshCw, Download, FileSpreadsheet, Sparkles, 
  ChevronRight, CheckCircle2, AlertTriangle, Search
} from 'lucide-react';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { ThemeStyles } from '../context/ThemeContext';

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
  [key: string]: any;
}

interface SalesSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: SalesRow[];
  masterData: SalesRow[];
  themeStyles: ThemeStyles;
  formatCurrency: (val: number) => string;
  formatNumber: (val: number) => string;
  availableProducts: string[];
  availableYears: string[];
  initialViewingMaster?: boolean;
}

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

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

const MONTH_FULL_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
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
  may: '05', june: '06',
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

const extractRowDateToYMD = (row: SalesRow): string | null => {
  const raw = row.manualEntryDate || row.date || row.Date || row['Date & Time'] || row.orderDate || row['Order Date'] || row.timestamp || '';
  if (raw) {
    const str = String(raw).trim();
    const isoMatch = str.match(/\b(20\d\d)[/-](\d{1,2})[/-](\d{1,2})\b/);
    if (isoMatch) {
      return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
    }
    const dmyMatch = str.match(/\b(\d{1,2})[/-](\d{1,2})[/-](20\d\d)\b/);
    if (dmyMatch) {
      return `${dmyMatch[3]}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[1].padStart(2, '0')}`;
    }
    const parsed = new Date(str);
    if (!isNaN(parsed.getTime()) && parsed.getFullYear() >= 2000 && parsed.getFullYear() <= 2099) {
      const y = parsed.getFullYear().toString();
      const m = (parsed.getMonth() + 1).toString().padStart(2, '0');
      const d = parsed.getDate().toString().padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }

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

export default function SalesSummaryModal({
  isOpen,
  onClose,
  data,
  masterData,
  themeStyles,
  formatCurrency,
  formatNumber,
  availableProducts,
  availableYears,
  initialViewingMaster = false
}: SalesSummaryModalProps) {
  // Default to current year and current month
  const currentDate = new Date();
  const currentYearStr = currentDate.getFullYear().toString();
  const currentMonthStr = String(currentDate.getMonth() + 1).padStart(2, '0');

  // Filters State
  const [selectedYear, setSelectedYear] = useState<string>(currentYearStr);
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthStr);
  const [selectedWeek, setSelectedWeek] = useState<string>('ALL');
  const [selectedProduct, setSelectedProduct] = useState<string>('ALL');
  const [sheetSource, setSheetSource] = useState<'main' | 'master' | 'both'>(
    initialViewingMaster ? 'master' : 'main'
  );

  // Active View Tab: 'charts' (growth/degrowth) vs 'details' (product table & KPIs) vs 'records'
  const [activeTab, setActiveTab] = useState<'charts' | 'details' | 'records'>('charts');

  // Hovered item for interactive chart tooltip
  const [hoveredPoint, setHoveredPoint] = useState<{
    label: string;
    revenue: number;
    qty: number;
    growthPct: number | null;
    prevRevenue: number | null;
  } | null>(null);

  const [recordSearch, setRecordSearch] = useState<string>('');

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Combined source data based on sheetSource selector
  const currentSourceData = useMemo(() => {
    if (sheetSource === 'main') return data;
    if (sheetSource === 'master') return masterData;
    return [...data, ...masterData];
  }, [sheetSource, data, masterData]);

  // Filter helper
  const filterRows = (
    rows: SalesRow[],
    y: string,
    m: string,
    w: string,
    prod: string
  ): SalesRow[] => {
    return rows.filter(row => {
      // Product Filter
      if (prod !== 'ALL') {
        const pName = (row.productName || '').trim().toLowerCase();
        if (pName !== prod.trim().toLowerCase()) return false;
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

      // Year Filter
      if (y !== 'ALL') {
        const rowYear = normalizeYear(row.year) || fallbackYear;
        if (rowYear && rowYear !== y) return false;
        if (!rowYear) return false;
      }

      // Month Filter
      if (m !== 'ALL') {
        const normTargetMonth = normalizeMonth(m);
        const rowMonth = normalizeMonth(row.month) || fallbackMonth;
        if (rowMonth && rowMonth !== normTargetMonth) return false;
        if (!rowMonth) return false;
      }

      // Week Filter
      if (w !== 'ALL') {
        const rowWeek = normalizeWeek(row.week) || fallbackWeek;
        if (!rowWeek) return false;
        if (w === '1-2' || w === '1st & 2nd week') {
          if (rowWeek !== '1' && rowWeek !== '2') return false;
        } else if (w === '1-3' || w === '1st, 2nd, 3rd week') {
          if (rowWeek !== '1' && rowWeek !== '2' && rowWeek !== '3') return false;
        } else if (w === '1-4' || w === '1st, 2nd, 3rd, 4th week') {
          if (rowWeek !== '1' && rowWeek !== '2' && rowWeek !== '3' && rowWeek !== '4') return false;
        } else {
          const normTargetWeek = normalizeWeek(w);
          if (rowWeek !== normTargetWeek) return false;
        }
      }

      return true;
    });
  };

  // Filtered records for current active selection
  const currentPeriodRows = useMemo(() => {
    return filterRows(currentSourceData, selectedYear, selectedMonth, selectedWeek, selectedProduct);
  }, [currentSourceData, selectedYear, selectedMonth, selectedWeek, selectedProduct]);

  // Current period totals
  const currentMetrics = useMemo(() => {
    let revenue = 0;
    let quantity = 0;
    let gross = 0;
    const productCountMap = new Map<string, number>();

    currentPeriodRows.forEach(r => {
      revenue += r.netRevenue || r.grossSales || 0;
      gross += r.grossSales || r.netRevenue || 0;
      quantity += r.quantity || 0;
      if (r.productName) {
        productCountMap.set(r.productName, (productCountMap.get(r.productName) || 0) + (r.netRevenue || r.grossSales || 0));
      }
    });

    // Determine top product
    let topProduct = 'None';
    let topProductRev = 0;
    productCountMap.forEach((rev, name) => {
      if (rev > topProductRev) {
        topProductRev = rev;
        topProduct = name;
      }
    });

    const avgOrderValue = currentPeriodRows.length > 0 ? revenue / currentPeriodRows.length : 0;
    const avgPricePerUnit = quantity > 0 ? revenue / quantity : 0;

    return {
      revenue,
      gross,
      quantity,
      recordCount: currentPeriodRows.length,
      topProduct,
      topProductRev,
      avgOrderValue,
      avgPricePerUnit
    };
  }, [currentPeriodRows]);

  // Previous period calculation for Growth / Degrowth
  const previousPeriodContext = useMemo(() => {
    let prevYear = selectedYear;
    let prevMonth = selectedMonth;
    let prevWeek = selectedWeek;
    let label = '';

    if (selectedWeek !== 'ALL' && selectedMonth !== 'ALL') {
      // Week over Week (WoW)
      const wNum = parseInt(selectedWeek, 10);
      if (!isNaN(wNum) && wNum > 1) {
        prevWeek = (wNum - 1).toString();
        label = `Week ${prevWeek}, ${MONTH_NAMES[parseInt(selectedMonth, 10) - 1]} ${selectedYear}`;
      } else {
        // Week 1 -> previous month's last week
        const mNum = parseInt(selectedMonth, 10);
        if (mNum === 1) {
          prevMonth = '12';
          prevYear = selectedYear !== 'ALL' ? (parseInt(selectedYear, 10) - 1).toString() : 'ALL';
        } else {
          prevMonth = String(mNum - 1).padStart(2, '0');
        }
        prevWeek = '4';
        label = `W4, ${MONTH_NAMES[parseInt(prevMonth, 10) - 1]} ${prevYear !== 'ALL' ? prevYear : ''}`;
      }
    } else if (selectedMonth !== 'ALL') {
      // Month over Month (MoM)
      const mNum = parseInt(selectedMonth, 10);
      if (mNum === 1) {
        prevMonth = '12';
        prevYear = selectedYear !== 'ALL' ? (parseInt(selectedYear, 10) - 1).toString() : 'ALL';
      } else {
        prevMonth = String(mNum - 1).padStart(2, '0');
      }
      label = `${MONTH_NAMES[parseInt(prevMonth, 10) - 1]} ${prevYear !== 'ALL' ? prevYear : ''}`;
    } else if (selectedYear !== 'ALL') {
      // Year over Year (YoY)
      prevYear = (parseInt(selectedYear, 10) - 1).toString();
      label = `Year ${prevYear}`;
    } else {
      label = 'Previous Baseline';
    }

    const prevRows = filterRows(currentSourceData, prevYear, prevMonth, prevWeek, selectedProduct);
    let prevRevenue = 0;
    let prevQuantity = 0;
    prevRows.forEach(r => {
      prevRevenue += r.netRevenue || r.grossSales || 0;
      prevQuantity += r.quantity || 0;
    });

    const diffRevenue = currentMetrics.revenue - prevRevenue;
    const diffQuantity = currentMetrics.quantity - prevQuantity;
    const revenueGrowthPct = prevRevenue > 0 
      ? ((currentMetrics.revenue - prevRevenue) / prevRevenue) * 100 
      : (currentMetrics.revenue > 0 ? 100 : 0);
    const quantityGrowthPct = prevQuantity > 0 
      ? ((currentMetrics.quantity - prevQuantity) / prevQuantity) * 100 
      : (currentMetrics.quantity > 0 ? 100 : 0);

    return {
      label,
      prevRevenue,
      prevQuantity,
      diffRevenue,
      diffQuantity,
      revenueGrowthPct,
      quantityGrowthPct,
      isGrowth: diffRevenue >= 0,
      isNeutral: diffRevenue === 0 && prevRevenue === 0
    };
  }, [currentSourceData, selectedYear, selectedMonth, selectedWeek, selectedProduct, currentMetrics]);

  // Monthly Timeline Data for Graph (e.g. all 12 months of selectedYear or currentYear)
  const monthlyGraphData = useMemo(() => {
    const yearToUse = selectedYear !== 'ALL' ? selectedYear : currentYearStr;
    const dataByMonth: {
      monthKey: string;
      monthName: string;
      revenue: number;
      quantity: number;
      growthPct: number | null;
      prevRevenue: number | null;
    }[] = [];

    let prevMonthRev: number | null = null;

    for (let i = 1; i <= 12; i++) {
      const mStr = String(i).padStart(2, '0');
      const rows = filterRows(currentSourceData, yearToUse, mStr, 'ALL', selectedProduct);
      let rev = 0;
      let qty = 0;
      rows.forEach(r => {
        rev += r.netRevenue || r.grossSales || 0;
        qty += r.quantity || 0;
      });

      let growthPct: number | null = null;
      if (prevMonthRev !== null) {
        if (prevMonthRev > 0) {
          growthPct = ((rev - prevMonthRev) / prevMonthRev) * 100;
        } else if (rev > 0) {
          growthPct = 100;
        } else {
          growthPct = 0;
        }
      }

      dataByMonth.push({
        monthKey: mStr,
        monthName: MONTH_NAMES[i - 1],
        revenue: rev,
        quantity: qty,
        growthPct,
        prevRevenue: prevMonthRev
      });

      prevMonthRev = rev;
    }

    return {
      year: yearToUse,
      months: dataByMonth
    };
  }, [currentSourceData, selectedYear, selectedProduct, currentYearStr]);

  // Weekly Breakdown Data for Graph (when a specific month is selected)
  const weeklyGraphData = useMemo(() => {
    if (selectedMonth === 'ALL') return null;

    const weeks = ['1', '2', '3', '4', '5'];
    let prevRev: number | null = null;

    return weeks.map(w => {
      const rows = filterRows(currentSourceData, selectedYear, selectedMonth, w, selectedProduct);
      let rev = 0;
      let qty = 0;
      rows.forEach(r => {
        rev += r.netRevenue || r.grossSales || 0;
        qty += r.quantity || 0;
      });

      let growthPct: number | null = null;
      if (prevRev !== null) {
        if (prevRev > 0) {
          growthPct = ((rev - prevRev) / prevRev) * 100;
        } else if (rev > 0) {
          growthPct = 100;
        } else {
          growthPct = 0;
        }
      }

      prevRev = rev;

      return {
        week: w,
        label: `W${w}`,
        title: `Week ${w} (Days ${(parseInt(w) - 1) * 7 + 1}–${Math.min(parseInt(w) * 7, 31)})`,
        revenue: rev,
        quantity: qty,
        growthPct
      };
    });
  }, [currentSourceData, selectedYear, selectedMonth, selectedProduct]);

  // Product-wise breakdown & growth matrix
  const productBreakdown = useMemo(() => {
    const prodMap = new Map<string, { currentRev: number; currentQty: number; prevRev: number; prevQty: number }>();

    // Current period
    currentPeriodRows.forEach(r => {
      const name = (r.productName || 'Unassigned').trim();
      const existing = prodMap.get(name) || { currentRev: 0, currentQty: 0, prevRev: 0, prevQty: 0 };
      existing.currentRev += r.netRevenue || r.grossSales || 0;
      existing.currentQty += r.quantity || 0;
      prodMap.set(name, existing);
    });

    // Previous period for comparison
    let prevYear = selectedYear;
    let prevMonth = selectedMonth;
    if (selectedMonth !== 'ALL') {
      const mNum = parseInt(selectedMonth, 10);
      if (mNum === 1) {
        prevMonth = '12';
        prevYear = selectedYear !== 'ALL' ? (parseInt(selectedYear, 10) - 1).toString() : 'ALL';
      } else {
        prevMonth = String(mNum - 1).padStart(2, '0');
      }
    } else if (selectedYear !== 'ALL') {
      prevYear = (parseInt(selectedYear, 10) - 1).toString();
    }

    const prevRows = filterRows(currentSourceData, prevYear, prevMonth, selectedWeek, 'ALL');
    prevRows.forEach(r => {
      const name = (r.productName || 'Unassigned').trim();
      if (prodMap.has(name) || selectedProduct === 'ALL') {
        const existing = prodMap.get(name) || { currentRev: 0, currentQty: 0, prevRev: 0, prevQty: 0 };
        existing.prevRev += r.netRevenue || r.grossSales || 0;
        existing.prevQty += r.quantity || 0;
        prodMap.set(name, existing);
      }
    });

    const totalRev = currentMetrics.revenue || 1;

    return Array.from(prodMap.entries())
      .map(([productName, stats]) => {
        const diffRev = stats.currentRev - stats.prevRev;
        const growthPct = stats.prevRev > 0
          ? ((stats.currentRev - stats.prevRev) / stats.prevRev) * 100
          : (stats.currentRev > 0 ? 100 : 0);
        const revenueSharePct = (stats.currentRev / totalRev) * 100;

        return {
          productName,
          revenue: stats.currentRev,
          quantity: stats.currentQty,
          prevRevenue: stats.prevRev,
          diffRev,
          growthPct,
          revenueSharePct,
          isGrowth: diffRev >= 0
        };
      })
      .sort((a, b) => b.revenue - a.revenue);
  }, [currentPeriodRows, currentSourceData, selectedYear, selectedMonth, selectedWeek, selectedProduct, currentMetrics.revenue]);

  // Export filtered summary to Excel
  const handleExportSummaryExcel = () => {
    try {
      const summaryRows = productBreakdown.map(p => ({
        'Product Name': p.productName,
        'Period': `${selectedMonth !== 'ALL' ? MONTH_FULL_NAMES[parseInt(selectedMonth, 10) - 1] : 'All Months'} ${selectedYear}`,
        'Week': selectedWeek !== 'ALL' ? `Week ${selectedWeek}` : 'All Weeks',
        'Units Sold': p.quantity,
        'Net Revenue (₹)': p.revenue,
        'Previous Period Revenue (₹)': p.prevRevenue,
        'Growth / Degrowth (%)': `${p.growthPct >= 0 ? '+' : ''}${p.growthPct.toFixed(1)}%`,
        'Revenue Share (%)': `${p.revenueSharePct.toFixed(1)}%`
      }));

      const ws = XLSX.utils.json_to_sheet(summaryRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Sales Summary");
      XLSX.writeFile(wb, `Sales_Summary_${selectedMonth}_${selectedYear}.xlsx`);
    } catch (err) {
      console.error('Export error:', err);
    }
  };

  // Export filtered detailed records to CSV
  const handleExportRecordsCSV = () => {
    try {
      const csvData = currentPeriodRows.map(r => ({
        'ID': r.id,
        'Year': r.year,
        'Month': r.month,
        'Week': r.week,
        'Product': r.productName,
        'Platform/State': r.state,
        'Quantity': r.quantity,
        'Net Revenue': r.netRevenue,
        'Entry Date': r.manualEntryDate || ''
      }));
      const csv = Papa.unparse(csvData);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Sales_Records_${selectedMonth}_${selectedYear}.csv`;
      link.click();
    } catch (err) {
      console.error('CSV export error:', err);
    }
  };

  if (!isOpen) return null;

  // Max value for monthly timeline chart scaling
  const maxMonthlyRevenue = Math.max(...monthlyGraphData.months.map(m => m.revenue), 100);
  const maxWeeklyRevenue = weeklyGraphData ? Math.max(...weeklyGraphData.map(w => w.revenue), 100) : 100;
  const maxProductRevenue = Math.max(...productBreakdown.map(p => p.revenue), 100);

  // Filtered detailed records based on search
  const filteredDetailRecords = currentPeriodRows.filter(r => {
    if (!recordSearch.trim()) return true;
    const q = recordSearch.toLowerCase();
    return (
      (r.productName || '').toLowerCase().includes(q) ||
      (r.state || '').toLowerCase().includes(q) ||
      (r.skuName || '').toLowerCase().includes(q) ||
      (r.manualEntryDate || '').toLowerCase().includes(q)
    );
  });

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200 print:hidden"
      onClick={onClose}
    >
      <div 
        className={`relative w-full max-w-5xl max-h-[94vh] flex flex-col rounded-3xl border ${themeStyles.cardBorder} shadow-2xl ${themeStyles.cardBg} transition-all overflow-hidden`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-zinc-800 bg-gradient-to-r from-blue-50/50 via-indigo-50/20 to-transparent dark:from-blue-950/20 dark:via-transparent dark:to-transparent flex-shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="p-2.5 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-md shadow-blue-500/25">
              <BarChart3 className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className={`font-black text-lg sm:text-xl tracking-tight ${themeStyles.textHeading}`}>
                  Sales Summary & Growth Analytics
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-black tracking-wide uppercase bg-blue-100 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                  {selectedMonth !== 'ALL' ? MONTH_FULL_NAMES[parseInt(selectedMonth, 10) - 1] : 'All Months'} {selectedYear !== 'ALL' ? selectedYear : ''}
                </span>
              </div>
              <p className={`text-xs ${themeStyles.textMuted}`}>
                Real-time breakdown of revenue, volume, and visual sales growth vs. degrowth trends
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportSummaryExcel}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition cursor-pointer shadow-2xs"
              title="Export Summary Report as Excel"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Export Summary</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-800 transition cursor-pointer"
              title="Close (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filter Controls Toolbar */}
        <div className={`p-4 border-b ${themeStyles.cardBorder} ${themeStyles.subSurface} space-y-3 flex-shrink-0`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Filter Inputs Group */}
            <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
              {/* Year Dropdown */}
              <div className="flex items-center gap-1.5">
                <span className={`text-[11px] font-bold uppercase tracking-wider ${themeStyles.textMuted}`}>Year:</span>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-bold border ${themeStyles.inputBorder} ${themeStyles.inputBg} ${themeStyles.textBody} outline-none focus:ring-2 focus:ring-blue-500 transition shadow-2xs cursor-pointer`}
                >
                  <option value="ALL">All Years</option>
                  {availableYears.map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>

              {/* Month Dropdown */}
              <div className="flex items-center gap-1.5">
                <span className={`text-[11px] font-bold uppercase tracking-wider ${themeStyles.textMuted}`}>Month:</span>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-bold border ${themeStyles.inputBorder} ${themeStyles.inputBg} ${themeStyles.textBody} outline-none focus:ring-2 focus:ring-blue-500 transition shadow-2xs cursor-pointer`}
                >
                  {MONTH_OPTIONS.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>

              {/* Week Dropdown */}
              <div className="flex items-center gap-1.5">
                <span className={`text-[11px] font-bold uppercase tracking-wider ${themeStyles.textMuted}`}>Week:</span>
                <select
                  value={selectedWeek}
                  onChange={(e) => setSelectedWeek(e.target.value)}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-bold border ${themeStyles.inputBorder} ${themeStyles.inputBg} ${themeStyles.textBody} outline-none focus:ring-2 focus:ring-blue-500 transition shadow-2xs cursor-pointer`}
                >
                  {WEEK_OPTIONS.map(w => (
                    <option key={w.value} value={w.value}>{w.label}</option>
                  ))}
                </select>
              </div>

              {/* Product Dropdown */}
              <div className="flex items-center gap-1.5">
                <span className={`text-[11px] font-bold uppercase tracking-wider ${themeStyles.textMuted}`}>Product:</span>
                <select
                  value={selectedProduct}
                  onChange={(e) => setSelectedProduct(e.target.value)}
                  className={`max-w-[180px] sm:max-w-[220px] px-2.5 py-1.5 rounded-xl text-xs font-bold border ${themeStyles.inputBorder} ${themeStyles.inputBg} ${themeStyles.textBody} outline-none focus:ring-2 focus:ring-blue-500 transition shadow-2xs cursor-pointer truncate`}
                >
                  <option value="ALL">All Products ({availableProducts.length})</option>
                  {availableProducts.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>

              {/* Sheet Source Dropdown */}
              <div className="flex items-center gap-1.5">
                <span className={`text-[11px] font-bold uppercase tracking-wider ${themeStyles.textMuted}`}>Sheet:</span>
                <select
                  value={sheetSource}
                  onChange={(e) => setSheetSource(e.target.value as any)}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-bold border ${themeStyles.inputBorder} ${themeStyles.inputBg} ${themeStyles.textBody} outline-none focus:ring-2 focus:ring-blue-500 transition shadow-2xs cursor-pointer`}
                >
                  <option value="main">Main Sheet</option>
                  <option value="master">2nd Sheet</option>
                  <option value="both">Both Combined</option>
                </select>
              </div>
            </div>

            {/* Quick Action Presets */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setSelectedYear(currentYearStr);
                  setSelectedMonth(currentMonthStr);
                  setSelectedWeek('ALL');
                  setSelectedProduct('ALL');
                }}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition cursor-pointer ${
                  selectedYear === currentYearStr && selectedMonth === currentMonthStr && selectedWeek === 'ALL' && selectedProduct === 'ALL'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                    : 'bg-white dark:bg-zinc-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-zinc-700 hover:bg-gray-50 dark:hover:bg-zinc-700'
                }`}
                title="Reset to Current Month Sales"
              >
                Current Month
              </button>

              <button
                type="button"
                onClick={() => {
                  const prevMNum = currentDate.getMonth() === 0 ? 12 : currentDate.getMonth();
                  const prevY = currentDate.getMonth() === 0 ? (currentDate.getFullYear() - 1).toString() : currentYearStr;
                  setSelectedYear(prevY);
                  setSelectedMonth(String(prevMNum).padStart(2, '0'));
                  setSelectedWeek('ALL');
                  setSelectedProduct('ALL');
                }}
                className="px-2.5 py-1 rounded-lg text-xs font-bold border bg-white dark:bg-zinc-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-zinc-700 hover:bg-gray-50 dark:hover:bg-zinc-700 transition cursor-pointer"
                title="View Last Month"
              >
                Last Month
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelectedYear(currentYearStr);
                  setSelectedMonth('ALL');
                  setSelectedWeek('ALL');
                  setSelectedProduct('ALL');
                }}
                className="px-2.5 py-1 rounded-lg text-xs font-bold border bg-white dark:bg-zinc-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-zinc-700 hover:bg-gray-50 dark:hover:bg-zinc-700 transition cursor-pointer"
                title="View Full Year"
              >
                Full Year
              </button>
            </div>
          </div>

          {/* View Mode Tabs */}
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-1.5 bg-black/5 dark:bg-white/5 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setActiveTab('charts')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'charts'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-black/5 dark:hover:bg-white/5'
                }`}
              >
                <TrendingUp className="w-3.5 h-3.5" />
                <span>Growth & Degrowth Graphical View</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('details')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'details'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-black/5 dark:hover:bg-white/5'
                }`}
              >
                <Package className="w-3.5 h-3.5" />
                <span>Product Breakdown & Details</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('records')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'records'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-black/5 dark:hover:bg-white/5'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Sales Records ({currentMetrics.recordCount})</span>
              </button>
            </div>

            {/* Growth/Degrowth Badge Indicator */}
            <div className="hidden md:flex items-center gap-2">
              <span className={`text-[11px] font-bold ${themeStyles.textMuted}`}>
                Vs. {previousPeriodContext.label}:
              </span>
              <div className={`px-2.5 py-0.5 rounded-full text-xs font-black flex items-center gap-1 ${
                previousPeriodContext.revenueGrowthPct > 0
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-300'
                  : previousPeriodContext.revenueGrowthPct < 0
                    ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300 border border-rose-300'
                    : 'bg-gray-100 text-gray-700 dark:bg-zinc-800 dark:text-gray-300'
              }`}>
                {previousPeriodContext.revenueGrowthPct > 0 ? (
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                ) : previousPeriodContext.revenueGrowthPct < 0 ? (
                  <TrendingDown className="w-3.5 h-3.5 text-rose-600" />
                ) : (
                  <Minus className="w-3.5 h-3.5" />
                )}
                <span>
                  {previousPeriodContext.revenueGrowthPct > 0 ? '+' : ''}
                  {previousPeriodContext.revenueGrowthPct.toFixed(1)}% Sales {previousPeriodContext.revenueGrowthPct >= 0 ? 'Growth' : 'Degrowth'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1">
          {/* Executive KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {/* KPI 1: Net Revenue */}
            <div className={`p-4 rounded-2xl border ${themeStyles.cardBorder} ${themeStyles.cardBg} shadow-2xs relative overflow-hidden`}>
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs font-bold uppercase tracking-wider ${themeStyles.textMuted}`}>
                  Total Net Revenue
                </span>
                <div className="p-2 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                  <DollarSign className="w-4 h-4 stroke-[2.5]" />
                </div>
              </div>
              <div className={`text-xl sm:text-2xl font-black ${themeStyles.textHeading} tracking-tight`}>
                {formatCurrency(currentMetrics.revenue)}
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-xs font-bold">
                <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md ${
                  previousPeriodContext.revenueGrowthPct >= 0
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                    : 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                }`}>
                  {previousPeriodContext.revenueGrowthPct >= 0 ? (
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  ) : (
                    <ArrowDownRight className="w-3.5 h-3.5" />
                  )}
                  {previousPeriodContext.revenueGrowthPct >= 0 ? '+' : ''}
                  {previousPeriodContext.revenueGrowthPct.toFixed(1)}%
                </span>
                <span className={`text-[11px] truncate ${themeStyles.textMuted}`}>
                  vs {previousPeriodContext.label}
                </span>
              </div>
            </div>

            {/* KPI 2: Total Units Sold */}
            <div className={`p-4 rounded-2xl border ${themeStyles.cardBorder} ${themeStyles.cardBg} shadow-2xs relative overflow-hidden`}>
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs font-bold uppercase tracking-wider ${themeStyles.textMuted}`}>
                  Total Units Sold
                </span>
                <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <Package className="w-4 h-4 stroke-[2.5]" />
                </div>
              </div>
              <div className={`text-xl sm:text-2xl font-black ${themeStyles.textHeading} tracking-tight`}>
                {formatNumber(currentMetrics.quantity)}
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-xs font-bold">
                <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md ${
                  previousPeriodContext.quantityGrowthPct >= 0
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                    : 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                }`}>
                  {previousPeriodContext.quantityGrowthPct >= 0 ? (
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  ) : (
                    <ArrowDownRight className="w-3.5 h-3.5" />
                  )}
                  {previousPeriodContext.quantityGrowthPct >= 0 ? '+' : ''}
                  {previousPeriodContext.quantityGrowthPct.toFixed(1)}%
                </span>
                <span className={`text-[11px] truncate ${themeStyles.textMuted}`}>
                  volume trend
                </span>
              </div>
            </div>

            {/* KPI 3: Avg Price / Unit */}
            <div className={`p-4 rounded-2xl border ${themeStyles.cardBorder} ${themeStyles.cardBg} shadow-2xs relative overflow-hidden`}>
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs font-bold uppercase tracking-wider ${themeStyles.textMuted}`}>
                  Avg Value / Unit
                </span>
                <div className="p-2 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
                  <Sparkles className="w-4 h-4 stroke-[2.5]" />
                </div>
              </div>
              <div className={`text-xl sm:text-2xl font-black ${themeStyles.textHeading} tracking-tight`}>
                {formatCurrency(currentMetrics.avgPricePerUnit)}
              </div>
              <div className={`mt-2 text-xs font-medium ${themeStyles.textMuted}`}>
                {currentMetrics.recordCount} sales transactions recorded
              </div>
            </div>

            {/* KPI 4: Top Performing Product */}
            <div className={`p-4 rounded-2xl border ${themeStyles.cardBorder} ${themeStyles.cardBg} shadow-2xs relative overflow-hidden`}>
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs font-bold uppercase tracking-wider ${themeStyles.textMuted}`}>
                  Top Product
                </span>
                <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
                </div>
              </div>
              <div className={`text-base sm:text-lg font-black ${themeStyles.textHeading} truncate`} title={currentMetrics.topProduct}>
                {currentMetrics.topProduct}
              </div>
              <div className="mt-2 text-xs font-bold text-amber-600 dark:text-amber-400">
                {formatCurrency(currentMetrics.topProductRev)} contribution
              </div>
            </div>
          </div>

          {/* TAB 1: GRAPHICAL VIEW (GROWTH & DEGROWTH) */}
          {activeTab === 'charts' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              {/* Period Comparison Callout Banner */}
              <div className={`p-4 sm:p-5 rounded-2xl border ${
                previousPeriodContext.revenueGrowthPct > 0
                  ? 'bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-transparent border-emerald-500/30'
                  : previousPeriodContext.revenueGrowthPct < 0
                    ? 'bg-gradient-to-r from-rose-500/10 via-red-500/5 to-transparent border-rose-500/30'
                    : 'bg-black/5 dark:bg-white/5 border-gray-200 dark:border-zinc-800'
              } flex flex-col md:flex-row items-start md:items-center justify-between gap-4`}>
                <div className="flex items-start gap-3.5">
                  <div className={`p-3 rounded-2xl ${
                    previousPeriodContext.revenueGrowthPct > 0
                      ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                      : previousPeriodContext.revenueGrowthPct < 0
                        ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
                        : 'bg-gray-500 text-white'
                  }`}>
                    {previousPeriodContext.revenueGrowthPct > 0 ? (
                      <TrendingUp className="w-6 h-6 stroke-[2.5]" />
                    ) : previousPeriodContext.revenueGrowthPct < 0 ? (
                      <TrendingDown className="w-6 h-6 stroke-[2.5]" />
                    ) : (
                      <Minus className="w-6 h-6 stroke-[2.5]" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className={`text-base font-black ${themeStyles.textHeading}`}>
                        {previousPeriodContext.revenueGrowthPct > 0
                          ? `Sales Growth Trajectory (+${previousPeriodContext.revenueGrowthPct.toFixed(1)}%)`
                          : previousPeriodContext.revenueGrowthPct < 0
                            ? `Sales Degrowth Detected (${previousPeriodContext.revenueGrowthPct.toFixed(1)}%)`
                            : 'Stable Sales Performance'}
                      </h4>
                    </div>
                    <p className={`text-xs mt-0.5 ${themeStyles.textMuted}`}>
                      Comparing {selectedMonth !== 'ALL' ? MONTH_FULL_NAMES[parseInt(selectedMonth, 10) - 1] : 'Selected Period'} {selectedYear} against {previousPeriodContext.label}.
                      Revenue changed by <span className="font-bold text-gray-900 dark:text-white">{formatCurrency(Math.abs(previousPeriodContext.diffRevenue))}</span>
                      {previousPeriodContext.diffRevenue >= 0 ? ' (Net Gain)' : ' (Net Reduction)'}.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4 self-stretch md:self-auto justify-between md:justify-end border-t md:border-t-0 pt-2 md:pt-0 border-gray-200 dark:border-zinc-800 text-right">
                  <div>
                    <span className={`block text-[10px] font-bold uppercase tracking-wider ${themeStyles.textMuted}`}>Current Period</span>
                    <span className="font-black text-sm text-gray-900 dark:text-white">{formatCurrency(currentMetrics.revenue)}</span>
                  </div>
                  <div className="text-gray-400 font-bold">vs</div>
                  <div>
                    <span className={`block text-[10px] font-bold uppercase tracking-wider ${themeStyles.textMuted}`}>{previousPeriodContext.label}</span>
                    <span className={`font-black text-sm ${themeStyles.textMuted}`}>{formatCurrency(previousPeriodContext.prevRevenue)}</span>
                  </div>
                </div>
              </div>

              {/* Graphical Chart: Monthly Growth & Degrowth Timeline */}
              <div className={`p-5 rounded-2xl border ${themeStyles.cardBorder} ${themeStyles.cardBg} shadow-sm space-y-4`}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h4 className={`text-sm font-black ${themeStyles.textHeading} flex items-center gap-2`}>
                      <span>Monthly Sales Growth & Degrowth Timeline ({monthlyGraphData.year})</span>
                    </h4>
                    <p className={`text-xs ${themeStyles.textMuted}`}>
                      Green pills indicate period-over-period growth; red pills indicate degrowth. Click any month bar to filter.
                    </p>
                  </div>

                  {/* Chart Legend */}
                  <div className="flex items-center gap-3 text-[11px] font-bold">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                      <span className={themeStyles.textMuted}>Growth (+%)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
                      <span className={themeStyles.textMuted}>Degrowth (-%)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span>
                      <span className={themeStyles.textMuted}>Selected</span>
                    </div>
                  </div>
                </div>

                {/* SVG Responsive Bar Chart with Growth/Degrowth Badges */}
                <div className="pt-6 pb-2">
                  <div className="grid grid-cols-12 gap-1.5 sm:gap-2 items-end h-56 sm:h-64 px-1">
                    {monthlyGraphData.months.map((m) => {
                      const heightPercent = maxMonthlyRevenue > 0 ? Math.max((m.revenue / maxMonthlyRevenue) * 100, 3) : 3;
                      const isSelected = selectedMonth === m.monthKey;
                      const hasGrowth = m.growthPct !== null && m.growthPct > 0;
                      const hasDegrowth = m.growthPct !== null && m.growthPct < 0;

                      return (
                        <div 
                          key={m.monthKey} 
                          className="flex flex-col items-center h-full justify-end group cursor-pointer"
                          onClick={() => setSelectedMonth(m.monthKey)}
                          onMouseEnter={() => setHoveredPoint({
                            label: `${m.monthName} ${monthlyGraphData.year}`,
                            revenue: m.revenue,
                            qty: m.quantity,
                            growthPct: m.growthPct,
                            prevRevenue: m.prevRevenue
                          })}
                          onMouseLeave={() => setHoveredPoint(null)}
                        >
                          {/* Growth / Degrowth Tag above the bar */}
                          <div className="h-6 flex items-center justify-center mb-1">
                            {m.growthPct !== null && m.revenue > 0 ? (
                              <span className={`text-[10px] font-black px-1 py-0.2 rounded-md transition-transform group-hover:scale-110 ${
                                hasGrowth 
                                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' 
                                  : hasDegrowth 
                                    ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                                    : 'text-gray-400'
                              }`}>
                                {hasGrowth ? '▲' : hasDegrowth ? '▼' : ''}{Math.abs(m.growthPct).toFixed(0)}%
                              </span>
                            ) : null}
                          </div>

                          {/* Bar */}
                          <div className="w-full flex items-end justify-center h-44 sm:h-48 relative">
                            <div 
                              style={{ height: `${heightPercent}%` }}
                              className={`w-full max-w-[38px] rounded-t-lg transition-all duration-300 group-hover:brightness-110 relative ${
                                isSelected
                                  ? 'bg-gradient-to-t from-blue-700 via-indigo-600 to-blue-500 ring-2 ring-blue-400 shadow-md shadow-blue-500/30'
                                  : hasGrowth
                                    ? 'bg-gradient-to-t from-emerald-600/80 to-teal-500/90 hover:from-emerald-600 hover:to-teal-500'
                                    : hasDegrowth
                                      ? 'bg-gradient-to-t from-rose-600/80 to-red-500/90 hover:from-rose-600 hover:to-red-500'
                                      : m.revenue > 0
                                        ? 'bg-gradient-to-t from-slate-400 to-slate-500'
                                        : 'bg-black/5 dark:bg-white/5'
                              }`}
                            >
                              {/* Hover mini-value inside bar if tall enough */}
                              {heightPercent > 35 && (
                                <span className="absolute top-1 inset-x-0 text-center text-[9px] font-black text-white/90 drop-shadow-xs px-0.5 truncate hidden sm:block">
                                  {m.revenue >= 100000 ? `${(m.revenue / 100000).toFixed(1)}L` : m.revenue >= 1000 ? `${(m.revenue / 1000).toFixed(0)}k` : m.revenue}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Month Label */}
                          <div className={`mt-2 text-[10px] sm:text-xs font-bold text-center transition-colors ${
                            isSelected 
                              ? 'text-blue-600 dark:text-blue-400 font-black' 
                              : themeStyles.textMuted
                          }`}>
                            {m.monthName}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Hover Tooltip display */}
                {hoveredPoint && (
                  <div className="p-2.5 rounded-xl bg-slate-900 text-white text-xs font-medium flex items-center justify-between animate-in fade-in duration-150">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-blue-400">{hoveredPoint.label}:</span>
                      <span>Revenue: <strong className="text-white">{formatCurrency(hoveredPoint.revenue)}</strong></span>
                      <span className="text-slate-400">• Units: {formatNumber(hoveredPoint.qty)}</span>
                    </div>
                    {hoveredPoint.growthPct !== null && (
                      <div className={`font-black ${hoveredPoint.growthPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {hoveredPoint.growthPct >= 0 ? '▲ Growth: +' : '▼ Degrowth: '}
                        {hoveredPoint.growthPct.toFixed(1)}% vs prev month
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Weekly Growth Chart (Visible if a Month is Selected) */}
              {weeklyGraphData && (
                <div className={`p-5 rounded-2xl border ${themeStyles.cardBorder} ${themeStyles.cardBg} shadow-sm space-y-4`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className={`text-sm font-black ${themeStyles.textHeading}`}>
                        Weekly Growth & Degrowth Analysis ({MONTH_FULL_NAMES[parseInt(selectedMonth, 10) - 1]} {selectedYear})
                      </h4>
                      <p className={`text-xs ${themeStyles.textMuted}`}>
                        Week-over-week performance pattern within the active month
                      </p>
                    </div>
                    {selectedWeek !== 'ALL' && (
                      <button
                        type="button"
                        onClick={() => setSelectedWeek('ALL')}
                        className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                      >
                        Reset to All Weeks
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-5 gap-2 sm:gap-3 items-end h-44 px-2 pt-4">
                    {weeklyGraphData.map(w => {
                      const heightPercent = maxWeeklyRevenue > 0 ? Math.max((w.revenue / maxWeeklyRevenue) * 100, 4) : 4;
                      const isSelected = selectedWeek === w.week;
                      const isGrowth = w.growthPct !== null && w.growthPct > 0;
                      const isDegrowth = w.growthPct !== null && w.growthPct < 0;

                      return (
                        <div
                          key={w.week}
                          className="flex flex-col items-center h-full justify-end group cursor-pointer"
                          onClick={() => setSelectedWeek(w.week)}
                        >
                          {/* Growth Tag */}
                          <div className="h-5 flex items-center justify-center mb-1">
                            {w.growthPct !== null && w.revenue > 0 ? (
                              <span className={`text-[10px] font-black px-1.5 py-0.2 rounded-md ${
                                isGrowth 
                                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' 
                                  : isDegrowth 
                                    ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                                    : 'text-gray-400'
                              }`}>
                                {isGrowth ? '▲ +' : isDegrowth ? '▼ ' : ''}{w.growthPct.toFixed(0)}%
                              </span>
                            ) : null}
                          </div>

                          {/* Bar */}
                          <div className="w-full flex items-end justify-center h-32 relative">
                            <div 
                              style={{ height: `${heightPercent}%` }}
                              className={`w-full max-w-[50px] rounded-t-xl transition-all duration-300 ${
                                isSelected
                                  ? 'bg-blue-600 ring-2 ring-blue-400 shadow-md shadow-blue-500/30'
                                  : isGrowth
                                    ? 'bg-gradient-to-t from-emerald-600 to-teal-500'
                                    : isDegrowth
                                      ? 'bg-gradient-to-t from-rose-600 to-red-500'
                                      : 'bg-indigo-500/70'
                              }`}
                            />
                          </div>

                          {/* Labels */}
                          <div className={`mt-2 text-xs font-bold text-center ${isSelected ? 'text-blue-600 dark:text-blue-400 font-black' : themeStyles.textMuted}`}>
                            {w.label}
                          </div>
                          <div className="text-[10px] font-mono font-bold text-gray-700 dark:text-gray-300">
                            {formatCurrency(w.revenue)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Product-level Growth & Degrowth Matrix */}
              <div className={`p-5 rounded-2xl border ${themeStyles.cardBorder} ${themeStyles.cardBg} shadow-sm space-y-4`}>
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className={`text-sm font-black ${themeStyles.textHeading}`}>
                      Product-Wise Growth vs. Degrowth Matrix
                    </h4>
                    <p className={`text-xs ${themeStyles.textMuted}`}>
                      Individual product trajectory compared to {previousPeriodContext.label}
                    </p>
                  </div>
                  <span className={`text-xs font-bold ${themeStyles.textMuted}`}>
                    {productBreakdown.length} Products Active
                  </span>
                </div>

                <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                  {productBreakdown.slice(0, 8).map(prod => {
                    const barWidth = maxProductRevenue > 0 ? Math.max((prod.revenue / maxProductRevenue) * 100, 2) : 2;

                    return (
                      <div key={prod.productName} className="p-3 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] border border-gray-200/70 dark:border-zinc-800 space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-black text-gray-900 dark:text-white truncate max-w-[200px] sm:max-w-xs" title={prod.productName}>
                              {prod.productName}
                            </span>
                            <span className="text-[11px] text-gray-500 font-medium">({prod.quantity} units)</span>
                          </div>

                          <div className="flex items-center gap-3">
                            <span className="font-bold text-gray-900 dark:text-white">
                              {formatCurrency(prod.revenue)}
                            </span>
                            <span className={`inline-flex items-center gap-0.5 text-[11px] font-black px-2 py-0.5 rounded-full ${
                              prod.isGrowth
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                            }`}>
                              {prod.isGrowth ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                              {prod.isGrowth ? '+' : ''}{prod.growthPct.toFixed(1)}% {prod.isGrowth ? 'Growth' : 'Degrowth'}
                            </span>
                          </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="h-2 w-full bg-gray-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                          <div 
                            style={{ width: `${barWidth}%` }}
                            className={`h-full rounded-full transition-all duration-300 ${
                              prod.isGrowth ? 'bg-emerald-500' : 'bg-rose-500'
                            }`}
                          />
                        </div>
                      </div>
                    );
                  })}
                  {productBreakdown.length === 0 && (
                    <div className="text-center py-8 text-sm text-gray-400">
                      No product sales recorded in the selected period.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PRODUCT BREAKDOWN & DETAILS */}
          {activeTab === 'details' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className={`text-sm font-black ${themeStyles.textHeading}`}>
                    Product Performance Breakdown Table
                  </h4>
                  <p className={`text-xs ${themeStyles.textMuted}`}>
                    Detailed revenue share, unit quantities, and comparative growth rates
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleExportSummaryExcel}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 transition cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Excel</span>
                </button>
              </div>

              <div className={`overflow-x-auto rounded-2xl border ${themeStyles.cardBorder}`}>
                <table className="w-full text-left text-xs">
                  <thead className={`${themeStyles.subSurface} font-black text-gray-600 dark:text-gray-300 uppercase tracking-wider border-b ${themeStyles.cardBorder}`}>
                    <tr>
                      <th className="py-3 px-4">#</th>
                      <th className="py-3 px-4">Product Name</th>
                      <th className="py-3 px-4 text-right">Units Sold</th>
                      <th className="py-3 px-4 text-right">Net Revenue</th>
                      <th className="py-3 px-4 text-right">Revenue Share</th>
                      <th className="py-3 px-4 text-right">Growth vs Prev</th>
                      <th className="py-3 px-4 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200/60 dark:divide-zinc-800">
                    {productBreakdown.map((p, idx) => (
                      <tr key={p.productName} className="hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition">
                        <td className="py-3 px-4 font-mono text-gray-400">{idx + 1}</td>
                        <td className="py-3 px-4 font-bold text-gray-900 dark:text-white">{p.productName}</td>
                        <td className="py-3 px-4 text-right font-mono font-bold">{formatNumber(p.quantity)}</td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-gray-900 dark:text-white">
                          {formatCurrency(p.revenue)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <span className="font-mono font-bold">{p.revenueSharePct.toFixed(1)}%</span>
                            <div className="w-12 bg-gray-200 dark:bg-zinc-700 h-1.5 rounded-full overflow-hidden">
                              <div style={{ width: `${Math.min(p.revenueSharePct, 100)}%` }} className="h-full bg-blue-600 rounded-full" />
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold">
                          <span className={p.isGrowth ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
                            {p.isGrowth ? '+' : ''}{p.growthPct.toFixed(1)}%
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-black ${
                            p.isGrowth
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                          }`}>
                            {p.isGrowth ? 'GROWTH' : 'DEGROWTH'}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {productBreakdown.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-gray-400 font-medium">
                          No sales data found for the selected filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: DETAILED SALES RECORDS */}
          {activeTab === 'records' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search product, state, platform..."
                    value={recordSearch}
                    onChange={(e) => setRecordSearch(e.target.value)}
                    className={`w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border ${themeStyles.inputBorder} ${themeStyles.inputBg} ${themeStyles.textBody} outline-none focus:ring-2 focus:ring-blue-500`}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <span className={`text-xs ${themeStyles.textMuted}`}>
                    Showing {filteredDetailRecords.length} records
                  </span>
                  <button
                    type="button"
                    onClick={handleExportRecordsCSV}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 transition cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export CSV</span>
                  </button>
                </div>
              </div>

              <div className={`overflow-x-auto rounded-2xl border ${themeStyles.cardBorder} max-h-96 overflow-y-auto`}>
                <table className="w-full text-left text-xs">
                  <thead className={`${themeStyles.subSurface} sticky top-0 font-black text-gray-600 dark:text-gray-300 uppercase tracking-wider border-b ${themeStyles.cardBorder}`}>
                    <tr>
                      <th className="py-2.5 px-3.5">Period</th>
                      <th className="py-2.5 px-3.5">Product Name</th>
                      <th className="py-2.5 px-3.5">Platform / State</th>
                      <th className="py-2.5 px-3.5 text-right">Quantity</th>
                      <th className="py-2.5 px-3.5 text-right">Net Revenue</th>
                      <th className="py-2.5 px-3.5 text-center">Entry Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200/60 dark:divide-zinc-800">
                    {filteredDetailRecords.map((r) => (
                      <tr key={r.id} className="hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition">
                        <td className="py-2.5 px-3.5 font-mono text-gray-500 whitespace-nowrap">
                          {r.year}-{r.month} (W{r.week})
                        </td>
                        <td className="py-2.5 px-3.5 font-bold text-gray-900 dark:text-white">
                          {r.productName}
                        </td>
                        <td className="py-2.5 px-3.5 text-gray-600 dark:text-gray-400">
                          {r.state || '-'}
                        </td>
                        <td className="py-2.5 px-3.5 text-right font-mono font-bold">
                          {formatNumber(r.quantity || 0)}
                        </td>
                        <td className="py-2.5 px-3.5 text-right font-mono font-bold text-gray-900 dark:text-white">
                          {formatCurrency(r.netRevenue || r.grossSales || 0)}
                        </td>
                        <td className="py-2.5 px-3.5 text-center font-mono text-[11px] text-gray-500">
                          {r.manualEntryDate ? r.manualEntryDate.split(',')[0] : '-'}
                        </td>
                      </tr>
                    ))}
                    {filteredDetailRecords.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-gray-400 font-medium">
                          No matching records found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className={`px-6 py-3.5 border-t ${themeStyles.cardBorder} ${themeStyles.subSurface} flex flex-col sm:flex-row items-center justify-between gap-3 flex-shrink-0`}>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>
              Summary Period: <strong>{selectedMonth !== 'ALL' ? MONTH_FULL_NAMES[parseInt(selectedMonth, 10) - 1] : 'All Months'} {selectedYear}</strong>
              {selectedWeek !== 'ALL' && ` • Week ${selectedWeek}`}
              {selectedProduct !== 'ALL' && ` • ${selectedProduct}`}
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleExportSummaryExcel}
              className="px-3.5 py-2 text-xs font-bold rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 transition cursor-pointer"
            >
              Export Excel
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 text-xs font-black rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
