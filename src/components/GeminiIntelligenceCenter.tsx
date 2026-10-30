import React, { useState, useEffect } from 'react';
import { 
  Sparkles, Search, MessageSquare, AlertTriangle, CheckCircle2, ArrowRight, X, RefreshCw, Briefcase, Users, ListTodo, CreditCard, HelpCircle
} from 'lucide-react';

interface GeminiIntelligenceCenterProps {
  influencers: any[];
  campaigns: any[];
  tasks: any[];
  billingEntries: any[];
  onNavigateTab: (tab: any) => void;
  onSelectInfluencer?: (id: string) => void;
}

interface AdviceCard {
  id: string;
  category: string;
  title: string;
  analysis: string;
  prescription: string;
  severity: 'High' | 'Medium' | 'Low';
}

interface SearchEntity {
  id: string;
  type: 'influencer' | 'campaign' | 'task' | 'billing';
  name: string;
  matchMetric: string;
}

export default function GeminiIntelligenceCenter({
  influencers,
  campaigns,
  tasks,
  billingEntries,
  onNavigateTab,
  onSelectInfluencer
}: GeminiIntelligenceCenterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<{
    answer: string;
    entities: SearchEntity[];
    suggestedAction?: string;
  } | null>(null);

  const [adviceCards, setAdviceCards] = useState<AdviceCard[]>([]);
  const [isAuditing, setIsAuditing] = useState(false);
  const [adviceError, setAdviceError] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Quick search presets
  const searchPresets = [
    { label: "Creators with ROI > 3.0x", query: "Which creators have high average ROI greater than 3.0 multiplier?" },
    { label: "Find Tech Niche partners", query: "Find developers or influencers in Tech niche or category" },
    { label: "Timeline Check: Overdue Videos", query: "Are there any deliverable tasks that are pending or overdue release?" },
    { label: "Financial Status & Unpaid Invoices", query: "Find unpaid payout or invoice entries in the finance system" }
  ];

  // Automated proactive advice generator on mount and state change
  const triggerSelfAdviceAudit = async () => {
    setIsAuditing(true);
    setAdviceError(null);
    try {
      const response = await fetch('/api/gemini-query-advisor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'advise',
          data: { influencers, campaigns, tasks, billingEntries }
        })
      });

      if (!response.ok) {
        throw new Error(`Server returned HTTP code ${response.status}`);
      }

      const resData = await response.json();
      if (resData.success && resData.data?.cards) {
        setAdviceCards(resData.data.cards);
      } else {
        throw new Error("Invalid response format received from AI Strategic Advisor.");
      }
    } catch (err: any) {
      console.error("Gemini Advisor Audit Error:", err);
      setAdviceError(err?.message || "Failed to retrieve live marketing audit advice.");
    } finally {
      setIsAuditing(false);
    }
  };

  useEffect(() => {
    // Initial fetch of advice once component mounts
    triggerSelfAdviceAudit();
  }, [influencers.length, campaigns.length, tasks.length, billingEntries.length]);

  const handleSearchSubmit = async (e?: React.FormEvent, customQuery?: string) => {
    if (e) e.preventDefault();
    const queryToUse = (customQuery || searchQuery).trim();
    if (!queryToUse) return;

    setIsSearching(true);
    setSearchError(null);
    setSearchResult(null);

    if (customQuery) {
      setSearchQuery(customQuery);
    }

    try {
      const response = await fetch('/api/gemini-query-advisor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'search',
          query: queryToUse,
          data: { influencers, campaigns, tasks, billingEntries }
        })
      });

      if (!response.ok) {
        throw new Error(`Server returned HTTP code ${response.status}`);
      }

      const resData = await response.json();
      if (resData.success && resData.data) {
        setSearchResult(resData.data);
      } else {
        throw new Error("Invalid search response format received from Spark Search.");
      }
    } catch (err: any) {
      console.error("Gemini Spark Search Error:", err);
      setSearchError(err?.message || "Failed to analyze data semantic query.");
    } finally {
      setIsSearching(false);
    }
  };

  // Switch tabs & scroll to views for entity highlights
  const handleEntityClick = (entity: SearchEntity) => {
    setIsOpen(false); // Close AI panel to reveal highlight
    
    if (entity.type === 'influencer') {
      if (onSelectInfluencer) {
        onSelectInfluencer(entity.id);
      }
      onNavigateTab('database');
    } else if (entity.type === 'campaign') {
      onNavigateTab('campaigns');
    } else if (entity.type === 'task') {
      onNavigateTab('tasks');
    } else if (entity.type === 'billing') {
      onNavigateTab('billing');
    }
  };

  // Helper formatting for simple bold string matching in answers
  const formatMarkdownToReact = (text: string) => {
    if (!text) return null;
    return text.split('\n').map((line, idx) => {
      // Bold replacer
      let formatted = line;
      const regex = /\*\*(.*?)\*\*/g;
      const parts = [];
      let lastIndex = 0;
      let match;

      while ((match = regex.exec(line)) !== null) {
        if (match.index > lastIndex) {
          parts.push(line.substring(lastIndex, match.index));
        }
        parts.push(<strong key={match.index} className="text-red-700 font-bold">{match[1]}</strong>);
        lastIndex = regex.lastIndex;
      }
      if (lastIndex < line.length) {
        parts.push(line.substring(lastIndex));
      }

      return (
        <p key={idx} className="text-xs text-gray-700 leading-relaxed mb-1.5 min-h-[1px]">
          {parts.length > 0 ? parts : formatted}
        </p>
      );
    });
  };

  return (
    <>
      {/* Sparkle Summoning Toggle Button - Floating at Context Corner */}
      <div className="fixed bottom-6 right-6 z-50">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 bg-gradient-to-r from-red-650 to-amber-600 hover:from-red-700 hover:to-amber-700 text-white font-extrabold uppercase text-[10px] tracking-wider px-4 py-3 rounded-full shadow-lg transition duration-300 animate-pulse hover:animate-none cursor-pointer group"
          id="gemini-spark-summon-btn"
        >
          <Sparkles className="w-4 h-4 animation-spin text-amber-200 group-hover:scale-125 transition" />
          <span>Gemini Spark AI</span>
        </button>
      </div>

      {/* Floating Panel Drawer */}
      {isOpen && (
        <div className="fixed inset-0 bg-neutral-900/60 backdrop-blur-xs flex justify-end z-50 transition duration-300">
          <div className="w-full md:w-[480px] bg-white h-full shadow-2xl flex flex-col overflow-hidden relative border-l border-gray-200">
            
            {/* Header */}
            <div className="bg-gradient-to-r from-red-600 to-amber-600 text-white p-5 flex items-center justify-between shadow-md">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-300" />
                <div>
                  <h3 className="font-sans font-black tracking-tight text-sm uppercase">Gemini Interactive Center</h3>
                  <p className="text-[9px] text-red-105 font-mono uppercase tracking-widest leading-none mt-0.5">Real-time Cross-Table Semantic Brain</p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 text-white hover:bg-white/10 rounded-full transition cursor-pointer"
                title="Minimize AI Core"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrolling AI workspace */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              
              {/* Search bar widget */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 shadow-xs">
                <h4 className="text-[10px] uppercase font-black tracking-wider text-gray-500 font-mono mb-2 flex items-center gap-1.5">
                  <Search className="w-3.5 h-3.5 text-red-650" /> Instant Intelligent Search
                </h4>
                <p className="text-[10px] text-gray-400 mb-3.5 leading-snug">
                  Ask Gemini to scan influencers, campaign spending, scheduled tasks, and payouts. Our AI reasons across all databases instantly.
                </p>

                <form onSubmit={handleSearchSubmit} className="flex gap-1.5">
                  <input
                    type="text"
                    required
                    placeholder="e.g. Creator with maximum ROI..."
                    className="flex-1 text-xs px-3 py-2 border border-gray-250 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 bg-white text-gray-800"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  <button
                    type="submit"
                    disabled={isSearching}
                    className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-bold px-3 py-2 rounded-lg transition"
                  >
                    {isSearching ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                  </button>
                </form>

                {/* Quick Presets */}
                <div className="mt-4">
                  <span className="text-[8px] font-black uppercase text-gray-400 font-mono tracking-widest block mb-1.5">Suggested Query Sparkers:</span>
                  <div className="flex flex-wrap gap-1">
                    {searchPresets.map((preset, index) => (
                      <button
                        key={index}
                        type="button"
                        onClick={() => handleSearchSubmit(undefined, preset.query)}
                        className="text-[9px] bg-white border border-gray-200 text-gray-600 px-2 py-1.5 rounded hover:border-red-500 hover:text-red-700 transition font-sans text-left"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* SEARCH RESULTS DISPLAY */}
              {isSearching && (
                <div className="py-8 text-center space-y-2">
                  <RefreshCw className="w-8 h-8 text-red-600 animate-spin mx-auto" />
                  <p className="text-xs font-bold text-gray-600">Gemini Spark is parsing data tables...</p>
                  <p className="text-[10px] text-gray-400 font-mono">Tracing relationships and compiling response</p>
                </div>
              )}

              {searchError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-lg text-[11px] font-medium flex items-start gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <span>{searchError}</span>
                </div>
              )}

              {searchResult && (
                <div className="border border-red-100 bg-red-50/10 rounded-xl p-4 space-y-3 shadow-xs">
                  <div className="flex items-center justify-between border-b border-red-100/40 pb-2">
                    <span className="text-[10px] font-black text-red-650 uppercase font-mono tracking-wider">Spark Search Outcome</span>
                    <span className="text-[8px] bg-red-100 text-red-800 font-bold px-1.5 py-0.5 rounded font-mono">Gemini-3.5-Flash</span>
                  </div>

                  {/* Rendered answer text */}
                  <div className="space-y-1">
                    {formatMarkdownToReact(searchResult.answer)}
                  </div>

                  {/* Highlighted Entities backlinks */}
                  {searchResult.entities && searchResult.entities.length > 0 && (
                    <div className="space-y-1.5 mt-2">
                      <span className="text-[9px] font-bold text-gray-400 uppercase font-mono block">Direct Workspace Backlinks:</span>
                      <div className="space-y-1">
                        {searchResult.entities.map((entity, i) => {
                          // select icon based on type
                          let Icon = Users;
                          if (entity.type === 'campaign') Icon = Briefcase;
                          if (entity.type === 'task') Icon = ListTodo;
                          if (entity.type === 'billing') Icon = CreditCard;

                          return (
                            <button
                              key={i}
                              type="button"
                              onClick={() => handleEntityClick(entity)}
                              className="w-full flex items-center justify-between p-2 bg-white hover:bg-red-50 border border-gray-200 hover:border-red-200 rounded-lg text-left transition group cursor-pointer"
                            >
                              <div className="flex items-center gap-1.5 min-w-0">
                                <Icon className="w-3.5 h-3.5 text-gray-400 group-hover:text-red-500 shrink-0" />
                                <span className="text-xs font-semibold text-gray-700 group-hover:text-red-800 truncate">{entity.name}</span>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <span className="text-[9px] text-gray-400 font-mono">{entity.matchMetric}</span>
                                <ArrowRight className="w-3 h-3 text-gray-300 group-hover:text-red-500 transition" />
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {searchResult.suggestedAction && (
                    <div className="text-[10px] select-none text-red-600 font-bold font-mono bg-red-100/30 p-2 rounded border border-red-150 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-red-500 shrink-0" />
                      <span>{searchResult.suggestedAction}</span>
                    </div>
                  )}
                </div>
              )}

              {/* LIVE ADVISORY SECTION ("Make gemini able to self advise time to time") */}
              <div className="space-y-3.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-[10px] uppercase font-black tracking-wider text-gray-500 font-mono flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" /> Live Gemini advisor audits
                  </h4>
                  <button
                    onClick={triggerSelfAdviceAudit}
                    disabled={isAuditing}
                    className="text-[9px] text-red-600 hover:text-red-700 font-black uppercase flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${isAuditing ? 'animate-spin' : ''}`} />
                    <span>Run Audit</span>
                  </button>
                </div>

                <p className="text-[10px] text-gray-400 leading-snug">
                  This panel scans data elements continuously, generating customized advices, spotting budget blockages, and providing actionable prescriptions.
                </p>

                {isAuditing && (
                  <div className="py-6 text-center space-y-1.5 bg-gray-50/50 rounded-xl border border-gray-150">
                    <RefreshCw className="w-6 h-6 text-amber-500 animate-spin mx-auto" />
                    <p className="text-[11px] font-bold text-gray-600 animate-pulse">Running live campaign & deliverable audits...</p>
                  </div>
                )}

                {adviceError && (
                  <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-lg text-[10px] font-medium leading-relaxed">
                    <span>{adviceError}</span>
                  </div>
                )}

                {!isAuditing && adviceCards.length > 0 && (
                  <div className="space-y-3">
                    {adviceCards.map((card) => {
                      // Severity colors
                      const isHigh = card.severity === 'High';
                      const isMed = card.severity === 'Medium';
                      const sevBadge = isHigh 
                        ? 'bg-red-100 text-red-700' 
                        : isMed 
                          ? 'bg-amber-100 text-amber-700' 
                          : 'bg-emerald-100 text-emerald-700';

                      return (
                        <div 
                          key={card.id} 
                          className={`p-4 rounded-xl border transition shadow-xs space-y-2.5 ${
                            isHigh 
                              ? 'bg-red-50/5 border-red-100 hover:border-red-200' 
                              : isMed 
                                ? 'bg-amber-50/5 border-amber-100 hover:border-amber-200' 
                                : 'bg-emerald-50/5 border-emerald-100 hover:border-emerald-200'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] font-bold text-gray-400 uppercase font-mono tracking-wider">{card.category}</span>
                            <span className={`text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded font-mono ${sevBadge}`}>
                              {card.severity} Priority
                            </span>
                          </div>

                          <div>
                            <h5 className="text-xs font-bold text-gray-800 leading-tight">{card.title}</h5>
                            <p className="text-[11px] text-gray-500 leading-normal mt-1">{card.analysis}</p>
                          </div>

                          <div className="bg-white/60 p-2.5 rounded-lg border border-gray-150/40 space-y-1">
                            <span className="text-[8px] font-black uppercase text-gray-400 font-mono tracking-widest block leading-none">Prescribed Action:</span>
                            <p className="text-[10px] text-gray-700 leading-normal font-medium">{card.prescription}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>

            {/* Footer informational */}
            <div className="p-4 bg-gray-50 border-t border-gray-150/60 flex items-center justify-between text-[10px] text-gray-400">
              <span className="font-mono flex items-center gap-1">
                <HelpCircle className="w-3 h-3 text-gray-300" /> Double-click entities to jump tabs
              </span>
              <span className="font-bold text-red-650 tracking-wider">Spark AI Core v1.2</span>
            </div>

          </div>
        </div>
      )}
    </>
  );
}
