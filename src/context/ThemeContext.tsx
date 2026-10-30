import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { Eye, Moon, Sun, RotateCcw, Sparkles, Feather, Compass, Leaf, Trees } from 'lucide-react';
import { safeLocalStorage } from '../lib/safeLocalStorage';

export type WorkspaceTheme = 
  | 'classic' 
  | 'green'
  | 'warm-sand' 
  | 'calm-sage' 
  | 'soft-slate' 
  | 'desert-clay'
  | 'nordic-frost'
  | 'earthy-olive'
  | 'dimmed';

export type EyeComfortTheme = WorkspaceTheme; // Backward compatibility with SalesDashboard

export interface ThemeStyles {
  name: string;
  shortName: string;
  tag: string;
  isDark?: boolean;
  containerBg: string;
  mainBg: string;
  cardBg: string;
  cardBorder: string;
  subSurface: string;
  textHeading: string;
  textMuted: string;
  textBody: string;
  tableHeader: string;
  tableRowHover: string;
  tableBorder: string;
  tableDivide: string;
  badgeBg: string;
  badgeText: string;
  inputBg: string;
  inputBorder: string;
  kpiQtyBg: string;
  kpiQtyIcon: string;
  kpiRevBg: string;
  kpiRevIcon: string;
  filterBg: string;
}

export const WORKSPACE_THEMES: Record<WorkspaceTheme, ThemeStyles> = {
  'classic': {
    name: 'Classic (Original)',
    shortName: 'Classic',
    tag: 'Previous original bright theme',
    isDark: false,
    containerBg: 'bg-sky-50',
    mainBg: 'bg-sky-50/50',
    cardBg: 'bg-white',
    cardBorder: 'border-gray-200',
    subSurface: 'bg-slate-50',
    textHeading: 'text-slate-900',
    textMuted: 'text-slate-500',
    textBody: 'text-slate-700',
    tableHeader: 'bg-slate-50',
    tableRowHover: 'hover:bg-indigo-50/40',
    tableBorder: 'border-slate-200',
    tableDivide: 'divide-slate-200',
    badgeBg: 'bg-slate-100',
    badgeText: 'text-slate-700',
    inputBg: 'bg-white',
    inputBorder: 'border-slate-300',
    kpiQtyBg: 'bg-emerald-50',
    kpiQtyIcon: 'text-emerald-600',
    kpiRevBg: 'bg-indigo-50',
    kpiRevIcon: 'text-indigo-600',
    filterBg: 'bg-slate-50',
  },
  'green': {
    name: 'Green',
    shortName: 'Green',
    tag: 'Fresh vibrant emerald & lush forest green',
    isDark: false,
    containerBg: 'bg-[#dcfce7]',
    mainBg: 'bg-[#dcfce7]/70',
    cardBg: 'bg-[#f0fdf4]',
    cardBorder: 'border-[#86efac]',
    subSurface: 'bg-[#bbf7d0]/65',
    textHeading: 'text-[#052e16]',
    textMuted: 'text-[#166534]',
    textBody: 'text-[#14532d]',
    tableHeader: 'bg-[#bbf7d0]',
    tableRowHover: 'hover:bg-[#dcfce7]',
    tableBorder: 'border-[#86efac]',
    tableDivide: 'divide-[#bbf7d0]',
    badgeBg: 'bg-[#bbf7d0]',
    badgeText: 'text-[#14532d]',
    inputBg: 'bg-[#f7fee7]',
    inputBorder: 'border-[#4ade80]',
    kpiQtyBg: 'bg-[#bbf7d0]',
    kpiQtyIcon: 'text-[#15803d]',
    kpiRevBg: 'bg-[#d1fae5]',
    kpiRevIcon: 'text-[#047857]',
    filterBg: 'bg-[#dcfce7]',
  },
  'warm-sand': {
    name: 'Warm Sand',
    shortName: 'Warm Sand',
    tag: 'Soothing linen & warm stone',
    isDark: false,
    containerBg: 'bg-[#f4efe6]',
    mainBg: 'bg-[#f4efe6]/60',
    cardBg: 'bg-[#fcfaf5]',
    cardBorder: 'border-[#ded4c3]',
    subSurface: 'bg-[#ebe4d6]',
    textHeading: 'text-[#23292f]',
    textMuted: 'text-[#645e54]',
    textBody: 'text-[#333a42]',
    tableHeader: 'bg-[#eae3d4]',
    tableRowHover: 'hover:bg-[#f3ece0]',
    tableBorder: 'border-[#ded4c3]',
    tableDivide: 'divide-[#e8dfcf]',
    badgeBg: 'bg-[#e4dcce]',
    badgeText: 'text-[#4e463a]',
    inputBg: 'bg-[#f5f0e6]',
    inputBorder: 'border-[#cfc4b0]',
    kpiQtyBg: 'bg-[#e2ede4]',
    kpiQtyIcon: 'text-[#2b5e3f]',
    kpiRevBg: 'bg-[#dee5f2]',
    kpiRevIcon: 'text-[#364e75]',
    filterBg: 'bg-[#ebe4d6]',
  },
  'calm-sage': {
    name: 'Calm Sage',
    shortName: 'Calm Sage',
    tag: 'Restful organic herbal green',
    isDark: false,
    containerBg: 'bg-[#ebf2ec]',
    mainBg: 'bg-[#ebf2ec]/60',
    cardBg: 'bg-[#f7faf8]',
    cardBorder: 'border-[#c8dbcc]',
    subSurface: 'bg-[#dfebe1]',
    textHeading: 'text-[#1c2c21]',
    textMuted: 'text-[#4f6756]',
    textBody: 'text-[#2a3c2f]',
    tableHeader: 'bg-[#dce9df]',
    tableRowHover: 'hover:bg-[#e7f1e9]',
    tableBorder: 'border-[#c8dbcc]',
    tableDivide: 'divide-[#d4e4d7]',
    badgeBg: 'bg-[#d5e4d8]',
    badgeText: 'text-[#395341]',
    inputBg: 'bg-[#eff6f0]',
    inputBorder: 'border-[#b8cdbc]',
    kpiQtyBg: 'bg-[#dbe9de]',
    kpiQtyIcon: 'text-[#28593a]',
    kpiRevBg: 'bg-[#d7e4f0]',
    kpiRevIcon: 'text-[#314a6e]',
    filterBg: 'bg-[#dfebe1]',
  },
  'soft-slate': {
    name: 'Soft Slate',
    shortName: 'Soft Slate',
    tag: 'Cool twilight slate blue',
    isDark: false,
    containerBg: 'bg-[#eaeff6]',
    mainBg: 'bg-[#eaeff6]/60',
    cardBg: 'bg-[#f7f9fd]',
    cardBorder: 'border-[#c9d6e7]',
    subSurface: 'bg-[#dce5f2]',
    textHeading: 'text-[#1a2636]',
    textMuted: 'text-[#50637a]',
    textBody: 'text-[#2b3a4e]',
    tableHeader: 'bg-[#dbe4f1]',
    tableRowHover: 'hover:bg-[#e7eef8]',
    tableBorder: 'border-[#c9d6e7]',
    tableDivide: 'divide-[#d3dfed]',
    badgeBg: 'bg-[#d3dfef]',
    badgeText: 'text-[#364962]',
    inputBg: 'bg-[#edf2f9]',
    inputBorder: 'border-[#b9cbe0]',
    kpiQtyBg: 'bg-[#d5e8dc]',
    kpiQtyIcon: 'text-[#255436]',
    kpiRevBg: 'bg-[#d5e0f0]',
    kpiRevIcon: 'text-[#2a4569]',
    filterBg: 'bg-[#dce5f2]',
  },
  'desert-clay': {
    name: 'Desert Clay',
    shortName: 'Desert Clay',
    tag: 'Warm terracotta, blush & adobe',
    isDark: false,
    containerBg: 'bg-[#f7f1ed]',
    mainBg: 'bg-[#f7f1ed]/60',
    cardBg: 'bg-[#fdf9f7]',
    cardBorder: 'border-[#dfcfc7]',
    subSurface: 'bg-[#ecded7]',
    textHeading: 'text-[#2e211e]',
    textMuted: 'text-[#6a544f]',
    textBody: 'text-[#382b27]',
    tableHeader: 'bg-[#ebdcd4]',
    tableRowHover: 'hover:bg-[#f5e9e3]',
    tableBorder: 'border-[#dfcfc7]',
    tableDivide: 'divide-[#e8dad2]',
    badgeBg: 'bg-[#e5d4cb]',
    badgeText: 'text-[#583f38]',
    inputBg: 'bg-[#f8f1ec]',
    inputBorder: 'border-[#d4c0b6]',
    kpiQtyBg: 'bg-[#e3eee6]',
    kpiQtyIcon: 'text-[#2b5e3f]',
    kpiRevBg: 'bg-[#f2e2dc]',
    kpiRevIcon: 'text-[#964e3b]',
    filterBg: 'bg-[#ecded7]',
  },
  'nordic-frost': {
    name: 'Nordic Frost',
    shortName: 'Nordic Frost',
    tag: 'Glacial mist, arctic teal & clean air',
    isDark: false,
    containerBg: 'bg-[#edf4f6]',
    mainBg: 'bg-[#edf4f6]/60',
    cardBg: 'bg-[#f7fbfc]',
    cardBorder: 'border-[#c4d9e0]',
    subSurface: 'bg-[#dbe9ed]',
    textHeading: 'text-[#182a32]',
    textMuted: 'text-[#4e6873]',
    textBody: 'text-[#233842]',
    tableHeader: 'bg-[#d9e7ec]',
    tableRowHover: 'hover:bg-[#e7f1f5]',
    tableBorder: 'border-[#c4d9e0]',
    tableDivide: 'divide-[#cfe0e6]',
    badgeBg: 'bg-[#cfe1e8]',
    badgeText: 'text-[#294c59]',
    inputBg: 'bg-[#edf4f7]',
    inputBorder: 'border-[#b5cfd9]',
    kpiQtyBg: 'bg-[#d8ebe1]',
    kpiQtyIcon: 'text-[#205b39]',
    kpiRevBg: 'bg-[#d3e5eb]',
    kpiRevIcon: 'text-[#245e6b]',
    filterBg: 'bg-[#dbe9ed]',
  },
  'earthy-olive': {
    name: 'Earthy Olive',
    shortName: 'Earthy Olive',
    tag: 'Grounding olive, meadow & moss',
    isDark: false,
    containerBg: 'bg-[#f0f3eb]',
    mainBg: 'bg-[#f0f3eb]/60',
    cardBg: 'bg-[#f9faf6]',
    cardBorder: 'border-[#cbd5c0]',
    subSurface: 'bg-[#dfe6d4]',
    textHeading: 'text-[#1e2817]',
    textMuted: 'text-[#53634b]',
    textBody: 'text-[#2a3622]',
    tableHeader: 'bg-[#dce4d0]',
    tableRowHover: 'hover:bg-[#e9f0e0]',
    tableBorder: 'border-[#cbd5c0]',
    tableDivide: 'divide-[#d3dec8]',
    badgeBg: 'bg-[#d4dfca]',
    badgeText: 'text-[#3b4b2e]',
    inputBg: 'bg-[#eff3ea]',
    inputBorder: 'border-[#b9c6ac]',
    kpiQtyBg: 'bg-[#dcead8]',
    kpiQtyIcon: 'text-[#255b2d]',
    kpiRevBg: 'bg-[#dce4d0]',
    kpiRevIcon: 'text-[#485935]',
    filterBg: 'bg-[#dfe6d4]',
  },
  'dimmed': {
    name: 'Dimmed',
    shortName: 'Dimmed',
    tag: 'Comfortable low-glare dark slate',
    isDark: true,
    containerBg: 'bg-[#181d24]',
    mainBg: 'bg-[#181d24]',
    cardBg: 'bg-[#212732]',
    cardBorder: 'border-[#333c4c]',
    subSurface: 'bg-[#293140]',
    textHeading: 'text-[#f0f4f8]',
    textMuted: 'text-[#9ba8bc]',
    textBody: 'text-[#d6deeb]',
    tableHeader: 'bg-[#28303e]',
    tableRowHover: 'hover:bg-[#2c3544]',
    tableBorder: 'border-[#333c4c]',
    tableDivide: 'divide-[#2f3747]',
    badgeBg: 'bg-[#313b4c]',
    badgeText: 'text-[#c6d3e6]',
    inputBg: 'bg-[#1e242e]',
    inputBorder: 'border-[#434e62]',
    kpiQtyBg: 'bg-[#21382a]',
    kpiQtyIcon: 'text-[#5ec284]',
    kpiRevBg: 'bg-[#223249]',
    kpiRevIcon: 'text-[#7da9e6]',
    filterBg: 'bg-[#293140]',
  },
};

export const THEME_LIST: WorkspaceTheme[] = [
  'classic',
  'green',
  'warm-sand',
  'calm-sage',
  'soft-slate',
  'desert-clay',
  'nordic-frost',
  'earthy-olive',
  'dimmed',
];

interface ThemeContextType {
  theme: WorkspaceTheme;
  setTheme: (theme: WorkspaceTheme) => void;
  themeStyles: ThemeStyles;
  isDark: boolean;
  isClassic: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const STORAGE_KEY = 'workspace_eye_theme';
const LEGACY_STORAGE_KEY = 'sales_dashboard_eye_theme';
const GREEN_THEME_MIGRATION_KEY = 'workspace_green_theme_v1_migrated';

const isValidTheme = (val: string | null): val is WorkspaceTheme => {
  return !!val && THEME_LIST.includes(val as WorkspaceTheme);
};

const getInitialTheme = (): WorkspaceTheme => {
  try {
    const migrated = safeLocalStorage.getItem(GREEN_THEME_MIGRATION_KEY);
    if (migrated !== 'true') {
      safeLocalStorage.setItem(GREEN_THEME_MIGRATION_KEY, 'true');
      safeLocalStorage.setItem(STORAGE_KEY, 'green');
      safeLocalStorage.setItem(LEGACY_STORAGE_KEY, 'green');
      return 'green';
    }
    const saved = safeLocalStorage.getItem(STORAGE_KEY) || safeLocalStorage.getItem(LEGACY_STORAGE_KEY);
    if (isValidTheme(saved)) {
      return saved;
    }
  } catch (_) {}
  return 'green';
};

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<WorkspaceTheme>(getInitialTheme);

  const applyThemeToDOM = useCallback((currentTheme: WorkspaceTheme) => {
    try {
      if (typeof document !== 'undefined') {
        document.documentElement.setAttribute('data-theme', currentTheme);
        document.body.setAttribute('data-theme', currentTheme);
        if (currentTheme === 'dimmed') {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
        if (currentTheme === 'green' || currentTheme === 'calm-sage' || currentTheme === 'earthy-olive') {
          document.documentElement.classList.add('theme-emerald');
        } else {
          document.documentElement.classList.remove('theme-emerald');
        }
      }
    } catch (_) {}
  }, []);

  const setTheme = useCallback((newTheme: WorkspaceTheme) => {
    setThemeState(newTheme);
    try {
      safeLocalStorage.setItem(GREEN_THEME_MIGRATION_KEY, 'true');
      safeLocalStorage.setItem(STORAGE_KEY, newTheme);
      safeLocalStorage.setItem(LEGACY_STORAGE_KEY, newTheme);
      applyThemeToDOM(newTheme);
    } catch (_) {}
  }, [applyThemeToDOM]);

  // Apply on mount
  useEffect(() => {
    applyThemeToDOM(theme);
  }, [theme, applyThemeToDOM]);

  // Sync across storage updates
  useEffect(() => {
    const handleStorage = () => {
      try {
        const saved = safeLocalStorage.getItem(STORAGE_KEY) || safeLocalStorage.getItem(LEGACY_STORAGE_KEY);
        if (isValidTheme(saved)) {
          setThemeState(saved);
          applyThemeToDOM(saved);
        }
      } catch (_) {}
    };

    const unsubscribe = safeLocalStorage.onChange(handleStorage);
    window.addEventListener('storage', handleStorage);
    return () => {
      unsubscribe();
      window.removeEventListener('storage', handleStorage);
    };
  }, [applyThemeToDOM]);

  const themeStyles = WORKSPACE_THEMES[theme] || WORKSPACE_THEMES['classic'];

  return (
    <ThemeContext.Provider value={{
      theme,
      setTheme,
      themeStyles,
      isDark: theme === 'dimmed',
      isClassic: theme === 'classic',
    }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext);
  if (!context) {
    // Fallback if rendered outside provider
    const fallbackTheme = getInitialTheme();
    return {
      theme: fallbackTheme,
      setTheme: () => {},
      themeStyles: WORKSPACE_THEMES[fallbackTheme],
      isDark: fallbackTheme === 'dimmed',
      isClassic: fallbackTheme === 'classic',
    };
  }
  return context;
}

interface ThemeSwitcherProps {
  className?: string;
  compact?: boolean;
  showLabel?: boolean;
}

export function ThemeSwitcher({ className = '', compact = false, showLabel = true }: ThemeSwitcherProps) {
  const { theme, setTheme, themeStyles } = useTheme();

  return (
    <div 
      className={`inline-flex items-center gap-1 p-1 rounded-xl border transition-colors duration-200 shadow-xs overflow-x-auto max-w-full custom-scrollbar ${themeStyles.cardBorder} ${themeStyles.subSurface} ${className}`}
      role="group"
      aria-label="Color theme selector"
    >
      {showLabel && (
        <div className={`flex items-center gap-1.5 px-2 text-xs font-bold shrink-0 ${themeStyles.textMuted}`}>
          <Eye className="w-3.5 h-3.5 text-emerald-600" />
          <span className="hidden sm:inline">Workspace Theme:</span>
        </div>
      )}

      {THEME_LIST.map((t) => {
        const isActive = theme === t;
        const config = WORKSPACE_THEMES[t];
        
        let activeBgClass = 'bg-indigo-600 text-white shadow-xs';
        if (t === 'classic') activeBgClass = 'bg-slate-700 text-white shadow-xs';
        if (t === 'green') activeBgClass = 'bg-[#15803d] text-white shadow-sm ring-2 ring-emerald-400/60';
        if (t === 'warm-sand') activeBgClass = 'bg-[#ba6a20] text-white shadow-xs';
        if (t === 'calm-sage') activeBgClass = 'bg-[#2b644a] text-white shadow-xs';
        if (t === 'soft-slate') activeBgClass = 'bg-[#375577] text-white shadow-xs';
        if (t === 'desert-clay') activeBgClass = 'bg-[#984d38] text-white shadow-xs';
        if (t === 'nordic-frost') activeBgClass = 'bg-[#256372] text-white shadow-xs';
        if (t === 'earthy-olive') activeBgClass = 'bg-[#4b5d37] text-white shadow-xs';
        if (t === 'dimmed') activeBgClass = 'bg-[#374457] text-amber-300 shadow-xs';

        return (
          <button
            key={t}
            type="button"
            onClick={() => setTheme(t)}
            className={`${compact ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'} rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              isActive 
                ? activeBgClass
                : t === 'green'
                ? 'bg-emerald-100/90 text-emerald-900 border border-emerald-300 hover:bg-emerald-200'
                : `${themeStyles.textBody} hover:bg-black/5 dark:hover:bg-white/10 opacity-75 hover:opacity-100`
            }`}
            title={`${config.name} — ${config.tag}`}
          >
            {t === 'classic' && (
              <RotateCcw className={`w-3 h-3 ${isActive ? 'text-white' : 'text-slate-500'}`} />
            )}
            {t === 'green' && (
              <Trees className={`w-3 h-3 ${isActive ? 'text-green-200' : 'text-[#15803d]'}`} />
            )}
            {t === 'warm-sand' && (
              <Sun className={`w-3 h-3 ${isActive ? 'text-amber-200' : 'text-[#ba6a20]'}`} />
            )}
            {t === 'calm-sage' && (
              <Sparkles className={`w-3 h-3 ${isActive ? 'text-emerald-200' : 'text-[#2b644a]'}`} />
            )}
            {t === 'soft-slate' && (
              <Eye className={`w-3 h-3 ${isActive ? 'text-sky-200' : 'text-[#375577]'}`} />
            )}
            {t === 'desert-clay' && (
              <Feather className={`w-3 h-3 ${isActive ? 'text-rose-200' : 'text-[#984d38]'}`} />
            )}
            {t === 'nordic-frost' && (
              <Compass className={`w-3 h-3 ${isActive ? 'text-cyan-200' : 'text-[#256372]'}`} />
            )}
            {t === 'earthy-olive' && (
              <Leaf className={`w-3 h-3 ${isActive ? 'text-lime-200' : 'text-[#4b5d37]'}`} />
            )}
            {t === 'dimmed' && (
              <Moon className={`w-3 h-3 ${isActive ? 'text-amber-300' : 'text-slate-400'}`} />
            )}
            <span>{config.shortName}</span>
            {t === 'classic' && !compact && (
              <span className={`text-[9px] px-1 py-0.2 rounded font-normal uppercase tracking-wider ${
                isActive ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600'
              }`}>
                Orig
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
