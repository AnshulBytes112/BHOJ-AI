'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import apiClient from '@/services/apiClient';
import { useFilter } from '@/lib/filter-context';
import { cn } from '@/lib/utils';
import { RoleGuard } from '@/components/auth/role-guard';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import {
  LayoutGrid,
  UtensilsCrossed,
  Beer,
  IceCream,
  Coffee,
  MoreVertical,
  RefreshCw,
  Filter,
  X,
  Clock,
  Table as TableIcon,
  User,
  CalendarDays,
  Hash,
  CheckCheck,
  ChefHat,
  Printer,
  PlayCircle,
  CheckCircle,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

// ─────────────────────────────────────────────
//  Types
// ─────────────────────────────────────────────
interface KitchenSection {
  section_id: string;
  section_name: string;
  pending_count: string;
}

interface KOTItem {
  section_kot_item_id: string;
  item_id: number;
  item_name: string;
  quantity: number;
  serial_number: string;
}

interface SectionKOT {
  section_kot_id: string;
  parent_kot_id: string;
  section_id: string;
  section_name: string;
  section_kot_number: string;
  status: 'pending' | 'acknowledged' | 'completed' | 'served';
  generated_at: string;
  table_number: string;
  kot_number: string;
  order_id: string;
  order_phase: number;
  items: KOTItem[];
}

// ─────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

function fmtFull(iso: string) {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

function SectionIcon({ name, size = 16, className = '' }: { name: string; size?: number; className?: string }) {
  const n = name.toLowerCase();
  if (n.includes('kitchen') || n.includes('food') || n.includes('main')) return <UtensilsCrossed size={size} className={className} />;
  if (n.includes('bar') || n.includes('drink')) return <Beer size={size} className={className} />;
  if (n.includes('ice') || n.includes('dessert') || n.includes('sweet')) return <IceCream size={size} className={className} />;
  if (n.includes('bev') || n.includes('coffee') || n.includes('juice')) return <Coffee size={size} className={className} />;
  if (n.includes('start')) return <ChefHat size={size} className={className} />;
  return <ChefHat size={size} className={className} />;
}

function statusPill(status: string) {
  if (status === 'pending') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
  if (status === 'acknowledged') return 'bg-blue-100 text-blue-700 border-blue-200';
  if (status === 'completed') return 'bg-orange-100 text-orange-700 border-orange-200';
  if (status === 'served') return 'bg-gray-100 text-gray-500 border-gray-200';
  return 'bg-gray-100 text-gray-500';
}

function statusLabel(status: string) {
  if (status === 'pending') return 'New';
  if (status === 'acknowledged') return 'In Progress';
  if (status === 'completed') return 'Ready';
  if (status === 'served') return 'Served';
  return status;
}

const SECTION_COLORS: Record<string, string> = {};
const PALETTE = [
  { text: 'text-green-600', border: 'border-green-500', bg: 'bg-green-50' },
  { text: 'text-purple-600', border: 'border-purple-500', bg: 'bg-purple-50' },
  { text: 'text-pink-600', border: 'border-pink-500', bg: 'bg-pink-50' },
  { text: 'text-amber-600', border: 'border-amber-500', bg: 'bg-amber-50' },
  { text: 'text-blue-600', border: 'border-blue-500', bg: 'bg-blue-50' },
  { text: 'text-red-600', border: 'border-red-500', bg: 'bg-red-50' },
  { text: 'text-teal-600', border: 'border-teal-500', bg: 'bg-teal-50' },
];
let colorIdx = 0;
function getSectionPalette(sectionId: string) {
  if (!SECTION_COLORS[sectionId]) {
    SECTION_COLORS[sectionId] = String(colorIdx % PALETTE.length);
    colorIdx++;
  }
  return PALETTE[parseInt(SECTION_COLORS[sectionId])];
}

// ─────────────────────────────────────────────
//  KOT Card
// ─────────────────────────────────────────────
function KotCard({ kot, selected, onClick }: { kot: SectionKOT; selected: boolean; onClick: () => void }) {
  const pal = getSectionPalette(kot.section_id);
  return (
    <div
      onClick={onClick}
      className={cn(
        'rounded-xl border bg-white cursor-pointer transition-all hover:shadow-md h-full flex flex-col',
        selected ? 'ring-2 ring-blue-400 shadow-md scale-[1.02]' : 'border-gray-200 hover:border-gray-300',
      )}
    >
      <div className="flex items-center justify-between px-3 pt-2 pb-1 border-b border-gray-50 bg-gray-50/30 rounded-t-xl">
        <div className="flex flex-col">
          <span className={cn('text-[10px] font-bold tracking-tight', pal.text)}>{kot.section_kot_number}</span>
          <span className="text-[8px] text-gray-400 font-mono">ID: {kot.order_id?.slice(0, 8) || 'N/A'}</span>
        </div>
        <span className="text-[10px] text-gray-400 font-mono">{fmtTime(kot.generated_at)}</span>
      </div>
      <div className="px-3 py-2 flex-1 flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-gray-900 bg-gray-100 px-1.5 py-0.5 rounded">T-{kot.table_number}</span>
          <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded-full border border-current bg-white', statusPill(kot.status))}>
            {statusLabel(kot.status)}
          </span>
        </div>
        
        <div className="mt-1.5 space-y-0.5 max-h-[80px] overflow-hidden">
          {kot.items.slice(0, 3).map((item, i) => (
            <div key={i} className="flex justify-between text-[10px] text-gray-600">
              <span className="truncate max-w-[80px]">{item.item_name}</span>
              <span className="font-bold">x{item.quantity}</span>
            </div>
          ))}
          {kot.items.length > 3 && (
            <div className="text-[9px] text-gray-400 italic">+{kot.items.length - 3} more...</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
//  Main Page
// ─────────────────────────────────────────────
function KOTPageInner() {
  const [sections, setSections] = useState<KitchenSection[]>([]);
  const [activeTab, setActiveTab] = useState('all');
  const [kotsBySection, setKotsBySection] = useState<Record<string, SectionKOT[]>>({});
  const [allKots, setAllKots] = useState<SectionKOT[]>([]);
  const [selectedKot, setSelectedKot] = useState<SectionKOT | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [printKotOpen, setPrintKotOpen] = useState(false);

  // Context-based date/time filter (no URL changes)
  const { filterDate, filterTime } = useFilter();

  const fetchSections = useCallback(async (silent = false) => {
    try {
      const res = await apiClient.get('/kots/sections/list');
      
      if (!res.data || res.data.length === 0) {
        throw new Error('Empty sections');
      }
      
      setSections(res.data);
      // ✅ Clear loading on success path too
      if (!silent) setLoading(false);
    } catch (e) { 
      console.error('sections/list failed, falling back to /categories:', e); 
      // If the backend sections table is empty or throwing an error, fallback to fetching categories 
      try {
        const catRes = await apiClient.get('/categories');
        const categoriesAsSections = catRes.data.map((c: any) => ({
          section_id: c.name, 
          section_name: c.name,
          pending_count: '0'
        }));
        
        setSections(categoriesAsSections);
      } catch (fallbackError) {
        console.error('Fallback also failed:', fallbackError);
      } finally {
        if (!silent) setLoading(false);
      }
    }
  }, []);

  const fetchAllKots = useCallback(async (sectionList: KitchenSection[], silent = false) => {
    if (!silent) setLoading(true);
    try {
      const map: Record<string, SectionKOT[]> = {};
      const flat: SectionKOT[] = [];
      await Promise.all(
        sectionList.map(async (s) => {
          try {
            const res = await apiClient.get(`/kots/section/${s.section_id}`);
            map[s.section_id] = res.data;
            flat.push(...res.data);
          } catch { map[s.section_id] = []; }
        })
      );
      flat.sort((a, b) => new Date(b.generated_at).getTime() - new Date(a.generated_at).getTime());
      setKotsBySection(map);
      setAllKots(flat);
    } catch (e) { console.error(e); }
    finally { if (!silent) setLoading(false); }
  }, []);

  const refresh = useCallback(async () => {
    fetchSections();
  }, [fetchSections]);

  useEffect(() => { 
    fetchSections(); 
    
    // Auto-refresh KOTs every 5 seconds for real-time updates
    const interval = setInterval(() => {
      fetchSections(true);
    }, 5000);
    
    return () => clearInterval(interval);
  }, [fetchSections]);

  useEffect(() => { if (sections.length > 0) fetchAllKots(sections, true); }, [sections, fetchAllKots]);

  // Sync selectedKot with background polling updates
  useEffect(() => {
    if (selectedKot) {
      const latestData = allKots.find(k => k.section_kot_id === selectedKot.section_kot_id);
      if (latestData) {
        // Only update if something actually changed to avoid unnecessary re-renders
        if (latestData.status !== selectedKot.status || latestData.items.length !== selectedKot.items.length) {
          setSelectedKot(latestData);
        }
      } else {
        // If it was completed/removed by another terminal, close the panel
        setSelectedKot(null);
      }
    }
  }, [allKots]);


  const advanceStatus = async (nextStatus: string) => {
    if (!selectedKot) return;
    setUpdatingStatus(true);
    try {
      await apiClient.post(`/kots/section-kots/${selectedKot.section_kot_id}/status`, { status: nextStatus });
      
      const updated = { ...selectedKot, status: nextStatus as any };

      // If served, close the detail panel and remove from lists immediately
      if (nextStatus === 'served') {
        setSelectedKot(null);
        setKotsBySection(prev => {
          const copy = { ...prev };
          const sid = selectedKot.section_id;
          if (copy[sid]) copy[sid] = copy[sid].filter(k => k.section_kot_id !== selectedKot.section_kot_id);
          return copy;
        });
        setAllKots(prev => prev.filter(k => k.section_kot_id !== selectedKot.section_kot_id));
      } else {
        setSelectedKot(updated);
        setKotsBySection(prev => {
          const copy = { ...prev };
          const sid = selectedKot.section_id;
          if (copy[sid]) copy[sid] = copy[sid].map(k => k.section_kot_id === selectedKot.section_kot_id ? updated : k);
          return copy;
        });
        setAllKots(prev => prev.map(k => k.section_kot_id === selectedKot.section_kot_id ? updated : k));
      }

      // Re-fetch sections counts silently (don't trigger full reload cascade)
      fetchSections(true);
      setUpdatingStatus(false);
    } catch (e: any) {
      console.error(e);
      setUpdatingStatus(false);
      const errMsg = e.response?.data?.message || e.message;
      const errStep = e.response?.data?.step || 'unknown';
      alert(`Error updating KOT: ${errMsg}\nStep: ${errStep}`);
    }
  };

  // Always show ALL sections as columns — activeTab only highlights/filters cards within each column
  const displayedSections = sections;

  const [localSearch, setLocalSearch] = useState('');
  const [showStatusFilter, setShowStatusFilter] = useState<'all' | 'pending' | 'acknowledged'>('all');

  // Apply date/time filters AND hide served KOTs (they auto-remove when marked Served)
  const filteredAllKots = allKots.filter(kot => {
    if (kot.status === 'served') return false; // auto-remove served
    
    // Status Filter
    if (showStatusFilter !== 'all' && kot.status !== showStatusFilter) return false;

    // Search Filter (Table or KOT #)
    if (localSearch) {
      const search = localSearch.toLowerCase();
      const matches = 
        kot.table_number.toLowerCase().includes(search) || 
        kot.section_kot_number.toLowerCase().includes(search);
      if (!matches) return false;
    }

    if (!filterDate && !filterTime) return true;
    const kotDateObj = new Date(kot.generated_at);
    if (filterDate && kotDateObj.toISOString().split('T')[0] !== filterDate) return false;
    if (filterTime && kotDateObj.toTimeString().slice(0, 5) !== filterTime) return false;
    return true;
  });

  const filteredKotsBySection: Record<string, SectionKOT[]> = {};
  for (const [key, kots] of Object.entries(kotsBySection)) {
    filteredKotsBySection[key] = kots.filter(kot => {
      if (kot.status === 'served') return false; // auto-remove served
      
      // Status Filter
      if (showStatusFilter !== 'all' && kot.status !== showStatusFilter) return false;

      // Search Filter
      if (localSearch) {
        const search = localSearch.toLowerCase();
        const matches = 
          kot.table_number.toLowerCase().includes(search) || 
          kot.section_kot_number.toLowerCase().includes(search);
        if (!matches) return false;
      }

      if (!filterDate && !filterTime) return true;
      const kotDateObj = new Date(kot.generated_at);
      if (filterDate && kotDateObj.toISOString().split('T')[0] !== filterDate) return false;
      if (filterTime && kotDateObj.toTimeString().slice(0, 5) !== filterTime) return false;
      return true;
    });
  }

  // Counts include served KOTs so the "Served" stat card still shows correctly
  const counts = {
    total: allKots.length,
    pending: allKots.filter(k => k.status === 'pending').length,
    acknowledged: allKots.filter(k => k.status === 'acknowledged').length,
    completed: allKots.filter(k => k.status === 'completed').length,
    served: allKots.filter(k => k.status === 'served').length,
  };

  return (
    <RoleGuard allowedRoles={['superadmin', 'admin', 'manager', 'staff']}>
      <DashboardLayout>
        {/* ── Page Header ── */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              KOT <span className="text-gray-500 font-normal text-lg">(Kitchen Order Tickets)</span>
            </h1>
            <p className="text-sm text-gray-400 mt-0.5">View and manage kitchen orders by sections</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative group">
              <button 
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg bg-white hover:bg-gray-50 transition-colors text-gray-600 shadow-sm"
              >
                <Filter size={14} /> 
                {showStatusFilter === 'all' ? 'All Status' : statusLabel(showStatusFilter)}
              </button>
              
              <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-gray-200 rounded-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 p-1">
                <button 
                  onClick={() => setShowStatusFilter('all')}
                  className={cn("w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-gray-50", showStatusFilter === 'all' && "bg-orange-50 text-orange-600 font-bold")}
                >
                  All Status
                </button>
                <button 
                  onClick={() => setShowStatusFilter('pending')}
                  className={cn("w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-gray-50", showStatusFilter === 'pending' && "bg-orange-50 text-orange-600 font-bold")}
                >
                  New (Pending)
                </button>
                <button 
                  onClick={() => setShowStatusFilter('acknowledged')}
                  className={cn("w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-gray-50", showStatusFilter === 'acknowledged' && "bg-orange-50 text-orange-600 font-bold")}
                >
                  In Progress
                </button>
              </div>
            </div>

            <div className="relative">
              <input 
                type="text"
                placeholder="Search table or KOT..."
                value={localSearch}
                onChange={(e) => setLocalSearch(e.target.value)}
                className="pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 w-64 shadow-sm"
              />
              <Hash className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
              {localSearch && (
                <button 
                  onClick={() => setLocalSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <button
              onClick={() => {
                setLoading(true);
                refresh().finally(() => setTimeout(() => setLoading(false), 500));
              }}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg bg-white hover:bg-gray-50 transition-colors text-gray-600 shadow-sm disabled:opacity-50"
            >
              <RefreshCw size={14} className={cn(loading && "animate-spin")} /> Refresh
            </button>
          </div>
        </div>

        {/* ── Section Tabs ── */}
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl px-4 py-2 mb-5 shadow-sm overflow-x-auto">
          <button
            onClick={() => setActiveTab('all')}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-all',
              activeTab === 'all'
                ? 'bg-orange-50 text-orange-600 border border-orange-300'
                : 'text-gray-500 hover:bg-gray-50'
            )}
          >
            <LayoutGrid size={15} />
            All KOT
            <span className={cn('text-xs px-2 py-0.5 rounded-full font-bold', activeTab === 'all' ? 'bg-orange-100 text-orange-600' : 'bg-gray-100 text-gray-500')}>
              {counts.total}
            </span>
          </button>

          {sections.map(s => {
            const pal = getSectionPalette(s.section_id);
            const isActive = activeTab === s.section_id;
            const cnt = (kotsBySection[s.section_id] || []).length;
            return (
              <button
                key={s.section_id}
                onClick={() => setActiveTab(s.section_id)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-all border',
                  isActive ? `${pal.bg} ${pal.text} border-current` : 'text-gray-500 border-transparent hover:bg-gray-50'
                )}
              >
                <SectionIcon name={s.section_name} size={15} className={isActive ? pal.text : 'text-gray-400'} />
                <span>{s.section_name}</span>
                <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-gray-100 text-gray-600">{cnt}</span>
              </button>
            );
          })}
        </div>

        {/* ── Status Counter Cards ── */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <StatCard label="Total KOT" value={counts.total} sub="All Sections" valueClass="text-gray-800" icon={<LayoutGrid className="text-blue-400" size={22} />} iconBg="bg-blue-50" />
          <StatCard label="New / Pending" value={counts.pending} sub="Need Attention" valueClass="text-orange-500" icon={<Clock className="text-orange-400" size={22} />} iconBg="bg-orange-50" subClass="text-orange-400" />
          <StatCard label="Ready" value={counts.completed} sub="To be Served" valueClass="text-blue-500" icon={<ChefHat className="text-blue-400" size={22} />} iconBg="bg-blue-50" subClass="text-blue-400" />
          <StatCard label="Served" value={counts.served} sub="Done" valueClass="text-green-500" icon={<CheckCheck className="text-green-400" size={22} />} iconBg="bg-green-50" subClass="text-green-400" />
        </div>

        {/* ── Main Content ── */}
        <div className="flex flex-col gap-6" style={{ minHeight: '400px' }}>
          {/* Section Rows */}
          <div className="flex-1 flex flex-col gap-8">
            {loading ? (
              <div className="flex-1 flex items-center justify-center text-gray-400">
                <RefreshCw className="animate-spin mr-2" size={18} /> Loading KOTs…
              </div>
            ) : displayedSections.length === 0 ? (
              <div className="flex-1 flex items-center justify-center flex-col text-gray-400">
                <ChefHat size={48} className="opacity-20 mb-3" />
                <p className="text-sm">No sections found. Add sections from Admin settings.</p>
              </div>
            ) : (
              displayedSections.map(section => {
                const pal = getSectionPalette(section.section_id);
                const sectionKots = filteredKotsBySection[section.section_id] || [];
                const isActive = activeTab === 'all' || activeTab === section.section_id;

                if (!isActive) return null;

                return (
                  <div
                    key={section.section_id}
                    className="flex flex-col gap-4 animate-in fade-in slide-in-from-left-2 duration-300"
                  >
                    {/* Row header */}
                    <div className={cn('flex items-center justify-between pb-2 border-b-2', pal.border)}>
                      <div className="flex items-center gap-2">
                        <div className={cn('p-1.5 rounded-lg bg-white border', pal.border)}>
                          <SectionIcon name={section.section_name} size={18} className={pal.text} />
                        </div>
                        <div>
                          <span className={cn('font-bold text-lg', pal.text)}>
                            {section.section_name}
                          </span>
                          <span className="ml-3 text-xs font-mono text-gray-400 uppercase tracking-widest">
                            {sectionKots.length} ACTIVE KOTS
                          </span>
                        </div>
                      </div>

                      <div className="relative group/menu">
                        <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-400 hover:text-gray-600">
                          <MoreVertical size={18} />
                        </button>
                        <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-gray-200 rounded-xl shadow-xl opacity-0 invisible group-hover/menu:opacity-100 group-hover/menu:visible transition-all z-50 p-1">
                          <button 
                            onClick={async () => {
                              if (confirm(`Are you sure you want to mark all KOTs in ${section.section_name} as ready?`)) {
                                for (const kot of sectionKots) {
                                  if (kot.status !== 'completed') {
                                    await apiClient.post(`/kots/section-kots/${kot.section_kot_id}/status`, { status: 'completed' });
                                  }
                                }
                                refresh();
                              }
                            }}
                            className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-emerald-50 text-emerald-600 font-medium flex items-center gap-2"
                          >
                            <CheckCheck size={14} /> Mark All Ready
                          </button>
                          <button 
                            onClick={() => setActiveTab(section.section_id)}
                            className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-gray-50 text-gray-600 font-medium flex items-center gap-2"
                          >
                            <Filter size={14} /> Focus Section
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Cards Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-5 gap-4 pb-4 px-2">
                      {sectionKots.length === 0 ? (
                        <div className="col-span-full flex items-center justify-center py-8 border-2 border-dashed border-gray-100 rounded-2xl text-gray-400 text-sm">
                          No active orders for this section
                        </div>
                      ) : sectionKots.map(kot => (
                        <div key={kot.section_kot_id} className="w-full">
                          <KotCard
                            kot={kot}
                            selected={selectedKot?.section_kot_id === kot.section_kot_id}
                            onClick={() => setSelectedKot(kot)}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* ── KOT Detail Panel Overlay ── */}
          {selectedKot && (
            <>
              <div className="fixed inset-y-0 right-0 w-[400px] bg-white border-l border-gray-200 shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-300">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 bg-gray-50/50">
                  <div>
                    <h2 className="font-bold text-gray-900">Order Detail</h2>
                    <p className="text-[10px] text-gray-400 font-mono uppercase tracking-tighter">
                      KOT: {selectedKot.section_kot_number} | ORD: {selectedKot.order_id?.slice(0, 8)}
                    </p>
                  </div>
                  <button onClick={() => setSelectedKot(null)} className="p-2 hover:bg-white rounded-full border border-transparent hover:border-gray-200 transition-all text-gray-400 hover:text-gray-600">
                    <X size={20} />
                  </button>
                </div>

                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-widest', statusPill(selectedKot.status))}>
                        {statusLabel(selectedKot.status)}
                      </span>
                      <p className={cn('text-3xl font-black', getSectionPalette(selectedKot.section_id).text)}>
                        T-{selectedKot.table_number}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-400 uppercase font-bold tracking-tighter">Order Time</p>
                      <p className="font-mono text-sm text-gray-700">{fmtTime(selectedKot.generated_at)}</p>
                    </div>
                  </div>

                  <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 space-y-3">
                    <div className="flex items-center justify-between text-[10px] text-gray-400 uppercase tracking-widest font-black border-b pb-2">
                      <span>Item Name</span>
                      <span>Quantity</span>
                    </div>
                    <div className="space-y-2">
                      {selectedKot.items.map((it, idx) => (
                        <div key={idx} className="flex justify-between items-center py-2.5 border-b border-gray-200/50 last:border-0 hover:bg-white -mx-2 px-2 rounded-lg transition-colors group">
                          <div className="flex flex-col">
                            <span className="font-bold text-gray-800 text-sm group-hover:text-blue-600 transition-colors">{it.item_name}</span>
                            <span className="text-[9px] text-gray-300 font-mono">ID: {it.item_id}</span>
                          </div>
                          <span className="bg-white border shadow-sm px-3 py-1 rounded-lg font-black text-blue-600 text-sm">
                            x{it.quantity}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Metadata Section */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-white border border-gray-100 rounded-xl shadow-sm">
                      <p className="text-[9px] font-black text-gray-400 uppercase tracking-tighter mb-1">Section</p>
                      <p className="text-xs font-bold text-gray-600">{selectedKot.section_name}</p>
                    </div>
                    <div className="p-3 bg-white border border-gray-100 rounded-xl shadow-sm">
                      <p className="text-[9px] font-black text-gray-400 uppercase tracking-tighter mb-1">Phase</p>
                      <p className="text-xs font-bold text-gray-600">Phase {selectedKot.order_phase || 1}</p>
                    </div>
                  </div>
                </div>

                {/* Action Footer */}
                <div className="p-6 bg-white border-t border-gray-100 space-y-3">
                  {selectedKot.status === 'pending' && (
                    <Button
                      onClick={() => advanceStatus('acknowledged')}
                      disabled={updatingStatus}
                      className="w-full h-14 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-base gap-2 shadow-lg shadow-blue-200"
                    >
                      {updatingStatus ? <RefreshCw className="animate-spin" /> : <PlayCircle size={22} />}
                      START PREPARING
                    </Button>
                  )}
                  {selectedKot.status === 'acknowledged' && (
                    <Button
                      onClick={() => advanceStatus('completed')}
                      disabled={updatingStatus}
                      className="w-full h-14 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-base gap-2 shadow-lg shadow-emerald-200"
                    >
                      {updatingStatus ? <RefreshCw className="animate-spin" /> : <CheckCircle size={22} />}
                      MARK READY
                    </Button>
                  )}
                  {selectedKot.status === 'completed' && (
                    <Button
                      onClick={() => advanceStatus('served')}
                      disabled={updatingStatus}
                      className="w-full h-14 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-base gap-2 shadow-lg shadow-blue-200"
                    >
                      {updatingStatus ? <RefreshCw className="animate-spin" /> : <CheckCheck size={22} />}
                      MARK SERVED
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    className="w-full h-12 rounded-xl border-gray-200 text-gray-600 font-bold gap-2 hover:bg-gray-50"
                    onClick={() => setPrintKotOpen(true)}
                  >
                    <Printer size={18} /> PRINT KOT
                  </Button>
                </div>
              </div>

              {/* Print Dialog */}
              <Dialog open={printKotOpen} onOpenChange={setPrintKotOpen}>
                <DialogContent className="max-w-sm">
                  <DialogHeader>
                    <DialogTitle className="text-center font-black tracking-widest uppercase py-2">KOT PRINT PREVIEW</DialogTitle>
                  </DialogHeader>
                  <div className="font-mono text-xs border p-4 bg-gray-50 rounded-lg space-y-4">
                    <div className="text-center border-b pb-2">
                            <p className="font-bold text-sm uppercase">Restro-Manager</p>
                            <p className="text-[10px] text-gray-500">Kitchen Copy</p>
                    </div>
                    <div className="grid grid-cols-2 gap-y-1">
                            <span>ORDER ID:</span><span className="text-right font-bold">{selectedKot.order_id?.slice(0, 8)}</span>
                            <span>KOT NO:</span><span className="text-right font-bold">#{selectedKot.section_kot_number}</span>
                            <span>TABLE:</span><span className="text-right font-bold">{selectedKot.table_number}</span>
                            <span>TIME:</span><span className="text-right">{fmtFull(selectedKot.generated_at)}</span>
                    </div>
                    <div className="border-t border-gray-300 pt-2">
                        {selectedKot.items.map((it, i) => (
                            <div key={i} className="flex justify-between py-1">
                                <span>{it.item_name}</span>
                                <span className="font-bold">x{it.quantity}</span>
                            </div>
                        ))}
                    </div>
                    <div className="border-t pt-2 text-center text-[10px] text-gray-400 italic">
                        Software by RestroManager
                    </div>
                  </div>
                  <DialogFooter className="pt-4">
                    <Button variant="outline" onClick={() => setPrintKotOpen(false)}>Close</Button>
                    <Button className="bg-blue-600 hover:bg-blue-700 font-bold text-white" onClick={() => window.print()}>
                        <Printer className="mr-2" size={16} /> Print Now
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </>
          )}
        </div>
      </DashboardLayout>
    </RoleGuard>
  );
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <div className="flex items-center gap-2 text-gray-500">
        {icon}
        <span>{label}</span>
      </div>
      <span className="font-semibold text-gray-700">{value}</span>
    </div>
  );
}

function StatCard({ label, value, sub, icon, iconBg, valueClass = '', subClass = '' }: any) {
  return (
    <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
      <div className={cn("p-3 rounded-xl", iconBg)}>
        {icon}
      </div>
      <div>
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">{label}</p>
        <div className="flex items-baseline gap-2">
          <h3 className={cn("text-2xl font-black mt-0.5", valueClass)}>{value}</h3>
          <p className={cn("text-[10px] font-bold", subClass)}>{sub}</p>
        </div>
      </div>
    </div>
  );
}

export default function KOTPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center text-gray-400">Loading...</div>}>
      <KOTPageInner />
    </Suspense>
  );
}
