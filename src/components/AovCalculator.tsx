import React, { useState, useMemo, useEffect } from 'react';
import { 
  Calculator, 
  Coins, 
  Calendar, 
  Trash2, 
  Plus, 
  Save, 
  TrendingUp, 
  Sparkles, 
  Check, 
  Percent, 
  AlertCircle, 
  ShoppingBag, 
  FileText, 
  Briefcase,
  Layers,
  Tag,
  CloudDownload
} from 'lucide-react';
import { AovEntry } from '../types';
import { MonthlyProductTarget } from './MonthlyTargets';

// Standard months mapping
export const MONTHS_MAP: { [key: string]: string } = {
  '01': 'January',
  '02': 'February',
  '03': 'March',
  '04': 'April',
  '05': 'May',
  '06': 'June',
  '07': 'July',
  '08': 'August',
  '09': 'September',
  '10': 'October',
  '11': 'November',
  '12': 'December',
};

const YEARS = ['2025', '2026', '2027', '2028'];
const DEFAULT_STANDARD_PRODUCTS = ['BHIM BANANA OATS', 'CHOCOLATE DRINK', 'HIGH PROTEIN OATS', 'OTHERS 1', 'OTHERS 2'];

interface AovCalculatorProps {
  selectedMonth: string;
  setSelectedMonth: (m: string) => void;
  selectedYear: string;
  setSelectedYear: (y: string) => void;
  selectedWeek: string;
  setSelectedWeek: (w: string) => void;
  aovEntries: AovEntry[];
  setAovEntries: React.Dispatch<React.SetStateAction<AovEntry[]>>;
  monthlyTargets: MonthlyProductTarget[];
  savedProducts?: string[];
  user?: any;
  initialMonth?: string;
  initialYear?: string;
  tasks?: any[];
  onlyShowPlacedProducts?: boolean;
  onToggleOnlyShowPlacedProducts?: (val: boolean) => void;
  salesData?: any[];
}

export default function AovCalculator({ 
  selectedMonth, setSelectedMonth, selectedYear, setSelectedYear, selectedWeek, setSelectedWeek,
  aovEntries,
  setAovEntries,
  monthlyTargets = [],
  savedProducts = [],
  user,
  initialMonth = '05',
  initialYear = '2026',
  tasks = [],
  onlyShowPlacedProducts = true,
  onToggleOnlyShowPlacedProducts,
  salesData = []
}: AovCalculatorProps) {
  // Navigation View Option selectors
  const viewMonth = selectedMonth;
  const setViewMonth = setSelectedMonth;
  const viewYear = selectedYear;
  const setViewYear = setSelectedYear;
  const viewWeek = selectedWeek;
  const setViewWeek = setSelectedWeek;
  const [viewScope, setViewScope] = useState<'global' | 'product'>('global');
  const [viewProduct, setViewProduct] = useState<string>('');

  // Input States (Controlled Form)
  const [entryScope, setEntryScope] = useState<'global' | 'product'>('global');
  const [selectedProduct, setSelectedProduct] = useState<string>('');
  const [customProduct, setCustomProduct] = useState<string>('');
  const [inputMonth, setInputMonth] = useState<string>(initialMonth);
  const [inputYear, setInputYear] = useState<string>(initialYear);
  const [inputWeek, setInputWeek] = useState<string>('');
  const [revenue, setRevenue] = useState<string>('');
  const [orders, setOrders] = useState<string>('');
  const [targetAov, setTargetAov] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  
  // Historical index filter states
  const [filterScope, setFilterScope] = useState<'all' | 'global' | 'product'>('all');
  const [filterProduct, setFilterProduct] = useState<string>('all');
  const filterYear = selectedYear;
  const setFilterYear = setSelectedYear;
  const filterMonth = selectedMonth;
  const setFilterMonth = setSelectedMonth;
  const filterWeek = selectedWeek;
  const setFilterWeek = setSelectedWeek;
  const [detailEntry, setDetailEntry] = useState<AovEntry | null>(null);

  // Feedback notices
  const [notice, setNotice] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Consolidated product list
  const displayProducts = useMemo(() => {
    let list = [...(savedProducts || [])].filter(p => p !== 'CENTRAL_BUDGET');
    DEFAULT_STANDARD_PRODUCTS.forEach(p => {
      if (!list.includes(p)) list.push(p);
    });

    if (onlyShowPlacedProducts && tasks) {
      const placedSet = new Set<string>();
      tasks.forEach((t: any) => {
        if (t.title && t.title.trim()) {
          placedSet.add(t.title.trim().toLowerCase());
        }
      });
      list = list.filter(p => placedSet.has(p.trim().toLowerCase()));
    }
    return list;
  }, [savedProducts, onlyShowPlacedProducts, tasks]);

  // Set default product selections once products are ready
  useEffect(() => {
    if (!viewProduct && displayProducts.length > 0) {
      setViewProduct(displayProducts[0]);
    }
  }, [displayProducts, viewProduct]);

  useEffect(() => {
    if (!selectedProduct && displayProducts.length > 0) {
      setSelectedProduct(displayProducts[0]);
    }
  }, [displayProducts, selectedProduct]);

  // Auto-synchronize with sales data when it changes
  useEffect(() => {
    if (!salesData || salesData.length === 0) return;

    const productGroups: Record<string, { revenue: number; orders: number }> = {};
    const globalGroups: Record<string, { revenue: number; orders: number }> = {};

    salesData.forEach(row => {
      const { year, month, productName, netRevenue, quantity } = row;
      const mStr = String(month).padStart(2, '0');
      const yStr = String(year);
      const rev = Number(netRevenue) || 0;
      const qty = Number(quantity) || 1;

      if (yStr && mStr) {
        const gKey = `${yStr}-${mStr}`;
        if (!globalGroups[gKey]) globalGroups[gKey] = { revenue: 0, orders: 0 };
        globalGroups[gKey].revenue += rev;
        globalGroups[gKey].orders += qty;

        if (productName) {
           const pKey = `${yStr}-${mStr}-${productName}`;
           if (!productGroups[pKey]) productGroups[pKey] = { revenue: 0, orders: 0 };
           productGroups[pKey].revenue += rev;
           productGroups[pKey].orders += qty;
        }
      }
    });

    setAovEntries(prev => {
      let isChanged = false;
      let updated = [...prev];

      Object.entries(globalGroups).forEach(([key, data]) => {
         const [y, m] = key.split('-');
         // Find ALL matching global entries
         const matchingIndices: number[] = [];
         updated.forEach((e, idx) => {
           if (e.year === y && e.month === m && !e.productName && !e.week) {
             matchingIndices.push(idx);
           }
         });
         
         if (matchingIndices.length > 0) {
           const existingIdx = matchingIndices[0];
           const existing = updated[existingIdx];
           
           // If duplicates exist, remove all but the first one to clean up
           if (matchingIndices.length > 1) {
             const indicesToRemove = new Set(matchingIndices.slice(1));
             updated = updated.filter((_, idx) => !indicesToRemove.has(idx));
             isChanged = true;
           }

           if (existing.revenue !== data.revenue || existing.orders !== data.orders) {
             updated[updated.findIndex(e => e.id === existing.id)] = { ...existing, revenue: data.revenue, orders: data.orders, calculatedAov: data.orders > 0 ? parseFloat((data.revenue / data.orders).toFixed(2)) : 0 };
             isChanged = true;
           }
         } else {
           updated.push({
             id: `auto-global-${y}-${m}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
             month: m,
             year: y,
             revenue: data.revenue,
             orders: data.orders,
             calculatedAov: data.orders > 0 ? parseFloat((data.revenue / data.orders).toFixed(2)) : 0
           });
           isChanged = true;
         }
      });

      Object.entries(productGroups).forEach(([key, data]) => {
         const [y, m, ...pParts] = key.split('-');
         const pName = pParts.join('-');
         
         // Find ALL matching product entries
         const matchingIndices: number[] = [];
         updated.forEach((e, idx) => {
           if (e.year === y && e.month === m && e.productName === pName && !e.week) {
             matchingIndices.push(idx);
           }
         });
         
         if (matchingIndices.length > 0) {
           const existingIdx = matchingIndices[0];
           const existing = updated[existingIdx];
           
           // If duplicates exist, remove all but the first one to clean up
           if (matchingIndices.length > 1) {
             const indicesToRemove = new Set(matchingIndices.slice(1));
             updated = updated.filter((_, idx) => !indicesToRemove.has(idx));
             isChanged = true;
           }

           if (existing.revenue !== data.revenue || existing.orders !== data.orders) {
             updated[updated.findIndex(e => e.id === existing.id)] = { ...existing, revenue: data.revenue, orders: data.orders, calculatedAov: data.orders > 0 ? parseFloat((data.revenue / data.orders).toFixed(2)) : 0 };
             isChanged = true;
           }
         } else {
           updated.push({
             id: `auto-prod-${y}-${m}-${pName}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
             month: m,
             year: y,
             productName: pName,
             revenue: data.revenue,
             orders: data.orders,
             calculatedAov: data.orders > 0 ? parseFloat((data.revenue / data.orders).toFixed(2)) : 0
           });
           isChanged = true;
         }
      });

      return isChanged ? updated : prev;
    });
  }, [salesData, setAovEntries]);

  // Compute live values on the fly for preview
  const liveRevenue = parseFloat(revenue) || 0;
  const liveOrders = parseInt(orders) || 0;
  const liveTargetAov = parseFloat(targetAov) || 0;
  const liveCalculatedAov = liveOrders > 0 ? liveRevenue / liveOrders : 0;

  // Find exact saved entry for selected view configurations
  const activeViewEntry = useMemo(() => {
    return aovEntries.find(entry => 
      entry.month === viewMonth && 
      entry.year === viewYear && 
      entry.week === (viewWeek || undefined) &&
      (viewScope === 'product' ? entry.productName === viewProduct : !entry.productName)
    );
  }, [aovEntries, viewMonth, viewYear, viewWeek, viewScope, viewProduct]);

  // Handle auto-collecting data from E-Commerce Sales Dashboard
  const handleAutoCollectFromSales = () => {
    if (!salesData || salesData.length === 0) {
      setNotice({ text: 'No Sales Data available to collect.', type: 'error' });
      setTimeout(() => setNotice(null), 3000);
      return;
    }

    if (!window.confirm('Are you sure you want to automatically collect and overwrite AOV data based on the Sales Dashboard?')) {
      return;
    }

    const newEntries: AovEntry[] = [];
    const now = Date.now();

    // Group by Year-Month-Product
    const productGroups: Record<string, { revenue: number; orders: number }> = {};
    // Group by Year-Month
    const globalGroups: Record<string, { revenue: number; orders: number }> = {};

    salesData.forEach(row => {
      const { year, month, productName, netRevenue, quantity } = row;
      const mStr = String(month).padStart(2, '0');
      const yStr = String(year);
      const rev = Number(netRevenue) || 0;
      const qty = Number(quantity) || 1; // Use quantity as 'orders' approximation

      if (yStr && mStr) {
        // Global
        const gKey = `${yStr}-${mStr}`;
        if (!globalGroups[gKey]) globalGroups[gKey] = { revenue: 0, orders: 0 };
        globalGroups[gKey].revenue += rev;
        globalGroups[gKey].orders += qty;

        // Product
        if (productName) {
           const pKey = `${yStr}-${mStr}-${productName}`;
           if (!productGroups[pKey]) productGroups[pKey] = { revenue: 0, orders: 0 };
           productGroups[pKey].revenue += rev;
           productGroups[pKey].orders += qty;
        }
      }
    });

    Object.entries(globalGroups).forEach(([key, data]) => {
       const [y, m] = key.split('-');
       newEntries.push({
         id: `auto-global-${y}-${m}-${now}`,
         month: m,
         year: y,
         revenue: data.revenue,
         orders: data.orders,
         calculatedAov: data.orders > 0 ? parseFloat((data.revenue / data.orders).toFixed(2)) : 0
       });
    });

    Object.entries(productGroups).forEach(([key, data]) => {
       const [y, m, ...pParts] = key.split('-');
       const pName = pParts.join('-');
       newEntries.push({
         id: `auto-prod-${y}-${m}-${pName}-${now}`,
         month: m,
         year: y,
         productName: pName,
         revenue: data.revenue,
         orders: data.orders,
         calculatedAov: data.orders > 0 ? parseFloat((data.revenue / data.orders).toFixed(2)) : 0
       });
    });

    if (newEntries.length > 0) {
       setAovEntries(prev => {
          let updated = [...prev];
          
          Object.keys(globalGroups).forEach(gKey => {
             const [y, m] = gKey.split('-');
             updated = updated.filter(e => !(e.year === y && e.month === m && !e.productName));
          });
          
          Object.keys(productGroups).forEach(pKey => {
             const [y, m, ...pParts] = pKey.split('-');
             const pName = pParts.join('-');
             updated = updated.filter(e => !(e.year === y && e.month === m && e.productName === pName));
          });

          return [...updated, ...newEntries];
       });
       setNotice({ text: `Successfully synced ${newEntries.length} records from E-Commerce Sales.`, type: 'success' });
       setTimeout(() => setNotice(null), 3000);
    }
  };

  // Handle auto-population from the Monthly Product targets and campaigns
  const handleAutoPopulate = () => {
    // Collect targets for the inputMonth and inputYear
    const filteredTargets = monthlyTargets.filter(t => t.month === inputMonth && t.year === inputYear);
    
    if (entryScope === 'product') {
      const prodName = selectedProduct === '__custom__' ? customProduct.trim() : selectedProduct;
      if (!prodName) {
        showNotice('Please select or specify a product first to look up its targets.', 'error');
        return;
      }

      const specificTarget = filteredTargets.find(t => t.productName.toLowerCase() === prodName.toLowerCase());
      if (specificTarget) {
        const actualSales = specificTarget.salesAmount || 0;
        // Estimate orders based on standard high ticket size averages or fallback
        const videoCount = specificTarget.videoTarget || 5;
        const estimatedOrders = Math.max(10, videoCount * 12);

        setRevenue(actualSales > 0 ? actualSales.toString() : '350000');
        setOrders(estimatedOrders.toString());
        setTargetAov('5000');
        setNotes(`Auto-assembled from targets lists for "${prodName}" during ${MONTHS_MAP[inputMonth]} ${inputYear}.`);
        showNotice(`Estimated details generated for ${prodName}! Target sales: ₹${actualSales.toLocaleString()}`, 'success');
      } else {
        // Fallback baseline for product matching
        setRevenue('300000');
        setOrders('50');
        setTargetAov('6000');
        setNotes(`Baseline placeholder generated for "${prodName}". (No target tracker records mapped for ${MONTHS_MAP[inputMonth]} ${inputYear})`);
        showNotice(`No specific targets found for ${prodName} in ${MONTHS_MAP[inputMonth]} ${inputYear}. Generated standard baseline.`, 'success');
      }
    } else {
      // Sum standard actual sales Amount
      const actualSales = filteredTargets.reduce((sum, t) => sum + (t.salesAmount || 0), 0);
      
      // Guess order numbers based on product video target averages or defaults
      const estimatedOrders = filteredTargets.reduce((sum, t) => {
        const targetCount = t.videoTarget || 5;
        return sum + (targetCount * 12);
      }, 0);

      setRevenue(actualSales > 0 ? actualSales.toString() : '1250000');
      setOrders(estimatedOrders > 0 ? estimatedOrders.toString() : '250');
      setTargetAov('5000');
      setNotes(`Auto-compiled group estimate based on ${filteredTargets.length} products listed under targets for ${MONTHS_MAP[inputMonth]} ${inputYear}.`);

      showNotice(`Estimated details generated from targets lists! Actual Sales: ₹${actualSales.toLocaleString()}`, 'success');
    }
  };

  const showNotice = (msg: string, type: 'success' | 'error') => {
    setNotice({ text: msg, type });
    setTimeout(() => {
      setNotice(null);
    }, 4000);
  };

  const handleSaveEntry = () => {
    if (liveRevenue <= 0) {
      showNotice('Please enter a valid Total Revenue greater than 0', 'error');
      return;
    }
    if (liveOrders <= 0) {
      showNotice('Please enter a valid Total Orders count greater than 0', 'error');
      return;
    }

    const calculated = Math.round((liveRevenue / liveOrders) * 100) / 100;
    const resolvedProduct = entryScope === 'product'
      ? (selectedProduct === '__custom__' ? customProduct.trim() : selectedProduct)
      : undefined;

    if (entryScope === 'product' && !resolvedProduct) {
      showNotice('Please specify a valid product name.', 'error');
      return;
    }

    // Build the new or updated entry
    const matchingIdx = aovEntries.findIndex(e => 
      e.month === inputMonth && 
      e.year === inputYear && 
      e.week === (inputWeek || undefined) &&
      (resolvedProduct ? e.productName === resolvedProduct : !e.productName)
    );
    
    const newEntry: AovEntry = {
      id: matchingIdx > -1 ? aovEntries[matchingIdx].id : `aov-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      month: inputMonth,
      year: inputYear,
      week: inputWeek || undefined,
      productName: resolvedProduct || undefined,
      revenue: liveRevenue,
      orders: liveOrders,
      calculatedAov: calculated,
      targetAov: liveTargetAov > 0 ? liveTargetAov : undefined,
      notes: notes.trim() || undefined,
      ownerId: user?.uid
    };

    setAovEntries(prev => {
      const next = [...prev];
      if (matchingIdx > -1) {
        next[matchingIdx] = newEntry;
      } else {
        next.push(newEntry);
      }
      return next;
    });

    // Sync selections for viewing
    setViewMonth(inputMonth);
    setViewYear(inputYear);
    setViewWeek(inputWeek);
    if (resolvedProduct) {
      setViewScope('product');
      setViewProduct(resolvedProduct);
    } else {
      setViewScope('global');
    }

    // Clear main input forms of temporary numeric values to avoid duplicate submission
    setRevenue('');
    setOrders('');
    setTargetAov('');
    setNotes('');
    setCustomProduct('');

    showNotice(`Successfully logged and synchronized AOV checkpoints for ${resolvedProduct ? resolvedProduct : 'Global'} period ${inputWeek ? inputWeek + ', ' : ''}${MONTHS_MAP[inputMonth]} ${inputYear}!`, 'success');
  };

  const handleDeleteEntry = (id: string, name: string) => {
    if (window.confirm(`Are you sure you want to delete the saved AOV checkpoint for ${name}?`)) {
      setAovEntries(prev => prev.filter(e => e.id !== id));
      showNotice(`Removed checkpoint record for ${name}.`, 'success');
    }
  };

  const handleLoadToEdit = (entry: AovEntry) => {
    setInputMonth(entry.month);
    setInputYear(entry.year);
    setInputWeek(entry.week || '');
    setRevenue(entry.revenue.toString());
    setOrders(entry.orders.toString());
    setTargetAov(entry.targetAov ? entry.targetAov.toString() : '');
    setNotes(entry.notes || '');
    
    if (entry.productName) {
      setEntryScope('product');
      if (displayProducts.includes(entry.productName)) {
        setSelectedProduct(entry.productName);
      } else {
        setSelectedProduct('__custom__');
        setCustomProduct(entry.productName);
      }
    } else {
      setEntryScope('global');
    }
    
    // Scroll smoothly to form
    const elem = document.getElementById('aov-form-anchor');
    if (elem) {
      elem.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Chronologically sorting actual historical logged periods
  const sortedEntries = useMemo(() => {
    return [...aovEntries].sort((a, b) => {
      const valA = parseInt(a.year) * 100 + parseInt(a.month);
      const valB = parseInt(b.year) * 100 + parseInt(b.month);
      return valB - valA; // newest first
    });
  }, [aovEntries]);

  // List of product names that currently have active historical AOV entries, to allow filtering
  const historicalProducts = useMemo(() => {
    const names = new Set<string>();
    aovEntries.forEach(e => {
      if (e.productName) names.add(e.productName);
    });
    return Array.from(names);
  }, [aovEntries]);

  // Apply filters to historical list
  const filteredEntries = useMemo(() => {
    return sortedEntries.filter(e => {
      if (filterScope === 'global' && e.productName) return false;
      if (filterScope === 'product') {
        if (!e.productName) return false;
        if (filterProduct !== 'all' && e.productName !== filterProduct) return false;
      }
      if (filterYear !== 'all' && e.year !== filterYear) return false;
      if (filterMonth !== 'all' && e.month !== filterMonth) return false;
      if (filterWeek !== 'all' && filterWeek !== 'ALL') {
        if (filterWeek === '1-2' || filterWeek === '1st & 2nd week') {
          if (e.week !== 'Week 1' && e.week !== 'Week 2') return false;
        } else if (filterWeek === '1-3' || filterWeek === '1st, 2nd, 3rd week') {
          if (e.week !== 'Week 1' && e.week !== 'Week 2' && e.week !== 'Week 3') return false;
        } else if (filterWeek === '1-4' || filterWeek === '1st, 2nd, 3rd, 4th week') {
          if (e.week !== 'Week 1' && e.week !== 'Week 2' && e.week !== 'Week 3' && e.week !== 'Week 4') return false;
        } else if (e.week !== filterWeek) {
          return false;
        }
      }
      return true;
    });
  }, [sortedEntries, filterScope, filterProduct, filterYear, filterMonth, filterWeek]);

  // Historical AOV statistics on filtered results
  const statsOverview = useMemo(() => {
    const list = filteredEntries;
    if (list.length === 0) return { avgAov: 0, totalRevenue: 0, maxAov: 0, minAov: 0 };
    const totalRev = list.reduce((sum, e) => sum + e.revenue, 0);
    const totalOrd = list.reduce((sum, e) => sum + e.orders, 0);
    const avgVal = totalOrd > 0 ? totalRev / totalOrd : 0;
    
    const aovs = list.map(e => e.calculatedAov);
    return {
      avgAov: Math.round(avgVal),
      totalRevenue: totalRev,
      maxAov: Math.max(...aovs),
      minAov: Math.min(...aovs)
    };
  }, [filteredEntries]);

  return (
    <div className="space-y-6 text-left animate-fade-in">
      
      {/* Header Info Block */}
      <div className="bg-gradient-to-br from-orange-400 via-rose-500 to-pink-600 border border-rose-300 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        {/* Decorative background element */}
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-yellow-300 rounded-full mix-blend-overlay filter blur-3xl opacity-40 animate-blob"></div>
        <div className="absolute top-12 -left-12 w-48 h-48 bg-white rounded-full mix-blend-overlay filter blur-3xl opacity-30 animate-blob animation-delay-2000"></div>
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div className="space-y-1 z-10">
            <div className="flex items-center gap-2">
              <span className="text-[10px] bg-white/20 text-white font-bold px-2.5 py-1 rounded-lg border border-white/30 uppercase tracking-widest font-mono backdrop-blur-sm">
                Financial KPI Suite
              </span>
              <span className="h-5 w-[1px] bg-white/30" />
              <span className="text-[10px] text-rose-100 font-bold uppercase tracking-wider font-mono flex items-center gap-1">
                <Calculator className="w-3.5 h-3.5 text-white" /> Multi-Scope Tracking
              </span>
            </div>
            <h2 className="text-xl font-black text-white uppercase tracking-tight mt-2 flex items-center gap-2">
              <TrendingUp className="w-6 h-6 text-white shrink-0" />
              <span>AOV Core Controller & Analytics</span>
            </h2>
            <p className="text-xs text-rose-50 max-w-xl">
              Average Order Value (AOV) tracks ticket size processed through your marketing pipeline. Track globally or break down product-by-product to identify high-converting SKUs.
            </p>
          </div>
          <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-xl p-4 shrink-0 flex items-center gap-3 shadow-lg flex-wrap justify-end">
            <div className="space-y-1 mr-2">
              <span className="text-[9px] text-rose-200 font-bold uppercase tracking-wider font-mono">WORKSPACE TOTAL RECORDS</span>
              <div className="text-lg font-black text-white font-mono">🚀 {aovEntries.length} Synced</div>
            </div>
            <button
              onClick={handleAutoCollectFromSales}
              className="bg-indigo-500/80 hover:bg-indigo-600/90 text-white text-[10px] font-bold uppercase tracking-wider px-3 py-2 rounded-lg border border-indigo-400/50 transition shadow-sm flex items-center gap-1.5"
            >
              <CloudDownload className="w-3.5 h-3.5" />
              Auto-Collect Sales
            </button>
            <button
              onClick={() => {
                if (window.confirm('Are you sure you want to clear all AOV tracking data? This action cannot be undone.')) {
                  setAovEntries([]);
                  setNotice({ text: 'All AOV data has been cleared.', type: 'success' });
                  setTimeout(() => setNotice(null), 3000);
                }
              }}
              className="bg-red-500/80 hover:bg-red-600/90 text-white text-[10px] font-bold uppercase tracking-wider px-3 py-2 rounded-lg border border-red-400/50 transition shadow-sm flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear Data
            </button>
          </div>
        </div>
      </div>

      {notice && (
        <div className={`p-4 rounded-xl border flex items-center gap-3 animate-fade-in ${
          notice.type === 'success' 
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
            : 'bg-rose-50 border-rose-200 text-rose-800'
        }`}>
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span className="text-xs font-semibold">{notice.text}</span>
        </div>
      )}

      {/* Grid container */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* VIEW CURRENT AOV (Month & Year Selector View) */}
        <div className="lg:col-span-4 bg-white border border-gray-150 rounded-2xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-500" />
              <span className="text-xs font-bold text-gray-800 uppercase tracking-wider">AOV Period Viewer</span>
            </div>
          </div>

          <div className="space-y-3">
            {/* Scope selection for viewer */}
            <div>
              <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wider font-mono block mb-1">Viewer Scope</label>
              <div className="grid grid-cols-2 gap-1 bg-slate-55 border border-gray-200 p-0.5 rounded-lg">
                <button
                  type="button"
                  onClick={() => setViewScope('global')}
                  className={`py-1 text-[10px] font-bold uppercase tracking-wider rounded-md transition ${
                    viewScope === 'global' ? 'bg-white text-slate-800 shadow-3xs' : 'text-gray-450 hover:text-gray-700'
                  }`}
                >
                  Global Monthly
                </button>
                <button
                  type="button"
                  onClick={() => setViewScope('product')}
                  className={`py-1 text-[10px] font-bold uppercase tracking-wider rounded-md transition ${
                    viewScope === 'product' ? 'bg-white text-slate-800 shadow-3xs' : 'text-gray-450 hover:text-gray-700'
                  }`}
                >
                  Product-Wise
                </button>
              </div>
            </div>

            {viewScope === 'product' && (
              <div className="animate-fade-in">
                <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wider font-mono block mb-1">Select Product SKU</label>
                <select
                  value={viewProduct}
                  onChange={(e) => setViewProduct(e.target.value)}
                  className="w-full bg-slate-55 border边框 border-gray-200 hover:border-gray-300 rounded-lg p-2 text-xs font-semibold focus:outline-none transition"
                >
                  {displayProducts.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wider font-mono block mb-1">Month Address</label>
                <select
                  value={viewMonth}
                  onChange={(e) => setViewMonth(e.target.value)}
                  className="w-full bg-slate-50 hover:bg-slate-100 border border-gray-200 hover:border-gray-300 rounded-lg p-2 text-xs font-semibold focus:outline-none transition"
                >
                  {Object.keys(MONTHS_MAP).map(key => (
                    <option key={key} value={key}>{MONTHS_MAP[key]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wider font-mono block mb-1">Year Address</label>
                <select
                  value={viewYear}
                  onChange={(e) => setViewYear(e.target.value)}
                  className="w-full bg-slate-50 hover:bg-slate-100 border border-gray-200 hover:border-gray-300 rounded-lg p-2 text-xs font-semibold focus:outline-none transition"
                >
                  {YEARS.map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wider font-mono block mb-1">Week Address</label>
                <select
                  value={viewWeek}
                  onChange={(e) => setViewWeek(e.target.value)}
                  className="w-full bg-slate-50 hover:bg-slate-100 border border-gray-200 hover:border-gray-300 rounded-lg p-2 text-xs font-semibold focus:outline-none transition"
                >
                  <option value="">Full Month</option>
                  <option value="Week 1">Week 1</option>
                  <option value="Week 2">Week 2</option>
                  <option value="Week 3">Week 3</option>
                  <option value="Week 4">Week 4</option>
                  <option value="Week 5">Week 5</option>
                  <option value="1st & 2nd week">1st & 2nd week (Days 1–14)</option>
                  <option value="1st, 2nd, 3rd week">1st, 2nd, 3rd week (Days 1–21)</option>
                  <option value="1st, 2nd, 3rd, 4th week">1st, 2nd, 3rd, 4th week (Days 1–28)</option>
                </select>
              </div>
            </div>
          </div>

          {/* ACTIVE PERIOD VALUE DISPLAY */}
          {activeViewEntry ? (
            <div className="bg-red-50/45 rounded-xl border border-red-500/10 p-5 space-y-4 relative overflow-hidden">
              <div className="absolute right-0 bottom-0 text-red-500/5 font-black text-6xl pointer-events-none font-mono -mr-4 -mb-3">
                AOV
              </div>
              
              <div className="space-y-1">
                <span className="text-[9px] font-bold tracking-widest text-red-650 uppercase font-mono block">
                  {viewScope === 'product' ? `${viewProduct}` : 'GLOBAL MONTHLY'} RECORD
                </span>
                <span className="text-3xl font-black text-gray-900 font-mono tracking-tight block">
                  ₹{activeViewEntry.calculatedAov.toLocaleString()}
                </span>
                <span className="text-[10px] text-gray-400 font-medium block">
                  Logged for {viewWeek ? viewWeek + ', ' : ''}{MONTHS_MAP[viewMonth]} {viewYear}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 border-t border-red-500/10 pt-4 text-left">
                <div>
                  <span className="text-[10px] text-gray-400 font-bold block uppercase font-mono mb-0.5">Total Revenue</span>
                  <strong className="text-sm font-bold font-mono text-gray-800">
                    ₹{activeViewEntry.revenue.toLocaleString()}
                  </strong>
                </div>
                <div>
                  <span className="text-[10px] text-gray-400 font-bold block uppercase font-mono mb-0.5">Total Orders</span>
                  <strong className="text-sm font-bold font-mono text-gray-800">
                    {activeViewEntry.orders} Units
                  </strong>
                </div>
              </div>

              {activeViewEntry.targetAov && activeViewEntry.targetAov > 0 ? (
                <div className="bg-white border border-gray-150 p-2.5 rounded-lg flex items-center justify-between">
                  <div>
                    <span className="text-[9px] text-gray-400 font-bold uppercase font-mono block">Target AOV</span>
                    <strong className="text-xs font-bold text-gray-700 font-mono">₹{activeViewEntry.targetAov.toLocaleString()}</strong>
                  </div>
                  <div className="text-right">
                    <span className="text-[9px] text-gray-400 font-bold uppercase font-mono block">Variance</span>
                    <span className={`text-xs font-black font-mono ${
                      activeViewEntry.calculatedAov >= activeViewEntry.targetAov ? 'text-emerald-600' : 'text-rose-600'
                    }`}>
                      {activeViewEntry.calculatedAov >= activeViewEntry.targetAov ? '+' : ''}
                      {Math.round(((activeViewEntry.calculatedAov - activeViewEntry.targetAov) / activeViewEntry.targetAov) * 100)}%
                    </span>
                  </div>
                </div>
              ) : null}

              {activeViewEntry.notes ? (
                <div className="text-[11px] text-gray-500 italic border-l-2 border-slate-350 pl-2 bg-white/70 py-1 rounded-r-lg">
                  "{activeViewEntry.notes}"
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => handleLoadToEdit(activeViewEntry)}
                className="w-full text-center text-xs font-bold text-red-700 hover:text-white hover:bg-red-600 bg-red-50 border border-red-200 hover:border-red-650 transition rounded-lg py-2 cursor-pointer shadow-2xs"
              >
                ✏️ Edit Selected Metric
              </button>
            </div>
          ) : (
            <div className="bg-gray-50 rounded-xl border border-dashed border-gray-200 p-8 text-center space-y-3">
              <AlertCircle className="w-10 h-10 text-gray-300 mx-auto" />
              <div className="space-y-1">
                <span className="text-xs font-bold text-gray-700 block">No Custom Entry Logged</span>
                <span className="text-[11px] text-gray-400 block max-w-[200px] mx-auto leading-relaxed">
                  There is no registered AOV entry under this configuration for {viewWeek ? viewWeek + ', ' : ''}{MONTHS_MAP[viewMonth]} {viewYear}. Use the manual form to create one.
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setInputMonth(viewMonth);
                  setInputYear(viewYear);
                  setInputWeek(viewWeek || '');
                  setEntryScope(viewScope);
                  if (viewScope === 'product') {
                    setSelectedProduct(viewProduct);
                  }
                  // Let state updates process before auto-populating
                  setTimeout(() => handleAutoPopulate(), 50);
                }}
                className="inline-flex items-center gap-1.5 text-[11px] bg-white border border-gray-200 hover:border-gray-300 text-gray-700 font-bold px-3 py-1.5 rounded-lg shadow-3xs cursor-pointer transition"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>Estimate & Auto-Fill</span>
              </button>
            </div>
          )}

          {/* HISTORICAL WORKSPACE HIGH-LEVEL STATS */}
          <div className="border-t border-gray-100 pt-4 space-y-2.5">
            <span className="text-[10px] text-gray-400 font-black uppercase tracking-wider font-mono block">Dynamic Stats (Filter Scope)</span>
            
            <div className="grid grid-cols-2 gap-2 text-left">
              <div className="bg-slate-50 border border-gray-150 p-2.5 rounded-xl">
                <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider font-mono block">AVERAGE AOV</span>
                <strong className="text-sm font-extrabold text-slate-800 font-mono">₹{statsOverview.avgAov.toLocaleString()}</strong>
              </div>
              <div className="bg-slate-50 border border-gray-150 p-2.5 rounded-xl">
                <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider font-mono block">TOTAL REVENUE</span>
                <strong className="text-sm font-extrabold text-slate-800 font-mono">₹{Math.round(statsOverview.totalRevenue).toLocaleString()}</strong>
              </div>
              <div className="bg-slate-50 border border-gray-150 p-2.5 rounded-xl">
                <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider font-mono block">MAX RECORDED</span>
                <strong className="text-xs font-extrabold text-emerald-600 font-mono">₹{statsOverview.maxAov.toLocaleString()}</strong>
              </div>
              <div className="bg-slate-50 border border-gray-150 p-2.5 rounded-xl">
                <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider font-mono block">MIN RECORDED</span>
                <strong className="text-xs font-extrabold text-rose-600 font-mono">₹{statsOverview.minAov.toLocaleString()}</strong>
              </div>
            </div>
          </div>

        </div>

        {/* INPUT DATA MANUALLY FORM */}
        <div id="aov-form-anchor" className="lg:col-span-8 bg-white border border-gray-150 rounded-2xl p-5 md:p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-gray-100 pb-3.5 gap-2">
            <div className="flex items-center gap-2">
              <Calculator className="w-5 h-5 text-red-650" />
              <span className="text-xs font-black text-gray-800 uppercase tracking-widest font-mono">Manual Entry & Auto-Calculator</span>
            </div>
            
            <button
              type="button"
              onClick={handleAutoPopulate}
              className="inline-flex items-center gap-1 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 text-[10px] font-bold px-3 py-1.5 rounded-lg cursor-pointer transition shadow-3xs"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Pull Data from Products Tracker</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            {/* Scope Selection */}
            <div className="col-span-1 sm:col-span-2">
              <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wider font-mono block mb-1.5">Calculation Scope</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setEntryScope('global')}
                  className={`flex-1 py-2 px-3 border rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
                    entryScope === 'global'
                      ? 'bg-red-50 border-red-250 text-red-750 shadow-3xs'
                      : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Layers className="w-4 h-4" />
                  <span>Global Monthly AOV</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEntryScope('product')}
                  className={`flex-1 py-2 px-3 border rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
                    entryScope === 'product'
                      ? 'bg-red-50 border-red-250 text-red-750 shadow-3xs'
                      : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Tag className="w-4 h-4" />
                  <span>Product-Wise AOV</span>
                </button>
              </div>
            </div>

            {/* Product selection if entryScope is product */}
            {entryScope === 'product' && (
              <div className="col-span-1 sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3.5 bg-slate-50 p-4 rounded-xl border border-gray-200 animate-fade-in">
                <div>
                  <label className="text-[10px] text-gray-450 font-bold uppercase tracking-wider font-mono block mb-1.5">Select Target Product</label>
                  <select
                    value={selectedProduct}
                    onChange={(e) => setSelectedProduct(e.target.value)}
                    className="w-full bg-white border border-gray-200 hover:border-gray-300 rounded-xl p-2.5 text-xs font-bold focus:outline-none transition"
                  >
                    {displayProducts.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                    <option value="__custom__">-- Write Custom Product Name --</option>
                  </select>
                </div>
                {selectedProduct === '__custom__' && (
                  <div className="animate-fade-in">
                    <label className="text-[10px] text-gray-450 font-bold uppercase tracking-wider font-mono block mb-1.5">Custom Product Name</label>
                    <input
                      type="text"
                      placeholder="e.g. ULTRA SHIELD SPF 50"
                      value={customProduct}
                      onChange={(e) => setCustomProduct(e.target.value)}
                      className="w-full bg-white border border-gray-200 hover:border-gray-300 rounded-xl p-2.5 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-red-500 transition"
                    />
                  </div>
                )}
              </div>
            )}

            <div className="col-span-1 sm:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wider font-mono block mb-1.5">Action Month</label>
                <select
                  value={inputMonth}
                  onChange={(e) => setInputMonth(e.target.value)}
                  className="w-full bg-slate-50 border border-gray-200 hover:border-gray-300 rounded-xl p-2.5 text-xs font-bold focus:outline-none transition"
                >
                  {Object.keys(MONTHS_MAP).map(key => (
                    <option key={key} value={key}>{MONTHS_MAP[key]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wider font-mono block mb-1.5">Action Year</label>
                <select
                  value={inputYear}
                  onChange={(e) => setInputYear(e.target.value)}
                  className="w-full bg-slate-50 border border-gray-200 hover:border-gray-300 rounded-xl p-2.5 text-xs font-bold focus:outline-none transition"
                >
                  {YEARS.map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wider font-mono block mb-1.5">Action Week</label>
                <select
                  value={inputWeek}
                  onChange={(e) => setInputWeek(e.target.value)}
                  className="w-full bg-slate-50 border border-gray-200 hover:border-gray-300 rounded-xl p-2.5 text-xs font-bold focus:outline-none transition"
                >
                  <option value="">Full Month</option>
                  <option value="Week 1">Week 1</option>
                  <option value="Week 2">Week 2</option>
                  <option value="Week 3">Week 3</option>
                  <option value="Week 4">Week 4</option>
                  <option value="Week 5">Week 5</option>
                </select>
              </div>
            </div>

            {/* NUMERICAL MANUAL FIELDS */}
            <div>
              <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wider font-mono block mb-1.5">Total Revenue (₹ INR) <span className="text-red-500 font-black">*</span></label>
              <div className="relative">
                <span className="absolute left-3 top-3 text-xs font-black text-gray-400 font-mono">₹</span>
                <input
                  type="number"
                  placeholder="e.g. 1500000"
                  value={revenue}
                  onChange={(e) => setRevenue(e.target.value)}
                  className="w-full bg-slate-50 border border-gray-200 hover:border-gray-300 focus:bg-white rounded-xl py-2.5 pl-7 pr-3 text-xs font-mono font-bold focus:outline-none focus:ring-1 focus:ring-red-550 transition"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wider font-mono block mb-1.5">Total Completed Orders (Count) <span className="text-red-500 font-black">*</span></label>
              <div className="relative">
                <span className="absolute left-3 top-3 text-[11px] font-black text-gray-400">📦</span>
                <input
                  type="number"
                  placeholder="e.g. 250"
                  value={orders}
                  onChange={(e) => setOrders(e.target.value)}
                  className="w-full bg-slate-50 border border-gray-200 hover:border-gray-300 focus:bg-white rounded-xl py-2.5 pl-8 pr-3 text-xs font-mono font-bold focus:outline-none focus:ring-1 focus:ring-red-550 transition"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wider font-mono block mb-1.5">Target AOV (₹ INR) <span className="text-gray-300 font-bold">(Optional)</span></label>
              <div className="relative">
                <span className="absolute left-3 top-3 text-xs font-black text-gray-400 font-mono">₹</span>
                <input
                  type="number"
                  placeholder="e.g. 6000"
                  value={targetAov}
                  onChange={(e) => setTargetAov(e.target.value)}
                  className="w-full bg-slate-50 border border-gray-200 hover:border-gray-300 focus:bg-white rounded-xl py-2.5 pl-7 pr-3 text-xs font-mono font-bold focus:outline-none focus:ring-1 focus:ring-red-550 transition"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wider font-mono block mb-1.5">Custom Notes / Context</label>
              <input
                type="text"
                placeholder="e.g. High volume Autumn clothes launch spike"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full bg-slate-50 border border-gray-200 hover:border-gray-300 focus:bg-white rounded-xl py-2.5 px-3 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-red-550 transition"
              />
            </div>
          </div>

          {/* DYNAMIC CALCULATION PREVIEW PANEL */}
          <div className="bg-slate-50 border border-gray-150 p-4 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="space-y-1 text-center sm:text-left">
              <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest font-mono block">Dynamic Input Calculation</span>
              <strong className="text-xs text-gray-800">
                Formula: ₹{liveRevenue.toLocaleString()} / {liveOrders} Orders =
              </strong>
            </div>
            
            <div className="flex items-baseline gap-2 bg-white px-5 py-2.5 rounded-lg border border-gray-200/60 shadow-3xs shrink-0 font-mono">
              <span className="text-[11px] font-bold text-gray-400">Calculated AOV:</span>
              <span className="text-xl font-black text-red-650">
                ₹{Math.round(liveCalculatedAov).toLocaleString()}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSaveEntry}
            className="w-full text-center bg-red-650 hover:bg-red-700 text-white text-xs font-bold py-3 px-4 rounded-xl transition flex items-center justify-center gap-2 shadow-xs hover:shadow-md cursor-pointer active:scale-98"
          >
            <Save className="w-4 h-4 text-white" />
            <span>Save and Lock AOV Checkpoint for {MONTHS_MAP[inputMonth]} {inputYear}</span>
          </button>
        </div>

      </div>

      {/* SAVED HISTORICAL ENTRIES AND TRENDS CHART */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-2">
        <div className="lg:col-span-12 bg-white border border-gray-150 rounded-2xl p-5 md:p-6 shadow-xs space-y-4">
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-gray-100 pb-3.5 gap-3">
            <div className="flex items-center gap-2">
              <Coins className="w-5 h-5 text-gray-500" />
              <span className="text-xs font-black text-gray-800 uppercase tracking-widest font-mono">
                Historical Checkpoints ledger & trends
              </span>
            </div>
            
            {/* Ledger filters with beautiful styling */}
            <div className="flex flex-wrap items-center gap-2">
              {onToggleOnlyShowPlacedProducts && (
                <label className="inline-flex items-center gap-1.5 cursor-pointer select-none mr-3 border-r border-gray-150 pr-3">
                  <input 
                    type="checkbox"
                    checked={onlyShowPlacedProducts}
                    onChange={(e) => onToggleOnlyShowPlacedProducts(e.target.checked)}
                    className="w-3.5 h-3.5 rounded text-red-650 bg-white border-gray-300 focus:ring-red-500 accent-red-650"
                  />
                  <span className="text-[10px] uppercase font-black font-mono text-red-650">
                    Placed Only
                  </span>
                </label>
              )}
              <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider font-mono">Filter Ledger:</span>
              <select
                value={filterScope}
                onChange={(e) => {
                  setFilterScope(e.target.value as any);
                  setFilterProduct('all');
                }}
                className="bg-slate-50 border border-gray-200 rounded-lg p-1.5 text-[11px] font-bold text-slate-700 focus:outline-none transition"
              >
                <option value="all">All Checkpoints</option>
                <option value="global">Global Only</option>
                <option value="product">Product-Wise Only</option>
              </select>

              {filterScope === 'product' && historicalProducts.length > 0 && (
                <select
                  value={filterProduct}
                  onChange={(e) => setFilterProduct(e.target.value)}
                  className="bg-slate-50 border border-gray-205 rounded-lg p-1.5 text-[11px] font-bold text-slate-700 focus:outline-none transition animate-fade-in"
                >
                  <option value="all">All Products</option>
                  {historicalProducts.map(prod => (
                    <option key={prod} value={prod}>{prod}</option>
                  ))}
                </select>
              )}

              <select
                value={filterYear}
                onChange={(e) => setFilterYear(e.target.value)}
                className="bg-slate-50 border border-gray-200 rounded-lg p-1.5 text-[11px] font-bold text-slate-700 focus:outline-none transition"
              >
                <option value="all">All Years</option>
                {YEARS.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>

              <select
                value={filterMonth}
                onChange={(e) => setFilterMonth(e.target.value)}
                className="bg-slate-50 border border-gray-200 rounded-lg p-1.5 text-[11px] font-bold text-slate-700 focus:outline-none transition"
              >
                <option value="all">All Months</option>
                {Object.keys(MONTHS_MAP).map(m => (
                  <option key={m} value={m}>{MONTHS_MAP[m]}</option>
                ))}
              </select>

              <select
                value={filterWeek}
                onChange={(e) => setFilterWeek(e.target.value)}
                className="bg-slate-50 border border-gray-200 rounded-lg p-1.5 text-[11px] font-bold text-slate-700 focus:outline-none transition"
              >
                <option value="all">All Weeks</option>
                <option value="Week 1">Week 1</option>
                <option value="Week 2">Week 2</option>
                <option value="Week 3">Week 3</option>
                <option value="Week 4">Week 4</option>
                <option value="Week 5">Week 5</option>
                <option value="1st & 2nd week">1st & 2nd week (Days 1–14)</option>
                <option value="1st, 2nd, 3rd week">1st, 2nd, 3rd week (Days 1–21)</option>
                <option value="1st, 2nd, 3rd, 4th week">1st, 2nd, 3rd, 4th week (Days 1–28)</option>
              </select>
            </div>
          </div>

          {/* CUSTOM SVG TREND LINE CHART */}
          {filteredEntries.length >= 2 ? (
            <div className="bg-slate-50 border border-gray-150 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] text-gray-400 font-black uppercase tracking-wider font-mono block">
                  MoM Growth Trendline ({filterScope === 'global' ? 'Global AOV' : filterScope === 'product' ? (filterProduct === 'all' ? 'Product AOV (Combined)' : filterProduct) : 'All Combined AOVs'})
                </span>
                <span className="text-[10px] font-mono text-gray-400">
                  {filteredEntries.length} data points
                </span>
              </div>
              
              <div className="h-44 w-full relative">
                {/* SVG Line visualization */}
                <svg className="w-full h-full overflow-visible" preserveAspectRatio="none">
                  {(() => {
                    // Sort items chronologically (oldest to newest) to draw line correctly
                    const chrono = [...filteredEntries].reverse();
                    const min = Math.min(...chrono.map(e => e.calculatedAov)) * 0.9;
                    const max = Math.max(...chrono.map(e => e.calculatedAov)) * 1.1;
                    const range = max - min || 1;

                    const points = chrono.map((e, idx) => {
                      const percentX = (idx / (chrono.length - 1)) * 100;
                      const percentY = 100 - ((e.calculatedAov - min) / range) * 85 - 10;
                      return { x: percentX, y: percentY, item: e };
                    });

                    const pathD = points.map((p, idx) => (idx === 0 ? 'M' : 'L') + ` ${p.x}% ${p.y}%`).join(' ');

                    return (
                      <>
                        {/* Horizontal grid lines & guides */}
                        <line x1="0%" y1="15%" x2="100%" y2="15%" stroke="#eceff1" strokeDasharray="4" />
                        <line x1="0%" y1="50%" x2="100%" y2="50%" stroke="#eceff1" strokeDasharray="4" />
                        <line x1="0%" y1="85%" x2="100%" y2="85%" stroke="#eceff1" strokeDasharray="4" />

                        {/* Solid Area background overlay */}
                        <path
                          d={`${pathD} L 100% 100% L 0% 100% Z`}
                          fill="url(#gradient-red-aov)"
                          opacity="0.06"
                        />

                        {/* Trend path line */}
                        <path
                          d={pathD}
                          fill="none"
                          stroke="#dc2626"
                          strokeWidth="3.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />

                        {/* Plot points & labels */}
                        {points.map((p, idx) => (
                          <g key={p.item.id}>
                            {/* Hoverable indicator circle */}
                            <circle
                              cx={`${p.x}%`}
                              cy={`${p.y}%`}
                              r="5"
                              fill="#dc2626"
                              stroke="#ffffff"
                              strokeWidth="2.5"
                              className="cursor-pointer transition-transform hover:scale-150"
                            />
                            {/* Value text indicator */}
                            <text
                              x={`${p.x}%`}
                              y={`${p.y - 8}%`}
                              textAnchor="middle"
                              className="text-[10px] font-black fill-slate-800 font-mono"
                            >
                              ₹{Math.round(p.item.calculatedAov)}
                            </text>
                            
                            {/* Month labels at bottom */}
                            <text
                              x={`${p.x}%`}
                              y="96%"
                              textAnchor="middle"
                              className="text-[9px] font-bold fill-gray-400 font-mono"
                            >
                              {MONTHS_MAP[p.item.month].substring(0, 3)} {p.item.year.substring(2)}
                            </text>
                          </g>
                        ))}

                        {/* Defs definition for gradient */}
                        <defs>
                          <linearGradient id="gradient-red-aov" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stopColor="#dc2626" />
                            <stop offset="100%" stopColor="#ffffff" />
                          </linearGradient>
                        </defs>
                      </>
                    );
                  })()}
                </svg>
              </div>
            </div>
          ) : (
            <div className="bg-slate-50 rounded-xl p-6 text-center border border-gray-150 text-gray-400 text-xs py-10">
              💡 Change filter criteria or create additional chronological AOV checkpoints (at least 2 entries required) to render dynamic trendline graphs.
            </div>
          )}

          {/* TABLE MATRIX OF ENTRIES */}
          <div className="overflow-x-auto rounded-xl border border-gray-150">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-gray-150 text-[10px] text-gray-500 uppercase font-black font-mono">
                  <th className="py-3 px-4">Period</th>
                  <th className="py-3 px-4">Scope / SKU</th>
                  <th className="py-3 px-4">Total Revenue</th>
                  <th className="py-3 px-4">Total Orders</th>
                  <th className="py-3 px-4 text-red-650">Calculated AOV</th>
                  <th className="py-3 px-4">Target AOV</th>
                  <th className="py-3 px-4">Notes</th>
                  <th className="py-3 px-4 text-right">Settings</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-150 text-xs font-semibold">
                {filteredEntries.length > 0 ? (
                  filteredEntries.map((e) => {
                    const monthName = MONTHS_MAP[e.month] || e.month;
                    const isTargetMet = e.targetAov ? e.calculatedAov >= e.targetAov : true;
                    
                    return (
                      <tr key={e.id} className="hover:bg-gray-50 transition">
                        <td className="py-3.5 px-4 font-bold text-gray-700">
                          📅 {monthName} {e.year}
                        </td>
                        <td className="py-3.5 px-4">
                          {e.productName ? (
                            <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-800 border border-amber-100 rounded-md px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider max-w-[170px] truncate" title={e.productName}>
                              📦 {e.productName}
                            </span>
                          ) : (
                            <span className="inline-block bg-slate-100 text-slate-700 rounded-md px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider">
                              🌐 Monthly Global
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 font-mono">
                          ₹{e.revenue.toLocaleString()}
                        </td>
                        <td className="py-3.5 px-4 font-mono">
                          {e.orders} Orders
                        </td>
                        <td className="py-3.5 px-4 text-red-700 font-extrabold font-mono text-sm">
                          ₹{e.calculatedAov.toLocaleString()}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-gray-500">
                          {e.targetAov ? `₹${e.targetAov.toLocaleString()}` : '—'}
                        </td>
                        <td className="py-3.5 px-4 max-w-[180px] truncate text-gray-400 font-normal" title={e.notes}>
                          {e.notes || '—'}
                        </td>
                        <td className="py-3.5 px-4 text-right space-x-1 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => {
                              setViewMonth(e.month);
                              setViewYear(e.year);
                              if (e.productName) {
                                setViewScope('product');
                                setViewProduct(e.productName);
                              } else {
                                setViewScope('global');
                              }
                              handleLoadToEdit(e);
                            }}
                            className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-2.5 py-1.5 rounded-lg text-[10px] uppercase font-bold transition shadow-3xs cursor-pointer inline-flex items-center gap-1"
                          >
                            ✏️ Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => setDetailEntry(e)}
                            className="bg-amber-50 hover:bg-amber-100 text-amber-700 px-2.5 py-1.5 rounded-lg text-[10px] uppercase font-bold transition shadow-3xs cursor-pointer inline-flex items-center gap-1"
                          >
                            <FileText className="w-3" />
                            <span>Details</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteEntry(e.id, `${e.productName ? e.productName : 'Global'} (${monthName} ${e.year})`)}
                            className="bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white px-2.5 py-1.5 rounded-lg text-[10px] uppercase font-bold transition shadow-3xs cursor-pointer inline-flex items-center gap-1"
                          >
                            <Trash2 className="w-3" />
                            <span>Delete</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-gray-400 font-normal">
                      No matching AOV checkpoints listed for this filter. Create or adjust search criteria to show values!
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

        </div>
      </div>

      {detailEntry && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl relative">
            <div className="sticky top-0 bg-white border-b border-gray-100 p-5 flex items-center justify-between z-10">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl ${detailEntry.productName ? 'bg-amber-50' : 'bg-blue-50'}`}>
                  {detailEntry.productName ? <Tag className="w-6 h-6 text-amber-600" /> : <Layers className="w-6 h-6 text-blue-600" />}
                </div>
                <div>
                  <h3 className="text-lg font-black text-gray-800 tracking-tight">AOV Checkpoint Details</h3>
                  <p className="text-xs font-bold text-gray-400 font-mono">
                    {detailEntry.week ? detailEntry.week + ', ' : ''}{MONTHS_MAP[detailEntry.month]} {detailEntry.year}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setDetailEntry(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition"
              >
                ✕
              </button>
            </div>
            
            <div className="p-6 space-y-6 text-left">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-slate-50 border border-gray-150 rounded-xl p-4">
                  <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider font-mono block mb-1">Total Revenue</span>
                  <strong className="text-lg font-black font-mono text-gray-800">₹{detailEntry.revenue.toLocaleString()}</strong>
                </div>
                <div className="bg-slate-50 border border-gray-150 rounded-xl p-4">
                  <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider font-mono block mb-1">Total Orders</span>
                  <strong className="text-lg font-black font-mono text-gray-800">{detailEntry.orders.toLocaleString()}</strong>
                </div>
                <div className="bg-red-50 border border-red-100 rounded-xl p-4 md:col-span-2">
                  <span className="text-[10px] text-red-400 font-bold uppercase tracking-wider font-mono block mb-1">Calculated AOV</span>
                  <strong className="text-2xl font-black font-mono text-red-650">₹{detailEntry.calculatedAov.toLocaleString()}</strong>
                </div>
              </div>

              <div>
                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider font-mono block mb-2">Scope / Breakdown</span>
                <div className="bg-white border text-sm font-bold border-gray-150 rounded-xl p-4 text-gray-700">
                  {detailEntry.productName ? (
                    <div className="flex items-center gap-2">
                      <span className="bg-amber-100 text-amber-800 px-2 py-1 rounded-md text-xs">📦 PRODUCT MAPPED</span>
                      <span>{detailEntry.productName}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="bg-slate-200 text-slate-700 px-2 py-1 rounded-md text-xs">🌐 GLOBAL METRIC</span>
                      <span>Aggregated Monthly Tracker Data</span>
                    </div>
                  )}
                </div>
              </div>

              {detailEntry.targetAov && detailEntry.targetAov > 0 && (
                <div>
                  <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider font-mono block mb-2">Target Performance Variance</span>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white border border-gray-150 rounded-xl p-4 flex items-center justify-between">
                      <span className="text-[10px] text-gray-400 font-bold uppercase font-mono">Target set</span>
                      <strong className="text-sm font-bold text-gray-700 font-mono">₹{detailEntry.targetAov.toLocaleString()}</strong>
                    </div>
                    <div className={`border rounded-xl p-4 flex items-center justify-between ${detailEntry.calculatedAov >= detailEntry.targetAov ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'}`}>
                       <span className="text-[10px] uppercase font-bold font-mono">Delta</span>
                       <strong className="text-sm font-black font-mono">{Math.round(((detailEntry.calculatedAov - detailEntry.targetAov) / detailEntry.targetAov) * 100)}%</strong>
                    </div>
                  </div>
                </div>
              )}

              {detailEntry.productName && monthlyTargets.some(t => t.productName === detailEntry.productName && t.month === detailEntry.month && t.year === detailEntry.year) && (
                <div>
                  <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider font-mono block mb-2">Monthly Strategy Alignments</span>
                  <div className="bg-white border border-gray-150 rounded-xl overflow-hidden text-sm">
                    {monthlyTargets
                      .filter(t => t.productName === detailEntry.productName && t.month === detailEntry.month && t.year === detailEntry.year)
                      .map((t, idx) => (
                        <div key={idx} className="p-4 border-b last:border-b-0 border-gray-100 grid grid-cols-2 gap-4 bg-slate-50">
                          <div>
                            <span className="text-[10px] block text-gray-400">Target Budget</span>
                            <strong>₹{(t.target || 0).toLocaleString()}</strong>
                          </div>
                          <div>
                            <span className="text-[10px] block text-gray-400">Target Sales Obj.</span>
                            <strong>₹{(t.salesAmount || 0).toLocaleString()}</strong>
                          </div>
                        </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider font-mono block mb-2">Contextual Notes</span>
                <div className="bg-slate-50 border border-gray-150 rounded-xl p-4 text-sm text-gray-600 font-medium">
                  {detailEntry.notes ? detailEntry.notes : <span className="italic text-gray-400">No additional contextual notes provided for this checkpoint.</span>}
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
}
