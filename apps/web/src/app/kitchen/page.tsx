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
  pending:           { label: 'Pending',   color: 'text-gray-600',  bg: 'bg-gray-100'   },
  preparing:         { label: 'Preparing', color: 'text-blue-600',  bg: 'bg-blue-100'   },
  ready:             { label: 'Ready',     color: 'text-amber-700', bg: 'bg-amber-100'  },
  served:            { label: 'Served',    color: 'text-green-700', bg: 'bg-green-100'  },
  cancelled:         { label: 'Cancelled', color: 'text-red-700',   bg: 'bg-red-100'    },
  packed:            { label: 'Packed',    color: 'text-purple-700',bg: 'bg-purple-100' },
  delivered:         { label: 'Delivered', color: 'text-teal-700',  bg: 'bg-teal-100'   },
  recook_requested:  { label: 'Re-cook',   color: 'text-orange-700',bg: 'bg-orange-100' },
};

const VALID_ITEM_STATUSES = [
  'pending', 'preparing', 'ready', 'served', 'cancelled',
  'packed', 'delivered', 'recook_requested',
];

const KOT_STATUS_FLOW: Record<string, string[]> = {
  pending:      ['acknowledged', 'ready', 'served', 'completed'],
  acknowledged: ['ready', 'served', 'completed'],
  ready:        ['served', 'completed'],
  completed:    ['served'],
  served:       [],
};

// ─── KOT Card ─────────────────────────────────────────────────────────────────

function KotCard({
  skot,
  onStatusChange,
  onItemStatusChange,
  busy,
}: {
  skot: SectionKot;
  onStatusChange: (sectionKotId: string, status: string) => void;
  onItemStatusChange: (sectionKotId: string, itemId: string, status: string) => void;
  busy: string | null;
}) {
  const [expandItems, setExpandItems] = useState(true);
  const isBusy = busy === skot.section_kot_id;

  const nextStatuses = KOT_STATUS_FLOW[skot.status] ?? [];
  const elapsed = Math.floor(
    (Date.now() - new Date(skot.generated_at).getTime()) / 60000
  );

  return (
    <div
      className={`rounded-2xl border-2 p-5 flex flex-col gap-3 shadow-sm transition-all hover:shadow-md
        ${skot.status === 'ready' ? 'border-amber-300 bg-amber-50' :
          skot.status === 'served' || skot.status === 'completed' ? 'border-green-200 bg-green-50 opacity-75' :
          'border-gray-200 bg-white'}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-black text-gray-800">{skot.section_kot_number}</span>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
              {skot.section_name}
            </span>
          </div>
          <div className="text-sm text-gray-500 mt-0.5">
            Table <strong>{skot.table_number}</strong> · Phase {skot.order_phase}
          </div>
        </div>
        <div className="flex items-center gap-1 text-xs text-gray-400">
          <Clock size={12} />
          {elapsed}m ago
        </div>
      </div>

      {/* 🔴 Customer Already Paid banner (EC-1: paid while cooking) */}
      {skot.is_bill_paid && (
        <div className="flex items-center gap-2 rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-xs font-semibold text-green-800">
          <CreditCard size={12} />
          ✓ Customer Has Already Paid — Continue cooking and service as normal
        </div>
      )}

      {/* Items */}
      <div>
        <button
          className="text-xs font-semibold text-gray-500 hover:text-gray-800 flex items-center gap-1 mb-2"
          onClick={() => setExpandItems(p => !p)}
        >
          {expandItems ? '▾' : '▸'} {skot.items.length} item{skot.items.length !== 1 ? 's' : ''}
        </button>

        {expandItems && (
          <div className="space-y-2">
            {skot.items.map(item => {
              const cfg = ITEM_STATUS_CONFIG[item.status] ?? ITEM_STATUS_CONFIG.pending;
              const itemBusy = busy === `item-${item.section_kot_item_id}`;

              return (
                <div
                  key={item.section_kot_item_id}
                  className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 border px-3 py-2"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color} shrink-0`}>
                      {cfg.label}
                    </span>
                    <span className="text-sm font-medium text-gray-800 truncate">{item.item_name}</span>
                    <span className="text-xs text-gray-500 shrink-0">×{item.quantity}</span>
                  </div>
                  {/* Item-level status selector */}
                  <select
                    className="text-xs border rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                    value={item.status}
                    disabled={itemBusy || item.status === 'served' || item.status === 'cancelled' || item.status === 'delivered'}
                    onChange={e => onItemStatusChange(skot.section_kot_id, item.section_kot_item_id, e.target.value)}
                  >
                    {VALID_ITEM_STATUSES.map(s => (
                      <option key={s} value={s}>
                        {ITEM_STATUS_CONFIG[s]?.label ?? s}
                      </option>
                    ))}
                  </select>
                  {itemBusy && <Loader2 size={12} className="animate-spin text-gray-400 shrink-0" />}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* KOT-level actions */}
      {nextStatuses.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1 border-t border-gray-100">
          {nextStatuses.map(s => (
            <button
              key={s}
              disabled={isBusy}
              onClick={() => onStatusChange(skot.section_kot_id, s)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors
                ${s === 'served' || s === 'completed'
                  ? 'bg-green-600 text-white border-green-600 hover:bg-green-700'
                  : s === 'ready'
                  ? 'bg-amber-500 text-white border-amber-500 hover:bg-amber-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
            >
              {isBusy ? <Loader2 size={10} className="inline animate-spin mr-1" /> : null}
              Mark {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      )}

      {(skot.status === 'served' || skot.status === 'completed') && (
        <div className="flex items-center gap-1.5 text-xs text-green-700 font-semibold pt-1 border-t border-green-100">
          <CheckCircle2 size={13} />
          Completed
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

  const handleKotStatusChange = async (sectionKotId: string, status: string) => {
    setBusy(sectionKotId);
    try {
      await apiClient.post(`/kots/section-kots/${sectionKotId}/status`, { status });
      showToast(`KOT marked ${status}`);
      await fetchSkots(activeSection, true);
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'Status update failed', 'error');
    } finally {
      setBusy(null);
    }
  };

  const handleItemStatusChange = async (sectionKotId: string, itemId: string, status: string) => {
    setBusy(`item-${itemId}`);
    try {
      await apiClient.patch(
        `/kots/section-kots/${sectionKotId}/items/${itemId}/status`,
        { status }
      );
      showToast(`Item marked ${status}`);
      await fetchSkots(activeSection, true);
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'Item update failed', 'error');
    } finally {
      setBusy(null);
    }
  };

  const activeSkots = skots.filter(
    s => s.status !== 'served' && s.status !== 'completed'
  );
  const doneSkots   = skots.filter(
    s => s.status === 'served' || s.status === 'completed'
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
                    onStatusChange={handleKotStatusChange}
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

          {/* Completed KOTs */}
          {doneSkots.length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">
                Completed ({doneSkots.length})
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {doneSkots.map(skot => (
                  <KotCard
                    key={skot.section_kot_id}
                    skot={skot}
                    onStatusChange={handleKotStatusChange}
                    onItemStatusChange={handleItemStatusChange}
                    busy={busy}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
