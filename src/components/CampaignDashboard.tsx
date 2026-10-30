import React, { useState } from 'react';
import { Briefcase, Calendar, Plus, Users, LayoutGrid, CheckCircle, Info, IndianRupee, ListTodo, Percent } from 'lucide-react';
import { Campaign, Influencer } from '../types';

interface CampaignDashboardProps {
  campaigns: Campaign[];
  influencers: Influencer[];
  onCreateCampaign: (newCampaign: Omit<Campaign, 'id' | 'metrics'>) => void;
  onDeleteCampaign: (id: string) => void;
}

export default function CampaignDashboard({
  campaigns,
  influencers,
  onCreateCampaign,
  onDeleteCampaign,
}: CampaignDashboardProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [niche, setNiche] = useState('Technology & AI Gadgets');
  const [budget, setBudget] = useState('20000');
  const [spent, setSpent] = useState('0');
  const today = new Date();
  const todayStr = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().split('T')[0];
  const nextMonth = new Date();
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  const nextMonthStr = nextMonth.toISOString().split('T')[0];
  
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(nextMonthStr);
  const [newDeliverable, setNewDeliverable] = useState('');
  const [deliverables, setDeliverables] = useState<string[]>(['1 Dedicated Instagram Post', '1 Video Story Swipe']);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const nichesList = [
    'Technology & AI Gadgets',
    'Fashion & Luxury Lifestyle',
    'Fitness & Elite Athletics',
    'Gen-Z Gaming & Tech Esports',
    'Culinary & Fine Dining Focus',
    'Travel & Adventure Photography'
  ];

  // Quick stats
  const totalCampaigns = campaigns.length;
  const activeCampaigns = campaigns.filter(c => c.status === 'Active').length;
  const totalBudget = campaigns.reduce((acc, curr) => acc + curr.budget, 0);
  const totalSpent = campaigns.reduce((acc, curr) => acc + curr.spent, 0);
  const totalInfluencerAssignmentsCount = campaigns.reduce((acc, curr) => acc + curr.influencersAssigned.length, 0);

  const addDeliverable = () => {
    if (!newDeliverable.trim()) return;
    setDeliverables([...deliverables, newDeliverable.trim()]);
    setNewDeliverable('');
  };

  const removeDeliverable = (idx: number) => {
    setDeliverables(deliverables.filter((_, i) => i !== idx));
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !description.trim()) {
      setErrorMsg('Please supply a campaign name and general summary description.');
      return;
    }
    const parsedBudget = parseFloat(budget) || 0;
    const parsedSpent = parseFloat(spent) || 0;

    onCreateCampaign({
      name: name.trim(),
      description: description.trim(),
      niche,
      budget: parsedBudget,
      spent: parsedSpent,
      status: 'Active',
      startDate,
      endDate,
      deliverables,
      influencersAssigned: [],
    });

    // Reset Form Fields
    setName('');
    setDescription('');
    setBudget('20000');
    setSpent('0');
    setDeliverables(['1 Dedicated Instagram Post']);
    setErrorMsg(null);
    setShowAddForm(false);
  };

  return (
    <div id="campaign-dashboard-container" className="space-y-6">
      
      {/* Top Section */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight font-sans">Campaign Executive Dashboard</h1>
          <p className="text-sm text-gray-500">Plan, launch, track target allocation, and allocate deliverables across live events.</p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="inline-flex items-center gap-2 bg-red-650 hover:bg-red-750 text-white px-4 py-2 rounded-lg text-sm font-semibold transition cursor-pointer shadow-xs"
        >
          <Plus className="w-4 h-4" /> Create New Campaign
        </button>
      </div>

      {/* Overview Metric Indicators */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-100 p-4 rounded-xl shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)]">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase font-mono">Total Campaigns</p>
              <h3 className="text-2xl font-bold font-mono text-gray-900 mt-1">{totalCampaigns}</h3>
            </div>
            <div className="p-2 bg-red-50 text-red-650 rounded-lg">
              <Briefcase className="w-5 h-5" />
            </div>
          </div>
          <div className="text-[11px] text-gray-400 mt-2">
            <span>{activeCampaigns} live campaigns active</span>
          </div>
        </div>

        <div className="bg-white border border-gray-100 p-4 rounded-xl shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)]">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase font-mono">Total Allocations</p>
              <h3 className="text-2xl font-bold font-mono text-gray-900 mt-1">
                ₹{totalBudget.toLocaleString()}
              </h3>
            </div>
            <div className="p-2 bg-gray-55 text-gray-600 rounded-lg border border-gray-200">
              <IndianRupee className="w-5 h-5" />
            </div>
          </div>
          <div className="text-[11px] text-red-600 font-medium mt-2">
            <span>Overall financial scope limits</span>
          </div>
        </div>

        <div className="bg-white border border-gray-100 p-4 rounded-xl shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)]">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase font-mono">Expenditures</p>
              <h3 className="text-2xl font-bold font-mono text-gray-900 mt-1">
                ₹{totalSpent.toLocaleString()}
              </h3>
            </div>
            <div className="p-2 bg-gray-55 text-gray-650 rounded-lg border border-gray-100">
              <Percent className="w-5 h-5 text-red-650" />
            </div>
          </div>
          <div className="text-[11px] text-gray-500 mt-2 font-mono">
            <span>{((totalSpent / (totalBudget || 1)) * 100).toFixed(1)}% safe threshold spent</span>
          </div>
        </div>

        <div className="bg-white border border-gray-100 p-4 rounded-xl shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)]">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase font-mono">Assigned Creators</p>
              <h3 className="text-2xl font-bold font-mono text-gray-901 mt-1">{totalInfluencerAssignmentsCount}</h3>
            </div>
            <div className="p-2 bg-red-50 text-red-650 rounded-lg">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="text-[11px] text-gray-500 mt-2">
            <span>Across tech, lifstyle & health</span>
          </div>
        </div>
      </div>

      {/* New Campaign Creation Panel/Form overlay */}
      {showAddForm && (
        <form onSubmit={handleFormSubmit} className="bg-white rounded-xl border-2 border-red-50 relative p-6 shadow-sm space-y-4 animate-fade-in">
          <div className="absolute top-4 right-4">
            <button 
              type="button" 
              onClick={() => setShowAddForm(false)}
              className="text-gray-400 hover:text-gray-600 font-bold"
            >
              ✕ Close Form
            </button>
          </div>
          <h2 className="text-lg font-bold text-gray-850">Establish Campaign Profile</h2>
          
          {errorMsg && (
            <div className="p-3 bg-red-50 text-red-700 text-xs rounded-lg font-medium border border-red-100">
              {errorMsg}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5 col-span-2">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider font-mono">Campaign Name</label>
              <input
                type="text"
                placeholder="e.g. Autumn Leather Launch Wave II"
                className="w-full px-3 py-2 text-sm border border-gray-250 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="space-y-1.5 col-span-2">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider font-mono">Strategic Summary (Objective)</label>
              <textarea
                placeholder="Provide main features, target points, guidelines for the assigned influencers..."
                className="w-full px-3 py-2 text-sm border border-gray-250 rounded-lg h-16 focus:outline-none focus:ring-2 focus:ring-red-600"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider font-mono">Target Niche</label>
              <select
                className="w-full px-3 py-2 text-sm border border-gray-250 rounded-lg bg-white"
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
              >
                {nichesList.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider font-mono">Total Budget (₹ INR)</label>
              <input
                type="number"
                className="w-full px-3 py-2 text-sm border border-gray-250 rounded-lg focus:outline-none"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider font-mono">Start Date</label>
              <input
                type="date"
                className="w-full px-3 py-2 text-sm border border-gray-255 rounded-lg focus:outline-none"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider font-mono">End Date</label>
              <input
                type="date"
                className="w-full px-3 py-2 text-sm border border-gray-255 rounded-lg focus:outline-none"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider font-mono">Required Deliverables</label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Product unboxing Reel, custom discount code Story, etc."
                className="flex-1 px-3 py-2 text-sm border border-gray-250 rounded-lg focus:outline-none focus:ring-1 focus:ring-red-650"
                value={newDeliverable}
                onChange={(e) => setNewDeliverable(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addDeliverable())}
              />
              <button
                type="button"
                onClick={addDeliverable}
                className="px-4 bg-gray-55 hover:bg-gray-100 border border-gray-250 text-gray-700 rounded-lg text-xs font-semibold cursor-pointer"
              >
                Add Deliverable
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5 mt-2">
              {deliverables.map((del, index) => (
                <span key={index} className="bg-red-50 text-red-750 text-xs px-2.5 py-1 rounded-md border border-red-100 flex items-center gap-1.5 font-medium">
                  {del}
                  <button type="button" onClick={() => removeDeliverable(index)} className="text-red-500 font-bold hover:text-red-900 pointer-events-auto">✕</button>
                </span>
              ))}
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-2.5 bg-red-650 hover:bg-red-750 text-white rounded-lg text-sm font-semibold transition cursor-pointer"
          >
            Launch Campaign Active
          </button>
        </form>
      )}

      {/* Lists of Campaigns Cards */}
      <div className="space-y-6">
        <h2 className="text-lg font-bold text-gray-850 flex items-center gap-2">
          <LayoutGrid className="w-5 h-5 text-red-600" /> Active & Historical Campaigns
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {campaigns.map((camp) => {
            const progressPct = Math.min((camp.spent / camp.budget) * 100, 100);
            
            // Settle which creators belong to this campaign
            const assignedCreators = influencers.filter(inf => camp.influencersAssigned.includes(inf.id));

            return (
              <div key={camp.id} className="bg-white rounded-xl border border-gray-120 overflow-hidden flex flex-col justify-between hover:border-red-200 transition shadow-xs">
                {/* Header */}
                <div className="p-5 border-b border-gray-100 bg-gray-50/50">
                  <div className="flex justify-between items-start gap-4">
                    <div>
                      <span className="text-[10px] font-bold text-red-600 uppercase font-mono tracking-wider bg-red-50 px-2 py-0.5 rounded-sm border border-red-100">{camp.niche}</span>
                      <h3 className="font-bold text-gray-900 text-lg mt-1.5 tracking-tight">{camp.name}</h3>
                    </div>
                    <span className={`px-2 py-0.5 text-xs font-semibold rounded-full border ${
                      camp.status === 'Active' ? 'bg-red-50 text-red-750 border-red-100' :
                      camp.status === 'Completed' ? 'bg-emerald-50 text-emerald-750 border-emerald-100' :
                      'bg-gray-100 text-gray-600 border-gray-200'
                    }`}>
                      {camp.status}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mt-2 line-clamp-2">{camp.description}</p>
                </div>

                {/* Scope Allocation Progress */}
                <div className="p-5 space-y-4 flex-1">
                  
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs font-mono">
                      <span className="text-gray-500 font-semibold">Budget Spent Rate</span>
                      <span className="text-gray-900 font-bold">₹{camp.spent.toLocaleString()} / <span className="text-gray-500">₹{camp.budget.toLocaleString()}</span></span>
                    </div>
                    
                    <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all ${progressPct > 90 ? 'bg-red-650' : 'bg-red-600'}`} 
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-gray-400 font-mono">
                      <span>{progressPct.toFixed(0)}% Utilized</span>
                      <span>Remaining: ₹{(camp.budget - camp.spent).toLocaleString()}</span>
                    </div>
                  </div>

                  {/* Timelines and schedules */}
                  <div className="flex items-center gap-4 text-xs text-gray-600 border-t border-b border-gray-100 py-3">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-4 h-4 text-gray-450 shrink-0" />
                      <span>{camp.startDate ? camp.startDate.split('-').reverse().join('/') : ''} to {camp.endDate ? camp.endDate.split('-').reverse().join('/') : ''}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <ListTodo className="w-4 h-4 text-gray-450 shrink-0" />
                      <span>{camp.deliverables.length} Deliverables</span>
                    </div>
                  </div>

                  {/* Required deliverables detailed */}
                  <div className="space-y-1.5">
                    <h4 className="text-[10px] font-bold text-gray-400 uppercase font-mono tracking-widest">Deliverables Requirements</h4>
                    <ul className="grid grid-cols-1 md:grid-cols-2 gap-1.5 text-xs text-gray-600">
                      {camp.deliverables.map((del: any, idx: any) => (
                        <li key={idx} className="flex items-center gap-1.5">
                          <CheckCircle className="w-3.5 h-3.5 text-red-650 shrink-0" />
                          <span className="truncate">{del}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Footer and Sourced Influencers */}
                <div className="bg-gray-50 px-5 py-4 border-t border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-500 font-semibold font-mono whitespace-nowrap">Assigned Creators:</span>
                    <div className="flex -space-x-2 overflow-hidden">
                      {assignedCreators.map(ac => (
                        <img
                          key={ac.id}
                          className="inline-block h-6.5 w-6.5 rounded-full ring-2 ring-white object-cover"
                          src={ac.avatar}
                          alt={ac.name}
                          title={`${ac.name} (${ac.handle})`}
                          referrerPolicy="no-referrer"
                        />
                      ))}
                      {assignedCreators.length === 0 && (
                        <span className="text-xs text-gray-400 italic">No influencers assigned yet</span>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        const confirmDel = window.confirm(`Are you sure you want to remove the "${camp.name}" campaign?`);
                        if (confirmDel) {
                          onDeleteCampaign(camp.id);
                        }
                      }}
                      className="px-2.5 py-1 text-xs font-semibold text-gray-500 hover:text-red-700 bg-white border border-gray-200 hover:border-red-300 rounded-md transition cursor-pointer"
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      onClick={() => alert(`View details: To manage or edit assigned influencers, jump to the "Influencer Database" tab or use "AI Suggestions" list.`)}
                      className="px-3 py-1 bg-white border border-gray-200 text-gray-700 rounded-md text-xs font-semibold hover:border-gray-300 transition"
                    >
                      Settings
                    </button>
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}
