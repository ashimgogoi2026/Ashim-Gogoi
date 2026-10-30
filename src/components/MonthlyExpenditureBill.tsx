import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  FileText,
  Download,
  Upload,
  Plus,
  Trash2,
  Calendar,
  Sparkles,
  Save,
  FolderOpen,
  RotateCcw,
  Calculator,
  Eye,
  Edit3,
  FileSpreadsheet,
  User as UserIcon,
  Flag,
  MapPin,
  Navigation,
  ArrowRight,
  BookmarkPlus,
  Cloud,
  CloudUpload,
  CloudDownload,
  RefreshCw,
  CheckCircle2,
  FileJson
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { safeLocalStorage } from '../lib/safeLocalStorage';
import { globalToast } from '../lib/toast';

export interface ExpenditureRow {
  id: string;
  date: string;
  from: string;
  to: string;
  stayedAt: string;
  mode: string;
  km: string;
  ta: string;
  da: string;
  others: string;
}

export interface ExpenditureBillDocument {
  id: string;
  name: string;
  designation: string;
  area: string;
  billMonthLabel: string;
  selectedMonthIndex: number; // 0-11 (e.g. 8 for September)
  selectedYear: number; // e.g. 2026
  rows: ExpenditureRow[];
  updatedAt: string;
}

export interface IndiaHolidayEntry {
  day: number;
  monthIndex: number; // 0-11
  year?: number; // undefined = fixed every year
  name: string;
  type: 'national' | 'gazetted' | 'custom';
}

export interface OutstationRoutePreset {
  id: string;
  label: string;
  from: string;
  to: string;
  stayedAt: string;
  mode: string;
  km: string;
  ta: string;
  da: string;
  others: string;
}

export interface SmartTaDaDefaults {
  hqCity: string;
  hqMode: string;
  hqKm: string;
  hqTa: string;
  localDa: string;
  hqOthers: string;
  outstationMode: string;
  outstationDa: string;
  taRatePerKm: string;
  autoCalculateTaFromKm: boolean;
}

const DEFAULT_SMART_TADA_DEFAULTS: SmartTaDaDefaults = {
  hqCity: 'Guwahati',
  hqMode: 'Bike',
  hqKm: '',
  hqTa: '',
  localDa: '150',
  hqOthers: '',
  outstationMode: 'Traveller',
  outstationDa: '200',
  taRatePerKm: '2.2',
  autoCalculateTaFromKm: true
};

const STORAGE_KEY_SAVED_BILLS = 'PTG_MONTHLY_EXPENDITURE_BILLS_V1';
const STORAGE_KEY_ACTIVE_BILL = 'PTG_ACTIVE_EXPENDITURE_BILL_V1';
const STORAGE_KEY_CUSTOM_HOLIDAYS = 'PTG_CUSTOM_INDIA_HOLIDAYS_V1';
const STORAGE_KEY_OUTSTATION_PRESETS = 'PTG_OUTSTATION_ROUTE_PRESETS_V1';
const STORAGE_KEY_TADA_DEFAULTS = 'PTG_SMART_TADA_DEFAULTS_V1';
const STORAGE_KEY_CLOUD_SYNC_META = 'PTG_EXPENDITURE_CLOUD_SYNC_META_V1';

const MONTHS_LIST = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
];

// Popular Assam & North-East Towns/Cities for instant autocomplete when going outside Guwahati
const ASSAM_NE_CITIES = [
  'Guwahati',
  'Dibrugarh',
  'Makum',
  'Moran',
  'Dhemaji',
  'Sivasagar',
  'Tinsukia',
  'Jorhat',
  'Golaghat',
  'Tezpur',
  'Nagaon',
  'North Lakhimpur',
  'Bongaigaon',
  'Barpeta',
  'Nalbari',
  'Silchar',
  'Karimganj',
  'Hailakandi',
  'Diphu',
  'Haflong',
  'Dhubri',
  'Goalpara',
  'Kokrajhar',
  'Mangaldoi',
  'Rangia',
  'Pathsala',
  'Digboi',
  'Margherita',
  'Naharkatiya',
  'Duliajan',
  'Nazira',
  'Sonari',
  'Charaideo',
  'Biswanath Chariali',
  'Gohpur',
  'Morigaon',
  'Hojai',
  'Lumding',
  'Bokakhat',
  'Numaligarh',
  'Majuli',
  'Sadiya',
  'Doomdooma',
  'Shillong',
  'Itanagar',
  'Naharlagun',
  'Pasighat',
  'Roing',
  'Tezu',
  'Dimapur',
  'Kohima',
  'Agartala',
  'Aizawl',
  'Imphal'
];

// Default Outstation Route Presets (including exact routes from Ashim's reference sheet + popular Assam tours)
const DEFAULT_OUTSTATION_PRESETS: OutstationRoutePreset[] = [
  {
    id: 'preset-gwk-dib-bus',
    label: 'Guwahati → Dibrugarh (Bus)',
    from: 'Guwahati',
    to: 'Dibrugarh',
    stayedAt: 'Dibrugarh',
    mode: 'Bus',
    km: '480',
    ta: '',
    da: '200',
    others: '868'
  },
  {
    id: 'preset-dib-makum',
    label: 'Dibrugarh → Makum (110 KM)',
    from: 'Dibrugarh',
    to: 'Makum',
    stayedAt: 'Dibrugarh',
    mode: 'Traveller',
    km: '110',
    ta: '242',
    da: '200',
    others: ''
  },
  {
    id: 'preset-dib-moran',
    label: 'Dibrugarh → Moran (140 KM)',
    from: 'Dibrugarh',
    to: 'Moran',
    stayedAt: 'Dibrugarh',
    mode: 'Traveller',
    km: '140',
    ta: '308',
    da: '200',
    others: ''
  },
  {
    id: 'preset-dib-dhemaji',
    label: 'Dibrugarh → Dhemaji (160 KM)',
    from: 'Dibrugarh',
    to: 'Dhemaji',
    stayedAt: 'Dhemaji',
    mode: 'Traveller',
    km: '160',
    ta: '352',
    da: '200',
    others: ''
  },
  {
    id: 'preset-dhemaji-sivasagar',
    label: 'Dhemaji → Sivasagar (220 KM)',
    from: 'Dhemaji',
    to: 'Sivasagar',
    stayedAt: 'Dibrugarh',
    mode: 'Traveller',
    km: '220',
    ta: '484',
    da: '200',
    others: ''
  },
  {
    id: 'preset-dib-gwk-return',
    label: 'Dibrugarh → Guwahati (Return Bus)',
    from: 'Dibrugarh',
    to: 'Guwahati',
    stayedAt: 'Guwahati',
    mode: 'Bus',
    km: '',
    ta: '',
    da: '200',
    others: ''
  },
  {
    id: 'preset-gwk-jorhat',
    label: 'Guwahati → Jorhat (Bus)',
    from: 'Guwahati',
    to: 'Jorhat',
    stayedAt: 'Jorhat',
    mode: 'Bus',
    km: '310',
    ta: '',
    da: '200',
    others: '650'
  },
  {
    id: 'preset-gwk-tezpur',
    label: 'Guwahati → Tezpur (185 KM)',
    from: 'Guwahati',
    to: 'Tezpur',
    stayedAt: 'Tezpur',
    mode: 'Traveller',
    km: '185',
    ta: '407',
    da: '200',
    others: ''
  },
  {
    id: 'preset-gwk-nagaon',
    label: 'Guwahati → Nagaon (125 KM)',
    from: 'Guwahati',
    to: 'Nagaon',
    stayedAt: 'Guwahati',
    mode: 'Traveller',
    km: '125',
    ta: '275',
    da: '200',
    others: ''
  },
  {
    id: 'preset-gwk-silchar',
    label: 'Guwahati → Silchar (Bus)',
    from: 'Guwahati',
    to: 'Silchar',
    stayedAt: 'Silchar',
    mode: 'Bus',
    km: '340',
    ta: '',
    da: '200',
    others: '750'
  }
];

// Comprehensive India National & Gazetted Holidays (Fixed + Movable 2024–2030)
const BUILTIN_INDIA_HOLIDAYS: IndiaHolidayEntry[] = [
  // Fixed Every-Year National & Major Gazetted Holidays
  { day: 1, monthIndex: 0, name: 'NEW YEAR DAY', type: 'gazetted' },
  { day: 14, monthIndex: 0, name: 'MAKAR SANKRANTI / MAGH BIHU', type: 'gazetted' },
  { day: 15, monthIndex: 0, name: 'MAGH BIHU', type: 'gazetted' },
  { day: 26, monthIndex: 0, name: 'REPUBLIC DAY', type: 'national' },
  { day: 14, monthIndex: 3, name: 'AMBEDKAR JAYANTI / BOHAG BIHU', type: 'gazetted' },
  { day: 15, monthIndex: 3, name: 'BOHAG BIHU', type: 'gazetted' },
  { day: 1, monthIndex: 4, name: 'MAY DAY / LABOUR DAY', type: 'gazetted' },
  { day: 15, monthIndex: 7, name: 'INDEPENDENCE DAY', type: 'national' },
  { day: 2, monthIndex: 9, name: 'GANDHI JAYANTI', type: 'national' },
  { day: 25, monthIndex: 11, name: 'CHRISTMAS DAY', type: 'gazetted' },

  // 2024 Movable Gazetted Holidays
  { day: 8, monthIndex: 2, year: 2024, name: 'MAHA SHIVARATRI', type: 'gazetted' },
  { day: 25, monthIndex: 2, year: 2024, name: 'HOLI', type: 'gazetted' },
  { day: 29, monthIndex: 2, year: 2024, name: 'GOOD FRIDAY', type: 'gazetted' },
  { day: 11, monthIndex: 3, year: 2024, name: 'EID-UL-FITR', type: 'gazetted' },
  { day: 17, monthIndex: 5, year: 2024, name: 'EID-UL-ADHA (BAKRID)', type: 'gazetted' },
  { day: 26, monthIndex: 7, year: 2024, name: 'JANMASHTAMI', type: 'gazetted' },
  { day: 12, monthIndex: 9, year: 2024, name: 'VIJAYA DASHAMI (DUSSEHRA)', type: 'gazetted' },
  { day: 31, monthIndex: 9, year: 2024, name: 'DIWALI (DEEPAVALI)', type: 'gazetted' },
  { day: 15, monthIndex: 10, year: 2024, name: 'GURU NANAK JAYANTI', type: 'gazetted' },

  // 2025 Movable Gazetted Holidays
  { day: 26, monthIndex: 1, year: 2025, name: 'MAHA SHIVARATRI', type: 'gazetted' },
  { day: 14, monthIndex: 2, year: 2025, name: 'HOLI', type: 'gazetted' },
  { day: 31, monthIndex: 2, year: 2025, name: 'EID-UL-FITR', type: 'gazetted' },
  { day: 10, monthIndex: 3, year: 2025, name: 'MAHAVIR JAYANTI', type: 'gazetted' },
  { day: 18, monthIndex: 3, year: 2025, name: 'GOOD FRIDAY', type: 'gazetted' },
  { day: 12, monthIndex: 4, year: 2025, name: 'BUDDHA PURNIMA', type: 'gazetted' },
  { day: 7, monthIndex: 5, year: 2025, name: 'EID-UL-ADHA (BAKRID)', type: 'gazetted' },
  { day: 16, monthIndex: 7, year: 2025, name: 'JANMASHTAMI', type: 'gazetted' },
  { day: 5, monthIndex: 8, year: 2025, name: 'MILAD-UN-NABI', type: 'gazetted' },
  { day: 1, monthIndex: 9, year: 2025, name: 'MAHA NAVAMI (DURGA PUJA)', type: 'gazetted' },
  { day: 20, monthIndex: 9, year: 2025, name: 'DIWALI (DEEPAVALI)', type: 'gazetted' },
  { day: 5, monthIndex: 10, year: 2025, name: 'GURU NANAK JAYANTI', type: 'gazetted' },

  // 2026 Movable Gazetted Holidays
  { day: 15, monthIndex: 1, year: 2026, name: 'MAHA SHIVARATRI', type: 'gazetted' },
  { day: 4, monthIndex: 2, year: 2026, name: 'HOLI', type: 'gazetted' },
  { day: 21, monthIndex: 2, year: 2026, name: 'EID-UL-FITR', type: 'gazetted' },
  { day: 31, monthIndex: 2, year: 2026, name: 'MAHAVIR JAYANTI', type: 'gazetted' },
  { day: 3, monthIndex: 3, year: 2026, name: 'GOOD FRIDAY', type: 'gazetted' },
  { day: 27, monthIndex: 4, year: 2026, name: 'EID-UL-ADHA (BAKRID)', type: 'gazetted' },
  { day: 26, monthIndex: 5, year: 2026, name: 'MUHARRAM', type: 'gazetted' },
  { day: 26, monthIndex: 7, year: 2026, name: 'MILAD-UN-NABI', type: 'gazetted' },
  { day: 4, monthIndex: 8, year: 2026, name: 'JANMASHTAMI', type: 'gazetted' },
  { day: 19, monthIndex: 9, year: 2026, name: 'MAHA ASHTAMI (DURGA PUJA)', type: 'gazetted' },
  { day: 20, monthIndex: 9, year: 2026, name: 'VIJAYA DASHAMI (DUSSEHRA)', type: 'gazetted' },
  { day: 8, monthIndex: 10, year: 2026, name: 'DIWALI (DEEPAVALI)', type: 'gazetted' },
  { day: 24, monthIndex: 10, year: 2026, name: 'GURU NANAK JAYANTI', type: 'gazetted' },

  // 2027 Movable Gazetted Holidays
  { day: 6, monthIndex: 2, year: 2027, name: 'MAHA SHIVARATRI', type: 'gazetted' },
  { day: 10, monthIndex: 2, year: 2027, name: 'EID-UL-FITR', type: 'gazetted' },
  { day: 22, monthIndex: 2, year: 2027, name: 'HOLI', type: 'gazetted' },
  { day: 26, monthIndex: 2, year: 2027, name: 'GOOD FRIDAY', type: 'gazetted' },
  { day: 19, monthIndex: 3, year: 2027, name: 'MAHAVIR JAYANTI', type: 'gazetted' },
  { day: 17, monthIndex: 4, year: 2027, name: 'EID-UL-ADHA (BAKRID)', type: 'gazetted' },
  { day: 20, monthIndex: 4, year: 2027, name: 'BUDDHA PURNIMA', type: 'gazetted' },
  { day: 25, monthIndex: 7, year: 2027, name: 'JANMASHTAMI', type: 'gazetted' },
  { day: 9, monthIndex: 9, year: 2027, name: 'MAHA NAVAMI (DURGA PUJA)', type: 'gazetted' },
  { day: 10, monthIndex: 9, year: 2027, name: 'VIJAYA DASHAMI (DUSSEHRA)', type: 'gazetted' },
  { day: 29, monthIndex: 9, year: 2027, name: 'DIWALI (DEEPAVALI)', type: 'gazetted' },
  { day: 14, monthIndex: 10, year: 2027, name: 'GURU NANAK JAYANTI', type: 'gazetted' }
];

// Exact sample rows from /public/assets/aistudio/MONTHLY_EXPENDATURE_9971750e.pdf (September 26 - Ashim Gogoi, Total 6404)
const createSampleSeptember26Rows = (): ExpenditureRow[] => [
  { id: 'row-1', date: '1', from: 'Guwahati', to: 'Guwahati', stayedAt: 'Guwahati', mode: 'Bike', km: '', ta: '', da: '150', others: '' },
  { id: 'row-2', date: '2', from: 'Guwahati', to: 'Guwahati', stayedAt: 'Guwahati', mode: 'Bike', km: '', ta: '', da: '150', others: '' },
  { id: 'row-3', date: '3', from: 'Guwahati', to: 'Guwahati', stayedAt: 'Guwahati', mode: 'Bike', km: '', ta: '', da: '150', others: '' },
  { id: 'row-4', date: '4', from: 'Guwahati', to: 'Guwahati', stayedAt: 'Guwahati', mode: 'Bike', km: '', ta: '', da: '150', others: '' },
  { id: 'row-5', date: '5', from: 'Guwahati', to: 'Guwahati', stayedAt: 'Guwahati', mode: 'Bike', km: '', ta: '', da: '150', others: '' },
  { id: 'row-6', date: '6', from: '( SUNDAY )', to: '', stayedAt: '', mode: '', km: '', ta: '', da: '', others: '' },
  { id: 'row-7', date: '7', from: 'Guwahati', to: 'Guwahati', stayedAt: 'Guwahati', mode: 'Bike', km: '', ta: '', da: '150', others: '' },
  { id: 'row-8', date: '8', from: 'Guwahati', to: 'Guwahati', stayedAt: 'Guwahati', mode: 'Bike', km: '', ta: '', da: '150', others: '' },
  { id: 'row-9', date: '9', from: 'Guwahati', to: 'Guwahati', stayedAt: 'Guwahati', mode: 'Bike', km: '', ta: '', da: '150', others: '' },
  { id: 'row-10', date: '10', from: 'Guwahati', to: 'Guwahati', stayedAt: 'Guwahati', mode: 'Bike', km: '', ta: '', da: '150', others: '' },
  { id: 'row-11', date: '11', from: 'Guwahati', to: 'Guwahati', stayedAt: 'Guwahati', mode: 'Bike', km: '', ta: '', da: '150', others: '' },
  { id: 'row-12', date: '12', from: 'Guwahati', to: 'Guwahati', stayedAt: 'Guwahati', mode: 'Bike', km: '', ta: '', da: '150', others: '' },
  { id: 'row-13', date: '13', from: '( SUNDAY )', to: '', stayedAt: '', mode: '', km: '', ta: '', da: '', others: '' },
  { id: 'row-14', date: '14', from: 'Guwahati', to: 'Guwahati', stayedAt: 'Guwahati', mode: 'Bike', km: '', ta: '', da: '150', others: '' },
  { id: 'row-15', date: '15', from: 'Guwahati', to: 'Guwahati', stayedAt: 'Guwahati', mode: 'Bike', km: '', ta: '', da: '150', others: '' },
  { id: 'row-16', date: '16', from: 'Guwahati', to: 'Guwahati', stayedAt: 'Guwahati', mode: 'Bike', km: '', ta: '', da: '150', others: '' },
  { id: 'row-17', date: '17', from: 'Guwahati', to: 'Guwahati', stayedAt: 'Guwahati', mode: 'Bike', km: '', ta: '', da: '150', others: '' },
  { id: 'row-18', date: '18', from: 'Guwahati', to: 'Guwahati', stayedAt: 'Guwahati', mode: 'Bike', km: '', ta: '', da: '150', others: '' },
  { id: 'row-19', date: '19', from: 'Guwahati', to: 'Guwahati', stayedAt: 'Guwahati', mode: 'Bike', km: '', ta: '', da: '150', others: '' },
  { id: 'row-20', date: '20', from: '( SUNDAY )', to: '', stayedAt: '', mode: '', km: '', ta: '', da: '', others: '' },
  { id: 'row-21', date: '21', from: 'Guwahati', to: 'Guwahati', stayedAt: 'Guwahati', mode: 'Bike', km: '', ta: '', da: '150', others: '' },
  { id: 'row-22', date: '22', from: 'Off', to: '', stayedAt: '', mode: '', km: '', ta: '', da: '', others: '' },
  { id: 'row-23', date: '23', from: 'Guwahati', to: 'Guwahati', stayedAt: 'Guwahati', mode: 'Bike', km: '', ta: '', da: '150', others: '' },
  { id: 'row-24', date: '24', from: 'Guwahati', to: 'Dibrugarh', stayedAt: 'Dibrugarh', mode: 'Bus', km: '480', ta: '', da: '200', others: '868' },
  { id: 'row-25', date: '25', from: 'Dibrugarh', to: 'Makum', stayedAt: 'Dibrugarh', mode: 'Traveller', km: '110', ta: '242', da: '200', others: '' },
  { id: 'row-26', date: '26', from: 'Dibrugarh', to: 'Moran', stayedAt: 'Dibrugarh', mode: 'Traveller', km: '140', ta: '308', da: '200', others: '' },
  { id: 'row-27', date: '27', from: '( SUNDAY )', to: '', stayedAt: '', mode: '', km: '', ta: '', da: '', others: '' },
  { id: 'row-28', date: '28', from: 'Dibrugarh', to: 'Dhemaji', stayedAt: 'Dhemaji', mode: 'Traveller', km: '160', ta: '352', da: '200', others: '' },
  { id: 'row-29', date: '29', from: 'Dhemaji', to: 'Sivasagar', stayedAt: 'Dibrugarh', mode: 'Traveller', km: '220', ta: '484', da: '200', others: '' },
  { id: 'row-30', date: '30', from: 'Dibrugarh', to: 'Guwahati', stayedAt: 'Guwahati', mode: 'Bus', km: '', ta: '', da: '200', others: '' }
];

const createDefaultSeptember26Bill = (): ExpenditureBillDocument => ({
  id: 'bill-sep-26-sample',
  name: 'Ashim Gogoi',
  designation: 'Business Development Manager',
  area: 'Guwahati     Assam,',
  billMonthLabel: 'September 26',
  selectedMonthIndex: 8,
  selectedYear: 2026,
  rows: createSampleSeptember26Rows(),
  updatedAt: new Date().toISOString()
});

export const calculateRowTotal = (row: ExpenditureRow): number => {
  const taVal = parseFloat(String(row.ta || '').replace(/,/g, '')) || 0;
  const daVal = parseFloat(String(row.da || '').replace(/,/g, '')) || 0;
  const othersVal = parseFloat(String(row.others || '').replace(/,/g, '')) || 0;
  return Math.round((taVal + daVal + othersVal) * 100) / 100;
};

export const formatNumericCell = (val: number): string => {
  if (!val || val === 0) return '';
  return Number.isInteger(val) ? String(val) : val.toFixed(2);
};

export const numberToIndianWords = (amount: number): string => {
  if (amount === null || amount === undefined || isNaN(amount)) return 'Rupees Zero Only';
  const rounded = Math.round(Math.abs(amount) * 100) / 100;
  const rupees = Math.floor(rounded);
  const paise = Math.round((rounded - rupees) * 100);

  const ones = [
    '',
    'One',
    'Two',
    'Three',
    'Four',
    'Five',
    'Six',
    'Seven',
    'Eight',
    'Nine',
    'Ten',
    'Eleven',
    'Twelve',
    'Thirteen',
    'Fourteen',
    'Fifteen',
    'Sixteen',
    'Seventeen',
    'Eighteen',
    'Nineteen'
  ];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const twoDigitsToWords = (n: number): string => {
    if (n === 0) return '';
    if (n < 20) return ones[n];
    const t = Math.floor(n / 10);
    const o = n % 10;
    return `${tens[t]}${o > 0 ? ' ' + ones[o] : ''}`;
  };

  const integerToIndianWords = (num: number): string => {
    if (num === 0) return 'Zero';
    const parts: string[] = [];

    const crore = Math.floor(num / 10000000);
    let rem = num % 10000000;
    if (crore > 0) {
      parts.push(`${integerToIndianWords(crore)} Crore`);
    }

    const lakh = Math.floor(rem / 100000);
    rem = rem % 100000;
    if (lakh > 0) {
      parts.push(`${twoDigitsToWords(lakh)} Lakh`);
    }

    const thousand = Math.floor(rem / 1000);
    rem = rem % 1000;
    if (thousand > 0) {
      parts.push(`${twoDigitsToWords(thousand)} Thousand`);
    }

    const hundred = Math.floor(rem / 100);
    rem = rem % 100;
    if (hundred > 0) {
      parts.push(`${ones[hundred]} Hundred`);
    }

    if (rem > 0) {
      parts.push(twoDigitsToWords(rem));
    }

    return parts.join(' ').trim();
  };

  const rupeeWords = integerToIndianWords(rupees);
  const paiseWords = paise > 0 ? ` and ${twoDigitsToWords(paise)} Paise` : '';
  return `Rupees ${rupeeWords}${paiseWords} Only`;
};

const MonthlyExpenditureBill: React.FC = () => {
  // Active bill state
  const [bill, setBill] = useState<ExpenditureBillDocument>(() => {
    try {
      const saved = safeLocalStorage.getItem(STORAGE_KEY_ACTIVE_BILL);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && Array.isArray(parsed.rows) && parsed.rows.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.error('Failed to load active expenditure bill:', e);
    }
    return createDefaultSeptember26Bill();
  });

  // Saved bills archive
  const [savedBills, setSavedBills] = useState<ExpenditureBillDocument[]>(() => {
    try {
      const raw = safeLocalStorage.getItem(STORAGE_KEY_SAVED_BILLS);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.error('Failed to load saved expenditure bills:', e);
    }
    return [createDefaultSeptember26Bill()];
  });

  // Custom user-defined Indian holidays
  const [customHolidays, setCustomHolidays] = useState<IndiaHolidayEntry[]>(() => {
    try {
      const raw = safeLocalStorage.getItem(STORAGE_KEY_CUSTOM_HOLIDAYS);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.error('Failed to load custom holidays:', e);
    }
    return [];
  });

  // Saved Outstation (Outside Guwahati) Route Presets
  const [outstationPresets, setOutstationPresets] = useState<OutstationRoutePreset[]>(() => {
    try {
      const raw = safeLocalStorage.getItem(STORAGE_KEY_OUTSTATION_PRESETS);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.error('Failed to load outstation presets:', e);
    }
    return DEFAULT_OUTSTATION_PRESETS;
  });

  // Load saved Smart Auto-Fill & TA/DA Defaults
  const initialTaDaDefaults = useMemo<SmartTaDaDefaults>(() => {
    try {
      const raw = safeLocalStorage.getItem(STORAGE_KEY_TADA_DEFAULTS);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          return {
            ...DEFAULT_SMART_TADA_DEFAULTS,
            ...parsed
          };
        }
      }
    } catch (e) {
      console.error('Failed to load Smart TA/DA defaults:', e);
    }
    return DEFAULT_SMART_TADA_DEFAULTS;
  }, []);

  // Helper settings for fast entry & automatic India National Holiday marking
  const [isEditingSmartDefaults, setIsEditingSmartDefaults] = useState<boolean>(false);
  const [autoCalculateTaFromKm, setAutoCalculateTaFromKm] = useState<boolean>(
    initialTaDaDefaults.autoCalculateTaFromKm
  );
  const [taRatePerKm, setTaRatePerKm] = useState<string>(initialTaDaDefaults.taRatePerKm);
  const [defaultHqCity, setDefaultHqCity] = useState<string>(initialTaDaDefaults.hqCity);
  const [defaultHqMode, setDefaultHqMode] = useState<string>(initialTaDaDefaults.hqMode);
  const [defaultHqKm, setDefaultHqKm] = useState<string>(initialTaDaDefaults.hqKm);
  const [defaultHqTa, setDefaultHqTa] = useState<string>(initialTaDaDefaults.hqTa);
  const [defaultLocalDa, setDefaultLocalDa] = useState<string>(initialTaDaDefaults.localDa);
  const [defaultHqOthers, setDefaultHqOthers] = useState<string>(initialTaDaDefaults.hqOthers);
  const [defaultOutstationMode, setDefaultOutstationMode] = useState<string>(
    initialTaDaDefaults.outstationMode
  );
  const [defaultOutstationDa, setDefaultOutstationDa] = useState<string>(
    initialTaDaDefaults.outstationDa
  );
  const [showColumnSubtotalsInPdf, setShowColumnSubtotalsInPdf] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'split' | 'editor' | 'preview' | 'reference'>('split');

  // Outside Guwahati / Outstation Trip Builder state
  const [tripTargetDate, setTripTargetDate] = useState<string>('24');
  const [tripFrom, setTripFrom] = useState<string>(initialTaDaDefaults.hqCity || 'Guwahati');
  const [tripTo, setTripTo] = useState<string>('Dibrugarh');
  const [tripStayedAt, setTripStayedAt] = useState<string>('Dibrugarh');
  const [tripMode, setTripMode] = useState<string>(initialTaDaDefaults.outstationMode || 'Traveller');
  const [tripKm, setTripKm] = useState<string>('140');
  const [tripTa, setTripTa] = useState<string>('308');
  const [tripDa, setTripDa] = useState<string>(initialTaDaDefaults.outstationDa || '200');
  const [tripOthers, setTripOthers] = useState<string>('');

  // Automatic Sunday & India Holiday settings as per Preparation Month
  const [autoAddSundaysForMonth, setAutoAddSundaysForMonth] = useState<boolean>(true);
  const [autoIncludeIndiaHolidays, setAutoIncludeIndiaHolidays] = useState<boolean>(true);
  const [holidayScope, setHolidayScope] = useState<'all' | 'national_only'>('all');
  const [holidayFormatStyle, setHolidayFormatStyle] = useState<'named_parens' | 'national_holiday' | 'holiday_only'>('named_parens');
  const [newCustomHolidayDay, setNewCustomHolidayDay] = useState<string>('');
  const [newCustomHolidayName, setNewCustomHolidayName] = useState<string>('');

  // Free Cloud Sync & Prepared File Upload/Re-Edit states (100% Free, Zero Cost)
  const preparedFileInputRef = useRef<HTMLInputElement | null>(null);
  const [isCloudUploading, setIsCloudUploading] = useState<boolean>(false);
  const [isCloudSyncing, setIsCloudSyncing] = useState<boolean>(false);
  const [autoCloudSync, setAutoCloudSync] = useState<boolean>(() => {
    try {
      const raw = safeLocalStorage.getItem(STORAGE_KEY_CLOUD_SYNC_META);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed.autoCloudSync === 'boolean') return parsed.autoCloudSync;
      }
    } catch (e) {}
    return true;
  });
  const [lastCloudSyncTime, setLastCloudSyncTime] = useState<string | null>(() => {
    try {
      const raw = safeLocalStorage.getItem(STORAGE_KEY_CLOUD_SYNC_META);
      if (raw) {
        const parsed = JSON.parse(raw);
        return parsed.lastCloudSyncTime || null;
      }
    } catch (e) {}
    return null;
  });
  const [cloudSyncedBillIds, setCloudSyncedBillIds] = useState<string[]>(() => {
    try {
      const raw = safeLocalStorage.getItem(STORAGE_KEY_CLOUD_SYNC_META);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.cloudSyncedBillIds)) return parsed.cloudSyncedBillIds;
      }
    } catch (e) {}
    return [];
  });

  // Persist Cloud Sync metadata
  useEffect(() => {
    try {
      safeLocalStorage.setItem(
        STORAGE_KEY_CLOUD_SYNC_META,
        JSON.stringify({
          autoCloudSync,
          lastCloudSyncTime,
          cloudSyncedBillIds
        })
      );
    } catch (e) {}
  }, [autoCloudSync, lastCloudSyncTime, cloudSyncedBillIds]);

  // Persist active bill automatically
  useEffect(() => {
    try {
      safeLocalStorage.setItem(STORAGE_KEY_ACTIVE_BILL, JSON.stringify(bill));
    } catch (e) {
      console.error('Failed to persist active bill:', e);
    }
  }, [bill]);

  // Persist saved bills list
  useEffect(() => {
    try {
      safeLocalStorage.setItem(STORAGE_KEY_SAVED_BILLS, JSON.stringify(savedBills));
    } catch (e) {
      console.error('Failed to persist saved bills:', e);
    }
  }, [savedBills]);

  // Persist custom holidays
  useEffect(() => {
    try {
      safeLocalStorage.setItem(STORAGE_KEY_CUSTOM_HOLIDAYS, JSON.stringify(customHolidays));
    } catch (e) {
      console.error('Failed to persist custom holidays:', e);
    }
  }, [customHolidays]);

  // Persist outstation route presets
  useEffect(() => {
    try {
      safeLocalStorage.setItem(STORAGE_KEY_OUTSTATION_PRESETS, JSON.stringify(outstationPresets));
    } catch (e) {
      console.error('Failed to persist outstation presets:', e);
    }
  }, [outstationPresets]);

  // Persist Smart Auto-Fill & TA/DA Defaults automatically
  useEffect(() => {
    try {
      const payload: SmartTaDaDefaults = {
        hqCity: defaultHqCity,
        hqMode: defaultHqMode,
        hqKm: defaultHqKm,
        hqTa: defaultHqTa,
        localDa: defaultLocalDa,
        hqOthers: defaultHqOthers,
        outstationMode: defaultOutstationMode,
        outstationDa: defaultOutstationDa,
        taRatePerKm,
        autoCalculateTaFromKm
      };
      safeLocalStorage.setItem(STORAGE_KEY_TADA_DEFAULTS, JSON.stringify(payload));
    } catch (e) {
      console.error('Failed to persist Smart TA/DA defaults:', e);
    }
  }, [
    defaultHqCity,
    defaultHqMode,
    defaultHqKm,
    defaultHqTa,
    defaultLocalDa,
    defaultHqOthers,
    defaultOutstationMode,
    defaultOutstationDa,
    taRatePerKm,
    autoCalculateTaFromKm
  ]);

  // Format holiday label for the "From" cell in the Expenditure Bill
  const formatHolidayCellText = (holiday: IndiaHolidayEntry): string => {
    if (holidayFormatStyle === 'national_holiday') {
      return holiday.type === 'national' ? '( NATIONAL HOLIDAY )' : `( ${holiday.name} )`;
    }
    if (holidayFormatStyle === 'holiday_only') {
      return '( HOLIDAY )';
    }
    return `( ${holiday.name} )`;
  };

  // Compute all active India National & Gazetted Holidays for the selected Month & Year
  const activeMonthHolidaysMap = useMemo(() => {
    const map = new Map<number, IndiaHolidayEntry>();
    const allList = [...BUILTIN_INDIA_HOLIDAYS, ...customHolidays];

    allList.forEach((h) => {
      if (h.monthIndex !== bill.selectedMonthIndex) return;
      if (h.year !== undefined && h.year !== bill.selectedYear) return;
      if (holidayScope === 'national_only' && h.type !== 'national' && h.type !== 'custom') return;

      const existing = map.get(h.day);
      if (!existing || h.type === 'national' || h.type === 'custom' || h.year !== undefined) {
        map.set(h.day, h);
      }
    });

    return map;
  }, [bill.selectedMonthIndex, bill.selectedYear, holidayScope, customHolidays]);

  const activeMonthHolidaysList = useMemo(() => {
    return Array.from(activeMonthHolidaysMap.values()).sort((a, b) => a.day - b.day);
  }, [activeMonthHolidaysMap]);

  // Compute all Sundays (day numbers 1-31) for the selected Preparation Month & Year
  const activeMonthSundaysList = useMemo(() => {
    const daysInMonth = new Date(bill.selectedYear, bill.selectedMonthIndex + 1, 0).getDate();
    const sundays: number[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      if (new Date(bill.selectedYear, bill.selectedMonthIndex, d).getDay() === 0) {
        sundays.push(d);
      }
    }
    return sundays;
  }, [bill.selectedMonthIndex, bill.selectedYear]);

  const activeMonthSundaysSet = useMemo(() => new Set<number>(activeMonthSundaysList), [activeMonthSundaysList]);

  // Resolve effective row for PDF, Live A4 Preview, CSV, and Summary so Sundays of the preparation month are always automatically applied
  const getEffectiveRowForBill = (row: ExpenditureRow): ExpenditureRow => {
    if (!autoAddSundaysForMonth) return row;
    const dayNum = parseInt(String(row.date || '').trim(), 10);
    if (isNaN(dayNum) || !activeMonthSundaysSet.has(dayNum)) {
      return row;
    }

    const fromUpper = (row.from || '').toUpperCase().trim();
    if (fromUpper.includes('SUNDAY')) {
      return row;
    }

    // Check if the user intentionally entered an outstation travel trip on this Sunday
    const hqLower = (defaultHqCity || 'Guwahati').toLowerCase().trim();
    const toLower = (row.to || '').toLowerCase().trim();
    const stayLower = (row.stayedAt || '').toLowerCase().trim();
    const hasOutstationTripOnSunday =
      (toLower !== '' && toLower !== hqLower) ||
      (stayLower !== '' && stayLower !== hqLower) ||
      (row.km || '').trim() !== '' ||
      (row.ta || '').trim() !== '' ||
      (row.others || '').trim() !== '';

    if (hasOutstationTripOnSunday) {
      return row;
    }

    const holiday = autoIncludeIndiaHolidays ? activeMonthHolidaysMap.get(dayNum) : undefined;
    return {
      ...row,
      from: holiday ? `( SUNDAY / ${holiday.name} )` : '( SUNDAY )',
      to: '',
      stayedAt: '',
      mode: '',
      km: '',
      ta: '',
      da: '',
      others: ''
    };
  };

  // Summary calculations
  const summary = useMemo(() => {
    let totalKm = 0;
    let totalTa = 0;
    let totalDa = 0;
    let totalOthers = 0;
    let grandTotal = 0;
    let workingDays = 0;
    let outstationDays = 0;
    let sundaysOrOff = 0;

    bill.rows.forEach((rawRow) => {
      const r = getEffectiveRowForBill(rawRow);
      const km = parseFloat(String(r.km || '').replace(/,/g, '')) || 0;
      const ta = parseFloat(String(r.ta || '').replace(/,/g, '')) || 0;
      const da = parseFloat(String(r.da || '').replace(/,/g, '')) || 0;
      const others = parseFloat(String(r.others || '').replace(/,/g, '')) || 0;
      const rowTotal = calculateRowTotal(r);

      totalKm += km;
      totalTa += ta;
      totalDa += da;
      totalOthers += others;
      grandTotal += rowTotal;

      const dayNum = parseInt(String(r.date || '').trim(), 10);
      const isDateHoliday = !isNaN(dayNum) && activeMonthHolidaysMap.has(dayNum);
      const fromUpper = (r.from || '').toUpperCase().trim();
      const isMarkedOffOrHoliday =
        fromUpper.includes('SUNDAY') ||
        fromUpper === 'OFF' ||
        fromUpper.includes('HOLIDAY') ||
        fromUpper.includes('JAYANTI') ||
        fromUpper.includes('REPUBLIC DAY') ||
        fromUpper.includes('INDEPENDENCE DAY') ||
        fromUpper.includes('BIHU') ||
        fromUpper.includes('PUJA') ||
        fromUpper.includes('DUSSEHRA') ||
        fromUpper.includes('DIWALI') ||
        fromUpper.includes('HOLI') ||
        fromUpper.includes('EID') ||
        fromUpper.includes('GOOD FRIDAY') ||
        fromUpper.includes('CHRISTMAS') ||
        fromUpper.includes('SHIVARATRI') ||
        fromUpper.includes('JANMASHTAMI') ||
        fromUpper.includes('MUHARRAM') ||
        fromUpper === 'LEAVE' ||
        (isDateHoliday && rowTotal === 0 && !r.to.trim());

      if (isMarkedOffOrHoliday) {
        sundaysOrOff++;
      } else if (r.from.trim() || r.to.trim() || rowTotal > 0) {
        workingDays++;
        const hqLower = (defaultHqCity || 'Guwahati').toLowerCase().trim();
        const fromLower = (r.from || '').toLowerCase().trim();
        const toLower = (r.to || '').toLowerCase().trim();
        const stayLower = (r.stayedAt || '').toLowerCase().trim();
        if (
          (fromLower && fromLower !== hqLower) ||
          (toLower && toLower !== hqLower) ||
          (stayLower && stayLower !== hqLower) ||
          km > 0
        ) {
          outstationDays++;
        }
      }
    });

    return {
      totalKm: Math.round(totalKm * 100) / 100,
      totalTa: Math.round(totalTa * 100) / 100,
      totalDa: Math.round(totalDa * 100) / 100,
      totalOthers: Math.round(totalOthers * 100) / 100,
      grandTotal: Math.round(grandTotal * 100) / 100,
      workingDays,
      outstationDays,
      sundaysOrOff
    };
  }, [bill.rows, activeMonthHolidaysMap, activeMonthSundaysSet, autoAddSundaysForMonth, autoIncludeIndiaHolidays, defaultHqCity]);

  // Handle KM change inside the Outside Guwahati Trip Builder
  const handleTripBuilderKmChange = (val: string, currentMode = tripMode) => {
    setTripKm(val);
    if (autoCalculateTaFromKm) {
      const numKm = parseFloat(val);
      const rate = parseFloat(taRatePerKm) || 0;
      const modeLower = (currentMode || '').toLowerCase().trim();
      if (!isNaN(numKm) && numKm > 0 && rate > 0 && modeLower !== 'bus') {
        setTripTa(String(Math.round(numKm * rate * 100) / 100));
      } else if (val.trim() === '' || modeLower === 'bus') {
        setTripTa('');
      }
    }
  };

  // Apply Outside Guwahati Trip Builder values to the selected Date in the Bill
  const handleApplyOutstationTripToDate = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const targetDateStr = tripTargetDate.trim();
    if (!targetDateStr) {
      globalToast.error('Please select a Date (1-31) to add the Outside Guwahati trip.');
      return;
    }

    setBill((prev) => {
      const exists = prev.rows.some((r) => String(r.date).trim() === targetDateStr);
      let nextRows: ExpenditureRow[];

      if (exists) {
        nextRows = prev.rows.map((r) => {
          if (String(r.date).trim() !== targetDateStr) return r;
          return {
            ...r,
            from: tripFrom,
            to: tripTo,
            stayedAt: tripStayedAt,
            mode: tripMode,
            km: tripKm,
            ta: tripTa,
            da: tripDa,
            others: tripOthers
          };
        });
      } else {
        nextRows = [
          ...prev.rows,
          {
            id: `row-${Date.now()}`,
            date: targetDateStr,
            from: tripFrom,
            to: tripTo,
            stayedAt: tripStayedAt,
            mode: tripMode,
            km: tripKm,
            ta: tripTa,
            da: tripDa,
            others: tripOthers
          }
        ];
      }

      return {
        ...prev,
        rows: nextRows,
        updatedAt: new Date().toISOString()
      };
    });

    // Automatically advance target date by 1 day and chain `From` to `Stayed At` for fast multi-day tour entry!
    const numericDate = parseInt(targetDateStr, 10);
    if (!isNaN(numericDate) && numericDate < bill.rows.length) {
      setTripTargetDate(String(numericDate + 1));
    }
    if (tripStayedAt.trim()) {
      setTripFrom(tripStayedAt.trim());
    }

    globalToast.success(
      `Applied Outside Guwahati trip (${tripFrom} → ${tripTo}) on Date ${targetDateStr}!`
    );
  };

  // Apply a saved Outstation Route Preset to the selected target date (and load into form)
  const handleApplyRoutePresetToDate = (preset: OutstationRoutePreset) => {
    setTripFrom(preset.from);
    setTripTo(preset.to);
    setTripStayedAt(preset.stayedAt);
    setTripMode(preset.mode);
    setTripKm(preset.km);
    setTripTa(preset.ta);
    setTripDa(preset.da);
    setTripOthers(preset.others);

    const targetDateStr = tripTargetDate.trim();
    if (!targetDateStr) return;

    setBill((prev) => ({
      ...prev,
      rows: prev.rows.map((r) => {
        if (String(r.date).trim() !== targetDateStr) return r;
        return {
          ...r,
          from: preset.from,
          to: preset.to,
          stayedAt: preset.stayedAt,
          mode: preset.mode,
          km: preset.km,
          ta: preset.ta,
          da: preset.da,
          others: preset.others
        };
      }),
      updatedAt: new Date().toISOString()
    }));

    const numericDate = parseInt(targetDateStr, 10);
    if (!isNaN(numericDate) && numericDate < bill.rows.length) {
      setTripTargetDate(String(numericDate + 1));
    }

    globalToast.success(`Set Date ${targetDateStr}: ${preset.label}`);
  };

  // Save current Outside Guwahati form as a reusable Route Preset
  const handleSaveCurrentTripAsPreset = () => {
    if (!tripFrom.trim() || !tripTo.trim()) {
      globalToast.error('Please enter From and To cities before saving a route preset.');
      return;
    }
    const label = `${tripFrom.trim()} → ${tripTo.trim()} (${
      tripKm ? `${tripKm} KM` : tripMode || 'Tour'
    })`;
    const newPreset: OutstationRoutePreset = {
      id: `preset-${Date.now()}`,
      label,
      from: tripFrom.trim(),
      to: tripTo.trim(),
      stayedAt: tripStayedAt.trim() || tripTo.trim(),
      mode: tripMode.trim(),
      km: tripKm.trim(),
      ta: tripTa.trim(),
      da: tripDa.trim(),
      others: tripOthers.trim()
    };
    setOutstationPresets((prev) => [newPreset, ...prev]);
    globalToast.success(`Saved route preset: "${label}"`);
  };

  const handleDeleteRoutePreset = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setOutstationPresets((prev) => prev.filter((p) => p.id !== id));
    globalToast.info('Removed route preset');
  };

  // Update metadata field
  const updateHeaderField = (field: keyof ExpenditureBillDocument, value: any) => {
    setBill((prev) => ({
      ...prev,
      [field]: value,
      updatedAt: new Date().toISOString()
    }));
  };

  // Update single cell in a row
  const updateRowCell = (rowId: string, field: keyof ExpenditureRow, value: string) => {
    setBill((prev) => {
      const nextRows = prev.rows.map((row) => {
        if (row.id !== rowId) return row;
        const updated: ExpenditureRow = { ...row, [field]: value };

        // If user types KM and autoCalculateTaFromKm is enabled (and Mode is not Bus where ticket goes to Others)
        if (field === 'km' && autoCalculateTaFromKm) {
          const numKm = parseFloat(value);
          const rate = parseFloat(taRatePerKm) || 0;
          const modeLower = (updated.mode || '').toLowerCase().trim();
          if (!isNaN(numKm) && numKm > 0 && rate > 0 && modeLower !== 'bus') {
            const computedTa = Math.round(numKm * rate * 100) / 100;
            updated.ta = String(computedTa);
          } else if (value.trim() === '') {
            updated.ta = '';
          }
        }
        return updated;
      });
      return {
        ...prev,
        rows: nextRows,
        updatedAt: new Date().toISOString()
      };
    });
  };

  // Apply quick preset to a single row
  const applyRowPreset = (
    rowId: string,
    preset: 'hq' | 'outstation' | 'sunday' | 'holiday' | 'off' | 'clear',
    customHolidayLabel?: string
  ) => {
    setBill((prev) => {
      const rowIndex = prev.rows.findIndex((r) => r.id === rowId);
      const prevRow = rowIndex > 0 ? prev.rows[rowIndex - 1] : undefined;
      const previousStayedCity =
        prevRow?.stayedAt &&
        !prevRow.stayedAt.toUpperCase().includes('SUNDAY') &&
        prevRow.stayedAt !== 'Off'
          ? prevRow.stayedAt
          : defaultHqCity;

      return {
        ...prev,
        rows: prev.rows.map((row) => {
          if (row.id !== rowId) return row;
          if (preset === 'hq') {
            return {
              ...row,
              from: defaultHqCity,
              to: defaultHqCity,
              stayedAt: defaultHqCity,
              mode: defaultHqMode,
              km: defaultHqKm,
              ta: defaultHqTa,
              da: defaultLocalDa,
              others: defaultHqOthers
            };
          }
          if (preset === 'outstation') {
            setTripTargetDate(row.date || '1');
            return {
              ...row,
              from:
                row.from &&
                !row.from.toUpperCase().includes('SUNDAY') &&
                !row.from.toUpperCase().includes('HOLIDAY') &&
                row.from !== 'Off'
                  ? row.from
                  : previousStayedCity,
              to: row.to && row.to !== defaultHqCity ? row.to : '',
              stayedAt: row.stayedAt && row.stayedAt !== defaultHqCity ? row.stayedAt : '',
              mode: row.mode && row.mode !== defaultHqMode ? row.mode : defaultOutstationMode || 'Traveller',
              da: defaultOutstationDa
            };
          }
          if (preset === 'sunday') {
            return {
              ...row,
              from: '( SUNDAY )',
              to: '',
              stayedAt: '',
              mode: '',
              km: '',
              ta: '',
              da: '',
              others: ''
            };
          }
          if (preset === 'holiday') {
            const dayNum = parseInt(String(row.date || '').trim(), 10);
            const matchedHoliday = !isNaN(dayNum) ? activeMonthHolidaysMap.get(dayNum) : undefined;
            const labelToUse =
              customHolidayLabel ||
              (matchedHoliday ? formatHolidayCellText(matchedHoliday) : '( NATIONAL HOLIDAY )');
            return {
              ...row,
              from: labelToUse,
              to: '',
              stayedAt: '',
              mode: '',
              km: '',
              ta: '',
              da: '',
              others: ''
            };
          }
          if (preset === 'off') {
            return {
              ...row,
              from: 'Off',
              to: '',
              stayedAt: '',
              mode: '',
              km: '',
              ta: '',
              da: '',
              others: ''
            };
          }
          return {
            ...row,
            from: '',
            to: '',
            stayedAt: '',
            mode: '',
            km: '',
            ta: '',
            da: '',
            others: ''
          };
        }),
        updatedAt: new Date().toISOString()
      };
    });
  };

  // Helper to get holidays map for any given monthIdx and year
  const getHolidaysMapForMonthYear = (monthIdx: number, year: number): Map<number, IndiaHolidayEntry> => {
    const map = new Map<number, IndiaHolidayEntry>();
    const allList = [...BUILTIN_INDIA_HOLIDAYS, ...customHolidays];
    allList.forEach((h) => {
      if (h.monthIndex !== monthIdx) return;
      if (h.year !== undefined && h.year !== year) return;
      if (holidayScope === 'national_only' && h.type !== 'national' && h.type !== 'custom') return;
      const existing = map.get(h.day);
      if (!existing || h.type === 'national' || h.type === 'custom' || h.year !== undefined) {
        map.set(h.day, h);
      }
    });
    return map;
  };

  // Parse a typed preparation month label (e.g., "September 26", "October 2026", "Nov 26") into { monthIndex, year }
  const parsePreparationMonthLabel = (
    rawLabel: string,
    fallbackMonthIdx: number,
    fallbackYear: number
  ): { monthIndex: number; year: number; matched: boolean } => {
    const clean = (rawLabel || '').trim();
    if (!clean) return { monthIndex: fallbackMonthIdx, year: fallbackYear, matched: false };

    let detectedMonth = -1;
    const lower = clean.toLowerCase();
    for (let i = 0; i < MONTHS_LIST.length; i++) {
      const fullLower = MONTHS_LIST[i].toLowerCase();
      const short3 = fullLower.slice(0, 3);
      const regex = new RegExp(`\\b(${fullLower}|${short3})\\b`, 'i');
      if (regex.test(lower)) {
        detectedMonth = i;
        break;
      }
    }

    if (detectedMonth === -1) {
      return { monthIndex: fallbackMonthIdx, year: fallbackYear, matched: false };
    }

    let detectedYear = fallbackYear;
    const yearMatch = clean.match(/\b(20\d{2}|\d{2})\b/);
    if (yearMatch) {
      const yrNum = parseInt(yearMatch[1], 10);
      if (!isNaN(yrNum)) {
        detectedYear = yrNum < 100 ? 2000 + yrNum : yrNum;
      }
    }

    return { monthIndex: detectedMonth, year: detectedYear, matched: true };
  };

  // Automatically synchronize existing rows' Sundays (and month length) when Preparation Month or Year changes
  const syncRowsSundaysForPreparationMonth = (
    existingRows: ExpenditureRow[],
    monthIdx: number,
    year: number
  ): ExpenditureRow[] => {
    const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
    const monthHolidaysMap = getHolidaysMapForMonthYear(monthIdx, year);
    const existingByDay = new Map<number, ExpenditureRow>();

    existingRows.forEach((r) => {
      const d = parseInt(String(r.date || '').trim(), 10);
      if (!isNaN(d) && d >= 1 && d <= 31 && !existingByDay.has(d)) {
        existingByDay.set(d, r);
      }
    });

    const syncedRows: ExpenditureRow[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const isSunday = new Date(year, monthIdx, d).getDay() === 0;
      const indiaHoliday = autoIncludeIndiaHolidays ? monthHolidaysMap.get(d) : undefined;
      const existing = existingByDay.get(d);

      if (isSunday) {
        syncedRows.push({
          id: existing?.id || `row-${d}-${Date.now()}`,
          date: String(d),
          from: indiaHoliday ? `( SUNDAY / ${indiaHoliday.name} )` : '( SUNDAY )',
          to: '',
          stayedAt: '',
          mode: '',
          km: '',
          ta: '',
          da: '',
          others: ''
        });
      } else if (indiaHoliday) {
        syncedRows.push({
          id: existing?.id || `row-${d}-${Date.now()}`,
          date: String(d),
          from: formatHolidayCellText(indiaHoliday),
          to: '',
          stayedAt: '',
          mode: '',
          km: '',
          ta: '',
          da: '',
          others: ''
        });
      } else if (existing) {
        const prevFromUpper = (existing.from || '').toUpperCase().trim();
        const wasOldSundayOrHoliday =
          prevFromUpper.includes('SUNDAY') ||
          prevFromUpper.includes('HOLIDAY') ||
          prevFromUpper.includes('REPUBLIC DAY') ||
          prevFromUpper.includes('INDEPENDENCE DAY') ||
          prevFromUpper.includes('JAYANTI') ||
          prevFromUpper.includes('BIHU') ||
          prevFromUpper.includes('PUJA') ||
          prevFromUpper.includes('DIWALI') ||
          prevFromUpper.includes('HOLI') ||
          prevFromUpper.includes('EID') ||
          prevFromUpper.includes('GOOD FRIDAY') ||
          prevFromUpper.includes('CHRISTMAS');

        if (wasOldSundayOrHoliday) {
          // Date was a Sunday/Holiday in the previous month, now it's a working weekday in the new preparation month
          syncedRows.push({
            ...existing,
            date: String(d),
            from: defaultHqCity,
            to: defaultHqCity,
            stayedAt: defaultHqCity,
            mode: defaultHqMode,
            km: defaultHqKm,
            ta: defaultHqTa,
            da: defaultLocalDa,
            others: defaultHqOthers
          });
        } else {
          syncedRows.push({
            ...existing,
            date: String(d)
          });
        }
      } else {
        // Newly added day at the end of the month (e.g., 31st)
        syncedRows.push({
          id: `row-${d}-${Date.now()}`,
          date: String(d),
          from: defaultHqCity,
          to: defaultHqCity,
          stayedAt: defaultHqCity,
          mode: defaultHqMode,
          km: defaultHqKm,
          ta: defaultHqTa,
          da: defaultLocalDa,
          others: defaultHqOthers
        });
      }
    }

    return syncedRows;
  };

  // Handle Preparation Month change from Dropdowns or Bill Month Label input
  const handleSelectPreparationMonthYear = (newMonthIdx: number, newYear: number, customLabel?: string) => {
    const shortYr = String(newYear).slice(-2);
    const labelToUse = customLabel !== undefined ? customLabel : `${MONTHS_LIST[newMonthIdx]} ${shortYr}`;

    setBill((prev) => {
      const nextRows = autoAddSundaysForMonth
        ? syncRowsSundaysForPreparationMonth(prev.rows, newMonthIdx, newYear)
        : prev.rows;

      return {
        ...prev,
        selectedMonthIndex: newMonthIdx,
        selectedYear: newYear,
        billMonthLabel: labelToUse,
        rows: nextRows,
        updatedAt: new Date().toISOString()
      };
    });
  };

  // Explicitly mark all Sundays for the current preparation month
  const handleAutoApplyMonthSundaysToCurrentBill = () => {
    setBill((prev) => ({
      ...prev,
      rows: syncRowsSundaysForPreparationMonth(prev.rows, prev.selectedMonthIndex, prev.selectedYear),
      updatedAt: new Date().toISOString()
    }));
    globalToast.success(
      `Automatically marked Sundays (${activeMonthSundaysList.join(', ')}) for ${
        MONTHS_LIST[bill.selectedMonthIndex]
      } ${bill.selectedYear}!`
    );
  };

  // Generate calendar days for selected month & year and auto-mark Sundays + India National Holidays
  const handleGenerateCalendarDays = (monthIdx: number, year: number, fillHqOnWeekdays: boolean) => {
    const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
    const shortYear = String(year).slice(-2);
    const newLabel = `${MONTHS_LIST[monthIdx]} ${shortYear}`;
    const monthHolidaysMap = getHolidaysMapForMonthYear(monthIdx, year);

    const generatedRows: ExpenditureRow[] = [];
    let holidaysMarkedCount = 0;

    for (let d = 1; d <= daysInMonth; d++) {
      const dateObj = new Date(year, monthIdx, d);
      const isSunday = dateObj.getDay() === 0;
      const indiaHoliday = autoIncludeIndiaHolidays ? monthHolidaysMap.get(d) : undefined;

      if (indiaHoliday && isSunday) {
        holidaysMarkedCount++;
        generatedRows.push({
          id: `row-${d}-${Date.now()}`,
          date: String(d),
          from: `( SUNDAY / ${indiaHoliday.name} )`,
          to: '',
          stayedAt: '',
          mode: '',
          km: '',
          ta: '',
          da: '',
          others: ''
        });
      } else if (indiaHoliday) {
        holidaysMarkedCount++;
        generatedRows.push({
          id: `row-${d}-${Date.now()}`,
          date: String(d),
          from: formatHolidayCellText(indiaHoliday),
          to: '',
          stayedAt: '',
          mode: '',
          km: '',
          ta: '',
          da: '',
          others: ''
        });
      } else if (isSunday) {
        generatedRows.push({
          id: `row-${d}-${Date.now()}`,
          date: String(d),
          from: '( SUNDAY )',
          to: '',
          stayedAt: '',
          mode: '',
          km: '',
          ta: '',
          da: '',
          others: ''
        });
      } else if (fillHqOnWeekdays) {
        generatedRows.push({
          id: `row-${d}-${Date.now()}`,
          date: String(d),
          from: defaultHqCity,
          to: defaultHqCity,
          stayedAt: defaultHqCity,
          mode: defaultHqMode,
          km: defaultHqKm,
          ta: defaultHqTa,
          da: defaultLocalDa,
          others: defaultHqOthers
        });
      } else {
        generatedRows.push({
          id: `row-${d}-${Date.now()}`,
          date: String(d),
          from: '',
          to: '',
          stayedAt: '',
          mode: '',
          km: '',
          ta: '',
          da: '',
          others: ''
        });
      }
    }

    setBill((prev) => ({
      ...prev,
      id: `bill-${monthIdx + 1}-${year}-${Date.now()}`,
      selectedMonthIndex: monthIdx,
      selectedYear: year,
      billMonthLabel: newLabel,
      rows: generatedRows,
      updatedAt: new Date().toISOString()
    }));

    globalToast.success(
      `Generated ${daysInMonth} days for ${newLabel} (Sundays + ${holidaysMarkedCount} India Holiday${
        holidaysMarkedCount === 1 ? '' : 's'
      } auto-marked)`
    );
  };

  // Auto-apply all India holidays for the currently loaded bill's month & year
  const handleAutoApplyMonthHolidaysToCurrentBill = () => {
    if (activeMonthHolidaysList.length === 0) {
      globalToast.info(`No India holidays found for ${MONTHS_LIST[bill.selectedMonthIndex]} ${bill.selectedYear}.`);
      return;
    }

    let appliedCount = 0;
    setBill((prev) => {
      const nextRows = prev.rows.map((row) => {
        const dayNum = parseInt(String(row.date || '').trim(), 10);
        if (isNaN(dayNum)) return row;
        const holiday = activeMonthHolidaysMap.get(dayNum);
        if (!holiday) return row;

        appliedCount++;
        const fromUpper = (row.from || '').toUpperCase();
        const isSunday = fromUpper.includes('SUNDAY');
        return {
          ...row,
          from: isSunday ? `( SUNDAY / ${holiday.name} )` : formatHolidayCellText(holiday),
          to: '',
          stayedAt: '',
          mode: '',
          km: '',
          ta: '',
          da: '',
          others: ''
        };
      });
      return {
        ...prev,
        rows: nextRows,
        updatedAt: new Date().toISOString()
      };
    });

    globalToast.success(
      `Marked ${appliedCount} India Holiday${appliedCount === 1 ? '' : 's'} in ${
        MONTHS_LIST[bill.selectedMonthIndex]
      } ${bill.selectedYear}!`
    );
  };

  // Toggle a single holiday date on the current bill between Holiday and HQ Working Day
  const handleToggleSingleHolidayOnBill = (holiday: IndiaHolidayEntry) => {
    setBill((prev) => {
      const nextRows = prev.rows.map((row) => {
        const dayNum = parseInt(String(row.date || '').trim(), 10);
        if (dayNum !== holiday.day) return row;

        const currentFromUpper = (row.from || '').toUpperCase();
        const isAlreadyMarkedHoliday =
          currentFromUpper.includes('HOLIDAY') || currentFromUpper.includes(holiday.name.toUpperCase());

        if (isAlreadyMarkedHoliday) {
          const dateObj = new Date(prev.selectedYear, prev.selectedMonthIndex, holiday.day);
          if (dateObj.getDay() === 0) {
            return {
              ...row,
              from: '( SUNDAY )',
              to: '',
              stayedAt: '',
              mode: '',
              km: '',
              ta: '',
              da: '',
              others: ''
            };
          }
          return {
            ...row,
            from: defaultHqCity,
            to: defaultHqCity,
            stayedAt: defaultHqCity,
            mode: defaultHqMode,
            km: defaultHqKm,
            ta: defaultHqTa,
            da: defaultLocalDa,
            others: defaultHqOthers
          };
        }

        return {
          ...row,
          from: formatHolidayCellText(holiday),
          to: '',
          stayedAt: '',
          mode: '',
          km: '',
          ta: '',
          da: '',
          others: ''
        };
      });
      return {
        ...prev,
        rows: nextRows,
        updatedAt: new Date().toISOString()
      };
    });
  };

  // Add custom holiday for current month & year
  const handleAddCustomHoliday = (e: React.FormEvent) => {
    e.preventDefault();
    const dayNum = parseInt(newCustomHolidayDay.trim(), 10);
    const cleanName = newCustomHolidayName.trim().toUpperCase();
    if (isNaN(dayNum) || dayNum < 1 || dayNum > 31 || !cleanName) {
      globalToast.error('Please enter a valid day (1-31) and holiday name.');
      return;
    }

    const newEntry: IndiaHolidayEntry = {
      day: dayNum,
      monthIndex: bill.selectedMonthIndex,
      year: bill.selectedYear,
      name: cleanName,
      type: 'custom'
    };

    setCustomHolidays((prev) => [
      ...prev.filter(
        (h) => !(h.day === dayNum && h.monthIndex === bill.selectedMonthIndex && h.year === bill.selectedYear)
      ),
      newEntry
    ]);

    setBill((prev) => ({
      ...prev,
      rows: prev.rows.map((row) => {
        if (parseInt(String(row.date || '').trim(), 10) !== dayNum) return row;
        return {
          ...row,
          from: formatHolidayCellText(newEntry),
          to: '',
          stayedAt: '',
          mode: '',
          km: '',
          ta: '',
          da: '',
          others: ''
        };
      }),
      updatedAt: new Date().toISOString()
    }));

    setNewCustomHolidayDay('');
    setNewCustomHolidayName('');
    globalToast.success(
      `Added & marked "${cleanName}" on ${dayNum} ${MONTHS_LIST[bill.selectedMonthIndex]} ${bill.selectedYear}`
    );
  };

  // Fill empty non-Sunday, non-Holiday rows with HQ defaults
  const handleFillEmptyWeekdaysWithHq = () => {
    setBill((prev) => ({
      ...prev,
      rows: prev.rows.map((row) => {
        const dayNum = parseInt(String(row.date || '').trim(), 10);
        const isHolidayDate = autoIncludeIndiaHolidays && !isNaN(dayNum) && activeMonthHolidaysMap.has(dayNum);
        const fromUpper = (row.from || '').toUpperCase().trim();
        const isSundayOrOff =
          fromUpper.includes('SUNDAY') ||
          fromUpper === 'OFF' ||
          fromUpper === 'LEAVE' ||
          fromUpper.includes('HOLIDAY') ||
          isHolidayDate;
        const isAlreadyFilled = !!(row.from.trim() || row.to.trim() || row.da.trim() || row.ta.trim() || row.others.trim());
        if (isSundayOrOff || isAlreadyFilled) return row;
        return {
          ...row,
          from: defaultHqCity,
          to: defaultHqCity,
          stayedAt: defaultHqCity,
          mode: defaultHqMode,
          km: defaultHqKm,
          ta: defaultHqTa,
          da: defaultLocalDa,
          others: defaultHqOthers
        };
      }),
      updatedAt: new Date().toISOString()
    }));
    globalToast.success(`Filled empty working days with ${defaultHqCity} (${defaultHqMode}, DA: ${defaultLocalDa})`);
  };

  // Handle HQ KM change inside Smart Auto-Fill Defaults Editor
  const handleDefaultHqKmChange = (val: string, currentMode = defaultHqMode) => {
    setDefaultHqKm(val);
    if (autoCalculateTaFromKm) {
      const numKm = parseFloat(val);
      const rate = parseFloat(taRatePerKm) || 0;
      const modeLower = (currentMode || '').toLowerCase().trim();
      if (!isNaN(numKm) && numKm > 0 && rate > 0 && modeLower !== 'bus') {
        setDefaultHqTa(String(Math.round(numKm * rate * 100) / 100));
      } else if (val.trim() === '' || modeLower === 'bus') {
        setDefaultHqTa('');
      }
    }
  };

  // Explicitly save Smart Auto-Fill & TA/DA Defaults and sync Trip Builder defaults
  const handleSaveSmartDefaults = () => {
    try {
      const payload: SmartTaDaDefaults = {
        hqCity: defaultHqCity,
        hqMode: defaultHqMode,
        hqKm: defaultHqKm,
        hqTa: defaultHqTa,
        localDa: defaultLocalDa,
        hqOthers: defaultHqOthers,
        outstationMode: defaultOutstationMode,
        outstationDa: defaultOutstationDa,
        taRatePerKm,
        autoCalculateTaFromKm
      };
      safeLocalStorage.setItem(STORAGE_KEY_TADA_DEFAULTS, JSON.stringify(payload));
      setTripDa(defaultOutstationDa);
      if (defaultOutstationMode) {
        setTripMode(defaultOutstationMode);
      }
      setIsEditingSmartDefaults(false);
      globalToast.success(
        `Saved Smart Auto-Fill & TA/DA Defaults (HQ: ${defaultHqCity}, Local DA: ₹${defaultLocalDa}, Outstation DA: ₹${defaultOutstationDa}, Rate: ₹${taRatePerKm}/KM)!`
      );
    } catch (e) {
      console.error('Failed to save Smart TA/DA defaults:', e);
      globalToast.error('Could not save Smart TA/DA defaults.');
    }
  };

  // Reset Smart Auto-Fill & TA/DA Defaults back to standard factory defaults
  const handleResetSmartDefaultsToFactory = () => {
    setDefaultHqCity(DEFAULT_SMART_TADA_DEFAULTS.hqCity);
    setDefaultHqMode(DEFAULT_SMART_TADA_DEFAULTS.hqMode);
    setDefaultHqKm(DEFAULT_SMART_TADA_DEFAULTS.hqKm);
    setDefaultHqTa(DEFAULT_SMART_TADA_DEFAULTS.hqTa);
    setDefaultLocalDa(DEFAULT_SMART_TADA_DEFAULTS.localDa);
    setDefaultHqOthers(DEFAULT_SMART_TADA_DEFAULTS.hqOthers);
    setDefaultOutstationMode(DEFAULT_SMART_TADA_DEFAULTS.outstationMode);
    setDefaultOutstationDa(DEFAULT_SMART_TADA_DEFAULTS.outstationDa);
    setTaRatePerKm(DEFAULT_SMART_TADA_DEFAULTS.taRatePerKm);
    setAutoCalculateTaFromKm(DEFAULT_SMART_TADA_DEFAULTS.autoCalculateTaFromKm);
    setTripDa(DEFAULT_SMART_TADA_DEFAULTS.outstationDa);
    setTripMode(DEFAULT_SMART_TADA_DEFAULTS.outstationMode);
    globalToast.info('Reset Smart Auto-Fill & TA/DA Defaults to standard values (Guwahati, Bike, Local DA 150, Outstation DA 200, TA Rate 2.2).');
  };

  // Batch-update all existing HQ (Local Working) rows in the current bill with edited HQ Defaults
  const handleApplyHqDefaultsToExistingRows = () => {
    let updatedCount = 0;
    setBill((prev) => {
      const nextRows = prev.rows.map((row) => {
        const fromTrim = (row.from || '').trim();
        const toTrim = (row.to || '').trim();
        const stayTrim = (row.stayedAt || '').trim();
        const fromUpper = fromTrim.toUpperCase();

        const isSundayOrHolidayOrOff =
          !fromTrim ||
          fromUpper.includes('SUNDAY') ||
          fromUpper.includes('HOLIDAY') ||
          fromUpper === 'OFF' ||
          fromUpper === 'LEAVE';

        if (isSundayOrHolidayOrOff) return row;

        // A row is considered a Local HQ working row if From === To === StayedAt (same city local duty)
        const isLocalSameCityRow =
          fromTrim.toLowerCase() === toTrim.toLowerCase() &&
          (!stayTrim || stayTrim.toLowerCase() === fromTrim.toLowerCase()) &&
          !(parseFloat(row.km) > 0 && fromTrim.toLowerCase() !== defaultHqCity.trim().toLowerCase());

        if (!isLocalSameCityRow) return row;

        updatedCount++;
        return {
          ...row,
          from: defaultHqCity,
          to: defaultHqCity,
          stayedAt: defaultHqCity,
          mode: defaultHqMode,
          km: defaultHqKm,
          ta: defaultHqTa,
          da: defaultLocalDa,
          others: defaultHqOthers || row.others
        };
      });

      return {
        ...prev,
        rows: nextRows,
        updatedAt: new Date().toISOString()
      };
    });

    if (updatedCount > 0) {
      globalToast.success(
        `Updated ${updatedCount} HQ working row${updatedCount === 1 ? '' : 's'} in current bill to ${defaultHqCity} (${defaultHqMode}, DA: ₹${defaultLocalDa})!`
      );
    } else {
      globalToast.info('No existing HQ rows found in current bill. Use "+ Fill Empty HQ Days" to populate blank days.');
    }
  };

  // Batch-recalculate all Outstation rows in the current bill using the new TA Rate/KM and Outstation DA
  const handleRecalculateOutstationRowsWithDefaults = () => {
    let updatedCount = 0;
    const rate = parseFloat(taRatePerKm) || 0;
    const hqLower = (defaultHqCity || 'Guwahati').trim().toLowerCase();

    setBill((prev) => {
      const nextRows = prev.rows.map((row) => {
        const fromTrim = (row.from || '').trim();
        const toTrim = (row.to || '').trim();
        const stayTrim = (row.stayedAt || '').trim();
        const fromUpper = fromTrim.toUpperCase();

        const isSundayOrHolidayOrOff =
          !fromTrim ||
          fromUpper.includes('SUNDAY') ||
          fromUpper.includes('HOLIDAY') ||
          fromUpper === 'OFF' ||
          fromUpper === 'LEAVE';

        if (isSundayOrHolidayOrOff) return row;

        const numKm = parseFloat(row.km);
        const isOutstationRow =
          fromTrim.toLowerCase() !== hqLower ||
          (toTrim && toTrim.toLowerCase() !== hqLower) ||
          (stayTrim && stayTrim.toLowerCase() !== hqLower) ||
          (!isNaN(numKm) && numKm > 0 && fromTrim.toLowerCase() !== toTrim.toLowerCase());

        if (!isOutstationRow) return row;

        updatedCount++;
        const modeLower = (row.mode || '').toLowerCase().trim();
        let nextTa = row.ta;
        if (!isNaN(numKm) && numKm > 0 && rate > 0 && modeLower !== 'bus') {
          nextTa = String(Math.round(numKm * rate * 100) / 100);
        }

        return {
          ...row,
          ta: nextTa,
          da: row.da.trim() ? defaultOutstationDa : row.da
        };
      });

      return {
        ...prev,
        rows: nextRows,
        updatedAt: new Date().toISOString()
      };
    });

    // Also recalculate current Trip Builder TA & DA
    const builderKm = parseFloat(tripKm);
    if (!isNaN(builderKm) && builderKm > 0 && rate > 0 && tripMode.toLowerCase().trim() !== 'bus') {
      setTripTa(String(Math.round(builderKm * rate * 100) / 100));
    }
    setTripDa(defaultOutstationDa);

    if (updatedCount > 0) {
      globalToast.success(
        `Recalculated ${updatedCount} Outstation row${updatedCount === 1 ? '' : 's'} with TA Rate ₹${taRatePerKm}/KM & Outstation DA ₹${defaultOutstationDa}!`
      );
    } else {
      globalToast.info('No outstation rows found in current bill to recalculate.');
    }
  };

  // Sync saved Outstation Route Presets with new TA Rate/KM & Outstation DA
  const handleSyncRoutePresetsWithDefaults = () => {
    const rate = parseFloat(taRatePerKm) || 0;
    setOutstationPresets((prev) =>
      prev.map((preset) => {
        const numKm = parseFloat(preset.km);
        const modeLower = (preset.mode || '').toLowerCase().trim();
        const nextTa =
          !isNaN(numKm) && numKm > 0 && rate > 0 && modeLower !== 'bus'
            ? String(Math.round(numKm * rate * 100) / 100)
            : preset.ta;
        return {
          ...preset,
          ta: nextTa,
          da: preset.da.trim() ? defaultOutstationDa : preset.da
        };
      })
    );
    globalToast.success(
      `Updated all ${outstationPresets.length} Saved Route Presets with TA Rate ₹${taRatePerKm}/KM & Outstation DA ₹${defaultOutstationDa}!`
    );
  };

  // Add a new row at the bottom
  const handleAddRow = () => {
    setBill((prev) => {
      const nextDateNum = prev.rows.length + 1;
      return {
        ...prev,
        rows: [
          ...prev.rows,
          {
            id: `row-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            date: String(nextDateNum),
            from: '',
            to: '',
            stayedAt: '',
            mode: '',
            km: '',
            ta: '',
            da: '',
            others: ''
          }
        ],
        updatedAt: new Date().toISOString()
      };
    });
  };

  // Delete a specific row
  const handleDeleteRow = (rowId: string) => {
    setBill((prev) => ({
      ...prev,
      rows: prev.rows.filter((r) => r.id !== rowId),
      updatedAt: new Date().toISOString()
    }));
  };

  // Helper to resolve effective row for any given target bill (active or archived)
  const getEffectiveRowForTargetBill = (
    targetBill: ExpenditureBillDocument,
    row: ExpenditureRow
  ): ExpenditureRow => {
    if (targetBill.id === bill.id) {
      return getEffectiveRowForBill(row);
    }
    if (!autoAddSundaysForMonth) return row;

    const dayNum = parseInt(String(row.date || '').trim(), 10);
    const totalDays = new Date(targetBill.selectedYear, targetBill.selectedMonthIndex + 1, 0).getDate();
    if (isNaN(dayNum) || dayNum < 1 || dayNum > totalDays) return row;

    const isSun = new Date(targetBill.selectedYear, targetBill.selectedMonthIndex, dayNum).getDay() === 0;
    if (!isSun) return row;

    const fromUpper = (row.from || '').toUpperCase().trim();
    if (fromUpper.includes('SUNDAY')) return row;

    const hqLower = (defaultHqCity || 'Guwahati').toLowerCase().trim();
    const toLower = (row.to || '').toLowerCase().trim();
    const stayLower = (row.stayedAt || '').toLowerCase().trim();
    const hasOutstationTripOnSunday =
      (toLower !== '' && toLower !== hqLower) ||
      (stayLower !== '' && stayLower !== hqLower) ||
      (row.km || '').trim() !== '' ||
      (row.ta || '').trim() !== '' ||
      (row.others || '').trim() !== '';

    if (hasOutstationTripOnSunday) return row;

    const targetHolidaysMap = getHolidaysMapForMonthYear(
      targetBill.selectedMonthIndex,
      targetBill.selectedYear
    );
    const holiday = autoIncludeIndiaHolidays ? targetHolidaysMap.get(dayNum) : undefined;

    return {
      ...row,
      from: holiday ? `( SUNDAY / ${holiday.name} )` : '( SUNDAY )',
      to: '',
      stayedAt: '',
      mode: '',
      km: '',
      ta: '',
      da: '',
      others: ''
    };
  };

  // Upload & Synchronize Prepared Bills + Settings to Built-In Free Local Server Storage (Zero Cloud Billing)
  const handleUploadToCloudSync = async (
    silent: boolean = false,
    overrideBills?: ExpenditureBillDocument[],
    overrideActiveBill?: ExpenditureBillDocument
  ) => {
    setIsCloudUploading(true);
    try {
      const currentActive = {
        ...(overrideActiveBill || bill),
        updatedAt: new Date().toISOString()
      };

      const baseBills = overrideBills || savedBills;
      const existsInList = baseBills.some((b) => b.id === currentActive.id);
      const mergedBills: ExpenditureBillDocument[] = existsInList
        ? baseBills.map((b) => (b.id === currentActive.id ? currentActive : b))
        : [currentActive, ...baseBills];

      setSavedBills(mergedBills);

      const smartDefaultsPayload: SmartTaDaDefaults = {
        hqCity: defaultHqCity,
        hqMode: defaultHqMode,
        hqKm: defaultHqKm,
        hqTa: defaultHqTa,
        localDa: defaultLocalDa,
        hqOthers: defaultHqOthers,
        outstationMode: defaultOutstationMode,
        outstationDa: defaultOutstationDa,
        taRatePerKm,
        autoCalculateTaFromKm
      };

      const res = await fetch('/api/expenditure-bills/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activeBill: currentActive,
          savedBills: mergedBills,
          smartTaDaDefaults: smartDefaultsPayload,
          customHolidays,
          outstationPresets
        })
      });

      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'Sync failed');
      }

      const syncStamp = new Date().toLocaleString([], {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      });
      setLastCloudSyncTime(syncStamp);
      setCloudSyncedBillIds(mergedBills.map((b) => b.id));

      if (!silent) {
        globalToast.success(
          `Synchronized ${mergedBills.length} prepared expenditure bill${
            mergedBills.length === 1 ? '' : 's'
          } & TA/DA settings (100% Free — No Cloud Billing)!`
        );
      }
    } catch (err: any) {
      console.warn('Local server sync warning:', err);
      if (!silent) {
        globalToast.info(
          'Saved in browser storage! Use "Save File (Drive)" to also download a .json copy for your Google Drive folder or device.'
        );
      }
    } finally {
      setIsCloudUploading(false);
    }
  };

  // Pull & Synchronize Prepared Bills + Settings from Built-In Free Local Server Storage for Re-Editing & PDF Download
  const handleSynchronizeFromCloud = async (silent: boolean = false) => {
    setIsCloudSyncing(true);
    try {
      const res = await fetch('/api/expenditure-bills/sync');
      const data = await res.json();

      const vaultData = data?.vault;
      const remoteBillsMap = new Map<string, ExpenditureBillDocument>();

      if (vaultData && typeof vaultData === 'object') {
        if (Array.isArray(vaultData.savedBills)) {
          vaultData.savedBills.forEach((b: any) => {
            if (b && b.id && Array.isArray(b.rows)) {
              remoteBillsMap.set(b.id, b as ExpenditureBillDocument);
            }
          });
        }
        if (vaultData.smartTaDaDefaults && typeof vaultData.smartTaDaDefaults === 'object') {
          const sd = vaultData.smartTaDaDefaults as SmartTaDaDefaults;
          if (sd.hqCity) setDefaultHqCity(sd.hqCity);
          if (sd.hqMode) setDefaultHqMode(sd.hqMode);
          if (typeof sd.hqKm === 'string') setDefaultHqKm(sd.hqKm);
          if (typeof sd.hqTa === 'string') setDefaultHqTa(sd.hqTa);
          if (sd.localDa) setDefaultLocalDa(sd.localDa);
          if (typeof sd.hqOthers === 'string') setDefaultHqOthers(sd.hqOthers);
          if (sd.outstationMode) setDefaultOutstationMode(sd.outstationMode);
          if (sd.outstationDa) setDefaultOutstationDa(sd.outstationDa);
          if (sd.taRatePerKm) setTaRatePerKm(sd.taRatePerKm);
          if (typeof sd.autoCalculateTaFromKm === 'boolean') {
            setAutoCalculateTaFromKm(sd.autoCalculateTaFromKm);
          }
        }
        if (Array.isArray(vaultData.customHolidays) && vaultData.customHolidays.length > 0) {
          setCustomHolidays(vaultData.customHolidays);
        }
        if (Array.isArray(vaultData.outstationPresets) && vaultData.outstationPresets.length > 0) {
          setOutstationPresets(vaultData.outstationPresets);
        }
      }

      if (remoteBillsMap.size === 0) {
        if (!silent) {
          globalToast.info(
            'No server-synced bills found yet. Click "Sync Bills (Free)" to save your prepared bills.'
          );
        }
        return;
      }

      let addedOrUpdated = 0;
      setSavedBills((prev) => {
        const mergedMap = new Map<string, ExpenditureBillDocument>();
        prev.forEach((b) => mergedMap.set(b.id, b));

        remoteBillsMap.forEach((remoteBill, id) => {
          const localBill = mergedMap.get(id);
          if (!localBill) {
            mergedMap.set(id, remoteBill);
            addedOrUpdated++;
          } else {
            const remoteTime = new Date(remoteBill.updatedAt || 0).getTime();
            const localTime = new Date(localBill.updatedAt || 0).getTime();
            if (remoteTime > localTime) {
              mergedMap.set(id, remoteBill);
              addedOrUpdated++;
            }
          }
        });

        return Array.from(mergedMap.values()).sort(
          (a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime()
        );
      });

      // Also update active bill if server vault has a newer version of the same active bill
      const matchingRemoteActive = remoteBillsMap.get(bill.id);
      if (
        matchingRemoteActive &&
        new Date(matchingRemoteActive.updatedAt || 0).getTime() > new Date(bill.updatedAt || 0).getTime()
      ) {
        setBill(matchingRemoteActive);
      }

      const syncStamp = new Date().toLocaleString([], {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      });
      setLastCloudSyncTime(syncStamp);
      setCloudSyncedBillIds((prev) =>
        Array.from(new Set([...prev, ...Array.from(remoteBillsMap.keys())]))
      );

      if (!silent) {
        globalToast.success(
          `Synchronized ${remoteBillsMap.size} prepared bill${
            remoteBillsMap.size === 1 ? '' : 's'
          } (${addedOrUpdated} new/updated)! Click "Re-Edit" or "PDF" on any bill.`
        );
      }
    } catch (err) {
      console.warn('Local server pull warning:', err);
      if (!silent) {
        globalToast.info(
          'You can also use "Upload File (.json)" to load any saved prepared bill file from your device or Google Drive folder.'
        );
      }
    } finally {
      setIsCloudSyncing(false);
    }
  };

  // Auto-synchronize from Built-In Free Local Server Storage on initial mount
  useEffect(() => {
    if (autoCloudSync) {
      handleSynchronizeFromCloud(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Download Prepared Bill as a portable .json file (100% Free — keep in Google Drive folder or device to re-edit anytime)
  const handleDownloadPreparedBillFile = (targetBill?: ExpenditureBillDocument) => {
    const billToExport = targetBill && targetBill.rows ? targetBill : bill;
    const payload = {
      type: 'PTG_PREPARED_EXPENDITURE_BILL_V1',
      exportedAt: new Date().toISOString(),
      bill: {
        ...billToExport,
        updatedAt: new Date().toISOString()
      },
      smartTaDaDefaults: {
        hqCity: defaultHqCity,
        hqMode: defaultHqMode,
        hqKm: defaultHqKm,
        hqTa: defaultHqTa,
        localDa: defaultLocalDa,
        hqOthers: defaultHqOthers,
        outstationMode: defaultOutstationMode,
        outstationDa: defaultOutstationDa,
        taRatePerKm,
        autoCalculateTaFromKm
      },
      customHolidays,
      outstationPresets
    };

    const jsonString = JSON.stringify(payload, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const cleanMonth = (billToExport.billMonthLabel || 'BILL')
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .toUpperCase();
    a.href = url;
    a.download = `MONTHLY_EXPENDATURE_${cleanMonth}_PREPARED.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    globalToast.success(
      `Downloaded prepared file "MONTHLY_EXPENDATURE_${cleanMonth}_PREPARED.json" (Save in Google Drive or device to re-edit anytime!)`
    );
  };

  // Download Full Archive of All Saved Bills + Settings as a single .json file
  const handleDownloadFullArchiveFile = () => {
    const existsInList = savedBills.some((b) => b.id === bill.id);
    const allBills = existsInList
      ? savedBills.map((b) => (b.id === bill.id ? bill : b))
      : [bill, ...savedBills];

    const payload = {
      type: 'PTG_EXPENDITURE_BILLS_ARCHIVE_V1',
      exportedAt: new Date().toISOString(),
      activeBill: bill,
      savedBills: allBills,
      smartTaDaDefaults: {
        hqCity: defaultHqCity,
        hqMode: defaultHqMode,
        hqKm: defaultHqKm,
        hqTa: defaultHqTa,
        localDa: defaultLocalDa,
        hqOthers: defaultHqOthers,
        outstationMode: defaultOutstationMode,
        outstationDa: defaultOutstationDa,
        taRatePerKm,
        autoCalculateTaFromKm
      },
      customHolidays,
      outstationPresets
    };

    const jsonString = JSON.stringify(payload, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ALL_EXPENDITURE_BILLS_SYNC_ARCHIVE.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    globalToast.success(
      `Downloaded all ${allBills.length} prepared bills in "ALL_EXPENDITURE_BILLS_SYNC_ARCHIVE.json"!`
    );
  };

  // Upload a Prepared Bill File (.json) from Google Drive folder / computer to Re-Edit and Download PDF
  const handleUploadPreparedBillFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const rawText = String(event.target?.result || '');
        const parsed = JSON.parse(rawText);

        let loadedActiveBill: ExpenditureBillDocument | null = null;
        let loadedBillsList: ExpenditureBillDocument[] = [];

        // Case 1: Full Archive file (`PTG_EXPENDITURE_BILLS_ARCHIVE_V1`)
        if (parsed && Array.isArray(parsed.savedBills) && parsed.savedBills.length > 0) {
          loadedBillsList = parsed.savedBills.filter(
            (b: any) => b && b.id && Array.isArray(b.rows)
          );
          if (parsed.activeBill && Array.isArray(parsed.activeBill.rows)) {
            loadedActiveBill = parsed.activeBill;
          } else if (loadedBillsList.length > 0) {
            loadedActiveBill = loadedBillsList[0];
          }
        }
        // Case 2: Single Prepared Bill wrapper (`PTG_PREPARED_EXPENDITURE_BILL_V1`)
        else if (parsed && parsed.bill && Array.isArray(parsed.bill.rows)) {
          loadedActiveBill = parsed.bill;
          loadedBillsList = [parsed.bill];
        }
        // Case 3: Direct ExpenditureBillDocument JSON
        else if (parsed && Array.isArray(parsed.rows) && parsed.billMonthLabel) {
          const directBill: ExpenditureBillDocument = {
            ...parsed,
            id: parsed.id || `bill-imported-${Date.now()}`,
            updatedAt: new Date().toISOString()
          };
          loadedActiveBill = directBill;
          loadedBillsList = [directBill];
        }

        if (!loadedActiveBill || loadedBillsList.length === 0) {
          globalToast.error(
            'Invalid file format. Please upload a Prepared Expenditure Bill (.json) file.'
          );
          return;
        }

        // Restore optional Smart TA/DA Defaults, Custom Holidays, and Route Presets if included
        if (parsed.smartTaDaDefaults && typeof parsed.smartTaDaDefaults === 'object') {
          const sd = parsed.smartTaDaDefaults as SmartTaDaDefaults;
          if (sd.hqCity) setDefaultHqCity(sd.hqCity);
          if (sd.hqMode) setDefaultHqMode(sd.hqMode);
          if (typeof sd.hqKm === 'string') setDefaultHqKm(sd.hqKm);
          if (typeof sd.hqTa === 'string') setDefaultHqTa(sd.hqTa);
          if (sd.localDa) setDefaultLocalDa(sd.localDa);
          if (typeof sd.hqOthers === 'string') setDefaultHqOthers(sd.hqOthers);
          if (sd.outstationMode) setDefaultOutstationMode(sd.outstationMode);
          if (sd.outstationDa) setDefaultOutstationDa(sd.outstationDa);
          if (sd.taRatePerKm) setTaRatePerKm(sd.taRatePerKm);
          if (typeof sd.autoCalculateTaFromKm === 'boolean') {
            setAutoCalculateTaFromKm(sd.autoCalculateTaFromKm);
          }
        }

        if (Array.isArray(parsed.customHolidays) && parsed.customHolidays.length > 0) {
          setCustomHolidays(parsed.customHolidays);
        }
        if (Array.isArray(parsed.outstationPresets) && parsed.outstationPresets.length > 0) {
          setOutstationPresets(parsed.outstationPresets);
        }

        const updatedActive: ExpenditureBillDocument = {
          ...loadedActiveBill,
          updatedAt: new Date().toISOString()
        };

        setBill(updatedActive);

        let nextMergedBills: ExpenditureBillDocument[] = [];
        setSavedBills((prev) => {
          const map = new Map<string, ExpenditureBillDocument>();
          prev.forEach((b) => map.set(b.id, b));
          loadedBillsList.forEach((b) =>
            map.set(b.id, { ...b, updatedAt: new Date().toISOString() })
          );
          map.set(updatedActive.id, updatedActive);
          nextMergedBills = Array.from(map.values());
          return nextMergedBills;
        });

        if (autoCloudSync) {
          handleUploadToCloudSync(true, nextMergedBills, updatedActive);
        }

        globalToast.success(
          `Uploaded & synchronized "${updatedActive.billMonthLabel} - ${updatedActive.name}"! Ready to re-edit and download PDF.`
        );
      } catch (err) {
        console.error('Failed to parse uploaded prepared bill file:', err);
        globalToast.error('Failed to read prepared bill file. Please select a valid .json bill file.');
      } finally {
        if (preparedFileInputRef.current) {
          preparedFileInputRef.current.value = '';
        }
      }
    };
    reader.readAsText(file);
  };

  // Save current bill into Saved Bills Archive (and auto-sync to Cloud if enabled)
  const handleSaveCurrentBillToArchive = () => {
    const updatedBill: ExpenditureBillDocument = {
      ...bill,
      updatedAt: new Date().toISOString()
    };
    setBill(updatedBill);

    let nextList: ExpenditureBillDocument[] = [];
    setSavedBills((prev) => {
      const exists = prev.some((b) => b.id === updatedBill.id);
      nextList = exists
        ? prev.map((b) => (b.id === updatedBill.id ? updatedBill : b))
        : [updatedBill, ...prev];
      return nextList;
    });

    if (autoCloudSync) {
      handleUploadToCloudSync(true, nextList, updatedBill);
    }

    globalToast.success(
      `Saved "${updatedBill.billMonthLabel} - ${updatedBill.name}" to Saved Bills${
        autoCloudSync ? ' & Synchronized to Cloud!' : '!'
      }`
    );
  };

  // Load sample September 26 bill (Ashim Gogoi)
  const handleLoadSampleSeptember26 = () => {
    const sample = createDefaultSeptember26Bill();
    setBill(sample);
    globalToast.info('Loaded sample September 26 Expenditure Bill (Ashim Gogoi - Total 6404)');
  };

  // Delete saved bill from archive (and remove from synced server vault)
  const handleDeleteSavedBill = async (id: string) => {
    const nextBills = savedBills.filter((b) => b.id !== id);
    setSavedBills(nextBills);
    setCloudSyncedBillIds((prev) => prev.filter((itemId) => itemId !== id));
    try {
      await fetch('/api/expenditure-bills/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deletedBillId: id,
          savedBills: nextBills
        })
      });
    } catch (e) {}
    globalToast.info('Removed bill from saved list');
  };

  // Export CSV of current bill
  const handleExportCsv = () => {
    const headers = ['Date', 'From', 'To', 'Stayed At', 'Mode', 'KM', 'TA', 'DA', 'Others', 'Total'];
    const csvRows = [
      ['Name:-', bill.name, 'Designation:-', bill.designation, 'Area:-', bill.area, 'Expendature bill:-', bill.billMonthLabel, '', ''],
      headers,
      ...bill.rows.map((rawRow) => {
        const r = getEffectiveRowForBill(rawRow);
        const total = calculateRowTotal(r);
        return [
          r.date,
          r.from,
          r.to,
          r.stayedAt,
          r.mode,
          r.km,
          r.ta,
          r.da,
          r.others,
          formatNumericCell(total)
        ];
      }),
      [
        '',
        '',
        '',
        '',
        '',
        '',
        showColumnSubtotalsInPdf ? formatNumericCell(summary.totalTa) : '',
        showColumnSubtotalsInPdf ? formatNumericCell(summary.totalDa) : '',
        showColumnSubtotalsInPdf ? formatNumericCell(summary.totalOthers) : '',
        String(summary.grandTotal)
      ],
      [
        `Amount in Words: ${numberToIndianWords(summary.grandTotal)}`,
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        'TOTAL',
        String(summary.grandTotal)
      ]
    ];

    const csvString = csvRows
      .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const cleanMonth = (bill.billMonthLabel || 'BILL').replace(/[^a-zA-Z0-9_-]/g, '_');
    a.href = url;
    a.download = `MONTHLY_EXPENDATURE_${cleanMonth}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    globalToast.success('Exported Monthly Expenditure Bill as CSV!');
  };

  // Generate & Download Exact PDF matching /public/assets/aistudio/MONTHLY_EXPENDATURE_9971750e.pdf
  // Supports exporting either the currently active bill or any synchronized bill passed as `customTargetBill`
  const handleDownloadPdf = (customTargetBill?: ExpenditureBillDocument | React.MouseEvent) => {
    try {
      const targetBill: ExpenditureBillDocument =
        customTargetBill &&
        typeof customTargetBill === 'object' &&
        'rows' in customTargetBill &&
        Array.isArray(customTargetBill.rows)
          ? customTargetBill
          : bill;

      const docPdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const pageWidth = docPdf.internal.pageSize.getWidth(); // 210mm
      const marginX = 11;
      const startY = 12;
      const usableWidth = pageWidth - marginX * 2; // 188mm

      // Exact 10-column widths summing to 188mm
      const colWidths = [15, 25, 23, 23, 22, 16, 16, 16, 16, 16];

      const bodyRows: any[] = [];

      // 1. Metadata Row (Row index 0)
      bodyRows.push([
        {
          content: 'Name:-',
          styles: {
            halign: 'right',
            valign: 'middle',
            fontStyle: 'normal',
            textColor: [0, 0, 0],
            lineWidth: 0
          }
        },
        {
          content: targetBill.name,
          styles: {
            halign: 'center',
            valign: 'middle',
            fontStyle: 'bold',
            fillColor: [0, 0, 0],
            textColor: [255, 255, 255],
            lineWidth: 0.2,
            lineColor: [0, 0, 0]
          }
        },
        {
          content: 'Designation:-',
          styles: {
            halign: 'right',
            valign: 'middle',
            fontStyle: 'normal',
            textColor: [0, 0, 0],
            lineWidth: 0
          }
        },
        {
          content: targetBill.designation,
          colSpan: 2,
          styles: {
            halign: 'center',
            valign: 'middle',
            fontStyle: 'normal',
            textColor: [0, 0, 0],
            lineWidth: 0
          }
        },
        {
          content: 'Area:-',
          styles: {
            halign: 'right',
            valign: 'middle',
            fontStyle: 'normal',
            textColor: [0, 0, 0],
            lineWidth: 0
          }
        },
        {
          content: targetBill.area,
          styles: {
            halign: 'left',
            valign: 'middle',
            fontStyle: 'normal',
            textColor: [0, 0, 0],
            lineWidth: 0
          }
        },
        {
          content: 'Expendature bill:-',
          colSpan: 2,
          styles: {
            halign: 'right',
            valign: 'middle',
            fontStyle: 'normal',
            textColor: [0, 0, 0],
            lineWidth: 0
          }
        },
        {
          content: targetBill.billMonthLabel,
          styles: {
            halign: 'center',
            valign: 'middle',
            fontStyle: 'bold',
            fillColor: [0, 0, 0],
            textColor: [255, 255, 255],
            lineWidth: 0.2,
            lineColor: [0, 0, 0]
          }
        }
      ]);

      // 2. Column Headers Row (Row index 1)
      bodyRows.push([
        { content: 'Date', styles: { halign: 'center', fontStyle: 'normal' } },
        { content: 'From', styles: { halign: 'center', fontStyle: 'normal' } },
        { content: 'To', styles: { halign: 'center', fontStyle: 'normal' } },
        { content: 'Stayed At', styles: { halign: 'center', fontStyle: 'normal' } },
        { content: 'Mode', styles: { halign: 'center', fontStyle: 'normal' } },
        { content: 'KM', styles: { halign: 'center', fontStyle: 'normal' } },
        { content: 'TA', styles: { halign: 'center', fontStyle: 'normal' } },
        { content: 'DA', styles: { halign: 'center', fontStyle: 'normal' } },
        { content: 'Others', styles: { halign: 'center', fontStyle: 'normal' } },
        { content: 'Total', styles: { halign: 'center', fontStyle: 'normal' } }
      ]);

      // 3. Daily Rows (with automatic Sundays as per preparation month) & Target Totals
      let targetTotalTa = 0;
      let targetTotalDa = 0;
      let targetTotalOthers = 0;
      let targetGrandTotal = 0;

      targetBill.rows.forEach((rawRow) => {
        const r = getEffectiveRowForTargetBill(targetBill, rawRow);
        const taVal = parseFloat(String(r.ta || '').replace(/,/g, '')) || 0;
        const daVal = parseFloat(String(r.da || '').replace(/,/g, '')) || 0;
        const othersVal = parseFloat(String(r.others || '').replace(/,/g, '')) || 0;
        const rowTotal = calculateRowTotal(r);

        targetTotalTa += taVal;
        targetTotalDa += daVal;
        targetTotalOthers += othersVal;
        targetGrandTotal += rowTotal;

        bodyRows.push([
          { content: r.date || '', styles: { halign: 'right' } },
          { content: r.from || '', styles: { halign: 'left' } },
          { content: r.to || '', styles: { halign: 'left' } },
          { content: r.stayedAt || '', styles: { halign: 'left' } },
          { content: r.mode || '', styles: { halign: 'left' } },
          { content: r.km || '', styles: { halign: 'center' } },
          { content: r.ta || '', styles: { halign: 'center' } },
          { content: r.da || '', styles: { halign: 'center' } },
          { content: r.others || '', styles: { halign: 'center' } },
          { content: formatNumericCell(rowTotal), styles: { halign: 'center' } }
        ]);
      });

      targetTotalTa = Math.round(targetTotalTa * 100) / 100;
      targetTotalDa = Math.round(targetTotalDa * 100) / 100;
      targetTotalOthers = Math.round(targetTotalOthers * 100) / 100;
      targetGrandTotal = Math.round(targetGrandTotal * 100) / 100;

      // 4. First Footer Subtotal Row (Bordered cells under TA, DA, Others, Total)
      bodyRows.push([
        { content: '', colSpan: 6, styles: { lineWidth: 0, fillColor: false } },
        {
          content: showColumnSubtotalsInPdf ? formatNumericCell(targetTotalTa) : '',
          styles: { halign: 'center', lineWidth: 0.25, lineColor: [0, 0, 0] }
        },
        {
          content: showColumnSubtotalsInPdf ? formatNumericCell(targetTotalDa) : '',
          styles: { halign: 'center', lineWidth: 0.25, lineColor: [0, 0, 0] }
        },
        {
          content: showColumnSubtotalsInPdf ? formatNumericCell(targetTotalOthers) : '',
          styles: { halign: 'center', lineWidth: 0.25, lineColor: [0, 0, 0] }
        },
        {
          content: String(targetGrandTotal),
          styles: { halign: 'center', lineWidth: 0.25, lineColor: [0, 0, 0] }
        }
      ]);

      // 5. Second Footer Grand Total Row (Amount in Words on left, TOTAL bold under Others, Black filled box with white bold text under Total)
      bodyRows.push([
        {
          content: `Amount in Words: ${numberToIndianWords(targetGrandTotal)}`,
          colSpan: 8,
          styles: {
            halign: 'left',
            valign: 'middle',
            fontStyle: 'bold',
            textColor: [0, 0, 0],
            lineWidth: 0,
            fillColor: false
          }
        },
        {
          content: 'TOTAL',
          styles: {
            halign: 'center',
            valign: 'middle',
            fontStyle: 'bold',
            textColor: [0, 0, 0],
            lineWidth: 0.25,
            lineColor: [0, 0, 0]
          }
        },
        {
          content: String(targetGrandTotal),
          styles: {
            halign: 'center',
            valign: 'middle',
            fontStyle: 'bold',
            fillColor: [0, 0, 0],
            textColor: [255, 255, 255],
            lineWidth: 0.25,
            lineColor: [0, 0, 0]
          }
        }
      ]);

      const subtotalRowIndex = bodyRows.length - 2;
      const grandTotalRowIndex = bodyRows.length - 1;

      autoTable(docPdf, {
        startY,
        margin: { left: marginX, right: marginX },
        tableWidth: usableWidth,
        theme: 'grid',
        body: bodyRows,
        styles: {
          font: 'helvetica',
          fontSize: 8.5,
          cellPadding: { top: 1.35, right: 1.5, bottom: 1.35, left: 1.5 },
          textColor: [0, 0, 0],
          fillColor: false,
          lineColor: [0, 0, 0],
          lineWidth: 0.25,
          valign: 'middle',
          overflow: 'linebreak'
        },
        columnStyles: {
          0: { cellWidth: colWidths[0] },
          1: { cellWidth: colWidths[1] },
          2: { cellWidth: colWidths[2] },
          3: { cellWidth: colWidths[3] },
          4: { cellWidth: colWidths[4] },
          5: { cellWidth: colWidths[5] },
          6: { cellWidth: colWidths[6] },
          7: { cellWidth: colWidths[7] },
          8: { cellWidth: colWidths[8] },
          9: { cellWidth: colWidths[9] }
        },
        didParseCell: (data) => {
          if (data.row.index === 0) {
            data.cell.styles.cellPadding = { top: 1.6, right: 1.2, bottom: 1.6, left: 1.2 };
            data.cell.styles.fontSize = 8;
          }
        },
        didDrawCell: (data) => {
          docPdf.setDrawColor(0, 0, 0);
          docPdf.setLineWidth(0.25);

          // Row 0: Ensure the black highlight boxes (Name and Month) have crisp borders
          if (data.row.index === 0) {
            if (data.column.index === 1 || data.column.index === 9) {
              docPdf.rect(data.cell.x, data.cell.y, data.cell.width, data.cell.height, 'S');
            }
            return;
          }

          // Row 1 (Column Headers) & All Daily Rows (Dates 1..31): Enforce all 4 cell borders
          if (data.row.index >= 1 && data.row.index < subtotalRowIndex) {
            docPdf.rect(data.cell.x, data.cell.y, data.cell.width, data.cell.height, 'S');
            return;
          }

          // First Footer Subtotal Row:
          // - Col 0..5 spacer: explicitly draw top line so Date 31's bottom border is 100% solid
          // - Col 6..9 (TA, DA, Others, Total): enforce all 4 cell borders
          if (data.row.index === subtotalRowIndex) {
            if (data.column.index === 0) {
              docPdf.line(data.cell.x, data.cell.y, data.cell.x + data.cell.width, data.cell.y);
            } else if (data.column.index >= 6) {
              docPdf.rect(data.cell.x, data.cell.y, data.cell.width, data.cell.height, 'S');
            }
            return;
          }

          // Second Footer Grand Total Row:
          // - Col 0..7 (Amount in Words): explicitly draw top line segment under Col 6..7 so Subtotal TA & DA bottom borders are 100% solid
          // - Col 8..9 (TOTAL and Grand Total): enforce all 4 cell borders
          if (data.row.index === grandTotalRowIndex) {
            if (data.column.index === 0) {
              const taDaStartX = data.cell.x + colWidths.slice(0, 6).reduce((acc, w) => acc + w, 0);
              docPdf.line(taDaStartX, data.cell.y, data.cell.x + data.cell.width, data.cell.y);
            } else if (data.column.index >= 8) {
              docPdf.rect(data.cell.x, data.cell.y, data.cell.width, data.cell.height, 'S');
            }
          }
        }
      });

      const cleanMonth = (targetBill.billMonthLabel || 'BILL').trim().replace(/\s+/g, '_').toUpperCase();
      docPdf.save(`MONTHLY_EXPENDATURE_${cleanMonth}.pdf`);
      globalToast.success(`Downloaded PDF: MONTHLY_EXPENDATURE_${cleanMonth}.pdf`);
    } catch (err: any) {
      console.error('Failed to generate expenditure PDF:', err);
      globalToast.error(`Failed to generate PDF: ${err?.message || 'Unknown error'}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Hidden File Input for Uploading Prepared Bill File (.json) from Google Drive Folder or Device */}
      <input
        ref={preparedFileInputRef}
        type="file"
        accept=".json,application/json"
        onChange={handleUploadPreparedBillFile}
        className="hidden"
      />

      {/* Top Action & Title Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-5 md:p-6 shadow-xl border border-indigo-500/30">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-md bg-amber-400/15 border border-amber-400/30 text-amber-300 text-[10px] font-mono font-bold uppercase tracking-widest">
              <FileText className="w-3.5 h-3.5" /> Monthly Expenditure Bill Maker & A4 PDF Generator
            </div>
            <h2 className="text-xl md:text-2xl font-black tracking-tight text-white flex items-center gap-2.5">
              <span>MONTHLY EXPENDITURE BILL (TA / DA / TRAVEL STATEMENT)</span>
            </h2>
            <p className="text-xs text-indigo-200/90 max-w-3xl">
              Create, edit, auto-calculate, synchronize for free, upload prepared bill files for future re-editing, and download your official Monthly Expenditure Bill in crisp A4 PDF format.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => preparedFileInputRef.current?.click()}
              className="px-3 py-2.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-200 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
              title="Upload a previously saved Prepared Bill (.json) file from your Google Drive folder or device to re-edit and download PDF"
            >
              <Upload className="w-4 h-4 text-cyan-300" />
              <span>Upload Prepared File</span>
            </button>

            <button
              type="button"
              onClick={() => handleDownloadPreparedBillFile()}
              className="px-3 py-2.5 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-400/40 text-indigo-100 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
              title="Download this prepared bill (.json) to keep in your Google Drive folder or device for future re-editing (100% Free)"
            >
              <FileJson className="w-4 h-4 text-indigo-300" />
              <span>Save File (For Drive)</span>
            </button>

            <button
              type="button"
              onClick={() => handleUploadToCloudSync(false)}
              disabled={isCloudUploading}
              className="px-3 py-2.5 rounded-xl bg-sky-600/80 hover:bg-sky-500 border border-sky-400/40 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer disabled:opacity-60"
              title="100% Free Local & Server Synchronization (No Google Cloud Billing Account Required) — Save & synchronize your prepared bills across sessions for future re-editing"
            >
              <CloudUpload className={`w-4 h-4 ${isCloudUploading ? 'animate-bounce' : ''}`} />
              <span>{isCloudUploading ? 'Syncing...' : 'Free Sync (No Billing)'}</span>
            </button>

            <button
              type="button"
              onClick={handleSaveCurrentBillToArchive}
              className="px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
              title="Save this bill to Saved & Synchronized Bills"
            >
              <Save className="w-4 h-4 text-emerald-400" />
              <span>Save Bill</span>
            </button>

            <button
              type="button"
              onClick={handleExportCsv}
              className="px-3.5 py-2.5 rounded-xl bg-emerald-600/90 hover:bg-emerald-500 border border-emerald-400/40 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-md"
              title="Export to Excel / CSV"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Export CSV</span>
            </button>

            <button
              type="button"
              onClick={() => handleDownloadPdf()}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-400 to-yellow-500 hover:from-amber-300 hover:to-yellow-400 text-slate-950 font-black text-xs uppercase tracking-wider flex items-center gap-2 transition cursor-pointer shadow-lg shadow-amber-500/20"
            >
              <Download className="w-4 h-4 stroke-[2.5]" />
              <span>Download Expenditure PDF</span>
            </button>
          </div>
        </div>

        {/* Summary KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-5 pt-5 border-t border-white/10">
          <div className="bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5">
            <div className="text-[10px] font-mono uppercase tracking-wider text-indigo-300">Working / Outstation / Off</div>
            <div className="text-lg font-black text-white mt-0.5">
              {summary.workingDays}d{' '}
              <span className="text-xs font-semibold text-amber-300">({summary.outstationDays} Out)</span>{' '}
              <span className="text-xs font-semibold text-indigo-300">/ {summary.sundaysOrOff} Off</span>
            </div>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5">
            <div className="text-[10px] font-mono uppercase tracking-wider text-indigo-300">Total Distance (KM)</div>
            <div className="text-lg font-black text-cyan-300 mt-0.5">{summary.totalKm} KM</div>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5">
            <div className="text-[10px] font-mono uppercase tracking-wider text-indigo-300">Total TA</div>
            <div className="text-lg font-black text-emerald-300 mt-0.5">₹{summary.totalTa}</div>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5">
            <div className="text-[10px] font-mono uppercase tracking-wider text-indigo-300">Total DA</div>
            <div className="text-lg font-black text-sky-300 mt-0.5">₹{summary.totalDa}</div>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5">
            <div className="text-[10px] font-mono uppercase tracking-wider text-indigo-300">Total Others</div>
            <div className="text-lg font-black text-purple-300 mt-0.5">₹{summary.totalOthers}</div>
          </div>
          <div className="bg-black border-2 border-amber-400 rounded-xl px-3.5 py-2.5 shadow-inner">
            <div className="text-[10px] font-mono uppercase tracking-wider text-amber-300 font-bold">GRAND TOTAL</div>
            <div className="text-xl font-black text-white mt-0.5">₹{summary.grandTotal}</div>
          </div>
        </div>
      </div>

      {/* Control Panel: Employee Details + Month Calendar Auto-Generator + Saved Bills */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* Left: Header Metadata Config */}
        <div className="xl:col-span-2 bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <UserIcon className="w-4 h-4 text-indigo-600" />
              <h3 className="text-sm font-black uppercase tracking-wider text-slate-900">
                1. Bill Header Details (Top Row on PDF)
              </h3>
            </div>
            <button
              onClick={handleLoadSampleSeptember26}
              className="text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg border border-indigo-200 transition flex items-center gap-1.5 cursor-pointer"
              title="Reset to exact September 26 PDF sample (Ashim Gogoi - Total 6404)"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Load September 26 Sample (₹6,404)</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div>
              <label className="block text-[11px] font-black uppercase tracking-wider text-slate-700 mb-1">
                Name:- <span className="text-[10px] text-slate-400 font-normal">(Black Box)</span>
              </label>
              <input
                type="text"
                value={bill.name}
                onChange={(e) => updateHeaderField('name', e.target.value)}
                placeholder="Ashim Gogoi"
                className="w-full px-3 py-2 text-xs font-bold bg-slate-950 text-white rounded-lg border border-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-black uppercase tracking-wider text-slate-700 mb-1">
                Designation:-
              </label>
              <input
                type="text"
                value={bill.designation}
                onChange={(e) => updateHeaderField('designation', e.target.value)}
                placeholder="Business Development Manager"
                className="w-full px-3 py-2 text-xs font-semibold bg-slate-50 text-slate-900 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-black uppercase tracking-wider text-slate-700 mb-1">
                Area:-
              </label>
              <input
                type="text"
                value={bill.area}
                onChange={(e) => updateHeaderField('area', e.target.value)}
                placeholder="Guwahati     Assam,"
                className="w-full px-3 py-2 text-xs font-semibold bg-slate-50 text-slate-900 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-black uppercase tracking-wider text-slate-700 mb-1">
                Expendature bill:- <span className="text-[10px] text-slate-400 font-normal">(Preparation Month)</span>
              </label>
              <input
                type="text"
                value={bill.billMonthLabel}
                onChange={(e) => {
                  const val = e.target.value;
                  const parsed = parsePreparationMonthLabel(val, bill.selectedMonthIndex, bill.selectedYear);
                  if (parsed.matched) {
                    handleSelectPreparationMonthYear(parsed.monthIndex, parsed.year, val);
                  } else {
                    updateHeaderField('billMonthLabel', val);
                  }
                }}
                placeholder="September 26"
                className="w-full px-3 py-2 text-xs font-bold bg-slate-950 text-white rounded-lg border border-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Calendar Month Generator & Quick Fill Rules */}
          <div className="pt-3 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200/80 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <span className="text-[11px] font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-indigo-600" /> Preparation Month & Automatic Sundays
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  <label
                    className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200 cursor-pointer"
                    title="Automatically add ( SUNDAY ) on all Sundays of the selected preparation month in the bill and PDF"
                  >
                    <input
                      type="checkbox"
                      checked={autoAddSundaysForMonth}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setAutoAddSundaysForMonth(checked);
                        if (checked) {
                          handleAutoApplyMonthSundaysToCurrentBill();
                        }
                      }}
                      className="rounded border-rose-300 text-rose-600"
                    />
                    <span>Auto Sundays</span>
                  </label>
                  <label className="inline-flex items-center gap-1 text-[10px] font-bold text-orange-700 bg-orange-50 px-2 py-0.5 rounded border border-orange-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoIncludeIndiaHolidays}
                      onChange={(e) => setAutoIncludeIndiaHolidays(e.target.checked)}
                      className="rounded border-orange-300 text-orange-600"
                    />
                    <span>Auto India Holidays</span>
                  </label>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={bill.selectedMonthIndex}
                  onChange={(e) => {
                    const m = parseInt(e.target.value, 10);
                    handleSelectPreparationMonthYear(m, bill.selectedYear);
                    const sunDays = [];
                    const totalDays = new Date(bill.selectedYear, m + 1, 0).getDate();
                    for (let d = 1; d <= totalDays; d++) {
                      if (new Date(bill.selectedYear, m, d).getDay() === 0) sunDays.push(d);
                    }
                    globalToast.success(
                      `Switched to ${MONTHS_LIST[m]} ${bill.selectedYear} — Sundays (${sunDays.join(', ')}) automatically added!`
                    );
                  }}
                  className="px-2.5 py-1.5 text-xs font-bold bg-white border border-slate-300 rounded-lg text-slate-800"
                >
                  {MONTHS_LIST.map((m, idx) => (
                    <option key={m} value={idx}>
                      {m}
                    </option>
                  ))}
                </select>

                <select
                  value={bill.selectedYear}
                  onChange={(e) => {
                    const yr = parseInt(e.target.value, 10);
                    handleSelectPreparationMonthYear(bill.selectedMonthIndex, yr);
                    const sunDays = [];
                    const totalDays = new Date(yr, bill.selectedMonthIndex + 1, 0).getDate();
                    for (let d = 1; d <= totalDays; d++) {
                      if (new Date(yr, bill.selectedMonthIndex, d).getDay() === 0) sunDays.push(d);
                    }
                    globalToast.success(
                      `Switched to ${MONTHS_LIST[bill.selectedMonthIndex]} ${yr} — Sundays (${sunDays.join(', ')}) automatically added!`
                    );
                  }}
                  className="px-2.5 py-1.5 text-xs font-bold bg-white border border-slate-300 rounded-lg text-slate-800"
                >
                  {[2024, 2025, 2026, 2027, 2028, 2029, 2030].map((yr) => (
                    <option key={yr} value={yr}>
                      {yr}
                    </option>
                  ))}
                </select>

                <button
                  onClick={handleAutoApplyMonthSundaysToCurrentBill}
                  className="px-2.5 py-1.5 text-[11px] font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition cursor-pointer"
                  title="Automatically mark all Sundays for the selected preparation month while preserving custom trips"
                >
                  Sync Sundays ({activeMonthSundaysList.join(', ')})
                </button>

                <button
                  onClick={() => handleGenerateCalendarDays(bill.selectedMonthIndex, bill.selectedYear, true)}
                  className="px-2.5 py-1.5 text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition cursor-pointer"
                  title="Generate all dates with Sundays & India Holidays marked and HQ defaults filled on weekdays"
                >
                  Reset Month + Fill HQ
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[10px] text-slate-600">
                <span>
                  <strong className="text-rose-700">
                    Sundays in {MONTHS_LIST[bill.selectedMonthIndex]} {bill.selectedYear}:
                  </strong>{' '}
                  Dates <strong>{activeMonthSundaysList.join(', ')}</strong> are automatically set to{' '}
                  <code className="px-1 py-0.2 bg-rose-100 text-rose-800 rounded font-bold">( SUNDAY )</code> on the PDF.
                </span>
                <button
                  type="button"
                  onClick={() => handleGenerateCalendarDays(bill.selectedMonthIndex, bill.selectedYear, false)}
                  className="text-[10px] font-bold text-indigo-600 hover:underline cursor-pointer"
                >
                  Generate Blank + Sundays
                </button>
              </div>
            </div>

            {/* Default Rates & Auto-TA Settings (with Full Edit Mode & Batch Apply) */}
            <div
              className={`rounded-xl p-3.5 border transition-all space-y-3 ${
                isEditingSmartDefaults
                  ? 'bg-emerald-50/70 border-emerald-300 shadow-xs ring-2 ring-emerald-500/15'
                  : 'bg-slate-50 border-slate-200/80'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                    <Calculator className="w-3.5 h-3.5 text-emerald-600" /> Smart Auto-Fill & TA/DA Defaults
                  </span>
                  <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 rounded border border-emerald-200">
                    Auto-Saved
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <label className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoCalculateTaFromKm}
                      onChange={(e) => setAutoCalculateTaFromKm(e.target.checked)}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>Auto TA = KM × {taRatePerKm}</span>
                  </label>

                  <button
                    type="button"
                    onClick={() => setIsEditingSmartDefaults((prev) => !prev)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-black flex items-center gap-1 transition cursor-pointer border ${
                      isEditingSmartDefaults
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700 shadow-2xs'
                        : 'bg-white hover:bg-emerald-50 text-emerald-800 border-emerald-300'
                    }`}
                    title="Open full editor to customize HQ City, HQ Mode, Local DA, Outstation DA, Outstation Mode, TA Rate/KM, and batch-update current bill rows"
                  >
                    <Edit3 className="w-3 h-3" />
                    <span>{isEditingSmartDefaults ? 'Close Editor' : 'Edit Defaults'}</span>
                  </button>
                </div>
              </div>

              {/* Primary 5 Default Inputs (Always accessible + highlighted in Edit Mode) */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <div>
                  <label className="block text-[9px] font-bold uppercase text-slate-500 mb-0.5">
                    HQ City
                  </label>
                  <input
                    type="text"
                    list="assam-cities-datalist"
                    value={defaultHqCity}
                    onChange={(e) => setDefaultHqCity(e.target.value)}
                    placeholder="Guwahati"
                    className={`w-full px-2 py-1 text-xs font-semibold bg-white border rounded text-slate-800 ${
                      isEditingSmartDefaults
                        ? 'border-emerald-400 focus:ring-2 focus:ring-emerald-500'
                        : 'border-slate-300'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-bold uppercase text-slate-500 mb-0.5">
                    HQ Mode
                  </label>
                  <input
                    type="text"
                    list="transport-modes-list"
                    value={defaultHqMode}
                    onChange={(e) => {
                      setDefaultHqMode(e.target.value);
                      handleDefaultHqKmChange(defaultHqKm, e.target.value);
                    }}
                    placeholder="Bike"
                    className={`w-full px-2 py-1 text-xs font-semibold bg-white border rounded text-slate-800 ${
                      isEditingSmartDefaults
                        ? 'border-emerald-400 focus:ring-2 focus:ring-emerald-500'
                        : 'border-slate-300'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-bold uppercase text-slate-500 mb-0.5">
                    Local DA (₹)
                  </label>
                  <input
                    type="text"
                    value={defaultLocalDa}
                    onChange={(e) => setDefaultLocalDa(e.target.value)}
                    placeholder="150"
                    className={`w-full px-2 py-1 text-xs font-mono font-bold bg-white border rounded text-slate-800 ${
                      isEditingSmartDefaults
                        ? 'border-emerald-400 focus:ring-2 focus:ring-emerald-500'
                        : 'border-slate-300'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-bold uppercase text-slate-500 mb-0.5">
                    Outstation DA (₹)
                  </label>
                  <input
                    type="text"
                    value={defaultOutstationDa}
                    onChange={(e) => {
                      setDefaultOutstationDa(e.target.value);
                      setTripDa(e.target.value);
                    }}
                    placeholder="200"
                    className={`w-full px-2 py-1 text-xs font-mono font-bold bg-white border rounded text-slate-800 ${
                      isEditingSmartDefaults
                        ? 'border-emerald-400 focus:ring-2 focus:ring-emerald-500'
                        : 'border-slate-300'
                    }`}
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-[9px] font-bold uppercase text-slate-500 mb-0.5">
                    TA Rate / KM (₹)
                  </label>
                  <input
                    type="text"
                    value={taRatePerKm}
                    onChange={(e) => {
                      const nextRate = e.target.value;
                      setTaRatePerKm(nextRate);
                      if (autoCalculateTaFromKm) {
                        const rateNum = parseFloat(nextRate) || 0;
                        const hqKmNum = parseFloat(defaultHqKm);
                        if (!isNaN(hqKmNum) && hqKmNum > 0 && rateNum > 0) {
                          setDefaultHqTa(String(Math.round(hqKmNum * rateNum * 100) / 100));
                        }
                        const tripKmNum = parseFloat(tripKm);
                        if (!isNaN(tripKmNum) && tripKmNum > 0 && rateNum > 0 && tripMode.toLowerCase() !== 'bus') {
                          setTripTa(String(Math.round(tripKmNum * rateNum * 100) / 100));
                        }
                      }
                    }}
                    placeholder="2.2"
                    className={`w-full px-2 py-1 text-xs font-mono font-bold bg-white border rounded text-slate-800 ${
                      isEditingSmartDefaults
                        ? 'border-emerald-400 focus:ring-2 focus:ring-emerald-500'
                        : 'border-slate-300'
                    }`}
                  />
                </div>
              </div>

              {/* Expanded Smart Auto-Fill & TA/DA Defaults Editor Panel */}
              {isEditingSmartDefaults && (
                <div className="pt-2.5 border-t border-emerald-200/80 space-y-3 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider text-emerald-900">
                      Advanced HQ & Outstation Default Parameters
                    </span>
                    <span className="text-[10px] text-emerald-800 font-medium">
                      Used when clicking "HQ", "Outstation", "+ Fill Empty HQ Days", or "Reset Month + Fill HQ"
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div>
                      <label className="block text-[9px] font-bold uppercase text-slate-600 mb-0.5">
                        Outstation Mode
                      </label>
                      <input
                        type="text"
                        list="transport-modes-list"
                        value={defaultOutstationMode}
                        onChange={(e) => {
                          setDefaultOutstationMode(e.target.value);
                          setTripMode(e.target.value);
                        }}
                        placeholder="Traveller / Bus"
                        className="w-full px-2 py-1 text-xs font-semibold bg-white border border-emerald-300 rounded text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold uppercase text-slate-600 mb-0.5">
                        Default HQ KM (Optional)
                      </label>
                      <input
                        type="text"
                        value={defaultHqKm}
                        onChange={(e) => handleDefaultHqKmChange(e.target.value, defaultHqMode)}
                        placeholder="Leave blank or e.g. 25"
                        className="w-full px-2 py-1 text-xs font-mono font-semibold bg-white border border-emerald-300 rounded text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold uppercase text-slate-600 mb-0.5">
                        Default HQ TA (₹)
                      </label>
                      <input
                        type="text"
                        value={defaultHqTa}
                        onChange={(e) => setDefaultHqTa(e.target.value)}
                        placeholder="Leave blank or auto"
                        className="w-full px-2 py-1 text-xs font-mono font-semibold bg-white border border-emerald-300 rounded text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold uppercase text-slate-600 mb-0.5">
                        Default HQ Others (₹)
                      </label>
                      <input
                        type="text"
                        value={defaultHqOthers}
                        onChange={(e) => setDefaultHqOthers(e.target.value)}
                        placeholder="Optional"
                        className="w-full px-2 py-1 text-xs font-mono font-semibold bg-white border border-emerald-300 rounded text-slate-800"
                      />
                    </div>
                  </div>

                  {/* Batch Apply to Current Bill & Presets */}
                  <div className="bg-white/90 rounded-lg p-2.5 border border-emerald-200 space-y-2">
                    <div className="text-[10px] font-black uppercase tracking-wider text-slate-700">
                      Apply Updated Defaults to Active Bill ({bill.billMonthLabel}) & Saved Presets:
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handleApplyHqDefaultsToExistingRows}
                        className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition cursor-pointer flex items-center gap-1 shadow-2xs"
                        title="Update all existing local HQ rows in the current bill with the new HQ City, HQ Mode, and Local DA"
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>Update Existing HQ Rows in Bill</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleRecalculateOutstationRowsWithDefaults}
                        className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-indigo-600 hover:bg-indigo-700 text-white transition cursor-pointer flex items-center gap-1 shadow-2xs"
                        title="Recalculate TA (KM × Rate) and update Outstation DA on all existing outstation rows in the current bill"
                      >
                        <Calculator className="w-3 h-3" />
                        <span>Recalculate Outstation Rows (TA & DA)</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleSyncRoutePresetsWithDefaults}
                        className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 transition cursor-pointer flex items-center gap-1"
                        title="Update all saved 1-Click Outstation Route Presets with the new TA Rate/KM and Outstation DA"
                      >
                        <Navigation className="w-3 h-3 text-amber-700" />
                        <span>Sync Route Presets</span>
                      </button>
                    </div>
                  </div>

                  {/* Save & Factory Reset Footer */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleResetSmartDefaultsToFactory}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition cursor-pointer flex items-center gap-1"
                      title="Restore Guwahati, Bike, Local DA 150, Outstation DA 200, and TA Rate 2.2/KM"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Reset to Standard Defaults</span>
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleSaveSmartDefaults}
                        className="px-3 py-1.5 rounded-lg text-[11px] font-black bg-slate-900 hover:bg-slate-800 text-white transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>Save Defaults & Done</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Quick Action Bar when collapsed */}
              {!isEditingSmartDefaults && (
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-200/70 text-[10px] text-slate-600">
                  <span>
                    HQ: <strong className="text-slate-800">{defaultHqCity}</strong> ({defaultHqMode}, DA ₹{defaultLocalDa}) • Outstation: <strong className="text-slate-800">{defaultOutstationMode}</strong> (DA ₹{defaultOutstationDa})
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleApplyHqDefaultsToExistingRows}
                      className="text-[10px] font-bold text-emerald-700 hover:underline cursor-pointer"
                      title="Apply current HQ City, HQ Mode, and Local DA to all existing HQ rows in this bill"
                    >
                      Apply HQ to Bill
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={handleRecalculateOutstationRowsWithDefaults}
                      className="text-[10px] font-bold text-indigo-700 hover:underline cursor-pointer"
                      title="Recalculate Outstation rows in this bill with current TA Rate/KM and Outstation DA"
                    >
                      Recalc Outstation TA/DA
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Saved & Synchronized Expenditure Bills (100% Free Cloud + File Sync) */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between space-y-3">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-amber-600" />
                <div>
                  <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                    <span>Synchronized Bills ({savedBills.length})</span>
                    <span className="px-1.5 py-0.5 text-[9px] font-bold bg-sky-100 text-sky-800 rounded border border-sky-200">
                      100% Free Sync
                    </span>
                  </h3>
                  {lastCloudSyncTime && (
                    <div className="text-[10px] text-emerald-700 font-medium flex items-center gap-1 mt-0.5">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      <span>Last Synced: {lastCloudSyncTime}</span>
                    </div>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={handleFillEmptyWeekdaysWithHq}
                className="text-[11px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg border border-emerald-200 transition cursor-pointer"
                title="Fill all blank non-Sunday rows with HQ city, Bike, and Local DA"
              >
                + Fill Empty HQ Days
              </button>
            </div>

            {/* 100% Free Synchronization & Prepared File Upload/Save Toolbar (Zero Cloud Billing) */}
            <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-200/80 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-700 flex items-center gap-1">
                  <Cloud className="w-3.5 h-3.5 text-sky-600" /> Free Sync & Drive File Backup (No Billing)
                </span>
                <label className="inline-flex items-center gap-1 text-[10px] font-bold text-sky-800 bg-sky-50 px-2 py-0.5 rounded border border-sky-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoCloudSync}
                    onChange={(e) => setAutoCloudSync(e.target.checked)}
                    className="rounded border-sky-300 text-sky-600"
                  />
                  <span>Auto-Sync on Save</span>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => handleUploadToCloudSync(false)}
                  disabled={isCloudUploading}
                  className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-sky-600 hover:bg-sky-700 text-white transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60 shadow-2xs"
                  title="Synchronize your prepared bills and TA/DA defaults to built-in free storage (No Google Cloud Billing Account)"
                >
                  <CloudUpload className={`w-3.5 h-3.5 ${isCloudUploading ? 'animate-bounce' : ''}`} />
                  <span>{isCloudUploading ? 'Syncing...' : 'Sync Bills (Free)'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSynchronizeFromCloud(false)}
                  disabled={isCloudSyncing}
                  className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-white hover:bg-sky-50 text-sky-800 border border-sky-300 transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
                  title="Pull & synchronize prepared bills from built-in free storage for re-editing and PDF download"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isCloudSyncing ? 'animate-spin' : ''}`} />
                  <span>{isCloudSyncing ? 'Syncing...' : 'Pull Saved Bills'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => preparedFileInputRef.current?.click()}
                  className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 transition flex items-center justify-center gap-1.5 cursor-pointer"
                  title="Upload a prepared bill (.json) file from your Google Drive folder or computer to re-edit and download PDF"
                >
                  <Upload className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Upload File (.json)</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleDownloadPreparedBillFile()}
                  className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 transition flex items-center justify-center gap-1.5 cursor-pointer"
                  title="Download prepared bill (.json) file to keep in your Google Drive folder or device for free"
                >
                  <CloudDownload className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Save File (Drive)</span>
                </button>
              </div>
            </div>

            {/* Saved & Synchronized Bills List with Re-Edit + 1-Click PDF Download */}
            <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
              {savedBills.map((item) => {
                const itemTotal = item.rows.reduce(
                  (acc, r) => acc + calculateRowTotal(getEffectiveRowForTargetBill(item, r)),
                  0
                );
                const isCurrent = item.id === bill.id;
                const isCloudSynced = cloudSyncedBillIds.includes(item.id);
                return (
                  <div
                    key={item.id}
                    className={`flex items-center justify-between p-2.5 rounded-xl border text-xs transition ${
                      isCurrent
                        ? 'bg-indigo-50/90 border-indigo-300 text-indigo-950 ring-1 ring-indigo-500/20'
                        : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-800'
                    }`}
                  >
                    <div
                      className="flex-1 cursor-pointer truncate pr-2"
                      onClick={() => {
                        setBill(item);
                        globalToast.info(`Loaded "${item.billMonthLabel} - ${item.name}" for re-editing!`);
                      }}
                      title="Click to load this bill into the editor for re-editing"
                    >
                      <div className="font-black flex items-center gap-1.5 flex-wrap">
                        <span>{item.billMonthLabel}</span>
                        <span className="text-[10px] font-normal text-slate-500">• {item.name}</span>
                        {isCurrent && (
                          <span className="px-1.5 py-0.2 text-[9px] font-bold uppercase bg-indigo-600 text-white rounded">
                            Editing
                          </span>
                        )}
                        {isCloudSynced && (
                          <span className="px-1.5 py-0.2 text-[9px] font-bold uppercase bg-sky-100 text-sky-800 rounded border border-sky-200">
                            Synced
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                        {item.rows.length} days • Total: <strong className="text-slate-900">₹{Math.round(itemTotal * 100) / 100}</strong>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setBill(item);
                          globalToast.info(`Loaded "${item.billMonthLabel}" for re-editing!`);
                        }}
                        className="px-2 py-1 text-[10px] font-bold bg-white border border-indigo-200 rounded hover:bg-indigo-50 text-indigo-700 cursor-pointer flex items-center gap-1"
                        title="Load this synchronized bill into the editor to re-edit dates, trips, or amounts"
                      >
                        <Edit3 className="w-3 h-3" />
                        <span>Re-Edit</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDownloadPdf(item)}
                        className="px-2 py-1 text-[10px] font-black bg-amber-400 hover:bg-amber-300 text-slate-950 rounded cursor-pointer flex items-center gap-1 shadow-2xs"
                        title="Directly download the A4 PDF for this bill"
                      >
                        <Download className="w-3 h-3" />
                        <span>PDF</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDownloadPreparedBillFile(item)}
                        className="p-1 text-slate-500 hover:text-indigo-700 bg-white border border-slate-200 rounded cursor-pointer"
                        title="Download prepared (.json) file for this bill to save in Google Drive or device"
                      >
                        <FileJson className="w-3.5 h-3.5" />
                      </button>

                      {savedBills.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleDeleteSavedBill(item.id)}
                          className="p-1 text-slate-400 hover:text-red-600 rounded cursor-pointer"
                          title="Delete saved bill"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
            <label className="inline-flex items-center gap-1.5 cursor-pointer font-semibold">
              <input
                type="checkbox"
                checked={showColumnSubtotalsInPdf}
                onChange={(e) => setShowColumnSubtotalsInPdf(e.target.checked)}
                className="rounded border-slate-300 text-indigo-600"
              />
              <span>Show TA/DA/Others Subtotals in Footer</span>
            </label>

            <button
              type="button"
              onClick={handleDownloadFullArchiveFile}
              className="text-[10px] font-bold text-indigo-700 hover:underline cursor-pointer flex items-center gap-1"
              title="Download a single backup file containing all saved bills, custom holidays, route presets, and TA/DA defaults"
            >
              <Download className="w-3 h-3" />
              <span>Backup All ({savedBills.length}) Bills</span>
            </button>
          </div>
        </div>
      </div>

      {/* OUTSIDE GUWAHATI / OUTSTATION TOUR BUILDER & SAVED ROUTE PRESETS */}
      <div className="bg-gradient-to-r from-indigo-50/90 via-white to-cyan-50/90 rounded-2xl border border-indigo-200 p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-indigo-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-600 text-white shadow-xs">
              <Navigation className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-900">
                  2. Outside {defaultHqCity} (Outstation Tour / Travel Entry)
                </h3>
                <span className="px-2 py-0.5 text-[10px] font-bold bg-indigo-100 text-indigo-800 rounded-md border border-indigo-200">
                  Outstation DA: ₹{defaultOutstationDa} • Auto TA = KM × {taRatePerKm}
                </span>
              </div>
              <p className="text-[11px] text-slate-600">
                Going outside {defaultHqCity} (e.g., Dibrugarh, Makum, Moran, Dhemaji, Sivasagar, Jorhat, Tezpur, Silchar)? Pick a date below and enter your route or click any saved route preset.
              </p>
            </div>
          </div>

          {/* Quick Trip Type Templates */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setTripFrom(defaultHqCity);
                setTripTo('Dibrugarh');
                setTripStayedAt('Dibrugarh');
                setTripMode('Bus');
                setTripKm('480');
                setTripTa('');
                setTripDa(defaultOutstationDa);
                setTripOthers('868');
              }}
              className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 transition cursor-pointer"
              title="Depart from Guwahati by Bus (Bus fare in Others, DA 200)"
            >
              1. Depart {defaultHqCity} (Bus)
            </button>

            <button
              type="button"
              onClick={() => {
                setTripMode('Traveller');
                setTripDa(defaultOutstationDa);
                setTripOthers('');
                handleTripBuilderKmChange(tripKm || '140', 'Traveller');
              }}
              className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 transition cursor-pointer"
              title="Outstation travel with KM × 2.2 = TA and Outstation DA 200"
            >
              2. Outstation Tour (Traveller/KM)
            </button>

            <button
              type="button"
              onClick={() => {
                setTripFrom(tripStayedAt && tripStayedAt !== defaultHqCity ? tripStayedAt : 'Dibrugarh');
                setTripTo(defaultHqCity);
                setTripStayedAt(defaultHqCity);
                setTripMode('Bus');
                setTripKm('');
                setTripTa('');
                setTripDa(defaultOutstationDa);
                setTripOthers('');
              }}
              className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 transition cursor-pointer"
              title="Return trip back to Guwahati"
            >
              3. Return to {defaultHqCity}
            </button>
          </div>
        </div>

        {/* Outstation Trip Form */}
        <form onSubmit={handleApplyOutstationTripToDate} className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-2.5 items-end">
          <div>
            <label className="block text-[10px] font-black uppercase text-indigo-900 mb-1">
              Date (Day)
            </label>
            <select
              value={tripTargetDate}
              onChange={(e) => setTripTargetDate(e.target.value)}
              className="w-full px-2.5 py-2 text-xs font-black bg-indigo-950 text-white rounded-lg border border-indigo-800"
            >
              {bill.rows.map((r) => (
                <option key={r.id} value={r.date}>
                  Day {r.date} {r.from ? `(${r.from.slice(0, 10)})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase text-slate-700 mb-1">From City</label>
            <input
              type="text"
              list="assam-cities-datalist"
              value={tripFrom}
              onChange={(e) => setTripFrom(e.target.value)}
              placeholder="Dibrugarh"
              className="w-full px-2.5 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-lg text-slate-900"
            />
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase text-slate-700 mb-1">To City</label>
            <input
              type="text"
              list="assam-cities-datalist"
              value={tripTo}
              onChange={(e) => {
                setTripTo(e.target.value);
                if (!tripStayedAt || tripStayedAt === tripTo) {
                  setTripStayedAt(e.target.value);
                }
              }}
              placeholder="Makum / Moran"
              className="w-full px-2.5 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-lg text-slate-900"
            />
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase text-slate-700 mb-1">Stayed At</label>
            <input
              type="text"
              list="assam-cities-datalist"
              value={tripStayedAt}
              onChange={(e) => setTripStayedAt(e.target.value)}
              placeholder="Dibrugarh"
              className="w-full px-2.5 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-lg text-slate-900"
            />
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase text-slate-700 mb-1">Mode</label>
            <input
              type="text"
              list="transport-modes-list"
              value={tripMode}
              onChange={(e) => {
                setTripMode(e.target.value);
                handleTripBuilderKmChange(tripKm, e.target.value);
              }}
              placeholder="Traveller / Bus"
              className="w-full px-2.5 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-lg text-slate-900"
            />
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase text-slate-700 mb-1">Distance (KM)</label>
            <input
              type="text"
              value={tripKm}
              onChange={(e) => handleTripBuilderKmChange(e.target.value, tripMode)}
              placeholder="140"
              className="w-full px-2.5 py-2 text-xs font-mono font-bold bg-white border border-slate-300 rounded-lg text-slate-900 text-center"
            />
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase text-slate-700 mb-1">TA (₹)</label>
            <input
              type="text"
              value={tripTa}
              onChange={(e) => setTripTa(e.target.value)}
              placeholder="308"
              className="w-full px-2.5 py-2 text-xs font-mono font-bold bg-emerald-50 border border-emerald-300 rounded-lg text-emerald-950 text-center"
            />
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase text-slate-700 mb-1">Outstation DA</label>
            <input
              type="text"
              value={tripDa}
              onChange={(e) => setTripDa(e.target.value)}
              placeholder="200"
              className="w-full px-2.5 py-2 text-xs font-mono font-bold bg-white border border-slate-300 rounded-lg text-slate-900 text-center"
            />
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase text-slate-700 mb-1">Others (Ticket/Stay)</label>
            <input
              type="text"
              value={tripOthers}
              onChange={(e) => setTripOthers(e.target.value)}
              placeholder="868"
              className="w-full px-2.5 py-2 text-xs font-mono font-bold bg-white border border-slate-300 rounded-lg text-slate-900 text-center"
            />
          </div>

          <div className="flex flex-col gap-1">
            <button
              type="submit"
              className="w-full px-3 py-2 rounded-lg text-xs font-black bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition cursor-pointer flex items-center justify-center gap-1"
              title="Apply this Outside Guwahati trip to the selected Date and advance to next day"
            >
              <MapPin className="w-3.5 h-3.5" />
              <span>Set Day {tripTargetDate}</span>
            </button>
          </div>
        </form>

        {/* Saved Outside Guwahati Route Presets Bar */}
        <div className="pt-2 border-t border-indigo-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-black uppercase tracking-wider text-indigo-900 mr-1">
              1-Click Route Presets (Applies to Day {tripTargetDate}):
            </span>
            {outstationPresets.map((preset) => (
              <div
                key={preset.id}
                onClick={() => handleApplyRoutePresetToDate(preset)}
                className="group inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-white hover:bg-indigo-600 text-slate-800 hover:text-white border border-indigo-200 hover:border-indigo-600 transition cursor-pointer shadow-2xs"
                title={`Click to set Day ${tripTargetDate}: ${preset.from} → ${preset.to} (Stayed: ${preset.stayedAt}, Mode: ${preset.mode}, KM: ${preset.km || '-'}, TA: ${preset.ta || '-'}, DA: ${preset.da || '-'}, Others: ${preset.others || '-'})`}
              >
                <span>{preset.label}</span>
                {outstationPresets.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => handleDeleteRoutePreset(preset.id, e)}
                    className="opacity-40 group-hover:opacity-100 hover:text-amber-300 text-[10px] ml-0.5 cursor-pointer"
                    title="Remove this preset"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={handleSaveCurrentTripAsPreset}
            className="shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-indigo-100 hover:bg-indigo-200 text-indigo-900 border border-indigo-300 flex items-center gap-1 cursor-pointer self-start sm:self-auto"
            title="Save the current From/To/KM/Mode values above as a reusable 1-click button"
          >
            <BookmarkPlus className="w-3.5 h-3.5" />
            <span>Save Route Preset</span>
          </button>
        </div>
      </div>

      {/* AUTOMATIC INDIA NATIONAL & GAZETTED HOLIDAYS DETECTOR PANEL */}
      <div className="bg-gradient-to-r from-orange-50 via-white to-emerald-50 rounded-2xl border border-orange-200/80 p-4 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-orange-200/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-orange-500 text-white shadow-xs">
              <Flag className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-900">
                  India National & Gazetted Holidays — {MONTHS_LIST[bill.selectedMonthIndex]} {bill.selectedYear}
                </h3>
                <span className="px-2 py-0.5 text-[10px] font-bold bg-orange-100 text-orange-800 rounded-md border border-orange-200">
                  {activeMonthHolidaysList.length} Holiday{activeMonthHolidaysList.length === 1 ? '' : 's'} Detected
                </span>
              </div>
              <p className="text-[11px] text-slate-600">
                Automatically detects Indian National Holidays (Republic Day, Independence Day, Gandhi Jayanti) & major festival holidays for the selected month. Click any holiday below to mark/unmark it on the bill.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={holidayScope}
              onChange={(e) => setHolidayScope(e.target.value as 'all' | 'national_only')}
              className="px-2.5 py-1.5 text-[11px] font-bold bg-white border border-slate-300 rounded-lg text-slate-800"
              title="Choose which Indian holidays to detect automatically"
            >
              <option value="all">National + Gazetted & Festival Holidays</option>
              <option value="national_only">3 Mandatory National Holidays Only</option>
            </select>

            <select
              value={holidayFormatStyle}
              onChange={(e) =>
                setHolidayFormatStyle(e.target.value as 'named_parens' | 'national_holiday' | 'holiday_only')
              }
              className="px-2.5 py-1.5 text-[11px] font-bold bg-white border border-slate-300 rounded-lg text-slate-800"
              title="Format printed in the From column on the PDF"
            >
              <option value="named_parens">Format: ( REPUBLIC DAY )</option>
              <option value="national_holiday">Format: ( NATIONAL HOLIDAY )</option>
              <option value="holiday_only">Format: ( HOLIDAY )</option>
            </select>

            <button
              onClick={handleAutoApplyMonthHolidaysToCurrentBill}
              className="px-3 py-1.5 rounded-lg text-[11px] font-black bg-orange-600 hover:bg-orange-700 text-white shadow-xs transition cursor-pointer flex items-center gap-1.5"
              title="Mark all detected Indian holidays for this month on the current bill"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Auto-Mark Month Holidays in Bill</span>
            </button>
          </div>
        </div>

        {/* Detected Holidays List + Custom Holiday Quick Adder */}
        <div className="pt-3 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {activeMonthHolidaysList.length === 0 ? (
              <span className="text-xs text-slate-500 italic">
                No mandatory national holidays in {MONTHS_LIST[bill.selectedMonthIndex]} {bill.selectedYear}. You can add any state/local holiday on the right.
              </span>
            ) : (
              activeMonthHolidaysList.map((h) => {
                const matchingRow = bill.rows.find(
                  (r) => parseInt(String(r.date || '').trim(), 10) === h.day
                );
                const fromUpper = (matchingRow?.from || '').toUpperCase();
                const isMarkedOnBill =
                  fromUpper.includes('HOLIDAY') || fromUpper.includes(h.name.toUpperCase());

                return (
                  <button
                    key={`${h.monthIndex}-${h.day}-${h.name}`}
                    type="button"
                    onClick={() => handleToggleSingleHolidayOnBill(h)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border flex items-center gap-2 transition cursor-pointer ${
                      isMarkedOnBill
                        ? 'bg-orange-600 text-white border-orange-700 shadow-xs'
                        : 'bg-white hover:bg-orange-50 text-slate-800 border-orange-300'
                    }`}
                    title={
                      isMarkedOnBill
                        ? `Currently marked as Holiday on Date ${h.day}. Click to switch back to HQ Working Day.`
                        : `Click to mark Date ${h.day} as ${formatHolidayCellText(h)} in the bill.`
                    }
                  >
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-black ${
                        isMarkedOnBill ? 'bg-black/25 text-white' : 'bg-orange-100 text-orange-900'
                      }`}
                    >
                      {h.day} {MONTHS_LIST[h.monthIndex].slice(0, 3)}
                    </span>
                    <span>{h.name}</span>
                    {h.type === 'national' && (
                      <span
                        className={`text-[9px] uppercase px-1.5 py-0.2 rounded font-mono ${
                          isMarkedOnBill ? 'bg-amber-300 text-slate-950 font-black' : 'bg-amber-100 text-amber-900'
                        }`}
                      >
                        National
                      </span>
                    )}
                    <span className="text-[10px] opacity-85">
                      {isMarkedOnBill ? '✓ Marked' : '+ Apply'}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          {/* Add Custom Regional / State Holiday */}
          <form onSubmit={handleAddCustomHoliday} className="flex flex-wrap items-center gap-1.5 shrink-0">
            <input
              type="number"
              min={1}
              max={31}
              value={newCustomHolidayDay}
              onChange={(e) => setNewCustomHolidayDay(e.target.value)}
              placeholder="Day (1-31)"
              className="w-24 px-2.5 py-1.5 text-xs font-semibold bg-white border border-slate-300 rounded-lg text-slate-900"
            />
            <input
              type="text"
              value={newCustomHolidayName}
              onChange={(e) => setNewCustomHolidayName(e.target.value)}
              placeholder="Add Custom Holiday Name..."
              className="w-44 sm:w-52 px-2.5 py-1.5 text-xs font-semibold bg-white border border-slate-300 rounded-lg text-slate-900"
            />
            <button
              type="submit"
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white cursor-pointer flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add & Mark Holiday</span>
            </button>
          </form>
        </div>
      </div>

      {/* View Mode Switcher Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setViewMode('split')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
              viewMode === 'split'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>Interactive Editor + Live A4 Sheet</span>
          </button>
          <button
            onClick={() => setViewMode('editor')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
              viewMode === 'editor'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Full-Width Spreadsheet Editor</span>
          </button>
          <button
            onClick={() => setViewMode('preview')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
              viewMode === 'preview'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Exact Print / PDF Preview Only</span>
          </button>
          <button
            onClick={() => setViewMode('reference')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
              viewMode === 'reference'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>View Uploaded Reference PDF</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleAddRow}
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 flex items-center gap-1 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Date Row</span>
          </button>
          <button
            onClick={handleDownloadPdf}
            className="px-4 py-1.5 rounded-lg text-xs font-black bg-slate-900 hover:bg-slate-800 text-white flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-amber-400" />
            <span>Download PDF (₹{summary.grandTotal})</span>
          </button>
        </div>
      </div>

      {/* Reference PDF Embed View */}
      {viewMode === 'reference' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black uppercase text-slate-900">
                Original Reference File: MONTHLY EXPENDATURE.pdf
              </h3>
              <p className="text-xs text-slate-500">
                Attached reference template (`/assets/aistudio/MONTHLY_EXPENDATURE_9971750e.pdf`)
              </p>
            </div>
            <button
              onClick={() => setViewMode('split')}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-900 text-white cursor-pointer"
            >
              Back to Bill Editor
            </button>
          </div>
          <div className="w-full h-[780px] rounded-xl overflow-hidden border border-slate-300 bg-slate-100">
            <iframe
              src="/assets/aistudio/MONTHLY_EXPENDATURE_9971750e.pdf"
              title="Monthly Expenditure Reference PDF"
              className="w-full h-full"
            />
          </div>
        </div>
      )}

      {/* Main Content Area: Interactive Spreadsheet Editor & Exact A4 Sheet Preview */}
      {viewMode !== 'reference' && (
        <div
          className={`grid gap-6 items-start ${
            viewMode === 'split' ? 'grid-cols-1 2xl:grid-cols-12' : 'grid-cols-1'
          }`}
        >
          {/* INTERACTIVE SPREADSHEET EDITOR */}
          {(viewMode === 'split' || viewMode === 'editor') && (
            <div
              className={`${
                viewMode === 'split' ? '2xl:col-span-7' : 'col-span-1'
              } bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden`}
            >
              <div className="px-5 py-3.5 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Edit3 className="w-4 h-4 text-amber-400" />
                  <h3 className="text-xs font-black uppercase tracking-wider">
                    Interactive Daily Expenditure Table Editor ({bill.rows.length} Days)
                  </h3>
                </div>
                <span className="text-[11px] text-slate-300 font-mono">
                  Click <strong className="text-indigo-300">Out</strong> on any row when going outside {defaultHqCity}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-300 text-slate-800 font-black uppercase text-[10px] tracking-wider">
                      <th className="py-2.5 px-2 border-r border-slate-200 w-16 text-center">Date</th>
                      <th className="py-2.5 px-2 border-r border-slate-200 min-w-[135px] text-left">From</th>
                      <th className="py-2.5 px-2 border-r border-slate-200 min-w-[110px] text-left">To</th>
                      <th className="py-2.5 px-2 border-r border-slate-200 min-w-[110px] text-left">Stayed At</th>
                      <th className="py-2.5 px-2 border-r border-slate-200 w-24 text-left">Mode</th>
                      <th className="py-2.5 px-1.5 border-r border-slate-200 w-16 text-center">KM</th>
                      <th className="py-2.5 px-1.5 border-r border-slate-200 w-16 text-center">TA</th>
                      <th className="py-2.5 px-1.5 border-r border-slate-200 w-16 text-center">DA</th>
                      <th className="py-2.5 px-1.5 border-r border-slate-200 w-16 text-center">Others</th>
                      <th className="py-2.5 px-2 border-r border-slate-200 w-20 text-center bg-amber-50 text-slate-900">
                        Total
                      </th>
                      <th className="py-2.5 px-2 text-center w-52">Quick Fill</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {bill.rows.map((rawRow) => {
                      const row = getEffectiveRowForBill(rawRow);
                      const rowTotal = calculateRowTotal(row);
                      const dayNum = parseInt(String(row.date || '').trim(), 10);
                      const isCalendarSunday = !isNaN(dayNum) && activeMonthSundaysSet.has(dayNum);
                      const matchedHoliday = !isNaN(dayNum) ? activeMonthHolidaysMap.get(dayNum) : undefined;
                      const fromUpper = (row.from || '').toUpperCase().trim();
                      const isSunday = fromUpper.includes('SUNDAY');
                      const isHolidayRow =
                        fromUpper.includes('HOLIDAY') ||
                        (matchedHoliday && fromUpper.includes(matchedHoliday.name.toUpperCase()));
                      const isOff = fromUpper === 'OFF';

                      const hqLower = (defaultHqCity || 'Guwahati').toLowerCase().trim();
                      const isOutstationRow =
                        !isSunday &&
                        !isHolidayRow &&
                        !isOff &&
                        ((row.to && row.to.toLowerCase().trim() !== hqLower) ||
                          (row.stayedAt && row.stayedAt.toLowerCase().trim() !== hqLower) ||
                          (row.from && row.from.toLowerCase().trim() !== hqLower && row.to.trim() !== ''));

                      return (
                        <tr
                          key={row.id}
                          className={`transition-colors ${
                            isHolidayRow
                              ? 'bg-orange-50/70 hover:bg-orange-50'
                              : isSunday
                              ? 'bg-rose-50/60 hover:bg-rose-50'
                              : isOff
                              ? 'bg-amber-50/50 hover:bg-amber-50'
                              : isOutstationRow
                              ? 'bg-indigo-50/45 hover:bg-indigo-50/80'
                              : 'hover:bg-slate-50/90'
                          }`}
                        >
                          {/* Date + Auto Sunday & India Holiday Indicator */}
                          <td className="p-1 border-r border-slate-200">
                            <div className="flex flex-col items-end gap-0.5">
                              <input
                                type="text"
                                value={row.date}
                                onChange={(e) => updateRowCell(row.id, 'date', e.target.value)}
                                className="w-full px-1.5 py-0.5 text-right font-mono font-bold text-slate-800 bg-transparent focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 rounded"
                              />
                              {isCalendarSunday && (
                                <span
                                  onClick={() => applyRowPreset(row.id, 'sunday')}
                                  className="text-[8px] font-black uppercase tracking-tighter px-1 py-0.2 rounded bg-rose-100 text-rose-800 border border-rose-300 cursor-pointer hover:bg-rose-200"
                                  title={`${row.date} ${MONTHS_LIST[bill.selectedMonthIndex]} ${bill.selectedYear} is a Sunday`}
                                >
                                  ☀️ SUN
                                </span>
                              )}
                              {matchedHoliday && (
                                <button
                                  type="button"
                                  onClick={() => handleToggleSingleHolidayOnBill(matchedHoliday)}
                                  className="text-[8px] font-black uppercase tracking-tighter px-1 py-0.2 rounded bg-orange-100 text-orange-800 border border-orange-300 truncate max-w-[58px] cursor-pointer hover:bg-orange-200"
                                  title={`India Holiday on ${row.date} ${MONTHS_LIST[bill.selectedMonthIndex]}: ${matchedHoliday.name} (Click to toggle in bill)`}
                                >
                                  🇮🇳 {matchedHoliday.name.split(' ')[0]}
                                </button>
                              )}
                            </div>
                          </td>

                          {/* From */}
                          <td className="p-1 border-r border-slate-200">
                            <input
                              type="text"
                              list="assam-cities-datalist"
                              value={row.from}
                              onChange={(e) => updateRowCell(row.id, 'from', e.target.value)}
                              placeholder="Guwahati / Dibrugarh"
                              className={`w-full px-2 py-1 font-medium bg-transparent focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 rounded ${
                                isHolidayRow
                                  ? 'font-bold text-orange-800'
                                  : isSunday
                                  ? 'font-bold text-rose-700'
                                  : isOff
                                  ? 'font-bold text-amber-800'
                                  : isOutstationRow
                                  ? 'font-bold text-indigo-950'
                                  : 'text-slate-900'
                              }`}
                            />
                          </td>

                          {/* To */}
                          <td className="p-1 border-r border-slate-200">
                            <input
                              type="text"
                              list="assam-cities-datalist"
                              value={row.to}
                              onChange={(e) => updateRowCell(row.id, 'to', e.target.value)}
                              placeholder=""
                              className={`w-full px-2 py-1 bg-transparent focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 rounded ${
                                isOutstationRow ? 'font-bold text-indigo-950' : 'text-slate-900'
                              }`}
                            />
                          </td>

                          {/* Stayed At */}
                          <td className="p-1 border-r border-slate-200">
                            <input
                              type="text"
                              list="assam-cities-datalist"
                              value={row.stayedAt}
                              onChange={(e) => updateRowCell(row.id, 'stayedAt', e.target.value)}
                              placeholder=""
                              className="w-full px-2 py-1 text-slate-900 bg-transparent focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 rounded"
                            />
                          </td>

                          {/* Mode */}
                          <td className="p-1 border-r border-slate-200">
                            <input
                              type="text"
                              list="transport-modes-list"
                              value={row.mode}
                              onChange={(e) => updateRowCell(row.id, 'mode', e.target.value)}
                              placeholder=""
                              className="w-full px-2 py-1 text-slate-900 bg-transparent focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 rounded"
                            />
                          </td>

                          {/* KM */}
                          <td className="p-1 border-r border-slate-200">
                            <input
                              type="text"
                              value={row.km}
                              onChange={(e) => updateRowCell(row.id, 'km', e.target.value)}
                              className="w-full px-1 py-1 text-center font-mono text-slate-900 bg-transparent focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 rounded"
                            />
                          </td>

                          {/* TA */}
                          <td className="p-1 border-r border-slate-200">
                            <input
                              type="text"
                              value={row.ta}
                              onChange={(e) => updateRowCell(row.id, 'ta', e.target.value)}
                              className="w-full px-1 py-1 text-center font-mono text-slate-900 bg-transparent focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 rounded"
                            />
                          </td>

                          {/* DA */}
                          <td className="p-1 border-r border-slate-200">
                            <input
                              type="text"
                              value={row.da}
                              onChange={(e) => updateRowCell(row.id, 'da', e.target.value)}
                              className="w-full px-1 py-1 text-center font-mono text-slate-900 bg-transparent focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 rounded"
                            />
                          </td>

                          {/* Others */}
                          <td className="p-1 border-r border-slate-200">
                            <input
                              type="text"
                              value={row.others}
                              onChange={(e) => updateRowCell(row.id, 'others', e.target.value)}
                              className="w-full px-1 py-1 text-center font-mono text-slate-900 bg-transparent focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 rounded"
                            />
                          </td>

                          {/* Row Total */}
                          <td className="p-1 border-r border-slate-200 text-center font-mono font-bold text-slate-950 bg-amber-50/40">
                            {formatNumericCell(rowTotal)}
                          </td>

                          {/* Quick Row Presets */}
                          <td className="p-1 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => applyRowPreset(row.id, 'hq')}
                                className="px-1.5 py-0.5 text-[9px] font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded cursor-pointer"
                                title={`Set ${defaultHqCity} Bike Day (DA ${defaultLocalDa})`}
                              >
                                HQ
                              </button>
                              <button
                                type="button"
                                onClick={() => applyRowPreset(row.id, 'outstation')}
                                className="px-1.5 py-0.5 text-[9px] font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded cursor-pointer"
                                title={`Set Outside ${defaultHqCity} / Outstation Day (DA ${defaultOutstationDa}, Traveller, chains From previous Stayed At city)`}
                              >
                                Out
                              </button>
                              <button
                                type="button"
                                onClick={() => applyRowPreset(row.id, 'sunday')}
                                className="px-1.5 py-0.5 text-[9px] font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded cursor-pointer"
                                title="Mark as ( SUNDAY )"
                              >
                                Sun
                              </button>
                              <button
                                type="button"
                                onClick={() => applyRowPreset(row.id, 'holiday')}
                                className="px-1.5 py-0.5 text-[9px] font-bold bg-orange-50 hover:bg-orange-100 text-orange-800 border border-orange-200 rounded cursor-pointer"
                                title={
                                  matchedHoliday
                                    ? `Mark as ${formatHolidayCellText(matchedHoliday)}`
                                    : 'Mark as ( NATIONAL HOLIDAY )'
                                }
                              >
                                Hol
                              </button>
                              <button
                                type="button"
                                onClick={() => applyRowPreset(row.id, 'off')}
                                className="px-1.5 py-0.5 text-[9px] font-bold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded cursor-pointer"
                                title="Mark as Off"
                              >
                                Off
                              </button>
                              <button
                                type="button"
                                onClick={() => applyRowPreset(row.id, 'clear')}
                                className="px-1 py-0.5 text-[9px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-600 rounded cursor-pointer"
                                title="Clear Row"
                              >
                                Clr
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteRow(row.id)}
                                className="p-0.5 text-slate-300 hover:text-red-600 cursor-pointer"
                                title="Delete Row"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-100 border-t-2 border-slate-300 font-mono text-xs font-bold text-slate-900">
                      <td colSpan={5} className="py-2 px-3 text-right uppercase text-[10px] tracking-wider text-slate-500">
                        Column Totals:
                      </td>
                      <td className="py-2 px-1.5 text-center border-l border-slate-300">{formatNumericCell(summary.totalKm)}</td>
                      <td className="py-2 px-1.5 text-center border-l border-slate-300">{formatNumericCell(summary.totalTa)}</td>
                      <td className="py-2 px-1.5 text-center border-l border-slate-300">{formatNumericCell(summary.totalDa)}</td>
                      <td className="py-2 px-1.5 text-center border-l border-slate-300">{formatNumericCell(summary.totalOthers)}</td>
                      <td className="py-2 px-2 text-center border-l border-slate-300 bg-slate-800 text-white font-black text-xs">
                        {summary.grandTotal}
                      </td>
                      <td className="py-2 px-2"></td>
                    </tr>
                    <tr className="bg-amber-50/70 border-t border-slate-300 text-xs font-bold text-slate-900">
                      <td colSpan={8} className="py-2 px-3 text-left text-slate-900 font-bold">
                        Amount in Words: <span className="text-indigo-950">{numberToIndianWords(summary.grandTotal)}</span>
                      </td>
                      <td className="py-2 px-1.5 text-center border-l border-slate-300 font-black uppercase">TOTAL</td>
                      <td className="py-2 px-2 text-center border-l border-slate-300 bg-black text-white font-black text-sm">
                        {summary.grandTotal}
                      </td>
                      <td className="py-2 px-2"></td>
                    </tr>
                  </tfoot>
                </table>

                <datalist id="transport-modes-list">
                  <option value="Bike" />
                  <option value="Bus" />
                  <option value="Traveller" />
                  <option value="Train" />
                  <option value="Cab" />
                  <option value="Auto" />
                  <option value="Flight" />
                </datalist>

                <datalist id="assam-cities-datalist">
                  {ASSAM_NE_CITIES.map((city) => (
                    <option key={city} value={city} />
                  ))}
                </datalist>
              </div>
            </div>
          )}

          {/* LIVE EXACT A4 PRINT / PDF SHEET PREVIEW */}
          {(viewMode === 'split' || viewMode === 'preview') && (
            <div
              className={`${
                viewMode === 'split' ? '2xl:col-span-5' : 'col-span-1 max-w-4xl mx-auto w-full'
              } bg-slate-200/70 rounded-2xl p-4 sm:p-6 border border-slate-300 shadow-inner`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-slate-800" />
                  <span className="text-xs font-black uppercase tracking-wider text-slate-800">
                    Live A4 PDF Sheet Preview (1:1 Match)
                  </span>
                </div>
                <button
                  onClick={handleDownloadPdf}
                  className="px-3 py-1 rounded-lg bg-black hover:bg-slate-800 text-white font-bold text-[11px] flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Download className="w-3 h-3 text-amber-400" />
                  <span>Save PDF</span>
                </button>
              </div>

              {/* A4 White Paper Sheet */}
              <div className="bg-white text-black p-5 sm:p-7 shadow-xl border border-slate-300 mx-auto overflow-x-auto">
                <table className="w-full border-collapse text-[11px] leading-tight font-sans text-black">
                  <tbody>
                    {/* Top Metadata Row */}
                    <tr>
                      <td className="py-1 px-1.5 text-right whitespace-nowrap font-normal">Name:-</td>
                      <td className="py-1 px-2 text-center font-bold bg-black text-white border border-black whitespace-nowrap">
                        {bill.name}
                      </td>
                      <td className="py-1 px-1.5 text-right whitespace-nowrap font-normal">Designation:-</td>
                      <td colSpan={2} className="py-1 px-1.5 text-center whitespace-nowrap font-normal">
                        {bill.designation}
                      </td>
                      <td className="py-1 px-1.5 text-right whitespace-nowrap font-normal">Area:-</td>
                      <td className="py-1 px-1.5 text-left whitespace-nowrap font-normal">{bill.area}</td>
                      <td colSpan={2} className="py-1 px-1.5 text-right whitespace-nowrap font-normal">
                        Expendature bill:-
                      </td>
                      <td className="py-1 px-2 text-center font-bold bg-black text-white border border-black whitespace-nowrap">
                        {bill.billMonthLabel}
                      </td>
                    </tr>

                    {/* Table Column Headers */}
                    <tr className="text-center font-normal">
                      <td className="border border-black py-1 px-1.5 w-[7%]">Date</td>
                      <td className="border border-black py-1 px-1.5 w-[14%]">From</td>
                      <td className="border border-black py-1 px-1.5 w-[12%]">To</td>
                      <td className="border border-black py-1 px-1.5 w-[12%]">Stayed At</td>
                      <td className="border border-black py-1 px-1.5 w-[11%]">Mode</td>
                      <td className="border border-black py-1 px-1.5 w-[8.5%]">KM</td>
                      <td className="border border-black py-1 px-1.5 w-[8.5%]">TA</td>
                      <td className="border border-black py-1 px-1.5 w-[8.5%]">DA</td>
                      <td className="border border-black py-1 px-1.5 w-[8.5%]">Others</td>
                      <td className="border border-black py-1 px-1.5 w-[10%]">Total</td>
                    </tr>

                    {/* Daily Rows */}
                    {bill.rows.map((rawRow) => {
                      const r = getEffectiveRowForBill(rawRow);
                      const rowTotal = calculateRowTotal(r);
                      return (
                        <tr key={r.id} className="h-[19px]">
                          <td className="border border-black py-0.5 px-1.5 text-right">{r.date}</td>
                          <td className="border border-black py-0.5 px-1.5 text-left whitespace-nowrap">{r.from}</td>
                          <td className="border border-black py-0.5 px-1.5 text-left whitespace-nowrap">{r.to}</td>
                          <td className="border border-black py-0.5 px-1.5 text-left whitespace-nowrap">{r.stayedAt}</td>
                          <td className="border border-black py-0.5 px-1.5 text-left whitespace-nowrap">{r.mode}</td>
                          <td className="border border-black py-0.5 px-1.5 text-center">{r.km}</td>
                          <td className="border border-black py-0.5 px-1.5 text-center">{r.ta}</td>
                          <td className="border border-black py-0.5 px-1.5 text-center">{r.da}</td>
                          <td className="border border-black py-0.5 px-1.5 text-center">{r.others}</td>
                          <td className="border border-black py-0.5 px-1.5 text-center">
                            {formatNumericCell(rowTotal)}
                          </td>
                        </tr>
                      );
                    })}

                    {/* Summary Row 1 (Subtotal row under TA, DA, Others, Total) */}
                    <tr className="h-[19px]">
                      <td colSpan={6} className="border-t border-black border-l-0 border-r-0 border-b-0"></td>
                      <td className="border border-black py-0.5 px-1.5 text-center">
                        {showColumnSubtotalsInPdf ? formatNumericCell(summary.totalTa) : ''}
                      </td>
                      <td className="border border-black py-0.5 px-1.5 text-center">
                        {showColumnSubtotalsInPdf ? formatNumericCell(summary.totalDa) : ''}
                      </td>
                      <td className="border border-black py-0.5 px-1.5 text-center">
                        {showColumnSubtotalsInPdf ? formatNumericCell(summary.totalOthers) : ''}
                      </td>
                      <td className="border border-black py-0.5 px-1.5 text-center">{summary.grandTotal}</td>
                    </tr>

                    {/* Summary Row 2 (Amount in Words | TOTAL | Black box with Grand Total) */}
                    <tr className="h-[20px]">
                      <td colSpan={8} className="border-0 py-0.5 px-1.5 text-left font-bold">
                        Amount in Words: {numberToIndianWords(summary.grandTotal)}
                      </td>
                      <td className="border border-black py-0.5 px-1.5 text-center font-bold">TOTAL</td>
                      <td className="border border-black py-0.5 px-1.5 text-center font-bold bg-black text-white">
                        {summary.grandTotal}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MonthlyExpenditureBill;
