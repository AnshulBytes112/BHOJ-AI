'use client';

import React, { useState, useEffect, useCallback } from 'react';
import apiClient from '@/services/apiClient';
import {
  ChefHat, Loader2, RefreshCw, CheckCircle2,
  AlertTriangle, Clock, CreditCard,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

// ─── Types ────────────────────────────────────────────────────────────────────

interface KotItem {
  section_kot_item_id: string;
  item_name: string;
  quantity: number;
  status: string;
  serial_number: number | null;
}

interface SectionKot {
  section_kot_id: string;
  parent_kot_id: string;
  section_name: string;
  section_kot_number: string;
  status: string;
  generated_at: string;
  table_number: string;
  kot_number: string;
  order_phase: number;
  is_bill_paid: boolean;
  items: KotItem[];
}

// ─── Item Status Badge ────────────────────────────────────────────────────────

const ITEM_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending:           { label: 'Pending',     color: 'text-gray-600',    bg: 'bg-gray-100'     },
  acknowledged:      { label: 'Acknowledged', color: 'text-blue-600',   bg: 'bg-blue-100'     },
  preparing:         { label: 'Preparing',   color: 'text-orange-600',  bg: 'bg-orange-100'   },
  ready:             { label: 'Ready',       color: 'text-amber-700',   bg: 'bg-amber-100'    },
  served:            { label: 'Served',      color: 'text-green-700',   bg: 'bg-green-100'    },
  cancelled:         { label: 'Cancelled',   color: 'text-red-700',     bg: 'bg-red-100'      },
  packed:            { label: 'Packed',      color: 'text-purple-700',  bg: 'bg-purple-100'   },
  delivered:         { label: 'Delivered',   color: 'text-teal-700',    bg: 'bg-teal-100'     },
  recook_requested:  { label: 'Re-cook',     color: 'text-orange-700',  bg: 'bg-orange-100'   },
};

// Item status transition rules (matches backend)
const ITEM_STATUS_TRANSITIONS: Record<string, string[]> = {
  pending:           ['acknowledged', 'cancelled'],
  acknowledged:      ['preparing', 'cancelled'],
  preparing:         ['ready', 'recook_requested', 'cancelled'],
  ready:             ['served', 'delivered', 'recook_requested'],
  served:            [],  // Terminal
  delivered:         [],  // Terminal
  cancelled:         [],  // Terminal
  recook_requested:  ['preparing'],
  packed:            ['served', 'delivered'],
};

const VALID_ITEM_STATUSES = [
  'pending', 'acknowledged', 'preparing', 'ready', 'served', 'cancelled',
  'packed', 'delivered', 'recook_requested',
];

const TERMINAL_KOT_STATUSES = ['served', 'completed'];
const ACTIVE_KOT_ITEM_STATUSES = ['recook_requested', 'ready', 'preparing', 'acknowledged', 'pending', 'packed'];

function isActiveKot(skot: SectionKot) {
  return !TERMINAL_KOT_STATUSES.includes(skot.status)
    && skot.items.some(item => ACTIVE_KOT_ITEM_STATUSES.includes(item.status));
}

// ─── KOT Card ─────────────────────────────────────────────────────────────────
// ⭐ ITEM-CENTRIC: Shows items as independent workflow units
// KOT is now just a grouping container; KOT status is derived from items

function KotCard({
  skot,
  onItemStatusChange,
  busy,
}: {
  skot: SectionKot;
  onItemStatusChange: (itemId: string, status: string) => void;
  busy: string | null;
}) {
  const [expandItems, setExpandItems] = useState(true);

  const elapsed = Math.floor(
    (Date.now() - new Date(skot.generated_at).getTime()) / 60000
  );

  // ⭐ KITCHEN UX: Group items by status and collapse terminal items
  const statusPriority = { recook_requested: 0, ready: 1, preparing: 2, acknowledged: 3, pending: 4, served: 5, delivered: 5, cancelled: 5 };
  const sortedItems = [...skot.items].sort((a, b) => 
    (statusPriority[a.status as keyof typeof statusPriority] ?? 99) - 
    (statusPriority[b.status as keyof typeof statusPriority] ?? 99)
  );

  // Count items by status for action counters
  const statusCounts: Record<string, number> = {};
  const actionableStatuses = ['recook_requested', 'ready', 'preparing', 'acknowledged', 'pending'];
  const terminalStatuses = ['served', 'delivered', 'cancelled'];
  
  skot.items.forEach(item => {
    statusCounts[item.status] = (statusCounts[item.status] || 0) + 1;
  });

  const actionableCount = skot.items.filter(i => actionableStatuses.includes(i.status)).length;
  const terminalCount = skot.items.filter(i => terminalStatuses.includes(i.status)).length;

  // Card border color based on highest priority actionable item
  const highestPriorityItem = sortedItems.find(i => actionableStatuses.includes(i.status));
  const cardBorderColor = highestPriorityItem
    ? highestPriorityItem.status === 'recook_requested'
      ? 'border-red-400 bg-red-50'
      : highestPriorityItem.status === 'ready'
      ? 'border-amber-300 bg-amber-50'
      : highestPriorityItem.status === 'preparing'
      ? 'border-orange-300 bg-orange-50'
      : 'border-blue-300 bg-blue-50'
    : 'border-green-200 bg-green-50';

  return (
    <div
      className={`rounded-2xl border-2 p-4 flex flex-col gap-3 shadow-sm transition-all hover:shadow-md ${cardBorderColor}`}
    >
      {/* Header - KOT as grouping container, not action unit */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-lg font-black text-gray-800">{skot.section_kot_number}</span>
            <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-gray-100 text-gray-600 uppercase">
              {skot.section_name}
            </span>
            <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${ITEM_STATUS_CONFIG[skot.status]?.bg ?? 'bg-gray-100'} ${ITEM_STATUS_CONFIG[skot.status]?.color ?? 'text-gray-600'}`}>
              {ITEM_STATUS_CONFIG[skot.status]?.label ?? skot.status}
            </span>
          </div>
          <div className="text-sm text-gray-600 mt-1">
            🪑 Table <strong>{skot.table_number}</strong> · Phase {skot.order_phase}
          </div>
        </div>
        <div className="flex items-center gap-1 text-xs text-gray-400 shrink-0">
          <Clock size={12} />
          {elapsed}m
        </div>
      </div>

      {/* Customer Already Paid banner */}
      {skot.is_bill_paid && (
        <div className="flex items-center gap-2 rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-xs font-semibold text-green-800">
          <CreditCard size={12} />
          ✓ Payment Received — Continue preparation
        </div>
      )}

      {/* ⭐ ACTION COUNTERS - Quick scan for chefs during rush hour */}
      <div className="grid grid-cols-5 gap-1 text-center text-xs font-bold">
        {statusCounts.recook_requested ? (
          <div className="px-1.5 py-1 rounded bg-red-100 text-red-700">
            <div className="text-lg">🔄</div>
            <div>{statusCounts.recook_requested}</div>
          </div>
        ) : null}
        {statusCounts.ready ? (
          <div className="px-1.5 py-1 rounded bg-amber-100 text-amber-700">
            <div className="text-lg">✓</div>
            <div>{statusCounts.ready}</div>
          </div>
        ) : null}
        {statusCounts.preparing ? (
          <div className="px-1.5 py-1 rounded bg-orange-100 text-orange-700">
            <div className="text-lg">🔥</div>
            <div>{statusCounts.preparing}</div>
          </div>
        ) : null}
        {statusCounts.acknowledged || statusCounts.pending ? (
          <div className="px-1.5 py-1 rounded bg-blue-100 text-blue-700">
            <div className="text-lg">📋</div>
            <div>{(statusCounts.acknowledged || 0) + (statusCounts.pending || 0)}</div>
          </div>
        ) : null}
        {terminalCount ? (
          <div className="px-1.5 py-1 rounded bg-gray-100 text-gray-600 text-[9px]">
            <div className="text-lg">✅</div>
            <div>{terminalCount}</div>
          </div>
        ) : null}
      </div>

      {/* Items - ACTIONABLE ITEMS FIRST, terminal items collapsed */}
      <div>
        <button
          className="text-xs font-semibold text-gray-600 hover:text-gray-900 flex items-center gap-1 mb-2"
          onClick={() => setExpandItems(p => !p)}
        >
          {expandItems ? '▾' : '▸'} {actionableCount} active {actionableCount !== 1 ? 'items' : 'item'}
          {terminalCount > 0 && <span className="text-gray-400 ml-1">+ {terminalCount} completed</span>}
        </button>

        {expandItems && (
          <div className="space-y-2.5">
            {/* ACTIONABLE ITEMS - Show with full details and buttons */}
            {sortedItems
              .filter(item => actionableStatuses.includes(item.status))
              .map(item => {
                const cfg = ITEM_STATUS_CONFIG[item.status] ?? ITEM_STATUS_CONFIG.pending;
                const itemBusy = busy === item.section_kot_item_id;
                const validTransitions = ITEM_STATUS_TRANSITIONS[item.status] || [];

                return (
                  <div
                    key={item.section_kot_item_id}
                    className={`rounded-lg border-l-4 p-3 transition-colors ${cfg.bg}`}
                    style={{ borderLeftColor: cfg.color.replace('text-', '') }}
                  >
                    {/* Item info row with status badge */}
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className={`text-[10px] font-bold px-2 py-1 rounded-full shrink-0 ${cfg.bg} ${cfg.color}`}>
                          {cfg.label}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-gray-900 truncate">{item.item_name}</div>
                          <div className="text-xs text-gray-500">x{item.quantity}</div>
                        </div>
                      </div>
                    </div>

                    {/* Action buttons - Only show valid transitions */}
                    {validTransitions.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {validTransitions.map(nextStatus => {
                          const nextCfg = ITEM_STATUS_CONFIG[nextStatus] || {};
                          const isReady = nextStatus === 'ready';
                          const isServe = nextStatus === 'served' || nextStatus === 'delivered';
                          const isRecook = nextStatus === 'recook_requested';
                          
                          return (
                            <button
                              key={nextStatus}
                              disabled={itemBusy}
                              onClick={() => onItemStatusChange(item.section_kot_item_id, nextStatus)}
                              className={`text-xs font-semibold px-2.5 py-1 rounded-md border transition-all flex items-center gap-1 ${
                                isServe ? 'bg-green-600 text-white border-green-600 hover:bg-green-700' :
                                isReady ? 'bg-amber-500 text-white border-amber-500 hover:bg-amber-600' :
                                isRecook ? 'bg-red-600 text-white border-red-600 hover:bg-red-700' :
                                'bg-blue-500 text-white border-blue-500 hover:bg-blue-600'
                              } disabled:opacity-50`}
                            >
                              {itemBusy && <Loader2 size={10} className="animate-spin" />}
                              {nextStatus === 'recook_requested' ? '↻ Recook' : 
                               nextStatus === 'ready' ? '✓ Ready' :
                               nextStatus === 'served' ? '✓ Served' :
                               nextStatus === 'delivered' ? '✓ Delivered' :
                               nextStatus === 'cancelled' ? '✗ Cancel' :
                               nextStatus === 'acknowledged' ? '📋 Ack' :
                               nextStatus === 'preparing' ? '🔥 Cook' :
                               nextStatus.charAt(0).toUpperCase() + nextStatus.slice(1)}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

            {/* TERMINAL ITEMS - Collapsed/minimized */}
            {terminalCount > 0 && (
              <div className="rounded-lg bg-gray-50 border border-gray-200 p-2.5">
                <div className="text-xs text-gray-600 font-semibold mb-1.5">✓ {terminalCount} completed</div>
                <div className="text-xs text-gray-500 space-y-0.5">
                  {sortedItems
                    .filter(item => terminalStatuses.includes(item.status))
                    .map(item => (
                      <div key={item.section_kot_item_id} className="flex justify-between">
                        <span className="truncate">{item.item_name}</span>
                        <span className="text-gray-400 ml-1 shrink-0">x{item.quantity}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* KOT Status Indicator - Derived, not manual */}
      {actionableCount === 0 && terminalCount > 0 && (
        <div className="flex items-center gap-2 text-xs text-green-700 font-semibold px-3 py-2 bg-green-50 rounded-lg border border-green-200">
          <CheckCircle2 size={14} />
          All items completed
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function KitchenDashboardPage() {
  const [sections, setSections] = useState<string[]>([]);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [skots, setSkots] = useState<SectionKot[]>([]);
  const [loading, setLoading] = useState(true);
  const [sectionLoading, setSectionLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchSections = useCallback(async () => {
    try {
      const res = await apiClient.get('/kots/sections/list');
      const names: string[] = res.data.map((s: any) => s.section_name);
      setSections(names);
      if (!activeSection && names.length > 0) setActiveSection(names[0]);
    } catch { /* ignore */ }
  }, [activeSection]);

  const fetchSkots = useCallback(async (section: string | null, silent = false) => {
    if (!section) return;
    if (!silent) setSectionLoading(true);
    try {
      const res = await apiClient.get(`/kots/section/${encodeURIComponent(section)}`);
      setSkots(res.data);
    } catch { /* ignore */ }
    setSectionLoading(false);
    setLoading(false);
  }, []);

  useEffect(() => { fetchSections(); }, []);
  useEffect(() => { fetchSkots(activeSection); }, [activeSection]);

  // Auto-refresh every 20 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchSections();
      fetchSkots(activeSection, true);
    }, 20000);
    return () => clearInterval(interval);
  }, [activeSection, fetchSections, fetchSkots]);

  // ⭐ ITEM-CENTRIC: Update individual items using POST /kots/items/:itemId/status
  const handleItemStatusChange = async (itemId: string, status: string) => {
    setBusy(itemId);
    try {
      const response = await apiClient.post(`/kots/items/${itemId}/status`, { status });
      showToast(`✓ Item marked ${status}`, 'success');
      // Refresh KOTs to see updated derived KOT status and item statuses
      if (TERMINAL_KOT_STATUSES.includes(response.data?.derivedSectionKotStatus)) {
        setSkots(prev => prev.filter(skot =>
          !skot.items.some(item => item.section_kot_item_id === itemId)
        ));
      }
      await fetchSkots(activeSection, true);
    } catch (err: any) {
      const errorMsg = err?.response?.data?.message || err?.message || 'Item update failed';
      showToast(errorMsg, 'error');
      console.error('Item status update error:', err?.response?.data);
    } finally {
      setBusy(null);
    }
  };

  const activeSkots = skots.filter(
    s => isActiveKot(s)
  );
  const paidCount   = skots.filter(s => s.is_bill_paid).length;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-6 right-6 z-50 flex items-center gap-2 rounded-xl px-5 py-3 shadow-xl text-sm font-medium
          ${toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-orange-100">
            <ChefHat className="text-orange-600" size={22} />
          </div>
          <div>
            <h2 className="text-3xl font-black tracking-tight">Kitchen Dashboard</h2>
            <p className="text-muted-foreground text-sm">
              Active KOTs · {paidCount > 0 && (
                <span className="text-green-700 font-semibold">{paidCount} table(s) already paid</span>
              )}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => fetchSkots(activeSection, true)}>
          <RefreshCw size={14} className="mr-2" />
          Refresh
        </Button>
      </div>

      {/* Section tabs */}
      {sections.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {sections.map(sec => (
            <button
              key={sec}
              onClick={() => setActiveSection(sec)}
              className={`shrink-0 px-4 py-2 rounded-xl text-sm font-semibold transition-all border
                ${activeSection === sec
                  ? 'bg-primary text-primary-foreground border-primary shadow'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
            >
              {sec}
            </button>
          ))}
        </div>
      )}

      {loading || sectionLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-primary opacity-50" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Active KOTs */}
          {activeSkots.length > 0 ? (
            <div>
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">
                Active ({activeSkots.length})
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {activeSkots.map(skot => (
                  <KotCard
                    key={skot.section_kot_id}
                    skot={skot}
                    onItemStatusChange={handleItemStatusChange}
                    busy={busy}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-40 text-gray-400">
              <CheckCircle2 size={40} className="mb-3 text-green-400" />
              <p className="font-semibold">No active KOTs in {activeSection}</p>
              <p className="text-sm">Kitchen is clear!</p>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
