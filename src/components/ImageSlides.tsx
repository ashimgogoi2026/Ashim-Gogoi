import React, { useState, useMemo, useEffect, useRef } from 'react';
import { MonitorPlay, Image as ImageIcon, Upload, ChevronLeft, ChevronRight, X, TrendingUp, PieChart as PieChartIcon, DollarSign, Video, Award, Users, Target, Maximize, Minimize, Download, Palette, RefreshCw, IndianRupee, ExternalLink } from 'lucide-react';
import { ProductConfig, Campaign, Task, Influencer, AovEntry, MonthlyBudget } from '../types';
import { MonthlyProductTarget } from './MonthlyTargets';
import { isTaskInPeriod } from '../lib/taskUtils';
import html2canvas from 'html2canvas-pro';
import { toJpeg } from 'html-to-image';
import pptxgen from "pptxgenjs";

interface ImageSlidesProps {
  selectedMonth: string;
  setSelectedMonth: (m: string) => void;
  selectedYear: string;
  setSelectedYear: (y: string) => void;
  selectedWeek: string;
  setSelectedWeek: (w: string) => void;
  dashboardProducts?: ProductConfig[];
  campaigns?: Campaign[];
  tasks?: Task[];
  influencers?: Influencer[];
  monthlyTargets?: MonthlyProductTarget[];
  monthlyBudgets?: MonthlyBudget[];
  wizardProducts?: string[];
  activeMonth?: string;
  activeYear?: number | string;
  onlyShowPlacedProducts?: boolean;
  aovEntries?: AovEntry[];
}

export default function ImageSlides({ selectedMonth, setSelectedMonth, selectedYear, setSelectedYear, selectedWeek, setSelectedWeek, dashboardProducts = [], 
  campaigns = [], 
  tasks = [], 
  influencers = [], 
  monthlyTargets = [], 
  monthlyBudgets = [],
  wizardProducts = [],
  activeMonth, 
  activeYear,
  onlyShowPlacedProducts = true,
  aovEntries = []
}: ImageSlidesProps) {
  const [images, setImages] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isSlideShow, setIsSlideShow] = useState(false);
  const [isControlsVisible, setIsControlsVisible] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);
  
  const [activeTheme, setActiveTheme] = useState('theme-red');
  const displayWeek = selectedWeek;
  const setDisplayWeek = setSelectedWeek;
  const [autoSync, setAutoSync] = useState(true);
  const [planningNote, setPlanningNote] = useState<string>('');

  useEffect(() => {
    const fetchPlanningNote = () => {
      const note = localStorage.getItem('INFLUENCER_MANAGER_NEXT_MONTH_PLANNING_NOTE');
      if (note) {
        setPlanningNote(note);
      }
    };
    fetchPlanningNote();
    window.addEventListener('storage', fetchPlanningNote);
    return () => window.removeEventListener('storage', fetchPlanningNote);
  }, []);

  const monthReverseMap: Record<string, string> = {
    '01': 'January', '02': 'February', '03': 'March', '04': 'April',
    '05': 'May', '06': 'June', '07': 'July', '08': 'August',
    '09': 'September', '10': 'October', '11': 'November', '12': 'December'
  };

  const displayMonth = selectedMonth === 'ALL' ? 'ALL' : monthReverseMap[selectedMonth] || selectedMonth;
  const setDisplayMonth = (m: string) => {
    const reverse = Object.keys(monthReverseMap).find(k => monthReverseMap[k] === m) || m;
    setSelectedMonth(reverse);
  };
  const [displayYear, setDisplayYear] = useState(activeYear?.toString() || new Date().getFullYear().toString());

  useEffect(() => {
    if (autoSync && activeMonth) {
      if (activeMonth === 'ALL') {
        setDisplayMonth("");
      } else {
        const mappedMonth = monthReverseMap[activeMonth];
        if (mappedMonth) setDisplayMonth(mappedMonth);
      }
    }
  }, [activeMonth, autoSync]);

  useEffect(() => {
    if (autoSync && activeYear) {
      if (activeYear.toString() === 'ALL') {
        setDisplayYear("");
      } else {
        setDisplayYear(activeYear.toString());
      }
    }
  }, [activeYear, autoSync]);

  const containerRef = useRef<HTMLDivElement>(null);
  const captureRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        setIsSlideShow(false);
      }
    };
    
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const startSlideShow = () => {
    setIsSlideShow(true);
    if (containerRef.current) {
      if (containerRef.current.requestFullscreen) {
        containerRef.current.requestFullscreen().catch(err => {
          console.error(`Error attempting to enable fullscreen: ${err.message}`);
        });
      }
    }
  };

  const endSlideShow = () => {
    setIsSlideShow(false);
    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(err => console.error(err));
    }
  };

  const downloadAllSlides = async () => {
    setIsDownloading(true);
    const originalIndex = currentIndex;

    try {

      const styleEl = document.createElement('style');
      styleEl.innerHTML = `
        .is-downloading, .is-downloading * {
          transition: none !important;
          animation: none !important;
          transform: none !important;
        }
      `;
      document.head.appendChild(styleEl);

      for (let i = 0; i < totalSlides; i++) {
        setCurrentIndex(i);
        // Wait for the slide to render and images to load
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        if (captureRef.current) {
                    const canvas = await html2canvas(captureRef.current, { 
            scale: 1.5, 
            useCORS: true, 
            backgroundColor: '#000000', 
            logging: false,
            onclone: (doc, element) => {
              const classesToRemove = ['', '', 'transition-all', 'transition', 'duration-300', 'duration-500', 'duration-1000', 'transform', 'hover:scale-105', '', '', '', '', '', '', '', '', ''];
              const walk = (el: any) => {
                if (el.classList) {
                  classesToRemove.forEach(cls => el.classList.remove(cls));
                  el.style.transform = 'none';
                  el.style.transition = 'none';
                  el.style.animation = 'none';
                }
                if (el.children) {
                  Array.from(el.children).forEach(walk);
                }
              };
              walk(element);
            }
          });
          const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
          const link = document.createElement('a');
          link.href = dataUrl;
          link.download = `slide-${i + 1}.jpg`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }
      }
    } catch (err) {
      console.error('Failed to download slides', err);
      alert('Failed to download JPGs. Please check console for errors. ' + String(err));
    } finally {

      const styleEls = document.head.querySelectorAll('style');
      styleEls.forEach(el => {
        if (el.innerHTML.includes('.is-downloading * {')) {
           document.head.removeChild(el);
        }
      });

      setCurrentIndex(originalIndex);
      setIsDownloading(false);
    }
  };


  const downloadAsAlternativePptx = async () => {
    setIsDownloading(true);
    const originalIndex = currentIndex;

    try {
      const styleEl = document.createElement('style');
      styleEl.innerHTML = `
        .is-downloading, .is-downloading * {
          transition: none !important;
          animation: none !important;
          transform: none !important;
        }
      `;
      document.head.appendChild(styleEl);

      const pres = new pptxgen();
      
      for (let i = 0; i < totalSlides; i++) {
        setCurrentIndex(i);
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        if (captureRef.current) {
          const dataUrl = await toJpeg(captureRef.current, { 
            quality: 0.9, 
            backgroundColor: '#000000',
            pixelRatio: 1.5,
            filter: (node) => {
               // Ignore scripts or non-visual elements if needed
               return true;
            }
          });
          
          const slide = pres.addSlide();
          slide.addImage({ data: dataUrl, x: 0, y: 0, w: "100%", h: "100%" });
        }
      }
      
      await pres.writeFile({ fileName: `LIVE_SLIDES_ALT_${displayMonth}_${displayYear}.pptx` });
    } catch (err) {
      console.error('Failed to download pptx (Alternative)', err);
      alert('Failed to download PPTX (Alternative). Please check console for errors. ' + String(err));
    } finally {
      // Clean up style
      const styleEls = document.head.querySelectorAll('style');
      styleEls.forEach(el => {
        if (el.innerHTML.includes('.is-downloading * {')) {
           document.head.removeChild(el);
        }
      });
      setCurrentIndex(originalIndex);
      setIsDownloading(false);
    }
  };

  const downloadAsPptx = async () => {
    setIsDownloading(true);
    const originalIndex = currentIndex;

    try {

      const styleEl = document.createElement('style');
      styleEl.innerHTML = `
        .is-downloading, .is-downloading * {
          transition: none !important;
          animation: none !important;
          transform: none !important;
        }
      `;
      document.head.appendChild(styleEl);

      const pres = new pptxgen();
      
      for (let i = 0; i < totalSlides; i++) {
        setCurrentIndex(i);
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        if (captureRef.current) {
                    const canvas = await html2canvas(captureRef.current, { 
            scale: 1.5, 
            useCORS: true, 
            backgroundColor: '#000000', 
            logging: false,
            onclone: (doc, element) => {
              const classesToRemove = ['', '', 'transition-all', 'transition', 'duration-300', 'duration-500', 'duration-1000', 'transform', 'hover:scale-105', '', '', '', '', '', '', '', '', ''];
              const walk = (el: any) => {
                if (el.classList) {
                  classesToRemove.forEach(cls => el.classList.remove(cls));
                  el.style.transform = 'none';
                  el.style.transition = 'none';
                  el.style.animation = 'none';
                }
                if (el.children) {
                  Array.from(el.children).forEach(walk);
                }
              };
              walk(element);
            }
          });
          const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
          const slide = pres.addSlide();
          // Adding the captured image. Assume modern widescreen aspect ratio roughly fills the slide.
          slide.addImage({ data: dataUrl, x: 0, y: 0, w: "100%", h: "100%" });
        }
      }
      
      await pres.writeFile({ fileName: `LIVE_SLIDES_${displayMonth}_${displayYear}.pptx` });
    } catch (err) {
      console.error('Failed to download pptx', err);
      alert('Failed to download PPTX. Please check console for errors. ' + String(err));
    } finally {

      const styleEls = document.head.querySelectorAll('style');
      styleEls.forEach(el => {
        if (el.innerHTML.includes('.is-downloading * {')) {
           document.head.removeChild(el);
        }
      });

      setCurrentIndex(originalIndex);
      setIsDownloading(false);
    }
  };

  useEffect(() => {
    let hideTimer: NodeJS.Timeout;
    const handleMouseMove = () => {
      if (isSlideShow) {
        setIsControlsVisible(true);
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => setIsControlsVisible(false), 3000);
      }
    };
    
    if (isSlideShow) {
      window.addEventListener('mousemove', handleMouseMove);
      hideTimer = setTimeout(() => setIsControlsVisible(false), 3000);
    } else {
      setIsControlsVisible(true);
    }
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      clearTimeout(hideTimer);
    };
  }, [isSlideShow]);

  const totalSlides = 10 + images.length;

  const nextSlide = () => {
    if (currentIndex < totalSlides - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const prevSlide = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isSlideShow) {
        if (e.key === 'ArrowRight' || e.key === ' ') {
          nextSlide();
        } else if (e.key === 'ArrowLeft') {
          prevSlide();
        } else if (e.key === 'Escape') {
          endSlideShow();
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSlideShow, currentIndex, totalSlides]);

  const monthMap: Record<string, string> = {
    'January': '01',
    'February': '02',
    'March': '03',
    'April': '04',
    'May': '05',
    'June': '06',
    'July': '07',
    'August': '08',
    'September': '09',
    'October': '10',
    'November': '11',
    'December': '12'
  };

  const computedProducts = useMemo(() => {
    const activeM = displayMonth ? monthMap[displayMonth] : 'ALL';
    const activeY = displayYear ? String(displayYear) : 'ALL';

    const placedTitlesSet = new Set<string>();
    tasks.forEach(t => {
      if (t.title && t.title.trim()) {
        placedTitlesSet.add(t.title.trim().toLowerCase());
      }
    });

    const activeProductNames = new Set<string>();
    const addActiveProduct = (name?: string) => {
      if (!name) return;
      const clean = name.trim();
      if (!clean) return;
      if (clean === 'CENTRAL_BUDGET') return;
      if (onlyShowPlacedProducts) {
        if (!placedTitlesSet.has(clean.toLowerCase())) return;
      }
      activeProductNames.add(clean);
    };

    dashboardProducts.forEach(p => {
      if (p.name) addActiveProduct(p.name);
    });
    wizardProducts.forEach(p => {
      if (p) addActiveProduct(p);
    });
    const filteredTasksForBreakdown = tasks.filter(t => isTaskInPeriod(t, activeM, activeY, displayWeek || 'ALL'));
    filteredTasksForBreakdown.forEach(t => {
      if (t.title) addActiveProduct(t.title);
    });
    if (monthlyTargets) {
      monthlyTargets.forEach(t => {
        if (t.productName) {
          const matchesYear = activeY === 'ALL' || (t.year && activeY && parseInt(t.year, 10) === parseInt(activeY, 10));
          const matchesMonth = activeM === 'ALL' || (t.month && activeM && parseInt(t.month, 10) === parseInt(activeM, 10));
          if (matchesYear && matchesMonth) {
            addActiveProduct(t.productName);
          }
        }
      });
    }

    const uniqueNames = Array.from(activeProductNames).sort((a, b) => a.localeCompare(b));

    return uniqueNames.map(productName => {
      const dp = dashboardProducts.find(p => p.name.trim().toLowerCase() === productName.toLowerCase()) || {
        name: productName,
        target: 5,
        salesAmount: 0,
        revenueTarget: 0,
      };

      let finalRevenueTarget = 0;
      let finalSalesAmount = 0;
      let finalVideoTarget = 5;
      let finalQuantitySold = 0;
      
      let finalNextMonthRevenueTarget = 0;
      let finalNextMonthVideoTarget = 0;

      let baseMonth = activeM;
      let baseYear = activeY;
      if (baseMonth === 'ALL' || baseYear === 'ALL') {
         const now = new Date();
         baseMonth = String(now.getMonth() + 1).padStart(2, '0');
         baseYear = String(now.getFullYear());
      }

      let nextMonthIndex = parseInt(baseMonth, 10) + 1;
      let nextMonthYear = parseInt(baseYear, 10);
      if (nextMonthIndex > 12) {
        nextMonthIndex = 1;
        nextMonthYear += 1;
      }
      const nmStr = String(nextMonthIndex).padStart(2, '0');
      const nyStr = String(nextMonthYear);
      const nmTargetItem = monthlyTargets.find(mt => mt.productName.trim().toLowerCase() === productName.trim().toLowerCase() && mt.month === nmStr && mt.year === String(nyStr));
      finalNextMonthRevenueTarget = nmTargetItem ? (nmTargetItem.target || 0) : 0;
      finalNextMonthVideoTarget = nmTargetItem ? (nmTargetItem.videoTarget || 0) : 0;

      let resolvedSalesAmountWeek1 = 0;
      let resolvedSalesAmountWeek2 = 0;
      let resolvedSalesAmountWeek3 = 0;
      let resolvedSalesAmountWeek4 = 0;
      let resolvedSalesAmountWeek5 = 0;

      if (monthlyTargets && monthlyTargets.length > 0) {
        if (activeM === 'ALL') {
          const matches = monthlyTargets.filter(t => 
            (t.productName || "").trim().toLowerCase() === productName.toLowerCase() &&
            (activeY === 'ALL' || (t.year && activeY && parseInt(t.year, 10) === parseInt(activeY, 10)))
          );
          if (matches.length > 0) {
            finalRevenueTarget = matches.reduce((sum, m) => sum + (m.target || 0), 0);
            finalVideoTarget = matches.reduce((sum, m) => sum + (m.videoTarget || 0), 0);
            resolvedSalesAmountWeek1 = matches.reduce((sum, m) => sum + (m.salesAmountWeek1 || 0), 0);
            resolvedSalesAmountWeek2 = matches.reduce((sum, m) => sum + (m.salesAmountWeek2 || 0), 0);
            resolvedSalesAmountWeek3 = matches.reduce((sum, m) => sum + (m.salesAmountWeek3 || 0), 0);
            resolvedSalesAmountWeek4 = matches.reduce((sum, m) => sum + (m.salesAmountWeek4 || 0), 0);
            resolvedSalesAmountWeek5 = matches.reduce((sum, m) => sum + (m.salesAmountWeek5 || 0), 0);
            const calculatedTotalWeekly = resolvedSalesAmountWeek1 + resolvedSalesAmountWeek2 + resolvedSalesAmountWeek3 + resolvedSalesAmountWeek4 + resolvedSalesAmountWeek5;
            const fallbackSalesAmount = matches.reduce((sum, m) => sum + (m.salesAmount || 0), 0);
            finalSalesAmount = calculatedTotalWeekly > 0 ? calculatedTotalWeekly : fallbackSalesAmount;
            finalQuantitySold = matches.reduce((sum, m) => sum + (m.quantitySold || 0), 0);
          } else {
            finalRevenueTarget = 0;
            finalVideoTarget = 5;
            finalSalesAmount = 0;
          }
        } else {
          const match = monthlyTargets.find(t => 
            (t.productName || "").trim().toLowerCase() === productName.toLowerCase() &&
            (t.month && activeM && parseInt(t.month, 10) === parseInt(activeM, 10)) &&
            (t.year && activeY && parseInt(t.year, 10) === parseInt(activeY, 10))
          );
          if (match) {
            finalRevenueTarget = match.target !== undefined ? match.target : 0;
            finalVideoTarget = match.videoTarget !== undefined ? match.videoTarget : 5;
            resolvedSalesAmountWeek1 = match.salesAmountWeek1 || 0;
            resolvedSalesAmountWeek2 = match.salesAmountWeek2 || 0;
            resolvedSalesAmountWeek3 = match.salesAmountWeek3 || 0;
            resolvedSalesAmountWeek4 = match.salesAmountWeek4 || 0;
            resolvedSalesAmountWeek5 = match.salesAmountWeek5 || 0;
            const calculatedTotalWeekly = resolvedSalesAmountWeek1 + resolvedSalesAmountWeek2 + resolvedSalesAmountWeek3 + resolvedSalesAmountWeek4 + resolvedSalesAmountWeek5;
            finalSalesAmount = calculatedTotalWeekly > 0 ? calculatedTotalWeekly : (match.salesAmount || 0);
            finalQuantitySold = match.quantitySold || 0;
          }
        }
      }

      if (displayWeek && displayWeek !== 'ALL' && displayWeek !== "") {
        if (displayWeek === '1-2' || displayWeek === '1st & 2nd week') {
          finalSalesAmount = resolvedSalesAmountWeek1 + resolvedSalesAmountWeek2;
        } else if (displayWeek === '1-3' || displayWeek === '1st, 2nd, 3rd week') {
          finalSalesAmount = resolvedSalesAmountWeek1 + resolvedSalesAmountWeek2 + resolvedSalesAmountWeek3;
        } else if (displayWeek === '1-4' || displayWeek === '1st, 2nd, 3rd, 4th week') {
          finalSalesAmount = resolvedSalesAmountWeek1 + resolvedSalesAmountWeek2 + resolvedSalesAmountWeek3 + resolvedSalesAmountWeek4;
        } else {
          const weekNum = parseInt(displayWeek.replace('Week ', '').trim(), 10) || parseInt(displayWeek, 10);
          if (weekNum === 1) finalSalesAmount = resolvedSalesAmountWeek1;
          if (weekNum === 2) finalSalesAmount = resolvedSalesAmountWeek2;
          if (weekNum === 3) finalSalesAmount = resolvedSalesAmountWeek3;
          if (weekNum === 4) finalSalesAmount = resolvedSalesAmountWeek4;
          if (weekNum === 5) finalSalesAmount = resolvedSalesAmountWeek5;
        }
      }

      return {
        ...dp,
        revenueTarget: finalRevenueTarget,
        salesAmount: finalSalesAmount,
        quantitySold: finalQuantitySold,
        videoTarget: finalVideoTarget,
        target: finalVideoTarget,
        nextMonthRevenueTarget: finalNextMonthRevenueTarget,
        nextMonthVideoTarget: finalNextMonthVideoTarget,
      };
    });
  }, [dashboardProducts, monthlyTargets, wizardProducts, displayMonth, displayYear, displayWeek, onlyShowPlacedProducts, tasks]);

  const totalRevenueTarget = computedProducts.reduce((sum, p) => sum + (p.revenueTarget || 0), 0);
  const totalAchieved = computedProducts.reduce((sum, p) => sum + (p.salesAmount || 0), 0);
  const percentageScore = totalRevenueTarget > 0 ? Math.round((totalAchieved / totalRevenueTarget) * 100) : 0;

  const totalCampaignBudget = useMemo(() => {
    const activeM = displayMonth ? monthMap[displayMonth] : 'ALL';
    const activeY = displayYear ? String(displayYear) : 'ALL';
    
    // 1. Try to read from Monthly Allotted Budget (MonthlyBudget)
    if (activeM && activeM !== 'ALL' && activeY && activeY !== 'ALL') {
      const mb = monthlyBudgets?.find(b => b.month === activeM && String(b.year) === activeY);
      if (mb && mb.budget > 0) return mb.budget;
    } else if (activeY && activeY !== 'ALL') {
       const mbSum = (monthlyBudgets || [])
         .filter((b) => String(b.year) === activeY)
         .reduce((sum, b) => sum + (b.budget || 0), 0);
       if (mbSum > 0) return mbSum;
    } else {
       const mbSum = (monthlyBudgets || [])
         .reduce((sum, b) => sum + (b.budget || 0), 0);
       if (mbSum > 0) return mbSum;
    }
    
    // 2. Fallback to older mechanism 'CENTRAL_BUDGET' in monthlyTargets
    if (activeM && activeM !== 'ALL' && activeY && activeY !== 'ALL') {
      const cb = monthlyTargets.find((t) => t.productName === 'CENTRAL_BUDGET' && t.month === activeM && t.year === activeY);
      if (cb && cb.target) return cb.target;
    } else if (activeY && activeY !== 'ALL') {
       const cbSum = monthlyTargets
         .filter((t) => t.productName === 'CENTRAL_BUDGET' && t.year === activeY)
         .reduce((sum, t) => sum + (t.target || 0), 0);
       if (cbSum > 0) return cbSum;
    } else {
       const cbSum = monthlyTargets
         .filter((t) => t.productName === 'CENTRAL_BUDGET')
         .reduce((sum, t) => sum + (t.target || 0), 0);
       if (cbSum > 0) return cbSum;
    }
    
    // 3. Fallback to campaigns total
    return campaigns.reduce((sum, c) => sum + (c.budget || 0), 0);
  }, [displayMonth, displayYear, monthlyTargets, monthlyBudgets, campaigns]);
  const globalAovEntry = useMemo(() => {
    const activeM = displayMonth ? monthMap[displayMonth] : null;
    if (!activeM || !displayYear) return null;
    const entries = aovEntries?.filter(e => 
      !e.productName && 
      e.month === activeM && 
      String(e.year) === String(displayYear) && 
      (displayWeek ? e.week === displayWeek : !e.week)
    ) || [];
    if (entries.length === 0) return null;
    const revenue = entries.reduce((sum, e) => sum + e.revenue, 0);
    const orders = entries.reduce((sum, e) => sum + e.orders, 0);
    return { 
      revenue, 
      orders, 
      calculatedAov: orders > 0 ? revenue / orders : 0 
    };
  }, [aovEntries, displayMonth, displayYear, displayWeek]);

  const topPerformersData = useMemo(() => {
    const targetProductNames = computedProducts.filter(p => !p.name.toUpperCase().startsWith('OTHERS ')).map(p => p.name).slice(0, 3);
    
    return targetProductNames.map(targetName => {
      const pNameLower = targetName.toLowerCase();
      
      const activeM = displayMonth ? monthMap[displayMonth] : 'ALL';
      const activeY = displayYear ? String(displayYear) : 'ALL';

      let validTasks = tasks.filter(t => t.status !== 'Cancelled' && (t.videoLink1 || t.videoLink2 || t.videoLink3 || t.releaseDate));
      validTasks = validTasks.filter(t => {
        const dateToUse = t.releaseDate || t.deadline;
        if (!dateToUse) return activeM === 'ALL' && activeY === 'ALL';
        const parts = dateToUse.split('-'); 
        if (parts.length < 3) return activeM === 'ALL' && activeY === 'ALL';
        const year = parts[0];
        const month = parts[1];
        const matchesMonth = activeM === 'ALL' || parseInt(month, 10) === parseInt(activeM, 10);
        const matchesYear = activeY === 'ALL' || year === activeY;
        return matchesMonth && matchesYear;
      });

      const tasksForProduct = validTasks.filter(t => t.title && t.title.toLowerCase() === pNameLower);
      
      let productTasks: Task[] = [];
      if (tasksForProduct.length > 0) {
         productTasks = tasksForProduct;
      } else {
        // Find related campaigns as fallback
        const relatedCampaigns = campaigns.filter(c => 
          c.niche.toLowerCase().includes(pNameLower.split(' ')[0]) || c.name.toLowerCase().includes(pNameLower.split(' ')[0])
        );
        const campaignIds = new Set(relatedCampaigns.map(c => c.id));
        productTasks = validTasks.filter(t => campaignIds.has(t.campaignId));
      }
      
      let topTask: Task | null = null;
      let maxClicks = -1;
      
      productTasks.forEach(t => {
        const clicks = t.clicks || 0;
        if (clicks > maxClicks) {
          maxClicks = clicks;
          topTask = t;
        }
      });
      
      const influencerName = topTask ? influencers.find(i => i.id === topTask?.influencerId)?.name || 'Unknown Influencer' : 'No Data';
      
      const views = (topTask as any)?.views || 0;
      const clicks = (topTask as any)?.clicks || 0;
      const remuneration = (topTask as any)?.remuneration || 0;
      const ctr = views > 0 ? parseFloat(((clicks / views) * 100).toFixed(2)) : 0;
      const cpc = clicks > 0 ? parseFloat((remuneration / clicks).toFixed(2)) : 0;
      const cpv = views > 0 ? parseFloat((remuneration / views).toFixed(3)) : 0;
      const videoLink = (topTask as any)?.videoLink1 || (topTask as any)?.videoLink2 || (topTask as any)?.videoLink3 || (topTask as any)?.shortIoLink || null;

      return {
        productName: targetName,
        influencerName,
        clicks,
        views,
        ctr,
        cpc,
        cpv,
        videoLink
      };
    });
  }, [computedProducts, campaigns, tasks, influencers, displayMonth, displayYear]);

  const videoDeliveryData = useMemo(() => {
    const activeM = displayMonth ? monthMap[displayMonth] : 'ALL';
    const activeY = displayYear ? String(displayYear) : 'ALL';

    const filteredTasksForBreakdown = tasks.filter(t => isTaskInPeriod(t, activeM, activeY, displayWeek || 'ALL'));

    const targetProductNames = computedProducts.filter(p => !p.name.toUpperCase().startsWith('OTHERS ')).map(p => p.name).slice(0, 3);
    
    return targetProductNames.map(targetName => {
      const pNameLower = targetName.toLowerCase();
      // Find the product
      const product = computedProducts.find(p => p.name.toLowerCase() === pNameLower) || 
                      computedProducts.find(p => p.name.toLowerCase().includes(pNameLower.split(' ')[0]));
      
      const target = product?.videoTarget || product?.target || 10; 

      const productTasks = filteredTasksForBreakdown.filter(t => 
        t.title && t.title.trim().toLowerCase() === targetName.trim().toLowerCase()
      );

      const releasedTasks = productTasks.filter(t => {
        const hasLink = !!(t.videoLink1?.trim() || t.videoLink2?.trim() || t.videoLink3?.trim());
        return hasLink;
      });

      const achieved = releasedTasks.length;
      
      return {
        name: targetName,
        target,
        achieved,
        percentage: target > 0 ? Math.round((achieved / target) * 100) : 0
      };
    });
  }, [computedProducts, campaigns, tasks, displayMonth, displayYear, displayWeek]);

  const { totalVideoTarget, totalVideoAchieved } = useMemo(() => {
    const activeM = displayMonth ? monthMap[displayMonth] : 'ALL';
    const activeY = displayYear ? String(displayYear) : 'ALL';
    const filteredTasksForBreakdown = tasks.filter(t => isTaskInPeriod(t, activeM, activeY, displayWeek || 'ALL'));

    let targetSum = 0;
    let achievedSum = 0;

    computedProducts.forEach(product => {
      targetSum += (product.videoTarget || product.target || 10);
      
      const productTasks = filteredTasksForBreakdown.filter(t => 
        t.title && t.title.trim().toLowerCase() === product.name.trim().toLowerCase()
      );

      const releasedTasks = productTasks.filter(t => {
        const hasLink = !!(t.videoLink1?.trim() || t.videoLink2?.trim() || t.videoLink3?.trim());
        return hasLink;
      });

      achievedSum += releasedTasks.length;
    });

    return { totalVideoTarget: targetSum, totalVideoAchieved: achievedSum };
  }, [computedProducts, tasks, displayMonth, displayYear, displayWeek]);

  const productRoasData = useMemo(() => {
    return computedProducts
      .map(product => {
      const pName = product.name.toLowerCase();

      const activeM = displayMonth ? monthMap[displayMonth] : 'ALL';
      const activeY = displayYear ? String(displayYear) : 'ALL';

      const hasLink = (link?: string) => {
        if (!link || !link.trim()) return false;
        const normalized = link.trim().toLowerCase();
        if (normalized === 'na' || normalized === 'n/a' || normalized === 'tba') return false;
        return true;
      };

      let baseTasks = tasks.filter(t => {
        if (t.status === 'Cancelled') return false;
        const weekFilter = (displayWeek && displayWeek !== 'ALL' && displayWeek !== '') ? displayWeek.replace('Week ', '').trim() : 'ALL';
        return isTaskInPeriod(t, activeM, activeY, weekFilter);
      });
      const tasksForProduct = baseTasks.filter(t => t.title && t.title.toLowerCase() === pName);
      
      const releasedTasks = tasksForProduct.filter(t => {
        const hasL = !!(t.videoLink1?.trim() || t.videoLink2?.trim() || t.videoLink3?.trim());
        return hasL;
      });

      const completedTasks = tasksForProduct.filter(t => t.videoLink1 || t.videoLink2 || t.videoLink3);

      const spent = releasedTasks.reduce((sum, t) => sum + (t.remuneration || 0), 0);
      const sampleCost = completedTasks.reduce((sum, t) => sum + (t.sampleCost || 0), 0);
      const videoCount = releasedTasks.length;

      const totalCostForROAS = spent + sampleCost;
      const achieved = product.salesAmount || 0;
      const quantitySold = product.quantitySold || 0;
      const aov = quantitySold > 0 ? achieved / quantitySold : 0;
      const roasScore = totalCostForROAS > 0 ? (achieved / totalCostForROAS) : (achieved > 0 ? -1 : 0);
      return {
        name: product.name,
        achieved,
        quantitySold,
        aov,
        spent,
        sampleCost,
        totalCostForROAS,
        roasScore,
        videoCount
      };
    });
  }, [computedProducts, campaigns, tasks, displayMonth, displayYear, displayWeek]);

  const totalCampaignSpent = useMemo(() => {
    return productRoasData.reduce((sum, p) => sum + p.spent, 0);
  }, [productRoasData]);

  const totalSampleCost = useMemo(() => {
    return productRoasData.reduce((sum, p) => sum + p.sampleCost, 0);
  }, [productRoasData]);

  const budgetSpentPercentage = totalCampaignBudget > 0 ? Math.round((totalCampaignSpent / totalCampaignBudget) * 100) : 0;

  const totalCostForROAS = totalCampaignSpent + totalSampleCost;
  const globalRoas = totalCostForROAS > 0 ? (totalAchieved / totalCostForROAS).toFixed(2) : (totalAchieved > 0 ? '∞' : '0.00');

  const formatCurrency = (num: number) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(num);
  };
  const formatCompactCurrency = (num: number) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 1, notation: 'compact' }).format(num);
  };

  const formatMultiplier = (num: number) => {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(num);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newImages: string[] = [];
    Array.from(files).forEach((file: File) => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (event) => {
          if (event.target?.result) {
            setImages(prev => [...prev, event.target!.result as string]);
          }
        };
        reader.readAsDataURL(file);
      }
    });
  };

  const removeImage = (index: number) => {
    // Note: index is the index in the images array.
    setImages(prev => prev.filter((_, i) => i !== index));
    // If we're looking at the removed image or beyond, adjust index.
    const removedGlobalIndex = index + 10;
    if (currentIndex === removedGlobalIndex && currentIndex === totalSlides - 1) {
      setCurrentIndex(Math.max(0, currentIndex - 1));
    } else if (currentIndex > removedGlobalIndex) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  return (
    <div className={`w-full h-full min-h-[85vh] bg-white rounded-3xl overflow-hidden  border border-gray-200 flex flex-col ${activeTheme}`}>
      <div className="p-5 border-b border-gray-200 bg-gray-50 flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <MonitorPlay className="w-5 h-5 text-fuchsia-600" />
          <h3 className="font-black text-gray-900 uppercase tracking-tight">LIVE SLIDES</h3>
        </div>
        <div className="flex items-center gap-3">
          
        <div className="flex items-center gap-2 mr-2">
           {/* Auto Sync Toggle */}
           <label className="hidden md:flex items-center gap-2 cursor-pointer select-none bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-200 hover:bg-indigo-100 transition mr-1">
             <input 
               type="checkbox"
               checked={autoSync}
               onChange={(e) => setAutoSync(e.target.checked)}
               className="w-4 h-4 rounded text-indigo-600 bg-white border-indigo-200 focus:ring-indigo-500 accent-indigo-600"
             />
             <span className="text-[10px] uppercase font-black font-mono text-indigo-600 flex items-center gap-1">
               <RefreshCw className={`w-3 h-3 ${autoSync ? 'animate-spin' : ''}`} />
               Sync
             </span>
           </label>
           <select 
             value={displayWeek} 
             onChange={e => { setDisplayWeek(e.target.value); setAutoSync(false); }}
             className="bg-white border-4 border-gray-200 rounded-lg px-2 py-1.5 text-xs md:text-sm font-black text-gray-700 focus:border-primary-500 focus:ring-primary-500"
           >
             <option value="">No Week</option>
             <option value="Week 1">Week 1</option>
             <option value="Week 2">Week 2</option>
             <option value="Week 3">Week 3</option>
             <option value="Week 4">Week 4</option>
             <option value="Week 5">Week 5</option>
             <option value="1st & 2nd week">1st & 2nd week (Days 1–14)</option>
             <option value="1st, 2nd, 3rd week">1st, 2nd, 3rd week (Days 1–21)</option>
             <option value="1st, 2nd, 3rd, 4th week">1st, 2nd, 3rd, 4th week (Days 1–28)</option>
           </select>
           <select 
             value={displayMonth} 
             onChange={e => { setDisplayMonth(e.target.value); setAutoSync(false); }}
             className="bg-white border-4 border-gray-200 rounded-lg px-2 py-1.5 text-xs md:text-sm font-black text-gray-700 focus:border-primary-500 focus:ring-primary-500"
           >
             <option value="">No Month</option>
             {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map(m => (
               <option key={m} value={m}>{m}</option>
             ))}
           </select>
           <select 
             value={displayYear} 
             onChange={e => { setDisplayYear(e.target.value); setAutoSync(false); }}
             className="bg-white border-4 border-gray-200 rounded-lg px-2 py-1.5 text-xs md:text-sm font-black text-gray-700 focus:border-primary-500 focus:ring-primary-500"
           >
             <option value="">All Years</option>
             {[2023, 2024, 2025, 2026, 2027, 2028].map(y => (
               <option key={y} value={y}>{y}</option>
             ))}
           </select>
        </div>

          <div className="relative group mr-2">
            <button className="bg-white border-4 border-gray-200 hover:border-gray-300 text-gray-700 px-3 py-2 rounded-xl text-sm font-black transition-colors flex items-center gap-2">
              <Palette className="w-4 h-4 text-primary-600" />
              Theme
            </button>
            <div className="absolute top-full left-0 w-48 pt-2 hidden group-hover:block z-50">
              <div className="bg-white border border-gray-200 rounded-xl p-2 flex flex-col gap-1">
                <button onClick={() => setActiveTheme('theme-red')} className={`text-left px-3 py-2 rounded-lg text-sm font-black flex items-center gap-2 ${activeTheme === 'theme-red' ? 'bg-red-50 text-red-700' : 'hover:bg-gray-50'}`}>
                  <div className="w-4 h-4 rounded-full bg-red-600"></div> Red & White
                </button>
                <button onClick={() => setActiveTheme('theme-blue')} className={`text-left px-3 py-2 rounded-lg text-sm font-black flex items-center gap-2 ${activeTheme === 'theme-blue' ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50'}`}>
                  <div className="w-4 h-4 rounded-full bg-blue-600"></div> Blue
                </button>
                <button onClick={() => setActiveTheme('theme-emerald')} className={`text-left px-3 py-2 rounded-lg text-sm font-black flex items-center gap-2 ${activeTheme === 'theme-emerald' ? 'bg-emerald-50 text-emerald-700' : 'hover:bg-gray-50'}`}>
                  <div className="w-4 h-4 rounded-full bg-emerald-600"></div> Green
                </button>
                <button onClick={() => setActiveTheme('theme-purple')} className={`text-left px-3 py-2 rounded-lg text-sm font-black flex items-center gap-2 ${activeTheme === 'theme-purple' ? 'bg-purple-50 text-purple-700' : 'hover:bg-gray-50'}`}>
                  <div className="w-4 h-4 rounded-full bg-purple-600"></div> Purple
                </button>
                <button onClick={() => setActiveTheme('theme-amber')} className={`text-left px-3 py-2 rounded-lg text-sm font-black flex items-center gap-2 ${activeTheme === 'theme-amber' ? 'bg-amber-50 text-amber-700' : 'hover:bg-gray-50'}`}>
                  <div className="w-4 h-4 rounded-full bg-amber-500"></div> Amber
                </button>
                <button onClick={() => setActiveTheme('theme-teal')} className={`text-left px-3 py-2 rounded-lg text-sm font-black flex items-center gap-2 ${activeTheme === 'theme-teal' ? 'bg-teal-50 text-teal-700' : 'hover:bg-gray-50'}`}>
                  <div className="w-4 h-4 rounded-full bg-[#108a65]"></div> Teal
                </button>
              </div>
            </div>
          </div>
          <button 
            onClick={downloadAsPptx}
            disabled={isDownloading}
            className="bg-fuchsia-600 hover:bg-fuchsia-700 text-white px-4 py-2 rounded-xl text-sm font-black cursor-pointer transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {isDownloading ? (
              <div className="w-4 h-4 rounded-full border-4 border-white/30 border-t-white animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            Download PPTX
          </button>
          <button 
            onClick={downloadAsAlternativePptx}
            disabled={isDownloading}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-black cursor-pointer transition-colors flex items-center gap-2 disabled:opacity-50"
            title="Alternative PPT Engine for rendering fixes"
          >
            {isDownloading ? (
              <div className="w-4 h-4 rounded-full border-4 border-white/30 border-t-white animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            PPT (Alt Engine)
          </button>
          <button 
            onClick={downloadAllSlides}
            disabled={isDownloading}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-sm font-black cursor-pointer transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {isDownloading ? (
              <div className="w-4 h-4 rounded-full border-4 border-white/30 border-t-white animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            Download JPGs
          </button>
          <button 
            onClick={startSlideShow}
            className="bg-gray-900 hover:bg-black text-white px-4 py-2 rounded-xl text-sm font-black cursor-pointer transition-colors flex items-center gap-2"
          >
            <MonitorPlay className="w-4 h-4" />
            Slide Show
          </button>
          <label className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-black cursor-pointer transition-colors flex items-center gap-2">
            <Upload className="w-4 h-4" />
            Upload Images
            <input type="file" accept="image/*" multiple className="hidden" onChange={handleFileUpload} />
          </label>
        </div>
      </div>

      <div 
        ref={containerRef}
        className={`flex-1 bg-gray-900 flex items-center justify-center transition-all duration-300 ${activeTheme} ${
          isSlideShow ? 'fixed inset-0 z-[100] p-0' : 'relative p-4 lg:p-8'
        }`}
      >
        {isSlideShow && (
          <button 
            onClick={endSlideShow}
            className={`absolute top-6 right-6 z-50 p-3 bg-black/40 hover:bg-black text-white rounded-full transition-all duration-300  ${
              isControlsVisible ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <Minimize className="w-6 h-6" />
          </button>
        )}

        <div 
          ref={captureRef}
          className={`relative bg-black flex items-center justify-center overflow-hidden transition-all duration-300 w-full ${
            (isSlideShow && !isDownloading) ? 'h-full rounded-none' : 'max-w-6xl aspect-[16/9] rounded-2xl  ring-1 ring-white/10'
          } ${isDownloading ? 'is-downloading rounded-none ring-0 w-[1152px] h-[648px] max-w-none flex-shrink-0 ' : ''}`}
        >
          <div className="absolute top-4 right-6 z-30 flex flex-col items-end pointer-events-none">
             {!isDownloading && (
               <span className="text-xs md:text-sm font-black uppercase text-white/90 tracking-widest bg-black/40 px-4 py-1.5 rounded-full border border-white/10">
                 {displayWeek && `${displayWeek}, `}{displayMonth} {displayYear}
               </span>
             )}
          </div>
          {currentIndex === 0 ? (
            <div className="w-full h-full text-white p-12 flex flex-col items-center justify-center relative overflow-hidden">
               <div className="absolute inset-0 bg-gradient-to-br from-red-600 via-red-800 to-red-950 border-[16px] lg:border-[24px] border-white z-0"></div>
               <div className="relative z-10 w-full flex flex-col items-center text-center">
                  <div className="p-4 bg-white rounded-full mb-6">
                    <TrendingUp className="w-16 h-16 text-red-600" />
                  </div>
                  <h2 className="text-3xl md:text-4xl lg:text-5xl font-black uppercase tracking-tight text-white mb-8">Revenue Target vs Achieved</h2>
                  
                  <div className="grid grid-cols-2 gap-8 w-full max-w-4xl mx-auto">
                     <div className="bg-red-700/50 rounded-3xl p-8 border-4 border-white flex flex-col items-center relative overflow-hidden">
                        <span className="text-white/90 font-black uppercase tracking-widest text-sm mb-2">Target Goal</span>
                        <span className="text-3xl md:text-4xl lg:text-5xl font-black text-white">{formatCurrency(totalRevenueTarget)}</span>
                     </div>
                     <div className="bg-white rounded-3xl p-8 border-4 border-white shrink-0 flex flex-col items-center relative overflow-hidden text-red-600">
                        <span className="text-red-600/70 font-black uppercase tracking-widest text-sm mb-2">Actual Achieved</span>
                        <span className="text-4xl md:text-5xl lg:text-6xl font-black text-red-600 mt-2">{formatCurrency(totalAchieved)}</span>
                     </div>
                  </div>
                  
                  <div className="mt-12 w-full max-w-2xl bg-black/20 rounded-full h-4 overflow-hidden border border-white/40 relative">
                     <div 
                        className="absolute left-0 top-0 h-full bg-white rounded-full transition-all duration-1000 ease-out"
                       style={{ width: `${Math.min(percentageScore, 100)}%` }}
                     />
                  </div>
                  <p className="mt-4 text-white font-black tracking-widest">{percentageScore}% OF GLOBAL TARGET COMPLETED</p>
               </div>
            </div>
          ) : currentIndex === 1 ? (
            <div className="w-full h-full text-white p-10 flex flex-col items-center relative overflow-hidden">
               <div className="absolute inset-0 bg-gradient-to-br from-red-600 via-red-800 to-red-950 border-[16px] lg:border-[24px] border-white z-0"></div>
               <div className="relative z-10 w-full h-full flex flex-col">
                  <div className="flex flex-col items-center justify-center gap-2 mb-8 shrink-0 w-full text-center">
                     <div className="flex items-center gap-4">
                       <div className="p-3 bg-white rounded-full shrink-0">
                         <TrendingUp className="w-8 h-8 text-red-600" />
                       </div>
                       <h2 className="text-2xl md:text-4xl lg:text-4xl font-black uppercase tracking-tight text-white">Product Revenue Achieved</h2>
                     </div>
                     <div className="mt-2 bg-white rounded-3xl px-12 py-4 flex flex-col items-center border-4 border-red-700/30">
                        <span className="text-red-700 font-black uppercase tracking-widest text-lg">Total Budget (Achieved)</span>
                        <span className="text-3xl md:text-4xl font-black text-red-600">{formatCurrency(totalAchieved)}</span>
                     </div>
                  </div>
                  
                  {(() => {
                     const filteredProducts = computedProducts.filter(p => !p.name.toUpperCase().startsWith('OTHERS '));
                     const isBig = filteredProducts.length > 0 && filteredProducts.length <= 3;
                     const gridColsClass = isBig
                        ? 'grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6 pb-2 content-center h-full'
                        : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3 lg:gap-4 pb-2 content-start';
                     
                     return (
                       <div className={`flex-1 w-full grid ${gridColsClass} items-stretch`}>
                         {filteredProducts.map((product, idx) => {
                           const target = product.revenueTarget || 0;
                           const achieved = product.salesAmount || 0;
                           const score = target > 0 ? Math.round((achieved / target) * 100) : 0;
                           
                           return (
                             <div key={idx} className={`bg-red-700/50 rounded-2xl sm:rounded-3xl p-2 sm:p-4 border-2 sm:border-4 border-white flex flex-col ${isBig ? 'p-4 lg:p-6 min-h-[250px] lg:min-h-[350px] gap-3 lg:gap-4 transform hover:scale-105 transition duration-500 justify-between' : 'p-2 gap-1.5 sm:gap-2 min-h-[120px] lg:min-h-[140px] justify-between'}`}>
                                <div className={`flex flex-col mb-1 text-center items-center ${isBig ? 'justify-center flex-1' : ''}`}>
                                   <h3 className={`font-black text-white tracking-wider uppercase  ${isBig ? 'text-xl lg:text-2xl xl:text-2xl leading-[1.1] pb-1 sm:pb-2 line-clamp-3' : 'text-[9px] sm:text-[10px] lg:text-xs leading-snug line-clamp-2'}`} title={product.name}>{product.name}</h3>
                                   <div className={`text-center font-black opacity-90 uppercase tracking-widest text-red-100  break-words ${isBig ? 'mt-3 mb-3 text-2xl lg:text-3xl xl:text-4xl' : 'mt-1.5 sm:mt-2 text-xs sm:text-sm text-left'}`}>
                                     {formatCurrency(achieved)} <span className={`opacity-60 font-black ${isBig ? 'mx-2 sm:mx-3' : 'mx-0.5'}`}>/</span> <br className={isBig ? "hidden 2xl:block" : "hidden"} /> {formatCurrency(target)}
                                   </div>
                                </div>
                                <div className={`flex flex-col mt-auto shrink-0 ${isBig ? 'gap-3 lg:gap-4' : 'gap-1 sm:gap-1.5'}`}>
                                   <div className={`w-full bg-black/30 rounded-full overflow-hidden border-4 border-white/40  relative ${isBig ? 'h-4 sm:h-5 lg:h-6' : 'h-1.5 sm:h-2'}`}>
                                      <div 
                                        className="absolute left-0 top-0 h-full bg-white transition-all duration-1000 ease-out"
                                        style={{ width: `${Math.min(score, 100)}%` }}
                                      />
                                   </div>
                                   <p className={`text-white font-black tracking-widest text-center  uppercase ${isBig ? 'text-lg lg:text-xl xl:text-2xl mt-2 text-red-200' : 'text-[9px] sm:text-[10px] text-right'}`}>{score}% Completed</p>
                                </div>
                             </div>
                           );
                         })}
                         {filteredProducts.length === 0 && (
                            <div className="col-span-full flex items-center justify-center h-full pb-10">
                               <p className="text-white/60 font-black uppercase tracking-widest text-xl">No Products Configured</p>
                            </div>
                         )}
                       </div>
                     );
                   })()}
                </div>
             </div>
           ) : currentIndex === 2 ? (
            <div className="w-full h-full text-white p-12 flex flex-col items-center justify-center relative overflow-hidden">
               <div className="absolute inset-0 bg-gradient-to-br from-red-600 via-red-800 to-red-950 border-[16px] lg:border-[24px] border-white z-0"></div>
               <div className="relative z-10 w-full flex flex-col items-center text-center">
                  <div className="p-4 bg-white rounded-full mb-6">
                    <PieChartIcon className="w-16 h-16 text-red-600" />
                  </div>
                  <h2 className="text-3xl md:text-4xl lg:text-5xl font-black uppercase tracking-tight text-white mb-8">Campaign Budget vs Spent</h2>
                  
                  <div className="grid grid-cols-2 gap-8 w-full max-w-4xl mx-auto">
                     <div className="bg-red-700/50 rounded-3xl p-8 border-4 border-white flex flex-col items-center relative overflow-hidden">
                        <span className="text-white/90 font-black uppercase tracking-widest text-sm mb-2">Total Budget</span>
                        <span className="text-3xl md:text-4xl font-black text-white">{formatCurrency(totalCampaignBudget)}</span>
                     </div>
                     <div className="bg-white rounded-3xl p-8 border-4 border-white shrink-0 flex flex-col items-center relative overflow-hidden text-red-600">
                        <span className="text-red-600/70 font-black uppercase tracking-widest text-sm mb-2">Amount Spent</span>
                        <span className="text-4xl md:text-5xl font-black text-red-600 mt-2">{formatCurrency(totalCampaignSpent)}</span>
                     </div>
                  </div>
                  
                  <div className="mt-12 w-full max-w-2xl bg-black/20 rounded-full h-4 overflow-hidden border border-white/40 relative">
                     <div 
                        className="absolute left-0 top-0 h-full bg-white rounded-full transition-all duration-1000 ease-out"
                       style={{ width: `${Math.min(budgetSpentPercentage, 100)}%` }}
                     />
                  </div>
                  <p className="mt-4 text-white font-black tracking-widest">{budgetSpentPercentage}% OF CAMPAIGN BUDGET SPENT</p>
                  
                  <div className="mt-8 bg-black/20 rounded-full px-8 py-3 border border-white/20">
                     <span className="text-white/80 font-black uppercase tracking-widest text-sm mr-4">Remaining Funds:</span>
                     <span className="text-xl font-black text-white">{formatCurrency(Math.max(0, totalCampaignBudget - totalCampaignSpent))}</span>
                  </div>
               </div>
            </div>
          ) : currentIndex === 3 ? (
            <div className="w-full h-full text-white p-12 flex flex-col items-center justify-center relative overflow-hidden">
               <div className="absolute inset-0 bg-gradient-to-br from-red-600 via-red-800 to-red-950 border-[16px] lg:border-[24px] border-white z-0"></div>
               <div className="relative z-10 w-full h-full flex flex-col">
                  <div className="flex flex-col items-center justify-center gap-2 mb-10 shrink-0 w-full text-center">
                     <div className="flex items-center gap-4">
                       <div className="p-3 bg-white rounded-full shrink-0">
                         <Target className="w-8 h-8 text-red-600" />
                       </div>
                       <h2 className="text-3xl md:text-4xl lg:text-5xl font-black uppercase tracking-tight text-white">Product-wise Spent</h2>
                     </div>
                  </div>
                  
                  {(() => {
                     const targetProducts = ["BHIM BANANA OATS", "CHOCOLATE DRINK", "HIGH PROTEIN OATS"];
                     const spentData = productRoasData.filter(p => 
                        targetProducts.some(t => p.name.toUpperCase().includes(t))
                     );
                     
                     return (
                        <div className="flex-1 flex items-center justify-center w-full">
                           <div className="w-full grid grid-cols-3 gap-8 max-w-6xl mx-auto">
                              {spentData.map((data, idx) => (
                                <div key={idx} className="bg-red-700/50 rounded-3xl p-8 border-4 border-white flex flex-col items-center transform hover:scale-105 transition duration-500">
                                   <div className="bg-white/20 rounded-full w-20 h-20 flex items-center justify-center mb-6 border-4 border-white">
                                     <IndianRupee className="w-10 h-10 text-white" />
                                   </div>
                                   <h3 className="font-black text-white tracking-wider uppercase text-xl lg:text-2xl text-center mb-4 line-clamp-3 h-20 flex items-center justify-center">{data.name}</h3>
                                   <div className="bg-white/10 w-full rounded-2xl p-6 flex flex-col items-center justify-center border border-white/20 mt-auto relative">
                                      <span className="text-xs lg:text-sm uppercase font-black tracking-widest text-red-200 mb-2">Amount Spent</span>
                                      <span className="text-3xl lg:text-4xl xl:text-5xl font-black text-white">{formatCurrency(data.spent)}</span>
                                      <div className="mt-4 flex items-center justify-center gap-2 bg-black/20 rounded-full px-4 py-1.5 border border-white/10">
                                         <Video className="w-4 h-4 text-white opacity-80" />
                                         <span className="text-sm font-bold text-white uppercase tracking-wider">{data.videoCount} {data.videoCount === 1 ? 'Video' : 'Videos'}</span>
                                      </div>
                                   </div>
                                </div>
                              ))}
                              {spentData.length === 0 && (
                                <div className="col-span-full flex items-center justify-center h-full pb-10">
                                  <p className="text-xl font-black text-white/70 uppercase tracking-widest">No target products data found</p>
                                </div>
                              )}
                           </div>
                        </div>
                     );
                  })()}
               </div>
            </div>
          ) : currentIndex === 4 ? (
            <div className="w-full h-full text-white p-10 flex flex-col items-center relative overflow-hidden">
               <div className="absolute inset-0 bg-gradient-to-br from-red-600 via-red-800 to-red-950 border-[16px] lg:border-[24px] border-white z-0"></div>
               <div className="relative z-10 w-full h-full flex flex-col">
                  <div className="flex flex-col items-center justify-center gap-2 mb-8 shrink-0 w-full text-center">
                     <div className="flex items-center gap-4">
                       <div className="p-3 bg-white rounded-full shrink-0">
                         <IndianRupee className="w-8 h-8 text-red-600" />
                       </div>
                       <h2 className="text-3xl md:text-5xl font-black uppercase tracking-tight text-white">Return on Ad Spend (ROAS)</h2>
                     </div>
                     <div className="mt-2 flex items-center justify-center gap-6">
                       <div className="bg-white rounded-3xl px-10 py-4 flex flex-col items-center border-4 border-red-700/30">
                          <span className="text-red-700 font-black uppercase tracking-widest text-xl">Total Budget (Spent)</span>
                          <span className="text-5xl md:text-6xl font-black text-red-600">{formatCurrency(totalCampaignSpent)}</span>
                       </div>
                       <div className="bg-white rounded-3xl px-10 py-4 flex flex-col items-center border-4 border-red-700/30">
                          <span className="text-red-700 font-black uppercase tracking-widest text-xl">Global ROAS</span>
                          <span className="text-5xl md:text-6xl font-black text-red-600">{globalRoas}x</span>
                       </div>
                     </div>
                  </div>
                  
                  <div className="flex-1 w-full grid grid-cols-2 lg:grid-cols-3 gap-4 pb-2 overflow-y-auto pr-2">
                     {productRoasData.filter(d => !d.name.toUpperCase().startsWith('OTHERS ')).map((data, idx) => (
                        <div key={idx} className="bg-red-700/50 rounded-xl p-5 border-4 border-white flex flex-col justify-between">
                           <div className="flex flex-col mb-4">
                              <h3 className="text-xl font-black text-white tracking-widest uppercase truncate mb-3" title={data.name}>{data.name}</h3>
                              
                              <div className="flex justify-between items-center bg-black/20 rounded-lg p-2 mb-2">
                                <span className="text-xs uppercase font-black tracking-widest opacity-80">Revenue</span>
                                <span className="font-black">{formatCurrency(data.achieved)}</span>
                              </div>
                              <div className="flex justify-between items-center bg-black/20 rounded-lg p-2">
                                <span className="text-xs uppercase font-black tracking-widest opacity-80">Ad Spend</span>
                                <span className="font-black">{formatCurrency(data.spent)}</span>
                              </div>
                           </div>
                           
                           <div className="border-t border-white/30 pt-3 mt-auto flex justify-between items-center">
                              <span className="text-sm font-black uppercase tracking-widest text-white/90">ROAS</span>
                              <span className="text-3xl font-black text-white bg-red-800/60 px-3 py-1 rounded-lg">
                                {data.roasScore === -1 ? '∞' : `${formatMultiplier(data.roasScore)}x`}
                              </span>
                           </div>
                        </div>
                     ))}
                     {productRoasData.length === 0 && (
                        <div className="col-span-full flex items-center justify-center h-full pb-10">
                           <p className="text-white/60 font-black uppercase tracking-widest text-xl">No Products Configured</p>
                        </div>
                     )}
                  </div>
               </div>
            </div>
          ) : currentIndex === 5 ? (
            <div className="w-full h-full text-white p-12 flex flex-col items-center justify-center relative overflow-hidden">
               <div className="absolute inset-0 bg-gradient-to-br from-red-600 via-red-800 to-red-950 border-[16px] lg:border-[24px] border-white z-0"></div>
               <div className="relative z-10 w-full flex flex-col items-center text-center max-w-5xl mx-auto h-full justify-center">
                  <div className="flex items-center gap-4 mb-10 shrink-0">
                     <div className="p-3 bg-white rounded-full shrink-0">
                       <TrendingUp className="w-8 h-8 text-red-600" />
                     </div>
                     <h2 className="text-3xl md:text-5xl font-black uppercase tracking-tight text-white">Product Performance Overview</h2>
                  </div>
                  
                  {(() => {
                     const filteredRoasData = productRoasData.filter(d => !d.name.toUpperCase().startsWith('OTHERS '));
                     return (
                        <>
                           <div className={filteredRoasData.length <= 3 ? "grid grid-cols-3 gap-6 w-full mb-8" : "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4 w-full mb-8"}>
                              {filteredRoasData.map((data, idx) => (
                                 <div key={idx} className="bg-red-700/50 rounded-2xl p-6 border-4 border-white flex flex-col items-center">
                                    <span className="text-white/90 font-black uppercase tracking-widest text-lg mb-4 text-center h-14 flex items-center justify-center leading-tight truncate px-2 w-full" title={data.name}>{data.name}</span>
                                    <span className={filteredRoasData.length <= 3 ? "text-3xl font-black mb-2" : "text-xl font-black mb-2"}>{formatCurrency(data.achieved)}</span>
                                    <div className="w-full h-px bg-white/20 my-3"></div>
                                    <div className="flex justify-between w-full text-sm font-black opacity-80 uppercase tracking-widest mb-1">
                                       <span>Units Sold:</span>
                                       <span>{data.quantitySold.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between w-full text-sm font-black opacity-80 uppercase tracking-widest">
                                       <span>AOV:</span>
                                       <span>{formatCurrency(data.aov)}</span>
                                    </div>
                                 </div>
                              ))}
                           </div>
                        </>
                     );
                  })()}
                  
                  <div className="bg-white rounded-3xl p-6 border-4 border-red-200 flex flex-row justify-between items-center w-full text-red-600 mt-auto">
                     <span className="text-xl font-black uppercase tracking-widest">Total Sales</span>
                     <div className="flex items-center gap-8 mt-4 md:mt-0">
                       <div className="flex flex-col items-end">
                          <span className="text-xs uppercase font-black tracking-widest opacity-70">Total Units</span>
                          <span className="text-2xl font-black">{productRoasData.reduce((sum, p) => sum + p.quantitySold, 0).toLocaleString()}</span>
                       </div>
                       <div className="flex flex-col items-end">
                          <span className="text-xs uppercase font-black tracking-widest opacity-70">Total AOV</span>
                          <span className="text-2xl font-black">{formatCurrency(productRoasData.reduce((sum, p) => sum + p.quantitySold, 0) > 0 ? productRoasData.reduce((sum, p) => sum + p.achieved, 0) / productRoasData.reduce((sum, p) => sum + p.quantitySold, 0) : 0)}</span>
                       </div>
                       <div className="flex flex-col items-end">
                          <span className="text-xs uppercase font-black tracking-widest opacity-70">Total Amount</span>
                          <span className="text-3xl font-black">{formatCurrency(totalAchieved)}</span>
                       </div>
                     </div>
                  </div>
               </div>
            </div>
          ) : currentIndex === 6 ? (
            <div className="w-full h-full text-white p-12 flex flex-col items-center justify-center relative overflow-hidden">
               <div className="absolute inset-0 bg-gradient-to-br from-red-600 via-red-800 to-red-950 border-[16px] lg:border-[24px] border-white z-0"></div>
               <div className="relative z-10 w-full flex flex-col items-center max-w-5xl mx-auto h-full justify-center">
                  <div className="flex flex-col items-center mb-10 shrink-0">
                     <div className="flex items-center gap-4 mb-4">
                        <div className="p-3 bg-white rounded-full shrink-0">
                          <Video className="w-8 h-8 text-red-600" />
                        </div>
                        <h2 className="text-2xl md:text-4xl font-black uppercase tracking-tight text-white text-center leading-tight">
                           Video Delivery<br /><span className="text-2xl md:text-3xl opacity-90 text-red-200">Target vs. Achieved</span>
                        </h2>
                     </div>
                  </div>
                  
                  <div className="flex-1 w-full flex flex-col gap-2 md:gap-3 justify-center max-w-4xl">
                     <div className="bg-red-900/60 rounded-xl p-2.5 md:p-4 border-4 border-yellow-400 flex flex-row items-center gap-2 md:gap-4 relative overflow-hidden">
                        <div className="absolute left-0 top-0 bottom-0 w-2 bg-yellow-400"></div>
                        <div className="md:w-1/3 flex flex-col pl-4 text-center md:text-left">
                           <h3 className="text-lg md:text-2xl font-black text-yellow-400 tracking-widest uppercase leading-tight">TOTAL</h3>
                        </div>
                        <div className="flex-1 w-full grid grid-cols-2 gap-4">
                           <div className="bg-white/10 rounded-lg md:rounded-xl p-2 md:p-4 flex flex-col items-center justify-center border border-white/20">
                              <span className="text-xs uppercase font-black tracking-widest opacity-80 mb-1">Total Target</span>
                              <span className="text-2xl md:text-4xl font-black text-yellow-400">{totalVideoTarget}</span>
                           </div>
                           <div className="bg-yellow-400 rounded-lg md:rounded-xl p-2 md:p-4 flex flex-col items-center justify-center text-red-700 border-2 border-yellow-400">
                              <span className="text-xs uppercase font-black tracking-widest opacity-80 mb-1 text-red-900">Total Achieved</span>
                              <span className="text-2xl md:text-4xl font-black text-red-900">{totalVideoAchieved}</span>
                           </div>
                        </div>
                        <div className="md:w-24 flex flex-col items-center justify-center shrink-0">
                               <div className="relative w-16 h-16 md:w-20 md:h-20 rounded-full flex items-center justify-center bg-black/20 border-4 border-yellow-400/40">
                              <div 
                                 className="absolute inset-0 rounded-full transition-all duration-1000 ease-out"
                                 style={{
                                    background: `conic-gradient(#facc15 ${totalVideoTarget > 0 ? Math.round((totalVideoAchieved / totalVideoTarget) * 100) : 0}%, transparent ${totalVideoTarget > 0 ? Math.round((totalVideoAchieved / totalVideoTarget) * 100) : 0}%)`,
                                    opacity: 0.9
                                 }}
                              />
                              <div className="absolute inset-1.5 md:inset-2 bg-red-800 rounded-full flex items-center justify-center border-4 border-yellow-400/30">
                                  <span className="text-sm md:text-lg font-black text-yellow-400">{totalVideoTarget > 0 ? Math.round((totalVideoAchieved / totalVideoTarget) * 100) : 0}%</span>
                               </div>
                           </div>
                        </div>
                     </div>
                     
                     {videoDeliveryData.map((data, idx) => (
                        <div key={idx} className="bg-red-700/50 rounded-xl p-2 md:p-3 border-2 md:border-4 border-white flex flex-row items-center gap-2 md:gap-3 relative overflow-hidden">
                           <div className="absolute left-0 top-0 bottom-0 w-2 bg-white/40"></div>
                           
                           <div className="md:w-1/3 flex flex-col pl-4 text-center md:text-left">
                              <h3 className="text-sm md:text-lg lg:text-xl font-black text-white tracking-widest uppercase leading-tight line-clamp-2">{data.name}</h3>
                           </div>
                           
                           <div className="flex-1 w-full grid grid-cols-2 gap-4">
                              <div className="bg-white/10 rounded-lg md:rounded-xl p-2 md:p-4 flex flex-col items-center justify-center border border-white/20">
                                 <span className="text-xs uppercase font-black tracking-widest opacity-80 mb-1">Target</span>
                                 <span className="text-xl md:text-2xl lg:text-3xl font-black">{data.target}</span>
                              </div>
                              <div className="bg-white rounded-lg md:rounded-xl p-2 md:p-4 flex flex-col items-center justify-center text-red-600 border border-white">
                                 <span className="text-xs uppercase font-black tracking-widest opacity-80 mb-1">Achieved</span>
                                 <span className="text-xl md:text-2xl lg:text-3xl font-black">{data.achieved}</span>
                              </div>
                           </div>
                           
                           <div className="md:w-24 flex flex-col items-center justify-center shrink-0">
                              <div className="relative w-16 h-16 md:w-20 md:h-20 rounded-full flex items-center justify-center bg-black/20 border-[3px] border-white/40">
                                 <div 
                                    className="absolute inset-0 rounded-full transition-all duration-1000 ease-out"
                                    style={{
                                       background: `conic-gradient(#ffffff ${data.percentage}%, transparent ${data.percentage}%)`,
                                       opacity: 0.9
                                    }}
                                 />
                                 <div className="absolute inset-1.5 md:inset-2 bg-red-700 rounded-full flex items-center justify-center border-2 md:border-4 border-white/30">
                                    <span className="text-sm md:text-lg font-black text-white">{data.percentage}%</span>
                                 </div>
                              </div>
                           </div>
                        </div>
                     ))}
                  </div>
               </div>
            </div>
          ) : currentIndex === 7 ? (
            <div className="w-full h-full text-white p-12 flex flex-col items-center justify-center relative overflow-hidden">
               <div className="absolute inset-0 bg-gradient-to-br from-red-600 via-red-800 to-red-950 border-[16px] lg:border-[24px] border-white z-0"></div>
               <div className="relative z-10 w-full h-full flex flex-col">
                  <div className="flex flex-col items-center justify-center gap-2 mb-8 shrink-0 w-full text-center">
                     <div className="flex items-center gap-4">
                       <div className="p-3 bg-white rounded-full shrink-0">
                         <Target className="w-8 h-8 text-red-600" />
                       </div>
                       <h2 className="text-3xl md:text-4xl font-black uppercase tracking-tight text-white">Next Month Targets</h2>
                     </div>
                     <div className="mt-2 bg-white rounded-3xl px-12 py-4 flex flex-row gap-8 items-center justify-center border-4 border-red-700/30 text-center">
                        <div className="flex flex-col items-center">
                          <span className="text-red-700 font-black uppercase tracking-widest text-sm mb-1">Total Revenue Target</span>
                          <span className="text-4xl font-black text-red-600">{formatCurrency(computedProducts.reduce((sum, p) => sum + (p.nextMonthRevenueTarget || 0), 0))}</span>
                        </div>
                        <div className="hidden md:block w-px h-16 bg-red-100"></div>
                        <div className="flex flex-col items-center">
                          <span className="text-red-700 font-black uppercase tracking-widest text-sm mb-1">Total Video Target</span>
                          <span className="text-4xl font-black text-red-600">{computedProducts.reduce((sum, p) => sum + (p.nextMonthVideoTarget || 0), 0)}</span>
                        </div>
                     </div>
                  </div>
                  
                  {(() => {
                     const filteredProducts = computedProducts.filter(p => !p.name.toUpperCase().startsWith('OTHERS ') && (p.nextMonthRevenueTarget !== 0 || p.nextMonthVideoTarget !== 0));
                     const isBig = filteredProducts.length > 0 && filteredProducts.length <= 3;
                     const gridColsClass = isBig
                        ? 'grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6 pb-2 content-center h-full'
                        : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-3 pb-2 content-start';
                     
                     return (
                       <div className={`flex-1 w-full grid ${gridColsClass} items-stretch`}>
                         {filteredProducts.map((product, idx) => {
                           const revTarget = product.nextMonthRevenueTarget || 0;
                           const vidTarget = product.nextMonthVideoTarget || 0;
                           
                           return (
                             <div key={idx} className={`bg-red-700/50 rounded-2xl sm:rounded-3xl p-2 sm:p-4 border-2 sm:border-4 border-white flex flex-col ${isBig ? 'p-4 lg:p-6 min-h-[250px] lg:min-h-[350px] gap-3 lg:gap-4 transform hover:scale-105 transition duration-500 justify-between' : 'p-2 gap-1.5 sm:gap-2 min-h-[120px] lg:min-h-[140px] justify-between'}`}>
                                <div className={`flex flex-col mb-1 text-center items-center ${isBig ? 'justify-center flex-1' : ''}`}>
                                  <h3 className={`font-black text-white tracking-widest uppercase leading-tight line-clamp-3 ${isBig ? 'text-2xl lg:text-3xl' : 'text-[10px] sm:text-xs md:text-sm'}`}>{product.name}</h3>
                                  <div className={`w-12 bg-white/30 rounded-full my-2 ${isBig ? 'h-2' : 'h-1'}`}></div>
                                </div>
                                <div className={`flex flex-col gap-2 ${isBig ? 'mb-4' : ''}`}>
                                   <div className={`bg-white rounded-lg sm:rounded-xl p-1.5 sm:p-2 md:p-3 flex flex-col items-center text-red-600 ${isBig ? 'py-4 lg:py-6' : ''}`}>
                                     <span className={`font-black uppercase tracking-widest opacity-80 mb-1 ${isBig ? 'text-sm' : 'text-[10px]'}`}>Revenue</span>
                                     <span className={`font-black tracking-tight leading-none ${isBig ? 'text-4xl' : 'text-[11px] sm:text-xs md:text-base'}`}>{isBig ? formatCurrency(revTarget) : formatCompactCurrency(revTarget)}</span>
                                   </div>
                                   <div className={`bg-white/10 border border-white/20 rounded-lg sm:rounded-xl p-1.5 sm:p-2 md:p-3 flex flex-col items-center ${isBig ? 'py-3 lg:py-4 mt-2' : ''}`}>
                                     <span className={`text-white/80 font-black uppercase tracking-widest mb-1 ${isBig ? 'text-sm' : 'text-[10px]'}`}>Videos</span>
                                     <span className={`text-white font-black leading-none ${isBig ? 'text-3xl' : 'text-sm sm:text-base md:text-lg'}`}>{vidTarget}</span>
                                   </div>
                                </div>
                             </div>
                           );
                         })}
                       </div>
                     );
                  })()}
               </div>
            </div>
          ) : currentIndex === 8 ? (
            <div className="w-full h-full text-white p-12 flex flex-col items-center justify-center relative overflow-hidden">
               <div className="absolute inset-0 bg-gradient-to-br from-red-600 via-red-800 to-red-950 border-[16px] lg:border-[24px] border-white z-0"></div>
               <div className="relative z-10 w-full flex flex-col items-center max-w-5xl mx-auto h-full justify-center">
                  <div className="flex items-center gap-4 mb-10 shrink-0">
                     <div className="p-3 bg-white rounded-full shrink-0">
                       <Award className="w-8 h-8 text-red-600" />
                     </div>
                     <h2 className="text-2xl md:text-4xl font-black uppercase tracking-tight text-white text-center leading-tight">
                        Product-Wise Top Performer<br /><span className="text-xl md:text-2xl opacity-90 text-red-200">Based on Clicks</span>
                     </h2>
                  </div>
                  
                  <div className="flex-1 w-full grid gap-6">
                     {topPerformersData.map((data, idx) => (
                        <div key={idx} className="bg-red-700/50 rounded-xl p-2 md:p-3 border-2 md:border-4 border-white flex flex-row items-center gap-2 md:gap-3 relative overflow-hidden">
                           <div className="md:w-1/4 flex flex-col pl-4 text-center md:text-left shrink-0">
                              <h3 className="text-lg md:text-xl font-black text-white tracking-widest uppercase leading-tight">{data.productName}</h3>
                              {data.videoLink ? (
                                <a href={data.videoLink} target="_blank" rel="noopener noreferrer" className="text-sm uppercase font-black tracking-widest text-red-200 mt-2 hover:text-white transition-colors flex items-center gap-1 group">
                                  {data.influencerName}
                                  <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </a>
                              ) : (
                                <span className="text-sm uppercase font-black tracking-widest text-red-200 mt-2">{data.influencerName}</span>
                              )}
                           </div>
                           
                           <div className="flex-1 w-full grid grid-cols-2 md:grid-cols-5 gap-3">
                              <div className="bg-white/10 rounded-xl p-3 flex flex-col items-center justify-center border border-white/20">
                                 <span className="text-[10px] uppercase font-black tracking-widest opacity-80 mb-1">Clicks</span>
                                 <span className="text-xl font-black">{data.clicks.toLocaleString()}</span>
                              </div>
                              <div className="bg-white/10 rounded-xl p-3 flex flex-col items-center justify-center border border-white/20">
                                 <span className="text-[10px] uppercase font-black tracking-widest opacity-80 mb-1">Views</span>
                                 <span className="text-xl font-black">{data.views.toLocaleString()}</span>
                              </div>
                              <div className="bg-white/10 rounded-xl p-3 flex flex-col items-center justify-center border border-white/20">
                                 <span className="text-[10px] uppercase font-black tracking-widest opacity-80 mb-1">CTR</span>
                                 <span className="text-xl font-black">{data.ctr}%</span>
                              </div>
                              <div className="bg-white/10 rounded-xl p-3 flex flex-col items-center justify-center border border-white/20">
                                 <span className="text-[10px] uppercase font-black tracking-widest opacity-80 mb-1">CPC</span>
                                 <span className="text-xl font-black">₹{data.cpc.toFixed(2)}</span>
                              </div>
                              <div className="bg-white/10 rounded-xl p-3 flex flex-col items-center justify-center border border-white/20">
                                 <span className="text-[10px] uppercase font-black tracking-widest opacity-80 mb-1">CPV</span>
                                 <span className="text-xl font-black">₹{data.cpv.toFixed(3)}</span>
                              </div>
                           </div>
                        </div>
                     ))}
                  </div>
               </div>
            </div>
          ) : currentIndex === 9 ? (
            <div className="w-full h-full text-white p-12 flex flex-col items-center justify-center relative overflow-hidden">
               <div className="absolute inset-0 bg-gradient-to-br from-red-600 via-red-800 to-red-950 border-[16px] lg:border-[24px] border-white z-0"></div>
               <div className="relative z-10 w-full flex flex-col items-center max-w-6xl mx-auto h-full justify-center">
                  <div className="flex items-center gap-4 mb-10 shrink-0">
                     <div className="p-4 bg-white rounded-full shrink-0">
                       <Target className="w-8 h-8 text-red-600" />
                     </div>
                     <h2 className="text-2xl md:text-4xl font-black uppercase tracking-tight text-white text-center leading-tight">
                        Next Month Influencer Video Planning
                     </h2>
                  </div>
                  
                  <div className="w-full flex-1 overflow-hidden mt-4">
                     <div className="bg-red-700/50 rounded-3xl p-8 border-4 border-white flex flex-col relative w-full h-full text-white">
                        <div className="absolute right-0 top-0 opacity-10">
                           <Target className="w-64 h-64 -mr-16 -mt-16" />
                        </div>
                        {planningNote ? (
                           <div className="relative z-10 whitespace-pre-wrap font-medium text-lg md:text-xl lg:text-2xl leading-relaxed">
                              {planningNote}
                           </div>
                        ) : (
                           <div className="relative z-10 w-full h-full flex items-center justify-center text-center opacity-70">
                              <span className="text-2xl font-black uppercase tracking-widest">No plans written yet for next month.</span>
                           </div>
                        )}
                     </div>
                  </div>
               </div>
            </div>
          ) : (
            <img 
              src={images[currentIndex - 10]} 
              alt={`Slide ${currentIndex}`} 
              className="max-w-full max-h-full object-contain relative z-10"
            />
          )}
          
          {/* Controls */}
          {!isDownloading && (
            <>
              <button 
                onClick={prevSlide}
                disabled={currentIndex === 0}
                className={`absolute z-20 left-4 top-1/2 -translate-y-1/2 p-3 bg-black/50 hover:bg-black/80 text-white rounded-full disabled:opacity-30 transition-all duration-300 ${isSlideShow && !isControlsVisible ? 'opacity-0' : 'opacity-100'}`}
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              
              <button 
                onClick={nextSlide}
                disabled={currentIndex === totalSlides - 1}
                className={`absolute z-20 right-4 top-1/2 -translate-y-1/2 p-3 bg-black/50 hover:bg-black/80 text-white rounded-full disabled:opacity-30 transition-all duration-300 ${isSlideShow && !isControlsVisible ? 'opacity-0' : 'opacity-100'}`}
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </>
          )}

          {currentIndex > 9 && !isSlideShow && !isDownloading && (
            <button 
              onClick={() => removeImage(currentIndex - 10)}
              className="absolute z-20 top-4 right-4 p-2 bg-primary-500/80 hover:bg-primary-600 text-white rounded-full transition-all"
              title="Remove Slide"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          {!isDownloading && (
            <div className={`absolute z-20 bottom-4 left-0 right-0 flex justify-center gap-2 transition-all duration-300 ${isSlideShow && !isControlsVisible ? 'opacity-0' : 'opacity-100'}`}>
                {Array.from({ length: totalSlides }).map((_, idx) => (
                  <button 
                    key={idx}
                    onClick={() => setCurrentIndex(idx)}
                    className={`w-2.5 h-2.5 rounded-full transition-all ${currentIndex === idx ? 'bg-white scale-125' : 'bg-white/40 hover:bg-white/60'}`}
                  />
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
