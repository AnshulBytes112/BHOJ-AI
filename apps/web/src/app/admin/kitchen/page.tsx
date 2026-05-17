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
  status: 'pending' | 'acknowledged' | 'completed';
  generated_at: string;
  table_number: string;
  kot_number: string;
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
  if (status === 'completed') return 'bg-gray-100 text-gray-500 border-gray-200';
  return 'bg-gray-100 text-gray-500';
}

function statusLabel(status: string) {
  if (status === 'pending') return 'New';
  if (status === 'acknowledged') return 'In Progress';
  if (status === 'completed') return 'Ready';
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
        'rounded-xl border bg-white cursor-pointer transition-all hover:shadow-md',
        selected ? 'ring-2 ring-blue-400 shadow-md' : 'border-gray-200 hover:border-gray-300',
      )}
    >
      <div className="flex items-center justify-between px-3 pt-3 pb-1">
        <span className={cn('text-xs font-bold', pal.text)}>{kot.section_kot_number}</span>
        <span className="text-xs text-gray-400">{fmtTime(kot.generated_at)}</span>
      </div>
      <div className="px-3 pb-3">
        <div className="flex items-center justify-between mt-1">
          <span className="text-sm font-semibold text-gray-800">Table {kot.table_number}</span>
        </div>
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-gray-400">{kot.items.length} Item{kot.items.length !== 1 ? 's' : ''}</span>
          <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full border', statusPill(kot.status))}>
            {statusLabel(kot.status)}
          </span>
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


  const advanceStatus = async (nextStatus: string) => {
    if (!selectedKot) return;
    setUpdatingStatus(true);
    try {
      await apiClient.post(`/kots/section-kots/${selectedKot.section_kot_id}/status`, { status: nextStatus });
      
      const updated = { ...selectedKot, status: nextStatus as any };

      // If completed, close the detail panel and remove from lists immediately
      if (nextStatus === 'completed') {
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
    } catch (e) { console.error(e); }
    finally { setUpdatingStatus(false); }
  };

  // Always show ALL sections as columns — activeTab only highlights/filters cards within each column
  const displayedSections = sections;

  // Apply date/time filters AND hide completed KOTs (they auto-remove when marked Ready)
  const filteredAllKots = allKots.filter(kot => {
    if (kot.status === 'completed') return false; // auto-remove completed
    if (!filterDate && !filterTime) return true;
    const kotDateObj = new Date(kot.generated_at);
    if (filterDate && kotDateObj.toISOString().split('T')[0] !== filterDate) return false;
    if (filterTime && kotDateObj.toTimeString().slice(0, 5) !== filterTime) return false;
    return true;
  });

  const filteredKotsBySection: Record<string, SectionKOT[]> = {};
  for (const [key, kots] of Object.entries(kotsBySection)) {
    filteredKotsBySection[key] = kots.filter(kot => {
      if (kot.status === 'completed') return false; // auto-remove completed
      if (!filterDate && !filterTime) return true;
      const kotDateObj = new Date(kot.generated_at);
      if (filterDate && kotDateObj.toISOString().split('T')[0] !== filterDate) return false;
      if (filterTime && kotDateObj.toTimeString().slice(0, 5) !== filterTime) return false;
      return true;
    });
  }

  // Counts include completed KOTs so the "Ready" stat card still shows correctly
  const counts = {
    total: allKots.length,
    pending: allKots.filter(k => k.status === 'pending').length,
    acknowledged: allKots.filter(k => k.status === 'acknowledged').length,
    completed: allKots.filter(k => k.status === 'completed').length,
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
            <button 
              onClick={() => alert("Filter functionality coming soon!")}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg bg-white hover:bg-gray-50 transition-colors text-gray-600 shadow-sm"
            >
              <Filter size={14} /> Filter
            </button>
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
          <StatCard label="In Progress" value={counts.acknowledged} sub="Being Prepared" valueClass="text-blue-500" icon={<ChefHat className="text-blue-400" size={22} />} iconBg="bg-blue-50" subClass="text-blue-400" />
          <StatCard label="Ready" value={counts.completed} sub="Ready to Serve" valueClass="text-green-500" icon={<CheckCheck className="text-green-400" size={22} />} iconBg="bg-green-50" subClass="text-green-400" />
        </div>

        {/* ── Main Content ── */}
        <div className="flex gap-4" style={{ minHeight: '400px' }}>
          {/* Section Columns */}
          <div className="flex-1 flex gap-4 overflow-x-auto pb-2">
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
                // When a specific tab is active, only show cards for that section; otherwise show up to PREVIEW
                const isHighlighted = activeTab === 'all' || activeTab === section.section_id;
                const PREVIEW = 5;
                const shown = (activeTab === 'all' || activeTab === section.section_id)
                  ? sectionKots
                  : [];
                const hasMore = false;

                return (
                  <div
                    key={section.section_id}
                    className={cn(
                      'flex flex-col min-w-[210px] w-[210px] shrink-0 transition-opacity',
                      activeTab !== 'all' && activeTab !== section.section_id ? 'opacity-30' : ''
                    )}
                  >
                    {/* Column header */}
                    <div className={cn('flex items-center justify-between mb-3 pb-2 border-b-2', pal.border)}>
                      <div className="flex items-center gap-1.5">
                        <SectionIcon name={section.section_name} size={15} className={pal.text} />
                        <span className={cn('font-bold text-sm', pal.text)}>
                          {section.section_name} ({sectionKots.length})
                        </span>
                      </div>
                      <button className="text-gray-300 hover:text-gray-500 transition-colors">
                        <MoreVertical size={15} />
                      </button>
                    </div>

                    {/* Cards */}
                    <div className="flex flex-col gap-2.5 flex-1">
                      {shown.length === 0 ? (
                        <div className="text-center text-xs text-gray-400 py-10">No KOTs</div>
                      ) : shown.map(kot => (
                        <KotCard
                          key={kot.section_kot_id}
                          kot={kot}
                          selected={selectedKot?.section_kot_id === kot.section_kot_id}
                          onClick={() => setSelectedKot(kot)}
                        />
                      ))}
                    </div>

                    {/* View All */}
                    {hasMore && (
                      <button
                        onClick={() => setActiveTab(section.section_id)}
                        className={cn('mt-3 text-xs font-semibold text-center py-1.5', pal.text, 'hover:underline')}
                      >
                        View All ({sectionKots.length})
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* ── KOT Detail Panel ── */}
          {selectedKot && (
            <div className="w-[310px] shrink-0 bg-white rounded-2xl border border-gray-200 shadow-sm flex flex-col overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <span className="font-bold text-gray-800 text-sm">KOT Details</span>
                <button onClick={() => setSelectedKot(null)} className="text-gray-400 hover:text-gray-600 transition-colors">
                  <X size={16} />
                </button>
              </div>

              {/* KOT number + status */}
              <div className="px-5 pt-4 pb-2">
                <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider', statusPill(selectedKot.status))}>
                  {statusLabel(selectedKot.status)}
                </span>
                <p className={cn('text-2xl font-black mt-2', getSectionPalette(selectedKot.section_id).text)}>
                  {selectedKot.section_kot_number}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">{selectedKot.section_name}</p>
              </div>

              {/* Detail rows */}
              <div className="px-5 py-3 flex flex-col gap-2.5">
                <DetailRow icon={<TableIcon size={13} />} label="Table No." value={selectedKot.table_number} />
                <DetailRow icon={<User size={13} />} label="Waiter" value="—" />
                <DetailRow icon={<CalendarDays size={13} />} label="Order Time" value={fmtFull(selectedKot.generated_at)} />
                <DetailRow icon={<Clock size={13} />} label="KOT Time" value={fmtFull(selectedKot.generated_at)} />
                <DetailRow icon={<Hash size={13} />} label="Items" value={String(selectedKot.items.length)} />
                <DetailRow icon={<CheckCircle size={13} />} label="Status" value={
                  <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full border', statusPill(selectedKot.status))}>
                    {statusLabel(selectedKot.status)}
                  </span>
                } />
              </div>

              {/* Items */}
              <div className="px-5 flex-1 overflow-y-auto">
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-2">Order Items</p>
                <div className="flex text-[11px] font-semibold text-gray-400 border-b border-gray-100 pb-1.5 mb-2">
                  <span className="flex-1">Item Name</span>
                  <span className="w-8 text-right">Qty</span>
                </div>
                {selectedKot.items.map((item, i) => (
                  <div key={i} className="flex items-center text-sm py-1.5 border-b border-gray-50 last:border-0">
                    <span className="flex-1 text-gray-700 font-medium text-[13px]">{item.item_name}</span>
                    <span className="w-8 text-right font-bold text-gray-600 text-[13px]">{item.quantity}</span>
                  </div>
                ))}
                <div className="mt-4 pt-3 border-t border-gray-100">
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1">Remarks / Note</p>
                  <p className="text-xs text-gray-400 italic">—</p>
                </div>
              </div>

              {/* Actions */}
              <div className="p-4 border-t border-gray-100 space-y-2 mt-2">
                {selectedKot.status === 'pending' && (
                  <button
                    onClick={() => advanceStatus('acknowledged')}
                    disabled={updatingStatus}
                    className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm py-2.5 rounded-xl transition-colors disabled:opacity-50"
                  >
                    <PlayCircle size={16} /> Mark In Progress
                  </button>
                )}
                {selectedKot.status === 'acknowledged' && (
                  <button
                    onClick={() => advanceStatus('completed')}
                    disabled={updatingStatus}
                    className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-bold text-sm py-2.5 rounded-xl transition-colors disabled:opacity-50"
                  >
                    <CheckCircle size={16} /> Mark Ready
                  </button>
                )}
                {selectedKot.status === 'completed' && (
                  <div className="w-full flex items-center justify-center gap-2 bg-gray-100 text-gray-500 font-bold text-sm py-2.5 rounded-xl">
                    <CheckCheck size={16} /> Completed
                  </div>
                )}
                <button 
                  onClick={() => setPrintKotOpen(true)}
                  className="w-full flex items-center justify-center gap-2 border border-gray-200 text-gray-600 hover:bg-gray-50 font-semibold text-sm py-2.5 rounded-xl transition-colors"
                >
                  <Printer size={16} /> Print KOT
                </button>
              </div>
            </div>
          )}
        </div>

        {/* KOT Dialog */}
        <Dialog open={printKotOpen} onOpenChange={setPrintKotOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-center text-sm font-normal p-0 m-0">
                <div style={{
                  fontFamily: 'monospace',
                  border: '1px dashed #000',
                  padding: '6px 12px',
                  textAlign: 'center',
                  fontSize: '14px',
                  fontWeight: 'normal',
                }}>
                  RestroManager Hotel
                </div>
              </DialogTitle>
              <DialogDescription className="sr-only">Kitchen Order Ticket</DialogDescription>
            </DialogHeader>
            {selectedKot && (
              <div className="flex flex-col gap-0 font-mono text-sm" style={{ fontSize: '12px', lineHeight: '1.6' }}>
                {/* KOT label */}
                <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '13px', marginBottom: '6px', letterSpacing: '2px' }}>
                  KITCHEN ORDER TICKET
                </div>

                {/* Order info - left aligned */}
                <div style={{ fontWeight: 'bold', fontSize: '13px', marginBottom: '8px' }}>
                  <div>ORDER NO: #{selectedKot.parent_kot_id ? selectedKot.parent_kot_id.slice(0, 8).toUpperCase() : selectedKot.kot_number}</div>
                  <div>TABLE: {selectedKot.table_number}</div>
                  <div style={{ fontWeight: 'normal', fontSize: '12px' }}>DATE & TIME:{fmtFull(selectedKot.generated_at)}</div>
                </div>

                {/* Dashed separator */}
                <div style={{ borderBottom: '1px dashed #000', marginBottom: '8px' }} />

                {/* Items header */}
                <div className="flex" style={{ marginBottom: '4px', fontWeight: 'bold', fontSize: '11px' }}>
                  <span style={{ flex: 3, textAlign: 'left' }}>ITEM</span>
                  <span style={{ flex: 1, textAlign: 'right' }}>QTY</span>
                </div>

                {/* Dashed separator */}
                <div style={{ borderBottom: '1px dashed #000', marginBottom: '6px' }} />

                {/* Items */}
                <div style={{ marginBottom: '8px' }}>
                  {selectedKot.items.map((item, i) => (
                    <div key={i} className="flex" style={{ marginBottom: '4px' }}>
                      <span style={{ flex: 3, textAlign: 'left' }}>{item.item_name || `Item #${item.item_id}`}</span>
                      <span style={{ flex: 1, textAlign: 'right', fontWeight: 'bold' }}>{item.quantity}</span>
                    </div>
                  ))}
                </div>

                {/* Dashed separator */}
                <div style={{ borderBottom: '1px dashed #000', marginBottom: '8px' }} />

                {/* Status */}
                <div style={{ textAlign: 'center', fontSize: '11px', marginBottom: '8px' }}>
                  Status: <strong>{(selectedKot.status || '').replace('_', ' ').toUpperCase()}</strong>
                </div>

                {/* Footer */}
                <div style={{
                  textAlign: 'center',
                  borderTop: '1px dashed #000',
                  paddingTop: '12px',
                  marginTop: '4px',
                  fontSize: '11px',
                  fontStyle: 'italic',
                }}>
                  Thank you for visiting! Come again.
                </div>

                <div style={{
                  textAlign: 'center',
                  fontSize: '9px',
                  color: 'rgba(0,0,0,0.5)',
                  fontStyle: 'italic',
                  marginTop: '8px',
                  borderTop: '1px solid rgba(0,0,0,0.1)',
                  paddingTop: '6px',
                }}>
                  Software by RestroManager
                </div>
              </div>
            )}
            <DialogFooter className="gap-2 print:hidden">
              <Button variant="outline" onClick={() => setPrintKotOpen(false)}>Close</Button>
              <Button className="bg-primary text-white hover:bg-primary/90 gap-2" onClick={() => window.print()}>
                <Printer className="w-4 h-4" /> Print KOT
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DashboardLayout>
    </RoleGuard>
  );
}

// ── Helpers ──────────────────────────────────
function StatCard({ label, value, sub, valueClass, icon, iconBg, subClass = 'text-gray-400' }: {
  label: string; value: number; sub: string;
  valueClass: string; icon: React.ReactNode; iconBg: string; subClass?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between shadow-sm">
      <div>
        <p className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide">{label}</p>
        <p className={cn('text-3xl font-black mt-1', valueClass)}>{value}</p>
        <p className={cn('text-xs mt-1 font-medium', subClass)}>{sub}</p>
      </div>
      <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center', iconBg)}>{icon}</div>
    </div>
  );
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-gray-300 mt-0.5 shrink-0">{icon}</span>
      <span className="text-[11px] text-gray-400 w-20 shrink-0 pt-0.5">{label}</span>
      <span className="text-[12px] font-semibold text-gray-700 flex-1">{value}</span>
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
