import React, { useState, useRef, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import {
  FileSpreadsheet,
  Upload,
  Download,
  Plus,
  Trash2,
  Search,
  Edit2,
  Check,
  X,
  Copy,
  Undo2,
  RotateCcw,
  FileDown,
  Layers,
  ArrowRight,
  Maximize2,
  Minimize2,
  Info,
  Sparkles,
  AlertCircle,
  Filter,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  CheckSquare,
  Square,
  FilterX
} from 'lucide-react';
import { globalToast } from '../lib/toast';

export interface ColumnFilterConfig {
  textQuery?: string;
  selectedValues?: string[];
  condition?: 'all' | 'blanks' | 'non-blanks';
}

export interface ColumnSortConfig {
  colIdx: number;
  direction: 'asc' | 'desc';
}

export interface ExcelSheetData {
  name: string;
  headers: string[];
  rows: (string | number)[][];
}

interface ExcelExtractorEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadIntoAnalyzer?: (matrix: any[][], sourceName: string) => void;
  initialFile?: File | null;
}

export const ExcelExtractorEditorModal: React.FC<ExcelExtractorEditorModalProps> = ({
  isOpen,
  onClose,
  onLoadIntoAnalyzer,
  initialFile
}) => {
  const [fileName, setFileName] = useState<string>('Untitled Workbook.xlsx');
  const [fileSize, setFileSize] = useState<string>('');
  const [sheets, setSheets] = useState<ExcelSheetData[]>([]);
  const [activeSheetIndex, setActiveSheetIndex] = useState<number>(0);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isFullScreen, setIsFullScreen] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Cell editing state
  const [editingCell, setEditingCell] = useState<{ rowIdx: number; colIdx: number } | null>(null);
  const [editingValue, setEditingValue] = useState<string>('');

  // Column header editing
  const [editingColIdx, setEditingColIdx] = useState<number | null>(null);
  const [editingColName, setEditingColName] = useState<string>('');

  // Sheet name editing
  const [editingSheetIdx, setEditingSheetIdx] = useState<number | null>(null);
  const [editingSheetName, setEditingSheetName] = useState<string>('');

  // Add column modal / popover
  const [newColName, setNewColName] = useState<string>('');
  const [showAddColInput, setShowAddColInput] = useState<boolean>(false);

  // Column Filters & Sorting State
  const [columnFilters, setColumnFilters] = useState<Record<number, ColumnFilterConfig>>({});
  const [columnSort, setColumnSort] = useState<ColumnSortConfig | null>(null);
  const [activeFilterColIdx, setActiveFilterColIdx] = useState<number | null>(null);
  const [filterValuesSearch, setFilterValuesSearch] = useState<string>('');
  const [showQuickFilterRow, setShowQuickFilterRow] = useState<boolean>(false);
  const filterPopoverRef = useRef<HTMLDivElement>(null);

  // Undo history for current sheet
  const [history, setHistory] = useState<ExcelSheetData[][]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingCell && editInputRef.current) {
      editInputRef.current.focus();
    }
  }, [editingCell]);

  // Close filter popover on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        filterPopoverRef.current &&
        !filterPopoverRef.current.contains(event.target as Node)
      ) {
        setActiveFilterColIdx(null);
        setFilterValuesSearch('');
      }
    };
    if (activeFilterColIdx !== null) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [activeFilterColIdx]);

  // Handle initialFile prop if passed
  useEffect(() => {
    if (initialFile && isOpen) {
      parseExcelFile(initialFile);
    }
  }, [initialFile, isOpen]);

  // Push snapshot to undo history before modifying
  const pushHistory = (newSheetsState: ExcelSheetData[]) => {
    setHistory(prev => [...prev.slice(-15), sheets]);
    setSheets(newSheetsState);
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    setHistory(prev => prev.slice(0, prev.length - 1));
    setSheets(previous);
    globalToast.info('Reverted last edit.');
  };

  // Parse Excel file or CSV
  const parseExcelFile = async (file: File) => {
    setIsLoading(true);
    try {
      setFileName(file.name);
      setFileSize((file.size / 1024).toFixed(1) + ' KB');

      const ext = file.name.split('.').pop()?.toLowerCase() || '';

      if (ext === 'csv' || ext === 'tsv' || ext === 'txt') {
        const text = await file.text();
        const parsed = Papa.parse(text, { skipEmptyLines: false });
        const rawRows = (parsed.data as any[][]) || [];
        if (rawRows.length === 0) {
          throw new Error('File appears to be empty.');
        }

        const headers = (rawRows[0] || []).map((h, i) => (h ? String(h).trim() : `Column ${i + 1}`));
        const bodyRows = rawRows.slice(1).map(r => {
          const rowArr: (string | number)[] = [];
          for (let c = 0; c < headers.length; c++) {
            rowArr.push(r[c] !== undefined && r[c] !== null ? r[c] : '');
          }
          return rowArr;
        });

        const sheet: ExcelSheetData = {
          name: file.name.replace(/\.[^/.]+$/, '') || 'Sheet1',
          headers,
          rows: bodyRows
        };
        setSheets([sheet]);
        setActiveSheetIndex(0);
        setHistory([]);
        globalToast.success(`Extracted ${bodyRows.length} rows from ${file.name}`);
      } else {
        // Parse with XLSX
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
        
        if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
          throw new Error('No worksheets found in this Excel file.');
        }

        const extractedSheets: ExcelSheetData[] = [];

        workbook.SheetNames.forEach(sheetName => {
          const worksheet = workbook.Sheets[sheetName];
          if (!worksheet) return;

          // Convert sheet to array of arrays (AOA)
          const aoa: any[][] = XLSX.utils.sheet_to_json(worksheet, {
            header: 1,
            defval: '',
            blankrows: false
          });

          if (!aoa || aoa.length === 0) {
            extractedSheets.push({
              name: sheetName,
              headers: ['Column 1', 'Column 2', 'Column 3'],
              rows: []
            });
            return;
          }

          // Determine max columns
          let maxCols = 1;
          aoa.forEach(r => {
            if (Array.isArray(r) && r.length > maxCols) maxCols = r.length;
          });

          // Header row is row 0
          const rawHeader = aoa[0] || [];
          const headers: string[] = [];
          for (let c = 0; c < maxCols; c++) {
            const hVal = rawHeader[c];
            headers.push(hVal !== undefined && String(hVal).trim() !== '' ? String(hVal).trim() : `Column ${c + 1}`);
          }

          // Body rows
          const bodyRows: (string | number)[][] = aoa.slice(1).map(r => {
            const row: (string | number)[] = [];
            for (let c = 0; c < maxCols; c++) {
              let val = r[c];
              if (val instanceof Date) {
                const d = String(val.getDate()).padStart(2, '0');
                const m = String(val.getMonth() + 1).padStart(2, '0');
                const y = val.getFullYear();
                val = `${d}/${m}/${y}`;
              }
              row.push(val !== undefined && val !== null ? val : '');
            }
            return row;
          });

          extractedSheets.push({
            name: sheetName,
            headers,
            rows: bodyRows
          });
        });

        if (extractedSheets.length === 0) {
          throw new Error('Could not extract any data rows from the sheets.');
        }

        setSheets(extractedSheets);
        setActiveSheetIndex(0);
        setHistory([]);
        setColumnFilters({});
        setColumnSort(null);
        setActiveFilterColIdx(null);
        const totalRows = extractedSheets.reduce((acc, s) => acc + s.rows.length, 0);
        globalToast.success(`Extracted ${extractedSheets.length} sheet(s) with ${totalRows} total records from ${file.name}!`);
      }
    } catch (err: any) {
      console.error('Excel extraction error:', err);
      globalToast.error(err.message || 'Failed to extract Excel data.');
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseExcelFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) parseExcelFile(file);
  };

  const activeSheet = sheets[activeSheetIndex] || null;

  // Check if a specific column has active filter criteria
  const isColumnFiltered = (colIdx: number) => {
    const filter = columnFilters[colIdx];
    if (!filter) return false;
    if (filter.textQuery && filter.textQuery.trim() !== '') return true;
    if (filter.condition && filter.condition !== 'all') return true;
    if (filter.selectedValues !== undefined) return true;
    return false;
  };

  // Total count of active filters across all columns + sorting
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    Object.keys(columnFilters).forEach(key => {
      if (isColumnFiltered(Number(key))) count++;
    });
    if (columnSort) count++;
    return count;
  }, [columnFilters, columnSort]);

  // Clear all column filters & sorting
  const handleClearAllFilters = () => {
    setColumnFilters({});
    setColumnSort(null);
    setSearchTerm('');
    globalToast.info('All filters and sorts cleared.');
  };

  // Clear filter for single column
  const handleClearSingleColumnFilter = (colIdx: number) => {
    setColumnFilters(prev => {
      const next = { ...prev };
      delete next[colIdx];
      return next;
    });
    if (columnSort?.colIdx === colIdx) {
      setColumnSort(null);
    }
  };

  // Update text query for single column
  const handleSetColumnTextFilter = (colIdx: number, textQuery: string) => {
    setColumnFilters(prev => {
      const current = prev[colIdx] || {};
      if (!textQuery && !current.condition && current.selectedValues === undefined) {
        const next = { ...prev };
        delete next[colIdx];
        return next;
      }
      return {
        ...prev,
        [colIdx]: {
          ...current,
          textQuery: textQuery || undefined
        }
      };
    });
  };

  // Update condition ('all' | 'blanks' | 'non-blanks')
  const handleSetColumnCondition = (colIdx: number, condition: 'all' | 'blanks' | 'non-blanks') => {
    setColumnFilters(prev => {
      const current = prev[colIdx] || {};
      return {
        ...prev,
        [colIdx]: {
          ...current,
          condition
        }
      };
    });
  };

  // Toggle sorting for a column
  const handleToggleColumnSort = (colIdx: number, direction: 'asc' | 'desc') => {
    if (columnSort?.colIdx === colIdx && columnSort.direction === direction) {
      setColumnSort(null);
    } else {
      setColumnSort({ colIdx, direction });
    }
  };

  // Calculate unique values and their frequencies for a column
  const getUniqueColumnValues = (colIdx: number) => {
    if (!activeSheet) return [];
    const countsMap = new Map<string, number>();

    activeSheet.rows.forEach(r => {
      const val = r[colIdx];
      const strVal = val === undefined || val === null || String(val).trim() === '' ? '(Blanks)' : String(val);
      countsMap.set(strVal, (countsMap.get(strVal) || 0) + 1);
    });

    const list = Array.from(countsMap.entries()).map(([value, count]) => ({
      value,
      count,
      isBlank: value === '(Blanks)'
    }));

    list.sort((a, b) => {
      if (a.isBlank) return -1;
      if (b.isBlank) return 1;
      return a.value.localeCompare(b.value, undefined, { numeric: true, sensitivity: 'base' });
    });

    return list;
  };

  // Toggle single value selection in checklist
  const handleToggleValueSelection = (colIdx: number, val: string, allPossibleVals: string[]) => {
    setColumnFilters(prev => {
      const current = prev[colIdx] || {};
      const currentSelected = current.selectedValues ?? allPossibleVals;
      let nextSelected: string[];

      if (currentSelected.includes(val)) {
        nextSelected = currentSelected.filter(v => v !== val);
      } else {
        nextSelected = [...currentSelected, val];
      }

      if (nextSelected.length === allPossibleVals.length) {
        return {
          ...prev,
          [colIdx]: {
            ...current,
            selectedValues: undefined
          }
        };
      }

      return {
        ...prev,
        [colIdx]: {
          ...current,
          selectedValues: nextSelected
        }
      };
    });
  };

  // Select all or deselect all values in checklist
  const handleSelectAllValues = (colIdx: number, selectAll: boolean, allPossibleVals: string[]) => {
    setColumnFilters(prev => {
      const current = prev[colIdx] || {};
      return {
        ...prev,
        [colIdx]: {
          ...current,
          selectedValues: selectAll ? undefined : []
        }
      };
    });
  };

  // Filtered and sorted rows based on global search, column filters, and column sorting
  const filteredRows = useMemo(() => {
    if (!activeSheet) return [];

    let rowsWithIndex = activeSheet.rows.map((row, idx) => ({ row, originalIndex: idx }));

    // Global table search
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      rowsWithIndex = rowsWithIndex.filter(({ row }) =>
        row.some(cell => String(cell ?? '').toLowerCase().includes(term))
      );
    }

    // Column-specific filters
    const filterEntries = Object.entries(columnFilters);
    if (filterEntries.length > 0) {
      rowsWithIndex = rowsWithIndex.filter(({ row }) => {
        for (const [colIdxStr, cfg] of filterEntries) {
          const colIdx = Number(colIdxStr);
          const cellRaw = row[colIdx];
          const cellStr = cellRaw !== undefined && cellRaw !== null ? String(cellRaw) : '';
          const isBlank = cellStr.trim() === '';

          // 1. Condition check (blanks vs non-blanks)
          if (cfg.condition === 'blanks' && !isBlank) return false;
          if (cfg.condition === 'non-blanks' && isBlank) return false;

          // 2. Text query check
          if (cfg.textQuery && cfg.textQuery.trim() !== '') {
            const query = cfg.textQuery.toLowerCase().trim();
            if (!cellStr.toLowerCase().includes(query)) return false;
          }

          // 3. Selected values checklist
          if (cfg.selectedValues !== undefined) {
            const normVal = isBlank ? '(Blanks)' : cellStr;
            if (!cfg.selectedValues.includes(normVal)) return false;
          }
        }
        return true;
      });
    }

    // Column sorting
    if (columnSort) {
      const { colIdx, direction } = columnSort;
      rowsWithIndex.sort((a, b) => {
        const valA = a.row[colIdx];
        const valB = b.row[colIdx];

        const isBlankA = valA === undefined || valA === null || String(valA).trim() === '';
        const isBlankB = valB === undefined || valB === null || String(valB).trim() === '';

        if (isBlankA && isBlankB) return 0;
        if (isBlankA) return 1;
        if (isBlankB) return -1;

        const numA = Number(valA);
        const numB = Number(valB);
        if (!isNaN(numA) && !isNaN(numB) && typeof valA !== 'boolean' && typeof valB !== 'boolean') {
          return direction === 'asc' ? numA - numB : numB - numA;
        }

        const comp = String(valA).localeCompare(String(valB), undefined, { numeric: true, sensitivity: 'base' });
        return direction === 'asc' ? comp : -comp;
      });
    }

    return rowsWithIndex;
  }, [activeSheet, searchTerm, columnFilters, columnSort]);

  // Cell editing handlers
  const startEditingCell = (rowIdx: number, colIdx: number, currentVal: any) => {
    setEditingCell({ rowIdx, colIdx });
    setEditingValue(String(currentVal ?? ''));
  };

  const saveCellEdit = () => {
    if (!editingCell || !activeSheet) return;
    const { rowIdx, colIdx } = editingCell;
    const currentVal = activeSheet.rows[rowIdx]?.[colIdx];
    if (String(currentVal ?? '') === editingValue) {
      setEditingCell(null);
      return;
    }

    const updatedSheets = sheets.map((sh, sIdx) => {
      if (sIdx !== activeSheetIndex) return sh;
      const updatedRows = [...sh.rows];
      const targetRow = [...(updatedRows[rowIdx] || [])];
      targetRow[colIdx] = editingValue;
      updatedRows[rowIdx] = targetRow;
      return { ...sh, rows: updatedRows };
    });

    pushHistory(updatedSheets);
    setEditingCell(null);
  };

  // Column operations
  const handleAddColumn = () => {
    if (!activeSheet) return;
    const colTitle = newColName.trim() || `Column ${activeSheet.headers.length + 1}`;
    const updatedSheets = sheets.map((sh, sIdx) => {
      if (sIdx !== activeSheetIndex) return sh;
      const newHeaders = [...sh.headers, colTitle];
      const newRows = sh.rows.map(r => [...r, '']);
      return { ...sh, headers: newHeaders, rows: newRows };
    });
    pushHistory(updatedSheets);
    setNewColName('');
    setShowAddColInput(false);
    globalToast.success(`Added column "${colTitle}"`);
  };

  const handleDeleteColumn = (colIdx: number) => {
    if (!activeSheet || activeSheet.headers.length <= 1) {
      globalToast.error('A sheet must have at least one column.');
      return;
    }
    const colName = activeSheet.headers[colIdx];
    const updatedSheets = sheets.map((sh, sIdx) => {
      if (sIdx !== activeSheetIndex) return sh;
      const newHeaders = sh.headers.filter((_, i) => i !== colIdx);
      const newRows = sh.rows.map(r => r.filter((_, i) => i !== colIdx));
      return { ...sh, headers: newHeaders, rows: newRows };
    });
    pushHistory(updatedSheets);
    globalToast.info(`Deleted column "${colName}"`);
  };

  const saveColumnName = (colIdx: number) => {
    if (!activeSheet) return;
    const finalName = editingColName.trim() || activeSheet.headers[colIdx];
    const updatedSheets = sheets.map((sh, sIdx) => {
      if (sIdx !== activeSheetIndex) return sh;
      const newHeaders = [...sh.headers];
      newHeaders[colIdx] = finalName;
      return { ...sh, headers: newHeaders };
    });
    pushHistory(updatedSheets);
    setEditingColIdx(null);
  };

  // Row operations
  const handleAddRow = (atTop = false) => {
    if (!activeSheet) return;
    const blankRow: (string | number)[] = new Array(activeSheet.headers.length).fill('');
    const updatedSheets = sheets.map((sh, sIdx) => {
      if (sIdx !== activeSheetIndex) return sh;
      const newRows = atTop ? [blankRow, ...sh.rows] : [...sh.rows, blankRow];
      return { ...sh, rows: newRows };
    });
    pushHistory(updatedSheets);
    globalToast.success(atTop ? 'Added blank row at top' : 'Added blank row at bottom');
  };

  const handleDeleteRow = (originalRowIdx: number) => {
    if (!activeSheet) return;
    const updatedSheets = sheets.map((sh, sIdx) => {
      if (sIdx !== activeSheetIndex) return sh;
      const newRows = sh.rows.filter((_, idx) => idx !== originalRowIdx);
      return { ...sh, rows: newRows };
    });
    pushHistory(updatedSheets);
    globalToast.info('Row deleted');
  };

  const handleDuplicateRow = (originalRowIdx: number) => {
    if (!activeSheet) return;
    const targetRow = activeSheet.rows[originalRowIdx];
    if (!targetRow) return;
    const updatedSheets = sheets.map((sh, sIdx) => {
      if (sIdx !== activeSheetIndex) return sh;
      const newRows = [...sh.rows];
      newRows.splice(originalRowIdx + 1, 0, [...targetRow]);
      return { ...sh, rows: newRows };
    });
    pushHistory(updatedSheets);
    globalToast.success('Row duplicated');
  };

  // Sheet management
  const handleAddSheet = () => {
    const newName = `Sheet${sheets.length + 1}`;
    const newSheet: ExcelSheetData = {
      name: newName,
      headers: ['Column 1', 'Column 2', 'Column 3', 'Column 4'],
      rows: [['', '', '', '']]
    };
    const updated = [...sheets, newSheet];
    pushHistory(updated);
    setActiveSheetIndex(sheets.length);
    globalToast.success(`Added new sheet "${newName}"`);
  };

  const handleDeleteSheet = (idx: number) => {
    if (sheets.length <= 1) {
      globalToast.error('Workbook must contain at least one sheet.');
      return;
    }
    const targetName = sheets[idx].name;
    const updated = sheets.filter((_, i) => i !== idx);
    pushHistory(updated);
    setActiveSheetIndex(Math.max(0, idx - 1));
    globalToast.info(`Deleted sheet "${targetName}"`);
  };

  const saveSheetName = (idx: number) => {
    const finalName = editingSheetName.trim() || sheets[idx].name;
    const updated = sheets.map((s, i) => (i === idx ? { ...s, name: finalName } : s));
    pushHistory(updated);
    setEditingSheetIdx(null);
  };

  // Export as edited Excel workbook (.xlsx)
  const handleExportXlsx = () => {
    if (sheets.length === 0) {
      globalToast.error('No sheet data to export.');
      return;
    }

    try {
      const wb = XLSX.utils.book_new();
      sheets.forEach(sh => {
        const fullAoa = [sh.headers, ...sh.rows];
        const ws = XLSX.utils.aoa_to_sheet(fullAoa);
        XLSX.utils.book_append_sheet(wb, ws, sh.name.slice(0, 31)); // Excel limit is 31 chars
      });

      const exportFileName = fileName.replace(/\.[^/.]+$/, '') + '_edited.xlsx';
      XLSX.writeFile(wb, exportFileName);
      globalToast.success(`Downloaded "${exportFileName}" with all sheets!`);
    } catch (err: any) {
      console.error('Export error:', err);
      globalToast.error('Failed to export Excel file.');
    }
  };

  // Export active sheet as CSV
  const handleExportCsv = () => {
    if (!activeSheet) return;
    try {
      const fullAoa = [activeSheet.headers, ...activeSheet.rows];
      const csvStr = Papa.unparse(fullAoa);
      const blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${activeSheet.name}_extracted.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      globalToast.success(`Exported "${activeSheet.name}" as CSV!`);
    } catch (err) {
      globalToast.error('Failed to export CSV.');
    }
  };

  // Copy table to clipboard (TSV format, ready for pasting into Excel / Sheets)
  const handleCopyTsv = () => {
    if (!activeSheet) return;
    const fullAoa = [activeSheet.headers, ...activeSheet.rows];
    const tsv = fullAoa.map(row => row.join('\t')).join('\n');
    navigator.clipboard.writeText(tsv).then(() => {
      globalToast.success(`Copied ${activeSheet.rows.length + 1} rows to clipboard! Ready to paste into Excel or Google Sheets.`);
    }).catch(() => {
      globalToast.error('Clipboard copy failed.');
    });
  };

  // Load active sheet into Data Analyzer
  const handleLoadActiveSheetIntoAnalyzer = () => {
    if (!activeSheet) return;
    if (onLoadIntoAnalyzer) {
      const fullAoa = [activeSheet.headers, ...activeSheet.rows];
      onLoadIntoAnalyzer(fullAoa, `${fileName} [${activeSheet.name}]`);
      globalToast.success(`Loaded "${activeSheet.name}" into Universal Data Analyzer!`);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-md p-2 sm:p-4 animate-in fade-in duration-200">
      <div
        className={`bg-slate-900 border border-emerald-500/30 rounded-3xl shadow-2xl flex flex-col overflow-hidden text-slate-100 transition-all ${
          isFullScreen ? 'w-full h-full rounded-none' : 'max-w-7xl w-full h-[92vh]'
        }`}
      >
        {/* Top Header */}
        <div className="bg-gradient-to-r from-slate-950 via-emerald-950/60 to-slate-950 border-b border-emerald-500/20 px-5 py-3.5 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 bg-gradient-to-tr from-emerald-500 to-teal-600 rounded-2xl shadow-lg shadow-emerald-500/20 shrink-0">
              <FileSpreadsheet className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base sm:text-lg font-black text-white tracking-tight flex items-center gap-1.5 truncate">
                  <span>Excel File Extractor and Editor</span>
                </h3>
                <span className="bg-emerald-500/20 text-emerald-300 text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-full border border-emerald-400/30">
                  Universal Spreadsheet Engine
                </span>
              </div>
              <p className="text-[11px] text-slate-400 truncate flex items-center gap-2 mt-0.5">
                <span>File: <strong className="text-white font-mono">{fileName}</strong></span>
                {fileSize && <span>• {fileSize}</span>}
                {sheets.length > 0 && <span>• {sheets.length} Sheet(s) extracted</span>}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Hidden File Input */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.xlsm,.csv,.tsv,.ods,.txt"
              onChange={handleFileChange}
              className="hidden"
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3 py-1.5 rounded-xl shadow-md transition cursor-pointer"
              title="Upload and extract any Excel or CSV file"
            >
              <Upload className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Open Excel File</span>
            </button>

            {history.length > 0 && (
              <button
                type="button"
                onClick={handleUndo}
                className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-400/30 text-xs font-bold px-2.5 py-1.5 rounded-xl transition cursor-pointer"
                title="Undo last edit"
              >
                <Undo2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Undo</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsFullScreen(!isFullScreen)}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition cursor-pointer"
              title={isFullScreen ? 'Exit Full Screen' : 'Full Screen'}
            >
              {isFullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 bg-slate-800 hover:bg-rose-900/80 text-slate-300 hover:text-white rounded-xl transition cursor-pointer"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* If no sheets loaded, show Drag & Drop Upload Portal */}
        {sheets.length === 0 ? (
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`flex-1 flex flex-col items-center justify-center p-8 text-center transition-all m-4 sm:m-8 rounded-3xl border-2 border-dashed ${
              isDragging ? 'border-emerald-400 bg-emerald-950/20 scale-[1.01]' : 'border-slate-700 hover:border-emerald-500/50 bg-slate-950/50'
            }`}
          >
            <div className="max-w-md mx-auto space-y-4">
              <div className="p-4 bg-emerald-500/10 text-emerald-400 rounded-2xl w-fit mx-auto border border-emerald-500/20 shadow-xl">
                <FileSpreadsheet className="w-12 h-12 animate-pulse" />
              </div>
              <h4 className="text-xl font-black text-white">Extract & Edit Any Excel File</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Drop your <strong className="text-emerald-400">.xlsx, .xls, .xlsm, .csv</strong> file here to extract all worksheets, headers, and rows into an interactive editable spreadsheet table.
              </p>

              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold text-xs sm:text-sm px-6 py-3 rounded-xl shadow-lg shadow-emerald-500/20 transition cursor-pointer transform hover:scale-105"
                >
                  <Upload className="w-4 h-4" /> Browse Excel File
                </button>
              </div>

              <div className="text-[11px] text-slate-500 pt-3">
                Full multi-sheet support • In-grid cell editing • Row & Column management • XLSX Export • Direct Analyzer loading
              </div>
            </div>
          </div>
        ) : (
          /* Active Spreadsheet Workspace */
          <div className="flex-1 flex flex-col min-h-0 bg-slate-950">
            {/* Sheet Tabs Bar */}
            <div className="bg-slate-900/90 border-b border-slate-800 px-4 pt-2.5 flex items-center justify-between gap-2 overflow-x-auto shrink-0 scrollbar-thin">
              <div className="flex items-center gap-1.5 min-w-0 flex-nowrap">
                {sheets.map((sh, idx) => (
                  <div
                    key={idx}
                    onClick={() => {
                      setActiveSheetIndex(idx);
                      setActiveFilterColIdx(null);
                      setColumnFilters({});
                      setColumnSort(null);
                    }}
                    className={`group px-3 py-1.5 rounded-t-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer border-t border-l border-r shrink-0 ${
                      activeSheetIndex === idx
                        ? 'bg-slate-950 text-emerald-400 border-emerald-500/40 shadow-sm'
                        : 'bg-slate-900/70 text-slate-400 hover:text-slate-200 border-slate-800 hover:bg-slate-800'
                    }`}
                  >
                    <Layers className={`w-3.5 h-3.5 ${activeSheetIndex === idx ? 'text-emerald-400' : 'text-slate-500'}`} />
                    {editingSheetIdx === idx ? (
                      <input
                        type="text"
                        value={editingSheetName}
                        onChange={e => setEditingSheetName(e.target.value)}
                        onBlur={() => saveSheetName(idx)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') saveSheetName(idx);
                          if (e.key === 'Escape') setEditingSheetIdx(null);
                        }}
                        autoFocus
                        className="bg-slate-800 text-white text-xs px-1.5 py-0.5 rounded border border-emerald-400 outline-none w-24"
                        onClick={e => e.stopPropagation()}
                      />
                    ) : (
                      <span
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          setEditingSheetIdx(idx);
                          setEditingSheetName(sh.name);
                        }}
                        title="Double-click to rename sheet"
                      >
                        {sh.name}
                      </span>
                    )}

                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-400">
                      {sh.rows.length}
                    </span>

                    {sheets.length > 1 && (
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          handleDeleteSheet(idx);
                        }}
                        className="text-slate-500 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition p-0.5 rounded"
                        title="Delete Sheet"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}

                <button
                  type="button"
                  onClick={handleAddSheet}
                  className="px-2 py-1.5 rounded-t-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-emerald-300 border-t border-l border-r border-slate-800 transition cursor-pointer flex items-center gap-1 shrink-0"
                  title="Add new worksheet"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span className="text-[11px]">New Sheet</span>
                </button>
              </div>

              {/* Sheet Stats */}
              <div className="hidden md:flex items-center gap-3 text-[11px] text-slate-400 pb-1.5 shrink-0">
                <span>Rows: <strong className="text-white font-mono">{activeSheet?.rows.length ?? 0}</strong></span>
                <span>Cols: <strong className="text-white font-mono">{activeSheet?.headers.length ?? 0}</strong></span>
              </div>
            </div>

            {/* Toolbar: Search, Add Row, Add Col, Exports, Load into Analyzer */}
            <div className="bg-slate-900/60 border-b border-slate-800 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shrink-0">
              {/* Left: Search & Row/Col Actions */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-52 sm:w-64">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    placeholder="Search in active sheet..."
                    className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-xl pl-8 pr-7 py-1.5 focus:border-emerald-500 focus:outline-none"
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => setSearchTerm('')}
                      className="absolute right-2 top-2 text-slate-400 hover:text-slate-200"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="h-4 w-px bg-slate-800 hidden sm:block" />

                {/* Toggle Quick Filter Row */}
                <button
                  type="button"
                  onClick={() => setShowQuickFilterRow(!showQuickFilterRow)}
                  className={`flex items-center gap-1.5 text-xs font-bold px-2.5 py-1.5 rounded-xl border transition cursor-pointer shadow-xs ${
                    showQuickFilterRow
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-emerald-500/10'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                  }`}
                  title="Toggle instant column filter inputs"
                >
                  <Filter className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Filter Row</span>
                </button>

                {/* Active Filters Indicator with Reset */}
                {activeFiltersCount > 0 && (
                  <div className="flex items-center gap-1.5 bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 px-2.5 py-1 rounded-xl text-xs font-medium">
                    <span className="font-semibold text-emerald-200">
                      {activeFiltersCount} filter{activeFiltersCount > 1 ? 's' : ''}
                    </span>
                    <button
                      type="button"
                      onClick={handleClearAllFilters}
                      className="ml-1 text-slate-400 hover:text-rose-300 flex items-center gap-1 text-[11px] cursor-pointer hover:underline"
                      title="Clear all column filters and sorts"
                    >
                      <FilterX className="w-3 h-3 text-rose-400" />
                      <span>Reset</span>
                    </button>
                  </div>
                )}

                <div className="h-4 w-px bg-slate-800 hidden sm:block" />

                <button
                  type="button"
                  onClick={() => handleAddRow(false)}
                  className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold px-2.5 py-1.5 rounded-xl border border-slate-700 transition cursor-pointer shadow-xs"
                  title="Add empty row at bottom of sheet"
                >
                  <Plus className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Row</span>
                </button>

                {showAddColInput ? (
                  <div className="flex items-center gap-1 bg-slate-800 px-2 py-1 rounded-xl border border-emerald-500/40">
                    <input
                      type="text"
                      value={newColName}
                      onChange={e => setNewColName(e.target.value)}
                      placeholder="Column name..."
                      autoFocus
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleAddColumn();
                        if (e.key === 'Escape') setShowAddColInput(false);
                      }}
                      className="bg-slate-950 text-white text-xs px-2 py-0.5 rounded border border-slate-700 outline-none w-28"
                    />
                    <button
                      type="button"
                      onClick={handleAddColumn}
                      className="p-1 text-emerald-400 hover:text-emerald-300"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAddColInput(false)}
                      className="p-1 text-slate-400 hover:text-slate-200"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowAddColInput(true)}
                    className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold px-2.5 py-1.5 rounded-xl border border-slate-700 transition cursor-pointer shadow-xs"
                    title="Add new column to sheet"
                  >
                    <Plus className="w-3.5 h-3.5 text-teal-400" />
                    <span>Column</span>
                  </button>
                )}
              </div>

              {/* Right: Export & Analyzer Integration Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyTsv}
                  className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold px-3 py-1.5 rounded-xl border border-slate-700 transition cursor-pointer"
                  title="Copy active sheet as table to paste in Excel/Sheets"
                >
                  <Copy className="w-3.5 h-3.5 text-slate-400" />
                  <span className="hidden sm:inline">Copy Table</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold px-3 py-1.5 rounded-xl border border-slate-700 transition cursor-pointer"
                  title="Export active sheet as CSV"
                >
                  <FileDown className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="hidden sm:inline">CSV</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportXlsx}
                  className="flex items-center gap-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold px-3.5 py-1.5 rounded-xl shadow-md transition cursor-pointer"
                  title="Download edited workbook (.xlsx) with all sheets"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Excel (.xlsx)</span>
                </button>

                {onLoadIntoAnalyzer && (
                  <button
                    type="button"
                    onClick={handleLoadActiveSheetIntoAnalyzer}
                    className="flex items-center gap-1.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-bold px-3.5 py-1.5 rounded-xl shadow-md hover:shadow-cyan-500/20 transition cursor-pointer"
                    title="Load this edited sheet directly into the main Data Analyzer workspace for metrics & funnel tracking"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-cyan-200" />
                    <span>Load into Data Analyzer</span>
                  </button>
                )}
              </div>
            </div>

            {/* Table Area */}
            <div className="flex-1 overflow-auto bg-slate-950 p-2 sm:p-4">
              {activeSheet && activeSheet.headers.length > 0 ? (
                <div className="border border-slate-800 rounded-2xl overflow-hidden shadow-2xl bg-slate-900/40">
                  <table className="w-full text-left text-xs text-slate-300 border-collapse">
                    <thead>
                      <tr className="bg-slate-900/90 border-b border-slate-800 sticky top-0 z-10">
                        {/* Row index header */}
                        <th className="py-2.5 px-3 font-mono font-bold text-slate-500 text-[10px] uppercase text-center w-12 border-r border-slate-800 shrink-0">
                          #
                        </th>

                        {/* Column Headers */}
                        {activeSheet.headers.map((colName, colIdx) => {
                          const isFiltered = isColumnFiltered(colIdx);
                          const isSorted = columnSort?.colIdx === colIdx;
                          const isPopoverOpen = activeFilterColIdx === colIdx;
                          const filterConfig = columnFilters[colIdx] || {};

                          return (
                            <th
                              key={colIdx}
                              className={`py-2.5 px-3 font-black text-slate-200 text-xs border-r border-slate-800 relative group/col min-w-[170px] ${
                                isFiltered ? 'bg-emerald-950/20' : ''
                              }`}
                            >
                              {editingColIdx === colIdx ? (
                                <div className="flex items-center gap-1">
                                  <input
                                    type="text"
                                    value={editingColName}
                                    onChange={e => setEditingColName(e.target.value)}
                                    onBlur={() => saveColumnName(colIdx)}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') saveColumnName(colIdx);
                                      if (e.key === 'Escape') setEditingColIdx(null);
                                    }}
                                    autoFocus
                                    className="w-full bg-slate-950 text-emerald-400 text-xs px-2 py-0.5 rounded border border-emerald-400 outline-none"
                                  />
                                </div>
                              ) : (
                                <div className="flex items-center justify-between gap-1.5">
                                  <div
                                    className="flex items-center gap-1 min-w-0 cursor-pointer hover:text-emerald-400 transition"
                                    onDoubleClick={() => {
                                      setEditingColIdx(colIdx);
                                      setEditingColName(colName);
                                    }}
                                    onClick={() => {
                                      setActiveFilterColIdx(isPopoverOpen ? null : colIdx);
                                      setFilterValuesSearch('');
                                    }}
                                    title="Click to filter/sort column • Double click to rename"
                                  >
                                    <span className="truncate">{colName}</span>
                                    {isSorted && (
                                      <span className="text-emerald-400 shrink-0" title={`Sorted ${columnSort?.direction === 'asc' ? 'Ascending' : 'Descending'}`}>
                                        {columnSort?.direction === 'asc' ? (
                                          <ArrowUp className="w-3.5 h-3.5" />
                                        ) : (
                                          <ArrowDown className="w-3.5 h-3.5" />
                                        )}
                                      </span>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-1 shrink-0">
                                    {/* Filter Button */}
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setActiveFilterColIdx(isPopoverOpen ? null : colIdx);
                                        setFilterValuesSearch('');
                                      }}
                                      className={`p-1 rounded-md transition cursor-pointer flex items-center justify-center ${
                                        isFiltered
                                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 shadow-xs'
                                          : isPopoverOpen
                                          ? 'bg-slate-700 text-white'
                                          : 'text-slate-400 hover:text-white hover:bg-slate-800 opacity-70 group-hover/col:opacity-100'
                                      }`}
                                      title={`Filter & sort column "${colName}"`}
                                    >
                                      <Filter className="w-3.5 h-3.5" />
                                    </button>

                                    {/* Rename Column Button */}
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingColIdx(colIdx);
                                        setEditingColName(colName);
                                      }}
                                      className="p-1 text-slate-400 hover:text-emerald-400 rounded opacity-0 group-hover/col:opacity-100 transition"
                                      title="Rename column"
                                    >
                                      <Edit2 className="w-3 h-3" />
                                    </button>

                                    {/* Delete Column Button */}
                                    {activeSheet.headers.length > 1 && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleDeleteColumn(colIdx);
                                        }}
                                        className="p-1 text-slate-400 hover:text-rose-400 rounded opacity-0 group-hover/col:opacity-100 transition"
                                        title="Delete column"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* Column Filter Popover */}
                              {isPopoverOpen && (
                                <div
                                  ref={filterPopoverRef}
                                  onClick={(e) => e.stopPropagation()}
                                  className="absolute top-full left-0 mt-1 z-30 w-72 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-3 text-left font-sans normal-case select-none"
                                >
                                  {/* Popover Header */}
                                  <div className="flex items-center justify-between pb-2 border-b border-slate-800 mb-2.5">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      <Filter className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                      <span className="text-xs font-bold text-white truncate">
                                        Filter: {colName}
                                      </span>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => setActiveFilterColIdx(null)}
                                      className="text-slate-400 hover:text-white p-0.5 rounded-lg hover:bg-slate-800 transition cursor-pointer"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </div>

                                  {/* Sort Actions */}
                                  <div className="space-y-1 mb-2.5">
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                      Sort
                                    </div>
                                    <div className="grid grid-cols-2 gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => handleToggleColumnSort(colIdx, 'asc')}
                                        className={`flex items-center justify-center gap-1 px-2 py-1.5 rounded-xl text-xs font-medium border transition cursor-pointer ${
                                          isSorted && columnSort?.direction === 'asc'
                                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                            : 'bg-slate-950/60 hover:bg-slate-800 text-slate-300 border-slate-800'
                                        }`}
                                      >
                                        <ArrowUp className="w-3.5 h-3.5 text-emerald-400" />
                                        <span>Sort A → Z</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleToggleColumnSort(colIdx, 'desc')}
                                        className={`flex items-center justify-center gap-1 px-2 py-1.5 rounded-xl text-xs font-medium border transition cursor-pointer ${
                                          isSorted && columnSort?.direction === 'desc'
                                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                            : 'bg-slate-950/60 hover:bg-slate-800 text-slate-300 border-slate-800'
                                        }`}
                                      >
                                        <ArrowDown className="w-3.5 h-3.5 text-emerald-400" />
                                        <span>Sort Z → A</span>
                                      </button>
                                    </div>
                                    {isSorted && (
                                      <button
                                        type="button"
                                        onClick={() => setColumnSort(null)}
                                        className="w-full text-[11px] text-slate-400 hover:text-amber-400 pt-0.5 text-left flex items-center gap-1 cursor-pointer"
                                      >
                                        <RotateCcw className="w-3 h-3" />
                                        <span>Clear sort order</span>
                                      </button>
                                    )}
                                  </div>

                                  {/* Condition Filter */}
                                  <div className="space-y-1 mb-2.5 pt-1 border-t border-slate-800">
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                      Condition
                                    </div>
                                    <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
                                      <button
                                        type="button"
                                        onClick={() => handleSetColumnCondition(colIdx, 'all')}
                                        className={`flex-1 py-1 rounded-lg font-medium transition cursor-pointer ${
                                          !filterConfig.condition || filterConfig.condition === 'all'
                                            ? 'bg-emerald-500 text-white font-bold'
                                            : 'text-slate-400 hover:text-white'
                                        }`}
                                      >
                                        All
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleSetColumnCondition(colIdx, 'non-blanks')}
                                        className={`flex-1 py-1 rounded-lg font-medium transition cursor-pointer ${
                                          filterConfig.condition === 'non-blanks'
                                            ? 'bg-emerald-500 text-white font-bold'
                                            : 'text-slate-400 hover:text-white'
                                        }`}
                                      >
                                        Non-blanks
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleSetColumnCondition(colIdx, 'blanks')}
                                        className={`flex-1 py-1 rounded-lg font-medium transition cursor-pointer ${
                                          filterConfig.condition === 'blanks'
                                            ? 'bg-emerald-500 text-white font-bold'
                                            : 'text-slate-400 hover:text-white'
                                        }`}
                                      >
                                        Blanks
                                      </button>
                                    </div>
                                  </div>

                                  {/* Column Text Search */}
                                  <div className="space-y-1 mb-2.5 pt-1 border-t border-slate-800">
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                      Contains Text
                                    </div>
                                    <div className="relative">
                                      <Search className="w-3 h-3 text-slate-500 absolute left-2 top-2" />
                                      <input
                                        type="text"
                                        value={filterConfig.textQuery || ''}
                                        onChange={e => handleSetColumnTextFilter(colIdx, e.target.value)}
                                        placeholder={`Search ${colName}...`}
                                        className="w-full bg-slate-950 border border-slate-800 text-white text-xs rounded-xl pl-7 pr-6 py-1.5 focus:border-emerald-500 outline-none"
                                      />
                                      {filterConfig.textQuery && (
                                        <button
                                          type="button"
                                          onClick={() => handleSetColumnTextFilter(colIdx, '')}
                                          className="absolute right-2 top-2 text-slate-400 hover:text-white"
                                        >
                                          <X className="w-3 h-3" />
                                        </button>
                                      )}
                                    </div>
                                  </div>

                                  {/* Distinct Values Checklist */}
                                  {(() => {
                                    const uniqueVals = getUniqueColumnValues(colIdx);
                                    const allValsList = uniqueVals.map(u => u.value);
                                    const displayedVals = filterValuesSearch.trim()
                                      ? uniqueVals.filter(u => u.value.toLowerCase().includes(filterValuesSearch.toLowerCase().trim()))
                                      : uniqueVals;
                                    const isAllSelected = filterConfig.selectedValues === undefined;
                                    const selectedSet = new Set(filterConfig.selectedValues ?? allValsList);

                                    return (
                                      <div className="space-y-1.5 pt-1 border-t border-slate-800">
                                        <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                          <span>Filter By Value ({uniqueVals.length})</span>
                                          <div className="flex items-center gap-2 normal-case font-normal">
                                            <button
                                              type="button"
                                              onClick={() => handleSelectAllValues(colIdx, true, allValsList)}
                                              className="text-emerald-400 hover:underline cursor-pointer"
                                            >
                                              Select All
                                            </button>
                                            <span>•</span>
                                            <button
                                              type="button"
                                              onClick={() => handleSelectAllValues(colIdx, false, allValsList)}
                                              className="text-slate-400 hover:underline cursor-pointer"
                                            >
                                              Clear
                                            </button>
                                          </div>
                                        </div>

                                        {uniqueVals.length > 5 && (
                                          <input
                                            type="text"
                                            value={filterValuesSearch}
                                            onChange={e => setFilterValuesSearch(e.target.value)}
                                            placeholder="Filter values list..."
                                            className="w-full bg-slate-950 border border-slate-800 text-white text-[11px] rounded-lg px-2 py-1 focus:border-emerald-500 outline-none"
                                          />
                                        )}

                                        <div className="max-h-36 overflow-y-auto divide-y divide-slate-800/40 rounded-xl bg-slate-950/70 border border-slate-800/80 p-1 scrollbar-thin">
                                          {displayedVals.length === 0 ? (
                                            <div className="text-[11px] text-slate-500 text-center py-2">
                                              No matching values
                                            </div>
                                          ) : (
                                            displayedVals.map(item => {
                                              const checked = isAllSelected || selectedSet.has(item.value);
                                              return (
                                                <label
                                                  key={item.value}
                                                  className="flex items-center justify-between px-2 py-1 hover:bg-slate-800/50 rounded-lg cursor-pointer text-xs"
                                                >
                                                  <div className="flex items-center gap-2 min-w-0 pr-2">
                                                    <input
                                                      type="checkbox"
                                                      checked={checked}
                                                      onChange={() => handleToggleValueSelection(colIdx, item.value, allValsList)}
                                                      className="rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-500 h-3.5 w-3.5"
                                                    />
                                                    <span className={`truncate text-xs ${item.isBlank ? 'italic text-slate-400' : 'text-slate-200'}`}>
                                                      {item.value}
                                                    </span>
                                                  </div>
                                                  <span className="text-[10px] font-mono text-slate-500 bg-slate-900 px-1.5 py-0.2 rounded shrink-0">
                                                    {item.count}
                                                  </span>
                                                </label>
                                              );
                                            })
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })()}

                                  {/* Popover Footer Buttons */}
                                  <div className="flex items-center justify-between pt-2.5 mt-2 border-t border-slate-800">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        handleClearSingleColumnFilter(colIdx);
                                        setFilterValuesSearch('');
                                      }}
                                      disabled={!isFiltered && !isSorted}
                                      className={`text-xs font-semibold px-2 py-1 rounded-lg transition cursor-pointer flex items-center gap-1 ${
                                        isFiltered || isSorted
                                          ? 'text-rose-400 hover:bg-rose-500/10'
                                          : 'text-slate-600 cursor-not-allowed'
                                      }`}
                                    >
                                      <FilterX className="w-3.5 h-3.5" />
                                      <span>Reset Column</span>
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => {
                                        setActiveFilterColIdx(null);
                                        setFilterValuesSearch('');
                                      }}
                                      className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3 py-1 rounded-lg transition cursor-pointer"
                                    >
                                      Done
                                    </button>
                                  </div>
                                </div>
                              )}
                            </th>
                          );
                        })}

                        {/* Row Action Header */}
                        <th className="py-2.5 px-3 font-mono font-bold text-slate-500 text-[10px] uppercase text-center w-16">
                          Action
                        </th>
                      </tr>

                      {/* Quick Filter Row */}
                      {showQuickFilterRow && (
                        <tr className="bg-slate-900/95 border-b border-slate-800 sticky top-[41px] z-10 shadow-sm">
                          <td className="py-1 px-2 text-center text-slate-600 border-r border-slate-800 text-[10px]">
                            <Filter className="w-3 h-3 mx-auto text-emerald-500" />
                          </td>
                          {activeSheet.headers.map((colName, colIdx) => {
                            const q = columnFilters[colIdx]?.textQuery || '';
                            return (
                              <td key={colIdx} className="py-1 px-2 border-r border-slate-800">
                                <div className="relative">
                                  <input
                                    type="text"
                                    value={q}
                                    onChange={e => handleSetColumnTextFilter(colIdx, e.target.value)}
                                    placeholder={`Filter ${colName}...`}
                                    className={`w-full text-[11px] rounded-lg px-2 py-1 outline-none transition border ${
                                      q
                                        ? 'bg-slate-900 text-emerald-300 border-emerald-500/60 font-medium'
                                        : 'bg-slate-950 text-slate-300 border-slate-800 focus:border-emerald-500'
                                    }`}
                                  />
                                  {q && (
                                    <button
                                      type="button"
                                      onClick={() => handleSetColumnTextFilter(colIdx, '')}
                                      className="absolute right-1.5 top-1 text-slate-400 hover:text-white"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              </td>
                            );
                          })}
                          <td className="py-1 px-2 text-center">
                            {activeFiltersCount > 0 && (
                              <button
                                type="button"
                                onClick={handleClearAllFilters}
                                className="text-slate-400 hover:text-rose-400 p-1"
                                title="Clear all filters"
                              >
                                <FilterX className="w-3.5 h-3.5 mx-auto" />
                              </button>
                            )}
                          </td>
                        </tr>
                      )}
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-sans">
                      {filteredRows.length === 0 ? (
                        <tr>
                          <td
                            colSpan={activeSheet.headers.length + 2}
                            className="py-12 text-center text-slate-500 text-xs"
                          >
                            {searchTerm ? 'No cells matching search query.' : 'This sheet has no data rows yet.'}
                          </td>
                        </tr>
                      ) : (
                        filteredRows.map(({ row, originalIndex }) => (
                          <tr
                            key={originalIndex}
                            className="hover:bg-slate-800/40 transition group/row"
                          >
                            {/* Row number */}
                            <td className="py-2 px-3 text-center text-[10px] font-mono text-slate-500 border-r border-slate-800/60 bg-slate-900/20 select-none">
                              {originalIndex + 1}
                            </td>

                            {/* Cells */}
                            {activeSheet.headers.map((_, colIdx) => {
                              const cellVal = row[colIdx];
                              const isEditing =
                                editingCell?.rowIdx === originalIndex &&
                                editingCell?.colIdx === colIdx;

                              return (
                                <td
                                  key={colIdx}
                                  onClick={() => startEditingCell(originalIndex, colIdx, cellVal)}
                                  className={`py-1.5 px-3 border-r border-slate-800/60 text-xs font-mono transition cursor-pointer min-w-[140px] max-w-[280px] truncate ${
                                    isEditing
                                      ? 'bg-slate-950 p-0 ring-2 ring-emerald-500 z-10 relative'
                                      : 'hover:bg-slate-800/60'
                                  }`}
                                  title="Click to edit cell"
                                >
                                  {isEditing ? (
                                    <input
                                      ref={editInputRef}
                                      type="text"
                                      value={editingValue}
                                      onChange={e => setEditingValue(e.target.value)}
                                      onBlur={saveCellEdit}
                                      onKeyDown={e => {
                                        if (e.key === 'Enter') saveCellEdit();
                                        if (e.key === 'Escape') setEditingCell(null);
                                      }}
                                      className="w-full h-full bg-slate-950 text-white font-mono text-xs px-2.5 py-1.5 outline-none"
                                    />
                                  ) : (
                                    <span
                                      className={
                                        cellVal === undefined || cellVal === null || String(cellVal).trim() === ''
                                          ? 'text-slate-600 italic select-none'
                                          : 'text-slate-200'
                                      }
                                    >
                                      {cellVal === undefined || cellVal === null || String(cellVal).trim() === ''
                                        ? '—'
                                        : String(cellVal)}
                                    </span>
                                  )}
                                </td>
                              );
                            })}

                            {/* Row Delete / Duplicate Action */}
                            <td className="py-1 px-2 text-center border-l border-slate-800/60">
                              <div className="flex items-center justify-center gap-1 opacity-0 group-hover/row:opacity-100 transition">
                                <button
                                  type="button"
                                  onClick={() => handleDuplicateRow(originalIndex)}
                                  className="p-1 text-slate-400 hover:text-cyan-400 rounded transition"
                                  title="Duplicate row"
                                >
                                  <Copy className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteRow(originalIndex)}
                                  className="p-1 text-slate-400 hover:text-rose-400 rounded transition"
                                  title="Delete row"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>

            {/* Bottom Footer Info Bar */}
            <div className="bg-slate-900 border-t border-slate-800 px-5 py-2.5 flex items-center justify-between text-xs text-slate-400 shrink-0">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5 text-emerald-400 font-bold">
                  <Check className="w-3.5 h-3.5" />
                  <span>Real-time in-grid editor active</span>
                </span>
                <span className="text-slate-500">•</span>
                <span>Click any cell to edit • Double-click headers to rename</span>
              </div>

              <div className="flex items-center gap-2">
                <span>
                  Showing <strong className="text-white font-mono">{filteredRows.length}</strong> of{' '}
                  <strong className="text-white font-mono">{activeSheet?.rows.length ?? 0}</strong> rows
                </span>
                {filteredRows.length !== (activeSheet?.rows.length ?? 0) && (
                  <span className="text-emerald-400 font-semibold flex items-center gap-1.5 bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 rounded-md">
                    <span>
                      ({((filteredRows.length / (activeSheet?.rows.length || 1)) * 100).toFixed(0)}% visible)
                    </span>
                    <button
                      type="button"
                      onClick={handleClearAllFilters}
                      className="text-slate-400 hover:text-white underline cursor-pointer text-[11px]"
                    >
                      Reset
                    </button>
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
