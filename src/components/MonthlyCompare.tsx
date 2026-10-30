import React, { useState, useMemo } from 'react';
import Papa from 'papaparse';
import { 
  ArrowUp, 
  ArrowDown, 
  Minus, 
  BarChart2, 
  TrendingUp, 
  TrendingDown, 
  Users, 
  Play, 
  MousePointerClick, 
  DollarSign, 
  Activity, 
  ArrowLeftRight,
  Package,
  ShoppingBag,
  Target,
  Search,
  Download,
  Filter,
  CheckCircle2,
  AlertCircle,
  Percent,
  Layers,
  Calendar,
  RotateCcw,
  X
} from 'lucide-react';
import { Task, Influencer, ProductConfig } from '../types';
import { MonthlyProductTarget } from './MonthlyTargets';
import { useTheme } from '../context/ThemeContext';

interface MonthlyCompareProps {
  tasks: Task[];
  influencers: Influencer[];
  dashboardProducts?: ProductConfig[];
  monthlyTargets?: MonthlyProductTarget[];
  salesData?: any[];
  savedProducts?: string[];
}

interface ProductPeriodMetrics {
  quantitySold: number;
  revenueTarget: number;
  estimatedSales: number;
  achievementRate: number;
}

export default function MonthlyCompare({ 
  tasks, 
  influencers,
  dashboardProducts = [],
  monthlyTargets = [],
  salesData = [],
  savedProducts = []
}: MonthlyCompareProps) {
  const { themeStyles } = useTheme();

  const curDate = new Date();
  const [periodAYear, setPeriodAYear] = useState<string>(curDate.getFullYear().toString());
  const [periodAMonth, setPeriodAMonth] = useState<string>((curDate.getMonth() + 1).toString().padStart(2, '0'));
  const [periodAWeek, setPeriodAWeek] = useState<string>('All');

  const prevDate = new Date(curDate.getFullYear(), curDate.getMonth() - 1, 1);
  const [periodBYear, setPeriodBYear] = useState<string>(prevDate.getFullYear().toString());
  const [periodBMonth, setPeriodBMonth] = useState<string>((prevDate.getMonth() + 1).toString().padStart(2, '0'));
  const [periodBWeek, setPeriodBWeek] = useState<string>('All');

  // Product Comparison UI filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterMode, setFilterMode] = useState<'all' | 'active' | 'growing' | 'declining'>('all');
  const [sortBy, setSortBy] = useState<'salesA' | 'salesDiff' | 'qtyA' | 'qtyDiff' | 'targetA' | 'achA' | 'name'>('salesA');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const monthsList = [
    { value: 'ALL', label: 'All Months' },
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
    { value: '12', label: 'December' },
  ];

  const weeksList = [
    { value: 'All', label: 'All Weeks' },
    { value: 'Week 1', label: 'Week 1 (Days 1–7)' },
    { value: 'Week 2', label: 'Week 2 (Days 8–14)' },
    { value: 'Week 3', label: 'Week 3 (Days 15–21)' },
    { value: 'Week 4', label: 'Week 4 (Days 22–28)' },
    { value: 'Week 5', label: 'Week 5 (Days 29–31)' },
    { value: '1st & 2nd week', label: '1st & 2nd week (Days 1–14)' },
    { value: '1st, 2nd, 3rd week', label: '1st, 2nd, 3rd week (Days 1–21)' },
    { value: '1st, 2nd, 3rd, 4th week', label: '1st, 2nd, 3rd, 4th week (Days 1–28)' }
  ];

  // Dynamically extract all available years across datasets + recent 5 years
  const years = useMemo(() => {
    const yrSet = new Set<string>();
    const currentYear = new Date().getFullYear();
    for (let i = 0; i < 5; i++) {
      yrSet.add((currentYear - i).toString());
    }
    if (salesData && Array.isArray(salesData)) {
      salesData.forEach(s => {
        if (s && s.year) {
          const y = String(s.year).trim();
          if (y && y.length === 4) yrSet.add(y);
        }
      });
    }
    if (monthlyTargets && Array.isArray(monthlyTargets)) {
      monthlyTargets.forEach(t => {
        if (t && t.year) {
          const y = String(t.year).trim();
          if (y && y.length === 4) yrSet.add(y);
        }
      });
    }
    if (tasks && Array.isArray(tasks)) {
      tasks.forEach(t => {
        const d = t.deadline || t.releaseDate;
        if (d) {
          const y = d.split('-')[0];
          if (y && y.length === 4) yrSet.add(y);
        }
      });
    }
    return Array.from(yrSet).sort((a, b) => b.localeCompare(a));
  }, [salesData, monthlyTargets, tasks]);

  const getWeekOfMonth = (dateStr: string) => {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 'Week 1';
    const date = d.getDate();
    if (date <= 7) return 'Week 1';
    if (date <= 14) return 'Week 2';
    if (date <= 21) return 'Week 3';
    if (date <= 28) return 'Week 4';
    return 'Week 5';
  };

  const normalizeMonth = (m: string | number | undefined | null): string => {
    if (!m) return '';
    const str = String(m).trim().toLowerCase();
    if (str === 'all') return 'ALL';
    const monthMap: Record<string, string> = {
      'january': '01', 'jan': '01', '1': '01', '01': '01',
      'february': '02', 'feb': '02', '2': '02', '02': '02',
      'march': '03', 'mar': '03', '3': '03', '03': '03',
      'april': '04', 'apr': '04', '4': '04', '04': '04',
      'may': '05', '5': '05', '05': '05',
      'june': '06', 'jun': '06', '6': '06', '06': '06',
      'july': '07', 'jul': '07', '7': '07', '07': '07',
      'august': '08', 'aug': '08', '8': '08', '08': '08',
      'september': '09', 'sep': '09', '9': '09', '09': '09',
      'october': '10', 'oct': '10', '10': '10',
      'november': '11', 'nov': '11', '11': '11',
      'december': '12', 'dec': '12', '12': '12'
    };
    if (monthMap[str]) return monthMap[str];
    const num = parseInt(str.replace(/\D/g, ''), 10);
    if (!isNaN(num) && num >= 1 && num <= 12) {
      return String(num).padStart(2, '0');
    }
    return str;
  };

  const matchWeek = (rowWeek: any, targetWeek: string): boolean => {
    if (!targetWeek || targetWeek === 'All' || targetWeek === 'ALL') return true;
    if (!rowWeek) return false;
    const rwStr = String(rowWeek).toLowerCase();
    const rowNum = rwStr.replace(/\D/g, '');
    if (!rowNum) return false;

    if (targetWeek === '1st & 2nd week' || targetWeek === '1-2' || targetWeek === 'Week 1-2') {
      return rowNum === '1' || rowNum === '2';
    }
    if (targetWeek === '1st, 2nd, 3rd week' || targetWeek === '1-3' || targetWeek === 'Week 1-3') {
      return rowNum === '1' || rowNum === '2' || rowNum === '3';
    }
    if (targetWeek === '1st, 2nd, 3rd, 4th week' || targetWeek === '1-4' || targetWeek === 'Week 1-4') {
      return rowNum === '1' || rowNum === '2' || rowNum === '3' || rowNum === '4';
    }

    const targetNum = targetWeek.replace(/\D/g, '');
    if (!targetNum) return true;
    return rowNum === targetNum;
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val);
  };

  const formatNumber = (val: number) => {
    return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 }).format(val);
  };

  const handleResetFilters = () => {
    const now = new Date();
    setPeriodAYear(now.getFullYear().toString());
    setPeriodAMonth((now.getMonth() + 1).toString().padStart(2, '0'));
    setPeriodAWeek('All');
    setSearchQuery('');
    setFilterMode('all');
    setSortBy('salesA');
    setSortDirection('desc');
  };

  // --- Campaign & Placement Metrics ---
  const calcMetrics = (year: string, month: string, week: string) => {
    const filtered = tasks.filter(t => {
      if (t.status === 'Cancelled') return false;
      
      const dateToUse = t.deadline || t.releaseDate;
      if (!dateToUse) return false;
      
      const parts = dateToUse.split('-');
      if (parts.length < 2) return false;
      
      if (year !== 'ALL' && year !== 'All' && parts[0] !== year) return false;
      if (month !== 'ALL' && month !== 'All' && parts[1] !== month) return false;
      
      if (week !== 'All' && week !== 'ALL') {
        const d = new Date(dateToUse);
        const dayOfMonth = !isNaN(d.getTime()) ? d.getDate() : 0;
        if (week === '1st & 2nd week' || week === '1-2' || week === 'Week 1-2') {
          if (dayOfMonth < 1 || dayOfMonth > 14) return false;
        } else if (week === '1st, 2nd, 3rd week' || week === '1-3' || week === 'Week 1-3') {
          if (dayOfMonth < 1 || dayOfMonth > 21) return false;
        } else if (week === '1st, 2nd, 3rd, 4th week' || week === '1-4' || week === 'Week 1-4') {
          if (dayOfMonth < 1 || dayOfMonth > 28) return false;
        } else {
          const tWeek = getWeekOfMonth(dateToUse);
          if (tWeek !== week) return false;
        }
      }
      return true;
    });

    const placements = filtered.length;
    const views = filtered.reduce((sum, t) => sum + (Number(t.views) || 0), 0);
    const clicks = filtered.reduce((sum, t) => sum + (Number(t.clicks) || 0), 0);
    const spend = filtered.reduce((sum, t) => sum + (Number(t.remuneration) || 0), 0);

    const ctr = views > 0 ? (clicks / views) * 100 : 0;
    const cpc = clicks > 0 ? spend / clicks : 0;
    const cpv = views > 0 ? spend / views : 0;

    const activeCreators = new Set(filtered.map(t => t.influencerId)).size;

    return { placements, views, clicks, spend, ctr, cpc, cpv, activeCreators };
  };

  const periodAMetrics = calcMetrics(periodAYear, periodAMonth, periodAWeek);
  const periodBMetrics = calcMetrics(periodBYear, periodBMonth, periodBWeek);

  const getLabel = (y: string, m: string, w: string) => {
    const monthName = (m === 'ALL' || m === 'All') ? 'All Months' : (monthsList.find(x => x.value === m)?.label || m);
    const yearStr = (y === 'ALL' || y === 'All') ? 'All Years' : y;
    const weekStr = (w === 'All' || w === 'ALL') ? '' : ` (${w})`;
    return `${monthName} ${yearStr}${weekStr}`;
  };

  const labelA = getLabel(periodAYear, periodAMonth, periodAWeek);
  const labelB = getLabel(periodBYear, periodBMonth, periodBWeek);

  // --- Product-wise Metrics Calculation ---
  const getProductMetricsForPeriod = (
    prodName: string, 
    year: string, 
    month: string, 
    week: string
  ): ProductPeriodMetrics => {
    const isAllMonth = month === 'ALL' || month === 'All';
    const isAllYear = year === 'ALL' || year === 'All';
    const isAllWeek = week === 'ALL' || week === 'All';
    const normTargetMonth = isAllMonth ? '' : normalizeMonth(month);
    const prodClean = prodName.trim().toLowerCase();

    // 1. Revenue Target and Target Fallbacks from monthlyTargets
    let revenueTarget = 0;
    let targetQuantitySold = 0;
    let targetSalesAmount = 0;

    if (monthlyTargets && monthlyTargets.length > 0) {
      const matches = monthlyTargets.filter(t => {
        if (!t.productName || t.productName.trim().toLowerCase() !== prodClean) return false;
        if (!isAllYear && t.year && String(t.year).trim() !== String(year).trim()) return false;
        if (!isAllMonth) {
          const tMonth = normalizeMonth(t.month);
          if (tMonth !== normTargetMonth) return false;
        }
        return true;
      });

      if (matches.length > 0) {
        revenueTarget = matches.reduce((sum, m) => sum + (Number(m.target) || 0), 0);
        targetQuantitySold = matches.reduce((sum, m) => sum + (Number(m.quantitySold) || 0), 0);

        if (isAllWeek) {
          targetSalesAmount = matches.reduce((sum, m) => {
            const directSales = Number(m.salesAmount) || 0;
            const weeklySum = (Number(m.salesAmountWeek1) || 0) + 
                              (Number(m.salesAmountWeek2) || 0) + 
                              (Number(m.salesAmountWeek3) || 0) + 
                              (Number(m.salesAmountWeek4) || 0) + 
                              (Number(m.salesAmountWeek5) || 0);
            return sum + (directSales || weeklySum);
          }, 0);
        } else if (week === '1st & 2nd week' || week === '1-2' || week === 'Week 1-2') {
          targetSalesAmount = matches.reduce((sum, m) => {
            return sum + (Number(m.salesAmountWeek1) || 0) + (Number(m.salesAmountWeek2) || 0);
          }, 0);
        } else if (week === '1st, 2nd, 3rd week' || week === '1-3' || week === 'Week 1-3') {
          targetSalesAmount = matches.reduce((sum, m) => {
            return sum + (Number(m.salesAmountWeek1) || 0) + (Number(m.salesAmountWeek2) || 0) + (Number(m.salesAmountWeek3) || 0);
          }, 0);
        } else if (week === '1st, 2nd, 3rd, 4th week' || week === '1-4' || week === 'Week 1-4') {
          targetSalesAmount = matches.reduce((sum, m) => {
            return sum + (Number(m.salesAmountWeek1) || 0) + (Number(m.salesAmountWeek2) || 0) + (Number(m.salesAmountWeek3) || 0) + (Number(m.salesAmountWeek4) || 0);
          }, 0);
        } else {
          const wNum = parseInt(week.replace(/\D/g, ''), 10);
          targetSalesAmount = matches.reduce((sum, m) => {
            if (wNum === 1) return sum + (Number(m.salesAmountWeek1) || 0);
            if (wNum === 2) return sum + (Number(m.salesAmountWeek2) || 0);
            if (wNum === 3) return sum + (Number(m.salesAmountWeek3) || 0);
            if (wNum === 4) return sum + (Number(m.salesAmountWeek4) || 0);
            if (wNum === 5) return sum + (Number(m.salesAmountWeek5) || 0);
            return sum;
          }, 0);
        }
      }
    }

    // 2. Quantity Sold and Estimated Sales from salesData (Actual E-Commerce Sales)
    let salesDataQty = 0;
    let salesDataRevenue = 0;
    let hasSalesDataRows = false;

    if (salesData && salesData.length > 0) {
      salesData.forEach(row => {
        if (!row.productName || row.productName.trim().toLowerCase() !== prodClean) return;
        if (!isAllYear && row.year && String(row.year).trim() !== String(year).trim()) return;
        if (!isAllMonth) {
          const rMonth = normalizeMonth(row.month);
          if (rMonth !== normTargetMonth) return;
        }
        if (!matchWeek(row.week, week)) return;

        hasSalesDataRows = true;
        const qty = Number(row.quantity) || 0;
        const rev = Number(row.netRevenue) || Number(row.grossSales) || 0;
        salesDataQty += qty;
        salesDataRevenue += rev;
      });
    }

    const quantitySold = hasSalesDataRows ? salesDataQty : targetQuantitySold;
    const estimatedSales = hasSalesDataRows ? salesDataRevenue : targetSalesAmount;
    const achievementRate = revenueTarget > 0 ? (estimatedSales / revenueTarget) * 100 : 0;

    return {
      quantitySold,
      revenueTarget,
      estimatedSales,
      achievementRate
    };
  };

  // Compile full set of unique product names across all sources
  const allProductNames = useMemo(() => {
    const set = new Set<string>();
    
    if (dashboardProducts) {
      dashboardProducts.forEach(p => {
        if (p && p.name && p.name.trim()) set.add(p.name.trim());
      });
    }
    if (savedProducts) {
      savedProducts.forEach(p => {
        if (typeof p === 'string' && p.trim()) set.add(p.trim());
      });
    }
    if (monthlyTargets) {
      monthlyTargets.forEach(t => {
        if (t && t.productName && t.productName.trim()) set.add(t.productName.trim());
      });
    }
    if (salesData) {
      salesData.forEach(s => {
        if (s && s.productName && s.productName.trim()) set.add(s.productName.trim());
      });
    }
    if (tasks) {
      tasks.forEach(t => {
        if (t && t.productName && t.productName.trim()) set.add(t.productName.trim());
      });
    }

    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [dashboardProducts, savedProducts, monthlyTargets, salesData, tasks]);

  // Compute comparisons for all products
  const productComparisons = useMemo(() => {
    return allProductNames.map(name => {
      const periodA = getProductMetricsForPeriod(name, periodAYear, periodAMonth, periodAWeek);
      const periodB = getProductMetricsForPeriod(name, periodBYear, periodBMonth, periodBWeek);

      const qtyDiff = periodA.quantitySold - periodB.quantitySold;
      const qtyDiffPct = periodB.quantitySold > 0 
        ? (qtyDiff / periodB.quantitySold) * 100 
        : (periodA.quantitySold > 0 ? 100 : 0);

      const targetDiff = periodA.revenueTarget - periodB.revenueTarget;
      const targetDiffPct = periodB.revenueTarget > 0 
        ? (targetDiff / periodB.revenueTarget) * 100 
        : (periodA.revenueTarget > 0 ? 100 : 0);

      const salesDiff = periodA.estimatedSales - periodB.estimatedSales;
      const salesDiffPct = periodB.estimatedSales > 0 
        ? (salesDiff / periodB.estimatedSales) * 100 
        : (periodA.estimatedSales > 0 ? 100 : 0);

      const achievementDiff = periodA.achievementRate - periodB.achievementRate;

      return {
        name,
        periodA,
        periodB,
        qtyDiff,
        qtyDiffPct,
        targetDiff,
        targetDiffPct,
        salesDiff,
        salesDiffPct,
        achievementDiff
      };
    });
  }, [allProductNames, periodAYear, periodAMonth, periodAWeek, periodBYear, periodBMonth, periodBWeek, monthlyTargets, salesData]);

  // Compute Grand Totals across all products
  const productGrandTotals = useMemo(() => {
    const totalQtyA = productComparisons.reduce((sum, p) => sum + p.periodA.quantitySold, 0);
    const totalQtyB = productComparisons.reduce((sum, p) => sum + p.periodB.quantitySold, 0);
    const qtyDiff = totalQtyA - totalQtyB;
    const qtyDiffPct = totalQtyB > 0 ? (qtyDiff / totalQtyB) * 100 : (totalQtyA > 0 ? 100 : 0);

    const totalTargetA = productComparisons.reduce((sum, p) => sum + p.periodA.revenueTarget, 0);
    const totalTargetB = productComparisons.reduce((sum, p) => sum + p.periodB.revenueTarget, 0);
    const targetDiff = totalTargetA - totalTargetB;
    const targetDiffPct = totalTargetB > 0 ? (targetDiff / totalTargetB) * 100 : (totalTargetA > 0 ? 100 : 0);

    const totalSalesA = productComparisons.reduce((sum, p) => sum + p.periodA.estimatedSales, 0);
    const totalSalesB = productComparisons.reduce((sum, p) => sum + p.periodB.estimatedSales, 0);
    const salesDiff = totalSalesA - totalSalesB;
    const salesDiffPct = totalSalesB > 0 ? (salesDiff / totalSalesB) * 100 : (totalSalesA > 0 ? 100 : 0);

    const achRateA = totalTargetA > 0 ? (totalSalesA / totalTargetA) * 100 : 0;
    const achRateB = totalTargetB > 0 ? (totalSalesB / totalTargetB) * 100 : 0;
    const achDiff = achRateA - achRateB;

    return {
      totalQtyA,
      totalQtyB,
      qtyDiff,
      qtyDiffPct,
      totalTargetA,
      totalTargetB,
      targetDiff,
      targetDiffPct,
      totalSalesA,
      totalSalesB,
      salesDiff,
      salesDiffPct,
      achRateA,
      achRateB,
      achDiff
    };
  }, [productComparisons]);

  // Filter and Sort product comparison list
  const filteredAndSortedProducts = useMemo(() => {
    let list = productComparisons.filter(p => {
      // Text search
      if (searchQuery.trim()) {
        if (!p.name.toLowerCase().includes(searchQuery.trim().toLowerCase())) {
          return false;
        }
      }

      // Quick filter
      if (filterMode === 'active') {
        const hasActivity = p.periodA.quantitySold > 0 || 
                            p.periodB.quantitySold > 0 || 
                            p.periodA.estimatedSales > 0 || 
                            p.periodB.estimatedSales > 0 || 
                            p.periodA.revenueTarget > 0 || 
                            p.periodB.revenueTarget > 0;
        if (!hasActivity) return false;
      } else if (filterMode === 'growing') {
        if (p.salesDiff <= 0) return false;
      } else if (filterMode === 'declining') {
        if (p.salesDiff >= 0) return false;
      }

      return true;
    });

    // Sorting
    list.sort((a, b) => {
      let valA: number | string = 0;
      let valB: number | string = 0;

      switch (sortBy) {
        case 'salesA':
          valA = a.periodA.estimatedSales;
          valB = b.periodA.estimatedSales;
          break;
        case 'salesDiff':
          valA = a.salesDiff;
          valB = b.salesDiff;
          break;
        case 'qtyA':
          valA = a.periodA.quantitySold;
          valB = b.periodA.quantitySold;
          break;
        case 'qtyDiff':
          valA = a.qtyDiff;
          valB = b.qtyDiff;
          break;
        case 'targetA':
          valA = a.periodA.revenueTarget;
          valB = b.periodA.revenueTarget;
          break;
        case 'achA':
          valA = a.periodA.achievementRate;
          valB = b.periodA.achievementRate;
          break;
        case 'name':
          return sortDirection === 'asc' 
            ? a.name.localeCompare(b.name) 
            : b.name.localeCompare(a.name);
      }

      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortDirection === 'asc' ? valA - valB : valB - valA;
      }
      return 0;
    });

    return list;
  }, [productComparisons, searchQuery, filterMode, sortBy, sortDirection]);

  // Handle Export to CSV
  const handleExportProductComparisonCSV = () => {
    const csvRows = filteredAndSortedProducts.map(p => ({
      'Product Name': p.name,
      [`Quantity Sold - Baseline (${labelB})`]: p.periodB.quantitySold,
      [`Quantity Sold - Comparison (${labelA})`]: p.periodA.quantitySold,
      'Quantity Sold Difference (Units)': p.qtyDiff,
      'Quantity Sold Change (%)': `${p.qtyDiffPct.toFixed(1)}%`,
      [`Revenue Target - Baseline (${labelB}) [INR]`]: p.periodB.revenueTarget,
      [`Revenue Target - Comparison (${labelA}) [INR]`]: p.periodA.revenueTarget,
      'Revenue Target Difference [INR]': p.targetDiff,
      'Revenue Target Change (%)': `${p.targetDiffPct.toFixed(1)}%`,
      [`Estimated Sales - Baseline (${labelB}) [INR]`]: p.periodB.estimatedSales,
      [`Estimated Sales - Comparison (${labelA}) [INR]`]: p.periodA.estimatedSales,
      'Estimated Sales Difference [INR]': p.salesDiff,
      'Estimated Sales Growth (%)': `${p.salesDiffPct.toFixed(1)}%`,
      [`Target Achievement - Baseline (${labelB}) (%)`]: `${p.periodB.achievementRate.toFixed(1)}%`,
      [`Target Achievement - Comparison (${labelA}) (%)`]: `${p.periodA.achievementRate.toFixed(1)}%`,
      'Achievement Diff (% pts)': `${p.achievementDiff.toFixed(1)}%`
    }));

    // Append grand totals row
    csvRows.push({
      'Product Name': '=== GRAND TOTALS ===',
      [`Quantity Sold - Baseline (${labelB})`]: productGrandTotals.totalQtyB,
      [`Quantity Sold - Comparison (${labelA})`]: productGrandTotals.totalQtyA,
      'Quantity Sold Difference (Units)': productGrandTotals.qtyDiff,
      'Quantity Sold Change (%)': `${productGrandTotals.qtyDiffPct.toFixed(1)}%`,
      [`Revenue Target - Baseline (${labelB}) [INR]`]: productGrandTotals.totalTargetB,
      [`Revenue Target - Comparison (${labelA}) [INR]`]: productGrandTotals.totalTargetA,
      'Revenue Target Difference [INR]': productGrandTotals.targetDiff,
      'Revenue Target Change (%)': `${productGrandTotals.targetDiffPct.toFixed(1)}%`,
      [`Estimated Sales - Baseline (${labelB}) [INR]`]: productGrandTotals.totalSalesB,
      [`Estimated Sales - Comparison (${labelA}) [INR]`]: productGrandTotals.totalSalesA,
      'Estimated Sales Difference [INR]': productGrandTotals.salesDiff,
      'Estimated Sales Growth (%)': `${productGrandTotals.salesDiffPct.toFixed(1)}%`,
      [`Target Achievement - Baseline (${labelB}) (%)`]: `${productGrandTotals.achRateB.toFixed(1)}%`,
      [`Target Achievement - Comparison (${labelA}) (%)`]: `${productGrandTotals.achRateA.toFixed(1)}%`,
      'Achievement Diff (% pts)': `${productGrandTotals.achDiff.toFixed(1)}%`
    });

    const csvContent = Papa.unparse(csvRows);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Product_Comparison_${periodBMonth}-${periodBYear}_vs_${periodAMonth}-${periodAYear}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const renderMetric = (
    label: string, 
    curVal: number, 
    prevVal: number, 
    format: 'number' | 'currency' | 'percent', 
    icon: React.ReactNode, 
    invertColor: boolean = false
  ) => {
    let curDisplay = curVal.toString();
    let prevDisplay = prevVal.toString();

    if (format === 'currency') {
      curDisplay = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(curVal);
      prevDisplay = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(prevVal);
    } else if (format === 'number') {
      curDisplay = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 }).format(curVal);
      prevDisplay = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 }).format(prevVal);
    } else if (format === 'percent') {
      curDisplay = curVal.toFixed(2) + '%';
      prevDisplay = prevVal.toFixed(2) + '%';
    }

    let diff = 0;
    let diffPercent = 0;
    if (prevVal > 0) {
      diff = curVal - prevVal;
      diffPercent = (diff / prevVal) * 100;
    } else if (curVal > 0 && prevVal === 0) {
      diffPercent = 100;
    }

    const isPositive = diffPercent > 0;
    const isNeutral = diffPercent === 0;
    
    let isGood = isPositive;
    if (invertColor) {
      isGood = !isPositive && !isNeutral; // For things like CPC/CPV, lower is better
    }

    const diffColor = isNeutral ? 'text-gray-500 bg-gray-100' : (isGood ? 'text-emerald-700 bg-emerald-50 border border-emerald-200' : 'text-rose-700 bg-rose-50 border border-rose-200');

    return (
      <div className={`p-6 rounded-2xl shadow-sm border ${themeStyles.cardBorder} ${themeStyles.cardBg} hover:shadow-md transition-shadow relative overflow-hidden`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
              {icon}
            </div>
            <h4 className={`font-bold ${themeStyles.textHeading}`}>{label}</h4>
          </div>
          <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${diffColor}`}>
            {isPositive ? <ArrowUp className="w-3 h-3" /> : (isNeutral ? <Minus className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
            {Math.abs(diffPercent).toFixed(1)}%
          </div>
        </div>
        
        <div className="flex items-end justify-between mt-6">
          <div>
            <p className="text-[10px] text-gray-400 font-bold mb-1 uppercase tracking-wider line-clamp-1 max-w-[110px]">{labelB}</p>
            <p className={`text-xl font-semibold ${themeStyles.textMuted}`}>{prevDisplay}</p>
          </div>
          <div className="h-8 w-px bg-gray-200 dark:bg-white/10 mx-4"></div>
          <div className="text-right">
            <p className="text-[10px] text-indigo-500 font-bold mb-1 uppercase tracking-wider line-clamp-1 max-w-[110px]">{labelA}</p>
            <p className={`text-3xl font-black ${themeStyles.textHeading}`}>{curDisplay}</p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={`space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-16 ${themeStyles.containerBg}`}>
      {/* Top Banner & Period Selector */}
      <div className="flex flex-col xl:flex-row items-center justify-between bg-gradient-to-r from-indigo-950 via-indigo-900 to-purple-950 p-8 rounded-3xl text-white shadow-xl gap-6 border border-indigo-800/40">
        <div>
          <h2 className="text-3xl font-black mb-2 flex items-center gap-3">
            <BarChart2 className="w-8 h-8 text-indigo-300" />
            Performance & Product Comparison
          </h2>
          <p className="text-indigo-200 text-sm max-w-2xl leading-relaxed">
            Compare key metrics, product-wise Quantity Sold, Revenue Targets, and Estimated Sales side-by-side between any two periods to track growth and goal completion.
          </p>
        </div>

        <div className="flex flex-col md:flex-row items-center gap-4 bg-white/10 p-4 rounded-2xl border border-white/20 w-full xl:w-auto backdrop-blur-md">
          {/* Period B (Baseline) */}
          <div className="flex flex-col gap-2 w-full md:w-auto">
            <span className="text-xs font-bold text-indigo-200 uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-indigo-400"></span>
              Baseline Period (B)
            </span>
            <div className="flex items-center gap-2">
              <select 
                value={periodBYear} 
                onChange={(e) => setPeriodBYear(e.target.value)}
                className="bg-white/20 border border-white/20 text-white rounded-lg p-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-indigo-400"
                aria-label="Baseline Year"
              >
                <option value="ALL" className="text-gray-900">All Years</option>
                {years.map(y => <option key={y} value={y} className="text-gray-900">{y}</option>)}
              </select>
              <select 
                value={periodBMonth} 
                onChange={(e) => setPeriodBMonth(e.target.value)}
                className="bg-white/20 border border-white/20 text-white rounded-lg p-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-indigo-400"
                aria-label="Baseline Month"
              >
                {monthsList.map(m => <option key={m.value} value={m.value} className="text-gray-900">{m.label}</option>)}
              </select>
              <select 
                value={periodBWeek} 
                onChange={(e) => setPeriodBWeek(e.target.value)}
                className="bg-white/20 border border-white/20 text-white rounded-lg p-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-indigo-400"
                aria-label="Baseline Week"
              >
                {weeksList.map(w => <option key={w.value} value={w.value} className="text-gray-900">{w.label}</option>)}
              </select>
            </div>
          </div>

          <div className="hidden md:flex items-center justify-center p-2.5 bg-indigo-500/30 rounded-full border border-indigo-400/30">
            <ArrowLeftRight className="w-5 h-5 text-indigo-200" />
          </div>

          {/* Period A (Comparison) */}
          <div className="flex flex-col gap-2 w-full md:w-auto">
            <span className="text-xs font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400"></span>
              Comparison Period (A)
            </span>
            <div className="flex items-center gap-2">
              <select 
                value={periodAYear} 
                onChange={(e) => setPeriodAYear(e.target.value)}
                className="bg-white text-indigo-900 rounded-lg p-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-amber-400 shadow-sm"
                aria-label="Comparison Year"
              >
                <option value="ALL" className="text-gray-900">All Years</option>
                {years.map(y => <option key={y} value={y} className="text-gray-900">{y}</option>)}
              </select>
              <select 
                value={periodAMonth} 
                onChange={(e) => setPeriodAMonth(e.target.value)}
                className="bg-white text-indigo-900 rounded-lg p-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-amber-400 shadow-sm"
                aria-label="Comparison Month"
              >
                {monthsList.map(m => <option key={m.value} value={m.value} className="text-gray-900">{m.label}</option>)}
              </select>
              <select 
                value={periodAWeek} 
                onChange={(e) => setPeriodAWeek(e.target.value)}
                className="bg-white text-indigo-900 rounded-lg p-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-amber-400 shadow-sm"
                aria-label="Comparison Week"
              >
                {weeksList.map(w => <option key={w.value} value={w.value} className="text-gray-900">{w.label}</option>)}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 1: PRODUCT-WISE QUANTITY SOLD, REVENUE TARGET & ESTIMATED SALES  */}
      {/* ========================================================================= */}
      <div className={`rounded-3xl border ${themeStyles.cardBorder} ${themeStyles.cardBg} shadow-sm overflow-hidden p-6 sm:p-8 space-y-6 transition-colors duration-200`}>
        {/* Section Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-gray-100 dark:border-white/10">
          <div className="flex items-start gap-4">
            <div className="p-3.5 bg-gradient-to-br from-indigo-500 to-purple-600 text-white rounded-2xl shadow-md shadow-indigo-500/20">
              <Package className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h3 className={`text-2xl font-black tracking-tight ${themeStyles.textHeading}`}>
                  Product-Wise Comparison
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-100 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                  {allProductNames.length} Products Tracked
                </span>
              </div>
              <p className={`text-xs sm:text-sm font-medium ${themeStyles.textMuted} mt-1`}>
                Compare <strong className="text-indigo-600 dark:text-indigo-400">Quantity Sold</strong>, <strong className="text-purple-600 dark:text-purple-400">Revenue Target</strong>, and <strong className="text-emerald-600 dark:text-emerald-400">Estimated Sales</strong> between <strong>{labelB}</strong> (Baseline) and <strong>{labelA}</strong> (Comparison).
              </p>
            </div>
          </div>

          {/* Quick Action: Export CSV */}
          <div className="flex items-center gap-2.5 self-start lg:self-center">
            <button
              onClick={handleExportProductComparisonCSV}
              id="export-product-comparison-csv-btn"
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-700 text-gray-700 dark:text-gray-200 rounded-xl text-xs sm:text-sm font-bold border border-gray-200 dark:border-zinc-700 shadow-sm transition-all hover:border-gray-300 active:scale-95 cursor-pointer"
              title="Download full product comparison as a CSV spreadsheet"
            >
              <Download className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              Export Product Comparison CSV
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* PRODUCT-WISE COMPARISON: MONTH, YEAR & WEEK FILTER CONTROLS               */}
        {/* ========================================================================= */}
        <div className={`p-5 rounded-2xl border ${themeStyles.cardBorder} bg-gradient-to-br from-indigo-50/70 via-slate-50/50 to-purple-50/70 dark:from-indigo-950/30 dark:via-zinc-900/40 dark:to-purple-950/30 space-y-4 shadow-xs`}>
          {/* Filter Bar Header & Reset */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-200/70 dark:border-white/10">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-indigo-600 text-white rounded-xl shadow-xs">
                <Filter className="w-4 h-4" />
              </div>
              <div>
                <h4 className={`text-sm font-black tracking-tight ${themeStyles.textHeading} flex items-center gap-2`}>
                  <span>Filter by Month, Year & Week</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300">
                    Product-Wise Comparison
                  </span>
                </h4>
                <p className={`text-[11px] font-medium ${themeStyles.textMuted}`}>
                  Filter product targets, sales, and quantities by month, year, and week.
                </p>
              </div>
            </div>

            {/* Quick Actions / Reset */}
            <div className="flex items-center gap-2 self-start sm:self-auto">
              <button
                type="button"
                onClick={handleResetFilters}
                id="reset-product-filters-btn"
                className="px-3 py-1.5 rounded-lg text-xs font-bold text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white bg-white dark:bg-zinc-800 hover:bg-gray-100 dark:hover:bg-zinc-700 border border-gray-200 dark:border-zinc-700 transition cursor-pointer inline-flex items-center gap-1.5 shadow-2xs active:scale-95"
                title="Reset filters to default"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Filters</span>
              </button>
            </div>
          </div>

          {/* Month, Year, Week Filter Controls Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Month Filter */}
            <div className="flex flex-col gap-1.5 p-3 rounded-xl bg-white/90 dark:bg-zinc-900/90 border border-gray-200/80 dark:border-zinc-800 shadow-2xs">
              <label htmlFor="product-filter-month" className={`text-[11px] font-bold ${themeStyles.textMuted} uppercase tracking-wider flex items-center gap-1.5`}>
                <Calendar className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>Month</span>
              </label>
              <select
                id="product-filter-month"
                value={periodAMonth}
                onChange={(e) => setPeriodAMonth(e.target.value)}
                className={`w-full text-xs font-bold px-3 py-2 rounded-lg border ${themeStyles.inputBorder} ${themeStyles.inputBg} ${themeStyles.textHeading} focus:outline-none focus:ring-2 focus:ring-indigo-500 transition cursor-pointer shadow-2xs`}
              >
                {monthsList.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>

            {/* Year Filter */}
            <div className="flex flex-col gap-1.5 p-3 rounded-xl bg-white/90 dark:bg-zinc-900/90 border border-gray-200/80 dark:border-zinc-800 shadow-2xs">
              <label htmlFor="product-filter-year" className={`text-[11px] font-bold ${themeStyles.textMuted} uppercase tracking-wider flex items-center gap-1.5`}>
                <Calendar className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>Year</span>
              </label>
              <select
                id="product-filter-year"
                value={periodAYear}
                onChange={(e) => setPeriodAYear(e.target.value)}
                className={`w-full text-xs font-bold px-3 py-2 rounded-lg border ${themeStyles.inputBorder} ${themeStyles.inputBg} ${themeStyles.textHeading} focus:outline-none focus:ring-2 focus:ring-indigo-500 transition cursor-pointer shadow-2xs`}
              >
                <option value="ALL">All Years</option>
                {years.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            {/* Week Filter */}
            <div className="flex flex-col gap-1.5 p-3 rounded-xl bg-white/90 dark:bg-zinc-900/90 border border-gray-200/80 dark:border-zinc-800 shadow-2xs">
              <label htmlFor="product-filter-week" className={`text-[11px] font-bold ${themeStyles.textMuted} uppercase tracking-wider flex items-center gap-1.5`}>
                <Calendar className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>Week</span>
              </label>
              <select
                id="product-filter-week"
                value={periodAWeek}
                onChange={(e) => setPeriodAWeek(e.target.value)}
                className={`w-full text-xs font-bold px-3 py-2 rounded-lg border ${themeStyles.inputBorder} ${themeStyles.inputBg} ${themeStyles.textHeading} focus:outline-none focus:ring-2 focus:ring-indigo-500 transition cursor-pointer shadow-2xs`}
              >
                {weeksList.map(w => (
                  <option key={w.value} value={w.value}>{w.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Active Filter Chips & Summary */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-gray-200/60 dark:border-white/5 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-[11px] font-bold ${themeStyles.textMuted} uppercase font-mono`}>
                Active Filters:
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 font-bold text-[11px]">
                <Calendar className="w-3 h-3 text-indigo-600" />
                <span>Period: {labelA}</span>
              </span>
              {periodAWeek !== 'All' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white dark:bg-zinc-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-zinc-700 font-bold text-[10px]">
                  Week: {periodAWeek}
                </span>
              )}
            </div>
            
            <div className="flex items-center gap-2">
              <span className={`text-xs font-semibold ${themeStyles.textMuted}`}>
                Showing <strong className={themeStyles.textHeading}>{filteredAndSortedProducts.length}</strong> of {allProductNames.length} products
              </span>
            </div>
          </div>
        </div>

        {/* 4 Summary Highlight Cards for Product Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6">
          {/* 1. Total Quantity Sold */}
          <div className={`p-5 rounded-2xl border ${themeStyles.cardBorder} bg-gradient-to-br from-indigo-50/50 to-white dark:from-indigo-950/20 dark:to-zinc-900/40 relative overflow-hidden`}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                <ShoppingBag className="w-4 h-4" />
                Total Quantity Sold
              </span>
              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                productGrandTotals.qtyDiff > 0 
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
                  : productGrandTotals.qtyDiff < 0 
                    ? 'bg-rose-100 text-rose-800 border border-rose-200' 
                    : 'bg-gray-100 text-gray-700'
              }`}>
                {productGrandTotals.qtyDiff > 0 ? <ArrowUp className="w-3 h-3" /> : (productGrandTotals.qtyDiff < 0 ? <ArrowDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />)}
                {productGrandTotals.qtyDiff >= 0 ? '+' : ''}{formatNumber(productGrandTotals.qtyDiff)} ({productGrandTotals.qtyDiffPct.toFixed(1)}%)
              </span>
            </div>
            <div className="flex items-baseline justify-between mt-2">
              <div>
                <span className="text-[10px] text-gray-400 font-bold block uppercase tracking-wider">{labelB}</span>
                <span className={`text-lg font-semibold ${themeStyles.textMuted}`}>{formatNumber(productGrandTotals.totalQtyB)} units</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-indigo-500 font-bold block uppercase tracking-wider">{labelA}</span>
                <span className={`text-2xl font-black ${themeStyles.textHeading}`}>{formatNumber(productGrandTotals.totalQtyA)} units</span>
              </div>
            </div>
          </div>

          {/* 2. Total Revenue Target */}
          <div className={`p-5 rounded-2xl border ${themeStyles.cardBorder} bg-gradient-to-br from-purple-50/50 to-white dark:from-purple-950/20 dark:to-zinc-900/40 relative overflow-hidden`}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400 flex items-center gap-1.5">
                <Target className="w-4 h-4" />
                Overall Revenue Target
              </span>
              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                productGrandTotals.targetDiff > 0 
                  ? 'bg-purple-100 text-purple-800 border border-purple-200' 
                  : productGrandTotals.targetDiff < 0 
                    ? 'bg-amber-100 text-amber-800 border border-amber-200' 
                    : 'bg-gray-100 text-gray-700'
              }`}>
                {productGrandTotals.targetDiff > 0 ? <ArrowUp className="w-3 h-3" /> : (productGrandTotals.targetDiff < 0 ? <ArrowDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />)}
                {productGrandTotals.targetDiff >= 0 ? '+' : ''}{formatCurrency(productGrandTotals.targetDiff)}
              </span>
            </div>
            <div className="flex items-baseline justify-between mt-2">
              <div>
                <span className="text-[10px] text-gray-400 font-bold block uppercase tracking-wider">{labelB}</span>
                <span className={`text-lg font-semibold ${themeStyles.textMuted}`}>{formatCurrency(productGrandTotals.totalTargetB)}</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-purple-500 font-bold block uppercase tracking-wider">{labelA}</span>
                <span className={`text-2xl font-black ${themeStyles.textHeading}`}>{formatCurrency(productGrandTotals.totalTargetA)}</span>
              </div>
            </div>
          </div>

          {/* 3. Total Estimated Sales */}
          <div className={`p-5 rounded-2xl border ${themeStyles.cardBorder} bg-gradient-to-br from-emerald-50/50 to-white dark:from-emerald-950/20 dark:to-zinc-900/40 relative overflow-hidden`}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4" />
                Total Estimated Sales
              </span>
              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                productGrandTotals.salesDiff > 0 
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
                  : productGrandTotals.salesDiff < 0 
                    ? 'bg-rose-100 text-rose-800 border border-rose-200' 
                    : 'bg-gray-100 text-gray-700'
              }`}>
                {productGrandTotals.salesDiff > 0 ? <ArrowUp className="w-3 h-3" /> : (productGrandTotals.salesDiff < 0 ? <ArrowDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />)}
                {productGrandTotals.salesDiff >= 0 ? '+' : ''}{formatCurrency(productGrandTotals.salesDiff)} ({productGrandTotals.salesDiffPct.toFixed(1)}%)
              </span>
            </div>
            <div className="flex items-baseline justify-between mt-2">
              <div>
                <span className="text-[10px] text-gray-400 font-bold block uppercase tracking-wider">{labelB}</span>
                <span className={`text-lg font-semibold ${themeStyles.textMuted}`}>{formatCurrency(productGrandTotals.totalSalesB)}</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-emerald-600 font-bold block uppercase tracking-wider">{labelA}</span>
                <span className={`text-2xl font-black text-emerald-700 dark:text-emerald-400`}>{formatCurrency(productGrandTotals.totalSalesA)}</span>
              </div>
            </div>
          </div>

          {/* 4. Target Achievement % */}
          <div className={`p-5 rounded-2xl border ${themeStyles.cardBorder} bg-gradient-to-br from-blue-50/50 to-white dark:from-blue-950/20 dark:to-zinc-900/40 relative overflow-hidden`}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                <Percent className="w-4 h-4" />
                Target Achievement
              </span>
              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                productGrandTotals.achDiff > 0 
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
                  : productGrandTotals.achDiff < 0 
                    ? 'bg-rose-100 text-rose-800 border border-rose-200' 
                    : 'bg-gray-100 text-gray-700'
              }`}>
                {productGrandTotals.achDiff > 0 ? <ArrowUp className="w-3 h-3" /> : (productGrandTotals.achDiff < 0 ? <ArrowDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />)}
                {productGrandTotals.achDiff >= 0 ? '+' : ''}{productGrandTotals.achDiff.toFixed(1)}% pts
              </span>
            </div>
            <div className="flex items-baseline justify-between mt-2">
              <div>
                <span className="text-[10px] text-gray-400 font-bold block uppercase tracking-wider">{labelB}</span>
                <span className={`text-lg font-semibold ${themeStyles.textMuted}`}>{productGrandTotals.achRateB.toFixed(1)}%</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-blue-600 font-bold block uppercase tracking-wider">{labelA}</span>
                <span className={`text-2xl font-black ${themeStyles.textHeading}`}>{productGrandTotals.achRateA.toFixed(1)}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Search, Filter & Sort Controls */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 pt-2">
          {/* Search bar */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search product name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              id="product-compare-search-input"
              className={`w-full pl-10 pr-8 py-2.5 text-xs sm:text-sm rounded-xl border ${themeStyles.cardBorder} ${themeStyles.cardBg} ${themeStyles.textHeading} outline-none focus:ring-2 focus:ring-indigo-500 transition-all`}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer p-0.5 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition"
                title="Clear product search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setFilterMode('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                filterMode === 'all'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-zinc-700'
              }`}
            >
              All Products ({productComparisons.length})
            </button>
            <button
              onClick={() => setFilterMode('active')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                filterMode === 'active'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-zinc-700'
              }`}
            >
              With Activity
            </button>
            <button
              onClick={() => setFilterMode('growing')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                filterMode === 'growing'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60'
              }`}
            >
              Sales Grew (▲)
            </button>
            <button
              onClick={() => setFilterMode('declining')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                filterMode === 'declining'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/60'
              }`}
            >
              Sales Declined (▼)
            </button>
          </div>

          {/* Sort Selector */}
          <div className="flex items-center gap-2 self-end md:self-center">
            <span className="text-xs text-gray-400 font-bold uppercase tracking-wider">Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              aria-label="Sort product comparison"
              className={`text-xs font-semibold py-1.5 px-2.5 rounded-lg border ${themeStyles.cardBorder} ${themeStyles.cardBg} ${themeStyles.textHeading} outline-none focus:ring-2 focus:ring-indigo-400`}
            >
              <option value="salesA">Estimated Sales (Comparison Period)</option>
              <option value="salesDiff">Estimated Sales Growth (Delta)</option>
              <option value="qtyA">Quantity Sold (Comparison Period)</option>
              <option value="qtyDiff">Quantity Sold Growth (Delta)</option>
              <option value="targetA">Revenue Target (Comparison Period)</option>
              <option value="achA">Target Achievement %</option>
              <option value="name">Product Name</option>
            </select>
            <button
              onClick={() => setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')}
              className={`p-1.5 rounded-lg border ${themeStyles.cardBorder} hover:bg-gray-100 dark:hover:bg-zinc-800 text-xs font-bold text-gray-600 dark:text-gray-300`}
              title={sortDirection === 'asc' ? 'Ascending' : 'Descending'}
            >
              {sortDirection === 'asc' ? '▲' : '▼'}
            </button>
          </div>
        </div>

        {/* Product Comparison Table */}
        <div className="overflow-x-auto rounded-2xl border border-gray-200/80 dark:border-white/10 shadow-inner">
          <table className="w-full text-left border-collapse text-xs sm:text-sm">
            <thead>
              <tr className="bg-gray-50/90 dark:bg-zinc-800/80 border-b border-gray-200 dark:border-zinc-700 font-black tracking-wider uppercase text-[11px] text-gray-600 dark:text-gray-300">
                <th className="p-3.5 pl-4 sticky left-0 z-10 bg-gray-50 dark:bg-zinc-800 min-w-[200px]">
                  Product Name
                </th>
                
                {/* Quantity Sold comparison */}
                <th className="p-3.5 text-right border-l border-gray-200/60 dark:border-zinc-700/60 min-w-[200px] bg-indigo-50/40 dark:bg-indigo-950/20">
                  <div className="flex flex-col items-end">
                    <span className="text-indigo-700 dark:text-indigo-400 font-black">Quantity Sold</span>
                    <span className="text-[10px] font-normal text-gray-400">
                      {labelB} → {labelA}
                    </span>
                  </div>
                </th>

                {/* Revenue Target comparison */}
                <th className="p-3.5 text-right border-l border-gray-200/60 dark:border-zinc-700/60 min-w-[220px] bg-purple-50/40 dark:bg-purple-950/20">
                  <div className="flex flex-col items-end">
                    <span className="text-purple-700 dark:text-purple-400 font-black">Revenue Target (₹)</span>
                    <span className="text-[10px] font-normal text-gray-400">
                      {labelB} → {labelA}
                    </span>
                  </div>
                </th>

                {/* Estimated Sales comparison */}
                <th className="p-3.5 text-right border-l border-gray-200/60 dark:border-zinc-700/60 min-w-[230px] bg-emerald-50/40 dark:bg-emerald-950/20">
                  <div className="flex flex-col items-end">
                    <span className="text-emerald-700 dark:text-emerald-400 font-black">Estimated Sales (₹)</span>
                    <span className="text-[10px] font-normal text-gray-400">
                      {labelB} → {labelA}
                    </span>
                  </div>
                </th>

                {/* Target Achievement Rate */}
                <th className="p-3.5 text-right border-l border-gray-200/60 dark:border-zinc-700/60 min-w-[190px]">
                  <div className="flex flex-col items-end">
                    <span className="font-black">Achievement Rate</span>
                    <span className="text-[10px] font-normal text-gray-400">
                      Sales / Revenue Target
                    </span>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-white/5 font-medium">
              {filteredAndSortedProducts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-gray-400 text-sm">
                    No products found matching your search or filter criteria.
                  </td>
                </tr>
              ) : (
                filteredAndSortedProducts.map((p, idx) => {
                  const hasActivity = p.periodA.quantitySold > 0 || p.periodB.quantitySold > 0 || 
                                      p.periodA.estimatedSales > 0 || p.periodB.estimatedSales > 0 || 
                                      p.periodA.revenueTarget > 0 || p.periodB.revenueTarget > 0;

                  return (
                    <tr 
                      key={p.name}
                      className={`hover:bg-indigo-50/30 dark:hover:bg-white/5 transition-colors ${
                        idx % 2 === 0 ? 'bg-transparent' : 'bg-black/[0.015] dark:bg-white/[0.015]'
                      }`}
                    >
                      {/* Product Name */}
                      <td className="p-3.5 pl-4 sticky left-0 z-10 bg-white dark:bg-zinc-900 font-bold text-gray-900 dark:text-white border-r border-gray-100 dark:border-zinc-800">
                        <div className="flex items-center gap-2.5">
                          <span className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-black text-xs shrink-0">
                            {idx + 1}
                          </span>
                          <div>
                            <span className="block font-bold text-gray-900 dark:text-gray-100">{p.name}</span>
                            {!hasActivity && (
                              <span className="text-[10px] text-gray-400 italic">No targets or sales recorded in periods</span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Quantity Sold */}
                      <td className="p-3.5 text-right border-l border-gray-100 dark:border-zinc-800 font-mono">
                        <div className="flex flex-col items-end gap-1">
                          <div className="flex items-baseline justify-end gap-2 text-xs">
                            <span className="text-gray-400 line-through decoration-gray-300">{formatNumber(p.periodB.quantitySold)}</span>
                            <span className="text-gray-400">→</span>
                            <span className="font-black text-sm text-indigo-700 dark:text-indigo-300">{formatNumber(p.periodA.quantitySold)}</span>
                          </div>
                          <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[11px] font-bold ${
                            p.qtyDiff > 0 
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300' 
                              : p.qtyDiff < 0 
                                ? 'bg-rose-50 text-rose-700 border border-rose-200/80 dark:bg-rose-950/40 dark:text-rose-300' 
                                : 'text-gray-400'
                          }`}>
                            {p.qtyDiff > 0 ? '+' : ''}{formatNumber(p.qtyDiff)} ({p.qtyDiffPct >= 0 ? '+' : ''}{p.qtyDiffPct.toFixed(1)}%)
                          </span>
                        </div>
                      </td>

                      {/* Revenue Target */}
                      <td className="p-3.5 text-right border-l border-gray-100 dark:border-zinc-800 font-mono">
                        <div className="flex flex-col items-end gap-1">
                          <div className="flex items-baseline justify-end gap-2 text-xs">
                            <span className="text-gray-400">{formatCurrency(p.periodB.revenueTarget)}</span>
                            <span className="text-gray-400">→</span>
                            <span className="font-black text-sm text-purple-700 dark:text-purple-300">{formatCurrency(p.periodA.revenueTarget)}</span>
                          </div>
                          {p.targetDiff !== 0 ? (
                            <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[11px] font-bold ${
                              p.targetDiff > 0 
                                ? 'bg-purple-50 text-purple-700 border border-purple-200/80 dark:bg-purple-950/40 dark:text-purple-300' 
                                : 'bg-amber-50 text-amber-700 border border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-300'
                            }`}>
                              {p.targetDiff > 0 ? '+' : ''}{formatCurrency(p.targetDiff)}
                            </span>
                          ) : (
                            <span className="text-[11px] text-gray-400">Unchanged</span>
                          )}
                        </div>
                      </td>

                      {/* Estimated Sales */}
                      <td className="p-3.5 text-right border-l border-gray-100 dark:border-zinc-800 font-mono">
                        <div className="flex flex-col items-end gap-1">
                          <div className="flex items-baseline justify-end gap-2 text-xs">
                            <span className="text-gray-400">{formatCurrency(p.periodB.estimatedSales)}</span>
                            <span className="text-gray-400">→</span>
                            <span className="font-black text-sm text-emerald-700 dark:text-emerald-400">{formatCurrency(p.periodA.estimatedSales)}</span>
                          </div>
                          <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[11px] font-bold ${
                            p.salesDiff > 0 
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300' 
                              : p.salesDiff < 0 
                                ? 'bg-rose-50 text-rose-700 border border-rose-200/80 dark:bg-rose-950/40 dark:text-rose-300' 
                                : 'text-gray-400'
                          }`}>
                            {p.salesDiff > 0 ? '+' : ''}{formatCurrency(p.salesDiff)} ({p.salesDiffPct >= 0 ? '+' : ''}{p.salesDiffPct.toFixed(1)}%)
                          </span>
                        </div>
                      </td>

                      {/* Target Achievement Rate */}
                      <td className="p-3.5 text-right border-l border-gray-100 dark:border-zinc-800 font-mono">
                        <div className="flex flex-col items-end gap-1">
                          <div className="flex items-baseline justify-end gap-2">
                            <span className="text-xs text-gray-400">{p.periodB.achievementRate.toFixed(1)}%</span>
                            <span className="text-gray-400 text-xs">→</span>
                            <span className={`font-black text-sm ${
                              p.periodA.achievementRate >= 100 
                                ? 'text-emerald-600 dark:text-emerald-400' 
                                : p.periodA.achievementRate >= 70 
                                  ? 'text-indigo-600 dark:text-indigo-400' 
                                  : 'text-amber-600 dark:text-amber-400'
                            }`}>
                              {p.periodA.achievementRate.toFixed(1)}%
                            </span>
                          </div>
                          {/* Mini Progress Bar */}
                          <div className="w-24 h-1.5 bg-gray-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full ${
                                p.periodA.achievementRate >= 100 
                                  ? 'bg-emerald-500' 
                                  : p.periodA.achievementRate >= 70 
                                    ? 'bg-indigo-500' 
                                    : 'bg-amber-500'
                              }`}
                              style={{ width: `${Math.min(100, Math.max(0, p.periodA.achievementRate))}%` }}
                            />
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {/* Grand Totals Footer */}
            {filteredAndSortedProducts.length > 0 && (
              <tfoot>
                <tr className="bg-gray-100 dark:bg-zinc-800/90 font-black border-t-2 border-indigo-500 text-xs sm:text-sm">
                  <td className="p-4 pl-4 sticky left-0 z-10 bg-gray-100 dark:bg-zinc-800 text-gray-900 dark:text-white uppercase tracking-wider">
                    === Total Overall ===
                  </td>

                  {/* Total Quantity Sold */}
                  <td className="p-4 text-right border-l border-gray-200 dark:border-zinc-700 font-mono">
                    <div className="flex flex-col items-end">
                      <div className="flex items-baseline justify-end gap-2 text-xs">
                        <span className="text-gray-400">{formatNumber(productGrandTotals.totalQtyB)}</span>
                        <span className="text-gray-400">→</span>
                        <span className="font-black text-sm text-indigo-700 dark:text-indigo-300">{formatNumber(productGrandTotals.totalQtyA)} units</span>
                      </div>
                      <span className={`text-[11px] font-bold ${productGrandTotals.qtyDiff >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {productGrandTotals.qtyDiff >= 0 ? '+' : ''}{formatNumber(productGrandTotals.qtyDiff)} ({productGrandTotals.qtyDiffPct.toFixed(1)}%)
                      </span>
                    </div>
                  </td>

                  {/* Total Revenue Target */}
                  <td className="p-4 text-right border-l border-gray-200 dark:border-zinc-700 font-mono">
                    <div className="flex flex-col items-end">
                      <div className="flex items-baseline justify-end gap-2 text-xs">
                        <span className="text-gray-400">{formatCurrency(productGrandTotals.totalTargetB)}</span>
                        <span className="text-gray-400">→</span>
                        <span className="font-black text-sm text-purple-700 dark:text-purple-300">{formatCurrency(productGrandTotals.totalTargetA)}</span>
                      </div>
                      <span className="text-[11px] font-bold text-purple-600">
                        {productGrandTotals.targetDiff >= 0 ? '+' : ''}{formatCurrency(productGrandTotals.targetDiff)}
                      </span>
                    </div>
                  </td>

                  {/* Total Estimated Sales */}
                  <td className="p-4 text-right border-l border-gray-200 dark:border-zinc-700 font-mono">
                    <div className="flex flex-col items-end">
                      <div className="flex items-baseline justify-end gap-2 text-xs">
                        <span className="text-gray-400">{formatCurrency(productGrandTotals.totalSalesB)}</span>
                        <span className="text-gray-400">→</span>
                        <span className="font-black text-sm text-emerald-700 dark:text-emerald-400">{formatCurrency(productGrandTotals.totalSalesA)}</span>
                      </div>
                      <span className={`text-[11px] font-bold ${productGrandTotals.salesDiff >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {productGrandTotals.salesDiff >= 0 ? '+' : ''}{formatCurrency(productGrandTotals.salesDiff)} ({productGrandTotals.salesDiffPct.toFixed(1)}%)
                      </span>
                    </div>
                  </td>

                  {/* Total Achievement Rate */}
                  <td className="p-4 text-right border-l border-gray-200 dark:border-zinc-700 font-mono">
                    <div className="flex flex-col items-end">
                      <div className="flex items-baseline justify-end gap-2 text-xs">
                        <span className="text-gray-400">{productGrandTotals.achRateB.toFixed(1)}%</span>
                        <span className="text-gray-400">→</span>
                        <span className="font-black text-sm text-indigo-700 dark:text-indigo-300">{productGrandTotals.achRateA.toFixed(1)}%</span>
                      </div>
                      <span className={`text-[11px] font-bold ${productGrandTotals.achDiff >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {productGrandTotals.achDiff >= 0 ? '+' : ''}{productGrandTotals.achDiff.toFixed(1)}% pts
                      </span>
                    </div>
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 2: INFLUENCER & CAMPAIGN PLACEMENT METRICS                        */}
      {/* ========================================================================= */}
      <div className="space-y-4 pt-2">
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-indigo-500" />
          <h3 className={`text-xl font-bold ${themeStyles.textHeading}`}>
            Influencer Campaign & Outreach Performance
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {renderMetric('Active Creators', periodAMetrics.activeCreators, periodBMetrics.activeCreators, 'number', <Users className="w-6 h-6" />)}
          {renderMetric('Total Placements', periodAMetrics.placements, periodBMetrics.placements, 'number', <Play className="w-6 h-6" />)}
          {renderMetric('Total Spend', periodAMetrics.spend, periodBMetrics.spend, 'currency', <DollarSign className="w-6 h-6" />)}
          {renderMetric('Click-Through Rate', periodAMetrics.ctr, periodBMetrics.ctr, 'percent', <Activity className="w-6 h-6" />)}
          
          {renderMetric('Total Views', periodAMetrics.views, periodBMetrics.views, 'number', <Play className="w-6 h-6" />)}
          {renderMetric('Total Clicks', periodAMetrics.clicks, periodBMetrics.clicks, 'number', <MousePointerClick className="w-6 h-6" />)}
          {renderMetric('Cost per View (CPV)', periodAMetrics.cpv, periodBMetrics.cpv, 'currency', <TrendingDown className="w-6 h-6" />, true)}
          {renderMetric('Cost per Click (CPC)', periodAMetrics.cpc, periodBMetrics.cpc, 'currency', <TrendingDown className="w-6 h-6" />, true)}
        </div>
      </div>
    </div>
  );
}
