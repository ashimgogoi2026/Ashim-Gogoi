import React, { useState } from 'react';
import { ClipboardList, Plus, Calendar, Clock, AlertCircle, ArrowLeftRight, CheckSquare, DollarSign, ArrowRight, UserCheck } from 'lucide-react';
import { Task, Campaign, Influencer } from '../types';
import { formatDateToDMY } from '../lib/dateUtils';

interface TaskWorkflowManagerProps {
  tasks: Task[];
  campaigns: Campaign[];
  influencers: Influencer[];
  onCreateTask: (newTask: Omit<Task, 'id'>) => void;
  onUpdateTaskStatus: (taskId: string, status: Task['status']) => void;
  onUpdateTask?: (taskId: string, updatedFields: Partial<Task>) => void;
}

export default function TaskWorkflowManager({
  tasks,
  campaigns,
  influencers,
  onCreateTask,
  onUpdateTaskStatus,
  onUpdateTask,
}: TaskWorkflowManagerProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [title, setTitle] = useState('');
  const [campaignId, setCampaignId] = useState('');
  const [influencerId, setInfluencerId] = useState('');
  const [type, setType] = useState<string>('Instagram Reel');
  const [selectedPlatform, setSelectedPlatform] = useState<'Instagram' | 'Facebook' | 'YouTube'>('Instagram');
  const today = new Date();
  const todayStr = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().split('T')[0];
  
  const [releaseDate, setReleaseDate] = useState(todayStr);
  const [deadline, setDeadline] = useState(todayStr);
  const [remuneration, setRemuneration] = useState('1000');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const taskColumns: { id: Task['status']; label: string; bgClass: string; textClass: string }[] = [
    { id: 'Pending', label: 'Pending Pitch', bgClass: 'bg-gray-100', textClass: 'text-gray-700' },
    { id: 'In Progress', label: 'In Production', bgClass: 'bg-red-50', textClass: 'text-red-750' },
    { id: 'Under Review', label: 'Content Review', bgClass: 'bg-amber-100/40 text-amber-700', textClass: 'text-amber-800' },
    { id: 'Completed', label: 'Completed & Approved', bgClass: 'bg-emerald-50 text-emerald-750', textClass: 'text-emerald-800' }
  ];

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !campaignId || !influencerId) {
      setErrorMsg('Please enter a title, and select both a campaign and creator.');
      return;
    }

    onCreateTask({
      campaignId,
      influencerId,
      title: title.trim(),
      type: `${selectedPlatform} Sponsor Ad`,
      deadline,
      status: 'Pending',
      remuneration: parseFloat(remuneration) || 0,
      platform: selectedPlatform,
      releaseDate: releaseDate
    });

    setTitle('');
    setCampaignId('');
    setInfluencerId('');
    setRemuneration('1000');
    setSelectedPlatform('Instagram');
    setReleaseDate(todayStr);
    setErrorMsg(null);
    setShowAddForm(false);
  };

  const getCampaignName = (id: string) => {
    return campaigns.find(c => c.id === id)?.name || 'Generic Corporate Campaign';
  };

  const getInfluencerDetails = (id: string) => {
    return influencers.find(inf => inf.id === id) || {
      name: 'Unassigned Partner',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=120',
      handle: '@unassigned'
    };
  };

  const moveTaskStatus = (task: Task, currentStatus: Task['status']) => {
    const statuses: Task['status'][] = ['Pending', 'In Progress', 'Under Review', 'Completed'];
    const currentIndex = statuses.indexOf(currentStatus);
    const nextStatus = statuses[currentIndex + 1];
    
    if (nextStatus === 'Completed') {
      const hasVideoLink = !!(task.videoLink1?.trim() || task.videoLink2?.trim() || task.videoLink3?.trim() || task.videoId?.trim());
      if (!hasVideoLink) {
        setErrorMsg('Cannot mark task as Completed without at least one video link. Please add a video link in the Monthly Planner.');
        setTimeout(() => setErrorMsg(null), 5000);
        return;
      }
    }
    
    if (currentIndex < statuses.length - 1) {
      onUpdateTaskStatus(task.id, nextStatus);
    }
  };

  const regressionTaskStatus = (taskId: string, currentStatus: Task['status']) => {
    const statuses: Task['status'][] = ['Pending', 'In Progress', 'Under Review', 'Completed'];
    const currentIndex = statuses.indexOf(currentStatus);
    if (currentIndex > 0) {
      onUpdateTaskStatus(taskId, statuses[currentIndex - 1]);
    }
  };

  return (
    <div id="workflows-manager-container" className="space-y-6">
      
      {/* Main Title Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight font-sans">Deliverables & Workflows</h1>
          <p className="text-sm text-gray-500">Coordinate and review influencer publications, drafts, and approval lifecycles.</p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="inline-flex items-center gap-2 bg-red-650 hover:bg-red-750 text-white px-4 py-2 rounded-lg text-sm font-semibold transition cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Create Deliverable Task
        </button>
      </div>

      {/* Task Creation Form overlay */}
      {showAddForm && (
        <form onSubmit={handleFormSubmit} className="bg-white rounded-xl border border-red-150 p-6 shadow-md space-y-4 animate-fade-in">
          <h3 className="font-bold text-gray-900 text-base">Assign Sourced Task Brief</h3>
          
          {errorMsg && (
            <div className="p-3 bg-red-50 text-red-750 text-xs rounded-lg font-medium border border-red-100">
              {errorMsg}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5 col-span-2">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider font-mono">Task Deliverable Title</label>
              <input
                type="text"
                placeholder="e.g. Instagram Story post showing code SUMMER35"
                className="w-full px-3 py-2 text-sm border border-gray-250 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider font-mono">Campaign Linkage</label>
              <select
                className="w-full px-3 py-2 text-sm border border-gray-250 rounded-lg bg-white"
                value={campaignId}
                onChange={(e) => setCampaignId(e.target.value)}
              >
                <option value="">-- Settle Campaign --</option>
                {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider font-mono">Assigned Creator</label>
              <select
                required
                className="w-full px-3 py-2 text-sm border border-gray-250 rounded-lg bg-white text-slate-800 font-medium cursor-pointer"
                value={influencerId}
                onChange={(e) => setInfluencerId(e.target.value)}
              >
                <option value="">-- Select Partner --</option>
                {[...influencers]
                  .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }))
                  .map(inf => (
                    <option key={inf.id} value={inf.id}>{inf.name}</option>
                  ))
                }
              </select>
            </div>

            <div className="space-y-2 col-span-2">
              <label className="text-xs font-bold text-red-600 uppercase tracking-wider font-mono">
                Ad Platform (Click to Choose) *
              </label>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { id: 'Instagram', label: 'Instagram Ad', icon: '📸' },
                  { id: 'Facebook', label: 'Facebook Ad', icon: '👥' },
                  { id: 'YouTube', label: 'YouTube Ad', icon: '🎥' }
                ].map((plat) => (
                  <button
                    key={plat.id}
                    type="button"
                    onClick={() => setSelectedPlatform(plat.id as any)}
                    className={`p-3 rounded-xl border-2 flex flex-col items-center justify-center gap-1 cursor-pointer transition ${
                      selectedPlatform === plat.id
                        ? 'bg-red-600 text-white border-red-700 shadow-md font-bold'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-red-400 hover:bg-red-50/10'
                    }`}
                  >
                    <span className="text-lg">{plat.icon}</span>
                    <span className="text-xs uppercase tracking-wider">{plat.id}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5 font-mono">
              <label className="text-xs font-bold text-red-600 uppercase tracking-wider flex items-center gap-1">
                <span>🎬</span> Video Release Date
              </label>
              <input
                type="date"
                required
                className="w-full px-3 py-2 text-sm border-2 border-red-100 rounded-lg focus:outline-none focus:border-red-600 bg-white text-gray-700"
                value={releaseDate}
                onChange={(e) => setReleaseDate(e.target.value)}
              />
            </div>

            <div className="space-y-1.5 font-mono">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Required Deadline</label>
              <input
                type="date"
                className="w-full px-3 py-2 text-sm border border-gray-255 rounded-lg focus:outline-none"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider font-mono">Deliverables Remuneration Fee (₹)</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500">₹</span>
                <input
                  type="number"
                  className="w-full pl-7 pr-3 py-2 text-sm border border-gray-255 rounded-lg focus:outline-none"
                  value={remuneration}
                  onChange={(e) => setRemuneration(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-4 py-2 border border-gray-200 text-gray-650 text-xs font-semibold rounded-lg hover:bg-gray-100 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-red-650 hover:bg-red-750 text-white text-xs font-semibold rounded-lg transition"
            >
              Issue Deliverable Now
            </button>
          </div>
        </form>
      )}

      {/* Kanban Column View */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 items-start">
        {taskColumns.map((col) => {
          const columnTasks = tasks.filter(t => t.status === col.id);

          return (
            <div key={col.id} className="bg-gray-50/50 rounded-xl border border-gray-150 overflow-hidden flex flex-col max-h-[720px]">
              
              {/* Column Header */}
              <div className="p-3.5 border-b border-gray-100 bg-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full inline-block bg-red-600`} />
                  <span className="font-bold text-gray-901 text-sm tracking-tight">{col.label}</span>
                </div>
                <span className="bg-gray-100 text-gray-600 text-xs font-bold font-mono px-2 py-0.5 rounded-full border border-gray-150">
                  {columnTasks.length}
                </span>
              </div>

              {/* List representing tasks in status pipeline */}
              <div className="p-3 overflow-y-auto space-y-3 min-h-[300px]">
                {columnTasks.map((t) => {
                  const creator = getInfluencerDetails(t.influencerId);
                  const campaignName = getCampaignName(t.campaignId);

                  return (
                    <div key={t.id} className="bg-white rounded-lg border border-gray-120 p-4 shadow-[0_1px_4px_rgba(0,0,0,0.02)] space-y-3 hover:border-red-150 transition">
                      <div className="space-y-1">
                        <div className="flex justify-between items-start gap-2">
                          <span className="text-[9px] font-bold text-red-650 font-mono uppercase bg-red-50/50 px-1.5 py-0.5 rounded-sm border border-red-100/60">
                            {t.platform || 'Instagram'} Sponsor
                          </span>
                          <span className="text-[10px] font-bold font-mono text-gray-650">₹{t.remuneration}</span>
                        </div>
                        <h4 className="font-semibold text-gray-850 text-xs leading-tight line-clamp-2">{t.title}</h4>
                        <p className="text-[10px] font-mono text-gray-400 font-semibold">{campaignName}</p>
                      </div>

                      {/* Influencer Profile snippet */}
                      <div className="flex items-center gap-2 border-t border-gray-100 pt-2 bg-gray-50/30 p-1.5 rounded-md">
                        <img 
                          src={creator.avatar} 
                          alt={creator.name} 
                          className="w-5.5 h-5.5 rounded-full object-cover border border-white"
                          referrerPolicy="no-referrer"
                        />
                        <div className="min-w-0">
                          <p className="text-[10px] font-bold text-gray-855 truncate">{creator.name}</p>
                          <p className="text-[9px] font-mono font-medium text-red-650 truncate">{creator.handle}</p>
                        </div>
                      </div>

                      {/* Clickable Platform switcher directly on card */}
                      <div className="pt-1.5 space-y-1.5 border-t border-gray-100">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="font-bold text-gray-400 font-mono uppercase">Platform Mode:</span>
                          <div className="flex gap-1">
                            {[
                              { id: 'Instagram', icon: '📸' },
                              { id: 'Facebook', icon: '👥' },
                              { id: 'YouTube', icon: '🎥' }
                            ].map((p) => {
                              const currentVal = t.platform || 'Instagram';
                              const isActive = currentVal === p.id;
                              return (
                                <button
                                  key={p.id}
                                  type="button"
                                  onClick={() => {
                                    if (onUpdateTask) {
                                      onUpdateTask(t.id, { 
                                        platform: p.id as any,
                                        type: `${p.id} Sponsor Ad`
                                      });
                                    }
                                  }}
                                  title={`Switch task platform to ${p.id}`}
                                  className={`px-1.5 py-0.5 rounded text-[9px] font-bold transition flex items-center gap-0.5 cursor-pointer border ${
                                    isActive
                                      ? 'bg-red-650 text-white border-red-700 shadow-sm'
                                      : 'bg-gray-50 text-gray-500 border-gray-150 hover:bg-red-50 hover:text-red-650 hover:border-red-200'
                                  }`}
                                >
                                  <span>{p.icon}</span>
                                  <span>{p.id}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Video Release Date schedule field */}
                        <div className="p-2 rounded-lg bg-red-50/40 border border-red-200/70 space-y-1">
                          <div className="flex justify-between items-center text-[10px]">
                            <span className="font-bold text-red-700 uppercase font-mono flex items-center gap-1">
                              <span>🎬</span> Release Date:
                            </span>
                            <strong className="text-xs font-mono font-black text-gray-950 bg-white px-1.5 py-0.5 rounded border border-gray-300 shadow-2xs">
                              {formatDateToDMY(t.releaseDate) || 'Not set'}
                            </strong>
                          </div>
                          {t.uploadTime && (
                            <div className="flex justify-between items-center text-[10px] pt-0.5">
                              <span className="font-bold text-fuchsia-700 uppercase font-mono flex items-center gap-1">
                                <Clock className="w-3 h-3 text-fuchsia-600" /> Upload Time:
                              </span>
                              <strong className="text-xs font-mono font-black text-fuchsia-950 bg-fuchsia-100 px-1.5 py-0.5 rounded border border-fuchsia-300 shadow-2xs">
                                {t.uploadTime}
                              </strong>
                            </div>
                          )}
                          <div className="flex items-center gap-1 mt-1">
                            <input
                              type="date"
                              title="Assign Video Release Date"
                              className="w-full text-[9px] px-1 py-0.5 bg-white border border-red-200 rounded text-gray-750 focus:outline-none focus:border-red-600 font-mono"
                              value={t.releaseDate || ''}
                              onChange={(e) => {
                                if (onUpdateTask) {
                                  onUpdateTask(t.id, { releaseDate: e.target.value });
                                }
                              }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Deadline label & quick actions */}
                      <div className="flex items-center justify-between text-[10px] text-gray-500 font-sans">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-gray-400" />
                          <span>{t.deadline ? formatDateToDMY(t.deadline) : ''}</span>
                        </span>
                        
                        {/* Status flow movement */}
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          {col.id !== 'Pending' && (
                            <button
                              type="button"
                              onClick={() => regressionTaskStatus(t.id, t.status)}
                              title="Prior Phase"
                              className="p-1 border border-gray-250 bg-white hover:bg-gray-100 text-gray-500 rounded-md shrink-0 cursor-pointer"
                            >
                              ◀
                            </button>
                          )}
                          {col.id !== 'Completed' && (
                            <button
                              type="button"
                              onClick={() => moveTaskStatus(t, t.status)}
                              title="Approve to Next Phase"
                              className="px-1.5 py-1 bg-red-600 hover:bg-red-750 text-white rounded-md flex items-center gap-1 font-semibold shrink-0 cursor-pointer"
                            >
                              <span>Next</span> <ArrowRight className="w-2.5 h-2.5" />
                            </button>
                          )}
                        </div>
                      </div>

                    </div>
                  );
                })}

                {columnTasks.length === 0 && (
                  <div className="py-8 text-center text-gray-400">
                    <CheckSquare className="w-6 h-6 text-gray-300 mx-auto opacity-70 mb-1" />
                    <p className="text-xs italic font-medium">Empty column pipeline</p>
                  </div>
                )}
              </div>

            </div>
          );
        })}
      </div>

    </div>
  );
}
