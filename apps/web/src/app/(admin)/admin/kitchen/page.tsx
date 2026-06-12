'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import apiClient from '@/services/apiClient';
import { useFilter } from '@/lib/filter-context';
import { cn } from '@/lib/utils';
import { RoleGuard } from '@/components/auth/role-guard';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { PageContainer } from '@/components/common/page-container';
import { ResponsiveGrid } from '@/components/common/responsive-grid';
import { MobileDrawer } from '@/components/common/mobile-drawer';
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
  CreditCard,
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
  status: 'pending' | 'acknowledged' | 'preparing' | 'ready' | 'served' | 'delivered' | 'cancelled' | 'packed' | 'recook_requested';
  version: number;
  acknowledged_at?: string;
  preparing_at?: string;
  ready_at?: string;
  served_at?: string;
  delivered_at?: string;
  cancelled_at?: string;
  recook_requested_at?: string;
}

interface SectionKOT {
  section_kot_id: string;
  parent_kot_id: string;
  section_id: string;
  section_name: string;
  section_kot_number: string;
  status: 'pending' | 'acknowledged' | 'ready' | 'completed' | 'served';
  generated_at: string;
  table_number: string;
  kot_number: string;
  order_id: string;
  order_phase: number;
  is_bill_paid: boolean;
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

// ─────────────────────────────────────────────
//  Item Status Configuration
// ─────────────────────────────────────────────
const ITEM_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'Pending', color: 'text-gray-700', bg: 'bg-gray-100' },
  acknowledged: { label: 'Acknowledged', color: 'text-blue-700', bg: 'bg-blue-100' },
  preparing: { label: 'Preparing', color: 'text-orange-700', bg: 'bg-orange-100' },
  ready: { label: 'Ready', color: 'text-amber-700', bg: 'bg-amber-100' },
  served: { label: 'Served', color: 'text-green-700', bg: 'bg-green-100' },
  delivered: { label: 'Delivered', color: 'text-teal-700', bg: 'bg-teal-100' },
  cancelled: { label: 'Cancelled', color: 'text-red-700', bg: 'bg-red-100' },
  packed: { label: 'Packed', color: 'text-purple-700', bg: 'bg-purple-100' },
  recook_requested: { label: 'Recook', color: 'text-orange-700', bg: 'bg-orange-100' },
};

const ITEM_STATUS_TRANSITIONS: Record<string, string[]> = {
  pending: ['acknowledged', 'cancelled'],
  acknowledged: ['preparing', 'cancelled'],
  preparing: ['ready', 'recook_requested', 'cancelled'],
  ready: ['served', 'delivered', 'recook_requested'],
  recook_requested: ['preparing'],
  served: [],
  delivered: [],
  cancelled: [],
  packed: [],
};

const TERMINAL_KOT_STATUSES = ['completed', 'served'];
const ACTIVE_KOT_ITEM_STATUSES = ['recook_requested', 'ready', 'preparing', 'acknowledged', 'pending', 'packed'];

function isTerminalKot(kot: SectionKOT) {
  return TERMINAL_KOT_STATUSES.includes(kot.status)
    || kot.items.every(item => !ACTIVE_KOT_ITEM_STATUSES.includes(item.status));
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
  
  // ⭐ KITCHEN UX: Show action counters
  const statusCounts: Record<string, number> = {};
  const actionableStatuses = ['recook_requested', 'ready', 'preparing', 'acknowledged', 'pending'];
  const terminalStatuses = ['served', 'delivered', 'cancelled'];
  
  kot.items.forEach(item => {
    statusCounts[item.status] = (statusCounts[item.status] || 0) + 1;
  });
  
  const actionableCount = kot.items.filter(i => actionableStatuses.includes(i.status)).length;
  const terminalCount = kot.items.filter(i => terminalStatuses.includes(i.status)).length;
  
  // Card border based on highest priority actionable item
  const sortedItems = [...kot.items].sort((a, b) => {
    const statusPriority = { recook_requested: 0, ready: 1, preparing: 2, acknowledged: 3, pending: 4, served: 5, delivered: 5, cancelled: 5 };
    return (statusPriority[a.status as keyof typeof statusPriority] ?? 99) - (statusPriority[b.status as keyof typeof statusPriority] ?? 99);
  });
  const highestPriorityItem = sortedItems.find(i => actionableStatuses.includes(i.status));
  
  const cardBorderColor = highestPriorityItem
    ? highestPriorityItem.status === 'recook_requested'
      ? 'border-red-400'
      : highestPriorityItem.status === 'ready'
      ? 'border-amber-400'
      : highestPriorityItem.status === 'preparing'
      ? 'border-orange-400'
      : 'border-blue-400'
    : 'border-gray-200';

  return (
    <div
      onClick={onClick}
      className={cn(
        'rounded-xl border-2 bg-white cursor-pointer transition-all hover:shadow-md h-full flex flex-col',
        selected ? 'ring-2 ring-blue-400 shadow-md scale-[1.02]' : 'hover:border-gray-300',
        cardBorderColor
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

        {/* Customer Has Paid banner */}
        {kot.is_bill_paid && (
          <div className="mt-1.5 flex items-center gap-1 text-[9px] font-bold text-green-700 bg-green-50 border border-green-200 rounded px-1.5 py-0.5">
            <CreditCard size={8} /> Customer Has Paid
          </div>
        )}

        {/* ⭐ ACTION COUNTERS - Quick scan for admins */}
        <div className="mt-2 grid grid-cols-5 gap-0.5 text-center text-[9px] font-bold">
          {statusCounts.recook_requested ? (
            <div className="px-0.5 py-0.5 rounded bg-red-100 text-red-700">
              <div>🔄</div>
              <div>{statusCounts.recook_requested}</div>
            </div>
          ) : null}
          {statusCounts.ready ? (
            <div className="px-0.5 py-0.5 rounded bg-amber-100 text-amber-700">
              <div>✓</div>
              <div>{statusCounts.ready}</div>
            </div>
          ) : null}
          {statusCounts.preparing ? (
            <div className="px-0.5 py-0.5 rounded bg-orange-100 text-orange-700">
              <div>🔥</div>
              <div>{statusCounts.preparing}</div>
            </div>
          ) : null}
          {statusCounts.acknowledged || statusCounts.pending ? (
            <div className="px-0.5 py-0.5 rounded bg-blue-100 text-blue-700">
              <div>📋</div>
              <div>{(statusCounts.acknowledged || 0) + (statusCounts.pending || 0)}</div>
            </div>
          ) : null}
          {terminalCount ? (
            <div className="px-0.5 py-0.5 rounded bg-gray-100 text-gray-600 text-[8px]">
              <div>✅</div>
              <div>{terminalCount}</div>
            </div>
          ) : null}
        </div>

        {/* Item Preview - Show actionable items first */}
        <div className="mt-1.5 space-y-0.5 text-[9px]">
          {sortedItems
            .filter(i => actionableStatuses.includes(i.status))
            .slice(0, 3)
            .map((item, i) => {
              const cfg = ITEM_STATUS_CONFIG[item.status] || ITEM_STATUS_CONFIG.pending;
              return (
                <div key={i} className="flex items-center gap-1 px-1 py-0.5 rounded bg-gray-50">
                  <span className={`font-bold px-1 rounded text-[8px] ${cfg.bg} ${cfg.color}`}>
                    {cfg.label.charAt(0)}
                  </span>
                  <span className="truncate flex-1">{item.item_name}</span>
                  <span className="text-gray-500">x{item.quantity}</span>
                </div>
              );
            })}
          {actionableCount > 3 && (
            <div className="text-[8px] text-gray-400 italic px-1">+{actionableCount - 3} more items...</div>
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
  const [busyItems, setBusyItems] = useState<Set<string>>(new Set());
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


  const advanceStatus = async (itemId: string, nextStatus: string) => {
    if (!selectedKot) return;
    setBusyItems(prev => new Set(prev).add(itemId));
    try {
      const response = await apiClient.post(`/kots/items/${itemId}/status`, { status: nextStatus });

      // Update selectedKot with new item status and derived KOT status
      const updatedKot = { ...selectedKot };
      const itemIndex = updatedKot.items.findIndex(it => it.section_kot_item_id === itemId);
      if (itemIndex >= 0) {
        updatedKot.items[itemIndex].status = nextStatus as any;
        updatedKot.items[itemIndex].version = (updatedKot.items[itemIndex].version || 0) + 1;
      }

      // Update derived KOT status
      if (response.data?.derivedSectionKotStatus) {
        updatedKot.status = response.data.derivedSectionKotStatus;
      }

      if (isTerminalKot(updatedKot)) {
        setSelectedKot(null);
      } else {
        setSelectedKot(updatedKot);
      }

      // Update KOTs lists
      setKotsBySection(prev => {
        const copy = { ...prev };
        const sid = selectedKot.section_id;
        if (copy[sid]) {
          copy[sid] = isTerminalKot(updatedKot)
            ? copy[sid].filter(k => k.section_kot_id !== selectedKot.section_kot_id)
            : copy[sid].map(k => k.section_kot_id === selectedKot.section_kot_id ? updatedKot : k);
        }
        return copy;
      });
      setAllKots(prev => isTerminalKot(updatedKot)
        ? prev.filter(k => k.section_kot_id !== selectedKot.section_kot_id)
        : prev.map(k => k.section_kot_id === selectedKot.section_kot_id ? updatedKot : k)
      );

      fetchSections(true);
    } catch (e: any) {
      console.error('Item status update error:', e);
      const errMsg = e?.response?.data?.message || e?.response?.statusText || e?.message || 'Item update failed';
      alert(`Error: ${errMsg}`);
    } finally {
      setBusyItems(prev => {
        const copy = new Set(prev);
        copy.delete(itemId);
        return copy;
      });
    }
  };

  // Always show ALL sections as columns — activeTab only highlights/filters cards within each column
  const displayedSections = sections;

  const [localSearch, setLocalSearch] = useState('');
  const [showStatusFilter, setShowStatusFilter] = useState<'all' | 'pending' | 'acknowledged'>('all');

  // Apply date/time filters and hide terminal KOTs.
  const filteredAllKots = allKots.filter(kot => {
    if (isTerminalKot(kot)) return false;

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
      if (isTerminalKot(kot)) return false;

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
        <PageContainer className="p-0">
        {/* ── Page Header ── */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              KOT <span className="text-gray-500 font-normal text-lg">(Kitchen Order Tickets)</span>
            </h1>
            <p className="text-sm text-gray-400 mt-0.5">View and manage kitchen orders by sections</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative group w-full sm:w-auto">
              <button
                className="flex items-center justify-center gap-2 w-full sm:w-auto px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg bg-white hover:bg-gray-50 transition-colors text-gray-600 shadow-sm h-11 sm:h-9"
              >
                <Filter size={14} />
                {showStatusFilter === 'all' ? 'All Status' : statusLabel(showStatusFilter)}
              </button>

              <div className="absolute right-0 top-full mt-2 w-full sm:w-48 bg-white border border-gray-200 rounded-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 p-1">
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

            <div className="relative w-full sm:w-auto">
              <input
                type="text"
                placeholder="Search table or KOT..."
                value={localSearch}
                onChange={(e) => setLocalSearch(e.target.value)}
                className="pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 w-full sm:w-64 shadow-sm h-11 sm:h-9"
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
              className="flex items-center justify-center gap-2 w-full sm:w-auto px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg bg-white hover:bg-gray-50 transition-colors text-gray-600 shadow-sm disabled:opacity-50 h-11 sm:h-9"
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
        <ResponsiveGrid columns={{ mobile: 2, tablet: 4, desktop: 4 }} className="mb-6">
          <StatCard label="Total KOT" value={counts.total} sub="All Sections" valueClass="text-gray-800" icon={<LayoutGrid className="text-blue-400" size={22} />} iconBg="bg-blue-50" />
          <StatCard label="New / Pending" value={counts.pending} sub="Need Attention" valueClass="text-orange-500" icon={<Clock className="text-orange-400" size={22} />} iconBg="bg-orange-50" subClass="text-orange-400" />
          <StatCard label="Ready" value={counts.completed} sub="To be Served" valueClass="text-blue-500" icon={<ChefHat className="text-blue-400" size={22} />} iconBg="bg-blue-50" subClass="text-blue-400" />
          <StatCard label="Served" value={counts.served} sub="Done" valueClass="text-green-500" icon={<CheckCheck className="text-green-400" size={22} />} iconBg="bg-green-50" subClass="text-green-400" />
        </ResponsiveGrid>

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
                              if (confirm(`Are you sure you want to mark all items in ${section.section_name} as ready?`)) {
                                for (const kot of sectionKots) {
                                  for (const item of kot.items) {
                                    if (item.status === 'preparing') {
                                      await apiClient.post(`/kots/items/${item.section_kot_item_id}/status`, { status: 'ready' });
                                    }
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
                    <MobileDrawer
            isOpen={!!selectedKot}
            onClose={() => setSelectedKot(null)}
            title="Order Detail"
            size="md"
            footer={
              selectedKot && (
                <Button
                  variant="outline"
                  className="w-full h-12 rounded-xl border-gray-200 text-gray-600 font-bold gap-2 hover:bg-gray-50"
                  onClick={() => setPrintKotOpen(true)}
                >
                  <Printer size={18} /> PRINT KOT
                </Button>
              )
            }
          >
            {selectedKot && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-widest ${statusPill(selectedKot.status)}`}>
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
                    <span>Qty</span>
                    <span>Status</span>
                  </div>
                  <div className="space-y-4">
                    {selectedKot.items.map((item, idx) => {
                      const itemCfg = ITEM_STATUS_CONFIG[item.status] || {};
                      const validTransitions = ITEM_STATUS_TRANSITIONS[item.status] || [];
                      const itemBusy = busyItems.has(item.section_kot_item_id);

                      return (
                        <div key={idx} className="border border-gray-200 rounded-lg p-3 bg-white space-y-2">
                          <div className="flex justify-between items-start">
                            <div className="flex flex-col">
                              <span className="font-bold text-gray-800 text-sm">{item.item_name}</span>
                              <span className="text-[9px] text-gray-300 font-mono">ID: {item.item_id}</span>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              <span className="bg-white border shadow-sm px-2 py-1 rounded font-black text-blue-600 text-xs">
                                x{item.quantity}
                              </span>
                              <span className={cn('text-[9px] px-2 py-0.5 rounded border font-bold', itemCfg.bg, itemCfg.color)}>
                                {itemCfg.label}
                              </span>
                            </div>
                          </div>

                          {/* Item Status Buttons */}
                          {validTransitions.length > 0 ? (
                            <div className="flex flex-wrap gap-1 pt-2 border-t">
                              {validTransitions.map(nextStatus => {
                                const nextCfg = ITEM_STATUS_CONFIG[nextStatus] || {};
                                const isServe = nextStatus === 'served' || nextStatus === 'delivered';
                                const isReady = nextStatus === 'ready';
                                const isRecook = nextStatus === 'recook_requested';

                                return (
                                  <button
                                    key={nextStatus}
                                    disabled={itemBusy}
                                    onClick={() => advanceStatus(item.section_kot_item_id, nextStatus)}
                                    className={cn(
                                      'flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-50 h-10',
                                      isServe
                                        ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                        : isReady
                                        ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                                        : isRecook
                                        ? 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                                        : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                                    )}
                                  >
                                    {itemBusy && <RefreshCw size={10} className="animate-spin" />}
                                    {nextStatus === 'recook_requested' ? '↻ Recook' : nextCfg.label || nextStatus}
                                  </button>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="text-[9px] text-gray-500 pt-2 italic">✓ {itemCfg.label}</div>
                          )}
                        </div>
                      );
                    })}
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
            )}
          </MobileDrawer>

          {/* Print Dialog */}
          {selectedKot && (
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
          )}
        </div>
        </PageContainer>
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
